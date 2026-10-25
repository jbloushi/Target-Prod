import api, { API_URL } from './api';

export const supportChatService = {
    /**
     * Get list of conversations with filtering
     */
    async getConversations(params = {}) {
        const response = await api.get('/support/conversations', { params });
        return response.data;
    },

    /**
     * Get details of a single conversation
     */
    async getConversationById(id) {
        const response = await api.get(`/support/conversations/${id}`);
        return response.data;
    },

    /**
     * Get message thread for a conversation
     */
    async getMessages(id) {
        const response = await api.get(`/support/conversations/${id}/messages`);
        return response.data;
    },

    /**
     * Get 24-hour customer service window status
     */
    async get24hWindow(id) {
        const response = await api.get(`/support/conversations/${id}/window`);
        return response.data;
    },

    /**
     * Send agent reply (free text or Meta utility template)
     */
    async sendMessage(id, data) {
        const response = await api.post(`/support/conversations/${id}/messages`, data);
        return response.data;
    },

    /**
     * Get customer logistics context (profile, active shipments, past history)
     */
    async getLogisticsContext(params = {}, conversationId = null) {
        const endpoint = conversationId ? `/support/conversations/${conversationId}/context` : '/support/context';
        const response = await api.get(endpoint, { params });
        return response.data;
    },

    /**
     * Resolve/bind conversation for a specific shipment tracking number
     */
    async getShipmentConversation(trackingNumber) {
        const response = await api.get(`/support/shipments/${encodeURIComponent(trackingNumber)}/conversation`);
        return response.data;
    },

    /**
     * Get aggregate unread count for navbar badge
     */
    async getUnreadCount() {
        const response = await api.get('/support/unread-count');
        return response.data;
    },

    /**
     * Toggle conversation status (open vs resolved)
     */
    async toggleStatus(id, status) {
        const response = await api.post(`/support/conversations/${id}/status`, { status });
        return response.data;
    },

    /**
     * Update conversation labels
     */
    async updateLabels(id, labels) {
        const response = await api.post(`/support/conversations/${id}/labels`, { labels });
        return response.data;
    },

    /**
     * 1-Click action: dispatch customer GPS location request
     */
    async requestLocation(payload) {
        const response = await api.post('/support/actions/request-location', payload);
        return response.data;
    },

    /**
     * Connect to SSE stream
     */
    createEventsSource(token) {
        const baseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
        const authToken = token || localStorage.getItem('token') || '';
        const url = `${baseUrl}/support/events?token=${encodeURIComponent(authToken)}`;
        if (typeof window !== 'undefined' && window.EventSource) {
            return new window.EventSource(url);
        }
        return null;
    }
};

export default supportChatService;
