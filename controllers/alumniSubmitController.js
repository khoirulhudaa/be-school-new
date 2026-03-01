const AlumniSubmission = require('../models/alumniSubmit');
const Alumni = require('../models/alumni');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Helper untuk upload ke Cloudinary
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'alumni_submissions' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

// 1. User mendaftar (Masuk ke tabel submission)
exports.submitAlumni = async (req, res) => {
  try {
    const { name, graduationYear, description, schoolId } = req.body;

    let photoUrl = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      photoUrl = result.secure_url;
    }

    const submission = await AlumniSubmission.create({
      name,
      graduationYear: parseInt(graduationYear),
      description,
      photoUrl,
      schoolId: parseInt(schoolId),
      status: 'pending'
    });

    res.status(201).json({ 
      success: true, 
      message: 'Profil berhasil dikirim dan menunggu verifikasi admin.',
      data: submission 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. Admin melihat semua pendaftar yang pending
exports.getPendingSubmissions = async (req, res) => {
  try {
    const { schoolId } = req.query;
    const submissions = await AlumniSubmission.findAll({
      where: { schoolId, status: 'pending' },
      order: [['createdAt', 'ASC']]
    });
    res.json({ success: true, data: submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. Admin Approve (Pindah dari Submission ke Alumni Utama)
exports.approveSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await AlumniSubmission.findByPk(id);

    if (!sub) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    // Buat di tabel Alumni Utama
    await Alumni.create({
      name: sub.name,
      graduationYear: sub.graduationYear,
      description: sub.description,
      photoUrl: sub.photoUrl,
      schoolId: sub.schoolId,
      isActive: true
    });

    // Update status atau hapus data submission
    sub.status = 'approved';
    await sub.save();
    // Atau jika ingin langsung dihapus: await sub.destroy();

    res.json({ success: true, message: 'Alumni berhasil diverifikasi dan dipublikasikan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. Admin Reject
exports.rejectSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const sub = await AlumniSubmission.findByPk(id);
    
    if (!sub) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    sub.status = 'rejected';
    await sub.save();

    res.json({ success: true, message: 'Pendaftaran ditolak' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};