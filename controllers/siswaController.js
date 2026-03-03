const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { fn, col, Op, literal } = require('sequelize');
const moment = require('moment');
const ExcelJS = require('exceljs');
const GuruTendik = require('../models/guruTendik');
const sequelize = require('../config/database');
const jwt = require('jsonwebtoken');
const SchoolProfile = require('../models/profileSekolah');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper: Optimasi Gambar Jangka Panjang
const processPhotoUpload = (buffer, schoolId, nis) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `sekolah_${schoolId}/siswa`,
        public_id: `photo_${nis}`,
        overwrite: true,
        // AI-Powered Optimization
        transformation: [
          { width: 400, height: 400, crop: 'thumb', gravity: 'face' }, // Fokus wajah
          { quality: 'auto', fetch_format: 'auto' } // Kompresi WebP otomatis
        ]
      },
      (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// Server User - studentController.js

exports.validateUserByQR = async (req, res) => {
  try {
    const { qrCodeData, schoolId } = req.query;

    if (!qrCodeData || !schoolId) {
      return res.status(400).json({ success: false, message: "QR Data dan SchoolId diperlukan." });
    }

    // 1. Cari di tabel Student
    let user = await Student.findOne({ 
      where: { qrCodeData, schoolId: parseInt(schoolId), isActive: true },
      attributes: ['id', 'name', 'class', 'schoolId', 'nis', 'nisn', 'gender'] // Ambil yang perlu saja
    });
    let role = 'student';

    // 2. Jika tidak ada di Student, cari di GuruTendik
    if (!user) {
      user = await GuruTendik.findOne({ 
        where: { qrCodeData, schoolId: parseInt(schoolId), isActive: true },
        attributes: ['id', ['nama', 'name'], 'role', 'schoolId', 'nip', 'jenisKelamin', 'jurusan', 'email'] // Aliasing 'nama' jadi 'name' agar seragam
      });
      role = 'teacher';
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "Kartu tidak dikenali atau tidak aktif." });
    }

    // Kirim data user ke Server Perpus
    res.json({ 
      success: true, 
      user, 
      role 
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.checkStudentAuth = async (req, res) => {
  try {
    const { nis } = req.body;
    const student = await Student.findOne({ 
      where: { nis, isActive: true } 
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Data siswa tidak ditemukan' });
    }

    const school = await SchoolProfile.findOne({
      where: { schoolId: student.schoolId }
    });
    
    // Mengubah instance database menjadi objek plain JSON
    const profile = student.toJSON();

    // Pastikan role siswa ada di dalam profile jika tidak ada di DB
    profile.role = 'siswa';

    // Bersihkan data yang tidak diperlukan dalam token
    delete profile.createdAt;
    delete profile.updatedAt;

    // Tambahkan info lokasi sekolah untuk Geofencing di HP
    profile.schoolLocation = {
      lat: school ? school.latitude : null,
      lng: school ? school.longitude : null,
      radiusMeter: 100 // Jarak toleransi absen dalam meter
    };

    // Generate Token JWT dengan Profile Lengkap
    const token = jwt.sign(
      { profile }, // Payload berisi seluruh profil
      process.env.JWT_SECRET || 'secret_key_anda',
      { expiresIn: '1d' }
    );

    res.json({ 
      success: true, 
      token, 
      data: profile 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- CRUD SISWA ---
exports.createStudent = async (req, res) => {
  try {
    const { name, nis, nisn, gender, birthPlace, birthDate, nik, schoolId, class: className, batch } = req.body;
    if (!name || !nis || !schoolId) {
      return res.status(400).json({ success: false, message: 'Name, NIS, dan SchoolId wajib diisi' });
    }

    // Di dalam try block sebelum Student.create
    const existing = await Student.findOne({ where: { nis, schoolId } });
    if (existing) {
    // Lewati atau berikan peringatan agar tidak duplikat
        return res.status(400).json({ success: false, message: `NIS ${nis} sudah terdaftar` });
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = await processPhotoUpload(req.file.buffer, schoolId, nis);
    }

    const newStudent = await Student.create({
      name, nis, nisn, gender, birthPlace, birthDate, nik, schoolId: parseInt(schoolId),
      photoUrl,
      class: className, 
      batch,
      qrCodeData: `QR-${nis}-${Date.now()}` // Unique identifier untuk QR
    });

    res.json({ success: true, data: newStudent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudentSearch = async (req, res) => {
  try {
    const { schoolId, name } = req.query;
    console.log("Searching for:", name, "in schoolId:", schoolId); // Log ini sangat penting

    let condition = { 
      schoolId: parseInt(schoolId),
      // isActive: true // SEMENTARA MATIKAN INI untuk cek apakah data muncul
    };
    
    if (name) {
      // Gunakan [Op.like] untuk MySQL atau [Op.iLike] untuk PostgreSQL
      condition.name = { [Op.like]: `%${name}%` };
    }

    const students = await Student.findAll({
      where: condition,
      attributes: ['id', 'name', 'class', 'photoUrl'],
      limit: 10
    });

    res.json({ success: true, data: students });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllStudents = async (req, res) => {
  try {
    const { schoolId, page = 1, limit = 10, class: studentClass, batch, name } = req.query;
    
    if (!schoolId || isNaN(parseInt(schoolId))) {
      return res.status(400).json({ success: false, message: "schoolId diperlukan." });
    }

    // 1. Perbaiki Object Condition (Agar filter name, class, batch bekerja)
    let condition = { 
      schoolId: parseInt(schoolId), 
      isActive: true 
    };
    
    if (name) condition.name = { [Op.like]: `%${name}%` };
    if (studentClass) condition.class = studentClass;
    if (batch) condition.batch = batch;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Student.findAndCountAll({
      where: condition, // Gunakan variabel condition yang sudah dibangun
      limit: parseInt(limit),
      offset: offset,
      order: [['name', 'ASC']],
      include: [{
        model: Attendance,
        as: 'studentAttendances',
        where: {
          createdAt: {
            [Op.between]: [moment().startOf('day').toDate(), moment().endOf('day').toDate()]
          }
        },
        required: false // Agar siswa tetap muncul meski belum absen
      }]
    });

    // 2. Mapping Status Kehadiran (Menghandle 4 Status + Belum Hadir)
    const dataWithStatus = rows.map(s => {
      const student = s.toJSON();
      // Ambil data absen hari ini (jika ada)
      const attendanceToday = student.studentAttendances?.[0]; 
      
      // Jika ada data absen, pakai statusnya (Hadir/Izin/Sakit/Alpha)
      // Jika tidak ada, statusnya "Belum Hadir"
      student.statusKehadiran = attendanceToday ? attendanceToday.status : 'Belum Hadir';
      
      // Hapus array attendances agar JSON lebih ringan dikirim ke client
      delete student.studentAttendances; 
      
      return student;
    });

    res.json({
      success: true,
      data: dataWithStatus,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / parseInt(limit)),
        currentPage: parseInt(page)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllStudentsNoPagination = async (req, res) => {
  try {
    const { schoolId, class: studentClass, batch, name } = req.query;

    if (!schoolId || isNaN(parseInt(schoolId))) {
      return res.status(400).json({ success: false, message: "schoolId diperlukan." });
    }

    // Bangun kondisi filter yang sama agar hasil cetak sesuai dengan filter di UI
    let condition = {
      schoolId: parseInt(schoolId),
      isActive: true
    };

    if (name) condition.name = { [Op.like]: `%${name}%` };
    if (studentClass) condition.class = studentClass;
    if (batch) condition.batch = batch;

    // Ambil semua data tanpa limit & offset
    const students = await Student.findAll({
      where: condition,
      order: [['name', 'ASC']],
      // Kita hanya ambil kolom yang diperlukan untuk kartu agar hemat memory
      attributes: ['id', 'name', 'nis', 'nisn', 'class', 'photoUrl', 'qrCodeData']
    });

    res.json({
      success: true,
      count: students.length,
      data: students
    });
  } catch (err) {
    console.error("Error Get All Students for Card:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAttendanceSummary = async (req, res) => {
  try {
    const { schoolId } = req.query;

    if (!schoolId) {
      return res.status(400).json({ success: false, message: "schoolId diperlukan." });
    }

    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();

    // 1. Ambil Total Keseluruhan (Master Data)
    const totalSiswaTerdaftar = await Student.count({ 
      where: { schoolId: parseInt(schoolId), isActive: true } 
    });
    const totalGuruTerdaftar = await GuruTendik.count({ 
      where: { schoolId: parseInt(schoolId), isActive: true } 
    });

    // 2. Ambil Statistik Kehadiran Siswa
    const studentStats = await Attendance.findAll({
      where: {
        schoolId: parseInt(schoolId),
        userRole: 'student',
        createdAt: { [Op.between]: [todayStart, todayEnd] }
      },
      attributes: ['status', [fn('COUNT', col('id')), 'total']],
      group: ['status']
    });

    // 3. Ambil Statistik Kehadiran Guru
    const guruStats = await Attendance.findAll({
      where: {
        schoolId: parseInt(schoolId),
        userRole: 'teacher',
        createdAt: { [Op.between]: [todayStart, todayEnd] }
      },
      attributes: ['status', [fn('COUNT', col('id')), 'total']],
      group: ['status']
    });

    // Helper untuk memetakan hasil query ke objek status
    const formatStats = (stats) => {
      const summary = { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0 };
      let totalSudahAbsen = 0;
      
      stats.forEach(item => {
        const data = item.toJSON();
        summary[data.status] = parseInt(data.total);
        totalSudahAbsen += parseInt(data.total);
      });
      
      return { summary, totalSudahAbsen };
    };

    const formattedStudent = formatStats(studentStats);
    const formattedGuru = formatStats(guruStats);

    res.json({
      success: true,
      date: moment().format('YYYY-MM-DD'),
      data: {
        siswa: {
          totalSiswa: totalSiswaTerdaftar,
          sudahAbsen: formattedStudent.totalSudahAbsen,
          belumAbsen: totalSiswaTerdaftar - formattedStudent.totalSudahAbsen,
          rincian: formattedStudent.summary
        },
        guru: {
          totalGuru: totalGuruTerdaftar,
          sudahAbsen: formattedGuru.totalSudahAbsen,
          belumAbsen: totalGuruTerdaftar - formattedGuru.totalSudahAbsen,
          rincian: formattedGuru.summary
        }
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllTeachers = async (req, res) => {
  try {
    const { schoolId, page = 1, limit = 10, nama, nip, role } = req.query;
    
    // Validasi schoolId
    if (!schoolId || isNaN(parseInt(schoolId))) {
      return res.status(400).json({ success: false, message: "schoolId diperlukan." });
    }

    // 1. Membangun Kondisi Filter
    let condition = { 
      schoolId: parseInt(schoolId), 
      isActive: true 
    };
    
    // Filter pencarian berdasarkan nama (Op.like)
    if (nama) condition.nama = { [Op.like]: `%${nama}%` };
    // Filter berdasarkan NIP
    if (nip) condition.nip = { [Op.like]: `%${nip}%` };
    // Filter berdasarkan Role (Guru/Staff/Admin)
    if (role) condition.role = role;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 2. Fetch Data dengan Eager Loading Attendance hari ini
    const { count, rows } = await GuruTendik.findAndCountAll({
      where: condition,
      limit: parseInt(limit),
      offset: offset,
      order: [['nama', 'ASC']],
      include: [{
        model: Attendance,
        as: 'guruAttendances', // Pastikan alias ini sama dengan di Model Guru
        where: {
          createdAt: {
            [Op.between]: [
              moment().startOf('day').toDate(), 
              moment().endOf('day').toDate()
            ]
          }
        },
        required: false // Agar guru tetap muncul meskipun belum scan absen harian
      }]
    });

    // 3. Mapping Data & Status Kehadiran
    const dataWithStatus = rows.map(g => {
      const teacher = g.toJSON();
      
      // Ambil data absen pertama yang ditemukan untuk hari ini
      const attendanceToday = teacher.guruAttendances?.[0]; 
      
      // Tentukan status kehadiran (Hadir/Izin/Sakit/Alpha/Belum Hadir)
      teacher.statusKehadiran = attendanceToday ? attendanceToday.status : 'Belum Hadir';
      
      // Optional: Sertakan waktu scan jika sudah hadir
      teacher.scanTime = attendanceToday ? moment(attendanceToday.createdAt).format("HH:mm:ss") : null;

      return teacher;
    });

    // 4. Response JSON
    res.json({
      success: true,
      data: dataWithStatus,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / parseInt(limit)),
        currentPage: parseInt(page)
      }
    });
  } catch (err) {
    console.error("Error Get Teachers:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUserDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, year, page = 1, limit = 10 } = req.query; // Default page 1, limit 10

    if (!role || !['student', 'teacher'].includes(role)) {
      return res.status(400).json({ success: false, message: "Role harus ditentukan." });
    }

    const isStudent = role === 'student';
    const Model = isStudent ? Student : GuruTendik;
    const attendanceAlias = isStudent ? 'studentAttendances' : 'guruAttendances';

    // Konfigurasi Waktu
    const startDate = year 
      ? moment(`${year}-01-01`).startOf('year').toDate() 
      : moment().subtract(1, 'years').toDate();
    const endDate = year 
      ? moment(`${year}-12-31`).endOf('year').toDate() 
      : moment().endOf('day').toDate();

    // 1. Ambil Profil & Statistik (Tanpa limit untuk hitung total stats)
    const userWithAllAttendance = await Model.findOne({
      where: { id, isActive: true },
      include: [{
        model: Attendance,
        as: attendanceAlias,
        where: { createdAt: { [Op.between]: [startDate, endDate] } },
        required: false
      }]
    });

    if (!userWithAllAttendance) {
      return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    }

    // 2. Hitung Statistik (Logic tetap sama)
    const stats = { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0, Terlambat: 0 };
    const deadline = "07:00:00";
    const allRecords = userWithAllAttendance[attendanceAlias] || [];
    
    allRecords.forEach(record => {
      const scanTime = moment(record.createdAt).format("HH:mm:ss");
      if (record.status === 'Hadir' && scanTime > deadline) stats.Terlambat++;
      if (stats.hasOwnProperty(record.status)) stats[record.status]++;
    });

    // 3. Query Terpisah untuk Riwayat (Dengan Pagination)
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Kita ambil datanya langsung dari model Attendance agar pagination lebih akurat
    const { count, rows } = await Attendance.findAndCountAll({
      where: {
        // Sesuaikan foreign key berdasarkan role
        [isStudent ? 'studentId' : 'guruId']: id, 
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    const history = rows.map(record => {
      const scanTime = moment(record.createdAt).format("HH:mm:ss");
      return {
        id: record.id,
        date: moment(record.createdAt).format('YYYY-MM-DD'),
        time: scanTime,
        status: record.status,
        isLate: record.status === 'Hadir' && scanTime > deadline,
        info: isStudent ? record.currentClass : 'GURU/STAFF'
      };
    });

    // 4. Response
    const profile = userWithAllAttendance.toJSON();
    delete profile[attendanceAlias];

    res.json({
      success: true,
      data: {
        role,
        profile,
        statistics: stats,
        attendanceHistory: history,
        pagination: {
          totalItems: count,
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          limit: parseInt(limit)
        }
      }
    });

  } catch (err) {
    console.error("Error Detail User:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Export excel per-individual (history 1 tahun)

exports.exportUserAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, year } = req.query;

    if (!role) return res.status(400).json({ success: false, message: "Role diperlukan." });

    const isStudent = role === 'student';
    const deadline = "07:00:00";

    // Konfigurasi Waktu (Sama dengan logika utama)
    const startDate = year 
      ? moment(`${year}-01-01`).startOf('year').toDate() 
      : moment().subtract(1, 'years').toDate();
    const endDate = year 
      ? moment(`${year}-12-31`).endOf('year').toDate() 
      : moment().endOf('day').toDate();

    // Ambil SEMUA data tanpa pagination
    const rows = await Attendance.findAll({
      where: {
        [isStudent ? 'studentId' : 'guruId']: id, 
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      order: [['createdAt', 'DESC']]
    });

    // Mapping data agar siap dibaca Excel
    const history = rows.map((record, index) => {
      const scanTime = moment(record.createdAt).format("HH:mm:ss");
      return {
        No: index + 1,
        Tanggal: moment(record.createdAt).format('YYYY-MM-DD'),
        Jam: scanTime,
        Status: record.status,
        Keterangan: (record.status === 'Hadir' && scanTime > deadline) ? 'Terlambat' : 'Tepat Waktu',
        Info: isStudent ? record.currentClass : 'GURU/STAFF'
      };
    });

    res.json({
      success: true,
      data: history
    });

  } catch (err) {
    console.error("Error Export Data:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Fungsi Helper Haversine (Gratis & Akurat)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radius bumi dalam meter
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Hasil dalam meter
}

// SCAM DEVELOPMENT DENGAN KOORDINAT
// exports.scanQRCode = async (req, res) => {
//   // Terima userLat dan userLon dari aplikasi HP
//   const { qrCodeData, role, userLat, userLon } = req.body; 
//   const todayStart = moment().startOf('day').toDate();
//   const todayEnd = moment().endOf('day').toDate();

//   const t = await sequelize.transaction();

//   try {
//     let user;
//     let updateFields = {};

//     // 1. Cari User
//     if (role === 'student') {
//       user = await Student.findOne({ where: { qrCodeData, isActive: true } });
//       if (user) updateFields = { idKey: 'studentId', id: user.id, name: user.name, class: user.class, schoolId: user.schoolId, nisn: user.nisn };
//     } else {
//       user = await GuruTendik.findOne({ where: { qrCodeData, isActive: true } }); 
//       if (user) updateFields = { idKey: 'guruId', id: user.id, name: user.nama, class: 'GURU/STAFF', schoolId: user.schoolId, email: user.email };
//     }

//     if (!user) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

//     // 2. VALIDASI GEOFENCING
//     const school = await SchoolProfile.findOne({ where: { schoolId: updateFields.schoolId } });
    
//     if (school && school.latitude && school.longitude) {
//       if (!userLat || !userLon) {
//         return res.status(400).json({ success: false, message: 'Lokasi GPS diperlukan' });
//       }

//       const distance = getDistance(userLat, userLon, school.latitude, school.longitude);
//       const maxRadius = 100; // Toleransi 100 meter

//       if (distance > maxRadius) {
//         await t.rollback();
//         return res.status(403).json({ 
//           success: false, 
//           message: `Anda berada di luar jangkauan sekolah (${Math.round(distance)}m).` 
//         });
//       }
//     }

//     // 3. Cek Absen Ganda
//     const alreadyExists = await Attendance.findOne({
//       where: { 
//         [updateFields.idKey]: updateFields.id, 
//         createdAt: { [Op.between]: [todayStart, todayEnd] } 
//       },
//       transaction: t,
//       lock: true 
//     });

//     if (alreadyExists) {
//       await t.rollback();
//       return res.status(400).json({ success: false, message: 'Sudah absen hari ini.' });
//     }

//     // 4. Simpan dengan Koordinat
//     await Attendance.create({ 
//       [updateFields.idKey]: updateFields.id,
//       userRole: role,
//       schoolId: updateFields.schoolId, 
//       currentClass: updateFields.class,
//       status: 'Hadir',
//       latitude: userLat,
//       longitude: userLon
//     }, { transaction: t });

//     await t.commit();

//     res.json({ 
//       success: true, 
//       message: `Absen berhasil: ${updateFields.name}`,
//       data: { name: updateFields.name, class: updateFields.class }
//     });
//   } catch (err) {
//     if (t) await t.rollback();
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// SCAN YANG ASLI TANPA KOORDINAT (PROD)
exports.scanQRCode = async (req, res) => {
  // role: 'student' atau 'teacher'
  const { qrCodeData, role } = req.body; 
  const todayStart = moment().startOf('day').toDate();
  const todayEnd = moment().endOf('day').toDate();

  const t = await sequelize.transaction();

  try {
    let user;
    let updateFields = { schoolId: null, id: null, name: null, class: null, nisn: null, email: null };

    if (role === 'student') {
      user = await Student.findOne({ where: { qrCodeData, isActive: true } });
      if (user) {
        updateFields = { idKey: 'studentId', id: user.id, name: user.name, class: user.class, schoolId: user.schoolId, nisn: user.nisn };
      }
    } else {
      // Untuk Guru, asumsikan qrCodeData disimpan di field tertentu atau pakai ID
      user = await GuruTendik.findOne({ where: { qrCodeData, isActive: true } }); 
      if (user) {
        updateFields = { idKey: 'guruId', id: user.id, name: user.nama, class: 'GURU/STAFF', schoolId: user.schoolId, email: user.email };
      }
    }

    if (!user) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    const alreadyExists = await Attendance.findOne({
      where: { 
        [updateFields.idKey]: updateFields.id, 
        createdAt: { [Op.between]: [todayStart, todayEnd] } 
      },
      transaction: t,
      lock: true 
    });

    if (alreadyExists) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'sudah absen.' });
    }

    // Simpan
    await Attendance.create({ 
      [updateFields.idKey]: updateFields.id,
      userRole: role,
      schoolId: updateFields.schoolId, 
      currentClass: updateFields.class,
      status: 'Hadir'
    }, { transaction: t });

    await t.commit();

     res.json({ 
      success: true, 
      message: `Absen berhasil: ${updateFields.name}`,
      data: {  // Tambahkan objek data ini
        name: updateFields.name,
        nisn: updateFields.nisn || updateFields.email, // Sesuaikan field yang ada
        class: updateFields.class
      }
    });
  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nis, nisn, gender, birthPlace, birthDate, nik, isActive, class: className, batch } = req.body;

    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
    }

   let photoUrl = student.photoUrl;

    if (req.file) {
      // Optimasi saat update (otomatis menimpa file lama karena public_id sama)
      photoUrl = await processPhotoUpload(req.file.buffer, student.schoolId, student.nis);
    }

    await student.update({
      name, nis, nisn, gender, birthPlace, birthDate, nik, isActive, class: className, batch,
      photoUrl
    });

    res.json({ success: true, message: 'Data siswa diperbarui', data: student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- DELETE SISWA (Soft Delete) ---
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findByPk(id);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
    }

    // Opsi A: Hard Delete (Hapus permanen)
    // await student.destroy(); 

    // Opsi B: Soft Delete (Hanya nonaktifkan) -> Lebih aman untuk history absen
    student.isActive = false;
    await student.save();

    res.json({ success: true, message: 'Siswa berhasil dinonaktifkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


exports.getTodayStats = async (req, res) => {
  try {
    const { schoolId, role = 'student' } = req.query;

    // Ambil semua data kehadiran hari ini untuk sekolah & role terkait
    const attendanceData = await Attendance.findAll({
      where: {
        schoolId: parseInt(schoolId),
        userRole: role,
        createdAt: {
          [Op.between]: [
            moment().startOf('day').toDate(), 
            moment().endOf('day').toDate()
          ]
        }
      },
      raw: true 
    });

    // Struktur summary dengan key Terlambat yang terpisah
    const summary = { 
      Hadir: 0, 
      Terlambat: 0, // Key baru
      Sakit: 0, 
      Izin: 0, 
      Alpha: 0 
    };

    // Definisikan batas waktu (07:00:00)
    // Gunakan format string 'HH:mm:ss' agar perbandingannya mudah
    const deadline = "07:00:00";

    attendanceData.forEach(item => {
      if (item.status === 'Hadir') {
        // Ambil bagian jam dari createdAt (HH:mm:ss)
        const scanTime = moment(item.createdAt).format("HH:mm:ss");

        if (scanTime > deadline) {
          summary.Terlambat += 1;
        } else {
          summary.Hadir += 1;
        }
      } else {
        // Mapping untuk status Sakit, Izin, Alpha
        if (summary.hasOwnProperty(item.status)) {
          summary[item.status] += 1;
        }
      }
    });

    res.json({ 
      success: true, 
      data: { 
        date: moment().format('YYYY-MM-DD'),
        deadlineInfo: deadline,
        ...summary 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAttendanceReport = async (req, res) => {
  try {
    // Tambahkan 'date' ke destructuring query
    const { schoolId, role, year, month, date, page = 1, limit = 50 } = req.query;

    let startDate, endDate;

    if (date) {
      // Jika ada filter tanggal spesifik (format: YYYY-MM-DD)
      startDate = moment(date).startOf('day').toDate();
      endDate = moment(date).endOf('day').toDate();
    } else {
      // Default: Filter berdasarkan bulan dan tahun
      startDate = moment(`${year}-${month}-01`).startOf('month').toDate();
      endDate = moment(startDate).endOf('month').toDate();
    }

    const { count, rows } = await Attendance.findAndCountAll({
      where: {
        schoolId,
        userRole: role,
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      include: [
        {
          model: role === 'student' ? Student : GuruTendik,
          as: role === 'student' ? 'student' : 'guru',
          attributes: role === 'student' ? ['name', 'nis'] : ['nama', 'role', 'mapel']
        }
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']],
      raw: false 
    });

    const deadline = "07:00:00";

    const processedRows = rows.map(record => {
      const attendance = record.toJSON();
      const scanTime = moment(attendance.createdAt).format("HH:mm:ss");
      
      attendance.isLate = attendance.status === 'Hadir' && scanTime > deadline;
      attendance.scanTime = scanTime;

      return attendance;
    });

    res.json({ 
      success: true, 
      data: processedRows, 
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportAttendanceExcel = async (req, res) => {
  try {
    // Ambil userRole dari query (default ke student jika tidak ada)
    const { schoolId, year, month, className, role } = req.query;
    const userRole = role || 'student'; 

    if (!schoolId || schoolId === 'undefined' || isNaN(parseInt(schoolId))) {
      return res.status(400).json({
        success: false,
        message: "Parameter 'schoolId' diperlukan."
      });
    }

    let startDate, endDate, fileName;
    const roleLabel = userRole === 'teacher' ? 'Guru' : 'Siswa';

    if (month) {
      startDate = moment(`${year}-${month}-01`).startOf('month');
      endDate = moment(startDate).endOf('month');
      fileName = `Laporan_Absen_${roleLabel}_${month}_${year}.xlsx`;
    } else {
      startDate = moment(`${year}-01-01`).startOf('year');
      endDate = moment(startDate).endOf('year');
      fileName = `Laporan_Absen_${roleLabel}_Tahun_${year}.xlsx`;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: true
    });
    
    const worksheet = workbook.addWorksheet('Presensi');

    // Kolom Dinamis berdasarkan Role
    const columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Tanggal', key: 'tanggal', width: 15 },
      { header: 'Waktu', key: 'waktu', width: 10 },
      { header: roleLabel, key: 'nama', width: 30 }, // Header jadi "Siswa" atau "Guru"
    ];

    if (userRole === 'student') {
      columns.push({ header: 'NIS', key: 'identitas', width: 15 });
      columns.push({ header: 'Kelas', key: 'info_tambahan', width: 15 });
    } else {
      columns.push({ header: 'Jabatan/Role', key: 'identitas', width: 15 });
      columns.push({ header: 'Mapel', key: 'info_tambahan', width: 15 });
    }

    columns.push({ header: 'Status', key: 'status', width: 12 });
    worksheet.columns = columns;

    let count = 1;
    const batchSize = 1000;
    let offset = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      const attendances = await Attendance.findAll({
        where: {
          userRole: userRole, // Filter berdasarkan role yang diminta
          createdAt: { [Op.between]: [startDate.toDate(), endDate.toDate()] },
          ...(userRole === 'student' && className && { currentClass: className })
        },
        include: [
          userRole === 'student' 
          ? {
              model: Student,
              as: 'student',
              where: { schoolId: parseInt(schoolId) },
              attributes: ['name', 'nis']
            }
          : {
              model: GuruTendik, // Pastikan nama model Guru Anda benar
              as: 'guru',   // Sesuaikan alias di asosiasi model Anda
              where: { schoolId: parseInt(schoolId) },
              attributes: ['nama', 'role', 'mapel']
            }
        ],
        limit: batchSize,
        offset: offset,
        order: [['createdAt', 'ASC']],
        raw: true,
        nest: true
      });

      if (attendances.length === 0) {
        hasMoreData = false;
      } else {
        attendances.forEach(item => {
          const person = userRole === 'student' ? item.student : item.guru;
          
          worksheet.addRow({
            no: count++,
            tanggal: moment(item.createdAt).format('YYYY-MM-DD'),
            waktu: moment(item.createdAt).format('HH:mm'),
            nama: userRole === 'student' ? (person?.name || '-') : (person?.nama || '-'),
            identitas: userRole === 'student' ? person?.nis : (person?.role || 'Guru/Staff'),
            info_tambahan: userRole === 'student' ? item.currentClass : (person?.mapel || '-'),
            status: item?.isLate ? 'Terlambat' : item.status
          }).commit();
        });
        offset += batchSize;
      }
    }

    await workbook.commit();

  } catch (err) {
    console.error('Export Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Gagal men-generate excel: ' + err.message });
    }
  }
};

exports.markAbsence = async (req, res) => {
  try {
    let data = req.body;
    if (!Array.isArray(data)) data = [data];

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: "Data kosong." });
    }

    const startOfDay = moment().startOf('day').toDate();
    const endOfDay = moment().endOf('day').toDate();

    const operations = data.map(async (item) => {
      // Ambil guruId, studentId, dan userRole dari body
      const { studentId, guruId, schoolId, status, currentClass, userRole } = item;

      // 1. Tentukan kondisi pencarian (Cari berdasarkan ID yang ada)
      let searchCondition = {
        schoolId,
        createdAt: { [Op.between]: [startOfDay, endOfDay] }
      };

      if (userRole === 'teacher' || guruId) {
        searchCondition.guruId = guruId;
        searchCondition.userRole = 'teacher';
      } else {
        searchCondition.studentId = studentId;
        searchCondition.userRole = 'student';
      }

      // 2. Cari data existing
      const existing = await Attendance.findOne({ where: searchCondition });

      if (existing) {
        // Update data jika sudah ada
        return existing.update({ 
          status, 
          currentClass: userRole === 'student' ? currentClass : null // Guru biasanya tidak punya currentClass
        });
      } else {
        // Buat data baru jika belum ada
        return Attendance.create({
          studentId: userRole === 'student' ? studentId : null,
          guruId: (userRole === 'teacher' || guruId) ? guruId : null,
          schoolId,
          status,
          userRole: userRole || (guruId ? 'teacher' : 'student'),
          currentClass: userRole === 'student' ? currentClass : null
        });
      }
    });

    const records = await Promise.all(operations);

    res.json({
      success: true,
      message: `Berhasil memproses ${records.length} data absensi (Guru/Siswa).`,
      data: records
    });
  } catch (err) {
    console.error("Error markAbsence:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getEarlyWarningReport = async (req, res) => {
    try {
        const { schoolId } = req.query;
        const deadline = "07:00:00";
        const oneWeekAgo = moment().subtract(7, 'days').startOf('day').toDate();

        // 1. TIDAK MASUK > 3 HARI (Status 'Alpha') dalam 7 hari terakhir
        const chronicAbsents = await Attendance.findAll({
            where: {
                schoolId,
                userRole: 'student',
                status: 'Alpha',
                createdAt: { [Op.gte]: oneWeekAgo }
            },
            attributes: ['studentId', [fn('COUNT', col('studentId')), 'totalAlpa']],
            include: [{ model: Student, as: 'student', attributes: ['name', 'class', 'nis'] }],
            group: ['studentId', 'student.id'],
            having: literal('totalAlpa >= 3'),
            raw: false
        });

        // 2. TERLAMBAT > 3x (Status 'Hadir' tapi jam > 07:00) dalam 7 hari terakhir
        const habitualLaters = await Attendance.findAll({
            where: {
                schoolId,
                userRole: 'student',
                status: 'Hadir',
                createdAt: { 
                    [Op.gte]: oneWeekAgo,
                    [Op.and]: [literal(`TIME(Attendance.createdAt) > "${deadline}"`)]
                }
            },
            attributes: ['studentId', [fn('COUNT', col('studentId')), 'totalLate']],
            include: [{ model: Student, as: 'student', attributes: ['name', 'class'] }],
            group: ['studentId', 'student.id'],
            having: literal('totalLate >= 3'),
            raw: false
        });

        // 3. EXTREMES HARI INI (Paling Pagi vs Paling Telat)
        const todayAttendance = await Attendance.findAll({
            where: {
                schoolId,
                userRole: 'student',
                status: 'Hadir',
                createdAt: {
                    [Op.between]: [moment().startOf('day').toDate(), moment().endOf('day').toDate()]
                }
            },
            include: [{ model: Student, as: 'student', attributes: ['name', 'class'] }],
            order: [['createdAt', 'ASC']] 
        });

        res.json({
            success: true,
            warnings: {
                unexcusedAbsence: chronicAbsents,
                habitualLaters: habitualLaters,
            },
            todayExtremes: {
                earliest: todayAttendance[0] || null,
                latest: todayAttendance[todayAttendance.length - 1] || null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getPublicHallOfFame = async (req, res) => {
    try {
        const { schoolId } = req.query;

        // Karena DB Anda menyimpan waktu lokal (WIB), 
        // pastikan startOfDay dan endOfDay juga dalam konteks lokal server.
        const startOfDay = moment().startOf('day').toDate();
        const endOfDay = moment().endOf('day').toDate();
        const startOfMonth = moment().startOf('month').toDate();

        // 1. TOP 10 DATANG PALING AWAL HARI INI
        const top10Today = await Attendance.findAll({
            where: {
                schoolId,
                userRole: 'student',
                status: 'Hadir',
                createdAt: {
                    [Op.between]: [startOfDay, endOfDay]
                }
            },
            include: [{ 
                model: Student, 
                as: 'student', 
                attributes: ['name', 'class'] 
            }],
            limit: 10,
            order: [['createdAt', 'ASC']]
        });

        // 2. TOP 5 KONSISTENSI (Bulanan)
        const deadline = "07:00:00";
        const top5Monthly = await Attendance.findAll({
            where: {
                schoolId,
                userRole: 'student',
                status: 'Hadir',
                createdAt: { [Op.gte]: startOfMonth },
                // Gunakan Attendance.createdAt untuk menghindari Ambiguous Error
                [Op.and]: [
                    literal(`TIME(Attendance.createdAt) <= "${deadline}"`)
                ]
            },
            attributes: [
                'studentId', 
                [fn('COUNT', col('studentId')), 'ontimeCount']
            ],
            include: [{ 
                model: Student, 
                as: 'student', 
                attributes: ['name', 'class'] 
            }],
            group: ['studentId', 'student.id', 'student.name', 'student.class'],
            order: [[literal('ontimeCount'), 'DESC']],
            limit: 5
        });

        res.json({
            success: true,
            data: {
                dailyEarlyBirds: top10Today.map(t => ({
                    name: t.student?.name || "Siswa",
                    class: t.student?.class || "-",
                    // JANGAN gunakan .utc() atau .tz() jika value DB sudah 13:24
                    // Cukup format jam:menit saja
                    time: moment(t.createdAt)
                })),
                monthlyChampions: top5Monthly.map(m => ({
                    name: m.student?.name || "Siswa",
                    class: m.student?.class || "-",
                    totalOnTime: parseInt(m.get('ontimeCount'))
                }))
            }
        });
    } catch (err) {
        console.error("Error Hall of Fame:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};