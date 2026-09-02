const express = require('express');
const {
  createStaff,
  listStaff,
  updateStaff,
  resetStaffPassword,
  deleteStaff,
} = require('../controllers/staffController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Cashiers (branch_staff) can list drivers in their own branch (e.g. to
// assign a delivery) - listStaff itself scopes what they're allowed to see.
router.get('/', protect, restrictTo('branch_staff', 'admin'), listStaff);

router.use(protect, restrictTo('admin'));
router.post('/', createStaff);
router.put('/:id', updateStaff);
router.patch('/:id/password', resetStaffPassword);
router.delete('/:id', deleteStaff);

module.exports = router;
