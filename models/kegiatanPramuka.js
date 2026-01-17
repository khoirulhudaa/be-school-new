const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KegiatanPramuka = sequelize.define('KegiatanPramuka', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Judul kegiatan (contoh: Kemah Sabtu-Minggu, Latihan Mingguan, dll)',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,       // format YYYY-MM-DD
    allowNull: false,
  },
  location: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  category: {
    type: DataTypes.ENUM(
      'Kegiatan Rutin',
      'Kegiatan Khusus',
      'Lomba/Kompetisi',
      'Bakti Sosial',
      'Pelatihan',
      'Perkemahan',
      'Lainnya'
    ),
    defaultValue: 'Kegiatan Rutin',
  },
  imageUrl: {
    type: DataTypes.STRING(255),
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
  tableName: 'kegiatanPramuka',
});

module.exports = KegiatanPramuka;