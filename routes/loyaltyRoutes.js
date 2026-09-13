const express = require('express');
const { getMyLoyalty, subscribe, getSettings, updateSettings } = require('../controllers/loyaltyController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/me', protect, getMyLoyalty);
router.post('/subscribe', protect, subscribe);
router.get('/settings', protect, restrictTo('admin'), getSettings);
router.put('/settings', protect, restrictTo('admin'), updateSettings);

module.exports = router;
