const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const { Op } = require('sequelize');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const GuruTendik = require('../models/guruTendik');
const sequelize = require('../config/database');
const SchoolProfile = require('../models/profileSekolah'); // Pastikan ini di-import

// Fungsi Helper Haversine
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

exports.scanSelf = async (req, res) => {
    // 1. Ambil qrScanned DAN koordinat dari body
    const { qrCodeData, userLat, userLon } = req.body; // Ganti qrScanned jadi qrCodeData

    const profile = req.user?.profile || req.user; 
    if (!profile) return res.status(401).json({ success: false, message: "Sesi tidak valid" });

    const { id, role, schoolId } = profile;
    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();

    // 2. Validasi QR Code Sekolah
    if (!qrCodeData.includes(`SCHOOL_QR_${schoolId}`)) {
        return res.status(403).json({ success: false, message: `QR Code tidak valid untuk sekolah ini.` });
    }

    const t = await sequelize.transaction();

    try {
        // 3. VALIDASI GEOFENCING
        const school = await SchoolProfile.findOne({ where: { schoolId } });
        if (school && school.latitude && school.longitude) {
            if (!userLat || !userLon) {
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Lokasi GPS diperlukan' });
            }

            const distance = getDistance(userLat, userLon, parseFloat(school.latitude), parseFloat(school.longitude));
            const maxRadius = 200; // 200m

            if (distance > maxRadius) {
                await t.rollback();
                return res.status(403).json({ 
                    success: false, 
                    message: `Anda di luar jangkauan (${Math.round(distance)}m). Maksimal ${maxRadius}m.` 
                });
            }
        }

        const isStudent = role.toLowerCase() === 'siswa' || role === 'student';
        const idKey = isStudent ? 'studentId' : 'guruId';
        const attendanceRole = isStudent ? 'student' : 'teacher';

        // 4. Cek Duplikasi
        const alreadyExists = await Attendance.findOne({
            where: { 
                [idKey]: id, 
                createdAt: { [Op.between]: [todayStart, todayEnd] } 
            },
            transaction: t
        });

        if (alreadyExists) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Anda sudah absen hari ini.' });
        }

        // 5. Ambil Kelas & Create
        let userProfile = isStudent ? await Student.findByPk(id, { transaction: t }) : await GuruTendik.findByPk(id, { transaction: t });
        if (!userProfile) throw new Error("Profil tidak ditemukan");

        const currentClassLabel = isStudent ? (userProfile.class || userProfile.kelas) : 'GURU/STAFF';

        const newAttendance = await Attendance.create({ 
            [idKey]: id,
            userRole: attendanceRole,
            schoolId: schoolId, 
            currentClass: currentClassLabel,
            status: 'Hadir',
            latitude: userLat,
            longitude: userLon
        }, { transaction: t });

        await t.commit();
        res.json({ success: true, message: `Absensi Berhasil!`, time: moment(newAttendance.createdAt).format("HH:mm:ss") });

    } catch (err) {
        if (t) await t.rollback();
        console.error("DETAILED ERROR:", err);
        res.status(500).json({ 
            success: false, 
            message: "Gagal memproses absensi", 
            details: err.original?.sqlMessage || err.message 
        });
    }
};

