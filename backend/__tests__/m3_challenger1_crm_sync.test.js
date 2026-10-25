/**
 * Empirical Adversarial Test Suite: Milestone 3 Challenger 1
 * File: backend/__tests__/m3_challenger1_crm_sync.test.js
 *
 * Adversarially challenges:
 *   1. Role Upgrade Transitions & Edge Cases:
 *      - sender -> receiver, receiver -> sender, both -> sender, both -> receiver, both -> both
 *      - null, undefined, empty strings, case variations, whitespace, and unknown roles
 *      - Contact search role attributes and redundant PUT elimination
 *   2. History Backfill Script Idempotency (3 Consecutive Runs):
 *      - Mixed initial state: fully synced local, partially synced remote (external_id / source_id / content), unsynced, missing phone
 *      - Invariant: Chatwoot message count after Run 1 == Run 2 == Run 3 (0 additional messages created)
 *   3. External ID Collision & Recovery:
 *      - Recovery when message exists remotely but local DB write failed
 *      - Error resilience on remote collision / 422
 *   4. Continuous Conversation Reopening & Label Taxonomy:
 *      - 'resolved', 'closed', 'snoozed' conversation reopening
 *      - Active shipment attribute refreshes
 *      - Label generation across operational states
 *   5. Organization Mapping Convergence:
 *      - Multiple users under same organization share exact same Chatwoot org record
 */

const axios = require('axios');
const chatwootService = require('../src/services/chatwootNotificationService');
const { backfillChatwootHistory } = require('../scripts/backfill-chatwoot-history');
const { prisma } = require('../src/config/database');

jest.mock('axios');

