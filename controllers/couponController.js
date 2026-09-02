const Coupon = require('../models/Coupon');

exports.listCoupons = async (req, res) => {
  const coupons = await Coupon.find().sort('-createdAt');
  res.json(coupons);
};

exports.createCoupon = async (req, res) => {
  try {
    const { code, discountPercent, expiresAt, usageLimit } = req.body;
    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      discountPercent,
      expiresAt: expiresAt || null,
      usageLimit: usageLimit || null,
    });
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteCoupon = async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ message: 'Coupon deleted' });
};

// Used by the customer app at checkout to preview the discount before ordering
exports.validateCoupon = async (req, res) => {
  try {
    const { code } = req.query;
    const coupon = await Coupon.findOne({ code: code?.toUpperCase() });

    if (!coupon || !coupon.isActive) {
      return res.status(404).json({ valid: false, message: 'كود الخصم غير صحيح' });
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return res.status(400).json({ valid: false, message: 'كود الخصم منتهي' });
    }
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ valid: false, message: 'كود الخصم خلصت مرات استخدامه' });
    }

    res.json({ valid: true, discountPercent: coupon.discountPercent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
