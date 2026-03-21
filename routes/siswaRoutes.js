const express = require('express');
const multer = require('multer');
const studentController = require('../controllers/siswaController');
const { protectForSiswa } = require('../middlewares/protectForSiswa');
const cache = require('../middlewares/cache');
const redisClient = require('../config/redis');

const router = express.Router();

// Gunakan memory storage agar buffer bisa dikirim langsung ke Cloudinary
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Batas 5MB sesuai UI frontend
});

// --- API SISWA ---
// Endpoint: /api/siswa
router.get('/search', cache(180), studentController.getStudentSearch);
router.get('/', cache(120), studentController.getAllStudents); // Sesuai fetch di frontend tadi
router.get('/all-no-pagination', studentController.getAllStudentsNoPagination);
router.post('/', upload.single('photo'), studentController.createStudent);
router.post('/login', studentController.checkStudentAuth);
router.put('/:id', upload.single('photo'), studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);

// --- API ABSENSI ---
// Endpoint: /api/siswa/scan
router.post('/scan', studentController.scanQRCode);
router.get('/get-attendances', protectForSiswa, studentController.getStudentAttendance);

router.get('/validate-qr', studentController.validateUserByQR);

// Mark Absence (Izin, Sakit, Alpha - Satuan atau Bulk)
router.post('/mark-absence', studentController.markAbsence);
router.get('/detail/:id', studentController.getUserDetail);
// --- 3. API STATISTIK & LAPORAN ---

// Statistik Dashboard (Hadir, Sakit, Izin, Alpha hari ini)
router.get('/today-stats', cache(90), studentController.getTodayStats);
router.get('/summary-attendances', cache(60), studentController.getAttendanceSummary);
router.get('/early-warning', studentController.getEarlyWarningReport);
router.get('/hall-of-fame', cache(300), studentController.getPublicHallOfFame);

// Endpoint Laporan & Export (Perbaikan ejaan: attendance)
router.get('/attendance-report', studentController.getAttendanceReport);
router.get('/export-attendance', studentController.exportAttendanceExcel);

router.post('/process-graduation', studentController.processGraduation);
// Tambahkan di atas, setelah const router = express.Router();
router.get('/test-redis', async (req, res) => {
  try {
    // Test koneksi & operasi sederhana
    await redisClient.set('test_key', 'Redis works! 🚀', { EX: 60 }); // expire 60 detik
    const value = await redisClient.get('test_key');

    if (value === 'Redis works! 🚀') {
      return res.json({
        status: 'success',
        message: 'Redis connected & working perfectly!',
        value_from_redis: value,
        redis_ready: redisClient.isReady,     // true kalau ready
        redis_open: redisClient.isOpen,       // true kalau socket open
      });
    } else {
      return res.status(500).json({ status: 'error', message: 'Redis set/get gagal' });
    }
  } catch (err) {
    console.error('Test Redis error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Redis error: ' + err.message,
    });
  }
});

module.exports = router;