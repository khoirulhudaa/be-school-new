const { Op } = require('sequelize');
const GuruTendik = require('../models/guruTendik');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const jwt = require('jsonwebtoken');

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

    // Mengubah instance database menjadi objek plain JSON
    const profile = guru.toJSON();

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

exports.getAllGuruTendik = async (req, res) => {
  try {
    const { schoolId, name } = req.query;

    if (!schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'schoolId wajib disertakan di query' 
      });
    }

   // Susun kondisi WHERE
    let whereCondition = { 
      schoolId: parseInt(schoolId),
      isActive: true 
    };

    // Tambahkan filter nama jika parameter 'name' dikirim dari frontend
    if (name) {
      whereCondition.nama = {
        [Op.like]: `%${name}%`
      };
    }

    const guruTendik = await GuruTendik.findAll({
      where: whereCondition,
      order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: guruTendik });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createGuruTendik = async (req, res) => {
  try {
    const { nama, mapel, email, role, jurusan, jenisKelamin, schoolId, nip } = req.body;

    if (!nama || !role || !jenisKelamin || !schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nama, role, jenisKelamin, dan schoolId wajib diisi' 
      });
    }

    let photoUrl = null;
    if (req.file) {
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
      photoUrl = result.secure_url;
    }

    // Logic QR Code otomatis tanpa NIP
    const generatedQR = `QR-STAFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newGuruTendik = await GuruTendik.create({ 
      nama, 
      mapel,
      email,
      role,
      jurusan,
      jenisKelamin,
      photoUrl,
      schoolId: parseInt(schoolId),
      qrCodeData: generatedQR,
      nip
    });

    res.json({ success: true, data: newGuruTendik });
  } catch (err) {
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