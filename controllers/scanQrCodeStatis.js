// const Student = require('../models/siswa');
// const Attendance = require('../models/kehadiran');
// const { Op } = require('sequelize');
// const moment = require('moment');
// const GuruTendik = require('../models/guruTendik');
// const sequelize = require('../config/database');


// exports.scanSelf = async (req, res) => {
//   const { qrScanned } = req.body;
  
//   const profile = req.user?.profile || req.user; 
  
//   if (!profile) {
//     return res.status(401).json({ success: false, message: "Sesi tidak valid" });
//   }

//   const { id, role, schoolId } = profile;

//   console.log('req.user?.profile', req.user?.profile)

//   const todayStart = moment().startOf('day').toDate();
//   const todayEnd = moment().endOf('day').toDate();

//   // 1. Validasi QR Code
//   if (!qrScanned.includes(`SCHOOL_QR_${schoolId}`)) {
//     return res.status(403).json({ success: false, message: `QR Code ${qrScanned} tidak valid untuk sekolah ini ID: ${schoolId}` });
//   }

//   const t = await sequelize.transaction();

//   try {
//     // Normalisasi Role: Cek apakah dia siswa (case-insensitive)
//     const isStudent = role.toLowerCase() === 'siswa';
//     const idKey = isStudent ? 'studentId' : 'guruId';
//     const attendanceRole = isStudent ? 'student' : 'teacher'; // Simpan ke DB dengan enum yang ada

//     // 2. Cek Duplikasi Absen Hari Ini
//     const alreadyExists = await Attendance.findOne({
//       where: { 
//         [idKey]: id, 
//         createdAt: { [Op.between]: [todayStart, todayEnd] } 
//       },
//       transaction: t
//     });

//     if (alreadyExists) {
//       await t.rollback();
//       return res.status(400).json({ success: false, message: 'Anda sudah melakukan absensi hari ini.' });
//     }

//     // 3. Ambil Data Profil & Simpan Absensi
//     let userProfile;
//     let currentClassLabel;

//     if (isStudent) {
//       userProfile = await Student.findByPk(id, { transaction: t });
//       currentClassLabel = userProfile?.class || userProfile?.kelas || 'N/A';
//     } else {
//       userProfile = await GuruTendik.findByPk(id, { transaction: t });
//       currentClassLabel = 'GURU/STAFF';
//     }

//     if (!userProfile) {
//       throw new Error(`Data ${role} tidak ditemukan di database`);
//     }

//     const newAttendance = await Attendance.create({ 
//       [idKey]: id,
//       userRole: attendanceRole,
//       schoolId: schoolId, 
//       currentClass: currentClassLabel,
//       status: 'Hadir'
//     }, { transaction: t });

//     await t.commit();

//     res.json({ 
//       success: true, 
//       message: `Absensi Anda Berhasil!`,
//       time: moment(newAttendance.createdAt).format("HH:mm:ss")
//     });

//   } catch (err) {
//     if (t) await t.rollback();
//       // Tampilkan stack trace lengkap di terminal server
//       console.error("===== DATABASE ERROR START =====");
//       console.error(err); 
//       console.error("===== DATABASE ERROR END =====");

//       // Kirim detail asli ke client untuk mempermudah debugging saat ini
//       res.status(500).json({ 
//         success: false, 
//         message: "Server database error", 
//         details: err.original?.sqlMessage || err.message // Menampilkan pesan asli MySQL/Postgres
//       });
//   }
// };



const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const { Op } = require('sequelize');
const moment = require('moment');
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
            const maxRadius = school.radiusMeter || 100; // Ambil dari DB atau default 100m

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