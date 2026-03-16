const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

// Built-in workflow templates
const TEMPLATES = [
  {
    id: 'expense-approval',
    name: 'Expense Approval',
    description: 'Approval routing based on amount with Manager, Finance Officer, and CEO approvals',
    icon: 'receipt',
    input_schema: {
      amount: { type: 'number', required: true },
      country: { type: 'string', required: true },
      department: { type: 'string', required: false },
      priority: { type: 'string', required: true, allowed_values: ['High', 'Medium', 'Low'] }
    },
    steps: [
      { name: 'Approval Router', step_type: 'task', order: 0 },
      { name: 'Manager Approval', step_type: 'approval', order: 1, metadata: { assignee_email: 'Manager', instructions: 'Please approve expenses below 100.' } },
      { name: 'Finance Officer Approval', step_type: 'approval', order: 2, metadata: { assignee_email: 'Finance Officer', instructions: 'Please review expenses greater than or equal to 100.' } },
      { name: 'CEO Approval', step_type: 'approval', order: 3, metadata: { assignee_email: 'CEO', instructions: 'Final approval required after Finance Officer approval.' } },
      { name: 'Task Completion', step_type: 'task', order: 4 }
    ],
    rules: [
      { step_index: 0, condition: 'amount < 100', next_step_index: 1, priority: 1 },
      { step_index: 0, condition: 'amount >= 100', next_step_index: 2, priority: 2 },
      { step_index: 0, condition: 'DEFAULT', next_step_index: 1, priority: 3 },
      { step_index: 1, condition: 'DEFAULT', next_step_index: 4, priority: 1 },
      { step_index: 2, condition: 'DEFAULT', next_step_index: 3, priority: 1 },
      { step_index: 3, condition: 'DEFAULT', next_step_index: 4, priority: 1 },
      { step_index: 4, condition: 'DEFAULT', next_step_index: null, priority: 1 }
    ]
  },
  {
    id: 'employee-onboarding',
    name: 'Employee Onboarding',
    description: 'Automate new hire onboarding steps',
    icon: 'users',
    input_schema: { department: 'string', role: 'string', remote: 'boolean' },
    steps: [
      { name: 'Send Welcome Email', step_type: 'notification', order: 0 },
      { name: 'Setup IT Equipment', step_type: 'task', order: 1 },
      { name: 'Manager Introduction', step_type: 'approval', order: 2 },
      { name: 'Remote Setup', step_type: 'task', order: 3 }
    ],
    rules: [
      { step_index: 0, condition: 'remote == true', next_step_index: 3, priority: 1 },
      { step_index: 0, condition: 'DEFAULT', next_step_index: 1, priority: 2 }
    ]
  },
  {
    id: 'support-ticket',
    name: 'Support Ticket Routing',
    description: 'Route support tickets by priority and type',
    icon: 'ticket',
    input_schema: { priority: 'string', category: 'string', customer_tier: 'string' },
    steps: [
      { name: 'Triage Ticket', step_type: 'task', order: 0 },
      { name: 'Escalate to Senior', step_type: 'approval', order: 1 },
      { name: 'Notify Customer', step_type: 'notification', order: 2 },
      { name: 'Auto Resolve', step_type: 'task', order: 3 }
    ],
    rules: [
      { step_index: 0, condition: "priority == 'Critical' && customer_tier == 'Enterprise'", next_step_index: 1, priority: 1 },
      { step_index: 0, condition: "priority == 'Low'", next_step_index: 3, priority: 2 },
      { step_index: 0, condition: 'DEFAULT', next_step_index: 2, priority: 3 }
    ]
  },
  {
    id: 'order-fulfillment',
    name: 'Order Fulfillment',
    description: 'Process orders from payment to delivery',
    icon: 'package',
    input_schema: { order_value: 'number', payment_method: 'string', express: 'boolean' },
    steps: [
      { name: 'Verify Payment', step_type: 'task', order: 0 },
      { name: 'Pick & Pack', step_type: 'task', order: 1 },
      { name: 'Express Shipping', step_type: 'notification', order: 2 },
      { name: 'Standard Shipping', step_type: 'notification', order: 3 }
    ],
    rules: [
      { step_index: 0, condition: 'DEFAULT', next_step_index: 1, priority: 1 },
      { step_index: 1, condition: 'express == true', next_step_index: 2, priority: 1 },
      { step_index: 1, condition: 'DEFAULT', next_step_index: 3, priority: 2 }
    ]
  }
];

router.use(authenticate);
router.get('/', (_req, res) => res.json({ success: true, data: TEMPLATES }));
router.get('/:id', (req, res) => {
  const t = TEMPLATES.find((t) => t.id === req.params.id);
  if (!t) return res.status(404).json({ success: false, message: 'Template not found' });
  res.json({ success: true, data: t });
});

module.exports = router;
