const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user ke req (tanpa password)
      req.user = {
        id: decoded.id,
        role: decoded.role,
        schoolId: decoded.schoolId,
      };

      next();
    } catch (err) {
      console.error('Token invalid:', err.message);
      return res.status(401).json({ success: false, message: 'Token tidak valid atau kadaluarsa' });
    }
  } else {
    return res.status(401).json({ success: false, message: 'Tidak ada token, akses ditolak' });
  }
};

// Middleware opsional: cek role (misal hanya admin/guru)
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki izin akses' });
    }
    next();
  };
};

module.exports = { protect, restrictTo };