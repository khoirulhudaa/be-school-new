const Class = require('../models/kelas');

exports.getAllClasses = async (req, res) => {
  try {
    const { schoolId } = req.query;
    const classes = await Class.findAll({ 
      where: { schoolId },
      order: [['className', 'ASC']] 
    });
    res.json({ success: true, data: classes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// exports.createClass = async (req, res) => {
//   try {
//     const { schoolId, className } = req.body;
//     const newClass = await Class.create({ schoolId, className });
//     res.json({ success: true, data: newClass });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };



exports.getAllClasses = async (req, res) => {
  try {
    const { schoolId } = req.query;
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId diperlukan' });
    }

    const classes = await Class.findAll({ 
      where: { schoolId },
      order: [['className', 'ASC']] 
    });
    
    res.json({ success: true, data: classes });
  } catch (err) {
    console.error('Error getAllClasses:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { schoolId, className } = req.body;

    // 1. Validasi input wajib
    if (!schoolId || !className?.trim()) {
      return res.status(400).json({ 
        success: false, 
        message: 'schoolId dan className wajib diisi' 
      });
    }

    const normalizedName = className.trim();

    // 2. Cek duplikat (MySQL default case-insensitive)
    const existing = await Class.findOne({
      where: {
        schoolId,
        className: normalizedName   // ← ini sudah cukup di MySQL (case-insensitive)
      }
    });

    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: `Kelas sudah pernah dibuat!` 
      });
    }

    // 3. Buat data baru
    const newClass = await Class.create({ 
      schoolId, 
      className: normalizedName 
    });

    res.status(201).json({ success: true, data: newClass });
  } catch (err) {
    console.error('Error createClass:', err);
    
    // Tangani error unique constraint jika Anda sudah tambahkan index di DB
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        success: false, 
        message: 'Nama kelas sudah digunakan untuk sekolah ini (duplikat)' 
      });
    }

    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const { id } = req.params;
    await Class.update(req.body, { where: { id } });
    res.json({ success: true, message: "Kelas diperbarui" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { id, schoolId } = req.params;
    await Class.destroy({ where: { id, schoolId } });
    res.json({ success: true, message: "Kelas dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};