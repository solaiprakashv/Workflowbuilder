const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const getByPath = (source, path) => {
  if (!path || typeof path !== 'string') return undefined;
  return path.split('.').reduce((acc, segment) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[segment];
  }, source);
};

const evaluateExpression = (expression, context) => {
  const fn = new Function(
    '$json',
    '$node',
    'get',
    'now',
    `"use strict"; return (${expression});`
  );

  return fn(
    context.$json,
    context.$node,
    (path) => getByPath(context.$json, path),
    () => new Date().toISOString()
  );
};

const resolveValue = (value, context) => {
  if (typeof value === 'string') {
    const fullExpression = value.match(/^\{\{\s*(.+?)\s*\}\}$/);
    if (fullExpression) {
      return evaluateExpression(fullExpression[1], context);
    }

    if (value.includes('{{')) {
      return value.replace(/\{\{\s*(.+?)\s*\}\}/g, (_m, expr) => {
        const result = evaluateExpression(expr, context);
        if (result === null || result === undefined) return '';
        if (typeof result === 'object') return JSON.stringify(result);
        return String(result);
      });
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveValue(item, context));
  }

  if (isPlainObject(value)) {
    return Object.entries(value).reduce((acc, [key, val]) => {
      acc[key] = resolveValue(val, context);
      return acc;
    }, {});
  }

  return value;
};

const mergeOutput = (currentData, outputData) => {
  if (!isPlainObject(outputData)) {
    return currentData;
  }
  return { ...currentData, ...outputData };
};

module.exports = {
  resolveValue,
  mergeOutput,
  getByPath
};
