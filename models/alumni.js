const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Alumni = sequelize.define('Alumni', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  nis: {
    type: DataTypes.STRING(20),
    allowNull: false, // Wajib diisi
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  graduationYear: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  photoUrl: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isVerified: { // Tambahkan ini
    type: DataTypes.BOOLEAN,
    defaultValue: false, // Default false agar tidak langsung muncul
  },
  batch: { // Tambahkan ini
    type: DataTypes.STRING,
    allowNull: true, // Atau false jika wajib
  },
}, {
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  // --- KONFIGURASI INDEXING ---
  indexes: [
    {
      name: 'idx_school_verified_active',
      // Composite index untuk filter utama yang sering digunakan bersamaan
      fields: ['schoolId', 'isVerified', 'isActive']
    },
    {
      name: 'idx_graduation_year',
      // Index untuk sorting berdasarkan tahun lulus atau filtering angkatan
      fields: ['graduationYear']
    },
    {
      name: 'idx_created_at',
      // Index untuk performa sorting 'DESC' pada tampilan daftar terbaru
      fields: ['createdAt']
    },
    {
      name: 'idx_school_nis_unique',
      unique: true,
      fields: ['schoolId', 'nis'] // Kombinasi school + nis harus unik
    },
    { name: 'idx_batch', fields: ['batch'] },
  ]
});

module.exports = Alumni;