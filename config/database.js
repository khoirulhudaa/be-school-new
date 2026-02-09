require('dotenv').config();
const { Sequelize, Transaction } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    timezone: '+07:00',
    isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
    logging: false, 
    pool: {
      max: 10,           
      min: 5,            
      acquire: 60000,    
      idle: 10000        
    },
    dialectOptions: {
      connectTimeout: 60000,
      dateStrings: true,
      typeCast: true
    }
  }
);

module.exports = sequelize;