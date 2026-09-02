const Branch = require('../models/Branch');
const { findNearestBranch } = require('../utils/geoUtils');

exports.listBranches = async (req, res) => {
  const branches = await Branch.find({ isActive: true });
  res.json(branches);
};

exports.createBranch = async (req, res) => {
  try {
    const { name, address, phone, lng, lat, deliveryRadiusMeters, deliveryFee } = req.body;
    const branch = await Branch.create({
      name,
      address,
      phone,
      location: { type: 'Point', coordinates: [lng, lat] },
      deliveryRadiusMeters,
      deliveryFee,
    });
    res.status(201).json(branch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin toggles a branch open/closed temporarily (holiday, too busy, etc.)
// without disabling it permanently like isActive does.
exports.toggleBranchOpen = async (req, res) => {
  try {
    const { isOpen } = req.body;
    const branch = await Branch.findByIdAndUpdate(req.params.id, { isOpen }, { new: true });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateBranch = async (req, res) => {
  try {
    const { name, address, phone, lng, lat, deliveryRadiusMeters, deliveryFee, openingHours } = req.body;
    const update = { name, address, phone, deliveryRadiusMeters, deliveryFee, openingHours };
    if (lng !== undefined && lat !== undefined) {
      update.location = { type: 'Point', coordinates: [lng, lat] };
    }
    const branch = await Branch.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    res.json(branch);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Given customer's lat/lng, return the branch that should handle the order
exports.resolveBranch = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng are required' });

    const result = await findNearestBranch(parseFloat(lng), parseFloat(lat));
    if (!result || !result.branch) {
      return res.status(404).json({
        message: 'No branch delivers to this location yet',
        outOfRange: true,
      });
    }
    res.json({ branch: result.branch, distanceMeters: Math.round(result.distanceMeters) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
