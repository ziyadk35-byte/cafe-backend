const axios = require('axios');

/**
 * Sends a push notification via Expo's push service. Works for any app built
 * with Expo without needing separate Firebase/APNs setup.
 */
async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!pushToken) return;
  try {
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: pushToken,
      title,
      body,
      data,
      sound: 'default',
    });
  } catch (err) {
    console.error('Push notification failed:', err.message);
  }
}

module.exports = { sendPushNotification };
