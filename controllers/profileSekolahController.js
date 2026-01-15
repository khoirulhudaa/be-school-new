// controllers/schoolProfileController.js
const SchoolProfile = require('../models/profileSekolah');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Mendapatkan Profil Sekolah
 * Jika data tidak ada, tetap return 200 dengan data null
 */
exports.getSchoolProfile = async (req, res) => {
  try {
    const { schoolId } = req.query;

    if (!schoolId) {
      return res.status(400).json({ 
        success: false, 
        message: 'schoolId wajib disertakan di query parameter' 
      });
    }

    const profile = await SchoolProfile.findOne({
      where: { 
        schoolId: parseInt(schoolId),
        isActive: true 
      },
    });

    // Perubahan: Gunakan status 200 meskipun data null agar tidak dikira error endpoint
    return res.status(200).json({ 
      success: true, 
      message: profile ? 'Profil berhasil ditemukan' : 'Profil belum dibuat untuk sekolah ini',
      data: profile || null 
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createSchoolProfile = async (req, res) => {
  try {
    const { 
      schoolId, heroTitle, heroSubTitle, linkYoutube, headmasterWelcome, headmasterName, schoolName,
      studentCount, teacherCount, roomCount, achievementCount, latitude, longitude 
    } = req.body;

    if (!schoolId || !heroTitle || !headmasterWelcome || !headmasterName || !schoolName) {
      return res.status(400).json({ 
        success: false, 
        message: 'schoolId, heroTitle, headmasterWelcome, headmasterName, dan schoolName wajib diisi' 
      });
    }

    const existing = await SchoolProfile.findOne({ where: { schoolId: parseInt(schoolId) } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Profil untuk schoolId ini sudah ada' });
    }

    let photoHeadmasterUrl = null;
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'image', folder: 'school_profiles' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      photoHeadmasterUrl = result.secure_url;
    }

    const newProfile = await SchoolProfile.create({ 
      schoolId: parseInt(schoolId),
      heroTitle, 
      heroSubTitle, 
      linkYoutube, 
      headmasterWelcome, 
      headmasterName, 
      schoolName,
      photoHeadmasterUrl,
      studentCount: parseInt(studentCount) || 0,
      teacherCount: parseInt(teacherCount) || 0,
      roomCount: parseInt(roomCount) || 0,
      achievementCount: parseInt(achievementCount) || 0,
      latitude: parseFloat(latitude) || null,
      longitude: parseFloat(longitude) || null,
    });

    res.status(201).json({ success: true, data: newProfile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSchoolProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await SchoolProfile.findByPk(id);
    
    if (!profile) {
      return res.status(200).json({ success: false, message: 'Gagal update: Data tidak ditemukan' });
    }

    const { 
      heroTitle, heroSubTitle, linkYoutube, headmasterWelcome, headmasterName, schoolName,
      studentCount, teacherCount, roomCount, achievementCount, latitude, longitude 
    } = req.body;

    // Update fields
    if (heroTitle) profile.heroTitle = heroTitle;
    if (heroSubTitle) profile.heroSubTitle = heroSubTitle;
    if (linkYoutube) profile.linkYoutube = linkYoutube;
    if (headmasterWelcome) profile.headmasterWelcome = headmasterWelcome;
    if (headmasterName) profile.headmasterName = headmasterName;
    if (schoolName) profile.schoolName = schoolName;

    if (studentCount !== undefined) profile.studentCount = parseInt(studentCount) || 0;
    if (teacherCount !== undefined) profile.teacherCount = parseInt(teacherCount) || 0;
    if (roomCount !== undefined) profile.roomCount = parseInt(roomCount) || 0;
    if (achievementCount !== undefined) profile.achievementCount = parseInt(achievementCount) || 0;
    if (latitude !== undefined) profile.latitude = parseFloat(latitude) || null;
    if (longitude !== undefined) profile.longitude = parseFloat(longitude) || null;

    if (req.file) {
      if (profile.photoHeadmasterUrl) {
        const publicId = profile.photoHeadmasterUrl.split('/').pop().split('.')[0];
        try {
          await cloudinary.uploader.destroy(`school_profiles/${publicId}`);
        } catch (err) {
          console.log(`Gagal hapus foto lama: ${err.message}`);
        }
      }

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'image', folder: 'school_profiles' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
      });
      profile.photoHeadmasterUrl = result.secure_url;
    }

    await profile.save();
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteSchoolProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const profile = await SchoolProfile.findByPk(id);

    if (!profile) {
      return res.status(200).json({ success: false, message: 'Data sudah tidak ada atau tidak ditemukan' });
    }

    // Soft delete logic
    profile.isActive = false;
    await profile.save();

    res.json({ success: true, message: 'Profil sekolah berhasil dinonaktifkan' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};