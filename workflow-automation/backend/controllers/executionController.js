const executionService = require('../services/executionService');
const { executeSchema } = require('../utils/validators');
const { verifyApprovalActionToken } = require('../utils/approvalActionToken');

const execute = async (req, res, next) => {
  try {
    const { data } = executeSchema.parse(req.body);
    const execution = await executionService.startExecution(req.params.workflow_id, data, req.user.id);
    res.status(201).json({ success: true, data: execution });
  } catch (err) { next(err); }
};

const getStatus = async (req, res, next) => {
  try {
    const execution = await executionService.getExecution(req.params.id, req.user.id);
    res.json({ success: true, data: execution });
  } catch (err) { next(err); }
};

const cancel = async (req, res, next) => {
  try {
    const execution = await executionService.cancelExecution(req.params.id, req.user.id);
    res.json({ success: true, data: execution });
  } catch (err) { next(err); }
};

const retry = async (req, res, next) => {
  try {
    const execution = await executionService.retryExecution(req.params.id, req.user.id);
    res.json({ success: true, data: execution });
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    const execution = await executionService.approveExecution(req.params.id, req.user.id);
    res.json({ success: true, data: execution });
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    const execution = await executionService.rejectExecution(req.params.id, req.user.id);
    res.json({ success: true, data: execution });
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const { page, limit, workflow_id, status } = req.query;
    const result = await executionService.listExecutions({ page, limit, workflow_id, status }, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

const emailAction = async (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(400).send('<h3>Missing action token</h3>');
    }

    const payload = verifyApprovalActionToken(token);
    const action = String(payload.action || '').toLowerCase();
    const executionId = payload.execution_id;
    const expectedStepId = payload.step_id;

    if (!executionId || !['approve', 'reject'].includes(action)) {
      return res.status(400).send('<h3>Invalid approval link</h3>');
    }

    if (action === 'approve') {
      await executionService.approveExecution(executionId, null, { expectedStepId });
      return res.send('<h3>Approved successfully ✅</h3><p>You can close this tab.</p>');
    }

    await executionService.rejectExecution(executionId, null, { expectedStepId });
    return res.send('<h3>Rejected successfully ❌</h3><p>You can close this tab.</p>');
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).send('<h3>Approval link expired</h3><p>Please request a new approval email.</p>');
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).send('<h3>Invalid approval link</h3>');
    }
    return next(err);
  }
};

module.exports = { execute, getStatus, cancel, retry, approve, reject, list, emailAction };
