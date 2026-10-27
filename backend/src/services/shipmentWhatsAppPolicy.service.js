const { normalizeStatus, isTerminalStatus } = require('../constants/statusConstants');
const crypto = require('crypto');

const TERMINAL_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'returned']);

const MANUAL_ACTIONS = Object.freeze({
    shipment_confirmation_2: { eventTypes: ['shipment_created', 'shipment_created_backfill'], roles: ['sender'] },
    payment_request_v1: { eventTypes: ['payment_link_ready'], roles: ['sender', 'receiver'] },
    location_request_v1: { eventTypes: ['location_request'], roles: ['receiver'] },
    return_portal_v1: { eventTypes: ['return_portal'], roles: ['receiver'] },
    customer_inquiry_start: { eventTypes: ['customer_engagement'], roles: ['receiver'] },
    otptargetlogin: { eventTypes: ['auth_otp'], roles: ['receiver'] }
});

function terminalStatus(shipment) {
    const status = normalizeStatus(shipment?.status);
    return TERMINAL_STATUSES.has(status) || isTerminalStatus(status) ? status : null;
}

function terminalBlock(shipment) {
    const status = terminalStatus(shipment);
    return status ? {
        code: 'SHIPMENT_TERMINAL',
        status,
        message: `Shipment is ${status}; WhatsApp dispatch is blocked`
    } : null;
}

function validateManualAction({ eventType, templateName, recipientRole }) {
    const action = MANUAL_ACTIONS[templateName];
    if (!action || !action.eventTypes.includes(eventType) || !action.roles.includes(recipientRole)) {
        return {
            code: 'UNAPPROVED_MANUAL_ACTION',
            message: 'The event, approved template, and recipient role do not match an allowed manual shipment action'
        };
    }
    return null;
}

function isProviderAccepted(status) {
    return ['submitted', 'sent', 'delivered', 'read'].includes(String(status || '').toLowerCase());
}

function isInFlight(status) {
    return ['queued', 'pending', 'processing'].includes(String(status || '').toLowerCase());
}

function buildDispatchKey({ shipment, eventType, templateName, recipientRole, recipientPhone }) {
    if (!shipment?.id || !eventType || !templateName || !recipientRole || !recipientPhone || eventType === 'auth_otp') return null;
    const recipient = String(recipientPhone).replace(/\D/g, '');
    if (!recipient) return null;
    const normalizedRole = ['sender', 'shipper', 'merchant'].includes(String(recipientRole).toLowerCase()) ? 'sender' : 'receiver';
    const identity = ['shipment-whatsapp-v1', shipment.id, eventType, templateName, normalizedRole, recipient].join('|');
    return crypto.createHash('sha256').update(identity).digest('hex');
}

async function recordSkippedAttempt({ shipment, eventType, templateName, recipientRole, recipientName = null, recipientPhone = null, reason }) {
    if (!shipment?.id || !shipment?.trackingNumber) return null;
    const { prisma } = require('../config/database');
    const phoneDigits = String(recipientPhone || '').replace(/\D/g, '');
    const maskedPhone = phoneDigits ? `${'*'.repeat(Math.max(0, phoneDigits.length - 4))}${phoneDigits.slice(-4)}` : null;
    const errorMessage = typeof reason === 'string' ? reason : reason?.code || reason?.message || 'DISPATCH_BLOCKED';
    return prisma.shipmentNotificationLog.create({
        data: {
            shipmentId: shipment.id,
            trackingNumber: shipment.trackingNumber,
            eventType,
            recipientRole,
            recipientName,
            recipientPhone: maskedPhone,
            provider: 'chatwoot',
            templateName,
            status: 'SKIPPED',
            errorMessage
        }
    });
}

module.exports = {
    MANUAL_ACTIONS,
    terminalStatus,
    terminalBlock,
    validateManualAction,
    isProviderAccepted,
    isInFlight,
    buildDispatchKey,
    recordSkippedAttempt
};
