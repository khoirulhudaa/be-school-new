require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    logging: false, 
    pool: {
      max: 20,           // Maksimal koneksi yang dibuka (sesuaikan dengan spek RAM VPS)
      min: 5,            // Minimal koneksi yang tetap terjaga
      acquire: 60000,    // Waktu maksimal (ms) mencoba koneksi sebelum error timeout
      idle: 10000        // Waktu maksimal (ms) koneksi idle sebelum dilepas
    },
    dialectOptions: {
      connectTimeout: 60000 // Timeout koneksi di level driver MySQL
    }
  }
);

module.exports = sequelize;