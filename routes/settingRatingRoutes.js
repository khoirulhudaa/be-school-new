const express = require('express');
const router = express.Router();
const settingRatingController = require('../controllers/settingRatingController');

router.get('/', settingRatingController.getSettings);
router.post('/', settingRatingController.updateSettings);

module.exports = router;