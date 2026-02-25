
const axios = require('axios');
const BASE_URL = 'http://127.0.0.1:8899/api';

async function checkShipments() {
    try {
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'staff@demo.com',
            password: 'password123'
        });
        const token = loginRes.data.token;
        const authHeader = { Authorization: `Bearer ${token}` };

        console.log('📡 Fetching profile...');
        const profileRes = await axios.get(`${BASE_URL}/users/me`, { headers: authHeader });
        console.log('👤 Me:', profileRes.data.data.email, 'Org:', profileRes.data.data.organization?._id);

        console.log('📦 Fetching ALL shipments (no filters)...');
        const allShipmentsRes = await axios.get(`${BASE_URL}/shipments`, { headers: authHeader });
        console.log('✅ Status:', allShipmentsRes.status);
        console.log('📦 Total Shipments in DB:', allShipmentsRes.data.data.length);
        if (allShipmentsRes.data.data.length > 0) {
            console.log('🔍 Sample 1 Org:', allShipmentsRes.data.data[0].organization);
            console.log('🔍 Sample 1 Tracking:', allShipmentsRes.data.data[0].trackingNumber);
        }
    } catch (err) {
        console.error('❌ API Error:', err.response?.data || err.message);
    }
}

checkShipments();
