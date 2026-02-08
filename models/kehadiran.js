// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');

// const Attendance = sequelize.define('Attendance', {
//   id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
//   studentId: { type: DataTypes.INTEGER, allowNull: false },
//   userRole: { type: DataTypes.ENUM('student', 'teacher'), defaultValue: 'student' }, 
//   schoolId: { type: DataTypes.INTEGER, allowNull: false }, 
//   status: { type: DataTypes.STRING, defaultValue: 'Hadir' },
//   currentClass: { type: DataTypes.STRING },
//   updatedAt: {
//     type: DataTypes.DATE,
//     allowNull: true 
//   } 
// }, {
//   tableName: 'kehadiran',
//   updatedAt: true,
//   timestamps: true,
//   indexes: [
//     // 1. Indeks untuk filter Dashboard (sangat penting untuk hari ini)
//     { 
//       name: 'idx_school_attendance_date', 
//       fields: ['schoolId', 'createdAt'] 
//     },
//     // 2. Indeks untuk pengecekan duplikasi (Upsert logic)
//     { 
//       name: 'idx_student_today', 
//       fields: ['studentId', 'createdAt'] 
//     },
//     // 3. Indeks untuk filter per kelas (Laporan)
//     { 
//       name: 'idx_attendance_class', 
//       fields: ['currentClass'] 
//     }
//   ]
// });

// module.exports = Attendance;

// // Relasi: Gunakan penamaan yang konsisten
// const Student = require('./siswa');
// Attendance.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });



// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');
// const Student = require('./siswa');
// const GuruTendik = require('./guruTendik');

// const Attendance = sequelize.define('Attendance', {
//   id: {
//     type: DataTypes.BIGINT, // Menggunakan BIGINT untuk antisipasi jutaan baris data
//     autoIncrement: true,
//     primaryKey: true,
//   },
//   schoolId: {
//     type: DataTypes.INTEGER,
//     allowNull: false,
//   },
//   // Relasi ke Siswa (Nullable jika yang absen adalah Guru)
//   studentId: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//     references: {
//       model: 'siswa',
//       key: 'id',
//     },
//   },
//   // Relasi ke Guru (Nullable jika yang absen adalah Siswa)
//   guruId: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//     references: {
//       model: 'guruTendik',
//       key: 'id',
//     },
//   },
//   userRole: {
//     type: DataTypes.ENUM('student', 'teacher'),
//     allowNull: false,
//     defaultValue: 'student',
//   },
//   status: {
//     type: DataTypes.STRING(20), // 'Hadir', 'Sakit', 'Izin', 'Alpha'
//     allowNull: false,
//     defaultValue: 'Hadir',
//   },
//   currentClass: {
//     type: DataTypes.STRING(50),
//     allowNull: true, // Untuk guru bisa dikosongkan atau diisi 'STAFF'
//   },
//   latitude: {
//     type: DataTypes.DECIMAL(10, 8),
//     allowNull: true, // Opsional jika butuh fitur GPS
//   },
//   longitude: {
//     type: DataTypes.DECIMAL(11, 8),
//     allowNull: true, // Opsional jika butuh fitur GPS
//   },
//   updatedAt: {
//     type: DataTypes.DATE,
//     allowNull: true,
//   }
// }, {
//   tableName: 'kehadiran',
//   timestamps: true,
//   indexes: [
//     // 1. FILTER UTAMA: Untuk dashboard harian per sekolah & per role
//     {
//       name: 'idx_school_role_date',
//       fields: ['schoolId', 'userRole', 'createdAt']
//     },
//     // 2. FILTER LAPORAN PER KELAS: Untuk filter halaman laporan siswa
//     {
//       name: 'idx_school_class_date',
//       fields: ['schoolId', 'currentClass', 'createdAt']
//     },
//     // 3. PENCEGAHAN DUPLIKASI (Siswa): Cepat cek apakah siswa sudah absen hari ini
//     {
//       name: 'idx_unique_student_daily',
//       fields: ['studentId', 'createdAt']
//     },
//     // 4. PENCEGAHAN DUPLIKASI (Guru): Cepat cek apakah guru sudah absen hari ini
//     {
//       name: 'idx_unique_guru_daily',
//       fields: ['guruId', 'createdAt']
//     }
//   ]
// });

// // --- DEFINISI RELASI ---
// // Relasi ke Student
// Attendance.belongsTo(Student, { 
//   foreignKey: 'studentId', 
//   as: 'student' 
// });
// Student.hasMany(Attendance, { 
//   foreignKey: 'studentId', 
//   as: 'attendances' 
// });

// // Relasi ke GuruTendik
// Attendance.belongsTo(GuruTendik, { 
//   foreignKey: 'guruId', 
//   as: 'guru' 
// });
// GuruTendik.hasMany(Attendance, { 
//   foreignKey: 'guruId', 
//   as: 'attendances' 
// });

// module.exports = Attendance;


const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Student = require('./siswa');
const GuruTendik = require('./guruTendik');

const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  schoolId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'siswa', key: 'id' },
  },
  guruId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'guruTendik', key: 'id' },
  },
  userRole: {
    type: DataTypes.ENUM('student', 'teacher'),
    allowNull: false,
    defaultValue: 'student',
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'Hadir',
  },
  currentClass: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  updatedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'kehadiran',
  timestamps: true,
  indexes: [
    { name: 'idx_school_role_date', fields: ['schoolId', 'userRole', 'createdAt'] },
    { name: 'idx_school_class_date', fields: ['schoolId', 'currentClass', 'createdAt'] },
    { name: 'idx_unique_student_daily', fields: ['studentId', 'createdAt'] },
    { name: 'idx_unique_guru_daily', fields: ['guruId', 'createdAt'] }
  ]
});

// --- DEFINISI RELASI UNIK ---

// Relasi Siswa
Attendance.belongsTo(Student, { 
  foreignKey: {
    name: 'studentId',
    allowNull: true // Memastikan kolom boleh NULL di level database
  }, 
  onDelete: 'SET NULL', 
  onUpdate: 'CASCADE', as: 'student' 
});
Student.hasMany(Attendance, { foreignKey: 'studentId', as: 'studentAttendances' }); // Alias Unik

// Relasi Guru
Attendance.belongsTo(GuruTendik, { 
  foreignKey: {
    name: 'guruId',
    allowNull: true // Memastikan kolom boleh NULL di level database
  }, 
  onDelete: 'SET NULL', 
  onUpdate: 'CASCADE', as: 'guru' 
});
GuruTendik.hasMany(Attendance, { foreignKey: 'guruId', as: 'guruAttendances' }); // Alias Unik

module.exports = Attendance;