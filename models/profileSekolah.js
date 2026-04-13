// models/profileSekolah.js  (atau nama file model Anda)
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
  schoolName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  headmasterName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  headmasterWelcome: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  heroTitle: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  heroSubTitle: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  heroImageUrl: {                   // ← FIELD BARU
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  logoUrl: {                   // ← FIELD BARU
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  linkYoutube: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  photoHeadmasterUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  address: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  phoneNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: { isEmail: true },
  },
  studentCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  teacherCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  roomCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  achievementCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  kepalaSekolahPhone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Format: 628xxxxxxxxxx (tanpa + atau 0)'
  },
  kepalaSekolahEmail: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: { isEmail: true }
  },
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
});

module.exports = SchoolProfile;