const mongoose = require('mongoose');
// const { connectDB } = require('../config/database');
const Shipment = require('../models/shipment.model');
const DgrAdapter = require('../adapters/DgrAdapter');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const run = async () => {
    try {
        console.log('Script starting...');
        // Force local connection for debug
        console.log('Connecting to Mongo...');
        try {
            await mongoose.connect('mongodb://127.0.0.1:27017/3pl-solutions', {
                serverSelectionTimeoutMS: 5000
            });
            console.log('DB Connected to 127.0.0.1:27017/3pl-solutions');
        } catch (dbErr) {
            console.error('DB Connection Failed:', dbErr);
            process.exit(1);
        }

        // Target from user logs
        const trackingNumber = 'DGR-H85NVYI7';
        console.log(`Searching for Shipment: ${trackingNumber}`);
        const shipment = await Shipment.findOne({ trackingNumber });

        if (!shipment) {
            console.error('Shipment not found!');
            // List some shipments to verify DB content
            const count = await Shipment.countDocuments();
            console.log(`Total Shipments in DB: ${count}`);
            if (count > 0) {
                const some = await Shipment.find().limit(3);
                console.log('Sample Tracking Numbers:', some.map(s => s.trackingNumber));
            }
            process.exit(1);
        }

        console.log('Found Shipment:', shipment.trackingNumber);

        // Data Normalization Check
        console.log('Shipment Data:', {
            currency: shipment.currency,
            declaredValue: shipment.declaredValue,
            items: shipment.items?.length
        });

        // Mock User context if needed, but Adapter mostly needs data
        // We'll call Adapter directly to see the raw error
        try {
            console.log('Attempting DGR Create...');
            const result = await DgrAdapter.createShipment(shipment);
            console.log('Success!', result);
        } catch (error) {
            console.error('CAUGHT ERROR:');
            console.error('Message:', error.message);
            if (error.response) {
                console.error('Response Status:', error.response.status);
                console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
            } else if (error.isProviderError) {
                console.error('Provider Error Details:', JSON.stringify(error.details, null, 2));
            } else {
                console.error(error);
            }
        }

        console.log('Done.');
        process.exit(0);

    } catch (e) {
        console.error('Script Error:', e);
        process.exit(1);
    }
};

run();
