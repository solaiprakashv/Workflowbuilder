const Execution = require('../models/Execution');
const Step = require('../models/Step');
const Rule = require('../models/Rule');
const ruleEngine = require('./ruleEngine');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');
const { resolveValue, mergeOutput } = require('../utils/dynamicNode');
const { createApprovalActionToken } = require('../utils/approvalActionToken');

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
      let runtimeData = execution.data || {};
      const nodeOutputs = {};

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
          const approvalRecipient = step.metadata?.assignee_email || step.metadata?.recipient || null;
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
                  approver_email: approvalRecipient,
                  requested_at: new Date()
                }
              }
            }
          );

          if (approvalRecipient && approvalRecipient.includes('@')) {
            try {
              const approveToken = createApprovalActionToken({
                executionId: execution.id,
                stepId: step.id,
                action: 'approve',
                recipient: approvalRecipient
              });
              const rejectToken = createApprovalActionToken({
                executionId: execution.id,
                stepId: step.id,
                action: 'reject',
                recipient: approvalRecipient
              });

              const baseUrl = (
                process.env.API_PUBLIC_URL ||
                process.env.BACKEND_PUBLIC_URL ||
                process.env.BACKEND_URL ||
                `http://localhost:${process.env.PORT || 5000}`
              ).replace(/\/$/, '');

              const approveUrl = `${baseUrl}/api/executions/email-action?token=${encodeURIComponent(approveToken)}`;
              const rejectUrl = `${baseUrl}/api/executions/email-action?token=${encodeURIComponent(rejectToken)}`;

              const subject = `Approval required: ${workflow.name} - ${step.name}`;
              const html = `
                <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:auto;">
                  <h2 style="margin-bottom:8px;">Approval Required</h2>
                  <p style="margin:0 0 10px;">Workflow: <strong>${workflow.name}</strong></p>
                  <p style="margin:0 0 10px;">Step: <strong>${step.name}</strong></p>
                  <p style="margin:0 0 16px;">Execution ID: <code>${execution.id}</code></p>
                  <p style="margin:0 0 16px;">${step.metadata?.instructions || `Please review and decide for step "${step.name}".`}</p>
                  <div style="display:flex;gap:10px;margin:18px 0;">
                    <a href="${approveUrl}" style="background:#16a34a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Approve</a>
                    <a href="${rejectUrl}" style="background:#dc2626;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Reject</a>
                  </div>
                  <p style="font-size:12px;color:#6b7280;">This secure link expires in 24 hours.</p>
                </div>
              `;

              await notificationService.sendNotification({
                channel: 'email',
                recipient: approvalRecipient,
                template: subject,
                data: {
                  execution_id: execution.id,
                  workflow_name: workflow.name,
                  step_name: step.name
                },
                html
              });
            } catch (approvalEmailError) {
              logger.warn('Failed to send approval email', {
                execution_id: execution.id,
                step_id: step.id,
                recipient: approvalRecipient,
                error: approvalEmailError.message
              });
            }
          }

          logger.info('Execution waiting for approval', {
            execution_id: execution.id,
            step_id: step.id,
            approver_email: approvalRecipient
          });
          return;
        }

        // Execute the step
        const stepResult = await this.executeStep(step, runtimeData, {
          nodeOutputs,
          workflow,
          execution
        });
        const stepEndedAt = new Date();

        if (stepResult.success && stepResult.outputData && typeof stepResult.outputData === 'object') {
          runtimeData = mergeOutput(runtimeData, stepResult.outputData);
          execution.data = runtimeData;
          await execution.save();
        }

        if (stepResult.success && stepResult.nodeOutput) {
          nodeOutputs[step.id] = stepResult.nodeOutput;
          nodeOutputs[step.name] = stepResult.nodeOutput;
        }

        const rules = await Rule.find({ step_id: step.id });
        const { matched, rule, evaluatedRules, errors } = ruleEngine.evaluateRules(rules, runtimeData);

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

  async executeStep(step, data, runtimeContext = {}) {
    // Simulate step execution based on type
    try {
      const expressionContext = {
        $json: data || {},
        $node: runtimeContext.nodeOutputs || {}
      };

      switch (step.step_type) {
        case 'task':
          if (step.metadata?.output && typeof step.metadata.output === 'object') {
            const resolvedOutput = resolveValue(step.metadata.output, expressionContext);
            return {
              success: true,
              message: `Task "${step.name}" executed successfully`,
              metadata: { type: 'task', data },
              outputData: resolvedOutput,
              nodeOutput: resolvedOutput
            };
          }

          return {
            success: true,
            message: `Task "${step.name}" executed successfully`,
            metadata: { type: 'task', data },
            outputData: data,
            nodeOutput: data
          };
        case 'trigger':
          return {
            success: true,
            message: `Trigger "${step.name}" processed`,
            metadata: {
              type: 'trigger',
              trigger_type: step.metadata?.trigger_type || 'webhook'
            },
            outputData: data,
            nodeOutput: data
          };
        case 'node': {
          const operation = step.metadata?.operation || 'set';
          const parameters = resolveValue(step.metadata?.parameters || {}, expressionContext);

          if (operation === 'set') {
            return {
              success: true,
              message: `Node "${step.name}" set output`,
              metadata: {
                type: 'node',
                operation
              },
              outputData: parameters,
              nodeOutput: parameters
            };
          }

          if (operation === 'transform') {
            return {
              success: true,
              message: `Node "${step.name}" transformed input`,
              metadata: {
                type: 'node',
                operation
              },
              outputData: parameters,
              nodeOutput: parameters
            };
          }

          if (operation === 'response') {
            const responsePayload = resolveValue(step.metadata?.response || parameters, expressionContext);
            return {
              success: true,
              message: `Node "${step.name}" prepared response payload`,
              metadata: {
                type: 'node',
                operation,
                response: responsePayload
              },
              outputData: responsePayload,
              nodeOutput: responsePayload
            };
          }

          if (operation === 'http_request') {
            const method = (parameters.method || 'GET').toUpperCase();
            const url = parameters.url;

            if (!url) {
              return {
                success: false,
                message: `Node "${step.name}" missing HTTP url`
              };
            }

            const response = await fetch(url, {
              method,
              headers: parameters.headers || {},
              body: ['GET', 'HEAD'].includes(method) ? undefined : (parameters.body ? JSON.stringify(parameters.body) : undefined)
            });

            const contentType = response.headers.get('content-type') || '';
            const responseData = contentType.includes('application/json')
              ? await response.json()
              : await response.text();

            const normalized = {
              status: response.status,
              ok: response.ok,
              data: responseData
            };

            return {
              success: response.ok,
              message: response.ok
                ? `Node "${step.name}" executed HTTP request`
                : `Node "${step.name}" HTTP request failed with ${response.status}`,
              metadata: {
                type: 'node',
                operation,
                request: { url, method }
              },
              outputData: { [step.metadata?.output_key || `${step.name}_response`]: normalized },
              nodeOutput: normalized
            };
          }

          return {
            success: false,
            message: `Unknown node operation: ${operation}`
          };
        }
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
