const crypto = require('crypto');
const { prisma } = require('../config/database');
const config = require('../config/config');
const logger = require('../utils/logger');
const chatwootService = require('../services/chatwootNotificationService');
const whatsappService = require('../services/whatsappIntegration.service');
const userController = require('./user.controller');
const supportEvents = require('../services/supportEvents');

// Active Server-Sent Events clients
const sseClients = new Set();

// Listen to supportEvents and broadcast to connected SSE clients
supportEvents.on('message', (payload) => {
    const data = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(data);
        } catch (err) {
            sseClients.delete(client);
        }
    }
});

supportEvents.on('unread_update', (payload) => {
    const data = `event: unread_update\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(data);
        } catch (err) {
            sseClients.delete(client);
        }
    }
});

function getAccountId() {
    return config.chatwoot?.accountId || '1';
}

function resolveRequestHeaders(req) {
    if (req?.user?.chatwootAccessToken) {
        const decrypted = userController.decryptChatwootToken(req.user.chatwootAccessToken);
        if (decrypted) {
            return { api_access_token: decrypted };
        }
    }
    return undefined;
}

async function synthesizeMessagesFromLocalLogs(whereClause) {
    try {
        if (typeof prisma.shipmentNotificationLog?.findMany !== 'function') return [];
        const logs = await prisma.shipmentNotificationLog.findMany({
            where: whereClause,
            orderBy: { createdAt: 'asc' },
            take: 50
        });
        return (logs || []).map((l, idx) => ({
            id: l.chatwootMessageId || l.id || `local_${idx}`,
            content: l.payloadJson?.content ||
                `[WhatsApp ${l.eventType || 'Notification'} (${l.templateName || 'Template'}) - Status: ${String(l.status || 'sent').toUpperCase()}]`,
            messageType: 'outgoing',
            private: false,
            isTemplate: true,
            templateName: l.templateName || l.eventType || 'Meta Template',
            templateParams: l.payloadJson?.template_params?.parameters || l.payloadJson?.variables || null,
            sender: { id: 'system', name: 'Target Logistics WhatsApp', type: 'user' },
            createdAt: l.sentAt || l.createdAt || new Date().toISOString(),
            status: String(l.status || 'delivered').toLowerCase()
        }));
    } catch (_) {
        return [];
    }
}

function normalizeConversationItem(conv) {
    if (!conv) return null;
    const sender = conv.meta?.sender || conv.contact || {};
    const customAttrs = conv.custom_attributes || {};
    const senderCustomAttrs = sender.custom_attributes || {};

    // Extract last message
    const messages = Array.isArray(conv.messages) ? conv.messages : [];
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : (conv.last_non_activity_message || null);

    return {
        id: conv.id,
        status: conv.status || 'open',
        unreadCount: Number(conv.unread_count || 0),
        labels: Array.isArray(conv.labels) ? conv.labels : [],
        contact: {
            id: sender.id || null,
            name: sender.name || 'Customer',
            phone: sender.phone_number || sender.phone || null,
            email: sender.email || null,
            role: customAttrs.recipient_role || senderCustomAttrs.role || 'receiver',
            organizationName: senderCustomAttrs.organization_name || sender.additional_attributes?.company_name || null
        },
        activeShipment: {
            trackingNumber: customAttrs.shipment_tracking_number || null,
            status: customAttrs.active_status || null,
            carrierCode: customAttrs.carrier_code || null,
            codAmount: customAttrs.cod_amount ? Number(customAttrs.cod_amount) : null
        },
        lastMessage: lastMsg ? {
            id: lastMsg.id,
            content: lastMsg.content,
            createdAt: lastMsg.created_at,
            messageType: (lastMsg.message_type === 0 || lastMsg.message_type === 'incoming') ? 'incoming' : (lastMsg.private ? 'note' : 'outgoing'),
            isTemplate: Boolean(lastMsg.content_attributes?.template_params || lastMsg.template_params)
        } : null,
        updatedAt: conv.updated_at || conv.last_activity_at || new Date().toISOString()
    };
}

/**
 * GET /api/support/conversations
 * List conversations with filtering by status, label, unread toggle, search query
 */
exports.getConversations = async (req, res) => {
    try {
        const accountId = getAccountId();
        const status = req.query.status || 'open';
        const label = req.query.label || null;
        const unreadOnly = req.query.unread === 'true' || req.query.unread === true;
        const search = (req.query.search || req.query.q || '').trim().toLowerCase();
        const page = parseInt(req.query.page, 10) || 1;

        let queryPath = `/api/v1/accounts/${accountId}/conversations?page=${page}`;
        if (status && status !== 'all') {
            queryPath += `&status=${encodeURIComponent(status)}`;
        }

        const rawResponse = await chatwootService.request('get', queryPath, undefined, undefined, resolveRequestHeaders(req));
        const rawPayloads = rawResponse?.data?.payloads || rawResponse?.payloads || (Array.isArray(rawResponse) ? rawResponse : []);

        let conversations = rawPayloads.map(normalizeConversationItem).filter(Boolean);

        // Apply filters
        if (status && status !== 'all') {
            conversations = conversations.filter(c => c.status === status);
        }

        if (label) {
            conversations = conversations.filter(c => c.labels.includes(label));
        }

        if (unreadOnly) {
            conversations = conversations.filter(c => c.unreadCount > 0);
        }

        if (search) {
            conversations = conversations.filter(c => {
                const name = (c.contact?.name || '').toLowerCase();
                const phone = (c.contact?.phone || '').toLowerCase();
                const tracking = (c.activeShipment?.trackingNumber || '').toLowerCase();
                return name.includes(search) || phone.includes(search) || tracking.includes(search);
            });
        }

        const unreadTotal = rawPayloads.reduce((sum, c) => sum + (Number(c.unread_count || 0) > 0 ? 1 : 0), 0);

        return res.status(200).json({
            success: true,
            conversations,
            meta: {
                total: conversations.length,
                page,
                unreadTotal
            }
        });
    } catch (err) {
        logger.error('[supportChat] getConversations error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/support/conversations/:id
 * Retrieve details of a conversation + 24-hour window status
 */
exports.getConversationById = async (req, res) => {
    try {
        const accountId = getAccountId();
        const { id } = req.params;

        const [convResponse, windowStatus] = await Promise.all([
            chatwootService.request('get', `/api/v1/accounts/${accountId}/conversations/${id}`, undefined, undefined, resolveRequestHeaders(req)),
            chatwootService.checkCustomer24hWindow(id)
        ]);

        const rawConv = convResponse?.data || convResponse;
        const conversation = normalizeConversationItem(rawConv);

        return res.status(200).json({
            success: true,
            conversation,
            windowStatus
        });
    } catch (err) {
        logger.error(`[supportChat] getConversationById ${req.params.id} error:`, err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/support/conversations/:id/messages
 * Retrieve messages thread + 24-hour window status
 */
exports.getMessages = async (req, res) => {
    try {
        const accountId = getAccountId();
        const { id } = req.params;

        if (String(id).startsWith('local:')) {
            const trackingNumber = String(id).replace(/^local:/, '');
            const messages = await synthesizeMessagesFromLocalLogs({ trackingNumber });
            return res.status(200).json({
                success: true,
                conversationId: id,
                windowStatus: {
                    inside24hWindow: false,
                    remainingSeconds: 0,
                    expiresAt: null,
                    lastIncomingTimestamp: null,
                    reason: 'NO_INCOMING_MESSAGES'
                },
                messages
            });
        }

        const [msgResponse, windowStatus] = await Promise.all([
            chatwootService.request('get', `/api/v1/accounts/${accountId}/conversations/${id}/messages`, undefined, undefined, resolveRequestHeaders(req)),
            chatwootService.checkCustomer24hWindow(id)
        ]);

        const rawMessages = msgResponse?.payload || msgResponse?.data || (Array.isArray(msgResponse) ? msgResponse : []);

        const messages = rawMessages.map(m => {
            const isIncoming = m.message_type === 0 || m.message_type === 'incoming';
            const templateParams = m.content_attributes?.template_params || m.template_params || null;
            const isTemplate = Boolean(templateParams || m.content_attributes?.is_template);

            return {
                id: m.id,
                content: m.content,
                messageType: isIncoming ? 'incoming' : (m.private ? 'note' : 'outgoing'),
                private: Boolean(m.private),
                isTemplate,
                templateName: templateParams?.name || null,
                templateParams: templateParams?.processed_params || templateParams?.parameters || templateParams || null,
                sender: m.sender ? {
                    id: m.sender.id,
                    name: m.sender.name,
                    type: m.sender.type || (isIncoming ? 'contact' : 'user')
                } : null,
                createdAt: m.created_at,
                status: m.status || 'delivered'
            };
        });

        return res.status(200).json({
            success: true,
            conversationId: id,
            windowStatus,
            messages
        });
    } catch (err) {
        logger.error(`[supportChat] getMessages ${req.params.id} error:`, err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/support/conversations/:id/window
 * Check 24-hour customer service window status
 */
exports.get24hWindow = async (req, res) => {
    try {
        const { id } = req.params;
        const windowStatus = await chatwootService.checkCustomer24hWindow(id);
        return res.status(200).json({
            success: true,
            ...windowStatus
        });
    } catch (err) {
        logger.error(`[supportChat] get24hWindow ${req.params.id} error:`, err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/support/conversations/:id/messages
 * Send agent reply (free text or approved Meta template)
 * Enforces per-agent Chatwoot access token and 24-hour service window.
 */
exports.sendMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { content, isTemplate, templateName, templateParams, language, isPrivate } = req.body;

        // 1. Verify sending user has a configured Chatwoot token
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, chatwootAccessToken: true }
        });

        if (!user || !user.chatwootAccessToken) {
            return res.status(403).json({
                success: false,
                code: 'NO_CHATWOOT_TOKEN',
                error: 'You do not have a configured Chatwoot personal access token. Please ask an administrator to configure your Chatwoot credentials in User Management to send replies.'
            });
        }

        const decryptedToken = userController.decryptChatwootToken(user.chatwootAccessToken);
        if (!decryptedToken) {
            return res.status(403).json({
                success: false,
                code: 'NO_CHATWOOT_TOKEN',
                error: 'Failed to decrypt Chatwoot personal access token.'
            });
        }

        // 2. Validate template parameters and evaluate effectiveIsTemplate strictly
        const isTemplateRequested = isTemplate === true || isTemplate === 'true' || isTemplate === 1;
        const isExplicitlyFreeText = isTemplate === false || isTemplate === 'false' || isTemplate === 0;
        const sanitizedTemplateName = (typeof templateName === 'string') ? templateName.trim() : '';
        const hasValidTemplateName = sanitizedTemplateName.length > 0;

        // Block attempts to bypass window with isTemplate: true without templateName
        if (isTemplateRequested && !hasValidTemplateName) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TEMPLATE_NAME',
                error: 'Template name is required when isTemplate is true'
            });
        }

        const effectiveIsTemplate = (isTemplateRequested || hasValidTemplateName) && !isExplicitlyFreeText && hasValidTemplateName;

        // Validate template exists in approved catalog
        const approvedTemplates = chatwootService.APPROVED_META_TEMPLATES;
        if (effectiveIsTemplate && approvedTemplates && !approvedTemplates.has(sanitizedTemplateName)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TEMPLATE_NAME',
                error: `Template "${sanitizedTemplateName}" is not an approved Meta WhatsApp template.`
            });
        }

        // Check 24-hour customer service window for free-text messages (unless internal private note)
        if (!effectiveIsTemplate && !isPrivate) {
            const windowStatus = await chatwootService.checkCustomer24hWindow(id);
            if (!windowStatus.inside24hWindow) {
                return res.status(400).json({
                    success: false,
                    code: 'OUTSIDE_24H_WINDOW',
                    error: 'Free-text messages are prohibited outside the 24-hour customer service window. An approved Meta template is required.',
                    windowStatus
                });
            }
        }

        // 3. Assemble payload for Chatwoot API
        let payload;
        if (effectiveIsTemplate) {
            payload = {
                content: content || `[Meta Template: ${sanitizedTemplateName}]`,
                message_type: 'outgoing',
                private: false,
                template_params: {
                    name: sanitizedTemplateName,
                    category: 'UTILITY',
                    language: language || 'en',
                    processed_params: templateParams || {},
                    parameters: templateParams || {}
                }
            };
        } else {
            payload = {
                content,
                message_type: 'outgoing',
                private: Boolean(isPrivate)
            };
        }

        // 4. Send message attributing to agent's decrypted personal token
        const result = await chatwootService.sendMessage(id, payload, {
            userAccessToken: decryptedToken,
            isTemplate: effectiveIsTemplate
        });

        // 5. Broadcast real-time message event
        supportEvents.broadcastMessage({
            conversationId: id,
            message: {
                id: result?.id || Date.now(),
                content: payload.content,
                messageType: isPrivate ? 'note' : 'outgoing',
                private: Boolean(isPrivate),
                isTemplate: effectiveIsTemplate,
                templateName: templateName || null,
                sender: { id: user.id, name: user.name, type: 'user' },
                createdAt: new Date().toISOString()
            }
        });

        return res.status(201).json({
            success: true,
            message: result
        });
    } catch (err) {
        logger.error(`[supportChat] sendMessage error:`, err);
        const status = err.status || 500;
        return res.status(status).json({
            success: false,
            code: err.code || 'SEND_MESSAGE_ERROR',
            error: err.message,
            windowStatus: err.windowStatus || null
        });
    }
};

/**
 * GET /api/support/conversations/:id/context
 * GET /api/support/context
 * Return customer profile, organization details, active shipments first, past shipments, and 1-click actions
 */
exports.getLogisticsContext = async (req, res) => {
    try {
        const conversationId = req.params.id;
        let trackingNumber = req.query.trackingNumber || null;
        let phone = req.query.phone || null;
        let customerName = null;
        let organizationName = null;
        let role = 'receiver';

        // 1. If conversationId provided, query conversation to resolve contact details
        if (conversationId) {
            try {
                const accountId = getAccountId();
                const conv = await chatwootService.request('get', `/api/v1/accounts/${accountId}/conversations/${conversationId}`);
                const data = conv?.data || conv;
                const sender = data?.meta?.sender || data?.contact || {};
                phone = phone || sender.phone_number || sender.phone || null;
                customerName = sender.name || 'Customer';
                role = data?.custom_attributes?.recipient_role || sender.custom_attributes?.role || 'receiver';
                organizationName = sender.custom_attributes?.organization_name || null;
                trackingNumber = trackingNumber || data?.custom_attributes?.shipment_tracking_number || null;
            } catch (convErr) {
                logger.warn(`[supportChat] Could not load Chatwoot conversation ${conversationId}: ${convErr.message}`);
            }
        }

        // 2. Query shipments matching tracking number or phone
        let shipments = [];
        if (trackingNumber) {
            const shp = await prisma.shipment.findUnique({
                where: { trackingNumber },
                include: { organization: true, user: true }
            });
            if (shp) shipments.push(shp);
        }

        if (phone) {
            const cleanPhone = String(phone).replace(/\D/g, '');
            if (cleanPhone.length >= 7) {
                const candidates = await prisma.shipment.findMany({
                    take: 50,
                    orderBy: { createdAt: 'desc' },
                    include: { organization: true, user: true }
                });

                for (const cand of candidates) {
                    if (shipments.some(s => s.id === cand.id)) continue;
                    const destPhone = String(cand.destination?.phone || '').replace(/\D/g, '');
                    const origPhone = String(cand.origin?.phone || '').replace(/\D/g, '');
                    const custPhone = String(cand.customer?.phone || '').replace(/\D/g, '');
                    const userPhone = String(cand.user?.phone || '').replace(/\D/g, '');

                    if (
                        (destPhone && (destPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(destPhone.slice(-8)))) ||
                        (origPhone && (origPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(origPhone.slice(-8)))) ||
                        (custPhone && (custPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(custPhone.slice(-8)))) ||
                        (userPhone && (userPhone.endsWith(cleanPhone.slice(-8)) || cleanPhone.endsWith(userPhone.slice(-8))))
                    ) {
                        shipments.push(cand);
                    }
                }
            }
        }

        // 3. Separate into active shipments first, then past shipments
        const terminalStatuses = ['delivered', 'cancelled', 'returned'];
        const activeRaw = shipments.filter(s => !terminalStatuses.includes(s.status));
        const pastRaw = shipments.filter(s => terminalStatuses.includes(s.status));

        const formatShipmentItem = (s) => ({
            id: s.id,
            trackingNumber: s.trackingNumber,
            carrierCode: s.carrierCode,
            carrierName: s.carrierCode === 'DGR' ? 'DHL Express' : s.carrierCode,
            status: s.status,
            origin: s.origin?.city || s.origin?.country || 'Kuwait',
            destination: s.destination?.address || s.destination?.city || 'Kuwait',
            price: Number(s.price || 0),
            remainingBalance: Number(s.remainingBalance || 0),
            isPaid: Boolean(s.paid),
            codAmount: s.codAmount ? Number(s.codAmount) : null,
            codStatus: s.codStatus || null,
            locationToken: s.locationToken || null,
            documents: {
                awbUrl: s.awbUrl || `/api/shipments/${s.trackingNumber}/documents/awb.pdf`,
                labelUrl: s.labelUrl || `/api/shipments/${s.trackingNumber}/label`,
                invoiceUrl: s.invoiceUrl || `/api/shipments/${s.trackingNumber}/invoice`
            },
            links: {
                tracking: `https://target-kw.com/track/${s.trackingNumber}`,
                payment: `https://target-kw.com/pay/${s.trackingNumber}`,
                locationPortal: s.locationToken ? `https://target-kw.com/location/${s.locationToken}` : null
            }
        });

        const activeShipments = activeRaw.map(formatShipmentItem);
        const pastShipments = pastRaw.map(formatShipmentItem);

        // Resolve customer organization
        const primaryShipment = activeRaw[0] || pastRaw[0] || null;
        const organization = primaryShipment?.organization ? {
            id: primaryShipment.organization.id,
            name: primaryShipment.organization.name,
            creditLimit: Number(primaryShipment.organization.creditLimit || 0),
            balance: Number(primaryShipment.organization.balance || 0)
        } : (organizationName ? { name: organizationName } : null);

        return res.status(200).json({
            success: true,
            customer: {
                name: customerName || primaryShipment?.destination?.contactPerson || primaryShipment?.destination?.name || 'Customer',
                phone: phone || primaryShipment?.destination?.phone || null,
                role,
                organization
            },
            activeShipments,
            pastShipments
        });
    } catch (err) {
        logger.error('[supportChat] getLogisticsContext error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/support/shipments/:trackingNumber/conversation
 * Open or bind conversation for a specific shipment (for NativeChatDrawer)
 */
exports.getShipmentConversation = async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { organization: true, user: true }
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        const phone = shipment.destination?.phone || shipment.customer?.phone || shipment.origin?.phone || shipment.user?.phone;
        const name = shipment.destination?.contactPerson || shipment.destination?.name || shipment.customer?.name || 'Customer';
        const role = 'receiver';

        const context = typeof chatwootService.buildShipmentNotificationContext === 'function'
            ? chatwootService.buildShipmentNotificationContext(shipment)
            : { trackingNumber, shipmentId: shipment.id };

        const target = { phone, name, role };
        let contact = null;
        let conversation = null;
        let windowStatus = null;
        let localMessages = null;

        try {
            contact = await chatwootService.findOrCreateContact(target, context);
            conversation = await chatwootService.findOrCreateConversation(contact, target, context);
            windowStatus = await chatwootService.checkCustomer24hWindow(conversation.id);
        } catch (cwErr) {
            logger.warn(`[supportChat] Chatwoot API unavailable for ${trackingNumber} (${cwErr.message}); using local notification log fallback.`);
            localMessages = await synthesizeMessagesFromLocalLogs({
                OR: [
                    { shipmentId: shipment.id },
                    { trackingNumber: shipment.trackingNumber }
                ]
            });
            const fallbackConvId = `local:${shipment.trackingNumber}`;
            conversation = {
                id: fallbackConvId,
                status: 'open',
                unread_count: 0,
                labels: [role],
                custom_attributes: {
                    shipment_tracking_number: shipment.trackingNumber,
                    active_status: shipment.status,
                    carrier_code: shipment.carrierCode,
                    cod_amount: Number(shipment.codAmount || 0),
                    recipient_role: role
                },
                meta: {
                    sender: {
                        name,
                        phone_number: phone
                    }
                }
            };
            windowStatus = {
                inside24hWindow: false,
                remainingSeconds: 0,
                expiresAt: null,
                lastIncomingTimestamp: null,
                reason: 'NO_INCOMING_MESSAGES'
            };
        }

        return res.status(200).json({
            success: true,
            conversationId: conversation.id,
            conversation: normalizeConversationItem(conversation),
            contact,
            windowStatus,
            ...(localMessages ? { messages: localMessages } : {}),
            shipment: {
                id: shipment.id,
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                carrierCode: shipment.carrierCode,
                destination: shipment.destination,
                price: Number(shipment.price || 0),
                remainingBalance: Number(shipment.remainingBalance || 0),
                codAmount: Number(shipment.codAmount || 0),
                locationToken: shipment.locationToken
            }
        });
    } catch (err) {
        logger.error(`[supportChat] getShipmentConversation ${req.params.trackingNumber} error:`, err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/support/unread-count
 * Returns aggregate unread conversations count for navbar badge
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const accountId = getAccountId();
        const rawResponse = await chatwootService.request('get', `/api/v1/accounts/${accountId}/conversations?status=open`, undefined, undefined, resolveRequestHeaders(req));
        const payloads = rawResponse?.data?.payloads || rawResponse?.payloads || (Array.isArray(rawResponse) ? rawResponse : []);

        const unreadCount = payloads.reduce((sum, c) => sum + (Number(c.unread_count || 0)), 0);

        return res.status(200).json({
            success: true,
            unreadCount,
            openConversationsCount: payloads.length,
            lastUpdated: new Date().toISOString()
        });
    } catch (err) {
        logger.error('[supportChat] getUnreadCount error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/support/conversations/:id/status
 * Toggle conversation status (open vs resolved)
 */
exports.toggleStatus = async (req, res) => {
    try {
        const accountId = getAccountId();
        const { id } = req.params;
        const status = req.body.status || 'open';

        const result = await chatwootService.request(
            'post',
            `/api/v1/accounts/${accountId}/conversations/${id}/toggle_status`,
            { status }
        );

        supportEvents.broadcastUnreadUpdate({
            conversationId: id,
            status,
            timestamp: new Date().toISOString()
        });

        return res.status(200).json({
            success: true,
            status: result?.status || status
        });
    } catch (err) {
        logger.error(`[supportChat] toggleStatus ${req.params.id} error:`, err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/support/conversations/:id/labels
 * Update conversation labels
 */
exports.updateLabels = async (req, res) => {
    try {
        const accountId = getAccountId();
        const { id } = req.params;
        const labels = Array.isArray(req.body.labels) ? req.body.labels : [];

        const result = await chatwootService.request(
            'post',
            `/api/v1/accounts/${accountId}/conversations/${id}/labels`,
            { labels }
        );

        return res.status(200).json({
            success: true,
            labels: result?.payload || labels
        });
    } catch (err) {
        logger.error(`[supportChat] updateLabels ${req.params.id} error:`, err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * POST /api/support/actions/request-location
 * 1-click logistics action: dispatch location pin request template
 */
exports.requestLocation = async (req, res) => {
    try {
        const { trackingNumber, phone, name } = req.body;
        if (!trackingNumber) {
            return res.status(400).json({ success: false, error: 'Tracking number is required' });
        }

        const shipment = await prisma.shipment.findUnique({
            where: { trackingNumber }
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        // Generate locationToken if not present
        if (!shipment.locationToken) {
            const locationToken = crypto.randomBytes(16).toString('hex');
            await prisma.shipment.update({
                where: { id: shipment.id },
                data: {
                    locationToken,
                    locationTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
            });
            shipment.locationToken = locationToken;
        }

        await whatsappService.sendLocationRequestNotification({
            shipment,
            recipientPhone: phone || shipment.destination?.phone,
            recipientName: name || shipment.destination?.contactPerson || shipment.destination?.name
        });

        return res.status(200).json({
            success: true,
            message: 'Location request sent successfully',
            locationToken: shipment.locationToken
        });
    } catch (err) {
        logger.error('[supportChat] requestLocation error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * GET /api/support/events
 * Server-Sent Events (SSE) endpoint for real-time messages and unread badges
 */
exports.getEvents = (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    res.write('event: connected\ndata: {"status":"connected"}\n\n');

    if (req.query.testClose === 'true') {
        return res.end();
    }

    sseClients.add(res);

    const pingInterval = setInterval(() => {
        try {
            res.write(':ping\n\n');
        } catch (err) {
            clearInterval(pingInterval);
            sseClients.delete(res);
        }
    }, 20000);

    req.on('close', () => {
        clearInterval(pingInterval);
        sseClients.delete(res);
    });
};

// Test helper to reset SSE clients
exports.resetSseClients = () => {
    for (const c of sseClients) {
        try { c.end(); } catch (_) {}
    }
    sseClients.clear();
};
