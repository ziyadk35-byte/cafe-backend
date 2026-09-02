const axios = require('axios');

const PAYMOB_BASE = 'https://accept.paymob.com/api';

/**
 * Full Paymob "Accept" flow:
 * 1. Authenticate -> get auth token
 * 2. Create order on Paymob
 * 3. Generate payment key
 * Returns an iframe URL the frontend/webview can open to complete payment.
 */
async function createPaymobPayment({ amountCents, orderId, customer }) {
  // Step 1: Auth
  const authRes = await axios.post(`${PAYMOB_BASE}/auth/tokens`, {
    api_key: process.env.PAYMOB_API_KEY,
  });
  const authToken = authRes.data.token;

  // Step 2: Create order
  const orderRes = await axios.post(`${PAYMOB_BASE}/ecommerce/orders`, {
    auth_token: authToken,
    delivery_needed: false,
    amount_cents: amountCents,
    currency: 'EGP',
    merchant_order_id: orderId.toString(),
    items: [],
  });
  const paymobOrderId = orderRes.data.id;

  // Step 3: Payment key
  const paymentKeyRes = await axios.post(`${PAYMOB_BASE}/acceptance/payment_keys`, {
    auth_token: authToken,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: paymobOrderId,
    billing_data: {
      apartment: 'NA',
      email: customer.email || 'customer@example.com',
      floor: 'NA',
      first_name: customer.name?.split(' ')[0] || 'Customer',
      last_name: customer.name?.split(' ').slice(1).join(' ') || 'Customer',
      street: 'NA',
      building: 'NA',
      phone_number: customer.phone,
      shipping_method: 'NA',
      postal_code: 'NA',
      city: 'NA',
      country: 'EG',
      state: 'NA',
    },
    currency: 'EGP',
    integration_id: process.env.PAYMOB_INTEGRATION_ID_CARD,
  });
  const paymentToken = paymentKeyRes.data.token;

  const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`;

  return { paymobOrderId, iframeUrl };
}

module.exports = { createPaymobPayment };
