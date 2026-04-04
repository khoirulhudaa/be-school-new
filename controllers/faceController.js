const Student     = require('../models/siswa');
const redis       = require('../config/redis');
const moment      = require('moment');
const attendanceQueue = require('../queues/attendanceQueue');
const SchoolProfile   = require('../models/profileSekolah');

// Helper Haversine (sama seperti di scanQr)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── 1. ENROLLMENT ──────────────────────────────────────────────────────────
exports.enrollFace = async (req, res) => {
    try {
        const { descriptor } = req.body; // Float32Array as plain array (128 numbers)
        const profile = req.user?.profile || req.user;

        if (!profile) return res.status(401).json({ success: false, message: 'Sesi tidak valid' });
        if (profile.role !== 'siswa' && profile.role !== 'student') {
            return res.status(403).json({ success: false, message: 'Hanya siswa yang bisa enroll wajah' });
        }
        if (!descriptor || descriptor.length !== 128) {
            return res.status(400).json({ success: false, message: 'Descriptor wajah tidak valid' });
        }

        await Student.update(
            {
                faceDescriptor: JSON.stringify(descriptor),
                faceEnrolledAt: new Date(),
            },
            { where: { id: profile.id } }
        );

        // Hapus cache profile agar descriptor terbaru terbaca
        await redis.del(`user_profile:student:${profile.id}`).catch(() => {});

        return res.json({ success: true, message: 'Wajah berhasil didaftarkan!' });
    } catch (err) {
        console.error('[ENROLL FACE]', err.message);
        res.status(500).json({ success: false, message: 'Gagal mendaftarkan wajah' });
    }
};

// ── 2. GET DESCRIPTOR ──────────────────────────────────────────────────────
exports.getDescriptor = async (req, res) => {
    try {
        const profile = req.user?.profile || req.user;
        if (!profile) return res.status(401).json({ success: false, message: 'Sesi tidak valid' });

        const student = await Student.findByPk(profile.id, {
            attributes: ['faceDescriptor', 'faceEnrolledAt']
        });

        if (!student?.faceDescriptor) {
            return res.json({ success: true, enrolled: false });
        }

        return res.json({
            success:     true,
            enrolled:    true,
            descriptor:  JSON.parse(student.faceDescriptor),
            enrolledAt:  student.faceEnrolledAt,
        });
    } catch (err) {
        console.error('[GET DESCRIPTOR]', err.message);
        res.status(500).json({ success: false, message: 'Gagal ambil data wajah' });
    }
};

// ── 3. ABSENSI VIA WAJAH ──────────────────────────────────────────────────
exports.faceAbsen = async (req, res) => {
    const { userLat, userLon, faceDistance } = req.body;
    const profile = req.user?.profile || req.user;

    if (!profile) return res.status(401).json({ success: false, message: 'Sesi tidak valid' });

    const { id, role, schoolId } = profile;

    // Validasi faceDistance dari client
    if (!faceDistance || faceDistance > 0.45) {
        return res.status(400).json({ success: false, message: 'Verifikasi wajah gagal' });
    }

    // ── Redis check sudah absen ────────────────────────────────────────────
    const today    = moment().format('YYYY-MM-DD');
    const checkKey = `absensi_check:${schoolId}:${id}:${today}`;
    const lockKey  = `absensi_lock:${schoolId}:${id}:${today}`;
    const secondsUntilEndOfDay = moment().endOf('day').diff(moment(), 'seconds');

    const alreadyAbsen = await redis.get(checkKey);
    if (alreadyAbsen) {
        return res.status(400).json({ success: false, message: 'Anda sudah absen hari ini.' });
    }

    // ── Redis lock ─────────────────────────────────────────────────────────
    const lockToken = `lock-${id}-${Date.now()}`;
    let acquired = await redis.set(lockKey, lockToken, 'NX', 'PX', 30000);
    if (!acquired) {
        await new Promise(r => setTimeout(r, 800));
        acquired = await redis.set(lockKey, lockToken, 'NX', 'PX', 30000);
    }
    if (!acquired) {
        return res.status(429).json({ success: false, message: 'Sedang diproses, coba lagi.' });
    }

    try {
        // ── Geofencing ────────────────────────────────────────────────────
        let school = await redis.get(`school_profile:${schoolId}`);
        school = school ? JSON.parse(school) : await SchoolProfile.findOne({ where: { schoolId }, raw: true });

        if (school?.latitude && school?.longitude) {
            const distance = getDistance(userLat, userLon, parseFloat(school.latitude), parseFloat(school.longitude));
            if (distance > 200) {
                await redis.del(lockKey);
                return res.status(403).json({ success: false, message: `Luar jangkauan (${Math.round(distance)}m)` });
            }
        }

        // ── Ambil profil siswa ────────────────────────────────────────────
        const profileCacheKey = `user_profile:student:${id}`;
        let userProfile = await redis.get(profileCacheKey);
        userProfile = userProfile ? JSON.parse(userProfile) : await Student.findByPk(id, {
            attributes: ['id', 'name', 'class', 'photoUrl', 'nis'],
            raw: true
        });

        if (!userProfile) {
            await redis.del(lockKey);
            return res.status(404).json({ success: false, message: 'Profil tidak ditemukan' });
        }

        // Cache profil
        if (!await redis.get(profileCacheKey)) {
            await redis.set(profileCacheKey, JSON.stringify(userProfile), 'EX', 3600);
        }

        // ── Masukkan ke queue (sama seperti double-qr) ────────────────────
        await attendanceQueue.add('create-attendance', {
            id,
            schoolId,
            userRole:     'student',
            studentId:    id,
            guruId:       null,
            currentClass: userProfile.class || 'Unknown',
            latitude:     userLat,
            longitude:    userLon,
            qrPosition:   'face', // ← penanda absen via wajah
            faceDistance,
        }, {
            attempts: 3,
            backoff:  3000,
            jobId:    `${schoolId}-${id}-${today}-face`,
            removeOnComplete: true,
            removeOnFail:     false,
        });

        // ── Socket emit ke TV ─────────────────────────────────────────────
        setImmediate(() => {
            try {
                const io = req.app.get('socketio');
                if (io) {
                    io.to(`school-${schoolId}`).emit('attendance:new', {
                        student: {
                            id:    userProfile.id,
                            name:  userProfile.name,
                            class: userProfile.class,
                            photo: userProfile.photoUrl,
                            time:  moment().format('HH:mm:ss'),
                        },
                        qrPosition: 'face',
                    });
                }
            } catch (e) {
                console.warn('[SOCKET WARN face]', e.message);
            }
        });

        await redis.set(checkKey, '1', 'EX', secondsUntilEndOfDay);

        return res.json({ success: true, message: 'Absensi wajah berhasil!' });

    } catch (err) {
        console.error('[FACE ABSEN]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memproses absensi' });
    } finally {
        await redis.del(lockKey).catch(() => {});
    }
};