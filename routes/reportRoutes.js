const express = require('express');
const { getSalesReport } = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/sales', protect, restrictTo('admin'), getSalesReport);

module.exports = router;
