const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendSms, generateOtp } = require('../utils/sms');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const OTP_EXPIRY_MINUTES = 10;

// Step 1: user submits name, phone, password -> account created (unverified) + OTP sent
exports.register = async (req, res) => {
  try {
    const { name, phone, phone2, email, password } = req.body;

    const existing = await User.findOne({ phone });
    if (existing && existing.phoneVerified) {
      return res.status(400).json({ message: 'Phone already registered' });
    }

    const otpCode = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    let user;
    if (existing && !existing.phoneVerified) {
      // re-registering before verifying: update details and resend OTP
      existing.name = name;
      existing.phone2 = phone2;
      existing.email = email;
      existing.password = password; // will be re-hashed by pre-save hook
      existing.otpCode = otpCode;
      existing.otpExpires = otpExpires;
      user = await existing.save();
    } else {
      user = await User.create({
        name,
        phone,
        phone2,
        email,
        password,
        otpCode,
        otpExpires,
      });
    }

    await sendSms(phone, `كود التفعيل بتاعك هو: ${otpCode} - صالح لمدة ${OTP_EXPIRY_MINUTES} دقايق`);

    res.status(201).json({
      message: 'Account created. Enter the verification code sent to your phone.',
      userId: user._id,
      phone: user.phone,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Step 2: user submits the OTP code -> account verified + logged in
exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otpCode } = req.body;
    const user = await User.findOne({ phone }).select('+otpCode +otpExpires');

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.phoneVerified) return res.status(400).json({ message: 'Phone already verified' });
    if (!user.otpCode || user.otpCode !== otpCode) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    if (user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Verification code expired, please resend' });
    }

    user.phoneVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.phoneVerified) return res.status(400).json({ message: 'Phone already verified' });

    const otpCode = generateOtp();
    user.otpCode = otpCode;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await user.save();

    await sendSms(phone, `كود التفعيل بتاعك هو: ${otpCode} - صالح لمدة ${OTP_EXPIRY_MINUTES} دقايق`);
    res.json({ message: 'Verification code resent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'رقم الموبايل ده مش مسجّل عندنا' });

    const otpCode = generateOtp();
    user.otpCode = otpCode;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await user.save();

    await sendSms(phone, `كود إعادة تعيين كلمة المرور هو: ${otpCode} - صالح لمدة ${OTP_EXPIRY_MINUTES} دقايق`);
    res.json({ message: 'Reset code sent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { phone, otpCode, newPassword } = req.body;
    const user = await User.findOne({ phone }).select('+otpCode +otpExpires');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.otpCode || user.otpCode !== otpCode) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    if (user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Verification code expired, please try again' });
    }

    user.password = newPassword; // re-hashed by pre-save hook
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role, branch: user.branch },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid phone or password' });
    }
    if (!user.phoneVerified) {
      return res.status(403).json({ message: 'Phone not verified yet', needsVerification: true });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been disabled' });
    }
    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role, branch: user.branch },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.me = async (req, res) => {
  res.json({ user: req.user });
};

exports.registerPushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;
    req.user.pushToken = pushToken;
    await req.user.save();
    res.json({ message: 'Push token saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// --- Saved addresses ---
exports.listAddresses = async (req, res) => {
  res.json(req.user.addresses || []);
};

exports.addAddress = async (req, res) => {
  try {
    const { label, address, lat, lng, isDefault } = req.body;
    if (isDefault) {
      req.user.addresses.forEach((a) => (a.isDefault = false));
    }
    req.user.addresses.push({
      label,
      address,
      location: { type: 'Point', coordinates: [lng, lat] },
      isDefault: !!isDefault,
    });
    await req.user.save();
    res.status(201).json(req.user.addresses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    req.user.addresses = req.user.addresses.filter(
      (a) => String(a._id) !== req.params.addressId
    );
    await req.user.save();
    res.json(req.user.addresses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
