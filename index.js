require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sequelize = require('./config/database');
const albumRoutes = require('./routes/albumRoutes');
const alumniRoutes = require('./routes/alumniRoutes.js');
const galleryRoutes = require('./routes/galleryRoutes');
const app = express();
const port = process.env.PORT || 5005;

app.use(cors({
  origin: '*', // izinkan SEMUA origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true // tetap izinkan kalau frontend butuh cookie/auth
}));

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Folder uploads dibuat otomatis');
}
app.use('/uploads', express.static(uploadDir));

// Routes
app.use('/albums', albumRoutes);
app.use('/gallery', galleryRoutes);
app.use('/alumni', alumniRoutes);

// Testing
app.get('/testing', (req, res) => {
  res.json({
    success: true,
    message: 'API OK! CORS aktif.',
    incomingOrigin: req.headers.origin || 'tidak ada',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR]:', err.message, err.stack?.substring(0, 300));
  res.status(500).json({
    success: false,
    message: 'Server error',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Internal error'
  });
});

// DB & Start
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
  
app.listen(port, '0.0.0.0', () => {
 console.log(`Server running on port ${port}`);
});