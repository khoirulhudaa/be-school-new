const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Student = sequelize.define('Student', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  schoolId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  parentId: { 
    type: DataTypes.INTEGER, 
    allowNull: true,
    references: { model: 'orangTua', key: 'id' }
  },
  nis: { type: DataTypes.STRING, allowNull: false },
  nisn: { type: DataTypes.STRING, allowNull: true },
  nik: { type: DataTypes.STRING, allowNull: true },
  gender: { type: DataTypes.STRING(20), allowNull: true },
  birthPlace: { type: DataTypes.STRING, allowNull: true },
  birthDate: { type: DataTypes.DATEONLY, allowNull: true },
  class: { type: DataTypes.STRING, allowNull: false },
  batch: { type: DataTypes.STRING, allowNull: false },
  photoUrl: { type: DataTypes.STRING },
  qrCodeData: { type: DataTypes.STRING, unique: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  isGraduated: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  graduationNote: { 
    type: DataTypes.TEXT, 
    allowNull: true 
  },
  examNumber: { // Nomor Peserta Ujian jika diperlukan
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'siswa',
  indexes: [
    {
      name: 'idx_student_school_batch',
      fields: ['schoolId', 'batch'] 
    },
    {
      unique: true,
      fields: ['nisn'],
      name: 'unique_nisn_global' 
    },
    {
      unique: true,
      fields: ['schoolId', 'nis'],
      name: 'unique_nis_per_school'
    }
  ]
}); 


module.exports = Student;