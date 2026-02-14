const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Parent = sequelize.define('Parent', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  schoolId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  gender: { type: DataTypes.STRING, allowNull: false },
  relationStatus: { type: DataTypes.STRING, allowNull: false },
  type: { type: DataTypes.STRING, defaultValue: 'Kandung' },
  phoneNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'orangTua'
});


module.exports = Parent;