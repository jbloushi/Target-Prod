const express = require('express');
const router = express.Router();
const pickupController = require('../controllers/pickup.controller');
const { protect } = require('../controllers/auth.controller');
const { authorize } = require('../middleware/authorize.middleware');

router.use(protect); // All routes require login

router.route('/')
    .post(pickupController.createRequest)
    .get(pickupController.getAllRequests);

router.route('/:id')
    .get(pickupController.getRequest)
    .patch(pickupController.updateRequest) // Client can edit draft
    .delete(pickupController.deleteRequest); // Client can delete draft

// Platform staff only routes
router.post('/:id/approve', authorize('APPROVE_SHIPMENTS'), pickupController.approveRequest);
router.post('/:id/reject', authorize('APPROVE_SHIPMENTS'), pickupController.rejectRequest);

module.exports = router;
