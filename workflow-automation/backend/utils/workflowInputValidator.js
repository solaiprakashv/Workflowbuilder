const normalizeFieldDefinition = (fieldDef) => {
  if (typeof fieldDef === 'string') {
    return { type: fieldDef, required: true, allowed_values: undefined };
  }

  return {
    type: fieldDef?.type,
    required: Boolean(fieldDef?.required),
    allowed_values: fieldDef?.allowed_values
  };
};

/**
 * Validates workflow execution input against a workflow input schema.
 * Returns a detailed result object to keep validation reusable and predictable.
 */
const validateWorkflowInput = (schema = {}, data = {}) => {
  const details = [];

  for (const [field, fieldDef] of Object.entries(schema || {})) {
    const normalized = normalizeFieldDefinition(fieldDef);
    const value = data[field];
    const isEmpty = value === undefined || value === null || value === '';

    if (normalized.required && isEmpty) {
      details.push(`${field} is required`);
      continue;
    }

    if (isEmpty) {
      continue;
    }

    if (normalized.type === 'number' && Number.isNaN(Number(value))) {
      details.push(`${field} must be number`);
      continue;
    }

    if (normalized.type === 'boolean' && ![true, false, 'true', 'false'].includes(value)) {
      details.push(`${field} must be boolean`);
      continue;
    }

    if (normalized.type === 'string' && typeof value !== 'string') {
      details.push(`${field} must be string`);
      continue;
    }

    if (Array.isArray(normalized.allowed_values)) {
      const allowed = normalized.allowed_values.map(String);
      if (!allowed.includes(String(value))) {
        details.push(`${field} must be ${allowed.join(', ')}`);
      }
    }
  }

  return {
    valid: details.length === 0,
    error: details.length ? 'Validation failed' : null,
    details
  };
};

module.exports = { validateWorkflowInput };
