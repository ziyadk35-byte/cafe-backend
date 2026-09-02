const express = require('express');
const {
  createOrder,
  getMyOrders,
  getBranchOrders,
  getOrderById,
  getMyDelivery,
  getMyDeliveryHistory,
  dispatchOrder,
  updateOrderStatus,
  cancelOrder,
  rateOrder,
  attachDeliveryPhoto,
  updateDriverLocation,
  paymobWebhook,
  getCustomerOrderHistory,
  deleteOrder,
  deleteBranchOrdersByDay,
} = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.post('/', protect, createOrder);
router.get('/my', protect, getMyOrders);
router.get('/my/history', protect, getCustomerOrderHistory);
router.get('/branch/:branchId', protect, restrictTo('branch_staff', 'admin'), getBranchOrders);
router.delete('/branch/:branchId/day', protect, restrictTo('admin'), deleteBranchOrdersByDay);
router.get('/driver/my-delivery', protect, restrictTo('driver'), getMyDelivery);
router.get('/driver/history', protect, restrictTo('driver'), getMyDeliveryHistory);
router.get('/:id', protect, restrictTo('branch_staff', 'admin'), getOrderById);
router.delete('/:id', protect, restrictTo('admin'), deleteOrder);
router.patch('/:id/dispatch', protect, restrictTo('branch_staff', 'admin'), dispatchOrder);
router.patch('/:id/status', protect, restrictTo('branch_staff', 'admin', 'driver'), updateOrderStatus);
router.patch('/:id/cancel', protect, cancelOrder);
router.post('/:id/rate', protect, rateOrder);
router.patch('/:id/delivery-photo', protect, restrictTo('branch_staff', 'driver', 'admin'), attachDeliveryPhoto);
router.patch('/:id/driver-location', protect, restrictTo('driver', 'branch_staff', 'admin'), updateDriverLocation);

// Public webhook endpoint - Paymob calls this server-to-server after payment
router.post('/paymob/webhook', paymobWebhook);

module.exports = router;
