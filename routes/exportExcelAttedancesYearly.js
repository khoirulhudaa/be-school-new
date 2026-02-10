const express = require('express');
const studentController = require('../controllers/siswaController');

const router = express.Router();

router.get('/export-attendance/:id', studentController.exportUserAttendance);

module.exports = router;