const Step = require('../models/Step');
const Rule = require('../models/Rule');
const Workflow = require('../models/Workflow');
const logger = require('../utils/logger');

const addStep = async (workflowId, data) => {
  const workflow = await Workflow.findOne({ id: workflowId });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }
  const step = await Step.create({ ...data, workflow_id: workflowId });
  logger.info('Step added', { step_id: step.id, workflow_id: workflowId });
  return step;
};

const listSteps = async (workflowId) => {
  const steps = await Step.find({ workflow_id: workflowId }).sort({ order: 1 });
  return steps;
};

const updateStep = async (id, data) => {
  const step = await Step.findOneAndUpdate({ id }, data, { new: true });
  if (!step) {
    const err = new Error('Step not found');
    err.statusCode = 404;
    throw err;
  }
  logger.info('Step updated', { step_id: id });
  return step;
};

const deleteStep = async (id) => {
  const step = await Step.findOne({ id });
  if (!step) {
    const err = new Error('Step not found');
    err.statusCode = 404;
    throw err;
  }
  await Rule.deleteMany({ step_id: id });
  await Step.deleteOne({ id });
  logger.info('Step deleted', { step_id: id });
};

module.exports = { addStep, listSteps, updateStep, deleteStep };
