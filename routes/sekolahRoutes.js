const express = require('express');
const router = express.Router();
const sekolahController = require('../controllers/authController');

router.get('/', sekolahController.getAllSchools);
router.get('/stats', sekolahController.getDashboardStats); 
router.get('/paged', sekolahController.getAllSchoolsPaginated);
router.put('/status', sekolahController.updateSchoolStatus);

module.exports = router;