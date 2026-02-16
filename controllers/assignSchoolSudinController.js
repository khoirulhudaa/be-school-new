const SchoolSukuDinas = require('../models/SchoolSukuDinas');

exports.assignSchools = async (req, res) => {
  try {
    const { sukuDinasId, schoolIds } = req.body;

    if (!sukuDinasId || !Array.isArray(schoolIds) || schoolIds.length === 0) {
      return res.status(400).json({ success: false, message: 'sukuDinasId dan schoolIds (array) wajib diisi' });
    }

    const records = schoolIds.map(schoolId => ({
      schoolId,
      sukuDinasId,
      assignedBy: req.user?.id || null,
    }));

    await SchoolSukuDinas.bulkCreate(records, {
      ignoreDuplicates: true, // hindari error duplicate key
    });

    res.json({
      success: true,
      message: `Berhasil mengassign ${schoolIds.length} sekolah ke suku dinas`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAssignedSchools = async (req, res) => {
  try {
    const { sukuDinasId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await SchoolSukuDinas.findAndCountAll({
      where: { sukuDinasId },
      include: [
        {
          model: require('../../sekolah/models/Sekolah'), // sesuaikan path model sekolah
          attributes: ['id', 'namaSekolah', 'npsn', 'alamatSekolah'],
          as: 'sekolah'
        }
      ],
      limit: parseInt(limit),
      offset,
      order: [['assignedAt', 'DESC']],
    });

    res.json({
      success: true,
      data: rows.map(r => r.sekolah),
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