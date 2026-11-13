/**
 * Empirical Adversarial Challenger 2 Test Suite: Chatwoot CRM Synchronization & Reuse
 * File: backend/__tests__/m3_challenger2_crm.test.js
 *
 * Adversarial Verifications:
 * 1. Continuous conversation reuse across 5 consecutive milestone events over 3 different shipments
 * 2. Conversation reopening when staff resolved or snoozed the thread without creating duplicate threads
 * 3. Active shipment custom attributes dynamically updated on shipment switch (TRG-001 -> TRG-002)
 * 4. Organization unification: 3 users under same Target organization mapping to a single Chatwoot org ID
 * 5. Dynamic label taxonomy under complex combinatorial operational states (COD due + customs hold + out for delivery)
 * 6. Edge cases: bizarre organization names, empty context defense, DB fallback on Chatwoot conversation index lag
 */

const axios = require('axios');
const chatwootService = require('../src/services/chatwootNotificationService');
const { prisma } = require('../src/config/database');

jest.mock('axios');

describe('Empirical Challenger 2: Chatwoot CRM Synchronization & Reuse Adversarial Suite', () => {
    let mockContacts = [];
    let mockConversations = [];
    let mockMessages = [];
    let mockOrganizations = [];
    let mockCompanies = [];
    let conversationToggleCalls = [];
    let conversationAttributeUpdates = [];
    let conversationLabelUpdates = [];

    beforeEach(() => {
        jest.clearAllMocks();
        chatwootService.resetClient();
        jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue(null);
        mockContacts = [];
        mockConversations = [];
        mockMessages = [];
        mockOrganizations = [];
        mockCompanies = [];
        conversationToggleCalls = [];
        conversationAttributeUpdates = [];
        conversationLabelUpdates = [];

        axios.create.mockReturnValue({
            defaults: { baseURL: 'https://inbox.mawthook.io' },
            request: jest.fn().mockImplementation(async (config) => {
                const { method, url, data, params } = config;
                const m = method.toLowerCase();

                // 1. Contact Search
                if (m === 'get' && url.includes('/contacts/search')) {
                    const q = params?.q;
                    const matched = mockContacts.filter(c => c.phone_number === q);
                    return { data: { payload: matched } };
                }

                // 2. Contact Create
                if (m === 'post' && url.endsWith('/contacts')) {
                    const newContact = {
                        id: mockContacts.length + 1001,
                        phone_number: data.phone_number,
                        name: data.name,
                        email: data.email,
                        custom_attributes: { ...(data.custom_attributes || {}) },
                        organization_id: data.organization_id || null
                    };
                    mockContacts.push(newContact);
                    return { data: { payload: { contact: newContact } } };
                }

                // 3. Contact Update
                if (m === 'put' && url.includes('/contacts/')) {
                    const id = parseInt(url.split('/contacts/')[1], 10);
                    const contact = mockContacts.find(c => c.id === id);
                    if (contact) {
                        contact.custom_attributes = { ...contact.custom_attributes, ...(data.custom_attributes || {}) };
                        if (data.organization_id) contact.organization_id = data.organization_id;
                    }
                    return { data: { payload: { contact } } };
                }

                // 4. Organization Create
                if (m === 'post' && url.includes('/organizations')) {
                    const newOrg = {
                        id: `cw_org_${mockOrganizations.length + 500}`,
                        name: data.name
                    };
                    mockOrganizations.push(newOrg);
                    return { data: newOrg };
                }

                // 4b. Company Create fallback
                if (m === 'post' && url.includes('/companies')) {
                    const newComp = {
                        id: `cw_comp_${mockCompanies.length + 700}`,
                        name: data.name
                    };
                    mockCompanies.push(newComp);
                    return { data: newComp };
                }

                // 5. Contact Conversations
                if (m === 'get' && url.includes('/conversations') && url.includes('/contacts/')) {
                    const contactId = parseInt(url.split('/contacts/')[1].split('/conversations')[0], 10);
                    const convs = mockConversations.filter(c => c.contact_id === contactId);
                    return { data: { payload: convs } };
                }

                // 6. Conversation Create
                if (m === 'post' && url.endsWith('/conversations')) {
                    const newConv = {
                        id: mockConversations.length + 2001,
                        contact_id: data.contact_id,
                        inbox_id: data.inbox_id,
                        status: data.status || 'open',
                        custom_attributes: { ...(data.custom_attributes || {}) },
                        labels: []
                    };
                    mockConversations.push(newConv);
                    return { data: { payload: newConv } };
                }

                // 7. Toggle status
                if (m === 'post' && url.includes('/toggle_status')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/toggle_status')[0], 10);
                    conversationToggleCalls.push({ convId, status: data.status });
                    const conv = mockConversations.find(c => c.id === convId);
                    if (conv) conv.status = data.status || 'open';
                    return { data: { payload: conv } };
                }

                // 8. Custom attributes
                if (m === 'post' && url.includes('/custom_attributes')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/custom_attributes')[0], 10);
                    conversationAttributeUpdates.push({ convId, attributes: data.custom_attributes });
                    const conv = mockConversations.find(c => c.id === convId);
                    if (conv) conv.custom_attributes = { ...conv.custom_attributes, ...(data.custom_attributes || {}) };
                    return { data: { payload: conv } };
                }

                // 9. Labels
                if (m === 'post' && url.includes('/labels')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/labels')[0], 10);
                    conversationLabelUpdates.push({ convId, labels: data.labels });
                    const conv = mockConversations.find(c => c.id === convId);
                    if (conv) conv.labels = Array.from(new Set([...(conv.labels || []), ...(data.labels || [])]));
                    return { data: { payload: conv?.labels } };
                }

                // 10. Messages
                if (m === 'post' && url.includes('/messages')) {
                    const convId = parseInt(url.split('/conversations/')[1].split('/messages')[0], 10);
                    const newMsg = {
                        id: mockMessages.length + 8001,
                        conversation_id: convId,
                        content: data.content,
                        external_id: data.external_id
                    };
                    mockMessages.push(newMsg);
                    return { data: newMsg };
                }

                return { data: {} };
            })
        });
    });

    describe('1. Adversarial Challenge: Continuous Conversation Reuse across 5 Events & 3 Shipments', () => {
        test('5 consecutive milestone events over 3 distinct shipments strictly reuse the single conversation thread', async () => {
            const customerPhone = '+96599887766';
            const customerName = 'Khaled Al-Salem';
            const target = { role: 'receiver', phone: customerPhone, name: customerName };

            // Shipment 1: TRG-SHP-001
            const shp1 = {
                id: 'shp-101',
                trackingNumber: 'TRG-SHP-001',
                carrierCode: 'DGR',
                status: 'received_at_hub',
                currentStatusRaw: 'received_at_hub',
                currentStatus: 'Received at Hub',
                codAmount: '0.000 KWD',
                codAmountRaw: 0,
                organization: { name: 'Al-Salem General Trading' }
            };

            // Event 1: Shipment 1 created
            const contact1 = await chatwootService.findOrCreateContact(target, shp1);
            const conv1 = await chatwootService.findOrCreateConversation(contact1, target, shp1);
            expect(mockConversations.length).toBe(1);
            const initialConversationId = conv1.id;

            // Event 2: Shipment 1 out for delivery
            const shp1_event2 = {
                ...shp1,
                status: 'out_for_delivery',
                currentStatusRaw: 'out_for_delivery',
                currentStatus: 'Out for Delivery'
            };
            const conv2 = await chatwootService.findOrCreateConversation(contact1, target, shp1_event2);
            expect(conv2.id).toBe(initialConversationId);
            expect(mockConversations.length).toBe(1); // Still exactly 1 conversation

            // Shipment 2: TRG-SHP-002 (Received at hub)
            const shp2 = {
                id: 'shp-202',
                trackingNumber: 'TRG-SHP-002',
                carrierCode: 'OTE',
                status: 'received_at_hub',
                currentStatusRaw: 'received_at_hub',
                currentStatus: 'Received at Hub',
                codAmount: '12.500 KWD',
                codAmountRaw: 12.5,
                codStatus: 'pending',
                organization: { name: 'Al-Salem General Trading' }
            };
            const conv3 = await chatwootService.findOrCreateConversation(contact1, target, shp2);
            expect(conv3.id).toBe(initialConversationId);
            expect(mockConversations.length).toBe(1);
            expect(conv3.custom_attributes.shipment_tracking_number).toBe('TRG-SHP-002');
            expect(conv3.custom_attributes.cod_amount).toBe('12.500 KWD');

            // Event 4: Shipment 2 delivered
            const shp2_event4 = {
                ...shp2,
                status: 'delivered',
                currentStatusRaw: 'delivered',
                currentStatus: 'Delivered',
                codStatus: 'collected'
            };
            const conv4 = await chatwootService.findOrCreateConversation(contact1, target, shp2_event4);
            expect(conv4.id).toBe(initialConversationId);
            expect(mockConversations.length).toBe(1);
            expect(conv4.custom_attributes.active_status).toBe('delivered');

            // Shipment 3: TRG-SHP-003 (Customs Hold)
            const shp3 = {
                id: 'shp-303',
                trackingNumber: 'TRG-SHP-003',
                carrierCode: 'DGR',
                status: 'exception',
                currentStatusRaw: 'exception',
                currentStatus: 'Customs Hold',
                eventType: 'on_hold_customs_issue',
                latestDescription: 'Clearance delay at Kuwait Airport Customs',
                organization: { name: 'Al-Salem General Trading' }
            };
            const conv5 = await chatwootService.findOrCreateConversation(contact1, target, shp3);
            expect(conv5.id).toBe(initialConversationId);
            expect(mockConversations.length).toBe(1); // Never created any secondary conversation
            expect(conv5.custom_attributes.shipment_tracking_number).toBe('TRG-SHP-003');
            expect(conv5.labels).toContain('customs_hold');
        });
    });

    describe('2. Adversarial Challenge: Conversation Reopening without Duplicate Threads', () => {
        test('Resolved conversation is reopened via toggle_status and no duplicate thread is created', async () => {
            const phone = '+96598765432';
            const target = { role: 'receiver', phone, name: 'Reopen Test' };
            const context1 = { trackingNumber: 'TRG-REOPEN-01', shipmentId: 's50', carrierCode: 'DGR' };

            const contact = await chatwootService.findOrCreateContact(target, context1);
            const conv = await chatwootService.findOrCreateConversation(contact, target, context1);
            expect(conv.status).toBe('open');

            // Simulate staff closing/resolving the conversation in Chatwoot
            conv.status = 'resolved';

            // Now incoming event arrives for the customer
            const context2 = { trackingNumber: 'TRG-REOPEN-02', shipmentId: 's51', carrierCode: 'DGR', currentStatusRaw: 'out_for_delivery' };
            const reopenedConv = await chatwootService.findOrCreateConversation(contact, target, context2);

            expect(reopenedConv.id).toBe(conv.id);
            expect(reopenedConv.status).toBe('open');
            expect(mockConversations.length).toBe(1); // Strict: No 2nd thread!
            expect(conversationToggleCalls.length).toBe(1);
            expect(conversationToggleCalls[0]).toEqual({ convId: conv.id, status: 'open' });
        });

        test('Snoozed or closed conversation is also cleanly reopened', async () => {
            const phone = '+96598765433';
            const target = { role: 'receiver', phone, name: 'Snooze Test' };
            const context = { trackingNumber: 'TRG-SNOOZE-01', shipmentId: 's52', carrierCode: 'OTE' };

            const contact = await chatwootService.findOrCreateContact(target, context);
            const conv = await chatwootService.findOrCreateConversation(contact, target, context);

            // Simulate snoozed status
            conv.status = 'snoozed';

            const incomingContext = { trackingNumber: 'TRG-SNOOZE-02', shipmentId: 's53', carrierCode: 'OTE' };
            const reopened = await chatwootService.findOrCreateConversation(contact, target, incomingContext);

            expect(reopened.id).toBe(conv.id);
            expect(reopened.status).toBe('open');
            expect(mockConversations.length).toBe(1);
            expect(conversationToggleCalls).toContainEqual({ convId: conv.id, status: 'open' });
        });
    });

    describe('3. Adversarial Challenge: Conversation Custom Attributes Update on Active Shipment Change', () => {
        test('Transitioning from TRG-001 (delivered) to TRG-002 (out for delivery) overwrites attributes accurately', async () => {
            const phone = '+96594443322';
            const target = { role: 'receiver', phone, name: 'Attribute Switch Test' };

            // Initial Shipment TRG-001
            const contextA = {
                trackingNumber: 'TRG-001',
                shipmentId: 'shp-aaa',
                carrierCode: 'DGR',
                currentStatusRaw: 'delivered',
                codAmount: '0.000 KWD',
                codAmountRaw: 0
            };

            const contact = await chatwootService.findOrCreateContact(target, contextA);
            const conv = await chatwootService.findOrCreateConversation(contact, target, contextA);

            expect(conv.custom_attributes.shipment_tracking_number).toBe('TRG-001');
            expect(conv.custom_attributes.active_status).toBe('delivered');
            expect(conv.custom_attributes.carrier_code).toBe('DGR');

            // Switch to TRG-002 (Out for delivery with COD)
            const contextB = {
                trackingNumber: 'TRG-002',
                shipmentId: 'shp-bbb',
                carrierCode: 'OTE',
                currentStatusRaw: 'out_for_delivery',
                codAmount: '18.750 KWD',
                codAmountRaw: 18.75,
                codStatus: 'pending'
            };

            const updatedConv = await chatwootService.findOrCreateConversation(contact, target, contextB);

            expect(updatedConv.id).toBe(conv.id);
            expect(updatedConv.custom_attributes.shipment_tracking_number).toBe('TRG-002');
            expect(updatedConv.custom_attributes.shipment_id).toBe('shp-bbb');
            expect(updatedConv.custom_attributes.active_status).toBe('out_for_delivery');
            expect(updatedConv.custom_attributes.carrier_code).toBe('OTE');
            expect(updatedConv.custom_attributes.cod_amount).toBe('18.750 KWD');

            // Verify the POST payload to Chatwoot custom_attributes API
            const lastUpdate = conversationAttributeUpdates[conversationAttributeUpdates.length - 1];
            expect(lastUpdate.attributes.shipment_tracking_number).toBe('TRG-002');
            expect(lastUpdate.attributes.active_status).toBe('out_for_delivery');
            expect(lastUpdate.attributes.carrier_code).toBe('OTE');
        });
    });

    describe('4. Adversarial Challenge: Organization Linking for 3 Users under same Target Organization', () => {
        test('3 users with different names/phones under the same Target organization resolve to identical Chatwoot organization ID', async () => {
            const org = {
                id: 'target-org-unified-555',
                name: 'United Kuwait Logistics Co.',
                chatwootOrganizationId: null
            };

            const users = [
                { id: 'usr-1', name: 'Tareq Al-Hassan', phone: '+96590010001', role: 'sender' },
                { id: 'usr-2', name: 'Mariam Al-Kandari', phone: '+96590020002', role: 'sender' },
                { id: 'usr-3', name: 'Bader Al-Mutawa', phone: '+96590030003', role: 'sender' }
            ];

            // Mock prisma organization operations
            jest.spyOn(prisma.organization, 'findUnique').mockImplementation(async ({ where }) => {
                if (where.id === org.id) return org;
                return null;
            });
            jest.spyOn(prisma.organization, 'update').mockImplementation(async ({ where, data }) => {
                if (where.id === org.id) {
                    org.chatwootOrganizationId = data.chatwootOrganizationId;
                    return org;
                }
                return null;
            });

            // Process User 1
            const context1 = { trackingNumber: 'TRG-U1', shipmentId: 's1', carrierCode: 'DGR', organization: org };
            const contact1 = await chatwootService.findOrCreateContact(users[0], context1);

            expect(mockOrganizations.length).toBe(1);
            const unifiedCwOrgId = mockOrganizations[0].id;
            expect(contact1.custom_attributes.organization_id).toBe(unifiedCwOrgId);
            expect(org.chatwootOrganizationId).toBe(unifiedCwOrgId);

            // Process User 2
            const context2 = { trackingNumber: 'TRG-U2', shipmentId: 's2', carrierCode: 'DGR', organization: org };
            const contact2 = await chatwootService.findOrCreateContact(users[1], context2);

            expect(mockOrganizations.length).toBe(1); // NO second org created!
            expect(contact2.custom_attributes.organization_id).toBe(unifiedCwOrgId);

            // Process User 3 (passing only organizationId to test DB lookup branch)
            const context3 = { trackingNumber: 'TRG-U3', shipmentId: 's3', carrierCode: 'DGR', organizationId: org.id };
            const contact3 = await chatwootService.findOrCreateContact(users[2], context3);

            expect(mockOrganizations.length).toBe(1); // Still exactly 1!
            expect(contact3.custom_attributes.organization_id).toBe(unifiedCwOrgId);

            // All 3 contacts share the exact same organization ID
            expect(contact1.custom_attributes.organization_id).toBe(contact2.custom_attributes.organization_id);
            expect(contact2.custom_attributes.organization_id).toBe(contact3.custom_attributes.organization_id);
        });
    });

    describe('5. Adversarial Challenge: Dynamic Label Taxonomy under Complex States', () => {
        test('Edge case 5.1: Combined COD due + Customs Hold + Out for Delivery generates all 3 operational labels', () => {
            const labels = chatwootService.buildConversationLabels({
                role: 'receiver',
                organization: { name: 'Al-Ghanim Trading' },
                eventType: 'on_hold_customs_issue',
                shipment: {
                    status: 'out_for_delivery',
                    codAmountRaw: 45.0,
                    codStatus: 'pending'
                },
                context: {
                    currentStatusRaw: 'out_for_delivery',
                    latestDescription: 'Delayed at customs inspection during delivery run'
                }
            });

            expect(labels).toContain('customs_hold');
            expect(labels).toContain('cod_due');
            expect(labels).toContain('out_for_delivery');
            expect(labels).toContain('org_al_ghanim_trading');
            expect(labels).toContain('receiver');
        });

        test('Edge case 5.2: Customs resolved, COD collected, shipment delivered -> drops hold and COD labels', () => {
            const labels = chatwootService.buildConversationLabels({
                role: 'both',
                organization: { name: 'Al-Ghanim Trading' },
                eventType: 'delivered',
                shipment: {
                    status: 'delivered',
                    codAmountRaw: 45.0,
                    codStatus: 'collected',
                    paid: true
                },
                context: {
                    currentStatusRaw: 'delivered'
                }
            });

            expect(labels).toContain('delivered');
            expect(labels).toContain('role_both');
            expect(labels).toContain('org_al_ghanim_trading');
            expect(labels).not.toContain('customs_hold');
            expect(labels).not.toContain('cod_due');
            expect(labels).not.toContain('payment_pending');
        });

        test('Edge case 5.3: Payment pending label applied when remainingBalance > 0 and unpaid', () => {
            const labels = chatwootService.buildConversationLabels({
                role: 'sender',
                organization: null,
                eventType: 'shipment_created',
                shipment: {
                    status: 'received_at_hub',
                    paid: false,
                    remainingBalance: 32.500
                },
                context: {
                    currentStatusRaw: 'received_at_hub',
                    isPaid: false
                }
            });

            expect(labels).toContain('payment_pending');
            expect(labels).toContain('sender');
        });

        test('Edge case 5.4: Bizarre organization name with punctuation and unicode is slugified cleanly', () => {
            const labels = chatwootService.buildConversationLabels({
                role: 'receiver',
                organization: { name: '   "Al-Ahli & Gulf" Logistics (K.S.C.) #1   ' }
            });

            expect(labels).toContain('org_al_ahli_gulf_logistics_ksc_1');
        });

        test('Edge case 5.5: Completely empty/null input parameters do not crash and produce safe default', () => {
            const labels = chatwootService.buildConversationLabels({});
            expect(Array.isArray(labels)).toBe(true);
            expect(labels).toEqual(['receiver']); // Safe default role
        });
    });

    describe('6. Adversarial Challenge: Database Fallback for Conversation Discovery', () => {
        test('When Chatwoot API returns empty conversations list, local DB log reuses existing conversation ID', async () => {
            const phone = '+96591239876';
            const target = { role: 'receiver', phone, name: 'DB Fallback User' };
            const context = { trackingNumber: 'TRG-DB-01', shipmentId: 's99', carrierCode: 'DGR' };

            const contact = await chatwootService.findOrCreateContact(target, context);

            // Mock DB log having a previously established conversation ID
            jest.spyOn(prisma.shipmentNotificationLog, 'findFirst').mockResolvedValue({
                chatwootConversationId: 'cw_existing_conv_999'
            });

            // Chatwoot API GET conversations returns empty (simulating replication lag)
            const client = chatwootService.getClient();
            const originalRequest = client.request;
            client.request = jest.fn().mockImplementation(async (cfg) => {
                if (cfg.method.toLowerCase() === 'get' && cfg.url.includes('/conversations')) {
                    return { data: { payload: [] } };
                }
                return originalRequest(cfg);
            });

            const conv = await chatwootService.findOrCreateConversation(contact, target, context);

            expect(conv.id).toBe('cw_existing_conv_999');
            expect(mockConversations.length).toBe(0); // Zero new conversations created in Chatwoot!
        });
    });
});
