const express = require('express');
const multer = require('multer');
const authController = require('../controllers/authController');

const router = express.Router();

// Gunakan memory storage (sama dengan alumni)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // limit 5MB
});

// Routes
router.post('/register', upload.single('logo'), authController.registerSchool);
router.post('/login', authController.login);

module.exports = router;