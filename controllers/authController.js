const SchoolAccount = require('../models/auth'); // Pastikan path model benar
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Config Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- REGISTER ---
exports.registerSchool = async (req, res) => {
  try {
    const { npsn, schoolName, address, email, password, adminName, latitude, longitude } = req.body;

    // Cek email/npsn duplikat
    const existing = await SchoolAccount.findOne({ where: { email } });
    if (existing) return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });

    let logoUrl = null;
    if (req.file) {
      // Upload ke Cloudinary dari buffer menggunakan streamifier
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'school_logos', resource_type: 'image' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      logoUrl = result.secure_url;
    }

    const newSchool = await SchoolAccount.create({
      npsn,
      schoolName,
      address,
      latitude,
      longitude,
      email,
      password, // Di-hash otomatis oleh hook model
      adminName,
      logoUrl,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Registrasi sekolah berhasil',
      data: { id: newSchool.id, schoolName: newSchool.schoolName }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- LOGIN ---
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
    }

    const user = await SchoolAccount.findOne({ where: { email } });
    
    // Gunakan method validPassword dari model
    if (!user || !(await user.validPassword(password))) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Akun dinonaktifkan' });
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user.id, schoolId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.json({
      success: true,
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        username: user.adminName,
        email: user.email,
        schoolName: user.schoolName,
        logoUrl: user.logoUrl,
        lat: user.latitude,
        long: user.longitude,
        role: 'Admin'
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};