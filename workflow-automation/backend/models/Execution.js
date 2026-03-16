const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const logEntrySchema = new mongoose.Schema({
  step_id: String,
  step_name: String,
  step_type: String,
  status: { type: String, enum: ['started', 'completed', 'failed', 'skipped'] },
  timestamp: { type: Date, default: Date.now },
  message: String,
  metadata: mongoose.Schema.Types.Mixed,
  evaluated_rules: {
    type: [{
      rule_id: String,
      rule: String,
      priority: Number,
      result: Boolean,
      error: String
    }],
    default: []
  },
  selected_next_step: { type: String, default: null },
  approver_id: { type: String, default: null },
  notification_sent_to: { type: String, default: null },
  decision: { type: String, enum: ['approved', 'rejected'], default: null },
  retry_attempt: { type: Number, default: null },
  retry_status: { type: String, enum: ['success', 'failed'], default: null },
  error_message: { type: String, default: null },
  started_at: { type: Date, default: null },
  ended_at: { type: Date, default: null }
}, { _id: false });

const executionSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  workflow_id: { type: String, required: true },
  workflow_version: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'waiting_for_approval', 'completed', 'failed', 'canceled'],
    default: 'pending'
  },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  logs: { type: [logEntrySchema], default: [] },
  current_step_id: { type: String, default: null },
  max_iterations: { type: Number, default: 20 },
  iteration_count: { type: Number, default: 0 },
  retries: { type: Number, default: 0 },
  pending_approval: {
    execution_id: { type: String, default: null },
    step_id: { type: String, default: null },
    approver_email: { type: String, default: null },
    requested_at: { type: Date, default: null }
  },
  triggered_by: { type: String, required: true },
  started_at: { type: Date, default: null },
  ended_at: { type: Date, default: null }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

executionSchema.index({ workflow_id: 1 });

module.exports = mongoose.model('Execution', executionSchema);
