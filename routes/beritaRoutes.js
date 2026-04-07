const express = require('express');
const multer = require('multer');
const newsController = require('../controllers/beritaController');
const { globalLimiter } = require('../middlewares/rateLimiter');
const optionalAuth = require('../middlewares/optionalLimiter');

const router = express.Router();

// Gunakan memory storage karena upload ke Cloudinary dari buffer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes News
router.get('/', optionalAuth, globalLimiter, newsController.getAllNews);
router.post('/', upload.single('imageUrl'), newsController.createNews);
router.put('/:id', upload.single('imageUrl'), newsController.updateNews);
router.delete('/:id', newsController.deleteNews);

module.exports = router;