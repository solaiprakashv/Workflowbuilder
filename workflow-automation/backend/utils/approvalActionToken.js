const jwt = require('jsonwebtoken');

const TOKEN_TYPE = 'approval_action';

const createApprovalActionToken = ({ executionId, stepId, action, recipient }, expiresIn = '24h') => {
  const payload = {
    type: TOKEN_TYPE,
    execution_id: executionId,
    step_id: stepId,
    action,
    recipient: recipient || null
  };

  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

const verifyApprovalActionToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (!decoded || decoded.type !== TOKEN_TYPE) {
    const err = new Error('Invalid approval action token');
    err.statusCode = 401;
    throw err;
  }
  return decoded;
};

module.exports = {
  createApprovalActionToken,
  verifyApprovalActionToken
};
