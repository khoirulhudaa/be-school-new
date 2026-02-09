// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');

// const Student = sequelize.define('Student', {
//   id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
//   schoolId: { type: DataTypes.INTEGER, allowNull: false },
//   name: { type: DataTypes.STRING, allowNull: false },
//   nis: { type: DataTypes.STRING, allowNull: false },
//   class: { type: DataTypes.STRING, allowNull: false },
//   batch: { type: DataTypes.STRING, allowNull: false },
//   photoUrl: { type: DataTypes.STRING },
//   qrCodeData: { type: DataTypes.STRING, unique: true },
//   isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
// }, {
//   tableName: 'siswa',
//   indexes: [
//     {
//       name: 'idx_student_school_batch',
//       fields: ['schoolId', 'batch'] 
//     }
//   ]
// });

// module.exports = Student;

// // PANGGIL RELASI DI SINI (Setelah Export)
// const Attendance = require('./kehadiran');
// Student.hasMany(Attendance, { foreignKey: 'studentId', as: 'attendances' });


const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Student = sequelize.define('Student', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  schoolId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  nis: { type: DataTypes.STRING, allowNull: false },
  nisn: { type: DataTypes.STRING, allowNull: true },
  class: { type: DataTypes.STRING, allowNull: false },
  batch: { type: DataTypes.STRING, allowNull: false },
  photoUrl: { type: DataTypes.STRING },
  qrCodeData: { type: DataTypes.STRING, unique: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'siswa',
  indexes: [
    {
      name: 'idx_student_school_batch',
      fields: ['schoolId', 'batch'] 
    }
  ]
});

module.exports = Student;