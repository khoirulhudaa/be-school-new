const Parent = require('../models/orangTua');
const Student = require('../models/siswa');
const { Op } = require('sequelize');

// --- 1. CREATE ---
exports.createParent = async (req, res) => {
  try {
    const { name, gender, relationStatus, type, phoneNumber, schoolId, studentIds } = req.body;

    const existing = await Parent.findOne({ where: { phoneNumber } });
    if (existing) return res.status(400).json({ success: false, message: "Nomor ini sudah terdaftar" });

    const newParent = await Parent.create({
      name, gender, relationStatus, type, phoneNumber, schoolId: parseInt(schoolId)
    });

    // Hubungkan siswa ke orang tua ini
    if (studentIds && Array.isArray(studentIds)) {
      await Student.update(
        { parentId: newParent.id },
        { where: { id: { [Op.in]: studentIds } } }
      );
    }

    res.json({ success: true, data: newParent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- 2. GET ALL ---
exports.getAllParents = async (req, res) => {
  try {
    const { schoolId, name } = req.query;
    let condition = { schoolId: parseInt(schoolId), isActive: true };
    if (name) condition.name = { [Op.like]: `%${name}%` };

    const data = await Parent.findAll({
      where: condition,
      include: [{
        model: Student,
        as: 'children',
        attributes: ['id', 'name', 'class', 'nis']
      }],
      order: [['name', 'ASC']]
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- 3. UPDATE ---
exports.updateParent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, gender, relationStatus, type, phoneNumber, studentIds } = req.body;

    await Parent.update(
      { name, gender, relationStatus, type, phoneNumber },
      { where: { id } }
    );

    if (studentIds) {
      // Step 1: Kosongkan dulu anak-anak yang sebelumnya terhubung ke ortu ini
      await Student.update({ parentId: null }, { where: { parentId: id } });
      // Step 2: Hubungkan anak-anak baru berdasarkan list studentIds
      await Student.update({ parentId: id }, { where: { id: { [Op.in]: studentIds } } });
    }

    res.json({ success: true, message: "Data berhasil diperbarui" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- 4. DELETE (Soft Delete) ---
exports.deleteParent = async (req, res) => {
  try {
    const { id } = req.params;
    // Set non-aktif
    await Parent.update({ isActive: false }, { where: { id } });
    // Lepas relasi anak agar siswa bisa didaftarkan ke ortu lain (misal ortu satunya)
    await Student.update({ parentId: null }, { where: { parentId: id } });

    res.json({ success: true, message: "Data orang tua berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};