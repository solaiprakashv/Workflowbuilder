const Workflow = require('../models/Workflow');
const Step = require('../models/Step');
const Rule = require('../models/Rule');
const WorkflowVersion = require('../models/WorkflowVersion');
const logger = require('../utils/logger');

const INVALID_MAX_ITERATIONS_MESSAGE = 'Invalid max_iterations value. It must be a positive integer.';

const validateMaxIterations = (value) => {
  const isValid = Number.isInteger(value) && value >= 1 && value <= 1000;
  if (!isValid) {
    const err = new Error(INVALID_MAX_ITERATIONS_MESSAGE);
    err.statusCode = 400;
    err.invalidMaxIterations = true;
    throw err;
  }
};

const getRootWorkflowId = (workflow) => workflow.parent_workflow_id || workflow.id;

const buildStepsWithRules = async (workflowId) => {
  const steps = await Step.find({ workflow_id: workflowId }).sort({ order: 1 });
  const stepIds = steps.map((s) => s.id);
  const rules = await Rule.find({ step_id: { $in: stepIds } }).sort({ priority: 1 });
  return steps.map((step) => ({
    ...step.toObject(),
    rules: rules.filter((r) => r.step_id === step.id)
  }));
};

const saveVersionSnapshot = async (workflow, userId) => {
  const steps = await buildStepsWithRules(workflow.id);
  await WorkflowVersion.create({
    workflow_id: getRootWorkflowId(workflow),
    version: workflow.version,
    snapshot: { ...workflow.toObject(), steps },
    created_by: userId
  });
};

const createWorkflow = async (data, userId) => {
  const maxIterations = data.max_iterations ?? 20;
  validateMaxIterations(maxIterations);

  const workflow = await Workflow.create({
    ...data,
    max_iterations: maxIterations,
    created_by: userId,
    parent_workflow_id: null
  });
  await saveVersionSnapshot(workflow, userId);
  logger.info('Workflow created', { workflow_id: workflow.id, name: workflow.name });
  return workflow;
};

const listWorkflows = async ({ page = 1, limit = 10, search = '', is_active }, userId) => {
  const parsedPage = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.max(Number(limit) || 10, 1);
  const normalizedSearch = (search || '').trim();

  const query = {};
  if (userId) {
    query.created_by = userId;
  }
  if (normalizedSearch) {
    query.name = { $regex: normalizedSearch, $options: 'i' };
  }
  if (is_active === 'true' || is_active === true) {
    query.is_active = true;
  } else if (is_active === 'false' || is_active === false) {
    query.is_active = false;
  }

  const skip = (parsedPage - 1) * parsedLimit;
  const [workflows, total] = await Promise.all([
    Workflow.find(query).sort({ created_at: -1 }).skip(skip).limit(parsedLimit),
    Workflow.countDocuments(query)
  ]);

  return {
    data: workflows,
    page: parsedPage,
    limit: parsedLimit,
    total,
    total_pages: Math.max(Math.ceil(total / parsedLimit), 1)
  };
};

const getWorkflowById = async (id, userId) => {
  const query = { id };
  if (userId) {
    query.created_by = userId;
  }
  const workflow = await Workflow.findOne(query);
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }
  const stepsWithRules = await buildStepsWithRules(id);
  return { ...workflow.toObject(), steps: stepsWithRules };
};

