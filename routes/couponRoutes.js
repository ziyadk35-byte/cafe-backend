const express = require('express');
const {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} = require('../controllers/couponController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/validate', protect, validateCoupon); // any logged-in customer
router.use(protect, restrictTo('admin'));
router.get('/', listCoupons);
router.post('/', createCoupon);
router.put('/:id', updateCoupon);
router.delete('/:id', deleteCoupon);

module.exports = router;
