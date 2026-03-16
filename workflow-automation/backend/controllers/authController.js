const authService = require('../services/authService');
const { registerSchema, loginSchema } = require('../utils/validators');

const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const { user, token } = await authService.register(data);
    res.status(201).json({ success: true, data: { user, token } });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const { user, token } = await authService.login(data);
    res.json({ success: true, data: { user, token } });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};

module.exports = { register, login, me };
