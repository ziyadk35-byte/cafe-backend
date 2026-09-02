const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const { findNearestBranch, haversineDistance } = require('../utils/geoUtils');
const { createPaymobPayment } = require('../utils/paymob');
const { sendPushNotification } = require('../utils/push');

const CANCEL_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

const STATUS_MESSAGES = {
  confirmed: 'طلبك اتأكد وهيدخل التحضير 👌',
  preparing: 'طلبك بيتحضّر دلوقتي ☕',
  out_for_delivery: 'الدليفري في الطريق ليك 🚴',
  delivered: 'طلبك وصل! بالهنا والشفا 🎉',
  cancelled: 'اتلغى الطلب',
};

// Create a new order: resolves nearest branch by GPS, calculates total,
// applies loyalty/coupon discounts, and either marks as cash-pending or
// creates a Paymob payment session.
exports.createOrder = async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod, notes, couponCode } = req.body;
    // deliveryAddress: { address, lat, lng, contactPhone, contactPhone2 }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }
    if (!deliveryAddress?.contactPhone) {
      return res.status(400).json({ message: 'رقم موبايل للتواصل مطلوب' });
    }

    const branchResult = await findNearestBranch(deliveryAddress.lng, deliveryAddress.lat);
    if (!branchResult || !branchResult.branch) {
      return res.status(400).json({ message: 'No branch delivers to this location' });
    }
    const branch = branchResult.branch;

    // Build order items with price snapshot from DB (never trust client prices)
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isAvailable) {
        return res.status(400).json({ message: `Product unavailable: ${item.productId}` });
      }
      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;
      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
      });
    }

    const deliveryFee = branch.deliveryFee ?? 25; // per-branch fee set by admin

    // Loyalty discount: 20% off, granted once, on the customer's 2nd
    // completed order. We check completed orders BEFORE this one.
    const previousOrdersCount = await Order.countDocuments({
      customer: req.user._id,
      $or: [{ paymentMethod: 'cash' }, { paymentStatus: 'paid' }],
      status: { $ne: 'cancelled' },
    });

    let discountAmount = 0;
    const eligibleForLoyaltyDiscount = previousOrdersCount === 1 && !req.user.loyaltyDiscountUsed;
    if (eligibleForLoyaltyDiscount) {
      discountAmount = Math.round(subtotal * 0.2 * 100) / 100;
    }

    // Coupon discount (stacks with loyalty discount if both somehow apply,
    // but in practice you'd usually only expect one to be used per order)
    let couponDiscountAmount = 0;
    let appliedCoupon = null;
    if (couponCode) {
      appliedCoupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (
        appliedCoupon &&
        appliedCoupon.isActive &&
        (!appliedCoupon.expiresAt || appliedCoupon.expiresAt > new Date()) &&
        (!appliedCoupon.usageLimit || appliedCoupon.usedCount < appliedCoupon.usageLimit)
      ) {
        couponDiscountAmount = Math.round(subtotal * (appliedCoupon.discountPercent / 100) * 100) / 100;
      } else {
        appliedCoupon = null; // invalid/expired - silently ignore, don't fail the order
      }
    }

    const total = subtotal - discountAmount - couponDiscountAmount + deliveryFee;

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
      couponCode: appliedCoupon ? appliedCoupon.code : undefined,
      couponDiscountAmount,
      deliveryFee,
      total,
      paymentMethod,
      notes,
    });

    if (discountAmount > 0) {
      req.user.loyaltyDiscountUsed = true;
      await req.user.save();
    }
    if (appliedCoupon) {
      appliedCoupon.usedCount += 1;
      await appliedCoupon.save();
    }

    let paymentInfo = null;
    if (paymentMethod === 'paymob') {
      const { paymobOrderId, iframeUrl } = await createPaymobPayment({
        amountCents: Math.round(total * 100),
        orderId: order._id,
        customer: { name: req.user.name, email: req.user.email, phone: req.user.phone },
      });
      order.paymobOrderId = paymobOrderId;
      await order.save();
      paymentInfo = { iframeUrl };
    }

    // Notify the branch in real time via Socket.io
    const io = req.app.get('io');
    io.to(`branch_${branch._id}`).emit('new_order', order);

    res.status(201).json({ order, paymentInfo });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getMyOrders = async (req, res) => {
  const orders = await Order.find({ customer: req.user._id }).sort('-createdAt');
  res.json(orders);
};

