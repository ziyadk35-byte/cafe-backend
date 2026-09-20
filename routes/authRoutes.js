const express = require('express');
const {
  register,
  login,
  googleLogin,
<<<<<<< HEAD
  guestCheckout,
=======
>>>>>>> 8f92032be6b6286c524ac7aa5a2be551dfee9980
  me,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  registerPushToken,
  listAddresses,
  addAddress,
  deleteAddress,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/login', login);
router.post('/google', googleLogin);
<<<<<<< HEAD
router.post('/guest-checkout', guestCheckout);
=======
>>>>>>> 8f92032be6b6286c524ac7aa5a2be551dfee9980
router.get('/me', protect, me);
router.post('/push-token', protect, registerPushToken);
router.get('/addresses', protect, listAddresses);
router.post('/addresses', protect, addAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);

module.exports = router;
