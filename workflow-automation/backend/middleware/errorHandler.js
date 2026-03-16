const logger = require('../utils/logger');
const { ZodError } = require('zod');

const INVALID_MAX_ITERATIONS_MESSAGE = 'Invalid max_iterations value. It must be a positive integer.';
const DEFAULT_RULE_ERROR_MESSAGE = 'Each step must contain exactly one DEFAULT rule.';

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  if (err.statusCode === 422 && err.validationErrors) {
    return res.status(422).json({
      success: false,
      message: err.message,
      errors: err.validationErrors
    });
  }

  if (err.invalidMaxIterations) {
    return res.status(400).json({
      error: INVALID_MAX_ITERATIONS_MESSAGE
    });
  }

  if (err.defaultRuleViolation) {
    return res.status(400).json({
      error: DEFAULT_RULE_ERROR_MESSAGE
    });
  }

  if (err.statusCode === 400 && Array.isArray(err.details)) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Validation failed',
      details: err.details
    });
  }

  if (err instanceof ZodError) {
    const hasMaxIterationsError = err.errors.some((e) => e.path.includes('max_iterations'));
    if (hasMaxIterationsError) {
      return res.status(400).json({
        error: INVALID_MAX_ITERATIONS_MESSAGE
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({ success: false, message: `${field} already exists` });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error'
  });
};

const notFound = (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
};

module.exports = { errorHandler, notFound };
