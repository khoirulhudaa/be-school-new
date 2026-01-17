const express = require('express');
const multer = require('multer');
const kegiatanPramukaController = require('../controllers/kegiatanPramukaController');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

// GET    /kegiatan-pramuka?schoolId=xx
router.get('/', kegiatanPramukaController.getAllKegiatan);

// POST   /kegiatan-pramuka       (multipart/form-data, field 'image' opsional)
router.post('/', upload.single('imageUrl'), kegiatanPramukaController.createKegiatan);

// PUT    /kegiatan-pramuka/:id   (image opsional)
router.put('/:id', upload.single('imageUrl'), kegiatanPramukaController.updateKegiatan);

// DELETE /kegiatan-pramuka/:id
router.delete('/:id', kegiatanPramukaController.deleteKegiatan);

module.exports = router;