exports.loginWithQR = async (req, res) => {
  try {
    const { qrCodeData, role: requestedRole } = req.body; // role opsional: 'siswa' atau 'guru'

    if (!qrCodeData) {
      return res.status(400).json({ success: false, message: 'QR Code data diperlukan' });
    }

    let user = null;
    let finalRole = null;
    let profile = null;

    // 1. Coba cari di tabel Siswa dulu
    user = await Student.findOne({
      where: { 
        qrCodeData, 
        isActive: true 
      }
    });

    if (user) {
      finalRole = 'siswa';
      profile = user.toJSON();
      profile.role = 'siswa';
      
      // Ambil info sekolah (sama seperti login biasa)
      const school = await SchoolProfile.findOne({
        where: { schoolId: user.schoolId },
        attributes: ['logoUrl', 'latitude', 'longitude']
      });
      
      if (school) {
        profile.schoolLogo = school.logoUrl;
        profile.schoolLocation = {
          lat: school.latitude,
          lng: school.longitude,
          radiusMeter: 200
        };
      }
    } 
    // 2. Jika bukan siswa, coba cari di GuruTendik
    else {
      user = await GuruTendik.findOne({
        where: { 
          qrCodeData, 
          isActive: true 
        }
      });

      if (user) {
        finalRole = 'guru';
        profile = user.toJSON();
        profile.role = 'guru';
        profile.name = user.nama; // alias supaya seragam
        
        // Ambil logo sekolah
        const school = await SchoolProfile.findOne({
          where: { schoolId: user.schoolId },
          attributes: ['logoUrl']
        });
        if (school) profile.schoolLogo = school.logoUrl;
      }
    }

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'QR Code tidak valid atau akun tidak aktif.' 
      });
    }

    // Hapus field sensitif
    delete profile.password;
    delete profile.createdAt;
    delete profile.updatedAt;

    // Generate JWT (sama seperti login biasa)
    const token = jwt.sign(
      { profile },
      process.env.JWT_SECRET || 'secret_key_anda',
      { expiresIn: '1d' }
    );

    res.json({ 
      success: true, 
      token, 
      data: profile,
      role: finalRole 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.loginWithQRNew = async (req, res) => {
  try {
    const { qrCodeData } = req.body; // Ini adalah sessionId (UUID) dari layar Perpus
    
    // req.user biasanya diisi oleh middleware verifyToken Anda
    // Pastikan strukturnya sama dengan format login manual (data: profile)
    const userProfile = req.user.profile; 

    if (!qrCodeData) {
      return res.status(400).json({ success: false, message: 'Session ID diperlukan' });
    }

    // 1. Ambil instance io yang tadi kita simpan di app.set
    const io = req.app.get('socketio');

    // 2. Kirim data login ke Web Perpus yang sedang menunggu di room 'qrCodeData'
    // Format payload disesuaikan dengan kebutuhan Vokadash (token & user)
    io.to(qrCodeData).emit('login-success', {
      token: req.headers.authorization.split(' ')[1], // Meneruskan token aktif HP
      user: userProfile // Data profile lengkap siswa/guru
    });

    console.log('[profile user]', userProfile)

    return res.json({ 
      success: true, 
      message: 'Autentikasi berhasil dikirim ke perangkat tujuan.' 
    });

  } catch (err) {
    console.error("Socket Emit Error:", err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// KHUSUS UNTUK TESTING (TANPA GEOFICIING LOKASI)

// const Student = require('../models/siswa');
// const Attendance = require('../models/kehadiran');
// const { Op } = require('sequelize');
// const moment = require('moment');
// const GuruTendik = require('../models/guruTendik');
// const sequelize = require('../config/database');

// exports.scanSelf = async (req, res) => {
//     const { qrCodeData, userLat, userLon } = req.body;

//     const profile = req.user?.profile || req.user; 
//     if (!profile) return res.status(401).json({ success: false, message: "Sesi tidak valid" });

//     const { id, role, schoolId } = profile;
//     const todayStart = moment().startOf('day').toDate();
//     const todayEnd = moment().endOf('day').toDate();

//     // 1. Validasi QR Code Sekolah (Tetap wajib agar QR luar tidak bisa masuk)
//     if (!qrCodeData || !qrCodeData.includes(`SCHOOL_QR_${schoolId}`)) {
//         return res.status(403).json({ success: false, message: `QR Code tidak valid untuk sekolah ini.` });
//     }

//     const t = await sequelize.transaction();

//     try {
//         /* 2. VALIDASI GEOFENCING DINONAKTIFKAN 
//            Kita tidak lagi menghitung distance atau mengecek maxRadius.
//            Absensi diizinkan dari koordinat manapun.
//         */

//         const isStudent = role.toLowerCase() === 'siswa' || role === 'student';
//         const idKey = isStudent ? 'studentId' : 'guruId';
//         const attendanceRole = isStudent ? 'student' : 'teacher';

//         // 3. Cek Duplikasi
//         const alreadyExists = await Attendance.findOne({
//             where: { 
//                 [idKey]: id, 
//                 createdAt: { [Op.between]: [todayStart, todayEnd] } 
//             },
//             transaction: t
//         });

//         if (alreadyExists) {
//             await t.rollback();
//             return res.status(400).json({ success: false, message: 'Anda sudah absen hari ini.' });
//         }

//         // 4. Ambil Profil User
//         let userProfile = isStudent 
//             ? await Student.findByPk(id, { transaction: t }) 
//             : await GuruTendik.findByPk(id, { transaction: t });
            
//         if (!userProfile) throw new Error("Profil tidak ditemukan");

//         const currentClassLabel = isStudent ? (userProfile.class || userProfile.kelas) : 'GURU/STAFF';

//         // 5. Simpan Data Absensi (Koordinat tetap disimpan jika ada untuk arsip)
//         const newAttendance = await Attendance.create({ 
//             [idKey]: id,
//             userRole: attendanceRole,
//             schoolId: schoolId, 
//             currentClass: currentClassLabel,
//             status: 'Hadir',
//             latitude: userLat || null,
//             longitude: userLon || null
//         }, { transaction: t });

//         await t.commit();
//         res.json({ 
//             success: true, 
//             message: `Absensi Berhasil!`, 
//             time: moment(newAttendance.createdAt).format("HH:mm:ss") 
//         });

//     } catch (err) {
//         if (t) await t.rollback();
//         console.error("DETAILED ERROR:", err);
//         res.status(500).json({ 
//             success: false, 
//             message: "Gagal memproses absensi", 
//             details: err.original?.sqlMessage || err.message 
//         });
//     }
// };