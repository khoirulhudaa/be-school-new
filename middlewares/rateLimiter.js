// middleware/rateLimiter.js
const {rateLimit, ipKeyGenerator} = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  limit: 2000,              // Max 2000 request per IP dalam 15 menit
  
  // Skip untuk Localhost (Penting agar Load Test tidak terhenti)
  // skip: (req) => {
  //   const ip = req.ip || req.connection.remoteAddress;
  //   return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  // },
  keyGenerator: (req) => {
    // Ambil ID dari profile (hasil middleware auth)
    const profile = req.user?.profile || req.user;
    return profile?.id ? `auth:${profile.id}` : ipKeyGenerator(req);
  },
  // Menggunakan header standard modern
  standardHeaders: true, 
  legacyHeaders: false,
  validate: { ip: false, xForwardedForHeader: false }, // ← TAMBAH INI


  // Pesan Error
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Server sibuk, terlalu banyak permintaan dari perangkat Anda. Coba lagi dalam beberapa saat.'
    });
  }
});

// 2. Stricter limiter untuk route sensitif (misal login, create berita, upload)
const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  limit: 10,               // Max 10 kali coba per menit
  keyGenerator: (req) => {
    const profile = req.user?.profile || req.user;
    return profile?.id ? `auth:${profile.id}` : ipKeyGenerator(req);
  },
  standardHeaders: true,  // ← tambah ini juga
  legacyHeaders: false,
  validate: { ip: false, xForwardedForHeader: false }, // ← TAMBAH INI
  message: { success: false, message: 'Terlalu banyak percobaan login, tunggu 1 menit.' },
  statusCode: 429,
});

// 3. Limiter khusus untuk route berat (misal upload gambar/fasilitas)
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,        // 1 jam
  limit: 50,                       // max 50 upload per jam per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, xForwardedForHeader: false }, // ← TAMBAH INI
  message: { success: false, message: 'Batas upload harian tercapai (50/50).' },
  statusCode: 429,
});

// Export supaya bisa dipakai per route atau global
module.exports = {
  globalLimiter,
  strictLimiter,
  uploadLimiter,
};