// middleware/rateLimiter.js
const {rateLimit, ipKeyGenerator} = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

const redisClient = require('../config/redis');

const makeRedisStore = (prefix) => new RedisStore({
  prefix,
  sendCommand: (command, ...args) => redisClient.call(command, ...args),
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  limit: 2000,              
  store: makeRedisStore('rl:global:'),
  // skip: (req) => {
  //   const ip = req.ip || req.connection.remoteAddress;
  //   return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  // },
  keyGenerator: (req) => {
    const profile = req.user?.profile || req.user;
    const id = profile?.id || ipKeyGenerator(req);

    console.log(`[RateLimit] Incoming request from: ${id}`); 

    return profile?.id ? `auth:${profile.id}` : id;
  },
  standardHeaders: true, 
  legacyHeaders: false,
  validate: { ip: false, xForwardedForHeader: false }, // ← TAMBAH INI

  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Server sibuk, terlalu banyak permintaan dari perangkat Anda. Coba lagi dalam beberapa saat.'
    });
  }
});

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 10,
  store: makeRedisStore('rl:login:'),
  keyGenerator: (req) => {
    const email = req.body?.email || 'no-email';
    
    // Pastikan kita mengambil string-nya, bukan object-nya
    let ip = ipKeyGenerator(req);
    
    // Jika ipKeyGenerator mengembalikan object (misal dari library request-ip atau sejenisnya)
    // Kita coba ambil property clientIp atau semacamnya, atau paksa ke string
    if (typeof ip === 'object') {
      ip = ip.clientIp || req.ip || req.headers['x-forwarded-for'] || 'unknown-ip';
    }

    const key = `${ip}:${email}`;

    console.log(`[loginLimiter] email=${email} | ip=${ip} | key=${key}`);
    
    return key;
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, xForwardedForHeader: false },
  handler: (req, res) => {
    const email = req.body?.email;
    const ip    = ipKeyGenerator(req);
    console.log(`[loginLimiter] ⛔ BLOCKED email=${email} | ip=${ip}`);
    res.status(429).json({
      success: false,
      message: 'Terlalu banyak percobaan login, coba lagi dalam 1 menit.'
    });
  }
});

// 2. Stricter limiter untuk route sensitif (misal login, create berita, upload)
const strictLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 menit
  limit: 10,          
  store: makeRedisStore('rl:strict:'),
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
  limit: 50,      
  store: makeRedisStore('rl:upload:'),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { ip: false, xForwardedForHeader: false }, // ← TAMBAH INI
  message: { success: false, message: 'Batas upload harian tercapai (50/50).' },
  statusCode: 429,
});

// Export supaya bisa dipakai per route atau global
module.exports = {
  globalLimiter,
  loginLimiter,
  strictLimiter,
  uploadLimiter,
};