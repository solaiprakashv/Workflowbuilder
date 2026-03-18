const executionService = require('../services/executionService');
const { executeSchema } = require('../utils/validators');

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

module.exports = { execute, getStatus, cancel, retry, approve, reject, list };
