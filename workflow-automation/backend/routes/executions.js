const router = require('express').Router();
const exec = require('../controllers/executionController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', exec.list);
router.get('/:id', exec.getStatus);
router.post('/:id/cancel', exec.cancel);
router.post('/:id/retry', exec.retry);
router.post('/:id/approve', exec.approve);
router.post('/:id/reject', exec.reject);

module.exports = router;
