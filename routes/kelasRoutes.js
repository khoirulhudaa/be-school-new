const express = require('express');
const router = express.Router();
const kelasController = require('../controllers/kelasController');

router.get('/', kelasController.getAllClasses);
router.post('/', kelasController.createClass);
router.put('/:id', kelasController.updateClass);
router.delete('/:id/:schoolId', kelasController.deleteClass);

module.exports = router;