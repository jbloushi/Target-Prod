const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/target-prod');
        const Shipment = require('./src/models/shipment.model');
        const CarrierLog = require('./src/models/CarrierLog');

        const ship = await Shipment.findOne({ trackingNumber: '7984932922' }).lean();
        if (!ship) {
            console.log("Shipment 7984932922 not found.");
            process.exit(0);
        }

        console.log("Shipment Found! ID:", ship._id);

        const logs = await CarrierLog.find({ referenceId: ship._id.toString() }).sort({ timestamp: -1 }).lean();
        if (logs.length === 0) {
            console.log("No CarrierLogs found for this shipment.");
        } else {
            console.log(`Found ${logs.length} CarrierLogs.`);
            const latestLog = logs[0];
            const lineItems = latestLog.requestPayload?.content?.exportDeclaration?.lineItems;
            if (lineItems) {
                console.log("Export Declaration Line Items Commodity Codes:");
                console.log(JSON.stringify(lineItems.map(li => li.commodityCodes), null, 2));
            } else {
                console.log("No line items found in the payload.");
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
