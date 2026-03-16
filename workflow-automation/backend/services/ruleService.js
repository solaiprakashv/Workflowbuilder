const Rule = require('../models/Rule');
const Step = require('../models/Step');
const logger = require('../utils/logger');

const isDefaultCondition = (condition) => (condition || '').trim().toUpperCase() === 'DEFAULT';
const DEFAULT_RULE_ERROR_MESSAGE = 'Each step must contain exactly one DEFAULT rule.';

const throwDefaultRuleViolation = () => {
  const err = new Error(DEFAULT_RULE_ERROR_MESSAGE);
  err.statusCode = 400;
  err.defaultRuleViolation = true;
  throw err;
};

const ensureExactlyOneDefaultRule = (rules) => {
  const defaultRuleCount = rules.filter((rule) => isDefaultCondition(rule.condition)).length;
  if (defaultRuleCount !== 1) {
    throwDefaultRuleViolation();
  }
};

const validateDefaultRuleConstraintsOnCreate = (existingRules, newRuleData) => {
  const normalizedIncoming = {
    ...newRuleData,
    condition: isDefaultCondition(newRuleData.condition) ? 'DEFAULT' : newRuleData.condition
  };

  const resultSet = [...existingRules, normalizedIncoming];
  ensureExactlyOneDefaultRule(resultSet);

  const defaultRules = resultSet.filter((rule) => isDefaultCondition(rule.condition));

  const defaultRule = defaultRules[0];
  const nonDefaultRules = resultSet.filter((rule) => !isDefaultCondition(rule.condition));
  const maxNonDefaultPriority = nonDefaultRules.length
    ? Math.max(...nonDefaultRules.map((rule) => Number(rule.priority)))
    : null;

  if (maxNonDefaultPriority !== null && Number(defaultRule.priority) <= maxNonDefaultPriority) {
    const err = new Error('DEFAULT rule must have the lowest priority');
    err.statusCode = 400;
    throw err;
  }

  return normalizedIncoming;
};

const validateConditionSyntax = (condition) => {
  if (!condition || condition.trim().toUpperCase() === 'DEFAULT') {
    return;
  }
  try {
    // eslint-disable-next-line no-new-func
    new Function('contains', 'startsWith', 'endsWith', `"use strict"; return (${condition});`);
  } catch (err) {
    const error = new Error(`Invalid rule condition syntax: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }
};

const addRule = async (stepId, data) => {
  const step = await Step.findOne({ id: stepId });
  if (!step) {
    const err = new Error('Step not found');
    err.statusCode = 404;
    throw err;
  }
  validateConditionSyntax(data.condition);
  const existingRules = await Rule.find({ step_id: stepId });
  const normalizedData = validateDefaultRuleConstraintsOnCreate(existingRules, data);

  const rule = await Rule.create({ ...normalizedData, step_id: stepId });
  logger.info('Rule added', { rule_id: rule.id, step_id: stepId });
  return rule;
};

const listRules = async (stepId) => {
  return Rule.find({ step_id: stepId }).sort({ priority: 1 });
};

const updateRule = async (id, data) => {
  const existingRule = await Rule.findOne({ id });
  if (!existingRule) {
    const err = new Error('Rule not found');
    err.statusCode = 404;
    throw err;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'condition')) {
    validateConditionSyntax(data.condition);
    const currentIsDefault = isDefaultCondition(existingRule.condition);
    const nextIsDefault = isDefaultCondition(data.condition);
    if (currentIsDefault && !nextIsDefault) {
      throwDefaultRuleViolation();
    }
    data.condition = nextIsDefault ? 'DEFAULT' : data.condition;
  }

  const stepRules = await Rule.find({ step_id: existingRule.step_id });
  const updatedRules = stepRules.map((rule) => (rule.id === id ? { ...rule.toObject(), ...data } : rule.toObject()));
  ensureExactlyOneDefaultRule(updatedRules);

  const rule = await Rule.findOneAndUpdate({ id }, data, { new: true });
  logger.info('Rule updated', { rule_id: id });
  return rule;
};

const deleteRule = async (id) => {
  const rule = await Rule.findOne({ id });
  if (!rule) {
    const err = new Error('Rule not found');
    err.statusCode = 404;
    throw err;
  }

  const stepRules = await Rule.find({ step_id: rule.step_id });
  const remainingRules = stepRules.filter((candidate) => candidate.id !== id).map((candidate) => candidate.toObject());
  ensureExactlyOneDefaultRule(remainingRules);

  await Rule.deleteOne({ id });
  logger.info('Rule deleted', { rule_id: id });
};

module.exports = { addRule, listRules, updateRule, deleteRule };
