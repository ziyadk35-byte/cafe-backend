const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: String, // snapshot at order time
        price: Number, // snapshot at order time
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    deliveryAddress: {
      address: String,
      // Not enforced with `required: true` at the schema level on purpose:
      // that would break re-saving OLDER orders (created before this field
      // existed) whenever their status changes. It's still required at
      // order-creation time via an explicit check in createOrder.
      contactPhone: String,
      contactPhone2: String, // optional backup contact for this order
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true }, // [lng, lat]
      },
    },
    subtotal: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['cash', 'paymob'], required: true },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    paymobOrderId: String, // reference from Paymob
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'pending',
    },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // cashier/admin who confirmed the order
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    driverLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] }, // [lng, lat] - updated live during delivery
    },
    deliveryPhoto: String, // URL uploaded by driver on delivery as proof
    rating: {
      stars: { type: Number, min: 1, max: 5 },
      comment: String,
      ratedAt: Date,
    },
    couponCode: String,
    couponDiscountAmount: { type: Number, default: 0 },
    notes: String,
  },
  { timestamps: true }
);

orderSchema.index({ 'driverLocation': '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Order', orderSchema);
