const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GuruTendik = sequelize.define('GuruTendik', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  schoolId: { type: DataTypes.INTEGER, allowNull: false },
  nama: { type: DataTypes.STRING, allowNull: false },
  mapel: { type: DataTypes.STRING, allowNull: true },
  qrCodeData: { type: DataTypes.STRING, unique: true, allowNull: true },
  email: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    validate: { isEmail: true } 
  },
  nip: {
    type: DataTypes.STRING(18),
    allowNull: true,          // boleh kosong untuk tendik non-PNS
    unique: true,
  },
  role: { type: DataTypes.STRING, allowNull: false },
  jurusan: { type: DataTypes.STRING, allowNull: true },
  jenisKelamin: { type: DataTypes.STRING(10), allowNull: false },
  photoUrl: { type: DataTypes.STRING(255), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  timestamps: true,
  tableName: 'guruTendik'
});

module.exports = GuruTendik;