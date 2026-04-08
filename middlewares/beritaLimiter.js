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
    store: makeRedisStore('rl:berita:'),
    keyGenerator: (req) => {
        const userId = req.user?.id || req.user?.profile?.id;
        
        if (userId) {
        return `auth:${userId}`;
        }
        console.log(`[LIMITER-BERITA]: userId:${userId}`);

        // Ambil IP dari header jika di belakang proxy (Nginx), atau req.ip
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-ip';
        const ua = req.headers['user-agent'] || 'no-ua';
        
        // Gunakan satu log saja agar tidak memenuhi layar
        console.log(`[LIMITER-BERITA]: pub:${ip}`);
        
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