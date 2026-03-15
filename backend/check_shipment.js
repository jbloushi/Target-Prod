const mongoose = require('mongoose');
const Shipment = require('./src/models/shipment.model');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/target-prod');
    // Find a shipment created recently (e.g. tracking number from invoice or latest)
    // Awb from screenshot is: 7984932922
    const ship = await Shipment.findOne({ trackingNumber: '7984932922' }).sort({ createdAt: -1 });
    if (!ship) {
        console.log("Shipment not found.");
        return process.exit(0);
    }
    console.log("Shipment Tracking Number:", ship.trackingNumber);
    console.log("Currency:", ship.currency);
    console.log("Items Currency:", ship.items[0].currency);
    console.log("First Booking Attempt Error:", ship.bookingAttempts[0]?.error);

    // Check carrier log
    const CarrierLog = require('./src/models/CarrierLog');
    const log = await CarrierLog.findOne({ referenceId: ship._id.toString() }).sort({ timestamp: -1 });
    if (log && log.requestPayload) {
        console.log("Payload commodityCodes:");
        console.log(JSON.stringify(log.requestPayload.content.exportDeclaration.lineItems[0].commodityCodes, null, 2));
    }

    process.exit(0);
}
run();
