const axios = require('axios');

function normalizePhoneForWhatsApp(phone) {
  const raw = String(phone || '').replace(/\D/g, '');
  if (!raw) return '';

  // Egyptian local mobile number: 01xxxxxxxxx -> 201xxxxxxxxx
  if (raw.startsWith('01') && raw.length === 11) return `2${raw}`;
  if (raw.startsWith('20')) return raw;
  if (raw.startsWith('0020')) return raw.slice(2);
  return raw;
}

/**
 * Sends a WhatsApp OTP through Meta WhatsApp Cloud API.
 *
 * Required production env vars:
 * WHATSAPP_PHONE_NUMBER_ID
 * WHATSAPP_ACCESS_TOKEN
 * WHATSAPP_OTP_TEMPLATE
 *
 * Optional:
 * WHATSAPP_GRAPH_VERSION=v23.0
 * WHATSAPP_OTP_LANGUAGE=ar
 * WHATSAPP_OTP_BUTTON=true
 *
 * The template should have {{1}} in the body for the OTP. If it is an
 * Authentication template with a copy-code button, keep WHATSAPP_OTP_BUTTON=true.
 */
async function sendWhatsAppOtp(phone, otpCode, purpose = 'verify') {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const verifyTemplate = process.env.WHATSAPP_OTP_TEMPLATE;
  const resetTemplate = process.env.WHATSAPP_RESET_TEMPLATE || verifyTemplate;
  const templateName = purpose === 'reset' ? resetTemplate : verifyTemplate;

  // Development fallback keeps the project testable before Meta credentials
  // and templates are approved. Never expose this value to the mobile UI.
  if (!phoneNumberId || !accessToken || !templateName) {
    console.log(`[DEV WHATSAPP OTP] To: ${phone} | Code: ${otpCode} | Purpose: ${purpose}`);
    return { developmentFallback: true };
  }

  const to = normalizePhoneForWhatsApp(phone);
  if (!to) throw new Error('Invalid WhatsApp phone number');

  const components = [
    {
      type: 'body',
      parameters: [{ type: 'text', text: String(otpCode) }],
    },
  ];

  // Meta Authentication templates commonly use an OTP copy-code button.
  // This can be disabled if the approved template has no button.
  if (String(process.env.WHATSAPP_OTP_BUTTON || 'true').toLowerCase() !== 'false') {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: String(otpCode) }],
    });
  }

  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

  const { data } = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_OTP_LANGUAGE || 'ar' },
        components,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return data;
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendWhatsAppOtp, generateOtp, normalizePhoneForWhatsApp };
