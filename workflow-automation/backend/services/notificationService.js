const nodemailer = require('nodemailer');
const dns = require('dns').promises;

let cachedTransporter = null;
let cachedTransporterKey = null;

const getResendConfig = () => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!apiKey || !from) {
    return null;
  }

  return {
    apiKey,
    from,
    endpoint: process.env.RESEND_API_URL || 'https://api.resend.com/emails'
  };
};

const getTransporter = async () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  const forceIpv4 = String(process.env.SMTP_FORCE_IPV4 || 'true') === 'true';

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  }

  let connectHost = host;
  if (forceIpv4) {
    try {
      const ipv4Addresses = await dns.resolve4(host);
      if (ipv4Addresses?.length) {
        connectHost = ipv4Addresses[0];
      }
    } catch (_resolveError) {
      connectHost = host;
    }
  }

  const transporterKey = `${connectHost}:${port}:${user}:${secure}`;
  if (cachedTransporter && cachedTransporterKey === transporterKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: connectHost,
    port,
    family: Number(process.env.SMTP_FAMILY || 4),
    secure,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
    auth: { user, pass },
    tls: {
      servername: host
    }
  });
  cachedTransporterKey = transporterKey;

  return cachedTransporter;
};

const shouldFallbackToResend = (error) => {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '').toLowerCase();
  return (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    message.includes('connection timeout') ||
    message.includes('timed out') ||
    message.includes('enetunreach') ||
    message.includes('ehostunreach')
  );
};

const sendViaResend = async ({ recipient, subject, textBody, html }) => {
  const resend = getResendConfig();
  if (!resend) {
    throw new Error('Resend fallback not configured. Set RESEND_API_KEY and RESEND_FROM.');
  }

  const response = await fetch(resend.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resend.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: resend.from,
      to: [recipient],
      subject,
      text: textBody,
      html: html || undefined
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(`Resend API error: ${reason}`);
  }

  return {
    recipient,
    messageId: payload?.id || null
  };
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

  try {
    const transporter = await getTransporter();
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
  } catch (smtpError) {
    if (!shouldFallbackToResend(smtpError)) {
      throw smtpError;
    }

    return sendViaResend({ recipient, subject, textBody, html });
  }
};

module.exports = { sendNotification };
