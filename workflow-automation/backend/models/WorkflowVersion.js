const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const workflowVersionSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  workflow_id: { type: String, required: true },
  version: { type: Number, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true }, // full workflow+steps+rules
  created_by: { type: String, required: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

workflowVersionSchema.index({ workflow_id: 1, version: -1 });

module.exports = mongoose.model('WorkflowVersion', workflowVersionSchema);
