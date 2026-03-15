const mongoose = require('mongoose');

async function run() {
    try {
        await mongoose.connect('mongodb://localhost:27017/tracker');
        console.log('Connected to MongoDB');

        // We assume tracking number is stored as trackingNumber or orderNumber or similar
        const db = mongoose.connection.db;
        const shipments = db.collection('shipments');

        const shipment = await shipments.findOne({ "trackingNumber": "DGR-U1OWR76D" });
        if (shipment) {
            console.log("Shipment found:", JSON.stringify(shipment, null, 2));
        } else {
            console.log("Shipment not found by trackingNumber. Trying awb...");
            const shipmentAwb = await shipments.findOne({ "awb": "DGR-U1OWR76D" });
            if (shipmentAwb) {
                console.log("Shipment found by awb:", JSON.stringify(shipmentAwb, null, 2));
            } else {
                console.log("Trying carrierTrackingNumber...");
                const shipmentCarrier = await shipments.findOne({ "carrierTrackingNumber": "DGR-U1OWR76D" });
                if (shipmentCarrier) {
                    console.log("Shipment found by carrierTrackingNumber", JSON.stringify(shipmentCarrier, null, 2));
                } else {
                    console.log("Not found.");
                }
            }
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();
