const crypto = require('crypto');

const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
  'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
  'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];

function getNested(obj, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), obj);
}

function verifyPaymobHmac(req) {
  const secret = process.env.PAYMOB_HMAC_SECRET;
  if (!secret) return false;

  const received = String(req.query?.hmac || req.body?.hmac || '').toLowerCase();
  if (!received) return false;
  const obj = req.body?.obj || req.body;
  const concatenated = HMAC_FIELDS.map((field) => String(getNested(obj, field) ?? '')).join('');
  const calculated = crypto.createHmac('sha512', secret).update(concatenated).digest('hex').toLowerCase();
  if (received.length !== calculated.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(calculated));
}

module.exports = { verifyPaymobHmac };
