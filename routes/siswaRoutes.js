const express = require('express');
const multer = require('multer');
const studentController = require('../controllers/siswaController');

const router = express.Router();

// Gunakan memory storage agar buffer bisa dikirim langsung ke Cloudinary
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Batas 5MB sesuai UI frontend
});

// --- API SISWA ---
// Endpoint: /api/siswa
router.get('/search', studentController.getStudentSearch);
router.get('/', studentController.getAllStudents); // Sesuai fetch di frontend tadi
router.post('/', upload.single('photo'), studentController.createStudent);
router.post('/login', studentController.checkStudentAuth);
router.put('/:id', upload.single('photo'), studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);

// --- API ABSENSI ---
// Endpoint: /api/siswa/scan
router.post('/scan', studentController.scanQRCode);

// Mark Absence (Izin, Sakit, Alpha - Satuan atau Bulk)
router.post('/mark-absence', studentController.markAbsence);
router.get('/detail/:id', studentController.getUserDetail);
// --- 3. API STATISTIK & LAPORAN ---

// Statistik Dashboard (Hadir, Sakit, Izin, Alpha hari ini)
router.get('/today-stats', studentController.getTodayStats);
router.get('/summary-attendances', studentController.getAttendanceSummary);

// Endpoint Laporan & Export (Perbaikan ejaan: attendance)
router.get('/attendance-report', studentController.getAttendanceReport);
router.get('/export-attendance', studentController.exportAttendanceExcel);

module.exports = router;