const updateWorkflow = async (id, data, userId) => {
  const query = { id };
  if (userId) {
    query.created_by = userId;
  }
  const previousWorkflow = await Workflow.findOne(query);
  if (!previousWorkflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }

  if (data.max_iterations !== undefined) {
    validateMaxIterations(data.max_iterations);
  }

  const rootWorkflowId = getRootWorkflowId(previousWorkflow);
  const newVersion = previousWorkflow.version + 1;

  const existingSteps = await Step.find({ workflow_id: previousWorkflow.id });
  const existingRules = await Rule.find({ step_id: { $in: existingSteps.map((step) => step.id) } });

  const nextWorkflowData = {
    name: data.name ?? previousWorkflow.name,
    input_schema: data.input_schema ?? previousWorkflow.input_schema,
    max_iterations: data.max_iterations ?? previousWorkflow.max_iterations,
    trigger_secret: data.trigger_secret !== undefined ? data.trigger_secret : previousWorkflow.trigger_secret,
    version: newVersion,
    is_active: true,
    parent_workflow_id: rootWorkflowId,
    created_by: previousWorkflow.created_by
  };

  const newWorkflow = await Workflow.create(nextWorkflowData);

  const oldToNewStepId = new Map();
  for (const step of existingSteps) {
    const createdStep = await Step.create({
      workflow_id: newWorkflow.id,
      name: step.name,
      step_type: step.step_type,
      order: step.order,
      metadata: step.metadata || {}
    });
    oldToNewStepId.set(step.id, createdStep.id);
  }

  for (const rule of existingRules) {
    await Rule.create({
      step_id: oldToNewStepId.get(rule.step_id),
      condition: rule.condition,
      next_step_id: rule.next_step_id ? oldToNewStepId.get(rule.next_step_id) || null : null,
      priority: rule.priority
    });
  }

  const previousStartStepId = previousWorkflow.start_step_id;
  const requestedStartStepId = data.start_step_id;
  const resolvedStartStepId = requestedStartStepId
    ? (oldToNewStepId.get(requestedStartStepId) || requestedStartStepId)
    : (previousStartStepId ? oldToNewStepId.get(previousStartStepId) || null : null);

  await Workflow.updateOne(
    { id: newWorkflow.id },
    { start_step_id: resolvedStartStepId }
  );

  await Workflow.updateOne(
    { id: previousWorkflow.id },
    { is_active: false }
  );

  const finalizedWorkflow = await Workflow.findOne({ id: newWorkflow.id });
  await saveVersionSnapshot(finalizedWorkflow, userId || previousWorkflow.created_by);
  logger.info('Workflow version created', {
    previous_workflow_id: previousWorkflow.id,
    workflow_id: finalizedWorkflow.id,
    root_workflow_id: rootWorkflowId,
    new_version: newVersion
  });
  return finalizedWorkflow;
};

const deleteWorkflow = async (id, userId) => {
  const query = { id };
  if (userId) {
    query.created_by = userId;
  }
  const workflow = await Workflow.findOne(query);
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }
  const steps = await Step.find({ workflow_id: id });
  const stepIds = steps.map((s) => s.id);
  await Rule.deleteMany({ step_id: { $in: stepIds } });
  await Step.deleteMany({ workflow_id: id });
  await WorkflowVersion.deleteMany({ workflow_id: id });
  await Workflow.deleteOne({ id });
  logger.info('Workflow deleted', { workflow_id: id });
};

const getVersionHistory = async (workflowId, userId) => {
  const query = { id: workflowId };
  if (userId) {
    query.created_by = userId;
  }
  const workflow = await Workflow.findOne(query);
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }
  const rootWorkflowId = getRootWorkflowId(workflow);
  const versions = await WorkflowVersion.find({ workflow_id: rootWorkflowId })
    .sort({ version: -1 })
    .select('-snapshot');
  return versions;
};

const getVersionSnapshot = async (workflowId, version, userId) => {
  const query = { id: workflowId };
  if (userId) {
    query.created_by = userId;
  }
  const workflow = await Workflow.findOne(query);
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }
  const rootWorkflowId = getRootWorkflowId(workflow);
  const v = await WorkflowVersion.findOne({ workflow_id: rootWorkflowId, version: Number(version) });
  if (!v) {
    const err = new Error('Version not found');
    err.statusCode = 404;
    throw err;
  }
  return v.snapshot;
};

module.exports = {
  createWorkflow, listWorkflows, getWorkflowById,
  updateWorkflow, deleteWorkflow, getVersionHistory, getVersionSnapshot
};
