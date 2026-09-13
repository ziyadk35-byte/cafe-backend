const User = require('../models/User');
const Settings = require('../models/Settings');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { createPaymobPayment } = require('../utils/paymob');

exports.getMyLoyalty = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const settings = await Settings.getGlobal();
    res.json({
      points: user.loyaltyPoints,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      isSubscribed: !!(user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()),
      pointsThreshold: settings.pointsThreshold,
      pointsDiscountAmount: settings.pointsDiscountAmount,
      subscriptionPriceEGP: settings.subscriptionPriceEGP,
      subscriptionDiscountPercent: settings.subscriptionDiscountPercent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Creates a real Paymob card payment. The subscription is activated only by
// the verified Paymob webhook after a successful transaction.
exports.subscribe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const settings = await Settings.getGlobal();

    const payment = await SubscriptionPayment.create({
      user: user._id,
      amount: settings.subscriptionPriceEGP,
      discountPercent: settings.subscriptionDiscountPercent,
    });

    const { paymobOrderId, iframeUrl } = await createPaymobPayment({
      amountCents: Math.round(settings.subscriptionPriceEGP * 100),
      orderId: payment._id,
      customer: { name: user.name, email: user.email, phone: user.phone },
    });

    payment.paymobOrderId = String(paymobOrderId);
    await payment.save();

    res.status(201).json({
      paymentId: payment._id,
      paymentInfo: { iframeUrl },
      amount: payment.amount,
      discountPercent: payment.discountPercent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSubscriptionPayment = async (req, res) => {
  try {
    const payment = await SubscriptionPayment.findOne({ _id: req.params.id, user: req.user._id });
    if (!payment) return res.status(404).json({ message: 'Subscription payment not found' });
    const user = await User.findById(req.user._id);
    res.json({
      paymentStatus: payment.paymentStatus,
      activatedAt: payment.activatedAt,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      isSubscribed: !!(user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

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
