const mongoose = require('mongoose');

// A single document holding app-wide settings the admin can tune - the
// points-to-discount ratio and the monthly subscription's price/discount.
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    pointsThreshold: { type: Number, default: 100 }, // points needed to redeem
    pointsDiscountAmount: { type: Number, default: 20 }, // EGP off when redeemed
    subscriptionPriceEGP: { type: Number, default: 99 }, // monthly price
    subscriptionDiscountPercent: { type: Number, default: 10 }, // % off products while subscribed
  },
  { timestamps: true }
);

settingsSchema.statics.getGlobal = async function () {
  let settings = await this.findOne({ key: 'global' });
  if (!settings) settings = await this.create({ key: 'global' });
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);
