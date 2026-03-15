const SchoolAccount = require('../models/auth');

// 1. CREATE ADMIN BARU
exports.createAdmin = async (req, res) => {
  try {
    const { adminName, email, password, role } = req.body;
    
    // Ambil data sekolah dari admin yang sedang login (req.user)
    const creator = await SchoolAccount.findByPk(req.user.id);

    // Cek apakah email sudah dipakai (Email harus unik di seluruh sistem)
    const existingEmail = await SchoolAccount.findOne({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });
    }

    // Buat admin baru dengan NPSN dan data sekolah yang SAMA
    const newAdmin = await SchoolAccount.create({
      npsn: creator.npsn,
      schoolName: creator.schoolName,
      address: creator.address,
      latitude: creator.latitude,
      longitude: creator.longitude,
      logoUrl: creator.logoUrl,
      email,
      password, // Akan ter-hash otomatis oleh hook beforeCreate
      adminName,
      role: role || 'admin_staff', // Role pembeda
      isVerified: true, // Langsung aktif karena dibuat oleh admin utama
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Admin tambahan berhasil dibuat',
      data: { id: newAdmin.id, email: newAdmin.email, adminName: newAdmin.adminName }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 2. GET SEMUA ADMIN DI SEKOLAH TERSEBUT
exports.getAdminsBySchool = async (req, res) => {
  try {
    const currentUser = await SchoolAccount.findByPk(req.user.id);
    
    // Cari semua user yang memiliki NPSN yang sama
    const admins = await SchoolAccount.findAll({
      where: { npsn: currentUser.npsn },
      attributes: ['id', 'adminName', 'email', 'role', 'isActive', 'lastLogin']
    });

    res.json({ success: true, data: admins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 3. UPDATE ADMIN
exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminName, email, isActive } = req.body;
    const currentUser = await SchoolAccount.findByPk(req.user.id);

    const adminToUpdate = await SchoolAccount.findOne({ 
      where: { id, npsn: currentUser.npsn } 
    });

    if (!adminToUpdate) return res.status(404).json({ success: false, message: 'Admin tidak ditemukan' });

    if (adminName) adminToUpdate.adminName = adminName;
    if (email) adminToUpdate.email = email;
    if (isActive !== undefined) adminToUpdate.isActive = isActive;

    await adminToUpdate.save();
    res.json({ success: true, message: 'Data admin berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 4. DELETE ADMIN
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = await SchoolAccount.findByPk(req.user.id);

    // Jangan biarkan admin menghapus dirinya sendiri di menu CRUD
    if (id == req.user.id) {
      return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun sendiri' });
    }

    const deleted = await SchoolAccount.destroy({
      where: { id, npsn: currentUser.npsn }
    });

    if (!deleted) return res.status(404).json({ success: false, message: 'Admin tidak ditemukan' });
    res.json({ success: true, message: 'Admin berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};