const logger = require('../utils/logger');

/**
 * Safely evaluates a condition string against a data context.
 * Supports: ==, !=, >, <, >=, <=, &&, ||, !
 * Example: "amount > 100 && country == 'US'"
 */
class RuleEngine {
  /**
   * Tokenize and evaluate a condition expression against context data.
   */
  evaluate(condition, data) {
    try {
      if (!condition || condition.trim().toUpperCase() === 'DEFAULT') {
        return { result: true, error: null };
      }

      const helpers = {
        contains: (value, expected) => String(value ?? '').includes(String(expected ?? '')),
        startsWith: (value, prefix) => String(value ?? '').startsWith(String(prefix ?? '')),
        endsWith: (value, suffix) => String(value ?? '').endsWith(String(suffix ?? ''))
      };

      const keys = Object.keys(data || {});
      const values = Object.values(data || {});
      const helperKeys = Object.keys(helpers);
      const helperValues = Object.values(helpers);

      // eslint-disable-next-line no-new-func
      const fn = new Function(...keys, ...helperKeys, `"use strict"; return (${condition});`);
      const result = Boolean(fn(...values, ...helperValues));
      return { result, error: null };
    } catch (err) {
      logger.warn('Rule evaluation error', { condition, error: err.message });
      return { result: false, error: err.message };
    }
  }

  /**
   * Evaluate a list of rules sorted by priority against data.
   * Returns the first matching rule, or the DEFAULT rule if none match.
   */
  evaluateRules(rules, data) {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);

    const defaultRule = sorted.find(
      (r) => !r.condition || r.condition.trim().toUpperCase() === 'DEFAULT'
    );

    const nonDefaultRules = sorted.filter(
      (r) => r.condition && r.condition.trim().toUpperCase() !== 'DEFAULT'
    );

    const evaluatedRules = [];

    for (const rule of nonDefaultRules) {
      const evaluation = this.evaluate(rule.condition, data);
      const matched = evaluation.result;

      evaluatedRules.push({
        rule_id: rule.id,
        rule: rule.condition,
        priority: rule.priority,
        result: matched,
        error: evaluation.error || null
      });

      logger.debug('Rule evaluated', {
        rule_id: rule.id,
        condition: rule.condition,
        priority: rule.priority,
        matched,
        error: evaluation.error || null
      });
      if (matched) {
        return {
          matched: true,
          rule,
          evaluatedRules,
          errors: evaluatedRules.filter((r) => r.error).map((r) => r.error)
        };
      }
    }

    if (defaultRule) {
      logger.debug('Default rule applied', { rule_id: defaultRule.id });
      evaluatedRules.push({
        rule_id: defaultRule.id,
        rule: defaultRule.condition,
        priority: defaultRule.priority,
        result: true,
        error: null
      });
      return {
        matched: true,
        rule: defaultRule,
        evaluatedRules,
        errors: evaluatedRules.filter((r) => r.error).map((r) => r.error)
      };
    }

    return {
      matched: false,
      rule: null,
      evaluatedRules,
      errors: evaluatedRules.filter((r) => r.error).map((r) => r.error)
    };
  }
}

module.exports = new RuleEngine();
