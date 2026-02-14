const express = require('express');
const router = express.Router();
const parentController = require('../controllers/orangTuaController');

router.get('/', parentController.getAllParents);
router.post('/', parentController.createParent);
router.put('/:id', parentController.updateParent);
router.delete('/:id', parentController.deleteParent);
// Tambahkan route delete jika diperlukan (Soft Delete recommended)

module.exports = router;