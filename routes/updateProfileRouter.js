const express = require('express');
const multer = require('multer');
const { protectMultiRole } = require('../middlewares/protectMultiRole');
const profileController = require('../controllers/updateProfileScanner')
const router = express.Router();

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } 
});

router.put('/me/biodata', protectMultiRole, profileController.updateMyProfile);
router.post('/me/photo', protectMultiRole, upload.single('photo'), profileController.updateMyPhoto);

module.exports = router;