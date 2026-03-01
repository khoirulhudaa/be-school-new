// routes/alumniRoutes.js
const express = require('express');
const multer = require('multer');
const alumniController = require('../controllers/alumniController');
const submissionController = require('../controllers/alumniSubmitController');

const router = express.Router();

// Gunakan memory storage karena upload ke Cloudinary, bukan disk
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes
router.get('/', alumniController.getAllAlumni);
router.post('/', upload.single('photo'), alumniController.createAlumni);
router.put('/:id', upload.single('photo'), alumniController.updateAlumni);
router.delete('/:id', alumniController.deleteAlumni);


// Lihat pendaftar yang butuh verifikasi
router.post('/register', submissionController.submitAlumni);
router.get('/submissions', submissionController.getPendingSubmissions);
// Aksi verifikasi
router.patch('/submissions/:id/approve', submissionController.approveSubmission);
router.patch('/submissions/:id/reject', submissionController.rejectSubmission);

module.exports = router;