const Product = require('../models/Product');

exports.listProducts = async (req, res) => {
  const { branchId, search, category, sort, onSale } = req.query;
  const filter = { isAvailable: true };
  if (branchId) {
    filter.$or = [{ availableBranches: { $size: 0 } }, { availableBranches: branchId }];
  }
  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }
  if (category) {
    filter.category = category;
  }
  if (onSale === 'true') {
    filter.onSale = true;
  }

  let query = Product.find(filter);
  if (sort === 'price_asc') query = query.sort('price');
  else if (sort === 'price_desc') query = query.sort('-price');
  else query = query.sort('-createdAt');

  const products = await query;
  res.json(products);
};

exports.createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product deleted' });
};
