const router = require('express').Router();
const rule = require('../controllers/ruleController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.put('/:id', rule.update);
router.delete('/:id', rule.remove);

module.exports = router;
