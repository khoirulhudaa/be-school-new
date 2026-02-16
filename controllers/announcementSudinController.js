const { Op } = require('sequelize');
const AnnouncementSudin = require('../models/AnnouncementSudin');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 1. Mendapatkan semua pengumuman milik suku dinas ini
exports.getAnnouncementsForSudin = async (req, res) => {
  try {
    const sudinId = req.sudin?.id;
    if (!sudinId) {
      return res.status(403).json({ success: false, message: 'Akses hanya untuk Suku Dinas' });
    }

    const { page = 1, limit = 15, search, category } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      sukuDinasId: sudinId,
      isActive: true,
    };

    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { content: { [Op.like]: `%${search}%` } },
      ];
    }
    if (category) where.category = category;

    const { count, rows } = await AnnouncementSudin.findAndCountAll({
      where,
      order: [['publishDate', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Membuat pengumuman baru
exports.createAnnouncement = async (req, res) => {
  try {
    const sudinId = req.sudin?.id;
    if (!sudinId) return res.status(403).json({ success: false, message: 'Akses ditolak' });

    const { title, content, category = 'Umum', publishDate } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'title dan content wajib diisi' });
    }

    let imageUrl = null;
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => error ? reject(error) : resolve(result)
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      imageUrl = result.secure_url;
    }

    const announcement = await AnnouncementSudin.create({
      title,
      content,
      imageUrl,
      category,
      publishDate: publishDate ? new Date(publishDate) : new Date(),
      sukuDinasId: sudinId,
      createdBy: req.user?.id || null,
    });

    res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. Update pengumuman (hanya milik suku dinas sendiri)
exports.updateAnnouncement = async (req, res) => {
  try {
    const sudinId = req.sudin?.id;
    if (!sudinId) return res.status(403).json({ success: false, message: 'Akses ditolak' });

    const { id } = req.params;
    const { title, content, category, publishDate } = req.body;

    const announcement = await AnnouncementSudin.findOne({
      where: {
        id,
        sukuDinasId: sudinId,
        isActive: true,
      }
    });

    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Pengumuman tidak ditemukan atau bukan milik Anda' });
    }

    // Update field yang dikirim
    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (category) announcement.category = category;
    if (publishDate) announcement.publishDate = new Date(publishDate);

    // Handle upload gambar baru (opsional replace)
    if (req.file) {
      // Hapus gambar lama jika ada
      if (announcement.imageUrl) {
        const publicId = announcement.imageUrl.split('/').pop().split('.')[0];
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.log('Gagal hapus gambar lama:', err.message);
        }
      }

      // Upload gambar baru
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => error ? reject(error) : resolve(result)
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      announcement.imageUrl = result.secure_url;
    }

    await announcement.save();

    res.json({ success: true, data: announcement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. Soft delete pengumuman (hanya milik suku dinas sendiri)
exports.deleteAnnouncement = async (req, res) => {
  try {
    const sudinId = req.sudin?.id;
    if (!sudinId) return res.status(403).json({ success: false, message: 'Akses ditolak' });

    const { id } = req.params;

    const announcement = await AnnouncementSudin.findOne({
      where: {
        id,
        sukuDinasId: sudinId,
        isActive: true,
      }
    });

    if (!announcement) {
      return res.status(404).json({ success: false, message: 'Pengumuman tidak ditemukan atau sudah dihapus' });
    }

    // Hapus gambar dari Cloudinary jika ada
    if (announcement.imageUrl) {
      const publicId = announcement.imageUrl.split('/').pop().split('.')[0];
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.log('Gagal hapus gambar:', err.message);
      }
    }

    // Soft delete
    announcement.isActive = false;
    await announcement.save();

    res.json({ success: true, message: 'Pengumuman berhasil dihapus (soft delete)' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};