const SchoolAccount = require('../models/auth');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Op } = require('sequelize');

// --- CONFIGURATIONS ---

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Nodemailer Config
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: Kirim Email
const sendEmail = async (to, subject, htmlContent) => {
  await transporter.sendMail({
    from: `"Sistem Admin Sekolah" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
  });
};

// --- CONTROLLERS ---

// 1. REGISTER SEKOLAH + KIRIM PIN
exports.registerSchool = async (req, res) => {
  try {
    const { npsn, schoolName, address, email, password, adminName, latitude, longitude } = req.body;

    // Cek duplikasi
    const existing = await SchoolAccount.findOne({ where: { [Op.or]: [{ email }, { npsn }] } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email atau NPSN sudah terdaftar' });
    }

    // Upload Logo ke Cloudinary jika ada
    let logoUrl = null;
    if (req.file) {
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

    // Generate 6 Digit PIN
    const verificationPin = Math.floor(100000 + Math.random() * 900000).toString();

    const newSchool = await SchoolAccount.create({
      npsn,
      schoolName,
      address,
      latitude,
      longitude,
      email,
      password,
      adminName,
      logoUrl,
      verificationPin,
      isVerified: false,
      isActive: true
    });

    // Kirim PIN ke Email
    const emailTemplate = `
    <div style="background-color: #f4f7f6; padding: 40px 10px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333;">
      <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        
        <div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); padding: 30px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">Verifikasi Akun</h1>
        </div>

        <div style="padding: 40px 30px; text-align: center;">
          <p style="font-size: 16px; color: #666; margin-bottom: 10px;">Halo, <strong style="color: #1e3c72;">${adminName}</strong></p>
          <p style="font-size: 15px; color: #888; line-height: 1.6;">Terima kasih telah bergabung. Gunakan kode PIN di bawah ini untuk menyelesaikan pendaftaran akun sekolah Anda.</p>
          
          <div style="margin: 30px 0; padding: 20px; background-color: #f8fafd; border: 2px dashed #cbd5e0; border-radius: 8px;">
            <span style="font-size: 36px; font-weight: bold; color: #1e3c72; letter-spacing: 10px; font-family: monospace;">${verificationPin}</span>
          </div>

          <p style="font-size: 13px; color: #a0aec0; margin-top: 20px;">*Kode bersifat rahasi. Mohon tidak membagikan kode ini kepada siapa pun!</p>
        </div>

        <div style="background-color: #fcfcfc; padding: 20px; text-align: center; border-top: 1px solid #f0f0f0;">
          <p style="font-size: 12px; color: #999; margin: 0;">© 2026 Sistem Admin Sekolah. All rights reserved.</p>
        </div>
      </div>
    </div>
    `;

    // Kirim Email
    await sendEmail(email, 'Konfirmasi PIN Verifikasi Sekolah', emailTemplate);

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil. Silakan cek email Anda untuk kode verifikasi PIN.',
      data: { id: newSchool.id, email: newSchool.email }
    });
  } catch (err) {
    // Cek jika error berasal dari Validasi Sequelize
    if (err.name === 'SequelizeValidationError') {
      const messages = err.errors.map((e) => {
        if (e.path === 'npsn') return 'NPSN harus berjumlah antara 8 hingga 16 karakter angka';
        return e.message;
      });
      return res.status(400).json({ success: false, message: messages[0] });
    }

    // Cek jika error duplikasi (Unique Constraint)
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'NPSN atau Email sudah terdaftar' });
    }

    res.status(500).json({ success: false, message: err });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await SchoolAccount.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });

    // Format data agar sama dengan struktur yang diharapkan Frontend (Vokadash)
    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.adminName,
        email: user.email,
        role: "admin", // Hardcoded sesuai kebutuhan frontend
        sekolah: {
          id: user.id,
          namaSekolah: user.schoolName,
          npsn: user.npsn,
          address: user.address,
          nameProvince: 'DKI Jakarta',
          file: user.logoUrl // Logo dari Cloudinary
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. VERIFIKASI PIN
exports.verifyPin = async (req, res) => {
  try {
    const { email, pin } = req.body;

    const user = await SchoolAccount.findOne({ where: { email, verificationPin: pin } });

    if (!user) {
      return res.status(400).json({ success: false, message: 'PIN salah atau email tidak ditemukan' });
    }

    user.isVerified = true;
    user.verificationPin = null; // Hapus PIN setelah verifikasi
    await user.save();

    res.json({ success: true, message: 'Akun berhasil diverifikasi. Silakan login.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- FORGOT PASSWORD ---
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await SchoolAccount.findOne({ where: { email } });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Email tidak ditemukan' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 Jam
    await user.save();

    // Sesuaikan dengan URL Frontend Anda
    const resetUrl = `https://admin.kiraproject.id/auth/reset-password/${resetToken}`;

    // Template Email Premium
    const emailHtml = `
      <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: white; padding: 40px 0; color: #1f2937;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <tr>
            <td style="padding: 40px 24px 20px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; color: #111827;">Atur Ulang Password</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 30px 24px; text-align: center;">
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #4b5563;">
                Halo, kami menerima permintaan untuk mengatur ulang password akun <strong>Dashboard</strong> Anda.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 40px 24px; text-align: center;">
              <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
                Reset Password Sekarang
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 24px 30px 24px; text-align: center;">
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #9ca3af;">
                Link ini hanya berlaku selama 60 menit
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 24px; background-color: #f3f4f6; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                &copy; 2026 Vokadash Team. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </div>
    `;

    await sendEmail(email, 'Reset Kata Sandi', emailHtml);

    res.json({ success: true, message: 'Instruksi reset password telah dikirim ke email' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// --- RESET PASSWORD ---
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const user = await SchoolAccount.findOne({ 
      where: { 
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: Date.now() } 
      } 
    });

    if (!user) return res.status(400).json({ success: false, message: 'Token tidak valid atau kadaluarsa' });

    user.password = newPassword; // Hook beforeUpdate akan otomatis menghash ini
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ success: true, message: 'Password berhasil diperbarui' });
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

// --- UPDATE PROFILE (HANYA NAMA & EMAIL) ---
exports.updateProfile = async (req, res) => {
  try {
    const { adminName, email } = req.body;
    
    // 1. Cari user berdasarkan ID dari token (req.user.id dari middleware protect)
    const user = await SchoolAccount.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Akun tidak ditemukan' });
    }

    // 2. Validasi Email (Cek jika email baru sudah dipakai akun lain)
    if (email && email !== user.email) {
      const emailExists = await SchoolAccount.findOne({ where: { email } });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Email sudah digunakan oleh akun lain' });
      }
      user.email = email;
    }

    // 3. Update Nama Admin
    if (adminName) {
      user.adminName = adminName;
    }

    // Simpan perubahan
    await user.save();

    res.json({
      success: true,
      message: 'Profil administrator berhasil diperbarui',
      data: {
        adminName: user.adminName,
        email: user.email
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memperbarui profil: ' + err.message });
  }
};