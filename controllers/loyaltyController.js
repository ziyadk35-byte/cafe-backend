const User = require('../models/User');
const Settings = require('../models/Settings');

// Customer: see their points balance, subscription status, and the current
// redemption rules (so the app can show "you need N more points").
exports.getMyLoyalty = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const settings = await Settings.getGlobal();
    res.json({
      points: user.loyaltyPoints,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      isSubscribed: user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date(),
      pointsThreshold: settings.pointsThreshold,
      pointsDiscountAmount: settings.pointsDiscountAmount,
      subscriptionPriceEGP: settings.subscriptionPriceEGP,
      subscriptionDiscountPercent: settings.subscriptionDiscountPercent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Customer: subscribe for a month. Payment is trusted the same way cash
// orders are in this app (no separate real-money gateway call here) -
// activates/extends the discount period by 30 days from today.
exports.subscribe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const now = new Date();
    const base = user.subscriptionExpiresAt && user.subscriptionExpiresAt > now ? user.subscriptionExpiresAt : now;
    user.subscriptionExpiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
    await user.save();
    res.json({ subscriptionExpiresAt: user.subscriptionExpiresAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: read/update the global loyalty & subscription settings.
exports.getSettings = async (req, res) => {
  const settings = await Settings.getGlobal();
  res.json(settings);
};

exports.updateSettings = async (req, res) => {
  try {
    const { pointsThreshold, pointsDiscountAmount, subscriptionPriceEGP, subscriptionDiscountPercent } = req.body;
    const settings = await Settings.getGlobal();
    if (pointsThreshold !== undefined) settings.pointsThreshold = pointsThreshold;
    if (pointsDiscountAmount !== undefined) settings.pointsDiscountAmount = pointsDiscountAmount;
    if (subscriptionPriceEGP !== undefined) settings.subscriptionPriceEGP = subscriptionPriceEGP;
    if (subscriptionDiscountPercent !== undefined) settings.subscriptionDiscountPercent = subscriptionDiscountPercent;
    await settings.save();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
