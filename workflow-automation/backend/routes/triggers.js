const router = require('express').Router();
const trigger = require('../controllers/triggerController');

router.post('/:workflow_id', trigger.executeTrigger);

module.exports = router;
