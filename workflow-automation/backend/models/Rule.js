const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ruleSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  step_id: { type: String, required: true },
  condition: { type: String, required: true },
  next_step_id: { type: String, default: null },
  priority: { type: Number, required: true, default: 1 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

ruleSchema.index({ step_id: 1, priority: 1 });

module.exports = mongoose.model('Rule', ruleSchema);
