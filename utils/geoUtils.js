const Branch = require('../models/Branch');

/**
 * Finds the nearest active branch to a given [lng, lat] point,
 * limited to branches whose deliveryRadiusMeters covers the distance.
 */
async function findNearestBranch(lng, lat) {
  const branch = await Branch.findOne({
    isActive: true,
    isOpen: true,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
      },
    },
  });

  if (!branch) return null;

  const distanceMeters = haversineDistance(lat, lng, branch.location.coordinates[1], branch.location.coordinates[0]);

  if (distanceMeters > branch.deliveryRadiusMeters) {
    return { branch: null, outOfRange: true, nearestBranch: branch, distanceMeters };
  }

  return { branch, outOfRange: false, distanceMeters };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { findNearestBranch, haversineDistance };