// Used to know if a phone number has ordered before (basis for "20% off your
// next order" style loyalty discounts). Counts only successfully paid/confirmed
// orders so abandoned/failed orders don't count.
exports.getCustomerOrderHistory = async (req, res) => {
  try {
    const completedOrdersCount = await Order.countDocuments({
      customer: req.user._id,
      $or: [{ paymentMethod: 'cash' }, { paymentStatus: 'paid' }],
      status: { $ne: 'cancelled' },
    });

    res.json({
      phone: req.user.phone,
      completedOrdersCount,
      isReturningCustomer: completedOrdersCount > 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getBranchOrders = async (req, res) => {
  // branch_staff/driver can only see orders for the branch they belong to
  if (req.user.role !== 'admin' && String(req.user.branch) !== req.params.branchId) {
    return res.status(403).json({ message: 'You can only view orders for your own branch' });
  }
  const orders = await Order.find({ branch: req.params.branchId })
    .sort('-createdAt')
    .populate('customer', 'name phone phone2')
    .populate('driver', 'name phone')
    .populate('confirmedBy', 'name');
  res.json(orders);
};

// Full detail for a single order - used by the cashier/admin "order details"
// view (customer info, who confirmed it, who delivered it, delivery photo).
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone phone2')
      .populate('driver', 'name phone')
      .populate('confirmedBy', 'name');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (req.user.role !== 'admin' && String(req.user.branch) !== String(order.branch)) {
      return res.status(403).json({ message: 'You can only view orders for your own branch' });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Returns the driver's currently assigned active delivery (if any). Drivers
// only ever see this one order - never the full branch order list.
exports.getMyDelivery = async (req, res) => {
  try {
    const order = await Order.findOne({
      driver: req.user._id,
      status: 'out_for_delivery',
    }).sort('-updatedAt');
    res.json(order || null);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Driver's past deliveries (delivered/cancelled orders that were assigned to
// them) - shown in their own "completed orders" tab.
exports.getMyDeliveryHistory = async (req, res) => {
  try {
    const orders = await Order.find({
      driver: req.user._id,
      status: { $in: ['delivered', 'cancelled'] },
    })
      .sort('-updatedAt')
      .populate('customer', 'name phone phone2');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Branch staff assigns a specific driver to an order and moves it to
// "out_for_delivery" in one step - the driver only finds out once they're
// actually dispatched, not before.
exports.dispatchOrder = async (req, res) => {
  try {
    const { driverId } = req.body;
    const order = await Order.findById(req.params.id).populate('customer', 'pushToken');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (req.user.role !== 'admin' && String(req.user.branch) !== String(order.branch)) {
      return res.status(403).json({ message: 'You can only dispatch orders for your own branch' });
    }

    const driver = await User.findOne({ _id: driverId, role: 'driver', branch: order.branch });
    if (!driver) {
      return res.status(400).json({ message: 'الدليفري ده مش موجود في نفس الفرع' });
    }

    order.driver = driver._id;
    order.status = 'out_for_delivery';
    await order.save();

    const io = req.app.get('io');
    io.to(`order_${order._id}`).emit('order_status_updated', { orderId: order._id, status: 'out_for_delivery' });
    io.to(`customer_${order.customer._id}`).emit('order_status_updated', { orderId: order._id, status: 'out_for_delivery' });

    if (order.customer.pushToken) {
      sendPushNotification(order.customer.pushToken, 'كافيه', STATUS_MESSAGES.out_for_delivery, {
        orderId: String(order._id),
      });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // Moving to out_for_delivery must go through /dispatch so a driver gets
    // assigned in the same step - never allow it via this generic endpoint.
    if (status === 'out_for_delivery') {
      return res.status(400).json({ message: 'استخدم تعيين دليفري عشان تنقل الطلب لمرحلة التوصيل' });
    }

    const order = await Order.findById(req.params.id).populate('customer', 'pushToken');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // branch_staff/driver can only update orders belonging to their own branch
    if (req.user.role !== 'admin' && String(req.user.branch) !== String(order.branch)) {
      return res.status(403).json({ message: 'You can only update orders for your own branch' });
    }

    // A driver may only mark THEIR OWN assigned delivery as delivered -
    // nothing else, and no other order.
    if (req.user.role === 'driver') {
      if (status !== 'delivered' || String(order.driver) !== String(req.user._id)) {
        return res.status(403).json({ message: 'مسموحلك بس تعلّم على تسليم الطلب المعين ليك' });
      }
    }

    order.status = status;
    if (status === 'confirmed' && !order.confirmedBy) {
      order.confirmedBy = req.user._id;
    }
    await order.save();

    const io = req.app.get('io');
    io.to(`order_${order._id}`).emit('order_status_updated', { orderId: order._id, status });
    io.to(`customer_${order.customer._id}`).emit('order_status_updated', { orderId: order._id, status });

    if (STATUS_MESSAGES[status] && order.customer.pushToken) {
      sendPushNotification(order.customer.pushToken, 'كافيه', STATUS_MESSAGES[status], {
        orderId: String(order._id),
      });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Customer can cancel their own order within a short window right after
// placing it, before the branch has started preparing it.
exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== String(req.user._id)) {
      return res.status(403).json({ message: 'This is not your order' });
    }
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ message: 'الطلب بدأ يتحضّر بالفعل، مش ممكن تلغيه دلوقتي' });
    }
    const elapsed = Date.now() - new Date(order.createdAt).getTime();
    if (elapsed > CANCEL_WINDOW_MS) {
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

// Customer rates a delivered order
exports.rateOrder = async (req, res) => {
  try {
    const { stars, comment } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== String(req.user._id)) {
      return res.status(403).json({ message: 'This is not your order' });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'تقدر تقيّم بس بعد ما الطلب يوصل' });
    }
    if (order.rating?.stars) {
      return res.status(400).json({ message: 'الطلب ده اتقيّم قبل كده' });
    }

    order.rating = { stars, comment, ratedAt: new Date() };
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Driver uploads a photo as proof of delivery (expects an already-hosted
// image URL - e.g. uploaded to Cloudinary/S3 from the app first)
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

// Driver's live location during an active delivery, broadcast to the
// customer's tracking screen AND the branch's cashier dashboard in real time.
exports.updateDriverLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Only the driver actually assigned to this delivery can push location
    // updates for it (admin bypass kept for support/testing purposes).
    if (req.user.role === 'driver' && String(order.driver) !== String(req.user._id)) {
      return res.status(403).json({ message: 'مسموحلك بس تحدّث موقع الطلب المعين ليك' });
    }

    order.driverLocation = { type: 'Point', coordinates: [lng, lat] };
    await order.save();

    const io = req.app.get('io');
    io.to(`order_${order._id}`).emit('driver_location_updated', {
      orderId: order._id,
      lat,
      lng,
    });
    // Also broadcast to the branch room so the cashier's dashboard can show
    // the driver moving live, without needing to join each order individually.
    io.to(`branch_${order.branch}`).emit('driver_location_updated', {
      orderId: order._id,
      lat,
      lng,
    });

    res.json({ message: 'Location updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: delete a single order (used for cleanup once it's completed).
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: wipe all orders for a branch on a given day (e.g. "clear today's
// orders" once the branch closes, so tomorrow's screen starts fresh).
exports.deleteBranchOrdersByDay = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { date } = req.query; // 'YYYY-MM-DD', defaults to today
    const day = date ? new Date(date) : new Date();
    const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const result = await Order.deleteMany({
      branch: branchId,
      createdAt: { $gte: startOfDay, $lt: endOfDay },
    });

    res.json({ message: 'Orders deleted', deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Paymob webhook callback (server-to-server) - verify HMAC in production
exports.paymobWebhook = async (req, res) => {
  try {
    const { obj } = req.body;
    if (!obj) return res.status(400).end();

    const merchantOrderId = obj.order?.merchant_order_id;
    const success = obj.success;

    if (merchantOrderId) {
      const order = await Order.findById(merchantOrderId);
      if (order) {
        order.paymentStatus = success ? 'paid' : 'failed';
        if (success) order.status = 'confirmed';
        await order.save();

        const io = req.app.get('io');
        io.to(`branch_${order.branch}`).emit('order_payment_updated', {
          orderId: order._id,
          paymentStatus: order.paymentStatus,
        });
      }
    }
    res.status(200).end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
