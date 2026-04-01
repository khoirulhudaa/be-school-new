require('dotenv').config();
const { Sequelize, Transaction } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    logging: false, 
    pool: {
      max: 50,            // Dinaikkan untuk menangani lonjakan absen
      min: 10,           // Standby koneksi lebih banyak
      acquire: 10000,     // 1 menit cukup untuk timeout
      idle: 10000,        // Tutup koneksi idle lebih cepat (10 detik)
      evict: 1000,
    },
    // dialectOptions: {
    //   connectTimeout: 60000 
    // },
    dialectOptions: {
      connectTimeout: 60000,
      // Membantu performa pada query besar
      decimalNumbers: true 
    },
  }
);

module.exports = sequelize;