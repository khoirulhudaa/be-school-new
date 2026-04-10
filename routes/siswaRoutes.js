const express = require('express');
const multer = require('multer');
const studentController = require('../controllers/siswaController');
const { protectForSiswa } = require('../middlewares/protectForSiswa');
const cache = require('../middlewares/cache');
const { loginLimiter, globalLimiter } = require('../middlewares/rateLimiter');
const optionalAuth = require('../middlewares/optionalLimiter');

const router = express.Router();

// Gunakan memory storage agar buffer bisa dikirim langsung ke Cloudinary
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Batas 5MB sesuai UI frontend
});

// --- API SISWA ---
// Endpoint: /api/siswa
router.get('/search', studentController.getStudentSearch);
router.get('/', cache(120), studentController.getAllStudents); // Sesuai fetch di frontend tadi
router.get('/all-no-pagination', studentController.getAllStudentsNoPagination);
router.post('/', upload.single('photo'), studentController.createStudent);
router.post('/bulk', studentController.bulkCreateStudents);
router.post('/login', loginLimiter, studentController.checkStudentAuth);
router.put('/:id', upload.single('photo'), studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);
router.get('/:parentId/anak', studentController.getParentChildren);

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
router.get('/attendance-report', optionalAuth, globalLimiter, studentController.getAttendanceReport);
router.get('/export-attendance', studentController.exportAttendanceExcel);
router.get('/recap-kelas', optionalAuth, globalLimiter, studentController.getClassRecapWithDetails);
router.get('/global-stats', optionalAuth, globalLimiter, studentController.getGlobalAttendanceStats);

router.post('/process-graduation', studentController.processGraduation);

module.exports = router;