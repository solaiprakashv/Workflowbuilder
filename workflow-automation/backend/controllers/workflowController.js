const workflowService = require('../services/workflowService');
const { workflowSchema } = require('../utils/validators');

const create = async (req, res, next) => {
  try {
    const data = workflowSchema.parse(req.body);
    const workflow = await workflowService.createWorkflow(data, req.user.id);
    res.status(201).json({ success: true, data: workflow });
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const { page, limit, search, is_active } = req.query;
    const result = await workflowService.listWorkflows({ page, limit, search, is_active });
    res.json(result);
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const workflow = await workflowService.getWorkflowById(req.params.id);
    res.json({ success: true, data: workflow });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const data = workflowSchema.partial().parse(req.body);
    const workflow = await workflowService.updateWorkflow(req.params.id, data, req.user.id);
    res.json({ success: true, data: workflow });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await workflowService.deleteWorkflow(req.params.id);
    res.json({ success: true, message: 'Workflow deleted' });
  } catch (err) { next(err); }
};

const getVersionHistory = async (req, res, next) => {
  try {
    const versions = await workflowService.getVersionHistory(req.params.id);
    res.json({ success: true, data: versions });
  } catch (err) { next(err); }
};

const getVersionSnapshot = async (req, res, next) => {
  try {
    const snapshot = await workflowService.getVersionSnapshot(req.params.id, req.params.version);
    res.json({ success: true, data: snapshot });
  } catch (err) { next(err); }
};

module.exports = { create, list, getById, update, remove, getVersionHistory, getVersionSnapshot };
