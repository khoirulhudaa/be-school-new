// routes/alumniRoutes.js
const express = require('express');
const multer = require('multer');
const alumniController = require('../controllers/alumniController');
const { globalLimiter } = require('../middlewares/rateLimiter');
const optionalAuth = require('../middlewares/optionalLimiter');

const router = express.Router();

// Gunakan memory storage karena upload ke Cloudinary, bukan disk
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes
router.get('/', optionalAuth, globalLimiter, alumniController.getAllAlumni);
router.post('/', upload.single('photo'), alumniController.createAlumni);
router.put('/:id', upload.single('photo'), alumniController.updateAlumni);
router.delete('/:id', alumniController.deleteAlumni);
router.post('/alumni-display', alumniController.updateAlumniDisplay);
router.get('/get-alumni-display/:schoolId', optionalAuth, globalLimiter, alumniController.getAlumniDisplaySetting);
router.get('/find', optionalAuth, globalLimiter, alumniController.getAlumniByIds);

// Aksi verifikasi
router.patch('/:id/approve', alumniController.approveAlumni);

module.exports = router;