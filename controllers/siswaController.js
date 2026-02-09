const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { fn, col, Op } = require('sequelize');
const moment = require('moment');
const ExcelJS = require('exceljs');
const GuruTendik = require('../models/guruTendik');

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
      const attendanceToday = student.attendances?.[0]; 
      
      // Jika ada data absen, pakai statusnya (Hadir/Izin/Sakit/Alpha)
      // Jika tidak ada, statusnya "Belum Hadir"
      student.statusKehadiran = attendanceToday ? attendanceToday.status : 'Belum Hadir';
      
      // Hapus array attendances agar JSON lebih ringan dikirim ke client
      delete student.attendances; 
      
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

// exports.scanQRCode = async (req, res) => {
//   const { qrCodeData } = req.body;
//   const todayStart = moment().startOf('day').toDate();
//   const todayEnd = moment().endOf('day').toDate();

//   try {
//     // 1. Cari siswa berdasarkan QR
//     const student = await Student.findOne({ 
//       where: { qrCodeData, isActive: true },
//       attributes: ['id', 'name', 'class', 'nis'] 
//     });

//     if (!student) return res.status(404).json({ success: false, message: 'QR tidak dikenal' });

//     // 2. Cek apakah sudah absen hari ini di MySQL
//     const alreadyExists = await Attendance.findOne({
//       where: { 
//         studentId: student.id, 
//         createdAt: { [Op.between]: [todayStart, todayEnd] } 
//       }
//     });

//     if (alreadyExists) {
//       return res.status(400).json({ success: false, message: `${student.name} sudah absen hari ini.` });
//     }

//     // 3. Simpan absensi
//     await Attendance.create({ 
//       studentId: student.id, 
//       schoolId: student.schoolId, 
//       currentClass: student.class,
//       status: 'Hadir'
//     });

//     res.json({ 
//       success: true, 
//       message: `Absen berhasil: ${student.name}`,
//       data: {  // Tambahkan objek data ini
//         name: student.name,
//         nisn: student.nisn || student.nis, // Sesuaikan field yang ada
//         class: student.class
//       }
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// --- UPDATE SISWA ---

exports.scanQRCode = async (req, res) => {
  const { qrCodeData, role } = req.body; // role: 'student' atau 'teacher'
  const todayStart = moment().startOf('day').toDate();
  const todayEnd = moment().endOf('day').toDate();

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
      user = await GuruTendik.findOne({ where: { id: qrCodeData, isActive: true } }); 
      if (user) {
        updateFields = { idKey: 'guruId', id: user.id, name: user.nama, class: 'GURU/STAFF', schoolId: user.schoolId, email: user.email };
      }
    }

    if (!user) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    // Cek Duplikasi
    const alreadyExists = await Attendance.findOne({
      where: { 
        [updateFields.idKey]: updateFields.id, 
        createdAt: { [Op.between]: [todayStart, todayEnd] } 
      }
    });

    if (alreadyExists) return res.status(400).json({ success: false, message: `${updateFields.name} sudah absen.` });

    // Simpan
    await Attendance.create({ 
      [updateFields.idKey]: updateFields.id,
      userRole: role,
      schoolId: updateFields.schoolId, 
      currentClass: updateFields.class,
      status: 'Hadir'
    });

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

// exports.getAttendanceReport = async (req, res) => {
//   try {
//     const { schoolId, year, month, className, batch, page = 1, limit = 50 } = req.query;

//     // 1. Validasi WAJIB ada schoolId
//     if (!schoolId || schoolId === 'undefined' || isNaN(parseInt(schoolId))) {
//       return res.status(400).json({
//         success: false,
//         message: "Parameter 'schoolId' diperlukan dan harus berupa angka."
//       });
//     }

//     let startDate, endDate;
//     if (month) {
//       startDate = moment(`${year}-${month}-01`, "YYYY-MM-DD").startOf('month').toDate();
//       endDate = moment(startDate).endOf('month').toDate();
//     } else {
//       startDate = moment(`${year}-01-01`, "YYYY-MM-DD").startOf('year').toDate();
//       endDate = moment(startDate).endOf('year').toDate();
//     }

//     const offset = (parseInt(page) - 1) * parseInt(limit);

