const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const Settings = require('../models/Settings');
const SubscriptionPayment = require('../models/SubscriptionPayment');
const { findNearestBranch } = require('../utils/geoUtils');
const { createPaymobPayment } = require('../utils/paymob');
const { sendPushNotification } = require('../utils/push');
const { getBaseSellingPrice, roundMoney } = require('../utils/pricing');
const { verifyPaymobHmac } = require('../utils/paymobHmac');

const CANCEL_WINDOW_MS = 2 * 60 * 1000;

const STATUS_MESSAGES = {
  confirmed: 'طلبك اتأكد وهيدخل التحضير 👌',
  preparing: 'طلبك بيتحضّر دلوقتي ☕',
  out_for_delivery: 'الدليفري في الطريق ليك 🚴',
  delivered: 'طلبك وصل! بالهنا والشفا 🎉',
  cancelled: 'اتلغى الطلب',
};

async function finalizeOrderRewards(order) {
  if (order.rewardsFinalized || order.status !== 'delivered') return;

  const user = await User.findById(order.customer);
  if (!user) return;
  const settings = await Settings.getGlobal();

  if (order.discountAmount > 0) user.loyaltyDiscountUsed = true;

  if (order.pointsDiscountAmount > 0 && user.loyaltyPoints >= settings.pointsThreshold) {
    user.loyaltyPoints -= settings.pointsThreshold;
  }

  const earned = Math.floor((order.subtotal || 0) / 10);
  user.loyaltyPoints += earned;
  order.pointsEarned = earned;

  if (order.couponCode) {
    await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
  }

  order.rewardsFinalized = true;
  await user.save();
  await order.save();
}

exports.createOrder = async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod, notes, couponCode, redeemPoints } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }
    if (!deliveryAddress?.contactPhone) {
      return res.status(400).json({ message: 'رقم موبايل للتواصل مطلوب' });
    }

    const branchResult = await findNearestBranch(deliveryAddress.lng, deliveryAddress.lat);
    if (!branchResult?.branch) {
      return res.status(400).json({ message: 'No branch delivers to this location' });
    }
    const branch = branchResult.branch;

    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isAvailable) {
        return res.status(400).json({ message: `Product unavailable: ${item.productId}` });
      }
      if (
        product.availableBranches?.length > 0 &&
        !product.availableBranches.some((id) => String(id) === String(branch._id))
      ) {
        return res.status(400).json({ message: `Product unavailable in this branch: ${product.name}` });
      }
      const unitPrice = getBaseSellingPrice(product);
      subtotal += unitPrice * item.quantity;
      orderItems.push({ product: product._id, name: product.name, nameEn: product.nameEn, price: unitPrice, quantity: item.quantity });
    }
    subtotal = roundMoney(subtotal);

    const deliveryFee = branch.deliveryFee ?? 25;

    const previousOrdersCount = await Order.countDocuments({
      customer: req.user._id,
      status: 'delivered',
    });

    let discountAmount = 0;
    if (previousOrdersCount === 1 && !req.user.loyaltyDiscountUsed) {
      discountAmount = roundMoney(subtotal * 0.2);
    }

    let couponDiscountAmount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      appliedCoupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (
        appliedCoupon && appliedCoupon.isActive &&
        (!appliedCoupon.expiresAt || appliedCoupon.expiresAt > new Date()) &&
        (!appliedCoupon.usageLimit || appliedCoupon.usedCount < appliedCoupon.usageLimit)
      ) {
        couponDiscountAmount = roundMoney(subtotal * (appliedCoupon.discountPercent / 100));
      } else {
        appliedCoupon = null;
      }
    }

    const settings = await Settings.getGlobal();
    const hasActiveSubscription =
      req.user.subscriptionExpiresAt && req.user.subscriptionExpiresAt > new Date();
    const subscriptionDiscountAmount = hasActiveSubscription
      ? roundMoney(subtotal * (settings.subscriptionDiscountPercent / 100))
      : 0;

    const canRedeemPoints = !!redeemPoints && req.user.loyaltyPoints >= settings.pointsThreshold;
    const pointsDiscountAmount = canRedeemPoints ? settings.pointsDiscountAmount : 0;

    const finalTotal = roundMoney(Math.max(
      0,
      subtotal - discountAmount - couponDiscountAmount - subscriptionDiscountAmount - pointsDiscountAmount + deliveryFee
    ));

    const order = await Order.create({
      customer: req.user._id,
      branch: branch._id,
      items: orderItems,
      deliveryAddress: {
        address: deliveryAddress.address,
        contactPhone: deliveryAddress.contactPhone,
        contactPhone2: deliveryAddress.contactPhone2,
        location: { type: 'Point', coordinates: [deliveryAddress.lng, deliveryAddress.lat] },
      },
      subtotal,
      discountAmount,
      couponCode: appliedCoupon?.code,
      couponDiscountAmount,
      subscriptionDiscountAmount,
      pointsDiscountAmount,
      deliveryFee,
      total: finalTotal,
      paymentMethod,
      availableToBranchAt: paymentMethod === 'cash' ? new Date() : undefined,
      notes,
    });

    let paymentInfo = null;
    if (paymentMethod === 'paymob') {
      const payment = await createPaymobPayment({
        amountCents: Math.round(finalTotal * 100),
        orderId: order._id,
        customer: { name: req.user.name, email: req.user.email, phone: req.user.phone },
      });
      order.paymobOrderId = String(payment.paymobOrderId);
      await order.save();
      paymentInfo = { iframeUrl: payment.iframeUrl };
    } else {
      const io = req.app.get('io');
      io.to(`branch_${branch._id}`).emit('new_order', order);
    }

    res.status(201).json({ order, paymentInfo });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyOrders = async (req, res) => {
  const orders = await Order.find({ customer: req.user._id }).sort('-createdAt');
  res.json(orders);
};

