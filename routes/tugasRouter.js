const express = require('express');
const router = express.Router();
const multer = require('multer');
const tugasController = require('../controllers/tugasController');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/', tugasController.createTugas);
router.get('/', tugasController.getAllTugas);
router.get('/:id', tugasController.getTugasById);
router.put('/:id', tugasController.updateTugas);
router.delete('/:id', tugasController.deleteTugas);

module.exports = router;