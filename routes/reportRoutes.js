const express = require('express');
const { getSalesReport, getTopPerformers } = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/sales', protect, restrictTo('admin'), getSalesReport);
router.get('/top-performers', protect, restrictTo('admin'), getTopPerformers);

module.exports = router;
