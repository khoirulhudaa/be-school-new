// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');

// const Attendance = sequelize.define('Attendance', {
//   id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
//   studentId: { type: DataTypes.INTEGER, allowNull: false },
//   status: { type: DataTypes.STRING, defaultValue: 'Hadir' },
//   currentClass: { type: DataTypes.STRING } 
// }, {
//   tableName: 'kehadiran',
//   updatedAt: false
// });

// module.exports = Attendance;

// // PANGGIL RELASI DI SINI (Setelah Export)
// const Student = require('./siswa');
// Attendance.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });


const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Attendance = sequelize.define('Attendance', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  studentId: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'Hadir' },
  currentClass: { type: DataTypes.STRING } 
}, {
  tableName: 'kehadiran',
  updatedAt: false,
  timestamps: true,
  indexes: [
    {
      name: 'idx_attendance_created_at',
      fields: ['createdAt']
    },
    {
      name: 'idx_attendance_class',
      fields: ['currentClass']
    }
  ]
});

module.exports = Attendance;

// Relasi: Gunakan penamaan yang konsisten
const Student = require('./siswa');
Attendance.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });