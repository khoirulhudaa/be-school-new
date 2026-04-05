require('dotenv').config();

const { Worker } = require('bullmq');
const Redis = require('ioredis');
const Attendance = require('../models/kehadiran');

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const worker = new Worker(
  'attendance-queue',
  async job => {
    const data = job.data;

    await Attendance.create({
      studentId: data.studentId,
      guruId: data.guruId,
      userRole: data.userRole,
      schoolId: data.schoolId,
      currentClass: data.currentClass,
      status: 'Hadir',
      latitude: data.latitude,
      longitude: data.longitude
    });
  },
  {
    connection,
    concurrency: 50
  }
);

worker.on('completed', job => {
  console.log(`Job ${job.id} done`);
});

worker.on('failed', (job, err) => {
  console.error(`Job failed:`, err);
});