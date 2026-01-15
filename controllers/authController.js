const User = require('../models/auth');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  try {
    const { username, email, password, fullName, role, schoolId } = req.body;

    if (!username || !email || !password || !schoolId) {
      return res.status(400).json({ success: false, message: 'username, email, password, schoolId wajib diisi' });
    }

    // Cek duplikat
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });
    }

    const newUser = await User.create({
      username,
      email,
      password,           // akan di-hash otomatis oleh hook
      fullName,
      role: role || 'user',
      schoolId: parseInt(schoolId),
    });

    // Generate JWT
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, schoolId: newUser.schoolId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        schoolId: newUser.schoolId,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email dan password wajib diisi' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !await user.validPassword(password)) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Akun dinonaktifkan' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, schoolId: user.schoolId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.json({
      success: true,
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { register, login };