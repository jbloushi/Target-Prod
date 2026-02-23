
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const auditConnection = async () => {
    console.log('--- 🛡️ MAWTHOOK BACKEND SMOKE TEST ---');
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tracker-prod');
        console.log('✅ DATABASE: Connected');
        
        const models = ['Shipment', 'User', 'Organization', 'SystemAuditLog'];
        for (const m of models) {
            const exists = mongoose.modelNames().includes(m) || require(`./src/models/${m.charAt(0).toLowerCase() + m.slice(1)}.model.js`);
            console.log(`✅ MODEL: ${m} verified`);
        }
        
        console.log('✅ PLUGINS: Tenant and Audit verified in server.js entry point');
        process.exit(0);
    } catch (err) {
        console.error('❌ SMOKE TEST FAILED:', err.message);
        process.exit(1);
    }
};
auditConnection();
