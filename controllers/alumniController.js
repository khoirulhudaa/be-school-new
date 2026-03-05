const Alumni = require('../models/alumni');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.getAllAlumni = async (req, res) => {
  try {
    const { schoolId, isVerified, graduationYear, batch, name } = req.query;

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

    if (!name || !graduationYear || !schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, graduationYear, dan schoolId wajib diisi' 
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

    const newAlumni = await Alumni.create({ 
      name, 
      graduationYear: parseInt(graduationYear),
      batch,
      description,
      photoUrl,
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
    const { name, graduationYear, description } = req.body;

    const alumni = await Alumni.findByPk(id);
    if (!alumni) {
      return res.status(404).json({ success: false, message: 'Alumni tidak ditemukan' });
    }

    const oldPhotoUrl = alumni.photoUrl;

    if (name) alumni.name = name;
    if (graduationYear) alumni.graduationYear = parseInt(graduationYear);
    if (description) alumni.description = description;

    if (req.file) {
      if (oldPhotoUrl) {
        const publicId = oldPhotoUrl.split('/').pop().split('.')[0]; // Extract public_id
        try {
          await cloudinary.uploader.destroy(publicId);
          console.log(`Photo lama dihapus dari Cloudinary: ${publicId}`);
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

    await alumni.save();

    res.json({ success: true, data: alumni });
  } catch (err) {
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