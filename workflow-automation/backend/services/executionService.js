const Execution = require('../models/Execution');
const Workflow = require('../models/Workflow');
const Step = require('../models/Step');
const Rule = require('../models/Rule');
const workflowEngine = require('../engines/workflowEngine');
const ruleEngine = require('../engines/ruleEngine');
const logger = require('../utils/logger');
const { validateWorkflowInput } = require('../utils/workflowInputValidator');

const resolveActiveWorkflow = async (workflowId, userId) => {
  const workflowQuery = { id: workflowId };
  if (userId) {
    workflowQuery.created_by = userId;
  }

  const requested = await Workflow.findOne(workflowQuery);
  if (!requested) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }

  if (requested.is_active) {
    return requested;
  }

  const rootWorkflowId = requested.parent_workflow_id || requested.id;
  const activeWorkflowQuery = {
    is_active: true,
    $or: [
      { id: rootWorkflowId },
      { parent_workflow_id: rootWorkflowId }
    ]
  };

  if (userId) {
    activeWorkflowQuery.created_by = userId;
  }

  const activeWorkflow = await Workflow.findOne(activeWorkflowQuery).sort({ version: -1 });

  if (!activeWorkflow) {
    const err = new Error('No active workflow version found');
    err.statusCode = 400;
    throw err;
  }

  return activeWorkflow;
};

const startExecution = async (workflowId, data, userId = 'system_trigger') => {
  const workflow = await resolveActiveWorkflow(workflowId, userId);
  if (!workflow.is_active) {
    const err = new Error('Workflow is not active');
    err.statusCode = 400;
    throw err;
  }
  if (!workflow.start_step_id) {
    const err = new Error('Workflow has no start step defined');
    err.statusCode = 400;
    throw err;
  }

  const steps = await Step.find({ workflow_id: workflow.id });
  const stepIds = steps.map((step) => step.id);
  const rules = await Rule.find({ step_id: { $in: stepIds } });
  const rulesByStep = rules.reduce((acc, rule) => {
    if (!acc[rule.step_id]) acc[rule.step_id] = [];
    acc[rule.step_id].push(rule);
    return acc;
  }, {});

  for (const step of steps) {
    const stepRules = rulesByStep[step.id] || [];
    if (stepRules.length === 0) {
      continue;
    }
    const hasDefault = stepRules.some((rule) => (rule.condition || '').trim().toUpperCase() === 'DEFAULT');
    if (!hasDefault) {
      const err = new Error(`Step "${step.name}" is missing a DEFAULT rule`);
      err.statusCode = 400;
      throw err;
    }
  }

  const validation = validateWorkflowInput(workflow.input_schema, data || {});
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.statusCode = 400;
    err.details = validation.details;
    err.validationErrors = validation.details;
    throw err;
  }

  const resolvedMaxIterations = Number.isFinite(Number(workflow.max_iterations))
    ? Number(workflow.max_iterations)
    : 20;

  const execution = await Execution.create({
    workflow_id: workflow.id,
    workflow_version: workflow.version,
    data: data || {},
    triggered_by: userId || 'system_trigger',
    status: 'pending',
    max_iterations: resolvedMaxIterations,
    iteration_count: 0
  });

  // Run engine asynchronously (non-blocking)
  setImmediate(() => workflowEngine.execute(execution, workflow));

  logger.info('Execution started', { execution_id: execution.id, workflow_id: workflowId });
  return execution;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForExecutionCompletion = async (executionId, timeoutMs = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const execution = await Execution.findOne({ id: executionId });
    if (!execution) {
      const err = new Error('Execution not found');
      err.statusCode = 404;
      throw err;
    }
    if (['completed', 'failed', 'canceled', 'waiting_for_approval'].includes(execution.status)) {
      return { execution, timed_out: false };
    }
    await sleep(500);
  }

  const execution = await Execution.findOne({ id: executionId });
  return { execution, timed_out: true };
};

