const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { fn, col, Op } = require('sequelize');
const moment = require('moment');
const ExcelJS = require('exceljs');
const GuruTendik = require('../models/guruTendik');
const sequelize = require('../config/database');

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

// exports.getUserDetail = async (req, res) => {
//   try {
//     const { id } = req.params;
//     // role: 'student' atau 'teacher'
//     const { role, year } = req.query; 

//     if (!role || !['student', 'teacher'].includes(role)) {
//       return res.status(400).json({ success: false, message: "Role harus ditentukan (student/teacher)." });
//     }

//     // 1. Konfigurasi dinamis berdasarkan Role
//     const isStudent = role === 'student';
//     const Model = isStudent ? Student : GuruTendik;
//     const attendanceAlias = isStudent ? 'studentAttendances' : 'guruAttendances';

//     // Rentang waktu 1 tahun
//     const startDate = year 
//       ? moment(`${year}-01-01`).startOf('year').toDate() 
//       : moment().subtract(1, 'years').toDate();
//     const endDate = year 
//       ? moment(`${year}-12-31`).endOf('year').toDate() 
//       : moment().endOf('day').toDate();

//     // 2. Query Database
//     const user = await Model.findOne({
//       where: { id, isActive: true },
//       include: [
//         {
//           model: Attendance,
//           as: attendanceAlias,
//           where: {
//             createdAt: { [Op.between]: [startDate, endDate] }
//           },
//           required: false,
//         }
//       ],
//       order: [[ { model: Attendance, as: attendanceAlias }, 'createdAt', 'DESC']]
//     });

//     if (!user) {
//       return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
//     }

//     // 3. Proses Statistik & Riwayat
//     const stats = { Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0, Terlambat: 0 };
//     const deadline = "07:00:00";

//     // Akses array attendance secara dinamis menggunakan alias
//     const rawAttendances = user[attendanceAlias] || [];

//     const history = rawAttendances.map(record => {
//       const scanTime = moment(record.createdAt).format("HH:mm:ss");
//       const isLate = record.status === 'Hadir' && scanTime > deadline;

//       if (isLate) stats.Terlambat++;
//       if (stats.hasOwnProperty(record.status)) {
//         stats[record.status]++;
//       }

//       return {
//         id: record.id,
//         date: moment(record.createdAt).format('YYYY-MM-DD'),
//         time: scanTime,
//         status: record.status,
//         isLate: isLate,
//         info: isStudent ? record.currentClass : 'GURU/STAFF'
//       };
//     });

//     // 4. Cleanup Response
//     const profile = user.toJSON();
//     delete profile[attendanceAlias]; // Hapus data mentah agar tidak duplikat di JSON

//     res.json({
//       success: true,
//       data: {
//         role,
//         profile,
//         statistics: stats,
//         attendanceHistory: history
//       }
//     });

//   } catch (err) {
//     console.error("Error Detail User:", err);
//     res.status(500).json({ success: false, message: err.message });
//   }
// };


// GET USER DETAIL YANG SUDAH PAGINATION

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

exports.scanQRCode = async (req, res) => {
  const { qrCodeData, role } = req.body; // role: 'student' atau 'teacher'
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

exports.getAttendanceReport = async (req, res) => {
  try {
    const { schoolId, role, year, month, page = 1, limit = 50 } = req.query;

    const startDate = moment(`${year}-${month}-01`).startOf('month').toDate();
    const endDate = moment(startDate).endOf('month').toDate();

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
      raw: false // Biarkan false agar kita bisa memanipulasi objek datavalues
    });

    // Batas waktu jam 07:00
    const deadline = "07:00:00";

    // Modifikasi rows untuk menambahkan status terlambat
    const processedRows = rows.map(record => {
      const attendance = record.toJSON();
      const scanTime = moment(attendance.createdAt).format("HH:mm:ss");
      
      // Tambahkan key baru
      attendance.isLate = attendance.status === 'Hadir' && scanTime > deadline;
      attendance.scanTime = scanTime; // Opsional: kirim waktu scannya saja untuk memudahkan frontend

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