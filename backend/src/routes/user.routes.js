const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authController = require('../controllers/auth.controller');
const { authorize, authorizeAny } = require('../middleware/authorize.middleware');

// Protect all routes
router.use(authController.protect);

// Get users (platform staff can list clients/agents)
router.get('/', authorizeAny('VIEW_ALL_SHIPMENTS', 'MANAGE_ORG_USERS'), userController.getUsers);

// Get current user profile
router.get('/me', userController.getMe);
router.patch('/profile', userController.updateProfile);
router.get('/assignable-clients', authorize('CREATE_SHIPMENTS'), userController.getAssignableClients);

// Admin Only Routes
router.post('/', authorizeAny('MANAGE_USERS', 'MANAGE_ORG_USERS'), userController.createUser);
router.get('/:id/access-scopes', authorize('MANAGE_USERS'), userController.getAccessScopes);
router.put('/:id/access-scopes', authorize('MANAGE_USERS'), userController.replaceAccessScopes);
router.patch('/:id', authorizeAny('MANAGE_USERS', 'MANAGE_ORG_USERS'), userController.updateUser);
router.delete('/:id', authorizeAny('MANAGE_USERS', 'MANAGE_ORG_USERS'), userController.deleteUser);
router.patch('/:id/password', authorize('MANAGE_USERS'), authController.resetUserPassword);

// Password reset by admin or accounting — does not require full MANAGE_USERS
router.post('/:id/reset-password', authController.restrictTo('admin', 'accounting'), authController.resetUserPassword);

module.exports = router;
