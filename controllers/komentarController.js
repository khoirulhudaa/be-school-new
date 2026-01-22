const Comment = require('../models/komentar');

exports.getAllComments = async (req, res) => {
  try {
    const { schoolId } = req.query;

    if (!schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'schoolId wajib disertakan di query' 
      });
    }

    const comments = await Comment.findAll({
        schoolId: parseInt(schoolId),
        order: [['createdAt', 'DESC']],
    });

    res.json({ success: true, data: comments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createComment = async (req, res) => {
  try {
    const { userId, email, name, comment, rating } = req.body;
    if (!userId || !email || !name || !comment || !rating) {
      return res.status(400).json({ success: false, message: 'userId, email, name, comment, dan rating wajib diisi' });
    }

    const newComment = await Comment.create({ 
      userId: parseInt(userId),
      email: parseInt(email),
      name,
      comment,
      rating: parseInt(rating),
    });

    res.json({ success: true, data: newComment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await Comment.findByPk(id);
    if (!comment) return res.status(404).json({ success: false, message: 'Komentar tidak ditemukan' });

    await comment.destroy();
    res.json({ success: true, message: 'Komentar berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};