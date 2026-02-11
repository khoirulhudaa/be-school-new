const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const { Op } = require('sequelize');
const moment = require('moment');
const GuruTendik = require('../models/guruTendik');
const sequelize = require('../config/database');


exports.scanSelf = async (req, res) => {
  const { qrScanned } = req.body;
  
  // Ambil data dari req.user (Pastikan middleware JWT Anda sudah benar)
  const userData = req.user.profile || req.user; 
  const { id, role, schoolId } = userData;

  const todayStart = moment().startOf('day').toDate();
  const todayEnd = moment().endOf('day').toDate();

  // 1. Validasi QR Code
  if (!qrScanned.includes(`SCHOOL_QR_${schoolId}`)) {
    return res.status(403).json({ success: false, message: 'QR Code tidak valid untuk sekolah ini' });
  }

  const t = await sequelize.transaction();

  try {
    // Normalisasi Role: Cek apakah dia siswa (case-insensitive)
    const isStudent = role.toLowerCase() === 'siswa';
    const idKey = isStudent ? 'studentId' : 'guruId';
    const attendanceRole = isStudent ? 'student' : 'teacher'; // Simpan ke DB dengan enum yang ada

    // 2. Cek Duplikasi Absen Hari Ini
    const alreadyExists = await Attendance.findOne({
      where: { 
        [idKey]: id, 
        createdAt: { [Op.between]: [todayStart, todayEnd] } 
      },
      transaction: t
    });

    if (alreadyExists) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'Anda sudah melakukan absensi hari ini.' });
    }

    // 3. Ambil Data Profil & Simpan Absensi
    let userProfile;
    let currentClassLabel;

    if (isStudent) {
      userProfile = await Student.findByPk(id, { transaction: t });
      currentClassLabel = userProfile?.class || userProfile?.kelas || 'N/A';
    } else {
      userProfile = await GuruTendik.findByPk(id, { transaction: t });
      currentClassLabel = 'GURU/STAFF';
    }

    if (!userProfile) {
      throw new Error(`Data ${role} tidak ditemukan di database`);
    }

    const newAttendance = await Attendance.create({ 
      id,
      userRole: attendanceRole,
      schoolId: schoolId, 
      currentClass: currentClassLabel,
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
    console.error("Internal Error Detail:", err); // Cek terminal backend Anda
    res.status(500).json({ success: false, message: "Server error", details: err.message });
  }
};