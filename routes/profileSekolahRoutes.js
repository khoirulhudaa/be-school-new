// routes/schoolProfileRoutes.js
const express = require('express');
const multer = require('multer');
const schoolProfileController = require('../controllers/profileSekolahController');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/', schoolProfileController.getSchoolProfile);
router.post('/', upload.single('photoHeadmasterUrl'), schoolProfileController.createSchoolProfile);
router.put('/:id', upload.single('photoHeadmasterUrl'), schoolProfileController.updateSchoolProfile);
router.delete('/:id', schoolProfileController.deleteSchoolProfile);

module.exports = router;