require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sequelize = require('./config/database');
const compression = require('compression');

// --- 1. IMPORT HTTP & SOCKET.IO ---
const http = require('http');
const { Server } = require('socket.io');

const Student = require('./models/siswa');
const Parent = require('./models/orangTua');

// Definisikan hubungan di sini, di luar file model masing-masing
Parent.hasMany(Student, { foreignKey: 'parentId', as: 'children' });
Student.belongsTo(Parent, { foreignKey: 'parentId', as: 'parent' });

// Import limiter global saja (karena yang lain sudah di routes/index.js)
const { globalLimiter } = require('./middlewares/rateLimiter');

// Import semua routes dari satu file
const apiRoutes = require('./routes');  // → routes/index.js

const app = express();
const port = process.env.PORT || 5005;

// --- 2. BUAT HTTP SERVER ---
const server = http.createServer(app);

// --- 3. INISIALISASI SOCKET.IO ---
const io = new Server(server, {
  cors: {
    origin: '*', // Sesuaikan jika ingin lebih secure di production
    methods: ['GET', 'POST']
  }
});

// --- 4. SIMPAN IO KE APP AGAR BISA DIAKSES DI CONTROLLER ---
app.set('socketio', io);

// --- 5. LOGIKA SOCKET CONNECTION ---
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('join-school', (schoolId) => {
    socket.join(`school-${schoolId}`);
  });

  // Web Perpus join room berdasarkan UUID sessionId
  socket.on('join-login-room', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client joined room: ${sessionId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

app.set('trust proxy', 1);

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
app.use(compression({
  // balance speed vs compression ratio
  level: 6,              
  // > 1KB (hindari overhead kecil)
  threshold: 1024,       
  filter: (req, res) => {
    // Compress hanya kalau client support (default sudah bagus)
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res); // default: text, json, dll
  }
}));

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
  console.error('[ERROR]');
  
  if (err.status === 429) {
    return res.status(429).json(err);
  }

  res.status(500).json({
    success: false,
    message: 'Server error',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Internal error'
  });
});

// --- 6. DATABASE CONNECTION & START SERVER (GANTI app.listen MENJADI server.listen) ---
sequelize.authenticate()
  .then(() => {
    console.log('MySQL connected!');
    return sequelize.sync({ alter: false, force: false });
  })
  .then(() => {
    console.log('Tables synced');
    // PENTING: Gunakan server.listen, bukan app.listen
    server.listen(port, '0.0.0.0', () => {
      console.log(`Server with Socket.io running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('DB connection failed:', err);
    process.exit(1);
});