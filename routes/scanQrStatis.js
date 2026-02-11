const express = require('express');
const router = express.Router();
const scanQrController = require('../controllers/scanQrCodeStatis');

router.post('/', scanQrController.scanSelf);

module.exports = router;