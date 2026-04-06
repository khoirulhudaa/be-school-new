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
      max: 10,            
      min: 2,           
      acquire: 30000,     
      idle: 10000,        
      evict: 1000,
    },
    dialectOptions: {
      connectTimeout: 60000,
      // Membantu performa pada query besar
      decimalNumbers: true 
    },
  }
);

module.exports = sequelize;