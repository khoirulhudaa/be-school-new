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
      max: 30,          // naikkan kalau traffic lumayan
      min: 5,
      acquire: 120000,  // 2 menit
      idle: 30000,      // tutup koneksi idle setelah 30 detik
      evict: 1000,      // cek koneksi mati setiap 1 detik  
    },
    dialectOptions: {
      connectTimeout: 60000 
    },
    // hooks: {
    //   beforeConnect: (config) => {
    //     config.dialectOptions = {
    //       ...config.dialectOptions,
    //       wait_timeout: 3600,
    //       interactive_timeout: 3600,
    //     };
    //   },
    // }
  }
);

module.exports = sequelize;