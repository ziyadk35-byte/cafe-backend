const crypto = require('crypto');

// Generates a short-lived signed upload signature so the mobile app can
// upload an image DIRECTLY to Cloudinary (fast, doesn't burden our server
// with large image payloads) without exposing our API secret to the client.
exports.getUploadSignature = async (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'cafe-delivery-proofs';

    // Cloudinary requires signing exactly the params that will be sent in
    // the upload request, sorted alphabetically, as key=value&key=value.
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + process.env.CLOUDINARY_API_SECRET)
      .digest('hex');

    res.json({
      timestamp,
      folder,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
