const express = require('express');
const router = express.Router();
const sekolahController = require('../controllers/authController');

// Mengambil semua sekolah (Support filter ?status= & ?name=)
// Endpoint: GET /api/sekolah
router.get('/', sekolahController.getAllSchools);

// Mengambil statistik dashboard
// Endpoint: GET /api/sekolah/stats
router.get('/stats', sekolahController.getDashboardStats); 

// Update status (Aktif/Nonaktif)
// Endpoint: PUT /api/sekolah/status
router.put('/status', sekolahController.updateSchoolStatus);

module.exports = router;