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
router.get('/', studentController.getAllStudents); // Sesuai fetch di frontend tadi
router.post('/', upload.single('photo'), studentController.createStudent);
router.put('/:id', upload.single('photo'), studentController.updateStudent);
router.delete('/:id', studentController.deleteStudent);

// --- API ABSENSI ---
// Endpoint: /api/siswa/scan
router.post('/scan', studentController.scanQRCode);

// Endpoint Laporan & Export (Perbaikan ejaan: attendance)
router.get('/attendance-report', studentController.getAttendanceReport);
router.get('/export-attendance', studentController.exportAttendanceExcel);

module.exports = router;