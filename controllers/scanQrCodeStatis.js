const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const { Op } = require('sequelize');
const moment = require('moment');
const jwt = require('jsonwebtoken');
const GuruTendik = require('../models/guruTendik');
const sequelize = require('../config/database');
const SchoolProfile = require('../models/profileSekolah'); // Pastikan ini di-import
const redis = require('../config/redis'); // Pastikan path benar

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

    const redisKey = `absensi_check:${schoolId}:${id}:${moment().format('YYYY-MM-DD')}`;
    
    try {
        const isAlreadyScanned = await redis.get(redisKey);
        if (isAlreadyScanned) {
            return res.status(400).json({ success: false, message: 'Anda sudah absen hari ini.' });
        }
    } catch (redisError) {
        console.error("Redis Error:", redisError);
        // Lanjut saja ke DB jika Redis mati (failover)
    }

    const t = await sequelize.transaction();

    try {
        // --- 3. VALIDASI GEOFENCING (REVISED) ---
        let school = await redis.get(`school_profile:${schoolId}`);
        
        if (school) {
            try {
                school = JSON.parse(school);
            } catch (e) {
                console.error("Redis Parse Error:", e);
                school = null; // Paksa null agar di-fetch ulang dari DB di bawah
            }
        }

        // Ini memastikan jika Redis kosong ATAU JSON error, kita ambil dari DB.
        if (!school) {
            school = await SchoolProfile.findOne({ where: { schoolId } });
            if (school) {
                await redis.set(`school_profile:${schoolId}`, JSON.stringify(school), {
                    EX: 60 * 60 * 24 
                });
            }
        }

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
            transaction: t,
            lock: t.LOCK.UPDATE
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

        // 🔥 AMBIL SOCKET.IO
        const io = req.app.get('socketio');

        // 🔥 DATA YANG DIKIRIM KE TV
        const studentData = {
          id: userProfile.id,
          name: userProfile.name,
          class: userProfile.class,
          photo: userProfile.photoUrl,
          time: moment(newAttendance.createdAt).format("HH:mm:ss"),
        };

        // 🔥 KIRIM KE TV BERDASARKAN SCHOOL
        io.to(`school-${schoolId}`).emit('attendance:new', studentData);

        // SIMPAN KE REDIS SETELAH COMMIT BERHASIL
        // Beri TTL (Time to Live) misal 20 jam agar besok key ini otomatis hilang
        await redis.set(redisKey, 'true', {
            EX: 12 * 60 * 60 // 12 jam dalam detik
        });

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

// exports.scanSelfDoubleQr = async (req, res) => {
//     // 1. Ambil qrScanned DAN koordinat dari body
//     const { qrCodeData, userLat, userLon } = req.body; 

//     const profile = req.user?.profile || req.user; 
//     if (!profile) return res.status(401).json({ success: false, message: "Sesi tidak valid" });

//     const { id, role, schoolId } = profile;
//     const todayStart = moment().startOf('day').toDate();
//     const todayEnd = moment().endOf('day').toDate();

//     if (!qrCodeData || !schoolId) {
//       return res.status(400).json({
//         success: false,
//         message: "Data tidak lengkap"
//       });
//     }

//     // ✅ VALIDASI FORMAT + AMBIL POSITION SEKALIGUS
//     const regex = new RegExp(`^SCHOOL_QR_${schoolId}_(LEFT|RIGHT)$`);
//     const match = qrCodeData.match(regex);

//     if (!match) {
//       return res.status(403).json({
//         success: false,
//         message: "QR Code tidak valid"
//       });
//     }

//     // ✅ AMBIL POSITION DARI QR (BUKAN DARI CLIENT)
//     const qrPosition = match[1].toLowerCase(); // left / right

//     const redisKey = `absensi_check:${schoolId}:${id}:${moment().format('YYYY-MM-DD')}`;

//     const secondsUntilEndOfDay = moment().endOf('day').diff(moment(), 'seconds');
//     const lock = await redis.set(redisKey, 'true', {
//       NX: true,
//       EX: secondsUntilEndOfDay
//     });

//     if (!lock) {
//       return res.status(400).json({
//         success: false,
//         message: 'Anda sudah absen hari ini.'
//       });
//     }

//     const t = await sequelize.transaction();

//     try {
//         // --- 3. VALIDASI GEOFENCING (REVISED) ---
//         let school = await redis.get(`school_profile:${schoolId}`);
        
//         if (school) {
//             try {
//                 school = JSON.parse(school);
//             } catch (e) {
//                 console.error("Redis Parse Error:", e);
//                 school = null; // Paksa null agar di-fetch ulang dari DB di bawah
//             }
//         }

//         // Ini memastikan jika Redis kosong ATAU JSON error, kita ambil dari DB.
//         if (!school) {
//             school = await SchoolProfile.findOne({ where: { schoolId } });
//             if (school) {
//                 await redis.set(`school_profile:${schoolId}`, JSON.stringify(school), {
//                     EX: 60 * 60 * 24 
//                 });
//             }
//         }

//         if (school && school.latitude && school.longitude) {
//             if (userLat == null || userLon == null) {
//                 await t.rollback();
//                 return res.status(400).json({ success: false, message: 'Lokasi GPS diperlukan' });
//             }

//             const distance = getDistance(userLat, userLon, parseFloat(school.latitude), parseFloat(school.longitude));
//             const maxRadius = 200; // 200m

//             if (distance > maxRadius) {
//                 await t.rollback();
//                 return res.status(403).json({ 
//                     success: false, 
//                     message: `Anda di luar jangkauan (${Math.round(distance)}m). Maksimal ${maxRadius}m.` 
//                 });
//             }
//         }

//         const isStudent = role?.toLowerCase?.() === 'siswa' || role === 'student';
//         const idKey = isStudent ? 'studentId' : 'guruId';
//         const attendanceRole = isStudent ? 'student' : 'teacher';

//         // 4. Cek Duplikasi
//         const alreadyExists = await Attendance.findOne({
//             where: { 
//                 [idKey]: id, 
//                 createdAt: { [Op.between]: [todayStart, todayEnd] } 
//             },
//             transaction: t,
//             lock: t.LOCK.UPDATE
//         });

//         if (alreadyExists) {
//             await t.rollback();
//             return res.status(400).json({ success: false, message: 'Anda sudah absen hari ini.' });
//         }

//         // 5. Ambil Kelas & Create
//         let userProfile = isStudent ? await Student.findByPk(id, { transaction: t }) : await GuruTendik.findByPk(id, { transaction: t });
//         if (!userProfile) throw new Error("Profil tidak ditemukan");

//         const currentClassLabel = isStudent ? (userProfile.class || userProfile.kelas) : 'GURU/STAFF';

//         const newAttendance = await Attendance.create({ 
//             [idKey]: id,
//             userRole: attendanceRole,
//             schoolId: schoolId, 
//             currentClass: currentClassLabel,
//             status: 'Hadir',
//             latitude: userLat,
//             longitude: userLon
//         }, { transaction: t });
        
//         await t.commit();

//         // 🔥 AMBIL SOCKET.IO
//         const io = req.app.get('socketio');

//         // 🔥 DATA YANG DIKIRIM KE TV
//         const studentData = {
//           id: userProfile.id,
//           name: userProfile.name || userProfile.nama,
//           class: userProfile.class || userProfile.kelas,
//           photo: userProfile.photoUrl,
//           time: moment(newAttendance.createdAt).format("HH:mm:ss"),
//         };

//         io.to(`school-${schoolId}`).emit('attendance:new', {
//           student: studentData,
//           qrPosition: qrPosition
//         });

//         res.json({ success: true, message: `Absensi Berhasil!`, time: moment(newAttendance.createdAt).format("HH:mm:ss") });

//     } catch (err) {
//         if (t) await t.rollback();

//         // 🔥 RELEASE LOCK kalau gagal
//         await redis.del(redisKey);
        
//         console.error("DETAILED ERROR:", err);
//         res.status(500).json({ 
//             success: false, 
//             message: "Gagal memproses absensi", 
//             details: err.original?.sqlMessage || err.message 
//         });
//     }
// };


// DARI CLAUDE:

exports.scanSelfDoubleQr = async (req, res) => {
    const { qrCodeData, userLat, userLon } = req.body;
    const profile = req.user?.profile || req.user;
    if (!profile) return res.status(401).json({ success: false, message: "Sesi tidak valid" });

    const { id, role, schoolId } = profile;

    // --- 1. Validasi Awal ---
    if (!qrCodeData || !schoolId) 
        return res.status(400).json({ success: false, message: "Data tidak lengkap" });
    
    const regex = new RegExp(`^SCHOOL_QR_${schoolId}_(LEFT|RIGHT)$`);
    const match = qrCodeData.match(regex);
    if (!match) 
        return res.status(403).json({ success: false, message: "QR Code tidak valid" });
    const qrPosition = match[1].toLowerCase();

    // --- 2. Geofencing DULU (Zero DB, Pure CPU) ---
    // Ambil school dari Redis cache dulu
    let school = await redis.get(`school_profile:${schoolId}`);
    if (school) {
        school = JSON.parse(school);
    } else {
        school = await SchoolProfile.findOne({ where: { schoolId }, raw: true });
        if (school) await redis.set(`school_profile:${schoolId}`, JSON.stringify(school), { EX: 86400 });
    }

    if (school?.latitude && school?.longitude) {
        const distance = getDistance(userLat, userLon, parseFloat(school.latitude), parseFloat(school.longitude));
        if (distance > 200) {
            return res.status(403).json({ success: false, message: `Luar jangkauan (${Math.round(distance)}m)` });
        }
    }

    // --- 3. Redis Atomic Guard (SETELAH geofencing lolos) ---
    const today = moment().format('YYYY-MM-DD');
    const redisKey = `absensi_check:${schoolId}:${id}:${today}`;
    const secondsUntilEndOfDay = moment().endOf('day').diff(moment(), 'seconds');
    
    const lock = await redis.set(redisKey, 'true', { NX: true, EX: secondsUntilEndOfDay });
    if (!lock) 
        return res.status(400).json({ success: false, message: 'Anda sudah absen hari ini.' });

    try {
        const isStudent = role?.toLowerCase?.() === 'siswa' || role === 'student';
        const idKey = isStudent ? 'studentId' : 'guruId';

        // --- 4. Ambil Profil (Dengan Cache Redis) ---
        const profileCacheKey = `user_profile:${isStudent ? 'student' : 'guru'}:${id}`;
        let userProfile = await redis.get(profileCacheKey);
        
        if (userProfile) {
            userProfile = JSON.parse(userProfile);
        } else {
            userProfile = isStudent
            ? await Student.findByPk(id, { 
                // Model Student menggunakan 'name' dan 'class'
                attributes: ['id', 'name', 'class', 'photoUrl', 'nis'], 
                raw: true 
              })
            : await GuruTendik.findByPk(id, { 
                // Model GuruTendik menggunakan 'nama' (bukan name)
                attributes: ['id', 'nama', 'photoUrl', 'nip', 'role'], 
                raw: true 
              });
            if (!userProfile) {
                await redis.del(redisKey);
                return res.status(404).json({ success: false, message: "Profil tidak ditemukan" });
            }
            
            // Cache profil 1 jam
            await redis.set(profileCacheKey, JSON.stringify(userProfile), { EX: 3600 });
        }

        // --- 5. DB Write TANPA cek duplikasi (Redis sudah jadi guard) ---
        // Hapus findOne + LOCK.UPDATE → ini sumber bottleneck utama!
        const newAttendance = await Attendance.create({
            [idKey]: id,
            userRole: isStudent ? 'student' : 'teacher',
            schoolId,
            currentClass: isStudent ? (userProfile.class || userProfile.kelas) : 'GURU/STAFF',
            status: 'Hadir',
            latitude: userLat,
            longitude: userLon
        });
        // Tidak perlu transaksi karena Redis sudah guarantee 1x per user per hari

        // --- 6. Socket.io emit (fire and forget) ---
        setImmediate(() => {
            const io = req.app.get('socketio');
            io.to(`school-${schoolId}`).emit('attendance:new', {
                student: {
                    id: userProfile.id,
                    name: userProfile.name || userProfile.nama,
                    class: isStudent ? (userProfile.class || userProfile.kelas) : 'GURU/STAFF',
                    photo: userProfile.photoUrl,
                    time: moment(newAttendance.createdAt).format("HH:mm:ss"),
                },
                qrPosition
            });
        });

        return res.json({ success: true, message: `Absensi Berhasil!` });

    } catch (err) {
        // Rollback Redis lock agar bisa retry
        await redis.del(redisKey);
        console.error("ERROR:", err.message);
        res.status(500).json({ success: false, message: "Gagal memproses" });
    }
};


// STRESS-TEST

// exports.scanSelfDoubleQr = async (req, res) => {
//     const { qrCodeData, userLat, userLon } = req.body;
//     const profile = req.user;

//     if (!profile) return res.status(401).json({ success: false, message: "Sesi tidak valid" });

//     const { id, role, schoolId } = profile;

//     console.log({ userId: id, schoolId, qrCodeData });

//     if (!qrCodeData || !schoolId) 
//         return res.status(400).json({ success: false, message: "Data tidak lengkap" });

//     const regex = new RegExp(`^SCHOOL_QR_${schoolId}_(LEFT|RIGHT)$`);
//     const match = qrCodeData.match(regex);
//     if (!match) 
//         return res.status(403).json({ success: false, message: "QR Code tidak valid" });

//     const qrPosition = match[1].toLowerCase();

//     try {
//         // Redis lock untuk 1x absen/hari
//         const today = moment().format('YYYY-MM-DD');
//         const redisKey = `absensi_check:${schoolId}:${id}:${today}`;
//         const secondsUntilEndOfDay = moment().endOf('day').diff(moment(), 'seconds');

//         const lock = await redis.set(redisKey, 'true', { NX: true, EX: secondsUntilEndOfDay });
//         if (!lock) return res.status(400).json({ success: false, message: 'Anda sudah absen hari ini.' });

//         const isStudent = role?.toLowerCase() === 'student' || role?.toLowerCase() === 'siswa';
//         const idKey = isStudent ? 'studentId' : 'guruId';

//         // dummy profil sudah ada di req.user untuk stress test
//         const userProfile = profile;

//         // DB Write
//         await Attendance.create({
//             [idKey]: id,
//             userRole: isStudent ? 'student' : 'teacher',
//             schoolId,
//             currentClass: isStudent ? userProfile.class : 'GURU/STAFF',
//             status: 'Hadir',
//             latitude: userLat,
//             longitude: userLon
//         });

//         // Socket emit hanya kalau bukan stress test
//         if (process.env.STRESS_TEST.trim() !== 'true') {
//             setImmediate(() => {
//                 const io = req.app.get('socketio');
//                 io.to(`school-${schoolId}`).emit('attendance:new', {
//                     student: {
//                         id: userProfile.id,
//                         name: userProfile.name,
//                         class: isStudent ? userProfile.class : 'GURU/STAFF',
//                         photo: userProfile.photoUrl,
//                         time: moment().format("HH:mm:ss")
//                     },
//                     qrPosition
//                 });
//             });
//         }

//         return res.json({ success: true, message: `Absensi Berhasil!` });

//     } catch (err) {
//         // rollback Redis
//         await redis.del(`absensi_check:${schoolId}:${id}:${moment().format('YYYY-MM-DD')}`);
//         console.error("ERROR:", err.message);
//         return res.status(500).json({ success: false, message: "Gagal memproses" });
//     }
// };

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
    const userProfile = req.user.profile || req.user;
    
    if (userProfile.role === 'Siswa' || userProfile.role === 'siswa') {
      return res.status(403).json({ 
        success: false, 
        message: 'Akses Ditolak: siswa tidak diizinkan!' 
      });
    }

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