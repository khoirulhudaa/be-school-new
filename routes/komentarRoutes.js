const express = require('express');
const komentarController = require('../controllers/komentarController');

const router = express.Router();

// Routes
router.get('/', komentarController.getAllComments);
router.post('/', komentarController.createComment);
router.delete('/:id', komentarController.deleteComment);

module.exports = router;