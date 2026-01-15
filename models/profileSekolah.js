// models/schoolProfile.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SchoolProfile = sequelize.define('SchoolProfile', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
  },
  heroTitle: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  linkYoutube: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  heroSubTitle: {
    type: DataTypes.STRING,
    allowNull: true, 
  },
  headmasterWelcome: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  headmasterName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  schoolName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  // Tambahan baru: Foto Kepala Sekolah
  photoHeadmasterUrl: {
    type: DataTypes.STRING(500), // Cloudinary URL bisa panjang
    allowNull: true,
  },
  studentCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  teacherCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  roomCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  achievementCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = SchoolProfile;