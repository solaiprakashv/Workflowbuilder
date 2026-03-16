const stepService = require('../services/stepService');
const { stepSchema } = require('../utils/validators');

const add = async (req, res, next) => {
  try {
    const data = stepSchema.parse(req.body);
    const step = await stepService.addStep(req.params.workflow_id, data);
    res.status(201).json({ success: true, data: step });
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const steps = await stepService.listSteps(req.params.workflow_id);
    res.json({ success: true, data: steps });
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const data = stepSchema.partial().parse(req.body);
    const step = await stepService.updateStep(req.params.id, data);
    res.json({ success: true, data: step });
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await stepService.deleteStep(req.params.id);
    res.json({ success: true, message: 'Step deleted' });
  } catch (err) { next(err); }
};

module.exports = { add, list, update, remove };
