// controllers/authSudinController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const UserSudin = require('../models/userSudin');
const SukuDinas = require('../models/SukuDinas');

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      sukuDinasId: user.sukuDinasId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

exports.register = async (req, res) => {
  try {
    const { nama, email, password, sukuDinasId, role = 'operator_sudin' } = req.body;

    if (!nama || !email || !password || !sukuDinasId) {
      return res.status(400).json({
        success: false,
        message: 'nama, email, password, dan sukuDinasId wajib diisi',
      });
    }

    // Cek apakah email sudah terdaftar
    const existingUser = await UserSudin.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Email sudah terdaftar',
      });
    }

    // Cek apakah sukuDinasId valid
    const sudin = await SukuDinas.findByPk(sukuDinasId);
    if (!sudin) {
      return res.status(404).json({
        success: false,
        message: 'Suku Dinas tidak ditemukan',
      });
    }

    // Buat user baru
    const user = await UserSudin.create({
      nama,
      email,
      password,
      sukuDinasId,
      role,
    });

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Akun Suku Dinas berhasil dibuat',
      data: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        sukuDinasId: user.sukuDinasId,
        role: user.role,
        token,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal mendaftar', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email dan password wajib diisi',
      });
    }

    // Cari user
    const user = await UserSudin.findOne({
      where: { email, isActive: true },
      include: [{ model: SukuDinas, attributes: ['id', 'namaSudin', 'kodeSudin'] }],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email atau password salah',
      });
    }

    // Cek password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email atau password salah',
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        sukuDinasId: user.sukuDinasId,
        namaSudin: user.SukuDinas?.namaSudin,
        role: user.role,
        token,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal login', error: err.message });
  }
};

// Optional: refresh token (jika pakai refresh token)
exports.refreshToken = async (req, res) => {
  // implementasi sesuai kebutuhan (bisa pakai refresh token terpisah)
};