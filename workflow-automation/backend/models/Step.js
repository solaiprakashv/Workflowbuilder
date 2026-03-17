const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const stepSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  workflow_id: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  step_type: { type: String, enum: ['task', 'approval', 'notification', 'node', 'trigger'], required: true },
  order: { type: Number, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

stepSchema.index({ workflow_id: 1, order: 1 });

module.exports = mongoose.model('Step', stepSchema);
