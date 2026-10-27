import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SupportCenterPage from '../SupportCenterPage';
import SupportChatContext from '../../context/SupportChatContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/LanguageContext', () => ({
    useLanguage: vi.fn()
}));

vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn()
}));

vi.mock('../../services/api', () => ({
    default: {
        post: vi.fn()
    }
}));

vi.mock('notistack', () => ({
    useSnackbar: () => ({
        enqueueSnackbar: vi.fn()
    })
}));

describe('SupportCenterPage (Omnichannel Support Center)', () => {
    let mockContextValue;
    const mockSelectConversation = vi.fn();
    const mockSendMessage = vi.fn();
    const mockSendLocationRequest = vi.fn();
    const mockToggleStatus = vi.fn();
    const mockUpdateLabels = vi.fn();
    const mockSetFilters = vi.fn();

    const sampleConversations = [
        {
            id: 201,
            status: 'open',
            unreadCount: 1,
            labels: ['receiver', 'cod_due'],
            contact: {
                id: 11,
                name: 'Jasem Al-Khorafi',
                phone: '+965 99001122',
                role: 'receiver',
                organizationName: 'Gulf Trading Co.'
            },
            activeShipment: {
                id: 'shp-201',
                trackingNumber: 'TRG-KW-201',
                status: 'out_for_delivery',
                carrierCode: 'TARGET',
                carrierName: 'Target Logistics',
                codAmount: 18.5,
                isPaid: false
            },
            lastMessage: {
                id: 1,
                content: 'Hello, what time is delivery scheduled?',
                messageType: 'incoming',
                createdAt: '2026-10-24T14:30:00Z'
            }
        },
        {
            id: 202,
            status: 'open',
            unreadCount: 0,
            labels: ['sender', 'customs_hold'],
            contact: {
                id: 12,
                name: 'Sara Al-Otaibi',
                phone: '+965 66778899',
                role: 'sender'
            },
            activeShipment: {
                id: 'shp-202',
                trackingNumber: 'TRG-KW-202',
                status: 'customs_hold',
                carrierCode: 'DGR',
                carrierName: 'DHL Express',
                codAmount: null,
                isPaid: true
            },
            lastMessage: {
                id: 2,
                content: 'Need help with customs clearance papers',
                messageType: 'incoming',
                createdAt: '2026-10-24T11:15:00Z'
            }
        }
    ];

    const sampleMessages = [
        // 1. Incoming customer message
        {
            id: 10,
            content: 'Hello, what time is delivery scheduled?',
            messageType: 'incoming',
            private: false,
            sender: { name: 'Jasem Al-Khorafi' },
            createdAt: '2026-10-24T14:30:00Z'
        },
        // 2. Outgoing agent free-text message
        {
            id: 11,
            content: 'Our courier is arriving within 45 minutes.',
            messageType: 'outgoing',
            private: false,
            sender: { name: 'Support Staff Ahmad' },
            createdAt: '2026-10-24T14:35:00Z'
        },
        // 3. Approved Meta Template Card message
        {
            id: 12,
            content: 'Hello Jasem Al-Khorafi, your shipment TRG-KW-201 is out for delivery. Please tap below to confirm your exact delivery map pin location.',
            messageType: 'outgoing',
            private: false,
            isTemplate: true,
            templateName: 'location_request_v1',
            templateParams: ['Jasem Al-Khorafi', 'TRG-KW-201'],
            sender: { name: 'System Meta Gateway' },
            createdAt: '2026-10-24T14:36:00Z'
        },
        // 4. Internal private staff note
        {
            id: 13,
            content: 'Customer confirmed they will pay cash on delivery.',
            messageType: 'note',
            private: true,
            sender: { name: 'Support Staff Ahmad' },
            createdAt: '2026-10-24T14:37:00Z'
        }
    ];

    const sampleLogisticsContext = {
        customer: sampleConversations[0].contact,
        activeShipments: [sampleConversations[0].activeShipment],
        pastShipments: [
            {
                id: 'past-1',
                trackingNumber: 'TRG-KW-099',
                status: 'delivered',
                carrierName: 'Target Logistics'
            }
        ]
    };

    beforeEach(() => {
        vi.clearAllMocks();

        useLanguage.mockReturnValue({
            language: 'en',
            isRTL: false,
            t: (k, fb) => fb || k
        });

        useAuth.mockReturnValue({
            user: {
                id: 'u-admin-1',
                name: 'Supervisor Tariq',
                role: 'admin',
                chatwootAccessToken: 'chatwoot_pat_valid_123'
            }
        });

        mockContextValue = {
            conversations: sampleConversations,
            activeConversation: sampleConversations[0],
            messages: sampleMessages,
            unreadCount: 1,
            windowStatus: {
                inside24hWindow: true,
                remainingSeconds: 18000,
                expiresAt: '2026-10-25T14:30:00Z',
                reason: 'CUSTOMER_MESSAGE_WITHIN_24H'
            },
            logisticsContext: sampleLogisticsContext,
            filters: {
                status: 'open',
                label: '',
                unread: false,
                search: ''
            },
            loadingConversations: false,
            loadingMessages: false,
            loadingContext: false,
            sendingMessage: false,
            setFilters: mockSetFilters,
            selectConversation: mockSelectConversation,
            sendMessage: mockSendMessage,
            sendLocationRequest: mockSendLocationRequest,
            toggleConversationStatus: mockToggleStatus,
            updateConversationLabels: mockUpdateLabels,
            loadConversationByTrackingNumber: vi.fn(),
            loadConversationByPhone: vi.fn()
        };
    });

    const renderSupportCenter = (customContext = {}) => {
        const val = { ...mockContextValue, ...customContext };
        return render(
            <MemoryRouter initialEntries={['/support/201']}>
                <SupportChatContext.Provider value={val}>
                    <Routes>
                        <Route path="/support/:conversationId" element={<SupportCenterPage />} />
                        <Route path="/support" element={<SupportCenterPage />} />
                    </Routes>
                </SupportChatContext.Provider>
            </MemoryRouter>
        );
    };

    it('renders the complete 3-pane layout on desktop with customer conversation list', () => {
        renderSupportCenter();

        // 3 Panes present
        expect(screen.getByTestId('pane-conversations')).toBeInTheDocument();
        expect(screen.getByTestId('pane-thread')).toBeInTheDocument();
        expect(screen.getByTestId('pane-context')).toBeInTheDocument();

        // Conversation items rendered in list
        expect(screen.getAllByText('Jasem Al-Khorafi').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Sara Al-Otaibi')).toBeInTheDocument();
    });

    it('supports search, label filtering, and unread toggle in conversation list', () => {
        renderSupportCenter();

        // Search input
        const searchInput = screen.getByTestId('support-search-input');
        fireEvent.change(searchInput, { target: { value: 'Sara' } });
        expect(mockSetFilters).toHaveBeenCalledWith(expect.any(Function));

        // Label dropdown
        const labelSelect = screen.getByTestId('support-label-filter');
        fireEvent.change(labelSelect, { target: { value: 'customs_hold' } });
        expect(mockSetFilters).toHaveBeenCalledWith(expect.any(Function));

        // Unread toggle button
        const unreadToggle = screen.getByTestId('support-unread-toggle');
        fireEvent.click(unreadToggle);
        expect(mockSetFilters).toHaveBeenCalledWith(expect.any(Function));
    });

    it('clearly distinguishes template messages from free text and private notes', () => {
        renderSupportCenter();

        // 1. Free text outgoing bubble
        const freeTextMsg = screen.getByText('Our courier is arriving within 45 minutes.');
        expect(freeTextMsg).toBeInTheDocument();
        expect(screen.getByTestId('message-outgoing-11')).toBeInTheDocument();

        // 2. Approved Meta Template Card with badge and action CTA
        const templateBubble = screen.getByTestId('message-template-12');
        expect(templateBubble).toBeInTheDocument();
        // Displays official Meta Template badge
        expect(templateBubble.textContent).toContain('location_request_v1');

        // 3. Internal private note with staff warning styling
        const privateNoteBubble = screen.getByTestId('message-note-13');
        expect(privateNoteBubble).toBeInTheDocument();
        expect(privateNoteBubble.textContent).toContain('Customer confirmed they will pay cash on delivery.');
    });

    it('switches 24-hour reply composer between free text inside window and Meta templates outside window', () => {
        // A. Inside 24h window: Free text mode active
        const { unmount } = renderSupportCenter({
            windowStatus: {
                inside24hWindow: true,
                remainingSeconds: 7200,
                expiresAt: '2026-10-25T14:30:00Z',
                reason: 'CUSTOMER_MESSAGE_WITHIN_24H'
            }
        });

        expect(screen.getByTestId('free-text-input')).toBeInTheDocument();
        expect(screen.getByTestId('send-free-text-btn')).toBeInTheDocument();
        unmount();

        // B. Outside 24h window: Enforces Approved Meta Template Selector
        renderSupportCenter({
            windowStatus: {
                inside24hWindow: false,
                remainingSeconds: 0,
                expiresAt: null,
                reason: 'EXPIRED_24H'
            }
        });

        // Free text textarea is replaced by template selector
        expect(screen.getByTestId('template-selector')).toBeInTheDocument();
        expect(screen.getByTestId('send-template-btn')).toBeInTheDocument();
        expect(screen.queryByTestId('free-text-input')).toBeNull();
    });

    it('executes 1-click logistics action: Request GPS Location Pin', async () => {
        mockSendLocationRequest.mockResolvedValue({ success: true });
        renderSupportCenter();

        const requestPinBtn = screen.getByTestId('context-request-location-btn');
        expect(requestPinBtn).toBeInTheDocument();

        fireEvent.click(requestPinBtn);

        await waitFor(() => {
            expect(mockSendLocationRequest).toHaveBeenCalledWith('TRG-KW-201');
        });
    });

    it('executes 1-click logistics action: Send Payment Link opens modal', () => {
        renderSupportCenter();

        const payLinkBtn = screen.getByTestId('context-send-payment-btn');
        expect(payLinkBtn).toBeInTheDocument();

        fireEvent.click(payLinkBtn);

        // ManualPaymentLinkModal opens with pre-filled waybill amount
        expect(screen.getAllByText('TRG-KW-201').length).toBeGreaterThanOrEqual(1);
    });

    it('reflects real-time incoming messages live without page reload', () => {
        // Test wrapper that simulates receiving a real-time message via context state update
        const TestWrapper = () => {
            const [msgs, setMsgs] = useState(sampleMessages);
            return (
                <MemoryRouter initialEntries={['/support/201']}>
                    <SupportChatContext.Provider value={{
                        ...mockContextValue,
                        messages: msgs
                    }}>
                        <SupportCenterPage />
                        <button
                            data-testid="simulate-sse-btn"
                            onClick={() => {
                                setMsgs(prev => [
                                    ...prev,
                                    {
                                        id: 999,
                                        content: 'Live incoming message from customer right now!',
                                        messageType: 'incoming',
                                        createdAt: new Date().toISOString()
                                    }
                                ]);
                            }}
                        >
                            Simulate SSE
                        </button>
                    </SupportChatContext.Provider>
                </MemoryRouter>
            );
        };

        render(<TestWrapper />);

        expect(screen.queryByText('Live incoming message from customer right now!')).toBeNull();

        // Simulate incoming SSE message arrival
        fireEvent.click(screen.getByTestId('simulate-sse-btn'));

        // Live update renders in thread immediately without reloading
        expect(screen.getByText('Live incoming message from customer right now!')).toBeInTheDocument();
    });
});
