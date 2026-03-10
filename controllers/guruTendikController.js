const { Op, fn, col, where: sequelizeWhere } = require('sequelize');
const GuruTendik = require('../models/guruTendik');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const jwt = require('jsonwebtoken');
const SchoolProfile = require('../models/profileSekolah');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.checkGuruAuth = async (req, res) => {
  try {
    const { email, nip } = req.body;
    
    const guru = await GuruTendik.findOne({
      where: {  
        isActive: true,
        [Op.or]: [{ email: email }, { nip: nip }]
      }
    });

    if (!guru) {
      return res.status(404).json({ success: false, message: 'Data Guru/Tendik tidak ditemukan' });
    }

    // 2. Ambil logo sekolah secara manual berdasarkan schoolId dari data guru
    const dataSekolah = await SchoolProfile.findOne({
      where: { schoolId: guru.schoolId },
      attributes: ["logoUrl"]
    });

    // Mengubah instance database menjadi objek plain JSON
    const profile = guru.toJSON();
    profile.schoolLogo = dataSekolah ? dataSekolah.logoUrl : null;

    // Hapus field sensitif atau yang tidak perlu agar token ringan
    delete profile.password; 
    delete profile.createdAt;
    delete profile.updatedAt;

    // Generate Token JWT dengan Profile Lengkap
    const token = jwt.sign(
      { profile }, // Payload berisi seluruh profil
      process.env.JWT_SECRET || 'secret_key_anda',
      { expiresIn: '1d' }
    );

    res.json({ 
      success: true, 
      token, 
      data: profile // Kirim data yang sudah dibersihkan
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// exports.getAllGuruTendik = async (req, res) => {
//   try {
//     const { schoolId, name } = req.query;

//     if (!schoolId) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'schoolId wajib disertakan di query' 
//       });
//     }

//    // Susun kondisi WHERE
//     let whereCondition = { 
//       schoolId: parseInt(schoolId),
//       isActive: true 
//     };

//     // Tambahkan filter nama jika parameter 'name' dikirim dari frontend
//     if (name) {
//       whereCondition.nama = {
//         [Op.like]: `%${name}%`
//       };
//     }

//     const guruTendik = await GuruTendik.findAll({
//       where: whereCondition,
//       order: [['createdAt', 'DESC']],
//     });

//     res.json({ success: true, data: guruTendik });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.getAllGuruTendik = async (req, res) => {
  try {
    const {
      schoolId,
      name,
      isDuplicateOnly,
      page = 1,
      limit = 20,          // default 20 item per halaman
    } = req.query;

    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId wajib disertakan' });
    }

    const sId = parseInt(schoolId);
    const currentPage = parseInt(page);
    const itemsPerPage = parseInt(limit);

    if (isNaN(currentPage) || currentPage < 1) {
      return res.status(400).json({ success: false, message: 'Parameter page tidak valid' });
    }
    if (isNaN(itemsPerPage) || itemsPerPage < 1) {
      return res.status(400).json({ success: false, message: 'Parameter limit tidak valid' });
    }

    // --- 1. LOGIKA IDENTIFIKASI DUPLIKAT ---
    
    // Cari NIP duplikat di sekolah yang sama
    const dupNipRows = await GuruTendik.findAll({
      where: { schoolId: sId, isActive: true, nip: { [Op.ne]: null, [Op.ne]: '' } },
      attributes: ['nip'],
      group: ['nip'],
      having: sequelizeWhere(fn('COUNT', col('nip')), '>', 1),
      raw: true
    });

    // Cari Email duplikat secara global
    const dupEmailRows = await GuruTendik.findAll({
      where: { isActive: true, email: { [Op.ne]: null, [Op.ne]: '' } },
      attributes: ['email'],
      group: ['email'],
      having: sequelizeWhere(fn('COUNT', col('email')), '>', 1),
      raw: true
    });

    const duplicateNipList = dupNipRows.map(d => d.nip);
    const duplicateEmailList = dupEmailRows.map(d => d.email);

    // --- 2. SUSUN KONDISI WHERE ---
    let whereCondition = { 
      schoolId: sId, 
      isActive: true 
    };

    if (name) {
      whereCondition.nama = { [Op.like]: `%${name}%` };
    }

    // Jika filter duplikat aktif
    if (isDuplicateOnly === 'true') {
      whereCondition[Op.or] = [
        { nip: { [Op.in]: duplicateNipList } },
        { email: { [Op.in]: duplicateEmailList } },
        { nip: { [Op.like]: '%-DUP-%' } },
        { email: { [Op.like]: '%-DUP-%' } }
      ];
    }

    // --- 3. QUERY UTAMA DENGAN PAGINATION ---
    const offset = (currentPage - 1) * itemsPerPage;

    const { count, rows: guruTendik } = await GuruTendik.findAndCountAll({
      where: whereCondition,
      limit: itemsPerPage,
      offset: offset,
      order: [['createdAt', 'DESC']],
    });

    // --- 4. MAPPING FLAG DUPLIKAT KE DATA ---
    const dataWithStatus = guruTendik.map(g => {
      const item = g.toJSON();
      item.isNipDuplicate = duplicateNipList.includes(item.nip) || (item.nip && item.nip.includes('-DUP-'));
      item.isEmailDuplicate = duplicateEmailList.includes(item.email) || (item.email && item.email.includes('-DUP-'));
      return item;
    });

    // --- 5. RESPONSE ---
    res.json({ 
      success: true, 
      summary: {
        totalNipIssues: duplicateNipList.length,
        totalEmailIssues: duplicateEmailList.length,
        hasIssues: duplicateNipList.length > 0 || duplicateEmailList.length > 0
      },
      data: dataWithStatus,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / itemsPerPage),
        currentPage: currentPage,
        perPage: itemsPerPage
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// exports.createGuruTendik = async (req, res) => {
//   try {
//     const { nama, mapel, email, role, jurusan, jenisKelamin, schoolId, nip } = req.body;

//     if (!nama || !role || !jenisKelamin || !schoolId) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Nama, role, jenisKelamin, dan schoolId wajib diisi' 
//       });
//     }

//     let photoUrl = null;
//     if (req.file) {
//       const result = await new Promise((resolve, reject) => {
//         const uploadStream = cloudinary.uploader.upload_stream(
//           { resource_type: 'image' },
//           (error, result) => {
//             if (error) reject(error);
//             else resolve(result);
//           }
//         );
//         streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
//       });
//       photoUrl = result.secure_url;
//     }

//     // Logic QR Code otomatis tanpa NIP
//     const generatedQR = `QR-STAFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

//     const newGuruTendik = await GuruTendik.create({ 
//       nama, 
//       mapel,
//       email,
//       role,
//       jurusan,
//       jenisKelamin,
//       photoUrl,
//       schoolId: parseInt(schoolId),
//       qrCodeData: generatedQR,
//       nip
//     });

//     res.json({ success: true, data: newGuruTendik });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.createGuruTendik = async (req, res) => {
  try {
    const { nama, mapel, email, role, jurusan, jenisKelamin, schoolId, nip } = req.body;

    if (!nama || !role || !jenisKelamin || !schoolId) {
      return res.status(400).json({ success: false, message: 'Data wajib diisi belum lengkap' });
    }

    const sId = parseInt(schoolId);

    // --- VALIDASI NIP (Per Sekolah) ---
    if (nip) {
      const existingNip = await GuruTendik.findOne({ where: { schoolId: sId, nip } });
      if (existingNip) {
        return res.status(400).json({ 
          success: false, 
          message: `NIP ${nip} sudah digunakan oleh ${existingNip.nama}`,
          conflictData: existingNip 
        });
      }
    }

    // --- VALIDASI EMAIL (Global) ---
    if (email) {
      const existingEmail = await GuruTendik.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(400).json({ 
          success: false, 
          message: `Email ${email} sudah terdaftar atas nama ${existingEmail.nama}`,
          conflictData: existingEmail 
        });
      }
    }

    // Prosedur Upload Foto (Cloudinary)
    let photoUrl = null;
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'image', folder: `school_${sId}/staff` },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      photoUrl = result.secure_url;
    }

    const generatedQR = `QR-STAFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newGuruTendik = await GuruTendik.create({ 
      nama, mapel, email, role, jurusan, jenisKelamin, photoUrl,
      schoolId: sId,
      qrCodeData: generatedQR,
      nip
    });

    res.json({ success: true, message: 'Berhasil menambahkan Staff', data: newGuruTendik });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'NIP atau Email sudah terdaftar.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateGuruTendik = async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, mapel, email, role, jurusan, jenisKelamin, nip } = req.body;

    const guru = await GuruTendik.findByPk(id);
    if (!guru) {
      return res.status(404).json({ success: false, message: 'Guru/Tendik tidak ditemukan' });
    }

    const oldPhotoUrl = guru.photoUrl;

    // Update fields
    if (nama) guru.nama = nama;
    if (mapel !== undefined) guru.mapel = mapel;
    if (email !== undefined) guru.email = email;
    if (nip !== undefined) guru.nip = nip;
    if (role) guru.role = role;
    if (jurusan !== undefined) guru.jurusan = jurusan;
    if (jenisKelamin) guru.jenisKelamin = jenisKelamin;

    // Handle photo baru
    if (req.file) {
      // Hapus foto lama jika ada
      if (oldPhotoUrl) {
        const publicId = oldPhotoUrl.split('/').pop().split('.')[0];
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Foto lama dihapus: ${publicId}`);
        } catch (err) {
          console.log(`Gagal hapus foto lama: ${err.message}`);
        }
      }

      // Upload foto baru
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      guru.photoUrl = result.secure_url;
    }

    await guru.save();

    res.json({ success: true, data: guru });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteGuruTendik = async (req, res) => {
  try {
    const { id } = req.params;

    const guru = await GuruTendik.findByPk(id);
    if (!guru) {
      return res.status(404).json({ success: false, message: 'Guru/Tendik tidak ditemukan' });
    }

    // Hapus foto dari Cloudinary jika ada
    if (guru.photoUrl) {
      const publicId = guru.photoUrl.split('/').pop().split('.')[0];
      try {
        await cloudinary.uploader.destroy(publicId);
        console.log(`Foto dihapus: ${publicId}`);
      } catch (err) {
        console.log(`Gagal hapus foto: ${err.message}`);
      }
    }

    // Soft delete
    guru.isActive = false;
    await guru.save();

    res.json({ success: true, message: 'Guru/Tendik berhasil dihapus (soft delete)' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};