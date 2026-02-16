// routes/authSudinRoutes.js
const express = require('express');
const router = express.Router();

const authCtrl = require('../controllers/authUserSudinController');

// Public routes (tidak perlu autentikasi)
router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);

// Optional: refresh token
// router.post('/refresh', authCtrl.refreshToken);

module.exports = router;