const express = require('express');
const {
  listBranches,
  createBranch,
  resolveBranch,
  toggleBranchOpen,
  updateBranch,
} = require('../controllers/branchController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

router.get('/', listBranches);
router.get('/resolve', resolveBranch); // ?lat=..&lng=.. -> nearest branch
router.post('/', protect, restrictTo('admin'), createBranch);
router.put('/:id', protect, restrictTo('admin'), updateBranch);
router.patch('/:id/toggle-open', protect, restrictTo('admin'), toggleBranchOpen);

module.exports = router;
