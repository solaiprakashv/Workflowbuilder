const ruleService = require('../services/ruleService');
const { ruleSchema } = require('../utils/validators');

const add = async (req, res, next) => {
  try {
    const data = ruleSchema.parse(req.body);
    const rule = await ruleService.addRule(req.params.step_id, data);
    res.status(201).json({ success: true, data: rule });
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const rules = await ruleService.listRules(req.params.step_id);
    res.json({ success: true, data: rules });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const data = ruleSchema.partial().parse(req.body);
    const rule = await ruleService.updateRule(req.params.id, data);
    res.json({ success: true, data: rule });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await ruleService.deleteRule(req.params.id);
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) { next(err); }
};

module.exports = { add, list, update, remove };