describe('Milestone 3 Challenger 1: Adversarial Verification Suite', () => {
    let mockContacts = [];
    let mockConversations = [];
    let mockMessages = [];
    let mockOrganizations = [];
    let mockCompanies = [];
    let putRequests = [];
    let postMessageRequests = [];

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();
        mockContacts = [];
        mockConversations = [];
        mockMessages = [];
        mockOrganizations = [];
        mockCompanies = [];
        putRequests = [];
        postMessageRequests = [];

        // Mock Chatwoot API Client
        axios.create.mockReturnValue({
            defaults: { baseURL: 'https://inbox.mawthook.io' },
            request: jest.fn().mockImplementation(async (reqConfig) => {
                const { method, url, data, params } = reqConfig;
                const m = method.toLowerCase();

                // 1. Contacts Search: GET /api/v1/accounts/1/contacts/search?q={phone}
                if (m === 'get' && url.includes('/contacts/search')) {
                    const q = params?.q;
                    if (mockContacts.some(c => c.forceFuzzySearchMatch)) {
                        return { data: { payload: mockContacts } };
                    }
                    const matched = mockContacts.filter(c => c.phone_number === q);
                    return { data: { payload: matched } };
                }

                // 2. Contact Create: POST /api/v1/accounts/1/contacts
                if (m === 'post' && url.endsWith('/contacts')) {
                    const newContact = {
                        id: mockContacts.length + 101,
                        phone_number: data.phone_number,
                        name: data.name,
                        email: data.email,
                        custom_attributes: { ...(data.custom_attributes || {}) },
                        organization_id: data.organization_id || null
                    };
                    mockContacts.push(newContact);
                    return { data: { payload: { contact: newContact } } };
                }

                // 3. Contact Update: PUT /api/v1/accounts/1/contacts/:id
                if (m === 'put' && url.includes('/contacts/')) {
                    putRequests.push({ url, data });
                    const id = parseInt(url.split('/contacts/')[1], 10);
                    const contact = mockContacts.find(c => c.id === id);
                    if (contact) {
                        contact.custom_attributes = { ...contact.custom_attributes, ...(data.custom_attributes || {}) };
                        if (data.organization_id) contact.organization_id = data.organization_id;
                    }
                    return { data: { payload: { contact } } };
                }

                // 4. Organization Create: POST /api/v1/accounts/1/organizations
                if (m === 'post' && url.includes('/organizations')) {
                    const newOrg = {
                        id: `cw_org_${mockOrganizations.length + 1}`,
                        name: data.name
                    };
                    mockOrganizations.push(newOrg);
                    return { data: newOrg };
                }

                // 4b. Company Create fallback: POST /api/v1/accounts/1/companies
                if (m === 'post' && url.includes('/companies')) {
                    const newComp = {
                        id: `cw_comp_${mockCompanies.length + 1}`,
                        name: data.name
                    };
                    mockCompanies.push(newComp);
                    return { data: newComp };
                }

                // 5. Contact Conversations: GET /api/v1/accounts/1/contacts/:id/conversations
                if (m === 'get' && url.includes('/conversations') && url.includes('/contacts/')) {
                    const contactId = parseInt(url.split('/contacts/')[1].split('/conversations')[0], 10);
                    const convs = mockConversations.filter(c => c.contact_id === contactId);
                    return { data: { payload: convs } };
                }

                // 6. Conversation Create: POST /api/v1/accounts/1/conversations
                if (m === 'post' && url.endsWith('/conversations')) {
                    const newConv = {
                        id: mockConversations.length + 501,
                        contact_id: data.contact_id,
                        inbox_id: data.inbox_id,
                        status: data.status || 'open',
                        custom_attributes: { ...(data.custom_attributes || {}) },
                        labels: []
                    };
                    mockConversations.push(newConv);
                    return { data: { payload: newConv } };
                }

                // 7. Conversation Toggle Status: POST /api/v1/accounts/1/conversations/:id/toggle_status
                if (m === 'post' && url.includes('/toggle_status')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/toggle_status')[0], 10);
                    const conv = mockConversations.find(c => c.id === convId);
                    if (conv) conv.status = data.status || 'open';
                    return { data: { payload: conv } };
                }

                // 8. Conversation Custom Attributes: POST /api/v1/accounts/1/conversations/:id/custom_attributes
                if (m === 'post' && url.includes('/custom_attributes')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/custom_attributes')[0], 10);
                    const conv = mockConversations.find(c => c.id === convId);
                    if (conv) conv.custom_attributes = { ...conv.custom_attributes, ...(data.custom_attributes || {}) };
                    return { data: { payload: conv } };
                }

                // 9. Conversation Labels: POST /api/v1/accounts/1/conversations/:id/labels
                if (m === 'post' && url.includes('/labels')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/labels')[0], 10);
                    const conv = mockConversations.find(c => c.id === convId);
                    if (conv) conv.labels = Array.from(new Set([...(conv.labels || []), ...(data.labels || [])]));
                    return { data: { payload: conv?.labels } };
                }

                // 10. Conversation Messages: GET /api/v1/accounts/1/conversations/:id/messages
                if (m === 'get' && url.includes('/messages')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/messages')[0], 10);
                    const msgs = mockMessages.filter(msg => msg.conversation_id === convId);
                    return { data: { payload: msgs } };
                }

                // 11. Conversation Send Message: POST /api/v1/accounts/1/conversations/:id/messages
                if (m === 'post' && url.includes('/messages')) {
                    postMessageRequests.push({ url, data });
                    const convId = parseInt(url.split('/conversations/')[1].split('/messages')[0], 10);

                    // If external_id already exists in mockMessages for this conversation, simulate collision
                    if (data.simulateCollisionError) {
                        const err = new Error('Unprocessable Entity: external_id has already been taken');
                        err.response = { status: 422, data: { message: 'external_id has already been taken' } };
                        throw err;
                    }

                    const newMsg = {
                        id: mockMessages.length + 9001,
                        conversation_id: convId,
                        content: data.content,
                        external_id: data.external_id,
                        source_id: data.source_id,
                        message_type: data.message_type || 'outgoing'
                    };
                    mockMessages.push(newMsg);
                    return { data: newMsg };
                }

                return { data: {} };
            })
        });
    });

    describe('1. Adversarial Role Transitions & Edge Cases', () => {
        test('1.1 Comprehensive permutation table for resolveUpgradedRole', () => {
            // Core standard transitions
            expect(chatwootService.resolveUpgradedRole('sender', 'receiver')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('receiver', 'sender')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('both', 'sender')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('both', 'receiver')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('both', 'both')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('sender', 'both')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('receiver', 'both')).toBe('both');

            // Idempotent repeats
            expect(chatwootService.resolveUpgradedRole('sender', 'sender')).toBe('sender');
            expect(chatwootService.resolveUpgradedRole('receiver', 'receiver')).toBe('receiver');

            // Case insensitivity & Whitespace trimming
            expect(chatwootService.resolveUpgradedRole(' SENDER ', ' receiver ')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('RECEIVER', 'SENDER')).toBe('both');
            expect(chatwootService.resolveUpgradedRole(' Both ', ' sender ')).toBe('both');

            // Null & undefined handling
            expect(chatwootService.resolveUpgradedRole(null, 'sender')).toBe('sender');
            expect(chatwootService.resolveUpgradedRole(undefined, 'receiver')).toBe('receiver');
            expect(chatwootService.resolveUpgradedRole('sender', null)).toBe('sender');
            expect(chatwootService.resolveUpgradedRole('receiver', undefined)).toBe('receiver');
            expect(chatwootService.resolveUpgradedRole('', 'sender')).toBe('sender');
            expect(chatwootService.resolveUpgradedRole('sender', '')).toBe('sender');
            expect(chatwootService.resolveUpgradedRole(null, null)).toBe('receiver');
            expect(chatwootService.resolveUpgradedRole(undefined, undefined)).toBe('receiver');
        });

        test('1.2 Contact upgrade from receiver to sender triggers PUT and sets role=both', async () => {
            const phone = '+96591112222';
            const context1 = { trackingNumber: 'TRG-ADV-01', shipmentId: 'sh-1', carrierCode: 'DGR' };

            // Step 1: initial receiver event
            const c1 = await chatwootService.findOrCreateContact({ role: 'receiver', phone, name: 'Alice' }, context1);
            expect(c1.custom_attributes.role).toBe('receiver');
            expect(putRequests.length).toBe(0);

            // Step 2: subsequent sender event
            const context2 = { trackingNumber: 'TRG-ADV-02', shipmentId: 'sh-2', carrierCode: 'DGR' };
            const c2 = await chatwootService.findOrCreateContact({ role: 'sender', phone, name: 'Alice' }, context2);
            expect(c2.custom_attributes.role).toBe('both');
            expect(c2.id).toBe(c1.id);
            expect(putRequests.length).toBe(1);
            expect(putRequests[0].data.custom_attributes.role).toBe('both');

            // Step 3: subsequent sender event on already upgraded contact must NOT fire PUT
            putRequests = [];
            const c3 = await chatwootService.findOrCreateContact({ role: 'sender', phone, name: 'Alice' }, context2);
            expect(c3.custom_attributes.role).toBe('both');
            expect(putRequests.length).toBe(0);

            // Step 4: subsequent receiver event on already upgraded contact must NOT fire PUT
            const c4 = await chatwootService.findOrCreateContact({ role: 'receiver', phone, name: 'Alice' }, context2);
            expect(c4.custom_attributes.role).toBe('both');
            expect(putRequests.length).toBe(0);
        });

        test('1.3 Contact upgrade from sender to receiver triggers PUT and sets role=both', async () => {
            const phone = '+96593334444';
            const context1 = { trackingNumber: 'TRG-ADV-03', shipmentId: 'sh-3', carrierCode: 'OTE' };

            const c1 = await chatwootService.findOrCreateContact({ role: 'sender', phone, name: 'Bob' }, context1);
            expect(c1.custom_attributes.role).toBe('sender');

            const c2 = await chatwootService.findOrCreateContact({ role: 'receiver', phone, name: 'Bob' }, context1);
            expect(c2.custom_attributes.role).toBe('both');
            expect(c2.id).toBe(c1.id);
            expect(putRequests.length).toBe(1);
        });

        test('1.4 Remediated: Non-standard / auth / unknown roles upgraded to valid incoming logistics roles', () => {
            // When existingRole is 'auth' (e.g. from sendDirectOtp), incoming 'sender' upgrades to 'sender'
            const roleAfterSender = chatwootService.resolveUpgradedRole('auth', 'sender');
            expect(roleAfterSender).toBe('sender');

            // When existingRole is 'unknown', incoming 'receiver' upgrades to 'receiver'
            const roleAfterReceiver = chatwootService.resolveUpgradedRole('unknown', 'receiver');
            expect(roleAfterReceiver).toBe('receiver');

            // Demonstrates that buildConversationLabels accurately reflects the hardened role
            const labelsSender = chatwootService.buildConversationLabels({
                role: roleAfterSender,
                context: { currentStatusRaw: 'in_transit' }
            });
            expect(labelsSender).toContain('sender');
        });

        test('1.5 Remediated: False-positive contact search match does not hijack existing contact via contacts[0] fallback', async () => {
            // Suppose John Doe (+96511111111) is already in Chatwoot
            const johnDoe = {
                id: 999,
                name: 'John Doe',
                phone_number: '+96511111111',
                custom_attributes: { role: 'receiver' },
                forceFuzzySearchMatch: true // Simulates Chatwoot search returning John Doe as partial match for Alice's query
            };
            mockContacts.push(johnDoe);

            // Target is a brand new customer: Alice (+96522222222)
            const aliceTarget = {
                role: 'sender',
                phone: '+96522222222',
                name: 'Alice Smith'
            };

            const resultContact = await chatwootService.findOrCreateContact(aliceTarget, { trackingNumber: 'TRG-HIJACK-01' });

            // Without the unsafe || contacts[0] fallback:
            // Since John Doe (+96511111111) does not match Alice (+96522222222),
            // a new contact must be created for Alice rather than hijacking John Doe.
            expect(resultContact.id).not.toBe(999);
            expect(resultContact.phone_number).toBe('+96522222222');
            expect(resultContact.name).toBe('Alice Smith');
            expect(resultContact.custom_attributes.role).toBe('sender');

            // Existing contact (John Doe) remains untouched
            expect(johnDoe.custom_attributes.role).toBe('receiver');
        });
    });

    describe('2. Adversarial Backfill Idempotency: 3 Consecutive Executions', () => {
        test('2.1 Simulates 3 consecutive backfill executions on mixed synced/unsynced database logs', async () => {
            // Setup 10 mock notification logs representing diverse real-world database states
            const testLogs = [
                // Log 1: Already fully synced locally
                {
                    id: 'log-01',
                    shipmentId: 'shp-01',
                    trackingNumber: 'TRG-MIX-01',
                    eventType: 'shipment_created',
                    recipientRole: 'sender',
                    recipientPhone: '+96590000001',
                    recipientName: 'Customer 1',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: 'cw_msg_existing_1',
                    chatwootConversationId: '501',
                    createdAt: new Date('2026-10-20T08:00:00Z'),
                    sentAt: new Date('2026-10-20T08:00:00Z'),
                    shipment: { id: 'shp-01', trackingNumber: 'TRG-MIX-01', status: 'created' }
                },
                // Log 2: Partially synced - already in Chatwoot via external_id, but local DB has null chatwootMessageId
                {
                    id: 'log-02',
                    shipmentId: 'shp-02',
                    trackingNumber: 'TRG-MIX-02',
                    eventType: 'out_for_delivery',
                    recipientRole: 'receiver',
                    recipientPhone: '+96590000002',
                    recipientName: 'Customer 2',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T09:00:00Z'),
                    sentAt: new Date('2026-10-20T09:00:00Z'),
                    shipment: { id: 'shp-02', trackingNumber: 'TRG-MIX-02', status: 'out_for_delivery' }
                },
                // Log 3: Partially synced - already in Chatwoot via source_id
                {
                    id: 'log-03',
                    shipmentId: 'shp-03',
                    trackingNumber: 'TRG-MIX-03',
                    eventType: 'delivered',
                    recipientRole: 'receiver',
                    recipientPhone: '+96590000003',
                    recipientName: 'Customer 3',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T10:00:00Z'),
                    sentAt: new Date('2026-10-20T10:00:00Z'),
                    shipment: { id: 'shp-03', trackingNumber: 'TRG-MIX-03', status: 'delivered' }
                },
                // Log 4: Partially synced - already in Chatwoot via content match (tracking + event)
                {
                    id: 'log-04',
                    shipmentId: 'shp-04',
                    trackingNumber: 'TRG-MIX-04',
                    eventType: 'on_hold_customs_issue',
                    recipientRole: 'receiver',
                    recipientPhone: '+96590000004',
                    recipientName: 'Customer 4',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T11:00:00Z'),
                    sentAt: new Date('2026-10-20T11:00:00Z'),
                    shipment: { id: 'shp-04', trackingNumber: 'TRG-MIX-04', status: 'exception' }
                },
                // Log 5: Unsynced fresh log (Customer 5)
                {
                    id: 'log-05',
                    shipmentId: 'shp-05',
                    trackingNumber: 'TRG-MIX-05',
                    eventType: 'pickup_scheduled',
                    recipientRole: 'sender',
                    recipientPhone: '+96590000005',
                    recipientName: 'Customer 5',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T12:00:00Z'),
                    sentAt: new Date('2026-10-20T12:00:00Z'),
                    shipment: { id: 'shp-05', trackingNumber: 'TRG-MIX-05', status: 'pickup_scheduled' }
                },
                // Log 6: Unsynced fresh log (same Customer 5, testing continuous conversation reuse during backfill)
                {
                    id: 'log-06',
                    shipmentId: 'shp-06',
                    trackingNumber: 'TRG-MIX-06',
                    eventType: 'delivered',
                    recipientRole: 'receiver',
                    recipientPhone: '+96590000005',
                    recipientName: 'Customer 5',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T13:00:00Z'),
                    sentAt: new Date('2026-10-20T13:00:00Z'),
                    shipment: { id: 'shp-06', trackingNumber: 'TRG-MIX-06', status: 'delivered' }
                },
                // Log 7: Unsynced fresh log (Customer 6)
                {
                    id: 'log-07',
                    shipmentId: 'shp-07',
                    trackingNumber: 'TRG-MIX-07',
                    eventType: 'out_for_delivery',
                    recipientRole: 'receiver',
                    recipientPhone: '+96590000007',
                    recipientName: 'Customer 6',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T14:00:00Z'),
                    sentAt: new Date('2026-10-20T14:00:00Z'),
                    shipment: { id: 'shp-07', trackingNumber: 'TRG-MIX-07', status: 'out_for_delivery' }
                },
                // Log 8: Missing phone (should be safely skipped)
                {
                    id: 'log-08',
                    shipmentId: 'shp-08',
                    trackingNumber: 'TRG-MIX-08',
                    eventType: 'out_for_delivery',
                    recipientRole: 'receiver',
                    recipientPhone: null,
                    recipientName: 'No Phone User',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T15:00:00Z'),
                    sentAt: new Date('2026-10-20T15:00:00Z'),
                    shipment: { id: 'shp-08', trackingNumber: 'TRG-MIX-08', status: 'out_for_delivery' }
                },
                // Log 9: Unsynced fresh log (Customer 7)
                {
                    id: 'log-09',
                    shipmentId: 'shp-09',
                    trackingNumber: 'TRG-MIX-09',
                    eventType: 'payment_link_ready',
                    recipientRole: 'sender',
                    recipientPhone: '+96590000009',
                    recipientName: 'Customer 7',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T16:00:00Z'),
                    sentAt: new Date('2026-10-20T16:00:00Z'),
                    shipment: { id: 'shp-09', trackingNumber: 'TRG-MIX-09', status: 'pending' }
                },
                // Log 10: Null phone (should be safely skipped)
                {
                    id: 'log-10',
                    shipmentId: 'shp-10',
                    trackingNumber: 'TRG-MIX-10',
                    eventType: 'delivered',
                    recipientRole: 'receiver',
                    recipientPhone: null,
                    recipientName: 'Another No Phone User',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T17:00:00Z'),
                    sentAt: new Date('2026-10-20T17:00:00Z'),
                    shipment: { id: 'shp-10', trackingNumber: 'TRG-MIX-10', status: 'delivered' }
                }
            ];

            // Pre-seed remote Chatwoot messages for partially synced logs 2, 3, 4
            // Log 2 pre-seeded with external_id
            mockMessages.push({
                id: 8002,
                conversation_id: 502,
                content: 'Out for delivery notification for TRG-MIX-02',
                external_id: 'log_log-02',
                source_id: 'backfill:log-02',
                message_type: 'outgoing'
            });

            // Log 3 pre-seeded with source_id
            mockMessages.push({
                id: 8003,
                conversation_id: 503,
                content: 'Delivered notification for TRG-MIX-03',
                external_id: 'other_ext_3',
                source_id: 'backfill:log-03',
                message_type: 'outgoing'
            });

            // Log 4 pre-seeded with content match
            mockMessages.push({
                id: 8004,
                conversation_id: 504,
                content: 'Customs alert: TRG-MIX-04 event on_hold_customs_issue',
                external_id: null,
                source_id: null,
                message_type: 'outgoing'
            });

            // Pre-seed matching conversations for pre-seeded messages
            mockConversations.push(
                { id: 502, contact_id: 102, inbox_id: 1, status: 'open', custom_attributes: {}, labels: [] },
                { id: 503, contact_id: 103, inbox_id: 1, status: 'open', custom_attributes: {}, labels: [] },
                { id: 504, contact_id: 104, inbox_id: 1, status: 'open', custom_attributes: {}, labels: [] }
            );

            // Pre-seed contacts for logs 2, 3, 4
            mockContacts.push(
                { id: 102, phone_number: '+96590000002', name: 'Customer 2', custom_attributes: { role: 'receiver' } },
                { id: 103, phone_number: '+96590000003', name: 'Customer 3', custom_attributes: { role: 'receiver' } },
                { id: 104, phone_number: '+96590000004', name: 'Customer 4', custom_attributes: { role: 'receiver' } }
            );

            const initialRemoteMessageCount = mockMessages.length;
            expect(initialRemoteMessageCount).toBe(3);

            // Mock Prisma operations
            jest.spyOn(prisma.shipmentNotificationLog, 'count').mockResolvedValue(testLogs.length);
            jest.spyOn(prisma.shipmentNotificationLog, 'findMany').mockResolvedValue(testLogs);
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockImplementation(async ({ where, data }) => {
                const item = testLogs.find(l => l.id === where.id);
                if (item) Object.assign(item, data);
                return item;
            });

            // ==========================================
            // EXECUTION 1: First Backfill Run
            // ==========================================
            const run1Result = await backfillChatwootHistory({ execute: true, dryRun: false });

            // In run 1:
            // Log 1: alreadySyncedLocal (1)
            // Logs 2, 3, 4: alreadySyncedRemote (3)
            // Logs 8, 10: skippedNoPhone (2)
            // Logs 5, 6, 7, 9: backfilled (4)
            expect(run1Result.alreadySyncedLocal).toBe(1);
            expect(run1Result.alreadySyncedRemote).toBe(3);
            expect(run1Result.skippedNoPhone).toBe(2);
            expect(run1Result.backfilled).toBe(4);
            expect(run1Result.errors).toBe(0);

            // Remote messages should now be: 3 initial + 4 newly backfilled = 7
            const totalMessagesAfterRun1 = mockMessages.length;
            expect(totalMessagesAfterRun1).toBe(7);

            // Verify that partially synced logs 2, 3, 4 were updated locally with their remote IDs
            const log2 = testLogs.find(l => l.id === 'log-02');
            expect(log2.chatwootMessageId).toBe('8002');
            const log3 = testLogs.find(l => l.id === 'log-03');
            expect(log3.chatwootMessageId).toBe('8003');
            const log4 = testLogs.find(l => l.id === 'log-04');
            expect(log4.chatwootMessageId).toBe('8004');

            // Verify that unsynced logs 5, 6, 7, 9 now have chatwootMessageId set
            const log5 = testLogs.find(l => l.id === 'log-05');
            expect(log5.chatwootMessageId).toBeTruthy();
            const log6 = testLogs.find(l => l.id === 'log-06');
            expect(log6.chatwootMessageId).toBeTruthy();

            // Verify continuous conversation reuse: Log 5 and Log 6 shared the same customer (+96590000005)
            // Both messages must be in the same conversation!
            expect(log5.chatwootConversationId).toBe(log6.chatwootConversationId);

            // ==========================================
            // EXECUTION 2: Second Backfill Run
            // ==========================================
            const run2Result = await backfillChatwootHistory({ execute: true, dryRun: false });

            // In run 2:
            // All 8 valid logs now have chatwootMessageId & chatwootConversationId set in DB
            expect(run2Result.alreadySyncedLocal).toBe(8);
            expect(run2Result.alreadySyncedRemote).toBe(0);
            expect(run2Result.skippedNoPhone).toBe(2);
            expect(run2Result.backfilled).toBe(0);
            expect(run2Result.errors).toBe(0);

            // STRICT IDEMPOTENCY INVARIANT: Chatwoot message count MUST NOT INCREASE!
            expect(mockMessages.length).toBe(totalMessagesAfterRun1);

            // ==========================================
            // EXECUTION 3: Third Backfill Run
            // ==========================================
            const run3Result = await backfillChatwootHistory({ execute: true, dryRun: false });

            expect(run3Result.alreadySyncedLocal).toBe(8);
            expect(run3Result.alreadySyncedRemote).toBe(0);
            expect(run3Result.skippedNoPhone).toBe(2);
            expect(run3Result.backfilled).toBe(0);
            expect(run3Result.errors).toBe(0);

            // STRICT IDEMPOTENCY INVARIANT AFTER 3 CONSECUTIVE RUNS
            expect(mockMessages.length).toBe(totalMessagesAfterRun1);
        });

        test('2.2 Remediated: Non-normalizable / Whitespace recipientPhone is cleanly skipped in backfill', async () => {
            // Setup an existing contact in Chatwoot
            const victimContact = {
                id: 199,
                phone_number: '+96591119999',
                name: 'Victim Customer',
                custom_attributes: { role: 'receiver' }
            };
            mockContacts.push(victimContact);
            mockConversations.push({
                id: 599,
                contact_id: 199,
                inbox_id: 1,
                status: 'open',
                custom_attributes: {},
                labels: []
            });

            // Log with whitespace phone
            const whitespaceLog = {
                id: 'log-whitespace-test',
                shipmentId: 'shp-ws',
                trackingNumber: 'TRG-WS-01',
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '   ',
                recipientName: 'No Real Phone',
                provider: 'SHIPMENT_WHATSAPP',
                status: 'SENT',
                chatwootMessageId: null,
                chatwootConversationId: null,
                createdAt: new Date('2026-10-23T12:00:00Z'),
                sentAt: new Date('2026-10-23T12:00:00Z'),
                shipment: { id: 'shp-ws', trackingNumber: 'TRG-WS-01', status: 'out_for_delivery' }
            };

            jest.spyOn(prisma.shipmentNotificationLog, 'count').mockResolvedValue(1);
            jest.spyOn(prisma.shipmentNotificationLog, 'findMany').mockResolvedValue([whitespaceLog]);
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockImplementation(async ({ where, data }) => {
                Object.assign(whitespaceLog, data);
                return whitespaceLog;
            });

            const initialMsgCount = mockMessages.length;
            const res = await backfillChatwootHistory({ execute: true, dryRun: false });

            // With hardened phone normalization and trimming:
            // 1. Whitespace phone is cleanly skipped
            expect(res.skippedNoPhone).toBe(1);
            // 2. Nothing is backfilled
            expect(res.backfilled).toBe(0);
            // 3. No invalid contact with null phone is created in Chatwoot
            const createdNullContact = mockContacts.find(c => c.phone_number === null);
            expect(createdNullContact).toBeUndefined();
            expect(mockMessages.length).toBe(initialMsgCount);
        });
    });

    describe('3. External ID Collision & Recovery', () => {
        test('3.1 Recovers when message already exists in Chatwoot with external_id but local DB was not updated', async () => {
            const interruptedLog = {
                id: 'log-interrupted-99',
                shipmentId: 'shp-int',
                trackingNumber: 'TRG-INT-99',
                eventType: 'verified_and_dispatched',
                recipientRole: 'receiver',
                recipientPhone: '+96598887777',
                recipientName: 'Interrupted User',
                provider: 'SHIPMENT_WHATSAPP',
                status: 'SENT',
                chatwootMessageId: null,
                chatwootConversationId: null,
                createdAt: new Date('2026-10-23T10:00:00Z'),
                sentAt: new Date('2026-10-23T10:00:00Z'),
                shipment: { id: 'shp-int', trackingNumber: 'TRG-INT-99', status: 'verified' }
            };

            // Pre-seed remote message with exact external_id: 'log_log-interrupted-99'
            mockMessages.push({
                id: 9999,
                conversation_id: 550,
                content: 'Dispatched to carrier',
                external_id: 'log_log-interrupted-99',
                source_id: 'backfill:log-interrupted-99',
                message_type: 'outgoing'
            });

            mockConversations.push({
                id: 550,
                contact_id: 150,
                inbox_id: 1,
                status: 'open',
                custom_attributes: {},
                labels: []
            });

            mockContacts.push({
                id: 150,
                phone_number: '+96598887777',
                name: 'Interrupted User',
                custom_attributes: { role: 'receiver' }
            });

            jest.spyOn(prisma.shipmentNotificationLog, 'count').mockResolvedValue(1);
            jest.spyOn(prisma.shipmentNotificationLog, 'findMany').mockResolvedValue([interruptedLog]);
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockImplementation(async ({ where, data }) => {
                Object.assign(interruptedLog, data);
                return interruptedLog;
            });

            const initialMsgCount = mockMessages.length;
            const result = await backfillChatwootHistory({ execute: true, dryRun: false });

            // Must detect as remote match and link, without creating a new message
            expect(result.alreadySyncedRemote).toBe(1);
            expect(result.backfilled).toBe(0);
            expect(mockMessages.length).toBe(initialMsgCount);
            expect(interruptedLog.chatwootMessageId).toBe('9999');
            expect(interruptedLog.chatwootConversationId).toBe('550');
        });

        test('3.2 Handles Chatwoot API error gracefully without aborting batch', async () => {
            const failingLog = {
                id: 'log-err-1',
                shipmentId: 'shp-err',
                trackingNumber: 'TRG-ERR-01',
                eventType: 'out_for_delivery',
                recipientRole: 'receiver',
                recipientPhone: '+96597771111',
                recipientName: 'Error User',
                provider: 'SHIPMENT_WHATSAPP',
                status: 'SENT',
                chatwootMessageId: null,
                chatwootConversationId: null,
                createdAt: new Date('2026-10-23T11:00:00Z'),
                sentAt: new Date('2026-10-23T11:00:00Z'),
                shipment: { id: 'shp-err', trackingNumber: 'TRG-ERR-01', status: 'out_for_delivery' }
            };

            const client = chatwootService.getClient();
            // Force sendMessage to reject with 422 collision
            jest.spyOn(chatwootService, 'sendMessage').mockRejectedValueOnce(new Error('422 Unprocessable Entity'));

            jest.spyOn(prisma.shipmentNotificationLog, 'count').mockResolvedValue(1);
            jest.spyOn(prisma.shipmentNotificationLog, 'findMany').mockResolvedValue([failingLog]);

            const result = await backfillChatwootHistory({ execute: true, dryRun: false });
            expect(result.errors).toBe(1);
            expect(result.backfilled).toBe(0);
            // Script finished safely with Exit Code 0 equivalent
        });
    });

    describe('4. Continuous Conversation Reopening & Label Taxonomy', () => {
        test('4.1 Reopens conversation from snoozed and closed states', async () => {
            const phone = '+96596660000';
            const target = { role: 'receiver', phone, name: 'Snoozed Customer' };
            const context = {
                trackingNumber: 'TRG-SNOOZE-01',
                shipmentId: 'shp-sn',
                carrierCode: 'DGR',
                currentStatusRaw: 'out_for_delivery'
            };

            const contact = await chatwootService.findOrCreateContact(target, context);
            const conv = await chatwootService.findOrCreateConversation(contact, target, context);

            // Test snoozed status reopening
            conv.status = 'snoozed';
            const reopenedFromSnooze = await chatwootService.findOrCreateConversation(contact, target, context);
            expect(reopenedFromSnooze.id).toBe(conv.id);
            expect(reopenedFromSnooze.status).toBe('open');

            // Test closed status reopening
            conv.status = 'closed';
            const reopenedFromClosed = await chatwootService.findOrCreateConversation(contact, target, context);
            expect(reopenedFromClosed.id).toBe(conv.id);
            expect(reopenedFromClosed.status).toBe('open');
        });

        test('4.2 BuildConversationLabels produces full label taxonomy across operational states', () => {
            // Out for delivery
            const l1 = chatwootService.buildConversationLabels({
                role: 'receiver',
                eventType: 'out_for_delivery',
                context: { currentStatusRaw: 'out_for_delivery' }
            });
            expect(l1).toContain('out_for_delivery');
            expect(l1).toContain('receiver');

            // Delivered
            const l2 = chatwootService.buildConversationLabels({
                role: 'sender',
                eventType: 'delivered',
                context: { currentStatusRaw: 'delivered' }
            });
            expect(l2).toContain('delivered');
            expect(l2).toContain('sender');

            // COD Due
            const l3 = chatwootService.buildConversationLabels({
                role: 'receiver',
                eventType: 'out_for_delivery',
                shipment: { codAmount: 25.5, codStatus: 'pending' },
                context: { currentStatusRaw: 'out_for_delivery' }
            });
            expect(l3).toContain('cod_due');

            // Payment Pending
            const l4 = chatwootService.buildConversationLabels({
                role: 'both',
                eventType: 'payment_link_ready',
                shipment: { remainingBalance: 12.0, paid: false },
                context: { currentStatusRaw: 'pending' }
            });
            expect(l4).toContain('payment_pending');
            expect(l4).toContain('role_both');

            // Organization Label slugification
            const l5 = chatwootService.buildConversationLabels({
                role: 'receiver',
                organization: { name: 'Al-Homaizi Food & Beverages W.L.L. (Kuwait)' },
                context: { currentStatusRaw: 'in_transit' }
            });
            expect(l5).toContain('org_al_homaizi_food_beverages_wll_kuwait');
        });
    });

    describe('5. Shared Organization Mapping in Chatwoot', () => {
        test('5.1 Multiple users of the same Target organization share one single Chatwoot organization record', async () => {
            const org = {
                id: 'org-enterprise-999',
                name: 'Sultan Center Retail Group',
                chatwootOrganizationId: null
            };

            const users = [
                { id: 'u1', name: 'Operations Staff 1', phone: '+96591000001', role: 'sender' },
                { id: 'u2', name: 'Logistics Manager 2', phone: '+96591000002', role: 'sender' },
                { id: 'u3', name: 'Finance Lead 3', phone: '+96591000003', role: 'sender' }
            ];

            const orgUpdateSpy = jest.spyOn(prisma.organization, 'update').mockImplementation(async ({ data }) => {
                org.chatwootOrganizationId = data.chatwootOrganizationId;
                return org;
            });

            for (const user of users) {
                const context = {
                    trackingNumber: `TRG-ORG-${user.id}`,
                    shipmentId: `shp-${user.id}`,
                    carrierCode: 'DGR',
                    organization: org
                };
                const contact = await chatwootService.findOrCreateContact(user, context);
                expect(contact.custom_attributes.organization_id).toBe(org.chatwootOrganizationId);
            }

            // Exactly ONE organization record must be created in Chatwoot across all 3 users
            expect(mockOrganizations.length).toBe(1);
            expect(mockOrganizations[0].name).toBe('Sultan Center Retail Group');
            expect(org.chatwootOrganizationId).toBe(mockOrganizations[0].id);

            orgUpdateSpy.mockRestore();
        });
    });
});
