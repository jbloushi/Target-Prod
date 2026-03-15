const mongoose = require('mongoose');
const fs = require('fs');

async function run() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/tracker-prod', { serverSelectionTimeoutMS: 2000 });
        const db = mongoose.connection.db;
        const shipments = db.collection('shipments');

        let shipment = await shipments.findOne({ "trackingNumber": "DGR-U1OWR76D" });
        if (!shipment) {
            shipment = await shipments.findOne({ "awb": "DGR-U1OWR76D" });
        }
        if (!shipment) {
            shipment = await shipments.findOne({ "carrierTrackingNumber": "DGR-U1OWR76D" });
        }

        if (shipment) {
            fs.writeFileSync('shipment_dump.json', JSON.stringify(shipment, null, 2));
            console.log('Shipment dumped to shipment_dump.json');
        } else {
            console.log('Shipment not found.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();
