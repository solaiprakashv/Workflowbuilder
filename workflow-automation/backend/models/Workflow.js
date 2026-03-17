const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const workflowSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  parent_workflow_id: { type: String, default: null },
  name: { type: String, required: true, trim: true },
  version: { type: Number, default: 1 },
  is_active: { type: Boolean, default: false },
  input_schema: { type: mongoose.Schema.Types.Mixed, default: {} },
  max_iterations: { type: Number, default: 20, min: 1, max: 1000 },
  trigger_secret: { type: String, default: null },
  start_step_id: { type: String, default: null },
  created_by: { type: String, required: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

workflowSchema.index({ name: 'text' });
workflowSchema.index({ parent_workflow_id: 1, version: -1 });
workflowSchema.index({ parent_workflow_id: 1, is_active: 1 });

module.exports = mongoose.model('Workflow', workflowSchema);
