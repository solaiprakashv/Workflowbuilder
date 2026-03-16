const Execution = require('../models/Execution');
const Step = require('../models/Step');
const Rule = require('../models/Rule');
const ruleEngine = require('./ruleEngine');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');

class WorkflowEngine {
  async execute(execution, workflow, options = {}) {
    try {
      const startStepId = options.startStepId || execution.current_step_id || workflow.start_step_id;
      const maxIterations = Number.isFinite(Number(execution.max_iterations))
        ? Number(execution.max_iterations)
        : 20;

      execution.status = 'in_progress';
      if (!execution.started_at) {
        execution.started_at = new Date();
      }
      execution.current_step_id = startStepId;
      execution.iteration_count = Number(execution.iteration_count || 0);
      await execution.save();

      logger.info('Workflow execution started', {
        execution_id: execution.id,
        workflow_id: workflow.id,
        workflow_version: workflow.version
      });

      let currentStepId = startStepId;
      let iterations = 0;
      let retryEventLogged = false;

      while (currentStepId) {
        iterations += 1;
        execution.iteration_count = iterations;
        await execution.save();

        if (iterations > maxIterations) {
          throw new Error('Maximum workflow iteration limit exceeded');
        }

        // Re-fetch execution to check for cancellation
        const freshExecution = await Execution.findOne({ id: execution.id });
        if (freshExecution.status === 'canceled') {
          logger.info('Execution was canceled', { execution_id: execution.id });
          return;
        }

        const step = await Step.findOne({ id: currentStepId });
        if (!step) {
          throw new Error(`Step not found: ${currentStepId}`);
        }

        execution.current_step_id = currentStepId;
        await execution.save();

        const stepStartedAt = new Date();

        if (step.step_type === 'approval') {
          const approvalLog = {
            step_id: step.id,
            step_name: step.name,
            step_type: step.step_type,
            status: 'started',
            timestamp: new Date(),
            message: `Approval requested for step "${step.name}"`,
            metadata: {
              type: 'approval',
              approval_state: 'pending_approval',
              instructions: step.metadata?.instructions || `Please review and approve step "${step.name}".`
            },
            evaluated_rules: [],
            selected_next_step: null,
            approver_id: null,
            error_message: null,
            started_at: stepStartedAt,
            ended_at: null
          };

          await Execution.updateOne(
            { id: execution.id },
            {
              $push: { logs: approvalLog },
              $set: {
                status: 'waiting_for_approval',
                current_step_id: step.id,
                pending_approval: {
                  execution_id: execution.id,
                  step_id: step.id,
                  approver_email: step.metadata?.assignee_email || null,
                  requested_at: new Date()
                }
              }
            }
          );

          logger.info('Execution waiting for approval', {
            execution_id: execution.id,
            step_id: step.id,
            approver_email: step.metadata?.assignee_email || null
          });
          return;
        }

        // Execute the step
        const stepResult = await this.executeStep(step, execution.data);
        const stepEndedAt = new Date();

        const rules = await Rule.find({ step_id: step.id });
        const { matched, rule, evaluatedRules, errors } = ruleEngine.evaluateRules(rules, execution.data);

        const selectedNextStep = matched && rule ? rule.next_step_id : null;
        const ruleErrorMessage = errors.length > 0 ? errors.join(' | ') : null;

        // Log step result
        const logEntry = {
          step_id: step.id,
          step_name: step.name,
          step_type: step.step_type,
          status: stepResult.success ? (errors.length > 0 ? 'failed' : 'completed') : 'failed',
          timestamp: new Date(),
          message: stepResult.message,
          metadata: stepResult.metadata || {},
          evaluated_rules: evaluatedRules || [],
          selected_next_step: selectedNextStep,
          approver_id: stepResult.approver_id || null,
          notification_sent_to: stepResult.notification_sent_to || null,
          error_message: stepResult.success ? ruleErrorMessage : (stepResult.message || 'Step execution failed'),
          started_at: stepStartedAt,
          ended_at: stepEndedAt
        };

        await Execution.updateOne(
          { id: execution.id },
          { $push: { logs: logEntry } }
        );

        if (
          options.isRetry &&
          !retryEventLogged &&
          options.retryStepId === step.id
        ) {
          const retryStatus = stepResult.success ? 'success' : 'failed';
          await Execution.updateOne(
            { id: execution.id },
            {
              $push: {
                logs: {
                  step_id: step.id,
                  step_name: options.retryStepName || step.name,
                  step_type: step.step_type,
                  status: stepResult.success ? 'completed' : 'failed',
                  timestamp: new Date(),
                  message: `Retry attempt ${options.retryAttempt || 1} for step "${step.name}" ${retryStatus}`,
                  retry_attempt: options.retryAttempt || 1,
                  retry_status: retryStatus,
                  error_message: stepResult.success ? null : (stepResult.message || 'Retry failed'),
                  started_at: stepStartedAt,
                  ended_at: stepEndedAt
                }
              }
            }
          );
          retryEventLogged = true;
        }

        logger.info('Step executed', {
          execution_id: execution.id,
          step_id: step.id,
          step_name: step.name,
          status: logEntry.status
        });

        if (!stepResult.success) {
          execution.status = 'failed';
          execution.ended_at = new Date();
          await execution.save();
          logger.error('Execution failed at step', {
            execution_id: execution.id,
            step_id: step.id
          });
          return;
        }

        logger.info('Rule evaluated for step', {
          execution_id: execution.id,
          step_id: step.id,
          matched,
          next_step_id: selectedNextStep,
          rule_errors: errors
        });

        currentStepId = selectedNextStep;
      }

      // Reload and finalize
      const finalExecution = await Execution.findOne({ id: execution.id });
      if (finalExecution.status !== 'canceled') {
        await Execution.updateOne(
          { id: execution.id },
          { status: 'completed', ended_at: new Date(), current_step_id: null }
        );
        logger.info('Workflow execution completed', { execution_id: execution.id });
      }
    } catch (error) {
      logger.error('Workflow engine error', {
        execution_id: execution.id,
        error: error.message
      });
      await Execution.updateOne(
        { id: execution.id },
        { status: 'failed', ended_at: new Date() }
      );
      await Execution.updateOne(
        { id: execution.id },
        {
          $push: {
            logs: {
              step_id: execution.current_step_id,
              step_name: 'Engine Error',
              step_type: 'engine',
              status: 'failed',
              timestamp: new Date(),
              message: error.message,
              error_message: error.message,
              started_at: new Date(),
              ended_at: new Date()
            }
          }
        }
      );
    }
  }