//     const { count, rows } = await Attendance.findAndCountAll({
//       where: {
//         createdAt: { [Op.between]: [startDate, endDate] },
//         // Short-circuit logic untuk filter opsional
//         ...(className && { currentClass: className }) 
//       },
//       include: [{
//         model: Student,
//         as: 'student',
//         where: { 
//           schoolId: parseInt(schoolId),
//           ...(batch && { batch })
//         },
//         attributes: ['name', 'nis', 'class', 'batch']
//       }],
//       limit: parseInt(limit),
//       offset: offset,
//       order: [['createdAt', 'DESC']]
//     });

//     res.json({
//       success: true,
//       data: rows,
//       pagination: {
//         totalItems: count,
//         totalPages: Math.ceil(count / limit),
//         currentPage: parseInt(page)
//       }
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// exports.getAttendanceReport = async (req, res) => {
//   try {
//     const { schoolId, role, year, month, page = 1, limit = 50 } = req.query;

//     const startDate = moment(`${year}-${month}-01`).startOf('month').toDate();
//     const endDate = moment(startDate).endOf('month').toDate();

//     const { count, rows } = await Attendance.findAndCountAll({
//       where: {
//         schoolId,
//         userRole: role,
//         createdAt: { [Op.between]: [startDate, endDate] }
//       },
//       include: [
//         {
//           model: role === 'student' ? Student : GuruTendik,
//           as: role === 'student' ? 'student' : 'guru',
//           attributes: role === 'student' ? ['name', 'nis'] : ['nama', 'role', 'mapel']
//         }
//       ],
//       limit: parseInt(limit),
//       offset: (page - 1) * limit,
//       order: [['createdAt', 'DESC']]
//     });

