const nodemailer = require('nodemailer');

let cachedTransporter = null;

const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user, pass }
  });

  return cachedTransporter;
};

/**
 * Sends a workflow notification using configured channel.
 */
const sendNotification = async ({ channel, recipient, template, data, html }) => {
  if ((channel || 'email') !== 'email') {
    throw new Error(`Unsupported notification channel: ${channel}`);
  }

  if (!recipient) {
    throw new Error('Notification recipient is required');
  }

  const transporter = getTransporter();
  const subject = template || 'Workflow Notification';
  const textBody = [
    subject,
    '',
    'Workflow notification payload:',
    JSON.stringify(data || {}, null, 2)
  ].join('\n');

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipient,
    subject,
    text: textBody,
    html: html || undefined
  });

  return {
    recipient,
    messageId: info.messageId
  };
};

module.exports = { sendNotification };
