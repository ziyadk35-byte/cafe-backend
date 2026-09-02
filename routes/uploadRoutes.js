const express = require('express');
const { getUploadSignature } = require('../controllers/uploadController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/signature', protect, restrictTo('branch_staff', 'driver', 'admin'), getUploadSignature);

module.exports = router;
