const { prisma } = require('../config/database');
const whatsappService = require('../services/whatsappIntegration.service');
const chatwootNotificationService = require('../services/chatwootNotificationService');
const whatsAppConfigService = require('../services/whatsAppConfig.service');
const { canAccessShipment } = require('../middleware/authorize.middleware');
const logger = require('../utils/logger');

/**
 * GET /api/admin/whatsapp/logs
 * Query paginated WhatsApp notification history for admin audit center
 */
async function getNotificationLogs(req, res) {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
        const skip = (page - 1) * limit;

        const { search, status, templateName, provider, role, dateRange } = req.query;

        const where = {};

        // Status Filter
        if (status && status !== 'ALL') {
            const s = status.toUpperCase();
            if (s === 'SENT') {
                where.status = { in: ['SENT', 'sent', 'submitted'] };
            } else if (s === 'DELIVERED') {
                where.status = { in: ['DELIVERED', 'delivered'] };
            } else if (s === 'READ') {
                where.status = { in: ['READ', 'read'] };
            } else if (s === 'FAILED') {
                where.status = { in: ['FAILED', 'failed'] };
            } else if (s === 'QUEUED') {
                where.status = { in: ['QUEUED', 'queued'] };
            } else if (s === 'PENDING') {
                where.status = { in: ['PENDING', 'pending'] };
            } else {
                where.status = status;
            }
        }

        // Provider Filter
        if (provider && provider !== 'ALL') {
            const p = provider.toUpperCase();
            if (p === 'SHIPMENT_WHATSAPP' || p === 'TARGET_MSG') {
                where.provider = { in: ['SHIPMENT_WHATSAPP', 'TARGET_MSG'] };
            } else if (p === 'META') {
                where.provider = 'META';
            } else if (p === 'CHATWOOT') {
                where.provider = 'chatwoot';
            } else {
                where.provider = provider;
            }
        }

        // Recipient Role Filter
        if (role && role !== 'ALL') {
            const isSender = role.toUpperCase() === 'SENDER';
            where.recipientRole = isSender 
                ? { in: ['sender', 'shipper', 'merchant'] }
                : { in: ['receiver', 'customer', 'consignee'] };
        }

        // Date Range Filter
        if (dateRange && dateRange !== 'ALL') {
            const now = new Date();
            if (dateRange === 'TODAY') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                where.createdAt = { gte: today };
            } else if (dateRange === '24H') {
                const d24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
                where.createdAt = { gte: d24 };
            } else if (dateRange === '7D') {
                const d7 = new Date();
                d7.setDate(d7.getDate() - 7);
                where.createdAt = { gte: d7 };
            } else if (dateRange === '30D') {
                const d30 = new Date();
                d30.setDate(d30.getDate() - 30);
                where.createdAt = { gte: d30 };
            }
        }

        // Template Filter
        if (templateName && templateName !== 'ALL') {
            where.templateName = templateName;
        }

        // Search Filter (Fixed: removed non-existent externalMessageId field)
        if (search) {
            const cleanSearch = search.trim();
            where.OR = [
                { trackingNumber: { contains: cleanSearch } },
                { recipientPhone: { contains: cleanSearch } },
                { recipientName: { contains: cleanSearch } },
                { chatwootMessageId: { contains: cleanSearch } },
                { templateName: { contains: cleanSearch } }
            ];
        }

        const [total, logs] = await Promise.all([
            prisma.shipmentNotificationLog.count({ where }),
            prisma.shipmentNotificationLog.findMany({
                where,
                include: {
                    shipment: {
                        select: {
                            id: true,
                            trackingNumber: true,
                            carrierCode: true,
                            carrierShipmentId: true,
                            dhlTrackingNumber: true,
                            status: true,
                            origin: true,
                            destination: true,
                            documents: true,
                            createdAt: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            })
        ]);

        // Aggregate statistics for header summary KPI cards
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [
            totalLogs,
            sentToday,
            sentLast24h,
            totalDispatched,
            totalDelivered,
            totalRead,
            totalFailed,
            totalQueued
        ] = await Promise.all([
            prisma.shipmentNotificationLog.count(),
            prisma.shipmentNotificationLog.count({
                where: {
                    createdAt: { gte: todayStart },
                    status: { in: ['SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'submitted'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    createdAt: { gte: last24h },
                    status: { in: ['SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'submitted'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'submitted'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['DELIVERED', 'delivered', 'READ', 'read'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['READ', 'read'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['FAILED', 'failed'] }
                }
            }),
            prisma.shipmentNotificationLog.count({
                where: {
                    status: { in: ['PENDING', 'pending', 'queued', 'QUEUED'] }
                }
            })
        ]);

        const totalAttempts = totalDispatched + totalFailed;
        const deliveryRate = totalAttempts > 0 ? Math.round((totalDelivered / totalAttempts) * 100) : null;

        return res.json({
            success: true,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            },
            stats: {
                totalLogs,
                totalDispatched,
                sentToday,
                sentLast24h,
                totalDelivered,
                totalRead,
                totalFailed,
                totalQueued,
                deliveryRate
            },
            logs
        });
    } catch (err) {
        logger.error(`[Admin WhatsApp Logs Error] ${err.message}`);
        return res.status(500).json({ error: 'Failed to retrieve notification logs: ' + err.message });
    }
}

/**
 * POST /api/admin/whatsapp/resend/:id
 * Resend a failed or missing notification log entry
 */
async function resendNotification(req, res) {
    try {
        const { id } = req.params;
        const existing = await prisma.shipmentNotificationLog.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Notification log entry not found' });
        }

        const isSender = ['sender', 'shipper', 'merchant'].includes((existing.recipientRole || '').toLowerCase());
        const roleGroup = isSender ? ['sender', 'shipper', 'merchant'] : ['receiver', 'customer', 'consignee'];
        const blockingStatuses = ['submitted', 'SUBMITTED', 'SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'QUEUED', 'queued', 'PENDING', 'pending', 'PROCESSING', 'processing'];
        const anyBlocked = await prisma.shipmentNotificationLog.findFirst({
            where: {
                trackingNumber: existing.trackingNumber,
                recipientRole: { in: roleGroup },
                templateName: existing.templateName,
                status: { in: blockingStatuses }
            }
        });

        if (anyBlocked) {
            const accepted = ['submitted', 'sent', 'delivered', 'read'].includes(String(anyBlocked.status || '').toLowerCase());
            await require('../services/shipmentWhatsAppPolicy.service').recordSkippedAttempt({
                shipment: { id: existing.shipmentId, trackingNumber: existing.trackingNumber },
                eventType: existing.eventType,
                templateName: existing.templateName,
                recipientRole: existing.recipientRole,
                recipientName: existing.recipientName,
                recipientPhone: existing.recipientPhone,
                reason: accepted ? 'DUPLICATE_ALREADY_SUBMITTED' : 'DISPATCH_ALREADY_IN_FLIGHT'
            });
            return res.status(409).json({
                success: false,
                code: accepted ? 'DUPLICATE_ALREADY_SUBMITTED' : 'DISPATCH_ALREADY_IN_FLIGHT',
                error: accepted
                    ? `This approved message was already accepted for shipment ${existing.trackingNumber}. Resend is blocked to prevent duplicates.`
                    : 'This approved message already has an active queued or pending attempt.',
                alreadySent: accepted
            });
        }

        const shipment = await prisma.shipment.findFirst({
            where: { trackingNumber: existing.trackingNumber }
        });

        if (!shipment) {
            return res.status(404).json({ error: 'Associated shipment not found' });
        }

        const terminalBlock = require('../services/shipmentWhatsAppPolicy.service').terminalBlock(shipment);
        if (terminalBlock) {
            await prisma.shipmentNotificationLog.create({
                data: {
                    shipmentId: shipment.id,
                    trackingNumber: shipment.trackingNumber,
                    eventType: existing.eventType,
                    recipientRole: existing.recipientRole,
                    recipientName: existing.recipientName,
                    recipientPhone: existing.recipientPhone,
                    provider: 'chatwoot',
                    templateName: existing.templateName,
                    status: 'SKIPPED',
                    errorMessage: `${terminalBlock.code}:${terminalBlock.status}`
                }
            });
            return res.status(409).json({ success: false, code: terminalBlock.code, error: terminalBlock.message });
        }

        const role = String(existing.recipientRole || '').toLowerCase();
        let result;
        if (['sender', 'shipper', 'merchant'].includes(role) && chatwootNotificationService.isShipmentConfirmationEvent(existing.eventType)) {
            result = await chatwootNotificationService.sendShipmentNotification(existing.eventType, shipment, {
                recipientRole: 'sender',
                templateName: 'shipment_confirmation_2',
                manualDispatch: true,
                disableProviderFallback: true,
                existingLogId: existing.id
            });
        } else {
            const recipientPhone = ['sender', 'shipper', 'merchant'].includes(role)
                ? (shipment.origin?.phone || shipment.shipperPhone || shipment.customerPhone)
                : role === 'driver'
                    ? shipment.driverPhone
                    : (shipment.destination?.phone || shipment.receiverPhone || shipment.consigneePhone);
            if (!recipientPhone) {
                return res.status(400).json({ error: 'Recipient phone cannot be resolved from the shipment' });
            }
            result = await whatsappService.sendNotification({
                shipment,
                recipientRole: ['shipper', 'merchant'].includes(role) ? 'sender' : existing.recipientRole,
                recipientPhone,
                recipientName: ['sender', 'shipper', 'merchant'].includes(role)
                    ? (shipment.origin?.contactPerson || shipment.origin?.name || shipment.senderName)
                    : (shipment.destination?.contactPerson || shipment.destination?.name || shipment.customerName),
                eventType: existing.eventType,
                templateName: existing.templateName,
                force: false,
                manualDispatch: true,
                existingLogId: existing.id
            });
        }

        const outcome = result?.status || result?.results?.[0]?.status;
        const normalizedOutcome = String(outcome || '').toLowerCase();
        const accepted = ['submitted', 'sent', 'delivered', 'read'].includes(normalizedOutcome);
        const queued = normalizedOutcome === 'queued';
        const skipped = result?.skipped || normalizedOutcome === 'skipped';
        return res.status(accepted || queued ? 200 : skipped ? 409 : 502).json({
            success: accepted || queued,
            code: accepted || queued ? undefined : result?.reason || result?.results?.[0]?.reason || 'DISPATCH_FAILED',
            error: accepted || queued ? undefined : result?.message || result?.results?.[0]?.error || result?.results?.[0]?.reason || result?.reason || 'Chatwoot did not accept the notification',
            result
        });
    } catch (err) {
        logger.error(`[Admin WhatsApp Resend Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/shipments/:trackingNumber/whatsapp/send
 * Trigger WhatsApp update directly from Shipment Details page
 */
async function sendShipmentWhatsApp(req, res) {
    try {
        const { trackingNumber } = req.params;
        const { recipientRole = 'sender', recipientPhone, recipientName, eventType = 'shipment_created', templateName = 'shipment_confirmation_2', customMessage, force } = req.body;

        const shipment = await prisma.shipment.findFirst({
            where: { trackingNumber }
        });

        if (!shipment) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        if (!canAccessShipment(req, shipment)) {
            return res.status(403).json({ error: 'Permission denied' });
        }

        if (recipientPhone || recipientName || customMessage || force) {
            return res.status(400).json({ success: false, code: 'UNTRUSTED_DISPATCH_OVERRIDE', error: 'Manual shipment dispatch uses the current shipment party details and the approved template; caller overrides are disabled.' });
        }

        let targetPhone = recipientPhone;
        let targetCountryCode = null;

        const effectiveRole = recipientRole;
        if (!['sender', 'receiver'].includes(effectiveRole)) {
            return res.status(400).json({ error: 'Invalid recipient role' });
        }

        if (effectiveRole === 'sender') {
            targetPhone = targetPhone || shipment.origin?.phone || shipment.shipperPhone || shipment.customerPhone;
            targetCountryCode = shipment.origin?.phoneCountryCode || shipment.shipperPhoneCountryCode;
        } else if (effectiveRole === 'driver') {
            targetPhone = targetPhone || shipment.driverPhone;
            targetCountryCode = shipment.driverPhoneCountryCode;
        } else {
            // Customer / Receiver
            targetPhone = targetPhone || shipment.destination?.phone || shipment.receiverPhone || shipment.consigneePhone;
            targetCountryCode = shipment.destination?.phoneCountryCode || shipment.receiverPhoneCountryCode || shipment.consigneePhoneCountryCode;
        }

        if (!targetPhone) {
            await require('../services/shipmentWhatsAppPolicy.service').recordSkippedAttempt({
                shipment,
                eventType,
                templateName,
                recipientRole: effectiveRole,
                recipientName: effectiveRole === 'sender'
                    ? (shipment.origin?.contactPerson || shipment.origin?.name || shipment.senderName)
                    : (shipment.destination?.contactPerson || shipment.destination?.name || shipment.customerName),
                reason: 'MISSING_RECIPIENT_PHONE'
            });
            return res.status(409).json({ success: false, code: 'MISSING_RECIPIENT_PHONE', error: 'Recipient phone number is missing from the shipment record' });
        }

        const requestedEvent = eventType;
        if (effectiveRole === 'sender' && chatwootNotificationService.isShipmentConfirmationEvent(requestedEvent)) {
            if (requestedEvent !== 'shipment_created' || templateName !== 'shipment_confirmation_2') {
                return res.status(400).json({ error: 'Shipment confirmations use the approved shipper template and shipment phone' });
            }
            const result = await chatwootNotificationService.sendShipmentNotification(requestedEvent, shipment, {
                recipientRole: 'sender',
                templateName: 'shipment_confirmation_2',
                manualDispatch: true,
                disableProviderFallback: true,
            });
            const outcome = result?.results?.[0]?.status;
            const accepted = ['submitted', 'sent', 'delivered', 'read'].includes(String(outcome || '').toLowerCase());
            const skipped = result?.skipped || String(outcome || '').toLowerCase() === 'skipped';
            return res.status(accepted ? 200 : skipped ? 409 : 502).json({ success: accepted, code: accepted ? undefined : result?.reason || 'DISPATCH_FAILED', error: accepted ? undefined : result?.results?.[0]?.error || result?.results?.[0]?.reason || result?.reason || 'Chatwoot did not accept the shipment message', result });
        }

        const result = await whatsappService.sendNotification({
            shipment,
            recipientRole: effectiveRole,
            recipientPhone: targetPhone,
            recipientCountryCode: targetCountryCode,
            recipientName: effectiveRole === 'sender' ? (shipment.origin?.contactPerson || shipment.origin?.name) : (shipment.destination?.contactPerson || shipment.destination?.name || shipment.customerName),
            eventType: requestedEvent,
            templateName,
            manualDispatch: true,
            force: false
        });
        const accepted = ['submitted', 'sent', 'delivered', 'read'].includes(String(result?.status || '').toLowerCase());
        const queued = String(result?.status || '').toLowerCase() === 'queued';
        const skipped = String(result?.status || '').toLowerCase() === 'skipped';
        return res.status(accepted || queued ? 200 : skipped ? 409 : 502).json({ success: accepted || queued, code: accepted || queued ? undefined : result?.reason || 'DISPATCH_FAILED', error: accepted || queued ? undefined : result?.message || result?.reason || 'Chatwoot did not accept the shipment message', result });
    } catch (err) {
        logger.error(`[Shipment WhatsApp Send Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/whatsapp/templates
 * Retrieve available message templates from Meta WABA
 */
async function getMetaTemplates(req, res) {
    try {
        const templates = await whatsappService.getMetaTemplates();
        return res.json({ success: true, data: templates });
    } catch (err) {
        logger.error(`[WhatsApp Get Templates Controller Error] ${err.message}`);
        return res.status(500).json({ success: false, error: 'Failed to retrieve WhatsApp templates' });
    }
}

/**
 * POST /api/admin/whatsapp/sync-telemetry
 * Pull recent delivery lifecycle telemetry (sent, delivered, read) from msg.target-kw.com
 * and sync them into Prisma shipmentNotificationLog records.
 */
async function syncMicroserviceTelemetry(req, res) {
    try {
        const { getSystemSettings } = require('../services/systemSettings.service');
        const axios = require('axios');
        const settings = getSystemSettings()?.whatsapp || {};
        const serviceUrl = String(settings.serviceUrl || 'https://msg.target-kw.com').replace(/\/+$/, '');
        const adminToken = process.env.ADMIN_TOKEN || 'target-admin-secret-token-2026';

        let microMessages = [];
        try {
            const resp = await axios.get(`${serviceUrl}/api/stats/messages`, {
                params: { limit: 500 },
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'x-admin-token': adminToken
                },
                timeout: 8000
            });
            microMessages = resp.data?.messages || [];
        } catch (fetchErr) {
            logger.warn(`[Sync Telemetry] Could not fetch messages from microservice: ${fetchErr.message}`);
            return res.status(502).json({ error: `Could not reach WhatsApp microservice: ${fetchErr.message}` });
        }

        let updatedCount = 0;
        for (const msg of microMessages) {
            if (!msg.wamid) continue;

            const targetLog = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    OR: [
                        { chatwootMessageId: msg.wamid },
                        { chatwootMessageId: msg.id }
                    ]
                }
            });

            if (!targetLog) continue;

            const microStatus = String(msg.status || '').toUpperCase();
            const currentStatus = String(targetLog.status || '').toUpperCase();

            // Status precedence: READ (3) > DELIVERED (2) > SENT (1)
            const rank = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 2 };
            const newRank = rank[microStatus] || 1;
            const curRank = rank[currentStatus] || 1;

            const existingResp = (targetLog.responseJson && typeof targetLog.responseJson === 'object') ? targetLog.responseJson : {};
            let changed = false;
            const updatedResp = { ...existingResp };

            if (msg.deliveredAt && !updatedResp.deliveredAt) {
                updatedResp.deliveredAt = new Date(msg.deliveredAt).toISOString();
                changed = true;
            }
            if (msg.readAt && !updatedResp.readAt) {
                updatedResp.readAt = new Date(msg.readAt).toISOString();
                if (!updatedResp.deliveredAt) updatedResp.deliveredAt = updatedResp.readAt;
                changed = true;
            }

            let nextStatus = currentStatus;
            if (newRank > curRank) {
                nextStatus = microStatus;
                changed = true;
            }

            if (changed) {
                await prisma.shipmentNotificationLog.update({
                    where: { id: targetLog.id },
                    data: {
                        status: nextStatus,
                        responseJson: updatedResp
                    }
                });
                updatedCount++;
            }
        }

        return res.json({
            success: true,
            totalFromMicroservice: microMessages.length,
            updatedCount,
            message: `Successfully synchronized telemetry: ${updatedCount} records updated.`
        });
    } catch (err) {
        logger.error(`[Sync Microservice Telemetry Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/admin/whatsapp/dispatch-queued
 * Safely batch-dispatches all pending/queued notifications with strict deduplication guards.
 */
async function dispatchQueuedNotifications(req, res) {
    try {
        const limit = Math.min(300, Math.max(1, parseInt(req.body?.limit || '200', 10)));
        const queuedLogs = await prisma.shipmentNotificationLog.findMany({
            where: {
                status: { in: ['QUEUED', 'queued', 'pending', 'PENDING'] }
            },
            include: {
                shipment: true
            },
            take: limit,
            orderBy: { createdAt: 'asc' }
        });

        if (queuedLogs.length === 0) {
            return res.json({
                success: true,
                message: 'No queued notifications found.',
                totalQueued: 0,
                dispatched: 0,
                skipped: 0,
                failed: 0
            });
        }

        let dispatched = 0;
        let skipped = 0;
        let failed = 0;
        let queued = 0;
        const allowedRetryTemplates = ['payment_request_v1', 'location_request_v1', 'return_portal_v1', 'customer_inquiry_start'];
        const policy = require('../services/shipmentWhatsAppPolicy.service');

        for (const log of queuedLogs) {
            const shipment = log.shipment || await prisma.shipment.findFirst({
                where: { trackingNumber: log.trackingNumber }
            });

            if (!shipment) {
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: { status: 'FAILED', errorMessage: 'Associated shipment record missing' }
                });
                failed++;
                continue;
            }

            const lifecycle = chatwootNotificationService.isShipmentConfirmationEvent(log.eventType);
            const recipientRole = ['sender', 'shipper', 'merchant'].includes(String(log.recipientRole || '').toLowerCase()) ? 'sender' : 'receiver';
            const terminalBlock = policy.terminalBlock(shipment);
            const actionBlock = policy.validateManualAction({ eventType: log.eventType, templateName: log.templateName, recipientRole });
            const block = lifecycle
                ? { code: 'AUTOMATIC_SHIPMENT_MESSAGES_DISABLED' }
                : terminalBlock || actionBlock || (!allowedRetryTemplates.includes(log.templateName) ? { code: 'UNAPPROVED_QUEUED_SHIPMENT_ACTION' } : null);
            if (block) {
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: { status: 'SKIPPED', errorMessage: `${block.code}${block.status ? `:${block.status}` : ''}` }
                });
                skipped++;
                continue;
            }

            const target = chatwootNotificationService.getNotificationTargets(log.eventType, shipment, recipientRole)[0];
            if (!target?.phone) {
                await prisma.shipmentNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', errorMessage: 'MISSING_RECIPIENT_PHONE' } });
                skipped++;
                continue;
            }

            const activeStatuses = ['submitted', 'SUBMITTED', 'SENT', 'sent', 'DELIVERED', 'delivered', 'READ', 'read', 'QUEUED', 'queued', 'PENDING', 'pending', 'PROCESSING', 'processing'];
            const duplicate = await prisma.shipmentNotificationLog.findFirst({
                where: {
                    shipmentId: shipment.id,
                    eventType: log.eventType,
                    templateName: log.templateName,
                    recipientRole: { in: recipientRole === 'sender' ? ['sender', 'shipper', 'merchant'] : ['receiver', 'consignee', 'customer'] },
                    status: { in: activeStatuses },
                    id: { not: log.id }
                }
            });
            if (duplicate) {
                const wasAccepted = policy.isProviderAccepted(duplicate.status);
                await prisma.shipmentNotificationLog.update({
                    where: { id: log.id },
                    data: { status: 'SKIPPED', errorMessage: wasAccepted ? 'DUPLICATE_ALREADY_SUBMITTED' : 'DISPATCH_ALREADY_IN_FLIGHT' }
                });
                skipped++;
                continue;
            }

            try {
                const result = await whatsappService.sendNotification({
                    shipment,
                    recipientRole,
                    recipientPhone: target.phone,
                    recipientName: target.name,
                    eventType: log.eventType,
                    templateName: log.templateName,
                    force: false,
                    manualDispatch: true,
                    existingLogId: log.id,
                    provider: 'chatwoot'
                });
                const sendStatus = String(result?.status || '').toLowerCase();
                if (['submitted', 'sent', 'delivered', 'read'].includes(sendStatus)) {
                    dispatched++;
                } else if (sendStatus === 'queued') {
                    queued++;
                } else {
                    skipped++;
                }
            } catch (dispatchErr) {
                logger.warn(`[Batch Dispatch] Failed for ${log.trackingNumber} (${log.recipientRole}): ${dispatchErr.message}`);
                failed++;
            }

            // Throttle 200ms between sends to protect Meta API rate limits
            await new Promise(r => setTimeout(r, 200));
        }

        return res.json({
            success: true,
            totalQueued: queuedLogs.length,
            dispatched,
            skipped,
            failed,
            queued,
            message: `Batch processed: ${dispatched} accepted, ${queued} queued, ${skipped} skipped, ${failed} failed.`
        });
    } catch (err) {
        logger.error(`[Dispatch Queued Error] ${err.message}`);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/settings/whatsapp
 * Admin-only: retrieve WhatsApp configuration with masked secrets and event rules
 */
async function getWhatsAppConfig(req, res) {
    try {
        const config = await whatsAppConfigService.getConfig({ internal: false });
        const rules = await whatsAppConfigService.getRules();
        return res.json({
            success: true,
            config,
            rules
        });
    } catch (err) {
        logger.error(`[getWhatsAppConfig Error] ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * PUT /api/settings/whatsapp
 * Admin-only: update WhatsApp configuration and rules, preserving existing secrets
 */
async function updateWhatsAppConfig(req, res) {
    try {
        const { config, rules } = req.body || {};
        let updatedConfig = null;
        let updatedRules = null;

        if (config && typeof config === 'object') {
            updatedConfig = await whatsAppConfigService.updateConfig(config);
        } else {
            updatedConfig = await whatsAppConfigService.getConfig({ internal: false });
        }

        if (rules && Array.isArray(rules)) {
            updatedRules = await whatsAppConfigService.updateRules(rules);
        } else {
            updatedRules = await whatsAppConfigService.getRules();
        }

        return res.json({
            success: true,
            config: updatedConfig,
            rules: updatedRules
        });
    } catch (err) {
        logger.error(`[updateWhatsAppConfig Error] ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * POST /api/shipments/:trackingNumber/whatsapp/payment-link
 * Staff/Admin: trigger manual payment link notice via WhatsApp with custom checkout URL
 */
async function sendManualPaymentLinkNotice(req, res) {
    try {
        const { trackingNumber } = req.params;
        const { customPaymentUrl, paymentUrl, amount, recipientRole = 'sender', recipientPhone, currency = 'KWD' } = req.body || {};

        const effectivePaymentUrl = customPaymentUrl || paymentUrl;

        if (!effectivePaymentUrl || typeof effectivePaymentUrl !== 'string') {
            return res.status(400).json({ success: false, error: 'Payment URL is required' });
        }

        const trimmedUrl = effectivePaymentUrl.trim();
        if (!trimmedUrl) {
            return res.status(400).json({ success: false, error: 'Payment URL cannot be empty' });
        }

        if (trimmedUrl.includes('\r') || trimmedUrl.includes('\n')) {
            return res.status(400).json({ success: false, error: 'CRLF injection rejected' });
        }

        try {
            const parsed = new URL(trimmedUrl);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                return res.status(400).json({ success: false, error: 'Payment URL must use secure HTTP or HTTPS protocol' });
            }
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid URL format' });
        }

        let effectiveAmount = amount;
        if (effectiveAmount !== undefined && effectiveAmount !== null && effectiveAmount !== '') {
            const n = Number(effectiveAmount);
            if (!Number.isFinite(n) || n <= 0) {
                return res.status(400).json({ success: false, error: 'Amount must be greater than zero' });
            }
            effectiveAmount = n.toFixed(3);
        }

        const shipment = await prisma.shipment.findFirst({
            where: {
                OR: [
                    { trackingNumber },
                    { id: trackingNumber }
                ]
            }
        });

        if (!shipment) {
            return res.status(404).json({ success: false, error: 'Shipment not found' });
        }

        if (!canAccessShipment(req, shipment)) return res.status(403).json({ success: false, error: 'Permission denied' });
        if (recipientPhone) return res.status(400).json({ success: false, code: 'UNTRUSTED_DISPATCH_OVERRIDE', error: 'Payment notices use the current shipment party phone; caller phone overrides are disabled.' });
        if (!['sender', 'shipper', 'receiver', 'consignee', 'customer'].includes(String(recipientRole).toLowerCase())) {
            return res.status(400).json({ success: false, error: 'Invalid recipient role' });
        }

        const role = ['sender', 'shipper'].includes(String(recipientRole).toLowerCase()) ? 'sender' : 'receiver';
        const finalAmount = effectiveAmount || Number(shipment.remainingBalance || shipment.price || 0).toFixed(3);

        const result = await whatsappService.sendPaymentLinkNotification({
            shipment,
            recipientRole: role,
            recipientPhone: null,
            paymentLink: trimmedUrl,
            amount: finalAmount,
            currency: shipment.currency || currency
        });

        const accepted = ['submitted', 'sent', 'delivered', 'read'].includes(String(result?.status || '').toLowerCase());
        const queued = String(result?.status || '').toLowerCase() === 'queued';
        const skipped = String(result?.status || '').toLowerCase() === 'skipped';
        return res.status(accepted || queued ? 200 : skipped ? 409 : 502).json({
            success: accepted || queued,
            code: accepted || queued ? undefined : result?.reason || 'DISPATCH_FAILED',
            message: accepted ? 'Payment link notification accepted by Chatwoot' : queued ? 'Payment link notification queued' : result?.message || result?.reason || 'Payment link notification was not accepted',
            data: result
        });
    } catch (err) {
        logger.error(`[sendManualPaymentLinkNotice Error] ${err.message}`);
        return res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = {
    getNotificationLogs,
    resendNotification,
    sendShipmentWhatsApp,
    getMetaTemplates,
    syncMicroserviceTelemetry,
    dispatchQueuedNotifications,
    getWhatsAppConfig,
    updateWhatsAppConfig,
    sendManualPaymentLinkNotice
};
