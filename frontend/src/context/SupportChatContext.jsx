import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './AuthContext';
import supportChatService from '../services/supportChatService';

const SupportChatContext = createContext(null);

export const useSupportChat = () => {
    const context = useContext(SupportChatContext);
    if (!context) {
        throw new Error('useSupportChat must be used within a SupportChatProvider');
    }
    return context;
};

export const SupportChatProvider = ({ children }) => {
    const { user } = useAuth();

    // Core Conversation & Navigation State
    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [windowStatus, setWindowStatus] = useState({
        inside24hWindow: true,
        remainingSeconds: 0,
        expiresAt: null,
        lastIncomingTimestamp: null,
        reason: 'CHECKING'
    });
    const [logisticsContext, setLogisticsContext] = useState(null);

    // Filters state
    const [filters, setFilters] = useState({
        status: 'open',
        label: '',
        unread: false,
        search: ''
    });

    // Loading states
    const [loadingConversations, setLoadingConversations] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [loadingContext, setLoadingContext] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);

    // Active refs to avoid stale closure in event handlers & intervals
    const activeConvRef = useRef(activeConversation);
    activeConvRef.current = activeConversation;

    const filtersRef = useRef(filters);
    filtersRef.current = filters;

    const conversationsRef = useRef(conversations);
    conversationsRef.current = conversations;

    const prevSearchRef = useRef(filters.search);

    /**
     * Refresh aggregate unread count for navbar badge
     */
    const refreshUnreadCount = useCallback(async () => {
        if (!user) return;
        try {
            const data = await supportChatService.getUnreadCount();
            if (data?.success && typeof data.unreadCount === 'number') {
                setUnreadCount(data.unreadCount);
            }
        } catch (err) {
            console.error('[SupportChatContext] refreshUnreadCount error:', err);
        }
    }, [user]);

    /**
     * Load conversations list with current filters
     */
    const loadConversations = useCallback(async (customFilters = null) => {
        if (!user) return;
        setLoadingConversations(true);
        try {
            const f = customFilters || filtersRef.current;
            const params = {
                status: f.status || 'open',
                unread: f.unread ? 'true' : undefined,
                label: f.label || undefined,
                q: f.search ? f.search.trim() : undefined
            };
            const data = await supportChatService.getConversations(params);
            if (data?.success && Array.isArray(data.conversations)) {
                setConversations(data.conversations);
                if (typeof data.meta?.unreadTotal === 'number') {
                    // Update unread count if returned by list
                    setUnreadCount(data.meta.unreadTotal);
                }
            }
        } catch (err) {
            console.error('[SupportChatContext] loadConversations error:', err);
        } finally {
            setLoadingConversations(false);
        }
    }, [user]);

    /**
     * Load messages and 24h window for an active conversation
     */
    const loadConversationMessages = useCallback(async (conversationId, options = {}) => {
        if (!conversationId) return;
        const silent = Boolean(options?.silent);
        if (!silent) {
            setLoadingMessages(true);
        }
        try {
            const data = await supportChatService.getMessages(conversationId);
            // Check if active conversation changed while fetching: discard stale response
            if (!activeConvRef.current?.id || String(conversationId) !== String(activeConvRef.current?.id)) {
                return;
            }
            if (data?.success) {
                const incoming = (Array.isArray(data.messages) ? data.messages : []).map(m => ({
                    ...m,
                    conversationId: m.conversationId || conversationId
                }));
                setMessages(prev => {
                    if (prev.length === 0) return incoming;
                    const incomingIds = new Set(incoming.map(m => m.id));
                    const pendingLocal = prev.filter(m =>
                        !incomingIds.has(m.id) &&
                        (!m.conversationId || String(m.conversationId) === String(conversationId))
                    );
                    if (pendingLocal.length === 0) return incoming;
                    return [...incoming, ...pendingLocal];
                });
                if (data.windowStatus) {
                    setWindowStatus(data.windowStatus);
                }
            }
        } catch (err) {
            console.error('[SupportChatContext] loadConversationMessages error:', err);
        } finally {
            if (!silent && (!activeConvRef.current?.id || String(conversationId) === String(activeConvRef.current?.id))) {
                setLoadingMessages(false);
            }
        }
    }, []);

    /**
     * Load customer logistics context (profile, active shipments, history)
     */
    const loadLogisticsContext = useCallback(async (conversationId, params = {}) => {
        setLoadingContext(true);
        try {
            const data = await supportChatService.getLogisticsContext(params, conversationId);
            if (data?.success) {
                setLogisticsContext(data);
            }
        } catch (err) {
            console.error('[SupportChatContext] loadLogisticsContext error:', err);
        } finally {
            setLoadingContext(false);
        }
    }, []);

    /**
     * Select a conversation and load its messages and context
     */
    const selectConversation = useCallback(async (conversationOrId) => {
        if (!conversationOrId) {
            activeConvRef.current = null;
            setActiveConversation(null);
            setMessages([]);
            setLogisticsContext(null);
            return;
        }

        let conv = null;
        let convId = null;

        if (typeof conversationOrId === 'object' && conversationOrId.id) {
            conv = conversationOrId;
            convId = conversationOrId.id;
        } else {
            convId = conversationOrId;
            // Find in current conversations list if available
            conv = conversationsRef.current.find(c => String(c.id) === String(convId)) || { id: convId };
        }

        if (String(convId) !== String(activeConvRef.current?.id)) {
            setMessages([]);
            setLogisticsContext(null);
            activeConvRef.current = conv;
        }

        setActiveConversation(conv);

        // Mark as read locally if had unread
        if (conv.unreadCount > 0) {
            setUnreadCount(prev => Math.max(0, prev - 1));
            setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c));
        }

        await Promise.all([
            loadConversationMessages(convId),
            loadLogisticsContext(convId, {
                trackingNumber: conv.activeShipment?.trackingNumber,
                phone: conv.contact?.phone
            })
        ]);
    }, [loadConversationMessages, loadLogisticsContext]);

    /**
     * Load/bind conversation by shipment tracking number
     */
    const loadConversationByTrackingNumber = useCallback(async (trackingNumber) => {
        if (!trackingNumber) return null;
        try {
            const data = await supportChatService.getShipmentConversation(trackingNumber);
            if (data?.success) {
                const conv = data.conversation || { id: data.conversationId };
                const convId = data.conversationId || conv.id;
                if (String(convId) !== String(activeConvRef.current?.id)) {
                    setMessages([]);
                    setLogisticsContext(null);
                    activeConvRef.current = conv;
                }
                setActiveConversation(conv);
                if (data.windowStatus) setWindowStatus(data.windowStatus);
                await Promise.all([
                    loadConversationMessages(data.conversationId),
                    loadLogisticsContext(data.conversationId, { trackingNumber })
                ]);
                return conv;
            }
        } catch (err) {
            console.error('[SupportChatContext] loadConversationByTrackingNumber error:', err);
        }
        return null;
    }, [loadConversationMessages, loadLogisticsContext]);

    /**
     * Load conversation by phone number
     */
    const loadConversationByPhone = useCallback(async (phone, meta = {}) => {
        if (!phone) return null;
        if (meta.trackingNumber) {
            return await loadConversationByTrackingNumber(meta.trackingNumber);
        }

        // Try finding in current conversations list
        const cleanPhone = String(phone).replace(/\D/g, '');
        const match = conversationsRef.current.find(c => {
            const p = String(c.contact?.phone || '').replace(/\D/g, '');
            return p.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(p.slice(-8));
        });

        if (match) {
            await selectConversation(match);
            return match;
        }

        // Search via API
        try {
            const data = await supportChatService.getConversations({ search: phone });
            if (data?.success && data.conversations?.[0]) {
                const found = data.conversations[0];
                await selectConversation(found);
                return found;
            }
        } catch (err) {
            console.error('[SupportChatContext] loadConversationByPhone error:', err);
        }

        return null;
    }, [loadConversationByTrackingNumber, selectConversation]);

    /**
     * Send agent reply message (free text or approved Meta template)
     */
    const sendMessage = useCallback(async ({
        content,
        isTemplate = false,
        templateName = null,
        templateParams = null,
        language = 'en',
        isPrivate = false
    }) => {
        const activeId = activeConvRef.current?.id;
        if (!activeId) {
            throw new Error('No active conversation selected');
        }

        setSendingMessage(true);
        try {
            const result = await supportChatService.sendMessage(activeId, {
                content,
                isTemplate,
                templateName,
                templateParams,
                language,
                isPrivate
            });

            // Optimistically append new message to thread
            const newMsg = {
                id: result?.message?.id || Date.now(),
                conversationId: activeId,
                content: content || `[Template: ${templateName}]`,
                messageType: isPrivate ? 'note' : 'outgoing',
                private: Boolean(isPrivate),
                isTemplate: Boolean(isTemplate || templateName),
                templateName,
                templateParams,
                sender: { id: user?.id, name: user?.name, type: 'user' },
                createdAt: new Date().toISOString(),
                status: 'delivered'
            };

            setMessages(prev => [...prev, newMsg]);

            // Update conversation card preview
            setConversations(prev => prev.map(c => {
                if (c.id === activeId) {
                    return {
                        ...c,
                        lastMessage: newMsg,
                        updatedAt: new Date().toISOString()
                    };
                }
                return c;
            }));

            return result;
        } finally {
            setSendingMessage(false);
        }
    }, [user]);

    /**
     * Toggle conversation status (open vs resolved)
     */
    const toggleConversationStatus = useCallback(async (conversationId, newStatus) => {
        const id = conversationId || activeConvRef.current?.id;
        if (!id) return;

        try {
            const res = await supportChatService.toggleStatus(id, newStatus);
            if (res?.success) {
                const status = res.status || newStatus;
                setActiveConversation(prev => prev && prev.id === id ? { ...prev, status } : prev);
                setConversations(prev => prev.map(c => c.id === id ? { ...c, status } : c));
                refreshUnreadCount();
            }
        } catch (err) {
            console.error('[SupportChatContext] toggleConversationStatus error:', err);
            throw err;
        }
    }, [refreshUnreadCount]);

    /**
     * Update conversation labels
     */
    const updateConversationLabels = useCallback(async (conversationId, labels) => {
        const id = conversationId || activeConvRef.current?.id;
        if (!id) return;

        try {
            const res = await supportChatService.updateLabels(id, labels);
            if (res?.success) {
                const updatedLabels = res.labels || labels;
                setActiveConversation(prev => prev && prev.id === id ? { ...prev, labels: updatedLabels } : prev);
                setConversations(prev => prev.map(c => c.id === id ? { ...c, labels: updatedLabels } : c));
            }
        } catch (err) {
            console.error('[SupportChatContext] updateConversationLabels error:', err);
            throw err;
        }
    }, []);

    /**
     * 1-Click action: Send customer GPS pin location request
     */
    const sendLocationRequest = useCallback(async (trackingNumber, phone, name) => {
        try {
            const res = await supportChatService.requestLocation({ trackingNumber, phone, name });
            if (res?.success) {
                // Refresh active thread to show newly dispatched template message
                if (activeConvRef.current?.id) {
                    await loadConversationMessages(activeConvRef.current.id, { silent: true });
                }
            }
            return res;
        } catch (err) {
            console.error('[SupportChatContext] sendLocationRequest error:', err);
            throw err;
        }
    }, [loadConversationMessages]);

    // Reactive filter synchronization with debounce for search query
    useEffect(() => {
        if (!user) return;

        const searchChanged = prevSearchRef.current !== filters.search;
        prevSearchRef.current = filters.search;

        if (searchChanged && filters.search) {
            const timer = setTimeout(() => {
                loadConversations(filters);
            }, 300);
            return () => clearTimeout(timer);
        }

        loadConversations(filters);
    }, [user, filters.status, filters.label, filters.unread, filters.search, loadConversations]);

    /**
     * Real-time handling: SSE + Visibility-aware polling
     */
    useEffect(() => {
        if (!user) return;

        // 1. Initial unread count fetch (conversations loaded via reactive filter effect)
        refreshUnreadCount();

        // 2. Setup Server-Sent Events (SSE) listener
        let eventSource = null;
        try {
            const token = localStorage.getItem('token');
            eventSource = supportChatService.createEventsSource(token);

            if (eventSource) {
                eventSource.addEventListener('message', (e) => {
                    try {
                        const event = JSON.parse(e.data);
                        const convId = event.conversationId;
                        const incomingMsg = event.message;

                        // Case A: Incoming message belongs to the currently active conversation
                        if (activeConvRef.current && String(activeConvRef.current.id) === String(convId)) {
                            const messageWithConv = incomingMsg.conversationId
                                ? incomingMsg
                                : { ...incomingMsg, conversationId: convId };
                            setMessages(prev => {
                                // Avoid duplicate message insertion
                                if (prev.some(m => m.id === incomingMsg.id)) return prev;
                                return [...prev, messageWithConv];
                            });

                            // Re-evaluate 24h window
                            if (incomingMsg.messageType === 'incoming') {
                                setWindowStatus({
                                    inside24hWindow: true,
                                    remainingSeconds: 24 * 3600,
                                    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
                                    lastIncomingTimestamp: new Date(),
                                    reason: 'INSIDE_WINDOW'
                                });
                            }
                        } else {
                            // Case B: Message belongs to another conversation -> increment unread badge
                            setUnreadCount(prev => prev + 1);
                            setConversations(prev => prev.map(c => {
                                if (String(c.id) === String(convId)) {
                                    return {
                                        ...c,
                                        unreadCount: (c.unreadCount || 0) + 1,
                                        lastMessage: incomingMsg,
                                        updatedAt: new Date().toISOString()
                                    };
                                }
                                return c;
                            }));
                        }
                    } catch (parseErr) {
                        console.error('[SupportChatContext] SSE message parse error:', parseErr);
                    }
                });

                eventSource.addEventListener('unread_update', (e) => {
                    try {
                        const event = JSON.parse(e.data);
                        if (typeof event?.unreadCount === 'number') {
                            setUnreadCount(event.unreadCount);
                        } else {
                            refreshUnreadCount();
                        }
                    } catch (_) {
                        refreshUnreadCount();
                    }
                });

                eventSource.onerror = (err) => {
                    // Fall back cleanly to polling without crashing
                    console.debug('[SupportChatContext] SSE connection fallback to smart polling');
                };
            }
        } catch (sseErr) {
            console.debug('[SupportChatContext] SSE unavailable:', sseErr);
        }

        // 3. Tab visibility smart polling fallback
        const unreadInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                refreshUnreadCount();
            }
        }, 15000); // Poll unread every 15s

        const activeMsgInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible' && activeConvRef.current?.id) {
                // Poll active conversation messages silently every 4s
                loadConversationMessages(activeConvRef.current.id, { silent: true });
            }
        }, 4000);

        // 4. Handle tab refocus (immediately sync)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshUnreadCount();
                if (activeConvRef.current?.id) {
                    loadConversationMessages(activeConvRef.current.id, { silent: true });
                }
            }
        };

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }

        return () => {
            if (eventSource) {
                eventSource.close();
            }
            clearInterval(unreadInterval);
            clearInterval(activeMsgInterval);
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
        };
    }, [user, refreshUnreadCount, loadConversationMessages]);

    // Live countdown timer for 24h window
    useEffect(() => {
        if (!windowStatus.inside24hWindow || windowStatus.remainingSeconds <= 0) return;

        const timer = setInterval(() => {
            setWindowStatus(prev => {
                if (!prev.inside24hWindow || prev.remainingSeconds <= 1) {
                    return {
                        ...prev,
                        inside24hWindow: false,
                        remainingSeconds: 0,
                        reason: 'OUTSIDE_24H_WINDOW'
                    };
                }
                return {
                    ...prev,
                    remainingSeconds: prev.remainingSeconds - 1
                };
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [windowStatus.inside24hWindow, windowStatus.remainingSeconds]);

    const value = {
        conversations,
        activeConversation,
        messages,
        unreadCount,
        windowStatus,
        logisticsContext,
        filters,
        setFilters,
        loadingConversations,
        loadingMessages,
        loadingContext,
        sendingMessage,
        loadConversations,
        selectConversation,
        loadConversationByPhone,
        loadConversationByTrackingNumber,
        sendMessage,
        toggleConversationStatus,
        updateConversationLabels,
        sendLocationRequest,
        refreshUnreadCount
    };

    return (
        <SupportChatContext.Provider value={value}>
            {children}
        </SupportChatContext.Provider>
    );
};

SupportChatProvider.propTypes = {
    children: PropTypes.node.isRequired
};

export default SupportChatContext;
