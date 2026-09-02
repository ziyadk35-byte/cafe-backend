const axios = require('axios');

/**
 * Generic SMS sender. Swap the implementation inside this function
 * for whichever provider you use (Twilio, Msegat, SMS Misr, Vodafone, etc.)
 * without touching any other file in the project.
 */
async function sendSms(phone, message) {
  if (process.env.SMS_PROVIDER === 'twilio') {
    const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    await twilio.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_NUMBER,
      to: phone,
    });
    return;
  }

  // Example generic HTTP-based provider (many Egyptian SMS gateways work like this)
  if (process.env.SMS_PROVIDER === 'generic_http') {
    await axios.post(process.env.SMS_PROVIDER_URL, {
      apiKey: process.env.SMS_PROVIDER_KEY,
      to: phone,
      message,
    });
    return;
  }

  // Fallback for local development: just log it instead of sending a real SMS
  console.log(`[DEV SMS] To: ${phone} | Message: ${message}`);
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

module.exports = { sendSms, generateOtp };