exports.getCustomerOrderHistory = async (req, res) => {
  try {
    const completedOrdersCount = await Order.countDocuments({ customer: req.user._id, status: 'delivered' });
    res.json({
      phone: req.user.phone,
      completedOrdersCount,
      isReturningCustomer: completedOrdersCount > 0,
      eligibleSecondOrderDiscount: completedOrdersCount === 1 && !req.user.loyaltyDiscountUsed,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

function populatedOrderQuery(query) {
  return query
    .populate('customer', 'name phone phone2')
    .populate('driver', 'name phone')
    .populate('confirmedBy', 'name')
    .populate('preparingBy', 'name')
    .populate('dispatchedBy', 'name');
}

exports.getBranchOrders = async (req, res) => {
  if (req.user.role !== 'admin' && String(req.user.branch) !== req.params.branchId) {
    return res.status(403).json({ message: 'You can only view orders for your own branch' });
  }
  const orders = await populatedOrderQuery(Order.find({ branch: req.params.branchId }).sort('-createdAt'));
  res.json(orders);
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await populatedOrderQuery(Order.findById(req.params.id));
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin' && String(req.user.branch) !== String(order.branch)) {
      return res.status(403).json({ message: 'You can only view orders for your own branch' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyDelivery = async (req, res) => {
  try {
    const order = await Order.findOne({ driver: req.user._id, status: { $in: ['assigned_to_driver', 'out_for_delivery'] } }).sort('dispatchedAt');
    res.json(order || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyDeliveries = async (req, res) => {
  try {
    const orders = await Order.find({ driver: req.user._id, status: { $in: ['assigned_to_driver', 'out_for_delivery'] } })
      .sort('dispatchedAt')
      .populate('customer', 'name phone phone2');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyDeliveryHistory = async (req, res) => {
  try {
    const orders = await Order.find({
      driver: req.user._id,
      status: { $in: ['delivered', 'cancelled'] },
    }).sort('-deliveredAt -updatedAt').populate('customer', 'name phone phone2');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.dispatchOrder = async (req, res) => {
  try {
    const { driverId } = req.body;
    const order = await Order.findById(req.params.id).populate('customer', 'pushToken');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin' && String(req.user.branch) !== String(order.branch)) {
      return res.status(403).json({ message: 'You can only dispatch orders for your own branch' });
    }

    const driver = await User.findOne({
      _id: driverId,
      role: 'driver',
      branch: order.branch,
      isActive: true,
    });
    if (!driver) return res.status(400).json({ message: 'الدليفري ده مش موجود أو موقوف في نفس الفرع' });

    order.driver = driver._id;
    order.status = 'assigned_to_driver';
    order.dispatchedAt = new Date();
    order.driverAcceptedAt = undefined;
    order.dispatchedBy = req.user._id;
    await order.save();

    const io = req.app.get('io');
    const payload = { orderId: order._id, status: 'assigned_to_driver' };
    io.to(`order_${order._id}`).emit('order_status_updated', payload);
    io.to(`customer_${order.customer._id}`).emit('order_status_updated', payload);
    io.to(`branch_${order.branch}`).emit('order_status_updated', payload);

    if (order.customer.pushToken) {
      sendPushNotification(order.customer.pushToken, 'كافيه', 'تم تعيين مندوب لطلبك، وفي انتظار استلامه للطلب', { orderId: String(order._id) });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.acceptDelivery = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'pushToken name phone phone2');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'driver' || String(order.driver) !== String(req.user._id)) {
      return res.status(403).json({ message: 'الطلب ده مش معين ليك' });
    }
    if (order.status !== 'assigned_to_driver') {
      return res.status(400).json({ message: 'الطلب مش في مرحلة انتظار استلام الدليفري' });
    }

    order.status = 'out_for_delivery';
    order.driverAcceptedAt = new Date();
    await order.save();

    const io = req.app.get('io');
    const payload = { orderId: order._id, status: 'out_for_delivery', driverAcceptedAt: order.driverAcceptedAt };
    io.to(`order_${order._id}`).emit('order_status_updated', payload);
    io.to(`customer_${order.customer._id}`).emit('order_status_updated', payload);
    io.to(`branch_${order.branch}`).emit('order_status_updated', payload);

    if (order.customer.pushToken) {
      sendPushNotification(order.customer.pushToken, 'كافيه', STATUS_MESSAGES.out_for_delivery, { orderId: String(order._id) });
    }

    const populated = await Order.findById(order._id).populate('customer', 'name phone phone2');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (status === 'out_for_delivery') {
      return res.status(400).json({ message: 'استخدم تعيين دليفري عشان تنقل الطلب لمرحلة التوصيل' });
    }

    const order = await Order.findById(req.params.id).populate('customer', 'pushToken');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin' && String(req.user.branch) !== String(order.branch)) {
      return res.status(403).json({ message: 'You can only update orders for your own branch' });
    }
    if (req.user.role === 'driver') {
      if (status !== 'delivered' || String(order.driver) !== String(req.user._id)) {
        return res.status(403).json({ message: 'مسموحلك بس تعلّم على تسليم الطلب المعين ليك' });
      }
    }

    order.status = status;
    if (status === 'confirmed' && !order.confirmedAt) {
      order.confirmedAt = new Date();
      order.confirmedBy = req.user._id;
    }
    if (status === 'preparing' && !order.preparingAt) {
      order.preparingAt = new Date();
      order.preparingBy = req.user._id;
    }
    if (status === 'delivered' && !order.deliveredAt) {
      order.deliveredAt = new Date();
      if (order.paymentMethod === 'cash') order.paymentStatus = 'paid';
    }
    await order.save();

    if (status === 'delivered') await finalizeOrderRewards(order);

    const io = req.app.get('io');
    const payload = { orderId: order._id, status };
    io.to(`order_${order._id}`).emit('order_status_updated', payload);
    io.to(`customer_${order.customer._id}`).emit('order_status_updated', payload);
    io.to(`branch_${order.branch}`).emit('order_status_updated', payload);

    if (STATUS_MESSAGES[status] && order.customer.pushToken) {
      sendPushNotification(order.customer.pushToken, 'كافيه', STATUS_MESSAGES[status], { orderId: String(order._id) });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== String(req.user._id)) return res.status(403).json({ message: 'This is not your order' });
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ message: 'الطلب بدأ يتحضّر بالفعل، مش ممكن تلغيه دلوقتي' });
    }
    if (Date.now() - new Date(order.createdAt).getTime() > CANCEL_WINDOW_MS) {
      return res.status(400).json({ message: 'انتهت فترة إلغاء الطلب (أول دقيقتين بس)' });
    }

    order.status = 'cancelled';
    await order.save();
    const io = req.app.get('io');
    io.to(`branch_${order.branch}`).emit('order_status_updated', { orderId: order._id, status: 'cancelled' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rateOrder = async (req, res) => {
  try {
    const { stars, comment } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== String(req.user._id)) return res.status(403).json({ message: 'This is not your order' });
    if (order.status !== 'delivered') return res.status(400).json({ message: 'تقدر تقيّم بس بعد ما الطلب يوصل' });
    if (order.rating?.stars) return res.status(400).json({ message: 'أنت قيّمت الطلب ده قبل كده' });
    order.rating = { stars, comment, ratedAt: new Date() };
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.attachDeliveryPhoto = async (req, res) => {
  try {
    const { photoUrl } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin' && String(req.user.branch) !== String(order.branch)) {
      return res.status(403).json({ message: 'You can only update orders for your own branch' });
    }
    if (req.user.role === 'driver' && String(order.driver) !== String(req.user._id)) {
      return res.status(403).json({ message: 'مسموحلك بس ترفع صورة الطلب المعين ليك' });
    }
    order.deliveryPhoto = photoUrl;
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateDriverLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ message: 'Valid lat/lng are required' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role === 'driver' && String(order.driver) !== String(req.user._id)) {
      return res.status(403).json({ message: 'مسموحلك بس تحدّث موقع الطلب المعين ليك' });
    }

    order.driverLocation = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
    order.driverLocationUpdatedAt = new Date();
    await order.save();

    const payload = { orderId: order._id, lat: Number(lat), lng: Number(lng), updatedAt: order.driverLocationUpdatedAt };
    const io = req.app.get('io');
    io.to(`order_${order._id}`).emit('driver_location_updated', payload);
    io.to(`branch_${order.branch}`).emit('driver_location_updated', payload);
    res.json({ message: 'Location updated', driverLocationUpdatedAt: order.driverLocationUpdatedAt });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteBranchOrdersByDay = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { date } = req.query;
    const day = date ? new Date(date) : new Date();
    const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const result = await Order.deleteMany({ branch: branchId, createdAt: { $gte: startOfDay, $lt: endOfDay } });
    res.json({ message: 'Orders deleted', deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.paymobWebhook = async (req, res) => {
  try {
    if (!verifyPaymobHmac(req)) return res.status(401).json({ message: 'Invalid Paymob HMAC' });
    const { obj } = req.body;
    if (!obj) return res.status(400).end();

    const merchantOrderId = String(obj.order?.merchant_order_id || '');
    const success = !!obj.success;
    if (!mongoose.isValidObjectId(merchantOrderId)) return res.status(200).end();

    const order = await Order.findById(merchantOrderId);
    if (order) {
      const wasPaid = order.paymentStatus === 'paid';
      // Never downgrade a successfully paid order if Paymob later sends a failed
      // attempt/event for the same merchant order.
      if (!(wasPaid && !success)) {
        order.paymentStatus = success ? 'paid' : 'failed';
        if (!success && order.status === 'pending') order.status = 'cancelled';
        await order.save();
      }

      const io = req.app.get('io');
      io.to(`branch_${order.branch}`).emit('order_payment_updated', {
        orderId: order._id,
        paymentStatus: order.paymentStatus,
      });
      if (success && !wasPaid) {
        order.availableToBranchAt = new Date();
        await order.save();
        const populated = await Order.findById(order._id).populate('customer', 'name phone');
        io.to(`branch_${order.branch}`).emit('new_order', populated);
      }
      return res.status(200).end();
    }

    const subscriptionPayment = await SubscriptionPayment.findById(merchantOrderId);
    if (subscriptionPayment) {
      const wasPaid = subscriptionPayment.paymentStatus === 'paid';
      if (!(wasPaid && !success)) subscriptionPayment.paymentStatus = success ? 'paid' : 'failed';
      if (success && !wasPaid && !subscriptionPayment.activatedAt) {
        const user = await User.findById(subscriptionPayment.user);
        if (user) {
          const now = new Date();
          const base = user.subscriptionExpiresAt && user.subscriptionExpiresAt > now ? user.subscriptionExpiresAt : now;
          user.subscriptionExpiresAt = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
          subscriptionPayment.activatedAt = new Date();
          await user.save();
          req.app.get('io').to(`customer_${user._id}`).emit('subscription_updated', {
            subscriptionExpiresAt: user.subscriptionExpiresAt,
          });
        }
      }
      await subscriptionPayment.save();
      return res.status(200).end();
    }

    res.status(200).end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
