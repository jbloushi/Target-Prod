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
    createEventsSource() {
        const baseUrl = API_URL.endsWith('/api') ? API_URL : `${API_URL}/api`;
        if (typeof globalThis.fetch !== 'function' || typeof AbortController === 'undefined') return null;

        const controller = new AbortController();
        const listeners = new Map();
        let closed = false;
        let retryTimer = null;
        let resolveRetry = null;
        const url = `${baseUrl}/support/events`;

        const source = {
            onerror: null,
            addEventListener(eventName, handler) {
                if (!listeners.has(eventName)) listeners.set(eventName, new Set());
                listeners.get(eventName).add(handler);
            },
            removeEventListener(eventName, handler) {
                listeners.get(eventName)?.delete(handler);
            },
            close() {
                closed = true;
                controller.abort();
                if (retryTimer) clearTimeout(retryTimer);
                resolveRetry?.();
            }
        };

        const dispatchEventBlock = (block) => {
            let eventName = 'message';
            const dataLines = [];
            block.split('\n').forEach((line) => {
                if (!line || line.startsWith(':')) return;
                if (line.startsWith('event:')) eventName = line.slice(6).trim() || 'message';
                if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
            });
            if (dataLines.length === 0) return;
            const event = { data: dataLines.join('\n') };
            listeners.get(eventName)?.forEach((handler) => {
                try {
                    handler(event);
                } catch (_) {
                    // One consumer callback must not interrupt the shared event stream.
                }
            });
        };

        const waitBeforeRetry = () => new Promise((resolve) => {
            resolveRetry = resolve;
            retryTimer = setTimeout(() => {
                retryTimer = null;
                resolveRetry = null;
                resolve();
            }, 3000);
        });

        const connect = async () => {
            while (!closed) {
                try {
                    const response = await globalThis.fetch(url, {
                        method: 'GET',
                        headers: { Accept: 'text/event-stream' },
                        credentials: 'include',
                        cache: 'no-store',
                        signal: controller.signal
                    });
                    if (!response.ok || !response.body) {
                        throw new Error(`SSE connection failed (${response.status})`);
                    }

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    while (!closed) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
                        const blocks = buffer.split('\n\n');
                        buffer = blocks.pop() || '';
                        blocks.forEach(dispatchEventBlock);
                    }
                    if (!closed) throw new Error('SSE connection closed');
                } catch (error) {
                    if (closed) return;
                    try {
                        source.onerror?.(error);
                    } catch (_) {
                        // Keep retry handling alive if a consumer error handler throws.
                    }
                    await waitBeforeRetry();
                }
            }
        };

        connect();
        return source;
    }
};

export default supportChatService;
