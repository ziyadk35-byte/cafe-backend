const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    // 'hot' (سخن), 'cold' (ساقع), 'food' (أكل) - drives the category chips in the app
    category: { type: String, enum: ['hot', 'cold', 'food'], default: 'hot' },
    image: String,
    isAvailable: { type: Boolean, default: true },
    onSale: { type: Boolean, default: false },
    salePrice: { type: Number }, // required only when onSale is true
    // if empty array => available in all branches
    availableBranches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
