import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID = 'service_rpi2t5n';
const EMAILJS_TEMPLATE_ID = 'template_70ns0sp';
const EMAILJS_PUBLIC_KEY = 'gq5BiFFwtvNSfxmDS';

export async function sendApprovalEmail({ toName, workflowName, stepName, amount, message }) {
  const templateParams = {
    to_name: toName,
    workflow_name: workflowName,
    step_name: stepName,
    amount: amount != null ? String(amount) : 'N/A',
    message
  };

  return emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID,
    templateParams,
    EMAILJS_PUBLIC_KEY
  );
}
