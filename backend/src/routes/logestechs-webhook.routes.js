const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/logestechs-webhook.controller');

router.post('/lastmile', ctrl.lastmile);
router.post('/fulfillment', ctrl.fulfillment);

module.exports = router;
