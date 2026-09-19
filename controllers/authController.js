const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const { sendWhatsAppOtp, generateOtp } = require('../utils/whatsapp');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const OTP_EXPIRY_MINUTES = 10;

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    branch: user.branch,
    authProviders: user.authProviders || [],
  };
}

// Phone registration: create/update an unverified account and send OTP on WhatsApp.
exports.register = async (req, res) => {
  try {
    const { name, phone, phone2, email, password } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ message: 'Name, phone and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ phone });
    if (existing && existing.phoneVerified) {
      return res.status(400).json({ message: 'Phone already registered' });
    }

    const otpCode = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    let user;
    if (existing && !existing.phoneVerified) {
      existing.name = name;
      existing.phone2 = phone2;
      if (email) existing.email = email;
      existing.password = password;
      existing.otpCode = otpCode;
      existing.otpExpires = otpExpires;
      if (!existing.authProviders?.includes('phone')) existing.authProviders = [...(existing.authProviders || []), 'phone'];
      user = await existing.save();
    } else {
      user = await User.create({
        name,
        phone,
        phone2,
        email: email || undefined,
        password,
        authProviders: ['phone'],
        otpCode,
        otpExpires,
      });
    }

    await sendWhatsAppOtp(phone, otpCode, 'verify');

    res.status(201).json({
      message: 'Account created. Enter the verification code sent on WhatsApp.',
      userId: user._id,
      phone: user.phone,
      verificationChannel: 'whatsapp',
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: 'This phone or email is already registered' });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { phone, otpCode } = req.body;
    const user = await User.findOne({ phone }).select('+otpCode +otpExpires');

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.phoneVerified) return res.status(400).json({ message: 'Phone already verified' });
    if (!user.otpCode || user.otpCode !== String(otpCode || '')) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Verification code expired, please resend' });
    }

    user.phoneVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    if (!user.authProviders?.includes('phone')) user.authProviders = [...(user.authProviders || []), 'phone'];
    await user.save();

    const token = signToken(user._id);
    res.json({ token, user: publicUser(user) });
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

    await sendWhatsAppOtp(phone, otpCode, 'verify');
    res.json({ message: 'Verification code resent on WhatsApp', verificationChannel: 'whatsapp' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(404).json({ message: 'رقم الموبايل ده مش مسجّل عندنا' });
    if (!user.authProviders?.includes('phone') || !user.password) {
      return res.status(400).json({ message: 'الحساب ده مسجل بجوجل. ادخل باستخدام Google.' });
    }

    const otpCode = generateOtp();
    user.otpCode = otpCode;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await user.save();

    await sendWhatsAppOtp(phone, otpCode, 'reset');
    res.json({ message: 'Reset code sent on WhatsApp', verificationChannel: 'whatsapp' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { phone, otpCode, newPassword } = req.body;
    const user = await User.findOne({ phone }).select('+otpCode +otpExpires');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.otpCode || user.otpCode !== String(otpCode || '')) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }
    if (!user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Verification code expired, please try again' });
    }

    user.password = newPassword;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    if (!user.authProviders?.includes('phone')) user.authProviders = [...(user.authProviders || []), 'phone'];
    await user.save();

    const token = signToken(user._id);
    res.json({ token, user: publicUser(user) });
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
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Google sign-up/sign-in for customers. The mobile app sends the OAuth access token.
exports.googleLogin = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ message: 'Google access token is required' });

    const tokenInfoResponse = await axios.get('https://oauth2.googleapis.com/tokeninfo', {
      params: { access_token: accessToken },
      timeout: 10000,
    });
    const tokenInfo = tokenInfoResponse.data || {};
    const tokenAudience = tokenInfo.aud || tokenInfo.audience;

    const allowedClientIds = [
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_WEB_CLIENT_ID,
    ].filter(Boolean);

    if (allowedClientIds.length && tokenAudience && !allowedClientIds.includes(tokenAudience)) {
      return res.status(401).json({ message: 'Google token was issued for a different app' });
    }

    const { data: profile } = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });

    if (!profile?.sub || !profile?.email || profile.email_verified === false) {
      return res.status(401).json({ message: 'Could not verify Google account' });
    }

    let user = await User.findOne({ googleId: profile.sub });
    if (!user) {
      user = await User.findOne({ email: String(profile.email).toLowerCase() });
      if (user && user.role !== 'customer') {
        return res.status(403).json({ message: 'Staff accounts must sign in with phone and password' });
      }

      if (user) {
        user.googleId = profile.sub;
        if (!user.authProviders?.includes('google')) user.authProviders = [...(user.authProviders || []), 'google'];
        if (!user.name && profile.name) user.name = profile.name;
        await user.save();
      } else {
        user = await User.create({
          name: profile.name || String(profile.email).split('@')[0],
          email: String(profile.email).toLowerCase(),
          googleId: profile.sub,
          authProviders: ['google'],
          role: 'customer',
          phoneVerified: false,
        });
      }
    }

    if (!user.isActive) return res.status(403).json({ message: 'This account has been disabled' });
    const token = signToken(user._id);
    res.json({ token, user: publicUser(user), isNewGoogleUser: !user.phone });
  } catch (err) {
    console.error('Google auth failed:', err.response?.data || err.message);
    res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
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

exports.listAddresses = async (req, res) => {
  res.json(req.user.addresses || []);
};

exports.addAddress = async (req, res) => {
  try {
    const { label, address, lat, lng, isDefault } = req.body;
    if (isDefault) req.user.addresses.forEach((a) => (a.isDefault = false));
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
    req.user.addresses = req.user.addresses.filter((a) => String(a._id) !== req.params.addressId);
    await req.user.save();
    res.json(req.user.addresses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
