const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    phone: String,
    isActive: { type: Boolean, default: true }, // permanent enable/disable
    isOpen: { type: Boolean, default: true }, // temporary pause (e.g. today's holiday, too busy)
    // GeoJSON Point for geospatial queries: coordinates = [longitude, latitude]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    // max distance (in meters) this branch will deliver to
    deliveryRadiusMeters: { type: Number, default: 8000 },
    deliveryFee: { type: Number, default: 25 }, // set by admin per-branch
    openingHours: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '23:00' },
    },
  },
  { timestamps: true }
);

// Enable geospatial queries (find nearest branch)
branchSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Branch', branchSchema);
