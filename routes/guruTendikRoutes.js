// routes/guruTendikRoutes.js
const express = require('express');
const multer = require('multer');
const guruTendikController = require('../controllers/guruTendikController');
const siswaController = require('../controllers/siswaController');
const cache = require('../middlewares/cache');

const router = express.Router();

// Memory storage untuk Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes
router.get('/', cache(120), guruTendikController.getAllGuruTendik);
router.post('/login', guruTendikController.checkGuruAuth);
router.post('/mark-absence', siswaController.markAbsence);
router.get('/detail/:id', siswaController.getUserDetail);
router.get('/absensi', cache(120), siswaController.getAllTeachers);
router.post('/', upload.single('photo'), guruTendikController.createGuruTendik);
router.put('/:id', upload.single('photo'), guruTendikController.updateGuruTendik);
router.delete('/:id', guruTendikController.deleteGuruTendik);

module.exports = router;