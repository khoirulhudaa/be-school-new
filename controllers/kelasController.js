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

exports.createClass = async (req, res) => {
  try {
    const { schoolId, className } = req.body;
    const newClass = await Class.create({ schoolId, className });
    res.json({ success: true, data: newClass });
  } catch (err) {
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