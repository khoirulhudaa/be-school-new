const express = require('express');
const router = express.Router();
const scanQrController = require('../controllers/scanQrCodeStatis');
const scanQrMiddleware = require('../middlewares/scanQrStatis');

router.post('/', scanQrMiddleware, scanQrController.scanSelf);
router.post('/login-qr', scanQrController.loginWithQR);   // atau siswaController.loginWithQR
router.post('/login-qr-new', scanQrController.loginWithQRNew);   // atau siswaController.loginWithQR

module.exports = router;