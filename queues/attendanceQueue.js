const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: null
});

const attendanceQueue = new Queue('attendance-queue', {
  connection
});

module.exports = attendanceQueue;