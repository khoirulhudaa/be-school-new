// app.js (atau index.js)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sequelize = require('./config/database');

// Import limiter global saja (karena yang lain sudah di routes/index.js)
const { globalLimiter } = require('./middlewares/rateLimiter');

// Import semua routes dari satu file
const apiRoutes = require('./routes');  // → routes/index.js

const app = express();
const port = process.env.PORT || 5005;

if (process.env.NODE_ENV !== 'production') {
  app.set('json spaces', 2);
}

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global limiter untuk SEMUA request (tetap di app level)
app.use(globalLimiter);

// Static folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Folder uploads dibuat otomatis');
}
app.use('/uploads', express.static(uploadDir));

// ── Hanya 1 baris ini untuk semua routes + limiter mereka ───────
app.use('/', apiRoutes);          

// Global error handler
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]:', err.message, err.stack?.substring(0, 300));
  
  if (err.status === 429) {
    return res.status(429).json(err);
  }

  res.status(500).json({
    success: false,
    message: 'Server error',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Internal error'
  });
});

// Database connection & start server
sequelize.authenticate()
  .then(() => {
    console.log('MySQL connected!');
    return sequelize.sync({ alter: true });
  })
  .then(() => {
    console.log('Tables synced');
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('DB connection failed:', err);
    process.exit(1);
});