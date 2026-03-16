const router = require('express').Router();
const wf = require('../controllers/workflowController');
const step = require('../controllers/stepController');
const exec = require('../controllers/executionController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/', wf.create);
router.get('/', wf.list);
router.get('/:id', wf.getById);
router.put('/:id', wf.update);
router.delete('/:id', wf.remove);

// Version history
router.get('/:id/versions', wf.getVersionHistory);
router.get('/:id/versions/:version', wf.getVersionSnapshot);

// Steps nested under workflow
router.post('/:workflow_id/steps', step.add);
router.get('/:workflow_id/steps', step.list);

// Execute workflow
router.post('/:workflow_id/execute', exec.execute);

module.exports = router;
