const router = require('express').Router();
const step = require('../controllers/stepController');
const rule = require('../controllers/ruleController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.put('/:id', step.update);
router.delete('/:id', step.remove);

// Rules nested under step
router.post('/:step_id/rules', rule.add);
router.get('/:step_id/rules', rule.list);

module.exports = router;