const triggerExecution = async (workflowId, payload = {}, options = {}) => {
  const workflow = await resolveActiveWorkflow(workflowId, options.userId);
  if (!workflow.is_active) {
    const err = new Error('Workflow is not active');
    err.statusCode = 400;
    throw err;
  }

  const providedSecret = options.triggerSecret || payload.trigger_secret || null;
  if (workflow.trigger_secret && workflow.trigger_secret !== providedSecret) {
    const err = new Error('Invalid trigger secret');
    err.statusCode = 401;
    throw err;
  }

  const execution = await startExecution(workflow.id, payload.data || {}, options.triggeredBy || 'external_trigger');

  if (!options.waitForCompletion) {
    return {
      mode: 'async',
      execution_id: execution.id,
      status: execution.status
    };
  }

  const { execution: finalExecution, timed_out } = await waitForExecutionCompletion(execution.id, options.timeoutMs || 15000);
  return {
    mode: timed_out ? 'timeout' : 'sync',
    execution_id: finalExecution.id,
    status: finalExecution.status,
    data: finalExecution.data,
    timed_out: Boolean(timed_out)
  };
};

const getExecution = async (id, userId) => {
  const query = { id };
  if (userId) {
    query.triggered_by = userId;
  }
  const execution = await Execution.findOne(query);
  if (!execution) {
    const err = new Error('Execution not found');
    err.statusCode = 404;
    throw err;
  }
  return execution;
};

const cancelExecution = async (id, userId) => {
  const query = { id };
  if (userId) {
    query.triggered_by = userId;
  }
  const execution = await Execution.findOne(query);
  if (!execution) {
    const err = new Error('Execution not found');
    err.statusCode = 404;
    throw err;
  }
  if (!['pending', 'in_progress', 'waiting_for_approval'].includes(execution.status)) {
    const err = new Error(`Cannot cancel execution with status: ${execution.status}`);
    err.statusCode = 400;
    throw err;
  }
  const updated = await Execution.findOneAndUpdate(
    { id },
    { status: 'canceled', ended_at: new Date() },
    { new: true }
  );
  logger.info('Execution canceled', { execution_id: id });
  return updated;
};

const retryExecution = async (id, userId) => {
  const query = { id };
  if (userId) {
    query.triggered_by = userId;
  }
  const execution = await Execution.findOne(query);
  if (!execution) {
    const err = new Error('Execution not found');
    err.statusCode = 404;
    throw err;
  }
  if (execution.status === 'completed') {
    const err = new Error('Execution already completed; retry is not allowed');
    err.statusCode = 400;
    throw err;
  }
  if (execution.status !== 'failed') {
    const err = new Error('Only failed executions can be retried');
    err.statusCode = 400;
    throw err;
  }

  const workflow = await Workflow.findOne({ id: execution.workflow_id });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }

  const lastFailedLog = [...(execution.logs || [])].reverse().find((log) => log.status === 'failed' && log.step_id);
  if (!lastFailedLog?.step_id) {
    const err = new Error('No failed step found to retry');
    err.statusCode = 400;
    throw err;
  }

  const retryAttempt = execution.retries + 1;

  const retried = await Execution.findOneAndUpdate(
    { id },
    {
      status: 'pending',
      ended_at: null,
      retries: retryAttempt,
      current_step_id: lastFailedLog.step_id
    },
    { new: true }
  );

  setImmediate(() => workflowEngine.execute(retried, workflow, {
    startStepId: lastFailedLog.step_id,
    isRetry: true,
    retryAttempt,
    retryStepId: lastFailedLog.step_id,
    retryStepName: lastFailedLog.step_name,
    appendLogs: true
  }));
  logger.info('Execution retried', {
    execution_id: id,
    retries: retried.retries,
    retried_step_id: lastFailedLog.step_id,
    retried_step_name: lastFailedLog.step_name
  });
  return retried;
};

