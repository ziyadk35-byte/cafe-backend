const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    phone2: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    password: { type: String },
    googleId: { type: String, unique: true, sparse: true, index: true },
    authProviders: {
      type: [{ type: String, enum: ['phone', 'google'] }],
      default: ['phone'],
    },
    role: {
      type: String,
      enum: ['customer', 'branch_staff', 'driver', 'admin'],
      default: 'customer',
    },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    phoneVerified: { type: Boolean, default: false },
    otpCode: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    loyaltyDiscountUsed: { type: Boolean, default: false },
    loyaltyPoints: { type: Number, default: 0 },
    subscriptionExpiresAt: { type: Date },
    isActive: { type: Boolean, default: true },
    pushToken: String,
    addresses: [
      {
        label: String,
        address: String,
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], default: [0, 0] },
        },
        isDefault: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
