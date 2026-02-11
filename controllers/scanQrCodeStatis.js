const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { fn, col, Op } = require('sequelize');
const moment = require('moment');
const ExcelJS = require('exceljs');
const GuruTendik = require('../models/guruTendik');
const sequelize = require('../config/database');


exports.scanSelf = async (req, res) => {
  const { qrScanned } = req.body; // Data dari hasil scan kamera HP user
  const { id, role, schoolId } = req.user; // Diambil dari JWT Middleware
  
  const todayStart = moment().startOf('day').toDate();
  const todayEnd = moment().endOf('day').toDate();

  // 1. Validasi Kode QR Sekolah (Misal: sekolah_123_attendance_key)
  // Anda bisa membuat string statis di database per sekolah untuk keamanan
  if (!qrScanned.includes(`SCHOOL_QR_${schoolId}`)) {
    return res.status(403).json({ success: false, message: 'QR Code tidak valid untuk sekolah ini' });
  }

  const t = await sequelize.transaction();

  try {
    const isStudent = role === 'student';
    const idKey = isStudent ? 'studentId' : 'guruId';

    // 2. Cek apakah sudah absen hari ini
    const alreadyExists = await Attendance.findOne({
      where: { 
        [idKey]: id, 
        createdAt: { [Op.between]: [todayStart, todayEnd] } 
      },
      transaction: t,
      lock: true 
    });

    if (alreadyExists) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Anda sudah melakukan absensi hari ini.' });
    }

    // 3. Ambil data profil untuk log currentClass
    let userProfile;
    if (isStudent) {
      userProfile = await Student.findByPk(id);
    } else {
      userProfile = await GuruTendik.findByPk(id);
    }

    // 4. Buat record absensi
    const newAttendance = await Attendance.create({ 
      [idKey]: id,
      userRole: isStudent ? 'student' : 'teacher',
      schoolId: schoolId, 
      currentClass: isStudent ? userProfile.class : 'GURU/STAFF',
      status: 'Hadir'
    }, { transaction: t });

    await t.commit();

    res.json({ 
      success: true, 
      message: `Absensi Berhasil! Halo, ${isStudent ? userProfile.name : userProfile.nama}`,
      time: moment(newAttendance.createdAt).format("HH:mm:ss")
    });
  } catch (err) {
    if (t) await t.rollback();
    res.status(500).json({ success: false, message: err.message });
  }
};