const approveExecution = async (id, approverId) => {
  const query = { id };
  if (approverId) {
    query.triggered_by = approverId;
  }
  const execution = await Execution.findOne(query);
  if (!execution) {
    const err = new Error('Execution not found');
    err.statusCode = 404;
    throw err;
  }
  if (execution.status !== 'waiting_for_approval') {
    const err = new Error('Execution is not waiting for approval');
    err.statusCode = 400;
    throw err;
  }

  const approvalStepId = execution.pending_approval?.step_id || execution.current_step_id;
  const step = await Step.findOne({ id: approvalStepId });
  if (!step) {
    const err = new Error('Approval step not found');
    err.statusCode = 404;
    throw err;
  }

  const rules = await Rule.find({ step_id: step.id });
  const { matched, rule, evaluatedRules, errors } = ruleEngine.evaluateRules(rules, execution.data || {});
  const nextStepId = matched && rule ? rule.next_step_id : null;

  await Execution.updateOne(
    { id },
    {
      $push: {
        logs: {
          step_id: step.id,
          step_name: step.name,
          step_type: step.step_type,
          status: 'completed',
          timestamp: new Date(),
          message: `Approval completed for step "${step.name}"`,
          metadata: {
            type: 'approval',
            approval_state: 'completed'
          },
          evaluated_rules: evaluatedRules || [],
          selected_next_step: nextStepId,
          approver_id: approverId,
          decision: 'approved',
          error_message: errors.length ? errors.join(' | ') : null,
          started_at: new Date(),
          ended_at: new Date()
        }
      },
      $set: {
        status: 'pending',
        pending_approval: {
          execution_id: null,
          step_id: null,
          approver_email: null,
          requested_at: null
        }
      }
    }
  );

  const workflow = await Workflow.findOne({ id: execution.workflow_id });
  if (!workflow) {
    const err = new Error('Workflow not found');
    err.statusCode = 404;
    throw err;
  }

  const refreshedExecution = await Execution.findOne({ id });
  setImmediate(() => workflowEngine.execute(refreshedExecution, workflow, { startStepId: nextStepId }));

  logger.info('Execution approved and resumed', {
    execution_id: id,
    step_id: step.id,
    approver_id: approverId,
    next_step_id: nextStepId
  });

  return refreshedExecution;
};

const rejectExecution = async (id, approverId) => {
  const query = { id };
  if (approverId) {
    query.triggered_by = approverId;
  }
  const execution = await Execution.findOne(query);
  if (!execution) {
    const err = new Error('Execution not found');
    err.statusCode = 404;
    throw err;
  }
  if (execution.status !== 'waiting_for_approval') {
    const err = new Error('Execution is not waiting for approval');
    err.statusCode = 400;
    throw err;
  }

  const approvalStepId = execution.pending_approval?.step_id || execution.current_step_id;
  const step = await Step.findOne({ id: approvalStepId });
  if (!step) {
    const err = new Error('Approval step not found');
    err.statusCode = 404;
    throw err;
  }

  const rejectionStepId = step.metadata?.rejection_step_id || null;

  await Execution.updateOne(
    { id },
    {
      $push: {
        logs: {
          step_id: step.id,
          step_name: step.name,
          step_type: step.step_type,
          status: rejectionStepId ? 'completed' : 'failed',
          timestamp: new Date(),
          message: `Approval rejected for step "${step.name}"`,
          metadata: {
            type: 'approval',
            approval_state: 'completed'
          },
          evaluated_rules: [],
          selected_next_step: rejectionStepId,
          approver_id: approverId,
          decision: 'rejected',
          error_message: rejectionStepId ? null : 'Execution rejected by approver',
          started_at: new Date(),
          ended_at: new Date()
        }
      },
      $set: {
        status: rejectionStepId ? 'pending' : 'failed',
        current_step_id: rejectionStepId || step.id,
        ended_at: rejectionStepId ? null : new Date(),
        pending_approval: {
          execution_id: null,
          step_id: null,
          approver_email: null,
          requested_at: null
        }
      }
    }
  );

  const updated = await Execution.findOne({ id });

  if (rejectionStepId) {
    const workflow = await Workflow.findOne({ id: execution.workflow_id });
    if (!workflow) {
      const err = new Error('Workflow not found');
      err.statusCode = 404;
      throw err;
    }
    setImmediate(() => workflowEngine.execute(updated, workflow, { startStepId: rejectionStepId }));
  }

  logger.info('Execution rejected', {
    execution_id: id,
    step_id: step.id,
    approver_id: approverId,
    rejection_step_id: rejectionStepId
  });

  return updated;
};

const listExecutions = async ({ page = 1, limit = 10, workflow_id, status }, userId) => {
  const query = {};
  if (userId) {
    query.triggered_by = userId;
  }
  if (workflow_id) query.workflow_id = workflow_id;
  if (status) query.status = status;
  const skip = (page - 1) * limit;
  const [executions, total] = await Promise.all([
    Execution.find(query).sort({ created_at: -1 }).skip(skip).limit(Number(limit)),
    Execution.countDocuments(query)
  ]);
  return { executions, total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) };
};

module.exports = {
  startExecution,
  triggerExecution,
  getExecution,
  cancelExecution,
  retryExecution,
  approveExecution,
  rejectExecution,
  listExecutions
};
