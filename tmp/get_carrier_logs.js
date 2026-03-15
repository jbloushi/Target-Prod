const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load env from backend
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const CarrierLogSchema = new mongoose.Schema({
    carrier: String,
    endpoint: String,
    requestPayload: Object,
    responsePayload: Object,
    statusCode: Number,
    success: Boolean,
    error: String,
    durationMs: Number,
    createdAt: { type: Date, default: Date.now }
});

const CarrierLog = mongoose.model('CarrierLog', CarrierLogSchema);

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tracker');
        console.log('Connected to MongoDB');

        const logs = await CarrierLog.find({ carrier: 'DGR', success: false })
            .sort({ createdAt: -1 })
            .limit(3);

        if (logs.length === 0) {
            console.log('No failed logs found.');
        } else {
            logs.forEach((log, i) => {
                console.log(`--- LOG ${i + 1} ---`);
                console.log(`Time: ${log.createdAt}`);
                console.log(`Endpoint: ${log.endpoint}`);
                console.log(`Status: ${log.statusCode}`);
                console.log(`Error: ${JSON.stringify(log.error, null, 2)}`);
                console.log(`Response: ${JSON.stringify(log.responsePayload, null, 2)}`);
                console.log('------------------');
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();
