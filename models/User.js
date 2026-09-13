const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true },
    phone2: { type: String, trim: true }, // backup contact number, e.g. for the driver to call
    email: { type: String, trim: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['customer', 'branch_staff', 'driver', 'admin'],
      default: 'customer',
    },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // for staff/driver
    phoneVerified: { type: Boolean, default: false },
    otpCode: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    loyaltyDiscountUsed: { type: Boolean, default: false }, // 20% off 2nd order, one-time
    loyaltyPoints: { type: Number, default: 0 }, // 1 point per 10 EGP spent
    subscriptionExpiresAt: { type: Date }, // active monthly discount subscription
    isActive: { type: Boolean, default: true }, // for disabling staff accounts
    pushToken: String, // Expo push notification token
    addresses: [
      {
        label: String,
        address: String,
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
        },
        isDefault: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
