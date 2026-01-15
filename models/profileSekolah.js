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
  linkYoutube: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  photoHeadmasterUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  // === FIELD BARU ===
  address: {
    type: DataTypes.STRING(500),   // alamat lengkap sekolah
    allowNull: true,               // boleh kosong, tapi sebaiknya diisi
  },
  phoneNumber: {
    type: DataTypes.STRING(50),    // nomor telepon / WA (string agar support +62, ext, dll)
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      isEmail: true,               // validasi format email (opsional, bisa dihapus jika tidak mau strict)
    },
  },
  // field yang sudah ada
  studentCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  teacherCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  roomCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  achievementCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  latitude: { type: DataTypes.FLOAT, allowNull: true },
  longitude: { type: DataTypes.FLOAT, allowNull: true },
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