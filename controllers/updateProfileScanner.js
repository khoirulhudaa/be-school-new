const GuruTendik = require("../models/guruTendik");
const Student = require("../models/siswa");
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper: Optimasi Gambar Jangka Panjang
const processPhotoUpload = (buffer, schoolId, identifier, role) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `sekolah_${schoolId}/${role}`,
        public_id: `photo_${identifier}`,
        overwrite: true,
        transformation: [
          { width: 400, height: 400, crop: 'thumb', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

exports.updateMyProfile = async (req, res) => {
  try {
    const user = req.user; // dari JWT
    const { name, email, nis, nisn, nip, oldPassword, newPassword } = req.body;

    let dataToUpdate = {};

    if (name) {
        if (user.role === 'siswa') {
            dataToUpdate.name = name; 
        } else {
            dataToUpdate.nama = name; 
        }
    }

    // ========================
    // VALIDASI EMAIL
    // ========================
    if (email) {
      if (user.role === 'siswa') {
        const exist = await Student.findOne({
          where: {
            email,
            id: { [Op.ne]: user.id }
          }
        });
        if (exist) {
          return res.status(400).json({
            success: false,
            message: "Email sudah digunakan siswa lain"
          });
        }
      } else {
        const exist = await GuruTendik.findOne({
          where: {
            email,
            id: { [Op.ne]: user.id }
          }
        });
        if (exist) {
          return res.status(400).json({
            success: false,
            message: "Email sudah digunakan"
          });
        }
      }

      dataToUpdate.email = email;
    }

    // ========================
    // UPDATE PASSWORD
    // ========================
    if (oldPassword && newPassword) {
        let currentUser;

        if (user.role === 'siswa') {
            currentUser = await Student.findByPk(user.id);
        } else {
            currentUser = await GuruTendik.findByPk(user.id);
        }

        // cek password lama
        const isMatch = await bcrypt.compare(oldPassword, currentUser.password || '');
        if (!isMatch) {
            return res.status(400).json({
            success: false,
            message: "Password lama tidak sesuai"
            });
        }

        // hash password baru
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        dataToUpdate.password = hashedPassword;
    }

    // ========================
    // ROLE: SISWA
    // ========================
    if (user.role === 'siswa') {

      if (nis && nis !== user.nis) {
        const existNis = await Student.findOne({
          where: {
            schoolId: user.schoolId,
            nis,
            id: { [Op.ne]: user.id }
          }
        });

        if (existNis) {
          return res.status(400).json({
            success: false,
            message: `NIS ${nis} sudah digunakan`
          });
        }

        dataToUpdate.nis = nis;
      }

      if (nisn && nisn !== user.nisn) {
        const existNisn = await Student.findOne({
          where: {
            nisn,
            id: { [Op.ne]: user.id }
          }
        });

        if (existNisn) {
          return res.status(400).json({
            success: false,
            message: `NISN ${nisn} sudah digunakan`
          });
        }

        dataToUpdate.nisn = nisn;
      }

      await Student.update(dataToUpdate, {
        where: { id: user.id }
      });

    } else {
      // ========================
      // ROLE: GURU
      // ========================
      if (nip && nip !== user.nip) {
        const existNip = await GuruTendik.findOne({
          where: {
            nip,
            id: { [Op.ne]: user.id }
          }
        });

        if (existNip) {
          return res.status(400).json({
            success: false,
            message: `NIP ${nip} sudah digunakan`
          });
        }

        dataToUpdate.nip = nip;
      }

      await GuruTendik.update(dataToUpdate, {
        where: { id: user.id }
      });
    }

    let updatedUser;

    if (user.role === 'siswa') {
    updatedUser = await Student.findByPk(user.id, {
        attributes: { exclude: ['password'] }
    });
    } else {
    updatedUser = await GuruTendik.findByPk(user.id, {
        attributes: { exclude: ['password'] }
    });
    }

    res.json({
        success: true,
        message: "Profile berhasil diupdate",
        data: updatedUser,// <-- INI PENTING,
        passwordBARU: newPassword,
        passwordLama: oldPassword,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};


exports.updateMyPhoto = async (req, res) => {
  try {
    const user = req.user;

    // =========================
    // VALIDASI FILE
    // =========================
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File foto wajib diupload"
      });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: "File harus berupa gambar"
      });
    }

    // =========================
    // TENTUKAN MODEL & IDENTIFIER
    // =========================
    const isSiswa = user.role === 'siswa';
    const Model = isSiswa ? Student : GuruTendik;

    const identifier = isSiswa
      ? user.nis
      : (user.nip || user.id);

    const roleFolder = isSiswa ? 'siswa' : 'guru';

    // =========================
    // UPLOAD KE CLOUDINARY
    // =========================
    let photoUrl = await processPhotoUpload(
      req.file.buffer,
      user.schoolId,
      identifier,
      roleFolder
    );

    // cache busting (biar langsung update di FE)
    photoUrl = photoUrl + `?t=${Date.now()}`;

    // =========================
    // UPDATE DATABASE
    // =========================
    await Model.update(
      { photoUrl },
      { where: { id: user.id } }
    );

    // =========================
    // AMBIL DATA TERBARU
    // =========================
    const updatedUser = await Model.findByPk(user.id, {
      attributes: { exclude: ['password'] }
    });

    // =========================
    // RESPONSE
    // =========================
    res.json({
      success: true,
      message: "Foto berhasil diupdate",
      data: updatedUser
    });

  } catch (err) {
    console.error("Update Photo Error:", err);

    res.status(500).json({
      success: false,
      message: "Gagal mengupdate foto"
    });
  }
};