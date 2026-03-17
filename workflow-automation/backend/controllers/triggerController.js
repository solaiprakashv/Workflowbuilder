const executionService = require('../services/executionService');
const { triggerExecuteSchema } = require('../utils/validators');

const executeTrigger = async (req, res, next) => {
  try {
    const payload = triggerExecuteSchema.parse(req.body || {});
    const triggerSecret = req.headers['x-trigger-secret'] || payload.trigger_secret;

    const result = await executionService.triggerExecution(req.params.workflow_id, payload, {
      triggerSecret,
      waitForCompletion: payload.wait_for_completion,
      timeoutMs: payload.timeout_ms,
      triggeredBy: 'external_webhook'
    });

    res.status(202).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { executeTrigger };
