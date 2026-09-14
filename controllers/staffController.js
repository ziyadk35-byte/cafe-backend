const User = require('../models/User');

// Admin creates a staff/driver account directly - no OTP needed since the
// admin is vouching for this person and setting the password themselves.
exports.createStaff = async (req, res) => {
  try {
    const { name, phone, password, role, branch } = req.body;

    if (!['branch_staff', 'driver'].includes(role)) {
      return res.status(400).json({ message: 'Role must be branch_staff or driver' });
    }
    if (!branch) {
      return res.status(400).json({ message: 'Branch is required for staff accounts' });
    }

    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ message: 'Phone already registered' });

    const user = await User.create({
      name,
      phone,
      password,
      role,
      branch,
      phoneVerified: true, // admin-created accounts skip OTP verification
    });

    res.status(201).json({
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role, branch: user.branch },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.listStaff = async (req, res) => {
  const { branchId, role } = req.query;
  const filter = { role: { $in: ['branch_staff', 'driver'] } };

  if (req.user.role === 'branch_staff') {
    // Cashiers can only see the drivers in their own branch (e.g. to assign
    // a delivery) - never the full staff list across branches.
    filter.branch = req.user.branch;
    filter.role = 'driver';
  } else {
    if (branchId) filter.branch = branchId;
    if (role) filter.role = role;
  }

  const staff = await User.find(filter).populate('branch', 'name').select('-password');

  // For drivers, attach how many orders are currently assigned to / out with them, so
  // whoever is dispatching can pick someone who's actually free.
  const Order = require('../models/Order');
  const driverIds = staff.filter((s) => s.role === 'driver').map((s) => s._id);
  const counts = await Order.aggregate([
    { $match: { driver: { $in: driverIds }, status: { $in: ['assigned_to_driver', 'out_for_delivery'] } } },
    { $group: { _id: '$driver', count: { $sum: 1 } } },
  ]);
  const countMap = {};
  counts.forEach((c) => (countMap[String(c._id)] = c.count));

  const result = staff.map((s) => ({
    ...s.toObject(),
    activeOrderCount: s.role === 'driver' ? countMap[String(s._id)] || 0 : undefined,
  }));

  res.json(result);
};

exports.updateStaff = async (req, res) => {
  try {
    const { name, role, branch, isActive } = req.body;
    const update = {};
    if (name) update.name = name;
    if (role) update.role = role;
    if (branch) update.branch = branch;
    if (typeof isActive === 'boolean') update.isActive = isActive;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select(
      '-password'
    );
    if (!user) return res.status(404).json({ message: 'Staff member not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.resetStaffPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Staff member not found' });
    user.password = password; // re-hashed by pre-save hook
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteStaff = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'Staff member removed' });
};
