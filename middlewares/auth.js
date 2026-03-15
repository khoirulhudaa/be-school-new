const jwt = require('jsonwebtoken');
const SchoolAccount = require('../models/auth');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Berisi { id, schoolId } sesuai saat login
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalid' });
  }
};

const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Cek apakah ada token di header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Anda belum login' });
    }

    // 2. Verifikasi Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Cari user di database berdasarkan ID dari token
    const user = await SchoolAccount.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User sudah tidak ada' });
    }

    // 4. Masukkan data user ke dalam object request (req)
    // Di sinilah req.user.id berasal!
    req.user = user; 

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid' });
  }
};

module.exports = {protect}