  async executeStep(step, data) {
    // Simulate step execution based on type
    try {
      switch (step.step_type) {
        case 'task':
          return {
            success: true,
            message: `Task "${step.name}" executed successfully`,
            metadata: { type: 'task', data }
          };
        case 'approval':
          return {
            success: true,
            message: `Approval step "${step.name}" processed`,
            metadata: {
              type: 'approval',
              approved: true
            },
            approver_id: step.metadata?.assignee_email || null
          };
        case 'notification':
          const notificationChannel = step.metadata?.notification_channel || 'email';
          const recipient = step.metadata?.recipient || step.metadata?.recipients?.[0] || null;
          const template = step.metadata?.template || `Workflow notification for ${step.name}`;

          try {
            const sent = await notificationService.sendNotification({
              channel: notificationChannel,
              recipient,
              template,
              data
            });

            return {
              success: true,
              message: `Notification "${step.name}" sent`,
              metadata: {
                type: 'notification',
                notification_channel: notificationChannel,
                template,
                notification_sent_to: sent.recipient,
                message_id: sent.messageId
              },
              notification_sent_to: sent.recipient
            };
          } catch (notificationError) {
            return {
              success: false,
              message: `Notification failed for "${step.name}": ${notificationError.message}`,
              metadata: {
                type: 'notification',
                notification_channel: notificationChannel,
                template,
                notification_sent_to: recipient,
                error: notificationError.message
              },
              notification_sent_to: recipient
            };
          }
        default:
          return { success: false, message: `Unknown step type: ${step.step_type}` };
      }
    } catch (err) {
      return { success: false, message: err.message };
    }
  }
}

module.exports = new WorkflowEngine();
