const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redisClient = require('../../config/redisConfig'); 

const profileLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Menit
    limit: 10, // Maksimal 10 kali update per 15 menit
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
        prefix: 'rl:profile:',
    }),
    keyGenerator: (req) => {
        /**
         * Karena menggunakan protectMultiRole, req.user sudah terisi.
         * Kita gunakan ID dan Role agar kunci benar-benar unik.
         */
        const userId = req.user?.id;
        const role = req.user?.role;
        
        if (userId) return `auth:${role}:${userId}`;
        console.log(`[PROFILELIMITER]: ${userId}`)
        
        // Fallback (meskipun jarang terjadi karena ada protectMultiRole)
        const ip = req.ip || 'unknown-ip';
        const ua = req.headers['user-agent'] || 'no-ua';
        console.log(`[PROFILELIMITER]: pub:${ip}:${ua}`)
        return `pub:${ip}:${ua}`;
    },
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Anda terlalu sering mengubah profil. Silakan coba lagi dalam 15 menit.'
        });
    }
});

module.exports = profileLimiter;