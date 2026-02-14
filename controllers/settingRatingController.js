const Setting = require('../models/settingRating');

exports.getSettings = async (req, res) => {
  try {
    const { schoolId } = req.query;

    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId required' });
    }

    // Cari setting, jika belum ada buat default ON (true)
    const [setting] = await Setting.findOrCreate({
      where: { schoolId: parseInt(schoolId) },
      defaults: { showRatingStats: true }
    });

    res.json({ success: true, data: setting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { schoolId, showRatingStats } = req.body;

    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId required' });
    }

    // Update jika ada, Insert jika tidak ada
    await Setting.upsert({
      schoolId: parseInt(schoolId),
      showRatingStats: showRatingStats // nilai boolean true/false
    });

    res.json({ success: true, message: 'Pengaturan visibilitas berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};