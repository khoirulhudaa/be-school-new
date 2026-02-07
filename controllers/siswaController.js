const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { Op } = require('sequelize');
const moment = require('moment');
const ExcelJS = require('exceljs');

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

// Di Backend: controller/siswaController.js
exports.getAllStudents = async (req, res) => {
  try {
    const { schoolId, page = 1, limit = 10, class: studentClass, batch } = req.query;
  
    // Siapkan objek where
    let condition = { schoolId, isActive: true };
    
    // Jika filter dikirim dari frontend, masukkan ke query
    if (studentClass) condition.class = studentClass;
    if (batch) condition.batch = batch;
      const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Student.findAndCountAll({
      where: { schoolId: parseInt(schoolId), isActive: true },
      limit: parseInt(limit),
      offset: offset,
      order: [['name', 'ASC']],
      include: [{
        model: Attendance,
        as: 'attendances',
        // Filter attendance untuk hari ini saja
        where: {
          createdAt: {
            [Op.between]: [moment().startOf('day').toDate(), moment().endOf('day').toDate()]
          }
        },
        required: false
      }]
    });

    const dataWithStatus = rows.map(s => {
      const student = s.toJSON();
      student.statusKehadiran = student.attendances?.length > 0 ? 'Hadir' : 'Belum Hadir';
      return student;
    });

    res.json({
      success: true,
      data: dataWithStatus,
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

exports.scanQRCode = async (req, res) => {
  const { qrCodeData } = req.body;
  const todayStart = moment().startOf('day').toDate();
  const todayEnd = moment().endOf('day').toDate();

  try {
    // 1. Cari siswa berdasarkan QR
    const student = await Student.findOne({ 
      where: { qrCodeData, isActive: true },
      attributes: ['id', 'name', 'class', 'nis'] 
    });

    if (!student) return res.status(404).json({ success: false, message: 'QR tidak dikenal' });

    // 2. Cek apakah sudah absen hari ini di MySQL
    const alreadyExists = await Attendance.findOne({
      where: { 
        studentId: student.id, 
        createdAt: { [Op.between]: [todayStart, todayEnd] } 
      }
    });

    if (alreadyExists) {
      return res.status(400).json({ success: false, message: `${student.name} sudah absen hari ini.` });
    }

    // 3. Simpan absensi
    await Attendance.create({ 
      studentId: student.id, 
      currentClass: student.class,
      status: 'Hadir'
    });

    res.json({ 
      success: true, 
      message: `Absen berhasil: ${student.name}`,
      data: {  // Tambahkan objek data ini
        name: student.name,
        nisn: student.nisn || student.nis, // Sesuaikan field yang ada
        class: student.class
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- UPDATE SISWA ---
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
    const { schoolId, year, month, className, batch, page = 1, limit = 50 } = req.query;

    let startDate, endDate;
    if (month) {
      startDate = moment(`${year}-${month}-01`, "YYYY-MM-DD").startOf('month').toDate();
      endDate = moment(startDate).endOf('month').toDate();
    } else {
      startDate = moment(`${year}-01-01`, "YYYY-MM-DD").startOf('year').toDate();
      endDate = moment(startDate).endOf('year').toDate();
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Attendance.findAndCountAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        // Short-circuit logic untuk filter opsional
        ...(className && { currentClass: className }) 
      },
      include: [{
        model: Student,
        as: 'student',
        where: { 
          schoolId: parseInt(schoolId),
          ...(batch && { batch })
        },
        attributes: ['name', 'nis', 'class', 'batch']
      }],
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: rows,
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

