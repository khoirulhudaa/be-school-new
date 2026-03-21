const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379', // support Upstash, Redis Cloud, Railway, dll
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 2000), // retry otomatis
  },
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis connected'));

// Connect sekali di awal aplikasi
(async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
})();

module.exports = redisClient;