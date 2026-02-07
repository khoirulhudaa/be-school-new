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
      max: 20,           
      min: 5,            
      acquire: 60000,    
      idle: 10000        
    },
    dialectOptions: {
      connectTimeout: 60000 
    }
  }
);

module.exports = sequelize;