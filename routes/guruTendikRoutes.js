// routes/guruTendikRoutes.js
const express = require('express');
const multer = require('multer');
const guruTendikController = require('../controllers/guruTendikController');

const router = express.Router();

// Memory storage untuk Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes
router.get('/', guruTendikController.getAllGuruTendik);
router.post('/', upload.single('photo'), guruTendikController.createGuruTendik);
router.put('/:id', upload.single('photo'), guruTendikController.updateGuruTendik);
router.delete('/:id', guruTendikController.deleteGuruTendik);

module.exports = router;