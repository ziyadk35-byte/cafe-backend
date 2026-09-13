const Order = require('../models/Order');

// Returns revenue, order count, top products, and per-branch breakdown for
// a given date range (defaults to the last 7 days).
exports.getSalesReport = async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const matchStage = {
      createdAt: { $gte: fromDate, $lte: toDate },
      status: { $ne: 'cancelled' },
    };

    const [summary] = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
        },
      },
    ]);

    const byBranch = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$branch',
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
      { $unwind: '$branch' },
      { $project: { branchName: '$branch.name', revenue: 1, orders: 1 } },
      { $sort: { revenue: -1 } },
    ]);

    const topProducts = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      range: { from: fromDate, to: toDate },
      totalRevenue: summary?.totalRevenue || 0,
      totalOrders: summary?.totalOrders || 0,
      avgOrderValue: Math.round((summary?.avgOrderValue || 0) * 100) / 100,
      byBranch,
      topProducts,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Top customer (by order count), and top driver (by deliveries completed +
// their average delivery time from dispatch to delivered) - for the admin
// "who's our best customer / fastest driver" screen.
exports.getTopPerformers = async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const matchStage = { createdAt: { $gte: fromDate, $lte: toDate }, status: { $ne: 'cancelled' } };

    const topCustomers = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: '$customer', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
      { $sort: { orderCount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      {
        $project: {
          name: '$customer.name',
          phone: '$customer.phone',
          orderCount: 1,
          totalSpent: 1,
        },
      },
    ]);

    const topDrivers = await Order.aggregate([
      {
        $match: {
          ...matchStage,
          status: 'delivered',
          driver: { $ne: null },
          dispatchedAt: { $ne: null },
        },
      },
      {
        $project: {
          driver: 1,
          deliveryMinutes: {
            $divide: [{ $subtract: ['$updatedAt', '$dispatchedAt'] }, 60000],
          },
        },
      },
      {
        $group: {
          _id: '$driver',
          deliveryCount: { $sum: 1 },
          avgDeliveryMinutes: { $avg: '$deliveryMinutes' },
        },
      },
      { $sort: { deliveryCount: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'driver' } },
      { $unwind: '$driver' },
      {
        $project: {
          name: '$driver.name',
          phone: '$driver.phone',
          deliveryCount: 1,
          avgDeliveryMinutes: { $round: ['$avgDeliveryMinutes', 0] },
        },
      },
    ]);

    res.json({ range: { from: fromDate, to: toDate }, topCustomers, topDrivers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
