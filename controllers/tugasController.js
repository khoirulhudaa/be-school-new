const { Op } = require('sequelize');
const Tugas = require('../models/tugas');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// 1. TAMBAH TUGAS
exports.createTugas = async (req, res) => {
  try {
    const { 
      judul, namaGuru, emailGuru, deskripsi, jenisSoal, 
      nilaiMinimal, linkEksternal, hari, tanggal, deadlineJam 
    } = req.body;

    let fileUrl = null;
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'school_tasks', resource_type: 'auto' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      fileUrl = result.secure_url;
    }

    const tugas = await Tugas.create({
      judul, namaGuru, emailGuru, deskripsi, jenisSoal,
      nilaiMinimal, linkEksternal, hari, tanggal, deadlineJam,
      fileUrl,
      schoolId: req.user.id
    });

    res.status(201).json({ success: true, message: 'Tugas berhasil dibuat', data: tugas });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. GET SEMUA TUGAS (Filter per sekolah)
exports.getAllTugas = async (req, res) => {
  try {
    const { guru, mapel, jenis, schoolId } = req.query;
    
    // Syarat utama: hanya mengambil data milik sekolah yang login
    let whereCondition = { schoolId };

    // Filter Nama Guru (Search partial)
    if (guru) {
      whereCondition.namaGuru = { [Op.iLike]: `%${guru}%` };
    }

    // Filter Mata Pelajaran (Search partial)
    if (mapel) {
      whereCondition.mataPelajaran = { [Op.iLike]: `%${mapel}%` };
    }

    // Filter Jenis Soal (Exact match)
    if (jenis) {
      whereCondition.jenisSoal = jenis;
    }

    const tugas = await Tugas.findAll({ 
      where: whereCondition,
      order: [
        ['tanggal', 'DESC'], 
        ['deadlineJam', 'DESC']
      ]
    });

    res.json({ 
      success: true, 
      count: tugas.length, 
      data: tugas 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memuat tugas: ' + err.message });
  }
};

// 3. GET DETAIL TUGAS
exports.getTugasById = async (req, res) => {
  try {
    const tugas = await Tugas.findOne({ where: { id: req.params.id, schoolId: req.user.id } });
    if (!tugas) return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan' });
    res.json({ success: true, data: tugas });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. UPDATE TUGAS
exports.updateTugas = async (req, res) => {
  try {
    const tugas = await Tugas.findOne({ where: { id: req.params.id, schoolId: req.user.id } });
    if (!tugas) return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan' });

    await tugas.update(req.body);
    res.json({ success: true, message: 'Tugas berhasil diperbarui', data: tugas });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 5. HAPUS TUGAS
exports.deleteTugas = async (req, res) => {
  try {
    const deleted = await Tugas.destroy({ where: { id: req.params.id, schoolId: req.user.id } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan' });
    res.json({ success: true, message: 'Tugas berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};