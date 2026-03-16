const { z } = require('zod');

const inputFieldSchema = z.union([
  z.string(),
  z.object({
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean().optional().default(false),
    allowed_values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional()
  })
]);

const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const workflowSchema = z.object({
  name: z.string().min(1).max(100),
  input_schema: z.record(inputFieldSchema).optional(),
  max_iterations: z.number().int().min(1).max(1000).optional(),
  start_step_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional()
});

const stepSchema = z.object({
  name: z.string().min(1).max(100),
  step_type: z.enum(['task', 'approval', 'notification']),
  order: z.number().int().min(0),
  metadata: z.record(z.any()).optional()
});

const ruleSchema = z.object({
  condition: z.string().min(1),
  next_step_id: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(1)
});

const executeSchema = z.object({
  data: z.record(z.any()).optional().default({})
});

module.exports = {
  registerSchema,
  loginSchema,
  workflowSchema,
  stepSchema,
  ruleSchema,
  executeSchema
};