//     res.json({ success: true, data: rows, total: count });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

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
    const { schoolId, year, month, className, batch } = req.query;

    // 1. Validasi WAJIB ada schoolId
    if (!schoolId || schoolId === 'undefined' || isNaN(parseInt(schoolId))) {
      return res.status(400).json({
        success: false,
        message: "Parameter 'schoolId' diperlukan dan harus berupa angka."
      });
    }

    let startDate, endDate, fileName;
    if (month) {
      startDate = moment(`${year}-${month}-01`).startOf('month');
      endDate = moment(startDate).endOf('month');
      fileName = `Laporan_Absen_${month}_${year}.xlsx`;
    } else {
      startDate = moment(`${year}-01-01`).startOf('year');
      endDate = moment(startDate).endOf('year');
      fileName = `Laporan_Absen_Tahun_${year}.xlsx`;
    }

    // 1. Set Header HTTP
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    // 2. Gunakan stream: res agar data langsung dialirkan ke user
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true, // Opsional: jika ingin styling tebal/warna
      useSharedStrings: true
    });
    
    const worksheet = workbook.addWorksheet('Presensi');

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Tanggal', key: 'tanggal', width: 15 },
      { header: 'Waktu', key: 'waktu', width: 10 },
      { header: 'Nama Siswa', key: 'nama', width: 30 },
      { header: 'NIS', key: 'nis', width: 15 },
      { header: 'Kelas', key: 'kelas', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    let count = 1;
    const batchSize = 1000;
    let offset = 0;
    let hasMoreData = true;

    while (hasMoreData) {
      const attendances = await Attendance.findAll({
        where: {
          createdAt: { [Op.between]: [startDate.toDate(), endDate.toDate()] },
          ...(className && { currentClass: className })
        },
        include: [{
          model: Student,
          as: 'student', // Gunakan alias yang sudah kita set di model
          where: { schoolId: parseInt(schoolId), ...(batch && { batch }) },
          attributes: ['name', 'nis']
        }],
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
          worksheet.addRow({
            no: count++,
            tanggal: moment(item.createdAt).format('YYYY-MM-DD'),
            waktu: moment(item.createdAt).format('HH:mm'),
            // Karena menggunakan as: 'student' dan nest: true, aksesnya jadi item.student
            nama: item.student ? item.student.name : '-', 
            nis: item.student ? item.student.nis : '-',
            kelas: item.currentClass,
            status: item.status
          }).commit(); // Baris dikirim ke stream dan dihapus dari memori
        });
        offset += batchSize;
      }
    }

    // 3. Finalisasi
    await workbook.commit();
    // Tidak perlu res.end() karena workbook.commit() sudah menutup stream response.

  } catch (err) {
    console.error('Export Error:', err);
    // Cek jika header belum dikirim agar tidak terjadi error "Headers already sent"
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

    // Proses semua data secara paralel untuk kecepatan maksimal
    const operations = data.map(async (item) => {
      const { studentId, schoolId, status, currentClass } = item;

      // Cari apakah sudah ada absen untuk siswa ini di hari ini
      const existing = await Attendance.findOne({
        where: {
          studentId,
          createdAt: { [Op.between]: [startOfDay, endOfDay] }
        }
      });

      if (existing) {
        // Jika ADA: Update status dan currentClass (updatedAt akan otomatis terisi)
        return existing.update({ status, currentClass });
      } else {
        // Jika TIDAK ADA: Buat baris baru
        return Attendance.create({
          studentId,
          schoolId,
          status,
          currentClass
        });
      }
    });

    const records = await Promise.all(operations);

    res.json({
      success: true,
      message: `Berhasil memproses ${records.length} data absensi (Update/Insert).`,
      data: records
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// exports.getTodayStats = async (req, res) => {
//   try {
//     const { schoolId, role = 'student' } = req.query; // Tambahkan filter role

//     const stats = await Attendance.findAll({
//       attributes: [
//         'status',
//         [fn('COUNT', col('id')), 'total']
//       ],
//       where: {
//         schoolId: parseInt(schoolId),
//         userRole: role,
//         createdAt: {
//           [Op.between]: [moment().startOf('day').toDate(), moment().endOf('day').toDate()]
//         }
//       },
//       group: ['status'],
//       raw: true 
//     });

//     const summary = { Hadir: 0, Sakit: 0, Izin: 0, Alpha: 0 };
//       stats.forEach(item => {
//         // Pada raw query, key biasanya langsung nama kolom atau alias
//         summary[item.status] = parseInt(item.total);
//       });

//       res.json({ success: true, data: { date: moment().format('YYYY-MM-DD'), ...summary } });
//     } catch (err) {
//       res.status(500).json({ success: false, message: err.message });
//     }
// };

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

// Tambahkan/Update di siswaController.js
// exports.getYearlyReport = async (req, res) => {
//   try {
//     const { schoolId, year, className, batch } = req.query; // Ambil parameter dari URL
    
//     // Tentukan rentang waktu awal dan akhir tahun
//     const startOfYear = moment(`${year}-01-01`).startOf('year').toDate();
//     const endOfYear = moment(`${year}-12-31`).endOf('year').toDate();

//     // Bangun Filter untuk Model Student secara dinamis
//     const studentFilter = { 
//       schoolId: parseInt(schoolId) 
//     };
    
//     // Jika user memfilter berdasarkan angkatan
//     if (batch) {
//       studentFilter.batch = batch;
//     }

//     // Bangun Filter untuk Model Attendance secara dinamis
//     const attendanceFilter = {
//       createdAt: { [Op.between]: [startOfYear, endOfYear] }
//     };

//     // Jika user memfilter berdasarkan kelas (menggunakan snapshot kelas di tabel Attendance)
//     if (className) {
//       attendanceFilter.currentClass = className;
//     }

//     const data = await Attendance.findAll({
//       where: attendanceFilter,
//       include: [{
//         model: Student,
//         where: studentFilter, // Filter berdasarkan SchoolId dan Batch
//         attributes: ['name', 'nis', 'nisn', 'class', 'batch']
//       }],
//       order: [['createdAt', 'DESC']]
//     });

//     res.json({ 
//       success: true, 
//       count: data.length, 
//       filters: { year, className, batch },
//       data 
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// // --- LAPORAN BULANAN ---
// exports.getMonthlyReport = async (req, res) => {
//   try {
//     const { schoolId, year, month, className, batch } = req.query;
//     if (!year || !month) return res.status(400).json({ message: 'Tahun & Bulan wajib diisi' });

//     const startOfMonth = moment(`${year}-${month}-01`).startOf('month').toDate();
//     const endOfMonth = moment(`${year}-${month}-01`).endOf('month').toDate();

//     const studentFilter = { schoolId: parseInt(schoolId) };
//     if (batch) studentFilter.batch = batch;

//     const attendanceFilter = { createdAt: { [Op.between]: [startOfMonth, endOfMonth] } };
//     if (className) attendanceFilter.currentClass = className;

//     const data = await Attendance.findAll({
//       where: attendanceFilter,
//       include: [{ model: Student, where: studentFilter, attributes: ['name', 'nis', 'class', 'batch'] }],
//       order: [['createdAt', 'ASC']]
//     });

//     res.json({ success: true, count: data.length, data });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

