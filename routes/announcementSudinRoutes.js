const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const announcementCtrl = require('../controllers/announcementSudinController');

// Middleware autentikasi khusus sudin (sesuaikan)
const { protectSudin } = require('../middlewares/sudinAuth');

router.use(protectSudin);

router.get('/', announcementCtrl.getAnnouncementsForSudin);
router.post('/', upload.single('image'), announcementCtrl.createAnnouncement);
router.put('/:id', upload.single('image'), announcementCtrl.updateAnnouncement);
router.delete('/:id', announcementCtrl.deleteAnnouncement);

module.exports = router;