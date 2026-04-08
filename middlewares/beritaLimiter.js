const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');

const beritaLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 1 Menit
    limit: 100, 
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:berita:',
    }),
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