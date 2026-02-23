const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authController = require('../controllers/auth.controller');
const { authorize } = require('../middleware/authorize.middleware');

// Protect all routes
router.use(authController.protect);

// Get users (platform staff can list clients/agents)
router.get('/', authorize('VIEW_ALL_SHIPMENTS'), userController.getUsers);

// Get current user profile
router.get('/me', userController.getMe);
router.patch('/profile', userController.updateProfile);

// Admin Only Routes
router.patch('/:id', authorize('MANAGE_USERS'), userController.updateUser);
router.delete('/:id', authorize('MANAGE_USERS'), userController.deleteUser);
router.patch('/:id/password', authorize('MANAGE_USERS'), authController.resetUserPassword);

module.exports = router;
