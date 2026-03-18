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

const triggerSecretSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return null;
    }
    return value;
  },
  z.string().min(8).max(256).nullable().optional()
);

const workflowSchema = z.object({
  name: z.string().min(1).max(100),
  input_schema: z.record(inputFieldSchema).optional(),
  max_iterations: z.number().int().min(1).max(1000).optional(),
  trigger_secret: triggerSecretSchema,
  start_step_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional()
});

const stepSchema = z.object({
  name: z.string().min(1).max(100),
  step_type: z.enum(['task', 'approval', 'notification', 'node', 'trigger']),
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

const triggerExecuteSchema = z.object({
  data: z.record(z.any()).optional().default({}),
  trigger_secret: z.string().optional(),
  wait_for_completion: z.boolean().optional().default(false),
  timeout_ms: z.number().int().min(1000).max(120000).optional().default(15000)
});

module.exports = {
  registerSchema,
  loginSchema,
  workflowSchema,
  stepSchema,
  ruleSchema,
  executeSchema,
  triggerExecuteSchema
};
