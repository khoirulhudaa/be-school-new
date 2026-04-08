const rateLimit = require('express-rate-limit');
const {RedisStore} = require('rate-limit-redis');
const redisClient = require('../config/redis');

const makeRedisStore = (prefix) => new RedisStore({
  prefix,
  sendCommand: (command, ...args) => redisClient.call(command, ...args),
});

const beritaLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 1 Menit
    limit: 100, 
    // PERBAIKAN 2: Tambahkan validate ini untuk menghilangkan error IPv6
    validate: { xForwardedForHeader: false, ip: false },
    store: makeRedisStore('rl:berita:'),
    keyGenerator: (req) => {
        const userId = req.user?.id || req.user?.profile?.id;
        if (userId) return `auth:${userId}`;
        
        const ip = req.ip || 'unknown-ip';
        const ua = req.headers['user-agent'] || 'no-ua';
        return `pub:${ip}:${ua}`;
    },
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Tunggu sebentar sebelum memuat berita lagi.'
        });
    }
});

module.exports = beritaLimiter;