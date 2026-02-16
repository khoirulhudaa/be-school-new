const express = require('express');
const router = express.Router();

const assignCtrl = require('../controllers/assignSchoolSudinController');

const { protectSudin } = require('../middlewares/sudinAuth');

router.use(protectSudin);

router.post('/assign', assignCtrl.assignSchools);
router.get('/:sukuDinasId/schools', assignCtrl.getAssignedSchools);

module.exports = router;