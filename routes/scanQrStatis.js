const express = require('express');
const router = express.Router();
const scanQrController = require('../controllers/scanQrCodeStatis');
const scanQrMiddleware = require('../middlewares/scanQrStatis');

router.post('/', scanQrMiddleware, scanQrController.scanSelf);

module.exports = router;