# WorkflowOS — Workflow Automation System

Full-stack workflow automation platform with versioned workflow design, dynamic rule routing, execution logs, retry/cancel controls, templates, and metrics.

## Prerequisites
- Node.js 18+
- MongoDB running locally (default: `mongodb://localhost:27017/workflow_automation`)

## Setup & Run

### Backend
```bash
cd backend
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```
Frontend runs on `http://localhost:3000`.

> `--legacy-peer-deps` is currently needed due a peer range mismatch between `vite@8` and `@tailwindcss/vite@4`.

---

## Core Features Implemented

### Workflows
- Create, list (pagination + search + active/inactive filter), get details, update, delete.
- Version is incremented on update.
- Version snapshots are persisted and retrievable.
- Configurable `max_iterations` guard for loop-safe execution.

### Steps
- Add/list/update/delete steps per workflow.
- Step types: `task`, `approval`, `notification`.

### Rules
- Add/list/update/delete rules per step.
- Priority-based first-match routing.
- `DEFAULT` fallback rule support.
- Condition syntax validation on create/update.
- Supported operators/functions:
  - Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
  - Logical: `&&`, `||`
  - String helpers: `contains(field, "x")`, `startsWith(field, "x")`, `endsWith(field, "x")`

### Executions
- Start execution, list executions, get details/logs, cancel execution, retry failed execution.
- Retry resumes from the failed step (does not restart full workflow).
- Detailed per-step logs include:
  - step metadata and type
  - evaluated rules and outcomes
  - selected next step
  - approver id (for approval-type simulation)
  - step started/ended timestamps
  - error details

### Rule Engine Behavior
- Dynamic runtime rule evaluation.
- Priority order evaluation (lower number first).
- Default fallback routing.
- Rule evaluation errors are captured in logs.
- Loop/branching supported with max-iteration guard (`workflow.max_iterations`, default 20, valid range 1-1000).

### UI
- Workflow list with search, active/inactive filter, pagination.
- Workflow editor for:
  - workflow details
  - structured input schema (`type`, `required`, `allowed_values`)
  - step CRUD
  - rule CRUD
  - drag-drop rule priority reorder
  - graph view
- Execution modal with schema-aware inputs.
- Executions page and execution log timeline with retry/cancel.
- Metrics dashboard.
- Template gallery (sample workflows).
- Approval email notifications via EmailJS when approval steps enter pending-approval state.

### EmailJS Approval Notifications
- Frontend EmailJS config:
  - Service ID: `service_rpi2t5n`
  - Template ID: `template_70ns0sp`
  - Public Key: `gq5BiFFwtvNSfxmDS`
- Reusable sender function: `sendApprovalEmail()` in `frontend/src/services/email.js`.
- Auto-trigger location: `frontend/src/pages/ExecutionLogs.jsx` when approval step metadata contains `approval_state = pending_approval`.
- Template params used:
  - `to_name`
  - `workflow_name`
  - `step_name`
  - `amount`
  - `message`

---

## API Quick Reference

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Workflows
- `POST /api/workflows`
- `GET /api/workflows?page=1&limit=10&search=approval`
- `GET /api/workflows/:id`
- `PUT /api/workflows/:id`
- `DELETE /api/workflows/:id`
- `GET /api/workflows/:id/versions`
- `GET /api/workflows/:id/versions/:version`
- `POST /api/workflows/:workflow_id/execute`

Workflow list response shape:
```json
{
  "data": [],
  "page": 1,
  "limit": 10,
  "total": 45,
  "total_pages": 5
}
```

`max_iterations` on workflow create/update:
- optional, defaults to `20` when omitted
- must be a positive integer between `1` and `1000`
- invalid value response:
  - `{ "error": "Invalid max_iterations value. It must be a positive integer." }`

### Steps
- `POST /api/workflows/:workflow_id/steps`
- `GET /api/workflows/:workflow_id/steps`
- `PUT /api/steps/:id`
- `DELETE /api/steps/:id`

### Rules
- `POST /api/steps/:step_id/rules`
- `GET /api/steps/:step_id/rules`
- `PUT /api/rules/:id`
- `DELETE /api/rules/:id`

### Executions
- `GET /api/executions`
- `GET /api/executions/:id`
- `POST /api/executions/:id/cancel`
- `POST /api/executions/:id/retry`

---

## Input Schema Format

Supported structured schema:

```json
{
  "amount": {"type": "number", "required": true},
  "country": {"type": "string", "required": true},
  "department": {"type": "string", "required": false},
  "priority": {"type": "string", "required": true, "allowed_values": ["High", "Medium", "Low"]}
}
```

Legacy shorthand is also accepted:

```json
{
  "amount": "number",
  "country": "string"
}
```

---

## Sample Workflows Included

Templates available from `GET /api/templates` (and UI `Templates` page):
- Invoice Approval
- Employee Onboarding
- Support Ticket Routing
- Order Fulfillment

---

## Execution Example

### Execute

```json
POST /api/workflows/:id/execute
{
  "data": {
    "amount": 250,
    "country": "US",
    "department": "Finance",
    "priority": "High"
  }
}
```

### Log Entry Example

```json
{
  "step_id": "step-001",
  "step_name": "Manager Approval",
  "step_type": "approval",
  "evaluated_rules": [
    {"rule_id": "rule-1", "rule": "amount > 100 && country == 'US' && priority == 'High'", "priority": 1, "result": true, "error": null},
    {"rule_id": "rule-2", "rule": "amount <= 100 || department == 'HR'", "priority": 2, "result": false, "error": null}
  ],
  "selected_next_step": "Finance Notification",
  "status": "completed",
  "approver_id": "manager@example.com",
  "error_message": null,
  "started_at": "2026-02-18T10:00:00.000Z",
  "ended_at": "2026-02-18T10:00:03.000Z"
}
```

---

## Notes
- If backend startup shows `EADDRINUSE` on port `5000`, another backend instance is already running.
- For submission packaging, add your Git repository link and demo video URL in this README before final handoff.
