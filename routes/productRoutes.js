const express = require('express');
const {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  seedDemoProducts,
} = require('../controllers/productController');
const { protect, optionalProtect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalProtect, listProducts); // ?branchId=...
router.post('/seed-demo', protect, restrictTo('admin'), seedDemoProducts);
router.post('/', protect, restrictTo('admin'), createProduct);
router.put('/:id', protect, restrictTo('admin'), updateProduct);
router.delete('/:id', protect, restrictTo('admin'), deleteProduct);

module.exports = router;
