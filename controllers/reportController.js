const mongoose = require('mongoose');
const Order = require('../models/Order');

function parseRange(from, to, defaultDays) {
  const fromDate = from ? new Date(`${from}T00:00:00.000`) : new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000);
  const toDate = to ? new Date(`${to}T23:59:59.999`) : new Date();
  return { fromDate, toDate };
}

function buildMatch(req, defaultDays) {
  const { fromDate, toDate } = parseRange(req.query.from, req.query.to, defaultDays);
  const matchStage = {
    createdAt: { $gte: fromDate, $lte: toDate },
    status: { $ne: 'cancelled' },
  };
  if (req.query.branchId && mongoose.isValidObjectId(req.query.branchId)) {
    matchStage.branch = new mongoose.Types.ObjectId(req.query.branchId);
  }
  return { fromDate, toDate, matchStage };
}

exports.getSalesReport = async (req, res) => {
  try {
    const { fromDate, toDate, matchStage } = buildMatch(req, 7);

    const [summary] = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalOrders: { $sum: 1 }, avgOrderValue: { $avg: '$total' } } },
    ]);

    const byBranch = await Order.aggregate([
      { $match: matchStage },
      { $group: { _id: '$branch', revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
      { $unwind: '$branch' },
      { $project: { branchName: '$branch.name', revenue: { $round: ['$revenue', 2] }, orders: 1 } },
      { $sort: { revenue: -1 } },
    ]);

    const topProducts = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', quantitySold: { $sum: '$items.quantity' }, revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
      { $project: { quantitySold: 1, revenue: { $round: ['$revenue', 2] } } },
      { $sort: { quantitySold: -1, revenue: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      range: { from: fromDate, to: toDate },
      totalRevenue: Math.round((summary?.totalRevenue || 0) * 100) / 100,
      totalOrders: summary?.totalOrders || 0,
      avgOrderValue: Math.round((summary?.avgOrderValue || 0) * 100) / 100,
      byBranch,
      topProducts,
      mostOrderedProduct: topProducts[0] || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTopPerformers = async (req, res) => {
  try {
    const { fromDate, toDate, matchStage } = buildMatch(req, 30);

    const topCustomers = await Order.aggregate([
      { $match: { ...matchStage, status: 'delivered' } },
      { $group: { _id: '$customer', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
      { $sort: { orderCount: -1, totalSpent: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      { $project: { name: '$customer.name', phone: '$customer.phone', orderCount: 1, totalSpent: { $round: ['$totalSpent', 2] } } },
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
            $divide: [
              { $subtract: [{ $ifNull: ['$deliveredAt', '$updatedAt'] }, '$dispatchedAt'] },
              60000,
            ],
          },
        },
      },
      { $match: { deliveryMinutes: { $gte: 0 } } },
      { $group: { _id: '$driver', deliveryCount: { $sum: 1 }, avgDeliveryMinutes: { $avg: '$deliveryMinutes' }, fastestDeliveryMinutes: { $min: '$deliveryMinutes' } } },
      { $sort: { avgDeliveryMinutes: 1, deliveryCount: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'driver' } },
      { $unwind: '$driver' },
      { $project: { name: '$driver.name', phone: '$driver.phone', deliveryCount: 1, avgDeliveryMinutes: { $round: ['$avgDeliveryMinutes', 1] }, fastestDeliveryMinutes: { $round: ['$fastestDeliveryMinutes', 1] } } },
    ]);

    const topCashiers = await Order.aggregate([
      {
        $match: {
          ...matchStage,
          confirmedBy: { $ne: null },
          confirmedAt: { $ne: null },
        },
      },
      {
        $project: {
          cashier: '$confirmedBy',
          acceptMinutes: { $divide: [{ $subtract: ['$confirmedAt', { $ifNull: ['$availableToBranchAt', '$createdAt'] }] }, 60000] },
          preparationMinutes: {
            $cond: [
              { $and: [{ $ne: ['$preparingAt', null] }, { $ne: ['$dispatchedAt', null] }] },
              { $divide: [{ $subtract: ['$dispatchedAt', '$preparingAt'] }, 60000] },
              null,
            ],
          },
        },
      },
      { $match: { acceptMinutes: { $gte: 0 } } },
      {
        $group: {
          _id: '$cashier',
          acceptedOrders: { $sum: 1 },
          avgAcceptMinutes: { $avg: '$acceptMinutes' },
          avgPreparationMinutes: { $avg: '$preparationMinutes' },
          fastestAcceptMinutes: { $min: '$acceptMinutes' },
        },
      },
      { $sort: { avgAcceptMinutes: 1, acceptedOrders: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'cashier' } },
      { $unwind: '$cashier' },
      { $match: { 'cashier.role': 'branch_staff' } },
      {
        $project: {
          name: '$cashier.name',
          phone: '$cashier.phone',
          acceptedOrders: 1,
          avgAcceptMinutes: { $round: ['$avgAcceptMinutes', 1] },
          avgPreparationMinutes: {
            $cond: [{ $ne: ['$avgPreparationMinutes', null] }, { $round: ['$avgPreparationMinutes', 1] }, null],
          },
          fastestAcceptMinutes: { $round: ['$fastestAcceptMinutes', 1] },
        },
      },
    ]);

    res.json({
      range: { from: fromDate, to: toDate },
      topCustomers,
      topDrivers,
      topCashiers,
      fastestDriver: topDrivers[0] || null,
      fastestCashier: topCashiers[0] || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
