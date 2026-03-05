const Alumni = require('../models/alumni');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const SchoolSetting = require('../models/schoolSetting');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.getAllAlumni = async (req, res) => {
  try {
    const { schoolId, isVerified, nis, graduationYear, batch, name } = req.query;

    const where = { 
      schoolId: parseInt(schoolId),
      isActive: true 
    };

    if (isVerified !== undefined) where.isVerified = isVerified === 'true';
    if (graduationYear) where.graduationYear = parseInt(graduationYear);
    if (batch) where.batch = batch;
    if (name) where.name = { [Op.like]: `%${name}%` };

    const alumni = await Alumni.findAll({ 
      where,
      order: [['graduationYear', 'DESC'], ['name', 'ASC']],
    });

    res.json({ success: true, data: alumni });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createAlumni = async (req, res) => {
  try {
    const { name, graduationYear, batch, description, schoolId } = req.body;

    // 1. Validasi Kehadiran Field Wajib
    if (!name || !graduationYear || !schoolId || !batch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, graduationYear, Batch, dan schoolId wajib diisi' 
      });
    }

    // 2. Validasi Batch (Harus Tepat 4 Digit Angka)
    // Menggunakan regex ^\d{4}$ untuk memastikan hanya angka dan tepat 4 karakter
    const batchString = String(batch).trim();
    if (!/^\d{4}$/.test(batchString)) {
      return res.status(400).json({
        success: false,
        message: 'Batch harus berupa 4 digit tahun (contoh: 2020)'
      });
    }

    // 3. Logika Upload Foto (Tetap sama)
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

    // 4. Simpan ke Database
    const newAlumni = await Alumni.create({ 
      name, 
      graduationYear: parseInt(graduationYear),
      batch: batchString, // Simpan sebagai string agar konsisten
      description,
      photoUrl,
      nis,
      schoolId: parseInt(schoolId),
      isVerified: false
    });

    res.json({ success: true, data: newAlumni });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateAlumni = async (req, res) => {
  try {
    const { id } = req.params;
    // 1. Ambil NIS dan Batch dari req.body
    const { name, nis, graduationYear, description, batch } = req.body;

    const alumni = await Alumni.findByPk(id);
    if (!alumni) {
      return res.status(404).json({ success: false, message: 'Alumni tidak ditemukan' });
    }

    const oldPhotoUrl = alumni.photoUrl;

    // 2. Update field teks (Termasuk NIS)
    if (name) alumni.name = name;
    if (nis) alumni.nis = nis; // Update NIS
    if (batch) alumni.batch = batch; // Update Batch
    if (graduationYear) alumni.graduationYear = parseInt(graduationYear);
    if (description !== undefined) alumni.description = description;

    // 3. Logika Upload Foto ke Cloudinary (Tetap sama)
    if (req.file) {
      if (oldPhotoUrl) {
        // Ambil publicId dengan lebih aman (menghindari error jika URL null)
        const parts = oldPhotoUrl.split('/');
        const publicId = parts[parts.length - 1].split('.')[0]; 
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Photo lama dihapus: ${publicId}`);
        } catch (err) {
          console.log(`Gagal hapus photo lama: ${err.message}`);
        }
      }

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
      alumni.photoUrl = result.secure_url;
    }

    // 4. Simpan ke Database
    await alumni.save();

    res.json({ 
      success: true, 
      message: "Data alumni berhasil diperbarui", 
      data: alumni 
    });
    
  } catch (err) {
    // Tangani error jika NIS ternyata duplikat (jika kolom NIS diset UNIQUE)
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ 
        success: false, 
        message: 'NIS sudah digunakan oleh alumni lain' 
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteAlumni = async (req, res) => {
  try {
    const { id } = req.params;

    const alumni = await Alumni.findByPk(id);
    if (!alumni) {
      return res.status(404).json({ success: false, message: 'Alumni tidak ditemukan' });
    }
    if (alumni.photoUrl) {
      const publicId = alumni.photoUrl.split('/').pop().split('.')[0];
      try {
        await cloudinary.uploader.destroy(publicId);
        console.log(`Photo dihapus dari Cloudinary: ${publicId}`);
      } catch (err) {
        console.log(`Gagal hapus photo: ${err.message}`);
      }
    }

    alumni.isActive = false;
    await alumni.save();

    res.json({ success: true, message: 'Alumni berhasil dihapus (soft delete)' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Function Approve untuk Admin
exports.approveAlumni = async (req, res) => {
  try {
    const { id } = req.params;
    const alumni = await Alumni.findByPk(id);
    
    if (!alumni) {
      return res.status(404).json({ success: false, message: 'Alumni tidak ditemukan' });
    }

    alumni.isVerified = true;
    await alumni.save();

    res.json({ success: true, message: 'Alumni berhasil diverifikasi!', data: alumni });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// controllers/setting.controller.js
exports.updateAlumniDisplay = async (req, res) => {
  try {
    const { schoolId, year, batch } = req.body;
    
    // Update atau Create jika belum ada (Upsert)
    await SchoolSetting.upsert({
      schoolId,
      displayAlumniYear: year,
      displayAlumniBatch: batch
    });

    res.json({ success: true, message: "Pengaturan tampilan data alumni diperbarui." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 1. Fungsi untuk Mengambil Setting (GET)
exports.getAlumniDisplaySetting = async (req, res) => {
  try {
    const { schoolId } = req.params;

    if (!schoolId) {
      return res.status(400).json({ success: false, message: "School ID diperlukan." });
    }

    const setting = await SchoolSetting.findByPk(schoolId);

    res.json({ 
      success: true, 
      data: setting || { displayAlumniYear: null, displayAlumniBatch: null } 
    });
  } catch (err) {
    console.error("Get Setting Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};