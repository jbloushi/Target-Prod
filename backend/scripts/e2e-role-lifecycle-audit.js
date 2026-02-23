#!/usr/bin/env node
/*
 * End-to-end shipment audit across roles.
 * Requires backend server running on API_BASE_URL (default http://127.0.0.1:8899/api)
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:8899/api';
const PASSWORD = process.env.E2E_PASSWORD || 'password123';

const roleEmails = [
  'client@demo.com',
  'orgagent@demo.com',
  'orgmanager@demo.com',
  'staff@demo.com',
  'manager@demo.com',
  'accounting@demo.com',
  'admin@demo.com',
  'driver@demo.com'
];

const makePayload = (email, seed = Date.now()) => ({
  carrierCode: 'MANUAL',
  serviceCode: 'P',
  sender: {
    contactPerson: 'E2E Sender',
    email,
    phone: '+96590000001',
    formattedAddress: `Audit Sender Address ${seed}`,
    city: 'Kuwait City',
    postalCode: '11111',
    countryCode: 'KW',
    reference: `SREF-${seed}`
  },
  receiver: {
    contactPerson: 'E2E Receiver',
    email: 'receiver@example.com',
    phone: '+96590000002',
    formattedAddress: `Audit Receiver Address ${seed}`,
    city: 'Salmiya',
    postalCode: '22000',
    countryCode: 'KW',
    reference: `RREF-${seed}`
  },
  parcels: [{ weight: 1, dimensions: { length: 10, width: 10, height: 10 } }],
  items: [{ description: 'Audit Item', quantity: 1, declaredValue: 5, weight: 1, hsCode: '847130', countryOfOrigin: 'KW', currency: 'KWD' }],
  customer: { name: 'E2E Customer', email, phone: '+96590000001' },
  incoterm: 'DAP',
  exportReason: 'SALE_OF_GOODS'
});

async function login(email) {
  const res = await axios.post(`${API_BASE_URL}/auth/login`, { email, password: PASSWORD });
  return res.data.token;
}

function authed(token) {
  return axios.create({ baseURL: API_BASE_URL, headers: { Authorization: `Bearer ${token}` } });
}

async function createAs(email) {
  try {
    const api = authed(await login(email));
    const res = await api.post('/shipments', makePayload(email));
    return { email, ok: true, status: res.status, trackingNumber: res.data?.data?.trackingNumber };
  } catch (error) {
    return {
      email,
      ok: false,
      status: error.response?.status || 500,
      error: error.response?.data?.error || error.message
    };
  }
}

async function runLifecycle(trackingNumber) {
  const staffApi = authed(await login('staff@demo.com'));

  const pickup = await staffApi.post(`/shipments/${trackingNumber}/pickup`);
  const scan = await staffApi.post(`/shipments/${trackingNumber}/warehouse/scan`, {});
  const ofd = await staffApi.patch(`/shipments/${trackingNumber}/status`, { status: 'out_for_delivery' });
  const delivered = await staffApi.patch(`/shipments/${trackingNumber}/status`, { status: 'delivered' });
  const label = await staffApi.get(`/shipments/${trackingNumber}/label`);

  let bookingResult;
  try {
    const booking = await staffApi.post(`/shipments/${trackingNumber}/book`, { carrierCode: 'DGR' });
    bookingResult = { ok: true, status: booking.status };
  } catch (error) {
    bookingResult = {
      ok: false,
      status: error.response?.status || 500,
      error: error.response?.data?.error || error.message
    };
  }

  return {
    trackingNumber,
    statuses: {
      pickup: pickup.data?.data?.status,
      warehouseScan: scan.data?.data?.status,
      outForDelivery: ofd.data?.data?.status,
      delivered: delivered.data?.data?.status
    },
    labelGenerated: typeof label.data === 'string' && label.data.includes('TARGET LOGISTICS'),
    bookingResult
  };
}

async function main() {
  const createResults = [];
  for (const email of roleEmails) {
    createResults.push(await createAs(email));
  }

  const clientCreate = createResults.find((r) => r.email === 'client@demo.com' && r.ok);
  let lifecycle = null;

  if (clientCreate?.trackingNumber) {
    lifecycle = await runLifecycle(clientCreate.trackingNumber);
  }

  console.log(JSON.stringify({ apiBaseUrl: API_BASE_URL, createResults, lifecycle }, null, 2));
}

main().catch((error) => {
  console.error('E2E role lifecycle audit failed:', error.message);
  process.exit(1);
});
