import axios from 'axios';
import { getApiBaseUrl, isDevelopmentMode, isProductionMode } from '../utils/env';

// Use environment variable if available, otherwise use a relative URL that works in both development and production
const normalizeApiUrl = (raw) => {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';

  if (!trimmed || trimmed === '/' || trimmed === './') return '/api';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '');
  }

  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalized.replace(/\/+$/, '');
};

const API_URL = normalizeApiUrl(getApiBaseUrl());

// Derived from API_URL, removing the /api suffix if it exists
export const BACKEND_URL = API_URL.endsWith('/api')
  ? API_URL.slice(0, -4)
  : API_URL;

export { API_URL };

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to add auth token and idempotency key
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const method = String(config.method || '').toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      if (!config.headers['Idempotency-Key'] && !config.headers['idempotency-key']) {
        config.headers['Idempotency-Key'] = `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      }
    }
    return config;
  },
  error => Promise.reject(error)
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  response => {
    // Guardrail: API endpoints should not return HTML documents.
    const contentType = String(response?.headers?.['content-type'] || '').toLowerCase();
    if (contentType.includes('text/html')) {
      const requestUrl = `${response?.config?.baseURL || ''}${response?.config?.url || ''}`;
      const routingError = new Error(`API returned HTML instead of JSON for ${requestUrl}. Check VITE_API_URL and reverse-proxy /api routing.`);
      routingError.code = 'API_HTML_RESPONSE';
      throw routingError;
    }

    return response;
  },
  error => {
    // For errors, add more context
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error Response:', JSON.stringify(error.response.data, null, 2));
      console.error('Request Config:', JSON.stringify({
        url: error.response.config.url,
        method: error.response.config.method,
        baseURL: error.response.config.baseURL,
        headers: error.response.config.headers
      }, null, 2));

      const errorData = error.response.data;

      // Extract the most useful error message
      if (errorData.details && isDevelopmentMode()) {
        // Use detailed error in development
        error.message = typeof errorData.details === 'object' ? JSON.stringify(errorData.details) : errorData.details;
      } else if (errorData.error) {
        error.message = typeof errorData.error === 'object' ? (errorData.error.message || JSON.stringify(errorData.error)) : errorData.error;
      } else if (errorData.message) {
        error.message = errorData.message;
      } else if (typeof errorData === 'string') {
        error.message = errorData;
      } else {
        error.message = `Server error (${error.response.status})`;
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API No Response:', error.request);
      error.message = 'No response from server. Please check your connection.';
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('API Request Error:', error.message);
      if (!error.message) {
        error.message = 'Request failed. Please try again.';
      }
    }
    return Promise.reject(error);
  }
);

export const shipmentService = {
  // Get all shipments
  getAllShipments: async (filters = {}) => {
    try {
      const response = await api.get('shipments', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching shipments:', error);
      throw error;
    }
  },

  // Get shipment stats
  getShipmentStats: async (filters = {}) => {
    try {
      const response = await api.get('shipments/stats', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching shipment stats:', error);
      throw error;
    }
  },

  // Get shipment by tracking number
  getShipment: async (trackingNumber) => {
    try {
      const response = await api.get(`shipments/${trackingNumber}`);

      // Check if the response has the expected format
      if (!response.data) {
        throw new Error('Invalid response from server');
      }

      // If the response has a data property, return that, otherwise return the whole response
      return response.data.data ? response.data : response.data;
    } catch (error) {
      console.error(`Error fetching shipment ${trackingNumber}:`, error);

      // Enhance error message
      if (error.response && error.response.status === 404) {
        error.message = `Shipment with tracking number ${trackingNumber} not found`;
      } else if (!error.message) {
        error.message = `Failed to fetch shipment details for ${trackingNumber}`;
      }

      throw error;
    }
  },

  getAvailableCarriers: async (userId, options = {}) => {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      if (options.scope) params.set('scope', options.scope);
      const query = params.toString();
      const response = await api.get(`shipments/carriers${query ? `?${query}` : ''}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching carriers:', error);
      throw error;
    }
  },

  // Get Rate Quotes
  getQuotes: async (quoteData) => {
    try {
      const response = await api.post('shipments/quote', quoteData);
      return response.data;
    } catch (error) {
      console.error('Error fetching quotes:', error);
      throw error;
    }
  },

  // Get package templates
  getPackageTemplates: async () => {
    try {
      const response = await api.get('shipments/package-templates');
      return response.data;
    } catch (error) {
      console.error('Error fetching package templates:', error);
      throw error;
    }
  },

  // Save custom package template
  savePackageTemplate: async (templateData) => {
    try {
      const response = await api.post('shipments/package-templates', templateData);
      return response.data;
    } catch (error) {
      console.error('Error saving package template:', error);
      throw error;
    }
  },

  // Create new shipment
  createShipment: async (shipmentData) => {
    try {
      const response = await api.post('shipments', shipmentData);

      // Check if the response has the expected format
      if (!response.data) {
        throw new Error('Invalid response from server');
      }

      return response.data;
    } catch (error) {
      console.error('Error creating shipment:', error);

      // Enhance error message
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        // If the server returned validation errors, format them nicely
        if (errorData.errors && Array.isArray(errorData.errors)) {
          const errorMessages = errorData.errors.map(err => err.msg || err.message).join(', ');
          error.message = `Validation error: ${errorMessages}`;
        } else if (errorData.error) {
          error.message = errorData.error;
        } else if (errorData.message) {
          error.message = errorData.message;
        }
      } else if (!error.message) {
        error.message = 'Failed to create shipment. Please try again later.';
      }

      throw error;
    }
  },

  // Bulk Import Shipments (CSV / Excel)
  bulkImport: async (payload) => {
    try {
      const response = await api.post('shipments/bulk-import', payload);
      return response.data;
    } catch (error) {
      console.error('Error bulk importing shipments:', error);
      throw error;
    }
  },

  // Delete shipment
  deleteShipment: async (trackingNumber) => {
    try {
      const response = await api.delete(`shipments/${trackingNumber}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Update shipment details (General)
  updateShipmentDetails: async (trackingNumber, updates) => {
    try {
      const response = await api.patch(`shipments/${trackingNumber}`, updates);
      return response.data;
    } catch (error) {
      console.error(`Error updating shipment details ${trackingNumber}:`, error);
      throw error;
    }
  },

  updateShipment: async (trackingNumber, updates) => {
    try {
      const response = await api.patch(`shipments/${trackingNumber}`, updates);
      return response.data;
    } catch (error) {
      console.error(`Error updating shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Update shipment location

  // Update shipment location
  updateLocation: async (trackingNumber, locationData) => {
    try {
      const response = await api.patch(`shipments/${trackingNumber}/location`, locationData);
      return response.data;
    } catch (error) {
      console.error(`Error updating location for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Update shipment status
  updateStatus: async (trackingNumber, statusData) => {
    try {
      const response = await api.patch(`shipments/${trackingNumber}/status`, statusData);
      return response.data;
    } catch (error) {
      console.error(`Error updating status for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Driver: Scan to Pickup
  driverPickupScan: async (trackingNumber) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/pickup`);
      return response.data;
    } catch (error) {
      console.error(`Error processing driver pickup for ${trackingNumber}:`, error);
      // Return error object instead of throwing if we want to handle it gracefully in UI without try/catch there?
      // But existing pattern throws, so let's stick to consistent error handling or return data.
      // The UI (DriverScannerPage) uses try/catch blocks.
      throw error;
    }
  },

  // Warehouse: Scan Inbound (Handover)
  warehouseScan: async (trackingNumber, payload = {}) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/warehouse/scan`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error processing warehouse scan for ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Send Pay-by-Link via WhatsApp (Chatwoot)
  sendPaymentLink: async (trackingNumber, payload = {}) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/send-payment-link`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error sending payment link for ${trackingNumber}:`, error);
      throw error;
    }
  },

  getBookingOptions: async (trackingNumber, carrierCode = 'DGR') => {
    try {
      const response = await api.get(`shipments/${trackingNumber}/booking-options`, { params: { carrierCode } });
      return response.data;
    } catch (error) {
      console.error(`Error fetching booking options for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  getInternalShipmentConversionTargets: async (trackingNumber) => {
    try {
      const response = await api.get(`shipments/${trackingNumber}/conversion-targets`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching conversion targets for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Submit to Carrier (Generic Carrier Booking)
  bookShipment: async (trackingNumber, carrierCode = 'DGR', optionalServiceCodes = [], isAsync = false) => {
    try {
      console.log('--- FRONTEND BOOKING REQUEST ---', { trackingNumber, carrierCode, optionalServiceCodes, isAsync });
      const response = await api.post(`shipments/${trackingNumber}/book?async=${isAsync}`, {
        carrierCode,
        optionalServiceCodes,
        async: isAsync
      });
      return response.data;
    } catch (error) {
      console.error(`Error submitting shipment ${trackingNumber} to ${carrierCode}:`, error);
      throw error;
    }
  },

  // Generate or re-fetch Carrier AWB and Invoice from carrier
  generateCarrierDocuments: async (trackingNumber) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/carrier-documents/generate`);
      return response.data;
    } catch (error) {
      console.error(`Error generating carrier documents for ${trackingNumber}:`, error);
      throw error;
    }
  },

  convertInternalShipment: async (trackingNumber, payload) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/convert-carrier`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error converting internal shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Get shipment ETA
  getETA: async (trackingNumber) => {
    try {
      const response = await api.get(`shipments/${trackingNumber}/eta`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ETA for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Get shipment history
  getHistory: async (trackingNumber) => {
    try {
      const response = await api.get(`/shipments/${trackingNumber}/history`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching history for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Get shipment route distance
  getRouteDistance: async (trackingNumber) => {
    try {
      const response = await api.get(`/shipments/${trackingNumber}/distance`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching route distance for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Update shipment location manually
  updateLocationManually: async (trackingNumber, locationData) => {
    try {
      const response = await api.patch(`/shipments/${trackingNumber}/location/manual`, locationData);
      return response.data;
    } catch (error) {
      console.error(`Error updating location manually for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Add a checkpoint to a shipment
  addCheckpoint: async (trackingNumber, checkpointData) => {
    try {
      const response = await api.post(`/shipments/${trackingNumber}/checkpoints`, checkpointData);
      return response.data;
    } catch (error) {
      console.error(`Error adding checkpoint to shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Update a checkpoint
  updateCheckpoint: async (trackingNumber, checkpointId, checkpointData) => {
    try {
      const response = await api.patch(`/shipments/${trackingNumber}/checkpoints/${checkpointId}`, checkpointData);
      return response.data;
    } catch (error) {
      console.error(`Error updating checkpoint ${checkpointId} for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Delete a checkpoint
  deleteCheckpoint: async (trackingNumber, checkpointId) => {
    try {
      const response = await api.delete(`/shipments/${trackingNumber}/checkpoints/${checkpointId}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting checkpoint ${checkpointId} for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Update public tracking settings
  updatePublicSettings: async (trackingNumber, settings) => {
    try {
      const response = await api.patch(`/shipments/${trackingNumber}/public-settings`, settings);
      return response.data;
    } catch (error) {
      console.error(`Error updating public settings for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Pickup Requests (Operations Smoothing Phase 1)
  createPickupRequest: async (pickupData) => {
    try {
      const response = await api.post('/pickups', pickupData);
      return response.data;
    } catch (error) {
      console.error('Error creating pickup request:', error);
      throw error;
    }
  },

  getAllPickupRequests: async () => {
    try {
      const response = await api.get('/pickups');
      return response.data;
    } catch (error) {
      console.error('Error fetching pickup requests:', error);
      throw error;
    }
  },

  getPickupRequest: async (id) => {
    try {
      const response = await api.get(`/pickups/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching pickup request ${id}:`, error);
      throw error;
    }
  },

  updatePickupRequest: async (id, data) => {
    try {
      const response = await api.patch(`/pickups/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating pickup request ${id}:`, error);
      throw error;
    }
  },

  approvePickupRequest: async (id) => {
    try {
      const response = await api.post(`/pickups/${id}/approve`);
      return response.data;
    } catch (error) {
      console.error(`Error approving pickup request ${id}:`, error);
      // Pass through specific error messages
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  },

  rejectPickupRequest: async (id, reason) => {
    try {
      const response = await api.post(`/pickups/${id}/reject`, { reason });
      return response.data;
    } catch (error) {
      console.error(`Error rejecting pickup request ${id}:`, error);
      throw error;
    }
  },

  deletePickupRequest: async (id) => {
    try {
      const response = await api.delete(`/pickups/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting pickup request ${id}:`, error);
      throw error;
    }
  },

  // Generate Carrier Dispatch & Handover Manifest
  generateCarrierManifest: async (payload = {}) => {
    try {
      const response = await api.post('shipments/manifest', payload);
      return response.data;
    } catch (error) {
      console.error('Error generating carrier manifest:', error);
      throw error;
    }
  },

  // Confirm Delivery with Proof of Delivery (POD)
  confirmDeliveryWithPod: async (trackingNumber, payload = {}) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/deliver`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error confirming delivery for ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Check Return Eligibility (Public)
  checkReturnEligibility: async (trackingNumber) => {
    try {
      const response = await api.get(`shipments/public/${trackingNumber}/return-eligibility`);
      return response.data;
    } catch (error) {
      console.error(`Error checking return eligibility for ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Create Self-Service Return (Public)
  createPublicReturn: async (trackingNumber, payload = {}) => {
    try {
      const response = await api.post(`shipments/public/${trackingNumber}/create-return`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error creating return for ${trackingNumber}:`, error);
      throw error;
    }
  },

  // Trigger Carrier Tracking Cron Sync (Admin/Staff)
  triggerCarrierSync: async (payload = {}) => {
    try {
      const response = await api.post('shipments/cron/sync-carriers', payload);
      return response.data;
    } catch (error) {
      console.error('Error triggering carrier sync:', error);
      throw error;
    }
  },

  // Seed database with sample data (development only)
  seedDatabase: async (req, res) => {
    if (isProductionMode()) {
      return res.status(403).json({ success: false, error: 'Seeding disabled in production' });
    }
    try {
      const response = await api.post('/shipments/seed');
      return response.data;
    } catch (error) {
      console.error('Error seeding database:', error);
      throw error;
    }
  },

  // Seed database with Indian shipment data
  seedIndianData: async (count = 15) => {
    if (isProductionMode()) {
      throw new Error('Seeding disabled in production');
    }
    try {
      const response = await api.post(`/shipments/seed/india?count=${count}`);
      return response.data;
    } catch (error) {
      console.error('Error seeding Indian data:', error);
      throw error;
    }
  }
};

export const integrationService = {
  previewChatwootShipmentMessage: async ({ trackingNumber, eventType = 'shipment_created', recipientRole }) => {
    try {
      const response = await api.get(`integrations/chatwoot/shipments/${trackingNumber}/preview`, {
        params: {
          eventType,
          recipientRole
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error previewing Chatwoot shipment message:', error);
      throw error;
    }
  },

  sendChatwootTestMessage: async ({ trackingNumber, eventType = 'shipment_created', recipientRole, force = true }) => {
    try {
      const response = await api.post('integrations/chatwoot/test-message', {
        trackingNumber,
        eventType,
        recipientRole,
        force
      });
      return response.data;
    } catch (error) {
      console.error('Error sending Chatwoot test message:', error);
      throw error;
    }
  }
};

export const financeService = {
  getBalance: async () => {
    try {
      const response = await api.get('finance/balance');
      return response.data;
    } catch (error) {
      console.error('Error fetching balance:', error);
      throw error;
    }
  },

  getLedger: async (params = {}) => {
    try {
      const response = await api.get('finance/ledger', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching ledger:', error);
      throw error;
    }
  },

  getOrganizationOverview: async (orgId) => {
    try {
      const response = await api.get(`finance/organizations/${orgId}/overview`);
      return response.data;
    } catch (error) {
      console.error('Error fetching organization overview:', error);
      throw error;
    }
  },

  getOrganizationBalance: async (orgId) => {
    try {
      const response = await api.get(`finance/organizations/${orgId}/overview`);
      return response.data;
    } catch (error) {
      console.error('Error fetching organization balance:', error);
      throw error;
    }
  },

  listPayments: async (orgId) => {
    try {
      const response = await api.get(`finance/organizations/${orgId}/payments`);
      return response.data;
    } catch (error) {
      console.error('Error fetching payments:', error);
      throw error;
    }
  },

  listInvoices: async (orgId, params = {}) => {
    try {
      const response = await api.get(`finance/organizations/${orgId}/invoices`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw error;
    }
  },

  createInvoice: async (orgId, payload) => {
    try {
      const response = await api.post(`finance/organizations/${orgId}/invoices`, payload);
      return response.data;
    } catch (error) {
      console.error('Error creating invoice:', error);
      throw error;
    }
  },

  updateInvoiceStatus: async (invoiceId, status) => {
    try {
      const response = await api.patch(`finance/invoices/${invoiceId}/status`, { status });
      return response.data;
    } catch (error) {
      console.error('Error updating invoice status:', error);
      throw error;
    }
  },

  getInvoice: async (invoiceId) => {
    try {
      const response = await api.get(`finance/invoices/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching invoice:', error);
      throw error;
    }
  },

  sendInvoiceWhatsApp: async (invoiceId) => {
    try {
      const response = await api.post(`finance/invoices/${invoiceId}/send-whatsapp`);
      return response.data;
    } catch (error) {
      console.error('Error sending invoice WhatsApp:', error);
      throw error;
    }
  },

  postPayment: async (orgId, payload) => {
    try {
      const response = await api.post(`finance/organizations/${orgId}/payments`, payload);
      return response.data;
    } catch (error) {
      console.error('Error posting payment:', error);
      throw error;
    }
  },

  allocatePaymentManual: async (orgId, payload) => {
    try {
      const response = await api.post(`finance/organizations/${orgId}/allocations`, payload);
      return response.data;
    } catch (error) {
      console.error('Error allocating payment:', error);
      throw error;
    }
  },

  allocatePaymentsFifo: async (orgId) => {
    try {
      const response = await api.post(`finance/organizations/${orgId}/allocations/fifo`);
      return response.data;
    } catch (error) {
      console.error('Error allocating FIFO payments:', error);
      throw error;
    }
  },

  getShipmentAccounting: async (shipmentId) => {
    try {
      const response = await api.get(`finance/shipments/${shipmentId}/accounting`);
      return response.data;
    } catch (error) {
      console.error('Error fetching shipment accounting:', error);
      throw error;
    }
  },

  reverseAllocation: async (allocationId, payload) => {
    try {
      const response = await api.post(`finance/allocations/${allocationId}/reverse`, payload);
      return response.data;
    } catch (error) {
      console.error('Error reversing allocation:', error);
      throw error;
    }
  },

  getProfitabilityReport: async (params = {}) => {
    try {
      const response = await api.get('finance/reports/profitability', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching profitability report:', error);
      throw error;
    }
  },

  getDriverCodSummary: async (params = {}) => {
    try {
      const response = await api.get('finance/cod/driver-summary', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching driver COD summary:', error);
      throw error;
    }
  },

  remitDriverCod: async (payload) => {
    try {
      const response = await api.post('finance/cod/remit', payload);
      return response.data;
    } catch (error) {
      console.error('Error remitting driver COD:', error);
      throw error;
    }
  },

  requestDriverCodRemittance: async (payload) => {
    try {
      const response = await api.post('finance/cod/request-remittance', payload);
      return response.data;
    } catch (error) {
      console.error('Error requesting driver COD remittance:', error);
      throw error;
    }
  },

  confirmDriverCodRemittance: async (payload) => {
    try {
      const response = await api.post('finance/cod/confirm-remittance', payload);
      return response.data;
    } catch (error) {
      console.error('Error confirming driver COD remittance:', error);
      throw error;
    }
  },

  reconcileCarrierInvoice: async (payload) => {
    try {
      const response = await api.post('finance/reconciliation/carrier-invoice', payload);
      return response.data;
    } catch (error) {
      console.error('Error reconciling carrier invoice:', error);
      throw error;
    }
  },

  postCarrierReconciliationAdjustments: async (payload) => {
    try {
      const response = await api.post('finance/reconciliation/adjustments', payload);
      return response.data;
    } catch (error) {
      console.error('Error posting carrier reconciliation adjustments:', error);
      throw error;
    }
  },

  getOrganizationStatement: async (orgId, params = {}) => {
    try {
      const response = await api.get(`finance/organizations/${orgId}/statement`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching organization statement:', error);
      throw error;
    }
  },

  sendStatementNotification: async (orgId, data = {}) => {
    try {
      const response = await api.post(`finance/organizations/${orgId}/send-statement`, data);
      return response.data;
    } catch (error) {
      console.error('Error sending statement notification:', error);
      throw error;
    }
  },

  getExchangeRates: async () => {
    try {
      const response = await api.get('finance/rates');
      return response.data;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      throw error;
    }
  },

  updateExchangeRates: async (rates) => {
    try {
      const response = await api.put('finance/rates', { rates });
      return response.data;
    } catch (error) {
      console.error('Error updating exchange rates:', error);
      throw error;
    }
  },

  // --- Native Double-Entry General Ledger & Reports ---
  getTrialBalance: async (params = {}) => {
    try {
      const response = await api.get('finance/reports/trial-balance', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching trial balance:', error);
      throw error;
    }
  },

  getBalanceSheet: async (params = {}) => {
    try {
      const response = await api.get('finance/reports/balance-sheet', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching balance sheet:', error);
      throw error;
    }
  },

  getIncomeStatement: async (params = {}) => {
    try {
      const response = await api.get('finance/reports/income-statement', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching income statement:', error);
      throw error;
    }
  },

  listAccounts: async (params = {}) => {
    try {
      const response = await api.get('finance/gl/accounts', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching GL accounts:', error);
      throw error;
    }
  },

  createAccount: async (data) => {
    try {
      const response = await api.post('finance/gl/accounts', data);
      return response.data;
    } catch (error) {
      console.error('Error creating GL account:', error);
      throw error;
    }
  },

  listJournalEntries: async (params = {}) => {
    try {
      const response = await api.get('finance/gl/journal-entries', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      throw error;
    }
  },

  createJournalEntry: async (data) => {
    try {
      const response = await api.post('finance/gl/journal-entries', data);
      return response.data;
    } catch (error) {
      console.error('Error creating journal entry:', error);
      throw error;
    }
  },

  reverseJournalEntry: async (id, data) => {
    try {
      const response = await api.post(`finance/gl/journal-entries/${id}/reverse`, data);
      return response.data;
    } catch (error) {
      console.error('Error reversing journal entry:', error);
      throw error;
    }
  },

  getAccountLedger: async (params = {}) => {
    try {
      const response = await api.get('finance/gl/account-ledger', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching account ledger:', error);
      throw error;
    }
  },

  // --- Accounts Payable (AP) ---
  listVendors: async (params = {}) => {
    try {
      const response = await api.get('finance/ap/vendors', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching vendors:', error);
      throw error;
    }
  },

  createVendor: async (data) => {
    try {
      const response = await api.post('finance/ap/vendors', data);
      return response.data;
    } catch (error) {
      console.error('Error creating vendor:', error);
      throw error;
    }
  },

  listBills: async (params = {}) => {
    try {
      const response = await api.get('finance/ap/bills', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching bills:', error);
      throw error;
    }
  },

  createBill: async (data) => {
    try {
      const response = await api.post('finance/ap/bills', data);
      return response.data;
    } catch (error) {
      console.error('Error creating bill:', error);
      throw error;
    }
  },

  payBill: async (id, data) => {
    try {
      const response = await api.post(`finance/ap/bills/${id}/pay`, data);
      return response.data;
    } catch (error) {
      console.error('Error paying bill:', error);
      throw error;
    }
  },

  reconcileCarrierBill: async (data) => {
    try {
      const response = await api.post('finance/ap/reconcile', data);
      return response.data;
    } catch (error) {
      console.error('Error reconciling carrier bill:', error);
      throw error;
    }
  },

  // --- Treasury & Banking ---
  listBankAccounts: async (params = {}) => {
    try {
      const response = await api.get('finance/treasury/accounts', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching bank accounts:', error);
      throw error;
    }
  },

  createBankAccount: async (data) => {
    try {
      const response = await api.post('finance/treasury/accounts', data);
      return response.data;
    } catch (error) {
      console.error('Error creating bank account:', error);
      throw error;
    }
  },

  getBankTransactions: async (params = {}) => {
    try {
      const response = await api.get('finance/treasury/transactions', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching bank transactions:', error);
      throw error;
    }
  },

  importBankStatement: async (data) => {
    try {
      const response = await api.post('finance/treasury/import-statement', data);
      return response.data;
    } catch (error) {
      console.error('Error importing bank statement:', error);
      throw error;
    }
  },

  reconcileBankTransaction: async (data) => {
    try {
      const response = await api.post('finance/treasury/reconcile-transaction', data);
      return response.data;
    } catch (error) {
      console.error('Error reconciling bank transaction:', error);
      throw error;
    }
  },

  getTreasurySummary: async () => {
    try {
      const response = await api.get('finance/treasury/summary');
      return response.data;
    } catch (error) {
      console.error('Error fetching treasury summary:', error);
      throw error;
    }
  },

  // --- Accounting Periods ---
  listAccountingPeriods: async () => {
    try {
      const response = await api.get('finance/periods');
      return response.data;
    } catch (error) {
      console.error('Error fetching accounting periods:', error);
      throw error;
    }
  },

  closeAccountingPeriod: async (id) => {
    try {
      const response = await api.post(`finance/periods/${id}/close`);
      return response.data;
    } catch (error) {
      console.error('Error closing accounting period:', error);
      throw error;
    }
  },

  reopenAccountingPeriod: async (id) => {
    try {
      const response = await api.post(`finance/periods/${id}/reopen`);
      return response.data;
    } catch (error) {
      console.error('Error reopening accounting period:', error);
      throw error;
    }
  }
};

export const userService = {
  getUsers: async (roleFilter = '') => {
    try {
      const response = await api.get(`users${roleFilter ? `?role=${roleFilter}` : ''}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  getClients: async () => {
    try {
      const response = await api.get('auth/clients');
      return response.data;
    } catch (error) {
      console.error('Error fetching clients:', error);
      throw error;
    }
  },

  getAssignableClients: async () => {
    try {
      const response = await api.get('users/assignable-clients');
      return response.data;
    } catch (error) {
      console.error('Error fetching assignable clients:', error);
      throw error;
    }
  },

  createUser: async (userData) => {
    try {
      const response = await api.post('users', userData);
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  updateUser: async (id, userData) => {
    try {
      const response = await api.patch(`users/${id}`, userData);
      return response.data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  getAccessScopes: async (id) => {
    try {
      const response = await api.get(`users/${id}/access-scopes`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user access scopes:', error);
      throw error;
    }
  },

  replaceAccessScopes: async (id, scopes) => {
    try {
      const response = await api.put(`users/${id}/access-scopes`, { scopes });
      return response.data;
    } catch (error) {
      console.error('Error updating user access scopes:', error);
      throw error;
    }
  },

  deleteUser: async (id) => {
    try {
      const response = await api.delete(`users/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  resetUserPassword: async (id, newPassword) => {
    try {
      const response = await api.post(`users/${id}/reset-password`, { password: newPassword });
      return response.data;
    } catch (error) {
      console.error('Error resetting user password:', error);
      throw error;
    }
  },

  getMe: async () => {
    try {
      const response = await api.get('users/me');
      return response.data;
    } catch (error) {
      console.error('Error fetching current user profile:', error);
      throw error;
    }
  },

  updateProfile: async (profileData) => {
    try {
      const response = await api.patch('users/profile', profileData);
      return response.data;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  },
};

export const organizationService = {
  getOrganizations: async () => {
    try {
      const response = await api.get('organizations');
      return response.data;
    } catch (error) {
      console.error('Error fetching organizations:', error);
      throw error;
    }
  },

  getOrganization: async (id) => {
    try {
      const response = await api.get(`organizations/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching organization ${id}:`, error);
      throw error;
    }
  },

  createOrganization: async (data) => {
    try {
      const response = await api.post('organizations', data);
      return response.data;
    } catch (error) {
      console.error('Error creating organization:', error);
      throw error;
    }
  },

  updateOrganization: async (id, data) => {
    try {
      const response = await api.patch(`organizations/${id}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating organization ${id}:`, error);
      throw error;
    }
  },

  addMember: async (id, userId) => {
    try {
      const response = await api.post(`organizations/${id}/members`, { userId });
      return response.data;
    } catch (error) {
      console.error(`Error adding member to organization ${id}:`, error);
      throw error;
    }
  },

  removeMember: async (id, userId) => {
    try {
      const response = await api.delete(`organizations/${id}/members/${userId}`);
      return response.data;
    } catch (error) {
      console.error(`Error removing member from organization ${id}:`, error);
      throw error;
    }
  }
};

export const settingsService = {
  getSystemSettings: async () => {
    try {
      const response = await api.get('settings/system');
      return response.data;
    } catch (error) {
      console.error('Error fetching system settings:', error);
      throw error;
    }
  },

  updateSystemSettings: async (updates) => {
    try {
      const response = await api.patch('settings/system', updates);
      return response.data;
    } catch (error) {
      console.error('Error updating system settings:', error);
      throw error;
    }
  },

  testCarrierConnection: async (carrierCode = 'DGR', environment = null) => {
    try {
      const response = await api.post('settings/system/test-carrier', { carrierCode, ...(environment ? { environment } : {}) });
      return response.data;
    } catch (error) {
      console.error('Error testing carrier connection:', error);
      throw error;
    }
  }
};

export const publicCheckoutService = {
  getCheckoutDetails: async (trackingNumber) => {
    try {
      const response = await api.get(`public/shipments/${trackingNumber}/checkout`);
      return response.data;
    } catch (error) {
      console.error('Error fetching checkout details:', error);
      throw error;
    }
  },

  processPayment: async (trackingNumber, paymentData) => {
    try {
      const response = await api.post(`public/shipments/${trackingNumber}/pay`, paymentData);
      return response.data;
    } catch (error) {
      console.error('Error processing payment:', error);
      throw error;
    }
  }
};

export const whatsappService = {
  getLogs: async (params = {}) => {
    try {
      const response = await api.get('admin/whatsapp/logs', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching WhatsApp logs:', error);
      throw error;
    }
  },

  resendNotification: async (logId) => {
    try {
      const response = await api.post(`admin/whatsapp/resend/${logId}`);
      return response.data;
    } catch (error) {
      console.error(`Error resending WhatsApp log ${logId}:`, error);
      throw error;
    }
  },

  sendShipmentWhatsApp: async (trackingNumber, payload) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/whatsapp/send`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error sending WhatsApp notification for shipment ${trackingNumber}:`, error);
      throw error;
    }
  },

  getTemplates: async () => {
    try {
      const response = await api.get('whatsapp/templates');
      return response.data;
    } catch (error) {
      console.error('Error fetching WhatsApp templates:', error);
      throw error;
    }
  }
};

export default api;
