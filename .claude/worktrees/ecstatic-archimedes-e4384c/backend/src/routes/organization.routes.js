const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organization.controller');
const authController = require('../controllers/auth.controller');
const { authorize } = require('../middleware/authorize.middleware');

// Protect all routes
router.use(authController.protect);

// List / view orgs (platform ops)
router.use(authorize('VIEW_ALL_SHIPMENTS'));

router
    .route('/')
    .get(organizationController.getAllOrganizations)
    .post(authorize('MANAGE_ORGS'), organizationController.createOrganization);

router
    .route('/:id')
    .get(organizationController.getOrganization)
    .patch(authorize('MANAGE_ORGS'), organizationController.updateOrganization);

// Member Management (admin only)
router.post('/:id/members', authorize('MANAGE_ORGS'), organizationController.addMember);
router.delete('/:id/members/:userId', authorize('MANAGE_ORGS'), organizationController.removeMember);

module.exports = router;
