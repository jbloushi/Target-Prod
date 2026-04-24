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

// Add request interceptor to add auth token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
  getShipmentStats: async () => {
    try {
      const response = await api.get('shipments/stats');
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
  warehouseScan: async (trackingNumber) => {
    try {
      const response = await api.post(`shipments/${trackingNumber}/warehouse/scan`);
      return response.data;
    } catch (error) {
      console.error(`Error processing warehouse scan for ${trackingNumber}:`, error);
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

  // Submit to Carrier (Generic Carrier Booking)
  bookShipment: async (trackingNumber, carrierCode = 'DGR', optionalServiceCodes = []) => {
    try {
      console.log('--- FRONTEND BOOKING REQUEST ---', { trackingNumber, carrierCode, optionalServiceCodes });
      const response = await api.post(`shipments/${trackingNumber}/book`, { carrierCode, optionalServiceCodes });
      return response.data;
    } catch (error) {
      console.error(`Error submitting shipment ${trackingNumber} to ${carrierCode}:`, error);
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

  listPayments: async (orgId) => {
    try {
      const response = await api.get(`finance/organizations/${orgId}/payments`);
      return response.data;
    } catch (error) {
      console.error('Error fetching payments:', error);
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

  deleteUser: async (id) => {
    try {
      const response = await api.delete(`users/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  regenerateApiKey: async (id) => {
    try {
      const response = await api.post(`users/${id}/api-key`);
      return response.data;
    } catch (error) {
      console.error('Error regenerating user API key:', error);
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

export default api;
