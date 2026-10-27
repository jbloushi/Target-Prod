/**
 * Test Suite: Chatwoot CRM Synchronization & History Backfill Parity
 * File: backend/__tests__/chatwootCrmSync.test.js
 *
 * Verifies all 4 CRM Sync Acceptance Criteria (ORIGINAL_REQUEST.md & DISPATCH.md):
 *   Criterion 1: A phone number first seen as receiver, then as sender, ends with contact role both.
 *   Criterion 2: Two users of the same Target organization map to the same Chatwoot organization record.
 *   Criterion 3: Repeat events for the same phone reuse one conversation and update its active-shipment attributes and labels.
 *   Criterion 4: Running the history backfill twice gives the same Chatwoot message count as running it once.
 */

const axios = require('axios');
const chatwootService = require('../src/services/chatwootNotificationService');
const { backfillChatwootHistory, parseCliArgs } = require('../scripts/backfill-chatwoot-history');
const { prisma } = require('../src/config/database');

jest.mock('axios');

describe('Milestone 3: Chatwoot CRM Sync & History Backfill Suite', () => {
    let mockContacts = [];
    let mockConversations = [];
    let mockMessages = [];
    let mockOrganizations = [];
    let mockCompanies = [];

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();
        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        mockContacts = [];
        mockConversations = [];
        mockMessages = [];
        mockOrganizations = [];
        mockCompanies = [];

        // Setup mock axios adapter simulating Chatwoot API v1
        axios.create.mockReturnValue({
            defaults: { baseURL: 'https://inbox.mawthook.io' },
            request: jest.fn().mockImplementation(async (config) => {
                const { method, url, data, params } = config;
                const m = method.toLowerCase();

                // 1. Contacts Search: GET /api/v1/accounts/1/contacts/search?q={phone}
                if (m === 'get' && url.includes('/contacts/search')) {
                    const q = params?.q;
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
                    const convId = parseInt(url.split('/conversations/')[1].split('/messages')[0], 10);
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

    describe('Criterion 1: Contact Role Lifecycle & Automatic Role Upgrade', () => {
        test('1.1 A phone number first seen as receiver, then as sender, ends with contact role both', async () => {
            const phone = '+96590001111';
            const context1 = { trackingNumber: 'TRG-RECV-01', shipmentId: 's1', carrierCode: 'DGR' };
            const targetReceiver = { role: 'receiver', phone, name: 'Customer One' };

            // First event: seen as receiver
            const contact1 = await chatwootService.findOrCreateContact(targetReceiver, context1);
            expect(contact1.custom_attributes.role).toBe('receiver');

            // Second event: seen as sender
            const context2 = { trackingNumber: 'TRG-SEND-02', shipmentId: 's2', carrierCode: 'DGR' };
            const targetSender = { role: 'sender', phone, name: 'Customer One' };

            const contact2 = await chatwootService.findOrCreateContact(targetSender, context2);
            expect(contact2.custom_attributes.role).toBe('both');
            expect(contact2.id).toBe(contact1.id);
        });

        test('1.2 A phone number first seen as sender, then as receiver, ends with contact role both', async () => {
            const phone = '+96590002222';
            const context1 = { trackingNumber: 'TRG-SEND-03', shipmentId: 's3', carrierCode: 'OTE' };
            const targetSender = { role: 'sender', phone, name: 'Merchant Alpha' };

            const contact1 = await chatwootService.findOrCreateContact(targetSender, context1);
            expect(contact1.custom_attributes.role).toBe('sender');

            const context2 = { trackingNumber: 'TRG-RECV-04', shipmentId: 's4', carrierCode: 'OTE' };
            const targetReceiver = { role: 'receiver', phone, name: 'Merchant Alpha' };

            const contact2 = await chatwootService.findOrCreateContact(targetReceiver, context2);
            expect(contact2.custom_attributes.role).toBe('both');
            expect(contact2.id).toBe(contact1.id);
        });

        test('1.3 Repeat events for the same role preserve role and avoid redundant PUT requests', async () => {
            const phone = '+96590003333';
            const context1 = { trackingNumber: 'TRG-05', shipmentId: 's5', carrierCode: 'DGR' };
            const target1 = { role: 'receiver', phone, name: 'Same Role' };

            await chatwootService.findOrCreateContact(target1, context1);
            const client = chatwootService.getClient();
            client.request.mockClear();

            const target2 = { role: 'receiver', phone, name: 'Same Role' };
            const contact2 = await chatwootService.findOrCreateContact(target2, context1);

            expect(contact2.custom_attributes.role).toBe('receiver');
            const putCalls = client.request.mock.calls.filter(c => c[0].method === 'put');
            expect(putCalls.length).toBe(0);
        });

        test('1.4 A contact already upgraded to both preserves both on subsequent single-role events', async () => {
            const phone = '+96590004444';
            const context1 = { trackingNumber: 'TRG-06', shipmentId: 's6', carrierCode: 'DGR' };
            const targetReceiver = { role: 'receiver', phone, name: 'Dual Role User' };
            await chatwootService.findOrCreateContact(targetReceiver, context1);

            const targetSender = { role: 'sender', phone, name: 'Dual Role User' };
            const contactUpgraded = await chatwootService.findOrCreateContact(targetSender, context1);
            expect(contactUpgraded.custom_attributes.role).toBe('both');

            // Subsequent event as receiver again
            const contactSubsequent = await chatwootService.findOrCreateContact(targetReceiver, context1);
            expect(contactSubsequent.custom_attributes.role).toBe('both');
        });

        test('1.5 resolveUpgradedRole handles all role transition permutations and edge cases', () => {
            expect(chatwootService.resolveUpgradedRole('receiver', 'sender')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('sender', 'receiver')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('both', 'receiver')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('both', 'sender')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('receiver', 'both')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('sender', 'both')).toBe('both');
            expect(chatwootService.resolveUpgradedRole('receiver', 'receiver')).toBe('receiver');
            expect(chatwootService.resolveUpgradedRole('sender', 'sender')).toBe('sender');
            expect(chatwootService.resolveUpgradedRole(null, 'receiver')).toBe('receiver');
            expect(chatwootService.resolveUpgradedRole('sender', null)).toBe('sender');
        });
    });

    describe('Criterion 2: Shared Organization Mapping in Chatwoot', () => {
        test('2.1 Two users of the same Target organization map to the same Chatwoot organization record', async () => {
            const org = {
                id: 'target-org-101',
                name: 'Kuwait Retail Trading WLL',
                chatwootOrganizationId: null
            };

            const user1 = { id: 'u1', name: 'User One', phone: '+96561111111', role: 'sender' };
            const user2 = { id: 'u2', name: 'User Two', phone: '+96562222222', role: 'sender' };

            const orgUpdateSpy = jest.spyOn(prisma.organization, 'update').mockImplementation(async ({ where, data }) => {
                org.chatwootOrganizationId = data.chatwootOrganizationId;
                return org;
            });

            const context1 = { trackingNumber: 'TRG-ORG-01', shipmentId: 's10', carrierCode: 'DGR', organization: org };
            const contact1 = await chatwootService.findOrCreateContact(user1, context1);

            expect(org.chatwootOrganizationId).toBeTruthy();
            expect(contact1.custom_attributes.organization_id).toBe(org.chatwootOrganizationId);

            const initialCwOrgCount = mockOrganizations.length;
            expect(initialCwOrgCount).toBe(1);

            // User 2 sync
            const context2 = { trackingNumber: 'TRG-ORG-02', shipmentId: 's11', carrierCode: 'DGR', organization: org };
            const contact2 = await chatwootService.findOrCreateContact(user2, context2);

            expect(contact2.custom_attributes.organization_id).toBe(contact1.custom_attributes.organization_id);
            expect(mockOrganizations.length).toBe(1); // No duplicate organization created in Chatwoot

            orgUpdateSpy.mockRestore();
        });

        test('2.2 Organization lookup gracefully falls back to /companies if /organizations returns 404', async () => {
            const client = chatwootService.getClient();
            client.request.mockImplementationOnce(async (config) => {
                if (config.url.includes('/organizations')) {
                    const err = new Error('Not Found');
                    err.response = { status: 404 };
                    throw err;
                }
                return { data: {} };
            });

            const org = {
                id: 'target-org-fallback-202',
                name: 'Al-Bahar Logistics Group',
                chatwootOrganizationId: null
            };

            jest.spyOn(prisma.organization, 'update').mockImplementation(async ({ data }) => {
                org.chatwootOrganizationId = data.chatwootOrganizationId;
                return org;
            });

            const result = await chatwootService.getOrCreateChatwootOrganization(org);
            expect(result.id).toBeDefined();
            expect(mockCompanies.length).toBe(1);
            expect(mockCompanies[0].name).toBe('Al-Bahar Logistics Group');
        });
    });

    describe('Criterion 3: Continuous Conversation, Attribute Refresh & Label Taxonomy', () => {
        test('3.1 Repeat events for the same phone reuse one conversation and update active shipment attributes and labels', async () => {
            const phone = '+96597777777';
            const target = { role: 'receiver', phone, name: 'Active Customer' };

            // Shipment 1: out for delivery
            const context1 = {
                trackingNumber: 'TRG-ACTIVE-01',
                shipmentId: 's20',
                carrierCode: 'DGR',
                currentStatusRaw: 'out_for_delivery',
                currentStatus: 'Out for Delivery',
                codAmount: '15.000 KWD',
                codAmountRaw: 15.0,
                codStatus: 'pending',
                organization: { name: 'Falcon Logistics' }
            };

            const contact = await chatwootService.findOrCreateContact(target, context1);
            const conv1 = await chatwootService.findOrCreateConversation(contact, target, context1);

            expect(conv1.id).toBeDefined();
            expect(conv1.custom_attributes.shipment_tracking_number).toBe('TRG-ACTIVE-01');
            expect(conv1.custom_attributes.active_status).toBe('out_for_delivery');
            expect(conv1.custom_attributes.cod_amount).toBe('15.000 KWD');
            expect(conv1.labels).toContain('out_for_delivery');
            expect(conv1.labels).toContain('cod_due');
            expect(conv1.labels).toContain('org_falcon_logistics');

            // Simulate agent resolving the conversation
            conv1.status = 'resolved';

            // Shipment 2 for same customer phone: delivered
            const context2 = {
                trackingNumber: 'TRG-ACTIVE-02',
                shipmentId: 's21',
                carrierCode: 'DGR',
                currentStatusRaw: 'delivered',
                currentStatus: 'Delivered',
                codAmount: '0.000 KWD',
                codAmountRaw: 0,
                codStatus: 'collected',
                organization: { name: 'Falcon Logistics' }
            };

            const conv2 = await chatwootService.findOrCreateConversation(contact, target, context2);

            expect(conv2.id).toBe(conv1.id); // Continuous conversation reused!
            expect(conv2.status).toBe('open'); // Reopened!
            expect(conv2.custom_attributes.shipment_tracking_number).toBe('TRG-ACTIVE-02'); // Refreshed!
            expect(conv2.custom_attributes.active_status).toBe('delivered');
            expect(conv2.labels).toContain('delivered');
        });

        test('3.2 Label taxonomy correctly classifies customs_hold and payment_pending', () => {
            const labelsCustoms = chatwootService.buildConversationLabels({
                role: 'receiver',
                organization: { name: 'Global Goods' },
                eventType: 'on_hold_customs_issue',
                context: {
                    currentStatusRaw: 'exception',
                    latestDescription: 'Held at Kuwait Customs - Consignee Civil ID Required'
                }
            });
            expect(labelsCustoms).toContain('customs_hold');
            expect(labelsCustoms).toContain('receiver');
            expect(labelsCustoms).toContain('org_global_goods');

            const labelsPayment = chatwootService.buildConversationLabels({
                role: 'both',
                eventType: 'payment_link_ready',
                context: {
                    currentStatusRaw: 'pending',
                    isPaid: false
                }
            });
            expect(labelsPayment).toContain('role_both');
            expect(labelsPayment).toContain('payment_pending');
        });
    });

    describe('Criterion 4: Idempotent History Backfill Script', () => {
        test('4.1 Running the history backfill twice gives the same Chatwoot message count as running it once', async () => {
            const mockLogs = [
                {
                    id: 'log-1',
                    shipmentId: 'shp-1',
                    trackingNumber: 'TRG-HIST-01',
                    eventType: 'out_for_delivery',
                    recipientRole: 'receiver',
                    recipientPhone: '+96594444444',
                    recipientName: 'Hist Customer 1',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-20T10:00:00Z'),
                    sentAt: new Date('2026-10-20T10:00:00Z'),
                    shipment: { id: 'shp-1', trackingNumber: 'TRG-HIST-01', status: 'out_for_delivery' }
                },
                {
                    id: 'log-2',
                    shipmentId: 'shp-2',
                    trackingNumber: 'TRG-HIST-02',
                    eventType: 'delivered',
                    recipientRole: 'receiver',
                    recipientPhone: '+96595555555',
                    recipientName: 'Hist Customer 2',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-21T14:00:00Z'),
                    sentAt: new Date('2026-10-21T14:00:00Z'),
                    shipment: { id: 'shp-2', trackingNumber: 'TRG-HIST-02', status: 'delivered' }
                }
            ];

            jest.spyOn(prisma.shipmentNotificationLog, 'count').mockResolvedValue(mockLogs.length);
            jest.spyOn(prisma.shipmentNotificationLog, 'findMany').mockResolvedValue(mockLogs);
            jest.spyOn(prisma.shipmentNotificationLog, 'update').mockImplementation(async ({ where, data }) => {
                const target = mockLogs.find(l => l.id === where.id);
                if (target) Object.assign(target, data);
                return target;
            });

            // FIRST RUN (Execute)
            const result1 = await backfillChatwootHistory({ execute: true, dryRun: false });
            expect(result1.backfilled).toBe(2);
            expect(mockMessages.length).toBe(2);
            const messageCountAfterRun1 = mockMessages.length;

            // SECOND RUN (Execute again on same data)
            const result2 = await backfillChatwootHistory({ execute: true, dryRun: false });
            expect(result2.backfilled).toBe(0);
            expect(result2.alreadySyncedLocal).toBe(2);
            expect(mockMessages.length).toBe(messageCountAfterRun1); // Strict Invariant: exactly the same count!
        });

        test('4.2 Dry run previews backfill actions without mutating database or creating Chatwoot messages', async () => {
            const mockLogs = [
                {
                    id: 'log-preview-1',
                    shipmentId: 'shp-p1',
                    trackingNumber: 'TRG-PREVIEW-01',
                    eventType: 'out_for_delivery',
                    recipientRole: 'receiver',
                    recipientPhone: '+96593333333',
                    recipientName: 'Preview User',
                    provider: 'SHIPMENT_WHATSAPP',
                    status: 'SENT',
                    chatwootMessageId: null,
                    chatwootConversationId: null,
                    createdAt: new Date('2026-10-22T08:00:00Z'),
                    sentAt: new Date('2026-10-22T08:00:00Z'),
                    shipment: { id: 'shp-p1', trackingNumber: 'TRG-PREVIEW-01', status: 'out_for_delivery' }
                }
            ];

            jest.spyOn(prisma.shipmentNotificationLog, 'count').mockResolvedValue(mockLogs.length);
            jest.spyOn(prisma.shipmentNotificationLog, 'findMany').mockResolvedValue(mockLogs);
            const updateSpy = jest.spyOn(prisma.shipmentNotificationLog, 'update');

            const result = await backfillChatwootHistory({ execute: false, dryRun: true });
            expect(result.backfilled).toBe(1);
            expect(mockMessages.length).toBe(0); // Zero messages created
            expect(updateSpy).not.toHaveBeenCalled(); // Zero DB mutations
        });

        test('4.3 parseCliArgs correctly handles CLI flags', () => {
            const parsed1 = parseCliArgs(['--execute', '--limit=20', '--batch-size=10', '--tracking=TRG-123']);
            expect(parsed1.execute).toBe(true);
            expect(parsed1.dryRun).toBe(false);
            expect(parsed1.limit).toBe(20);
            expect(parsed1.batchSize).toBe(10);
            expect(parsed1.trackingNumber).toBe('TRG-123');

            const parsed2 = parseCliArgs(['--dry-run']);
            expect(parsed2.dryRun).toBe(true);
            expect(parsed2.execute).toBe(false);
        });
    });
});
