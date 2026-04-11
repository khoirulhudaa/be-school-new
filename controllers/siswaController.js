const Student = require('../models/siswa');
const Attendance = require('../models/kehadiran');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { fn, col, Op, literal, where: sequelizeWhere } = require('sequelize');
const moment = require('moment');
const ExcelJS = require('exceljs');
const GuruTendik = require('../models/guruTendik');
const sequelize = require('../config/database');
const jwt = require('jsonwebtoken');
const Alumni = require('../models/alumni');
const Parent = require('../models/orangTua');
const bcrypt = require('bcrypt');
const SchoolProfile = require('../models/profileSekolah');
const KehadiranGuru = require('../models/kehadiranGuru');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// === REDIS + INVALIDATE CACHE ===
const redisClient = require('../config/redis');

const invalidateStudentCache = async (schoolId) => {
  if (!schoolId) return;
  try {
    const pattern = `cache:/siswa*schoolId=${schoolId}*`;
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(...keys); // Spread karena ioredis
      console.log(`✅ Cache invalidated: ${keys.length} keys for schoolId ${schoolId}`);
    }
  } catch (err) {
    console.error('❌ Invalidate cache error:', err.message);
  }
};

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
    const { qrCodeData, rfidUid, schoolId } = req.query;

    let user = null;
    let role = null;


    if (!qrCodeData || !schoolId) {
      return res.status(400).json({ success: false, message: "QR Data dan SchoolId diperlukan." });
    }

    // PRIORITAS RFID
    if (rfidUid) {
      user = await Student.findOne({ 
        where: { rfidUid, schoolId: parseInt(schoolId), isActive: true },
        attributes: ['id', 'name', 'class', 'schoolId', 'nis', 'nisn', 'gender']
      });
      role = 'student';

      if (!user) {
        user = await GuruTendik.findOne({ 
          where: { rfidUid, schoolId: parseInt(schoolId), isActive: true },
          attributes: ['id', ['nama', 'name'], 'role', 'schoolId', 'nip']
        });
        role = 'teacher';
      }
    }

    // FALLBACK QR
    if (!user && qrCodeData) {
      user = await Student.findOne({ 
        where: { qrCodeData, schoolId: parseInt(schoolId), isActive: true }
      });
      role = 'student';
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "Kartu tidak dikenali." });
    }

    res.json({ success: true, user, role });

    // // 1. Cari di tabel Student
    // let user = await Student.findOne({ 
    //   where: { qrCodeData, schoolId: parseInt(schoolId), isActive: true },
    //   attributes: ['id', 'name', 'class', 'schoolId', 'nis', 'nisn', 'gender'] // Ambil yang perlu saja
    // });
    // let role = 'student';

    // // 2. Jika tidak ada di Student, cari di GuruTendik
    // if (!user) {
    //   user = await GuruTendik.findOne({ 
    //     where: { qrCodeData, schoolId: parseInt(schoolId), isActive: true },
    //     attributes: ['id', ['nama', 'name'], 'role', 'schoolId', 'nip', 'jenisKelamin', 'jurusan', 'email'] // Aliasing 'nama' jadi 'name' agar seragam
    //   });
    //   role = 'teacher';
    // }

    // if (!user) {
    //   return res.status(404).json({ success: false, message: "Kartu tidak dikenali atau tidak aktif." });
    // }

    // // Kirim data user ke Server Perpus
    // res.json({ 
    //   success: true, 
    //   user, 
    //   role 
    // });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.checkStudentAuth = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Cari siswa berdasarkan email
    const student = await Student.findOne({ 
      where: { email, isActive: true } 
    });

    // 2. Jika email tidak ketemu
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Email siswa tidak ditemukan.' 
      });
    }

    // 3. Verifikasi Password (Bcrypt)
    // Jika data lama belum ada password, kita berikan pesan khusus
    if (!student.password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Akun belum diaktivasi. Hubungi Admin.' 
      });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Password yang Anda masukkan salah.' 
      });
    }

    // 4. Ambil data sekolah untuk lokasi/geofencing
    const school = await SchoolProfile.findOne({
      where: { schoolId: student.schoolId }
    });
    
    // 5. Susun Profile (Hapus data sensitif)
    const profile = student.toJSON();
    profile.role = 'siswa';
    delete profile.password;
    delete profile.createdAt;
    delete profile.updatedAt;

    profile.schoolLocation = {
      lat: school ? school.latitude : null,
      lng: school ? school.longitude : null,
      radiusMeter: 200
    };

    // 6. Generate JWT
    const token = jwt.sign(
      { profile },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
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

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, nis, nisn, gender, birthPlace, birthDate, nik, 
      isActive, class: className, batch, 
      email, password, rfidUid // Tambahkan ini
    } = req.body;

    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan' });
    }

    // --- 1. VALIDASI DUPLIKAT ---

    if (rfidUid && rfidUid !== student.rfidUid) {
      const existingRfid = await Student.findOne({
        where: { rfidUid, id: { [Op.ne]: id } }
      });

      if (existingRfid) {
        return res.status(400).json({
          success: false,
          message: `RFID sudah digunakan oleh siswa lain`
        });
      }
    }
    
    // Cek NIS (Unik per Sekolah)
    if (nis && nis !== student.nis) {
      const existingNis = await Student.findOne({
        where: { schoolId: student.schoolId, nis: nis, id: { [Op.ne]: id } }
      });
      if (existingNis) return res.status(400).json({ success: false, message: `NIS ${nis} sudah terdaftar.` });
    }

    // Cek NISN (Unik Global)
    if (nisn && nisn !== student.nisn) {
      const existingNisn = await Student.findOne({
        where: { nisn: nisn, id: { [Op.ne]: id } }
      });
      if (existingNisn) return res.status(400).json({ success: false, message: `NISN ${nisn} sudah terdaftar.` });
    }

    // Cek Email (Unik Global) - TAMBAHAN
    if (email && email !== student.email) {
      const existingEmail = await Student.findOne({
        where: { email: email, id: { [Op.ne]: id } }
      });
      if (existingEmail) {
        return res.status(400).json({ 
          success: false, 
          message: `Email ${email} sudah digunakan oleh pengguna lain.` 
        });
      }
    }

    // --- 2. PROSES DATA TAMBAHAN ---
    
    // Foto
    let photoUrl = student.photoUrl;
    if (req.file) {
      photoUrl = await processPhotoUpload(req.file.buffer, student.schoolId, nis || student.nis);
    }

    // Hash Password jika ada perubahan - TAMBAHAN
    let updatedData = {
      name, nis, nisn, gender, birthPlace, birthDate, nik, isActive, 
      class: className, batch, photoUrl, email, rfidUid
    };

    if (password && password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      updatedData.password = await bcrypt.hash(password, salt);
    }

    // --- 3. EKSEKUSI UPDATE ---
    await student.update(updatedData);

    // Hilangkan password dari response agar aman
    const responseData = student.toJSON();
    responseData.role = 'siswa';
    delete responseData.password;

    await invalidateStudentCache(student.schoolId);

    res.json({ success: true, message: 'Data siswa diperbarui', data: responseData });

  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Gagal update: Email, NIS, atau NISN sudah digunakan.' 
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const { 
      name, nis, nisn, gender, birthPlace, birthDate, nik, 
      schoolId, class: className, batch, 
      email, password, rfidUid // Ambil email & password dari req.body
    } = req.body;

    if (!name || !nis || !schoolId) {
      return res.status(400).json({ success: false, message: 'Name, NIS, dan SchoolId wajib diisi!' });
    }

    if (rfidUid && rfidUid.length < 5) {
      return res.status(400).json({
        success: false,
        message: "RFID tidak valid"
      });
    }

    if (rfidUid) {
      const existingRfid = await Student.findOne({
        where: { rfidUid, schoolId }
      });

      if (existingRfid) {
        return res.status(400).json({
          success: false,
          message: `RFID sudah digunakan`
        });
      }
    }

    const existing = await Student.findOne({ where: { nis, schoolId } });
    if (existing) {
      return res.status(400).json({ success: false, message: `NIS ${nis} sudah terdaftar` });
    }

    // --- Logika Default Email & Password ---
    const finalEmail = email || `${nis}@gmail.com`;
    const rawPassword = password || 'sekolah123';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    // ---------------------------------------

    let photoUrl = null;
    if (req.file) {
      photoUrl = await processPhotoUpload(req.file.buffer, schoolId, nis);
    }

    const newStudent = await Student.create({
      name, 
      nis, 
      nisn, 
      gender, 
      birthPlace, 
      birthDate, 
      nik, 
      rfidUid,
      schoolId: parseInt(schoolId),
      email: finalEmail,      
      password: hashedPassword, 
      photoUrl,
      class: className, 
      batch,
      qrCodeData: `QR-${nis}-${Date.now()}`
    });

    await invalidateStudentCache(parseInt(req.body.schoolId));   // ← TAMBAHAN
    res.json({ success: true, data: newStudent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// exports.bulkCreateStudents = async (req, res) => {
//   try {
//     const { students, schoolId } = req.body;

//     if (!schoolId || !Array.isArray(students) || students.length === 0) {
//       return res.status(400).json({ success: false, message: 'Data tidak valid' });
//     }

//     const nisList = students.map(s => s.nis).filter(Boolean);

//     // Cek semua NIS sekaligus dalam 1 query
//     const existingStudents = await Student.findAll({
//       where: { nis: { [Op.in]: nisList }, schoolId: parseInt(schoolId) },
//       attributes: ['nis', 'name'],
//       raw: true
//     });

//     // Cek RFID duplikat sekaligus
//     const rfidList = students.map(s => s.rfidUid).filter(Boolean);
//     const existingRfids = rfidList.length > 0 ? await Student.findAll({
//       where: { rfidUid: { [Op.in]: rfidList } },
//       attributes: ['rfidUid', 'name'],
//       raw: true
//     }) : [];

//     const duplicateNis = existingStudents.map(s => ({ nis: s.nis, name: s.name }));
//     const duplicateRfid = existingRfids.map(s => ({ rfidUid: s.rfidUid, name: s.name }));

//     // Filter data yang bisa diproses
//     const existingNisSet = new Set(existingStudents.map(s => s.nis));
//     const existingRfidSet = new Set(existingRfids.map(s => s.rfidUid));
    
//     const validStudents = students.filter(s => 
//       !existingNisSet.has(s.nis) && 
//       (!s.rfidUid || !existingRfidSet.has(s.rfidUid))
//     );

//     // Proses yang valid
//     const created = [];
//     const failed = [];

//     for (const s of validStudents) {
//       try {
//         const finalEmail = s.email || `${s.nis}@gmail.com`;
//         const hashedPassword = await bcrypt.hash(s.password || 'sekolah123', 10);
        
//         let photoUrl = null;
        
//         const student = await Student.create({
//           name: s.name,
//           nis: s.nis,
//           nisn: s.nisn,
//           gender: s.gender,
//           birthPlace: s.birthPlace,
//           birthDate: s.birthDate,
//           nik: s.nik,
//           rfidUid: s.rfidUid || null,
//           schoolId: parseInt(schoolId),
//           email: finalEmail,
//           password: hashedPassword,
//           photoUrl,
//           class: s.class,
//           batch: s.batch,
//           qrCodeData: `QR-${s.nis}-${Date.now()}`
//         });

//         created.push({ nis: s.nis, name: s.name });
//       } catch (err) {
//         let reason = err.message; // default

//         if (err.name === 'SequelizeUniqueConstraintError') {
//           const fields = err.errors?.map(e => `${e.path} = "${e.value}"`).join(', ');
//           reason = `Duplikat pada: ${fields}`;
//         } else if (err.name === 'SequelizeValidationError') {
//           const fields = err.errors?.map(e => `${e.path}: ${e.message}`).join('; ');
//           reason = `Validasi gagal — ${fields}`;
//         } else if (err.name === 'SequelizeDatabaseError') {
//           reason = `Database error: ${err.original?.sqlMessage || err.message}`;
//         }

//         failed.push({ nis: s.nis, name: s.name, reason });
//       }
//     }

//     await invalidateStudentCache(parseInt(schoolId));

//     return res.json({
//       success: true,
//       summary: {
//         total: students.length,
//         berhasil: created.length,
//         dilewati: duplicateNis.length + duplicateRfid.length,
//         gagal: failed.length,
//       },
//       detail: {
//         berhasil: created,
//         nisDuplikat: duplicateNis,      // [{nis, name}] — sudah ada di DB
//         rfidDuplikat: duplicateRfid,    // [{rfidUid, name}]
//         gagal: failed                   // [{nis, name, reason}]
//       }
//     });

//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.bulkCreateStudents = async (req, res) => {
  try {
    const { students, schoolId } = req.body;

    if (!schoolId || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'Data tidak valid' });
    }

    const sId = parseInt(schoolId);
    const nisList  = students.map(s => s.nis).filter(Boolean);
    const rfidList = students.map(s => s.rfidUid).filter(Boolean);

    // ✅ Semua pre-check jalan paralel sekaligus
    const [existingStudents, existingRfids] = await Promise.all([
      Student.findAll({
        where: { nis: { [Op.in]: nisList }, schoolId: sId },
        attributes: ['nis', 'name'],
        raw: true
      }),
      rfidList.length > 0
        ? Student.findAll({
            where: { rfidUid: { [Op.in]: rfidList } },
            attributes: ['rfidUid', 'name'],
            raw: true
          })
        : Promise.resolve([])
    ]);

    const existingNisSet  = new Set(existingStudents.map(s => s.nis));
    const existingRfidSet = new Set(existingRfids.map(s => s.rfidUid));

    const duplicateNis  = existingStudents.map(s => ({ nis: s.nis, name: s.name }));
    const duplicateRfid = existingRfids.map(s => ({ rfidUid: s.rfidUid, name: s.name }));

    const validStudents = students.filter(s =>
      !existingNisSet.has(s.nis) &&
      (!s.rfidUid || !existingRfidSet.has(s.rfidUid))
    );

    if (validStudents.length === 0) {
      return res.json({
        success: true,
        summary: { total: students.length, berhasil: 0, dilewati: duplicateNis.length + duplicateRfid.length, gagal: 0 },
        detail: { berhasil: [], nisDuplikat: duplicateNis, rfidDuplikat: duplicateRfid, gagal: [] }
      });
    }

    // ✅ Bcrypt paralel dengan concurrency limit (jangan semua 1000 sekaligus)
    const BCRYPT_CONCURRENCY = 10;
    const preparedStudents = [];
    const failed = [];

    for (let i = 0; i < validStudents.length; i += BCRYPT_CONCURRENCY) {
      const chunk = validStudents.slice(i, i + BCRYPT_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (s) => {
          const rawEmail   = s.email?.trim();
          const finalEmail = (rawEmail && rawEmail !== 'xxx@gmail.com')
            ? rawEmail
            : `${s.nis}@sekolah.sch.id`;

          const hashedPassword = await bcrypt.hash(s.password || 'sekolah123', 10);

          return {
            name:       s.name,
            nis:        s.nis,
            nisn:       s.nisn       || null,
            gender:     s.gender     || null,
            birthPlace: s.birthPlace || null,
            birthDate:  s.birthDate  || null,
            nik:        s.nik        || null,
            rfidUid:    s.rfidUid    || null,
            schoolId:   sId,
            email:      finalEmail,
            password:   hashedPassword,
            photoUrl:   null,
            class:      s.class      || null,
            batch:      s.batch      || null,
            qrCodeData: `QR-${s.nis}-${Date.now()}`
          };
        })
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          preparedStudents.push(result.value);
        } else {
          failed.push({ nis: chunk[idx].nis, name: chunk[idx].name, reason: 'Gagal memproses data' });
        }
      });
    }

    // ✅ bulkCreate dengan ignoreDuplicates sebagai safety net
    const created = [];
    const INSERT_CHUNK = 100; // insert 100 per query

    for (let i = 0; i < preparedStudents.length; i += INSERT_CHUNK) {
      const chunk = preparedStudents.slice(i, i + INSERT_CHUNK);
      try {
        const results = await Student.bulkCreate(chunk, {
          validate: true,
          returning: true, // ambil data yang berhasil dibuat
        });
        results.forEach(r => created.push({ nis: r.nis, name: r.name }));
      } catch (err) {
        // Kalau bulkCreate gagal, fallback create satu per satu untuk tahu mana yang error
        for (const s of chunk) {
          try {
            await Student.create(s);
            created.push({ nis: s.nis, name: s.name });
          } catch (innerErr) {
            let reason = innerErr.message;

            if (innerErr.name === 'SequelizeUniqueConstraintError') {
              const fieldLabels = {
                email:              'Email',
                nis:                'NIS',
                nisn:               'NISN',
                nik:                'NIK',
                rfidUid:            'RFID',
                unique_nisn_global: 'NISN',
                unique_nis_school:  'NIS',
                unique_email:       'Email',
              };
              const parts = innerErr.errors?.map(e => {
                const label = fieldLabels[e.path] || e.path;
                return `${label} "${e.value}" sudah digunakan`;
              }).join(', ');
              reason = parts || 'Data sudah terdaftar';

            } else if (innerErr.name === 'SequelizeValidationError') {
              const fieldLabels = {
                name:      'Nama',
                email:     'Email',
                nis:       'NIS',
                nisn:      'NISN',
                birthDate: 'Tanggal Lahir',
                gender:    'Gender',
              };
              const parts = innerErr.errors?.map(e => {
                const label = fieldLabels[e.path] || e.path;
                return `${label} tidak valid`;
              }).join(', ');
              reason = parts || 'Data tidak valid';

            } else if (innerErr.name === 'SequelizeDatabaseError') {
              reason = 'Gagal menyimpan ke database';
            }

            failed.push({ nis: s.nis, name: s.name, reason });
          }
        }
      }
    }

    await invalidateStudentCache(sId);

    return res.json({
      success: true,
      summary: {
        total:    students.length,
        berhasil: created.length,
        dilewati: duplicateNis.length + duplicateRfid.length,
        gagal:    failed.length,
      },
      detail: {
        berhasil:     created,
        nisDuplikat:  duplicateNis,
        rfidDuplikat: duplicateRfid,
        gagal:        failed
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudentSearch = async (req, res) => {
  try {
    const { schoolId, name } = req.query;
    console.log("Searching for:", name, "in schoolId:", schoolId);

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
      limit: 10,
      raw: true
    });

    res.json({ success: true, data: students });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAllStudents = async (req, res) => {
  try {
    const { 
      schoolId, 
      page = 1, 
      limit = 10, 
      class: studentClass, 
      batch, 
      search,
      isDuplicateOnly
    } = req.query;

    if (!schoolId || isNaN(parseInt(schoolId))) {
      return res.status(400).json({ success: false, message: "schoolId diperlukan." });
    }

    const sId = parseInt(schoolId);
    let condition = { schoolId: sId, isActive: true };

    // --- 1. LOGIKA IDENTIFIKASI DUPLIKAT ---
    const dupNisRows = await Student.findAll({
      where: { schoolId: sId, isActive: true },
      attributes: ['nis'],
      group: ['nis'],
      having: sequelizeWhere(fn('COUNT', col('nis')), '>', 1),
      raw: true
    });

    const dupNisnRows = await Student.findAll({
      where: { isActive: true, nisn: { [Op.ne]: null } },
      attributes: ['nisn'],
      group: ['nisn'],
      having: sequelizeWhere(fn('COUNT', col('nisn')), '>', 1),
      raw: true
    });

    const duplicateNisList = dupNisRows.map(d => d.nis);
    const duplicateNisnList = dupNisnRows.map(d => d.nisn);

    // --- 2. PENYUSUNAN FILTER QUERY ---
    if (studentClass) condition.class = studentClass;
    if (batch) condition.batch = batch;

    const filters = [];

    // Filter search: nama atau NIS
    if (search) {
      filters.push({
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { nis:  { [Op.like]: `%${search}%` } },
        ]
      });
    }

    // Filter duplikat
    if (isDuplicateOnly === 'true') {
      filters.push({
        [Op.or]: [
          { nis:  { [Op.in]: duplicateNisList } },
          { nisn: { [Op.in]: duplicateNisnList } },
          { nis:  { [Op.like]: '%-DUP-%' } },
          { nisn: { [Op.like]: '%-DUP-%' } },
        ]
      });
    }

    if (filters.length > 0) {
      condition[Op.and] = filters;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // --- 3. QUERY UTAMA DATA SISWA ---
    const { count, rows } = await Student.findAndCountAll({
      where: condition,
      limit: parseInt(limit),
      offset: offset,
      order: [['name', 'ASC']],
      include: [{
        model: Attendance,
        as: 'studentAttendances',
        where: {
          createdAt: {
            [Op.between]: [
              moment().startOf('day').toDate(),
              moment().endOf('day').toDate()
            ]
          }
        },
        required: false
      }]
    });

    // --- 4. MAPPING DATA & FLAG DUPLIKAT ---
    const dataWithStatus = rows.map(s => {
      const student = s.toJSON();
      const attendanceToday = student.studentAttendances?.[0];
      
      student.statusKehadiran = attendanceToday ? attendanceToday.status : 'Belum Hadir';
      student.isNisDuplicate = duplicateNisList.includes(student.nis) || student.nis.includes('-DUP-');
      student.isNisnDuplicate = student.nisn 
        ? (duplicateNisnList.includes(student.nisn) || student.nisn.includes('-DUP-')) 
        : false;

      delete student.studentAttendances;
      return student;
    });

    // --- 5. KIRIM RESPONSE ---
    res.json({
      success: true,
      summary: {
        uniqueNisDuplicates: duplicateNisList.length,
        uniqueNisnDuplicates: duplicateNisnList.length,
        hasIssues: duplicateNisList.length > 0 || duplicateNisnList.length > 0
      },
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

exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findByPk(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Siswa tidak ditemukan'
      });
    }

    const data = student.toJSON();
    delete data.password; // keamanan

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
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
      attributes: ['id', 'name', 'nis', 'nisn', 'class', 'rfidUid', 'photoUrl', 'qrCodeData']
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
      group: ['status'],
      raw: true
    });

    // 3. Ambil Statistik Kehadiran Guru
    const guruStats = await Attendance.findAll({
      where: {
        schoolId: parseInt(schoolId),
        userRole: 'teacher',
        createdAt: { [Op.between]: [todayStart, todayEnd] }
      },
      attributes: ['status', [fn('COUNT', col('id')), 'total']],
      group: ['status'],
      raw: true
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
    const { role, year, page = 1, limit = 10 } = req.query;

    // Validasi role
    if (!role || !['student', 'teacher'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role harus 'student' atau 'teacher'."
      });
    }

    const isStudent = role === 'student';
    const Model = isStudent ? Student : GuruTendik;
    const attendanceAlias = isStudent ? 'studentAttendances' : 'guruAttendances';

    // Validasi & set tahun
    if (year && !/^\d{4}$/.test(year)) {
      return res.status(400).json({
        success: false,
        message: "Format tahun tidak valid, gunakan YYYY (contoh: 2025)"
      });
    }

    // Tentukan rentang tanggal
   const startDate = year 
      ? moment(`${year}-01-01`).startOf('year').toDate() 
      : moment().subtract(1, 'years').toDate();
    const endDate = year 
      ? moment(`${year}-12-31`).endOf('year').toDate() 
      : moment().endOf('day').toDate();

    // Opsi include
    let includeOptions = [
      {
        model: Attendance,
        as: attendanceAlias,
        where: {
          createdAt: { [Op.between]: [startDate, endDate] }
        },
        required: false,
        attributes: ['id', 'status', 'createdAt'] // hanya yang dibutuhkan
      }
    ];

    // Tambahkan relasi orang tua hanya untuk siswa
    if (isStudent) {
      includeOptions.push({
        model: Parent,
        as: 'parent',
        attributes: ['id', 'name', 'gender', 'relationStatus', 'phoneNumber', 'type'],
        required: false
      });
    }

    // Tentukan kolom secara dinamis
    const selectedAttributes = isStudent 
      ? ['id', 'name', 'nis', 'nisn', 'class', 'batch', 'photoUrl', 'gender', 'qrCodeData']
      : ['id', ['nama', 'name'], 'nip', 'email', 'mapel', 'jurusan', 'photoUrl', ['jenisKelamin', 'gender'], 'qrCodeData'];
      
    const user = await Model.findOne({
      where: { id, isActive: true },
      attributes: selectedAttributes,
      include: includeOptions
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: `Data ${role} dengan ID ${id} tidak ditemukan atau tidak aktif`
      });
    }

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

    // 4. Siapkan response
    const profile = user.toJSON();
    delete profile[attendanceAlias]; // hapus array attendance dari profil

    return res.json({
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
    console.error('[getUserDetail] Error:', err);
    return res.status(500).json({
      success: false,
      message: `Terjadi kesalahan server: ${err.message}`,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

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
      order: [['createdAt', 'DESC']],
      raw: true
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

    await invalidateStudentCache(updateFields.schoolId);

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

    await invalidateStudentCache(student.schoolId);
    res.json({ success: true, message: 'Siswa berhasil dinonaktifkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Hard delete semua siswa by batch
exports.deleteStudentsByBatch = async (req, res) => {
  try {
    const { schoolId, batch } = req.body;

    if (!schoolId || !batch) {
      return res.status(400).json({ success: false, message: 'schoolId dan batch wajib diisi' });
    }

    const count = await Student.destroy({
      where: { schoolId: parseInt(schoolId), batch }
    });

    await invalidateStudentCache(parseInt(schoolId));
    res.json({ success: true, message: `${count} siswa angkatan ${batch} berhasil dihapus permanen` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Hard delete semua siswa satu sekolah
exports.deleteAllStudents = async (req, res) => {
  try {
    const { schoolId } = req.body;

    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId wajib diisi' });
    }

    const count = await Student.destroy({
      where: { schoolId: parseInt(schoolId) }
    });

    await invalidateStudentCache(parseInt(schoolId));
    res.json({ success: true, message: `${count} siswa berhasil dihapus permanen` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTodayStats = async (req, res) => {
  try {
    const { schoolId, role = 'student' } = req.query;

    // 1. Tentukan Model secara dinamis berdasarkan role
    const isStudent = role === 'student';
    const MainModel = isStudent ? Attendance : KehadiranGuru;

    // 2. Ambil data kehadiran hari ini
    const attendanceData = await MainModel.findAll({
      where: {
        schoolId: parseInt(schoolId),
        // Filter userRole hanya jika menggunakan model Attendance (siswa)
        ...(isStudent && { userRole: role }), 
        createdAt: {
          [Op.between]: [
            moment().startOf('day').toDate(), 
            moment().endOf('day').toDate()
          ]
        }
      },
      raw: true 
    });

    // 3. Inisialisasi struktur summary
    const summary = { 
      Hadir: 0, 
      Terlambat: 0, 
      Sakit: 0, 
      Izin: 0, 
      Alpha: 0 
    };

    const deadline = "07:00:00";

    // 4. Hitung Statistik
    attendanceData.forEach(item => {
      if (item.status === 'Hadir') {
        const scanTime = moment(item.createdAt).format("HH:mm:ss");

        if (scanTime > deadline) {
          summary.Terlambat += 1;
          // Opsional: Jika ingin Terlambat juga dihitung sebagai Hadir, 
          // aktifkan baris di bawah ini:
          // summary.Hadir += 1; 
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

    // 5. Kirim Response
    res.json({ 
      success: true, 
      data: { 
        role, // Tambahkan info role di response agar frontend yakin
        date: moment().format('YYYY-MM-DD'),
        deadlineInfo: deadline,
        ...summary 
      } 
    });
  } catch (err) {
    console.error(`[getTodayStats] Error for role ${role}:`, err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAttendanceReport = async (req, res) => {
  try {
    const { schoolId, role, year, month, date, page = 1, limit = 50 } = req.query;

    let startDate, endDate;

    // 1. Tentukan Rentang Waktu
    if (date) {
      startDate = moment(date).startOf('day').toDate();
      endDate = moment(date).endOf('day').toDate();
    } else {
      startDate = moment(`${year}-${month}-01`).startOf('month').toDate();
      endDate = moment(startDate).endOf('month').toDate();
    }

    // 2. Tentukan Model dan Include secara dinamis berdasarkan Role
    const isStudent = role === 'student';
    
    // ModelUtama: Jika student pakai 'Attendance', jika teacher pakai 'KehadiranGuru'
    const MainModel = isStudent ? Attendance : KehadiranGuru;
    
    const includeOptions = [
      {
        model: isStudent ? Student : GuruTendik,
        as: isStudent ? 'student' : 'guru',
        attributes: isStudent 
          ? ['name', 'nis'] 
          : [['nama', 'name'], 'role', 'mapel'] // Alias 'nama' jadi 'name' agar frontend konsisten
      }
    ];

    // 3. Eksekusi Query
    const { count, rows } = await MainModel.findAndCountAll({
      where: {
        schoolId,
        // Jika di tabel KehadiranGuru tidak ada kolom userRole, 
        // kita hanya masukkan filter ini untuk tabel Attendance (siswa)
        ...(isStudent && { userRole: role }),
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      include: includeOptions,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']],
      raw: false 
    });

    const deadline = "07:00:00";

    // const processedRows = rows.map(record => {
    //   const attendance = record.toJSON();
    //   const scanTime = moment(attendance.createdAt).format("HH:mm:ss");
      
    //   // Ambil data user dari alias yang dinamis (student atau guru)
    //   const userData = isStudent ? attendance.student : attendance.guru;
      
    //   return {
    //     ...attendance,
    //     name: userData?.name || userData?.nama || '-', // Fallback nama
    //     identifier: isStudent ? userData?.nis : userData?.role, // NIS atau Jabatan
    //     isLate: attendance.status === 'Hadir' && scanTime > deadline,
    //     scanTime: scanTime,
    //   };
    // });

    const processedRows = rows.map(record => {
      const attendance = record.toJSON();
      
      // Ambil waktu scan dalam format moment agar bisa dimanipulasi
      const createdAtMoment = moment(attendance.createdAt);
      const scanTime = createdAtMoment.format("HH:mm:ss");
      
      // Tentukan apakah terlambat
      const isLate = attendance.status === 'Hadir' && scanTime > deadline;
      
      // Hitung durasi keterlambatan jika statusnya terlambat
      let lateDuration = "0 Menit";
      if (isLate) {
        const deadlineMoment = moment(deadline, "HH:mm:ss");
        
        // Hitung selisih dalam menit
        const diffInMinutes = createdAtMoment.diff(
          moment(createdAtMoment).set({
            hour: 7,
            minute: 0,
            second: 0,
            millisecond: 0
          }), 
          'minutes'
        );
        
        lateDuration = `${diffInMinutes}`;
      }

      const userData = isStudent ? attendance.student : attendance.guru;
      
      return {
        ...attendance,
        name: userData?.name || userData?.nama || '-',
        identifier: isStudent ? userData?.nis : userData?.role,
        isLate: isLate,
        scanTime: scanTime,
        lateDuration: lateDuration, // <-- Field baru ditambahkan di sini
      };
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
    console.error("Error Report:", err);
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
    await invalidateStudentCache(schoolId);

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

// 1. Cek Kelulusan (Untuk Siswa/Orang Tua)
exports.processGraduation = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { studentIds, graduationYear, batch, description, schoolId } = req.body;

    // --- VALIDASI INPUT ---
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: "Pilih minimal satu siswa." });
    }

    if (!batch) {
      return res.status(400).json({ success: false, message: "Nama Angkatan (Batch) wajib diisi." });
    }

    if (!graduationYear || !schoolId) {
      return res.status(400).json({ success: false, message: "Tahun lulus dan School ID wajib diisi." });
    }
    const idsToFind = studentIds.map(item => (typeof item === 'object' ? item.id : item));

    const selectedStudents = await Student.findAll({
      where: { 
        id: { [Op.in]: idsToFind },
        schoolId: parseInt(schoolId)
      }
    });

    if (selectedStudents.length === 0) {
      return res.status(404).json({ success: false, message: "Data siswa tidak ditemukan di database." });
    }

    // 2. PEMETAAN DATA KE TABEL ALUMNI (Tambahkan NIS di sini)
    const alumniData = selectedStudents.map(student => ({
      schoolId: student.schoolId,
      name: student.name,
      nis: student.nis, // <--- KRUSIAL: Memindahkan NIS dari tabel Student ke Alumni
      graduationYear: parseInt(graduationYear),
      batch: batch, 
      description: description || `Alumni angkatan ${batch}`,
      photoUrl: student.photoUrl,
      isActive: true,
      isVerified: true 
    }));

    await Alumni.bulkCreate(alumniData, { transaction: t });

    await Student.update(
      { isActive: false }, 
      { 
        where: { id: { [Op.in]: idsToFind } },
        transaction: t 
      }
    );

    // SELESAIKAN TRANSAKSI
    await t.commit();

    await invalidateStudentCache(parseInt(req.body.schoolId));

    res.json({ 
      success: true, 
      message: `Berhasil: ${selectedStudents.length} siswa tahun lulus ${graduationYear} dengan angkatan ${batch}.` 
    });

  } catch (err) {
    // BATALKAN SEMUA PERUBAHAN JIKA TERJADI ERROR
    if (t) await t.rollback();
    
    console.error("Graduation Error Detail:", err);

    // Penanganan error khusus jika NIS duplikat di tabel Alumni
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        success: false, 
        message: "Beberapa siswa dengan NIS tersebut sudah terdaftar sebagai alumni." 
      });
    }

    res.status(500).json({ success: false, message: "Internal Server Error: " + err.message });
  }
};


exports.getStudentAttendance = async (req, res) => {
  try {
    // Ambil studentId dari token (req.user diisi oleh middleware auth)
    const studentId = req.user.id; 
    const { year } = req.query;

    // 1. Konfigurasi Rentang Waktu
    const startDate = year 
      ? moment(`${year}-01-01`).startOf('year').toDate() 
      : moment().startOf('month').toDate(); // Default bulan ini saja biar ringan
    const endDate = moment().endOf('day').toDate();

    // 2. Ambil data kehadiran
    const attendanceRecords = await Attendance.findAll({
      where: {
        studentId: studentId,
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      order: [['createdAt', 'DESC']]
    });

    const deadline = "07:00:00";
    const history = attendanceRecords.map(record => {
      const scanTime = moment(record.createdAt).format("HH:mm:ss");
      return {
        date: moment(record.createdAt).format('DD MMM YYYY'),
        time: scanTime,
        status: record.status,
        isLate: record.status === 'Hadir' && scanTime > deadline
      };
    });

    res.json({
      success: true,
      data: history
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Route: GET /orang-tua/:parentId/anak
exports.getParentChildren = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { schoolId } = req.query; // opsional, untuk filter

    const parent = await Parent.findByPk(parentId);
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Orang tua tidak ditemukan' });
    }

    // Asumsi ada relasi di model (Parent.hasMany(Student, { as: 'children', foreignKey: 'parentId' }))
    // Jika belum ada relasi, gunakan query manual:

    const children = await Student.findAll({
      where: { 
        schoolId: parent.schoolId,
        // Jika kamu punya kolom parentId di tabel siswa:
        parentId: parentId 
      },
      attributes: [
        'id', 'name', 'nis', 'nisn', 'nik', 'gender', 
        'birthPlace', 'birthDate', 'class', 'batch', 'photoUrl', 'isActive'
      ],
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: children
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getClassRecapWithDetails = async (req, res) => {
  try {
    const { schoolId, date } = req.query;
    const targetDate = date ? moment(date) : moment();

    const startDate = targetDate.clone().startOf('day').utc().format('YYYY-MM-DD HH:mm:ss');
    const endDate = targetDate.clone().endOf('day').utc().format('YYYY-MM-DD HH:mm:ss');

    const deadline = "07:00:00";

    // OPTIMASI 1: Gunakan Attributes untuk membatasi kolom yang ditarik dari DB
    const allStudents = await Student.findAll({
      where: { schoolId, isActive: true, isGraduated: false },
      attributes: ['id', 'name', 'nis', 'class', 'photoUrl'], // Hanya ambil yang perlu
      include: [{
        model: Attendance,
        as: 'studentAttendances',
        where: {
          createdAt: { [Op.between]: [startDate, endDate] },
          userRole: 'student'
        },
        attributes: ['status', 'createdAt'], // Batasi kolom attendance
        required: false 
      }],
      // OPTIMASI 2: Hilangkan sorting di DB jika data sangat besar, sorting di memori JS lebih cepat
      raw: false, 
    });

    let totalAllStudents = 0;
    let totalAllHadir = 0;
    let totalAllBelumHadir = 0;

    // OPTIMASI 3: Gunakan Map untuk pengelompokan (lebih cepat dari reduce Object untuk data masif)
    const acc = new Map();

    for (const student of allStudents) {
      const className = student.class || "Tanpa Kelas";
      
      if (!acc.has(className)) {
        acc.set(className, {
          className,
          totalStudents: 0,
          stats: { onTime: 0, late: 0, izin: 0, sakit: 0, alpha: 0, belumHadir: 0 },
          students: []
        });
      }

      const classObj = acc.get(className);
      const attendance = student.studentAttendances?.[0];
      
      let statusInfo = "Belum Hadir";
      let isLate = false;
      let scanTime = null;

      totalAllStudents++;

      if (attendance) {
        scanTime = moment(attendance.createdAt).format("HH:mm:ss");
        if (attendance.status === 'Hadir') {
          totalAllHadir++;
          if (scanTime <= deadline) {
            classObj.stats.onTime++;
            statusInfo = "Tepat Waktu";
          } else {
            classObj.stats.late++;
            statusInfo = "Telat";
            isLate = true;
          }
        } else {
          const statusKey = attendance.status.toLowerCase();
          if (classObj.stats[statusKey] !== undefined) classObj.stats[statusKey]++;
          statusInfo = attendance.status;
        }
      } else {
        classObj.stats.belumHadir++;
        totalAllBelumHadir++;
      }

      classObj.totalStudents++;
      classObj.students.push({
        id: student.id, name: student.name, nis: student.nis,
        status: statusInfo, scanTime, isLate, photoUrl: student.photoUrl
      });
    }

    res.json({
      success: true,
      summary: { totalAllStudents, totalAllHadir, totalAllBelumHadir },
      data: Array.from(acc.values()).sort((a, b) => a.className.localeCompare(b.className))
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getGlobalAttendanceStats = async (req, res) => {
  try {
    const { schoolId, date, search = '', page = 1, limit = 10 } = req.query;
    
    const targetDate  = date ? moment(date).format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
    const startOfDay  = `${targetDate} 00:00:00`;
    const endOfDay    = `${targetDate} 23:59:59`;
    const offset      = (Number(page) - 1) * Number(limit);

    const createdAtRange = { [Op.between]: [startOfDay, endOfDay] };
    const baseWhere = { schoolId, userRole: 'student', status: 'Hadir', createdAt: createdAtRange };

    // Where untuk absent students + search
    const absentWhere = { schoolId, isActive: true, isGraduated: false };
    if (search.trim()) {
      absentWhere[Op.or] = [
        { name: { [Op.like]: `%${search.trim()}%` } },
        { nis:  { [Op.like]: `%${search.trim()}%` } },
      ];
    }

    const [allHadir, { rows: absentStudents, count: totalAbsent }] = await Promise.all([
      Attendance.findAll({
        where:      baseWhere,
        include:    [{ model: Student, as: 'student', attributes: ['name', 'class', 'photoUrl'] }],
        order:      [['createdAt', 'ASC']],
        attributes: ['createdAt', 'studentId'],
      }),

      Student.findAndCountAll({
        where:   absentWhere,
        include: [{
          model:      Attendance,
          as:         'studentAttendances',
          required:   false,
          where:      { createdAt: createdAtRange, userRole: 'student' },
          attributes: [],
        }],
        having:   literal('COUNT(`studentAttendances`.`id`) = 0'),
        group:    ['Student.id'],
        order:    [['class', 'ASC'], ['name', 'ASC']],
        attributes: ['id', 'name', 'nis', 'class', 'photoUrl'],
        limit:    Number(limit),
        offset,
        subQuery: false,
      }),
    ]);

    const topEarly = allHadir.slice(0, 5);
    const topLate  = [...allHadir].reverse().slice(0, 5);

    const formatAttendance = (a) => ({
      name:     a.student?.name,
      class:    a.student?.class,
      photoUrl: a.student?.photoUrl,
      time:     moment(a.createdAt).format('HH:mm:ss'),
    });

    res.json({
      success: true,
      targetDate,
      data: {
        absentStudents,
        absentMeta: {
          total:      totalAbsent.length, // findAndCountAll dengan group returns array
          page:       Number(page),
          limit:      Number(limit),
          totalPages: Math.ceil(totalAbsent.length / Number(limit)),
        },
        topEarly: topEarly.map(formatAttendance),
        topLate:  topLate.map(formatAttendance),
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateClassByBatch = async (req, res) => {
  try {
    const { schoolId, batch, newClass, studentIds } = req.body;

    if (!schoolId || !newClass) {
      return res.status(400).json({ 
        success: false, 
        message: 'schoolId dan newClass wajib diisi' 
      });
    }

    // Jika ada studentIds spesifik → update by IDs
    // Jika ada batch tapi tidak ada IDs → update semua siswa di batch itu
    let whereCondition = { schoolId: parseInt(schoolId) };

    if (studentIds && studentIds.length > 0) {
      whereCondition.id = { [Op.in]: studentIds };
    } else if (batch) {
      whereCondition.batch = batch;
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Masukkan batch atau pilih siswa terlebih dahulu' 
      });
    }

    const [affectedCount] = await Student.update(
      { class: newClass },
      { where: whereCondition }
    );

    await invalidateStudentCache(parseInt(schoolId));

    res.json({ 
      success: true, 
      message: `${affectedCount} siswa berhasil dipindahkan ke kelas ${newClass}`,
      affectedCount
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};