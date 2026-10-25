import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NativeChatDrawer from '../NativeChatDrawer';
import { useSupportChat } from '../../../context/SupportChatContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useAuth } from '../../../context/AuthContext';

vi.mock('../../../context/SupportChatContext', () => ({
    useSupportChat: vi.fn()
}));

vi.mock('../../../context/LanguageContext', () => ({
    useLanguage: vi.fn()
}));

vi.mock('../../../context/AuthContext', () => ({
    useAuth: vi.fn()
}));

vi.mock('../../../services/api', () => ({
    default: {
        post: vi.fn()
    }
}));

vi.mock('notistack', () => ({
    useSnackbar: () => ({
        enqueueSnackbar: vi.fn()
    })
}));

describe('NativeChatDrawer Component (Zero-iframe Architecture)', () => {
    const mockOnClose = vi.fn();
    const mockSelectConversation = vi.fn().mockResolvedValue(true);
    const mockLoadByTrackingNumber = vi.fn().mockResolvedValue(true);
    const mockLoadByPhone = vi.fn().mockResolvedValue(true);
    const mockSendMessage = vi.fn().mockResolvedValue(true);

    const mockActiveConversation = {
        id: 707,
        status: 'open',
        contact: {
            id: 88,
            name: 'Bader Al-Mutairi',
            phone: '+965 97766554',
            role: 'receiver'
        },
        activeShipment: {
            id: 'shp-707',
            trackingNumber: 'TRG-KW-707',
            status: 'in_transit',
            carrierCode: 'DGR',
            carrierName: 'DHL Express',
            codAmount: 12.5,
            isPaid: false
        },
        messages: []
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
                id: 'agent-1',
                name: 'Layla Al-Kandari',
                role: 'staff',
                chatwootAccessToken: 'token_layla_123'
            }
        });

        useSupportChat.mockReturnValue({
            activeConversation: mockActiveConversation,
            messages: [
                {
                    id: 1,
                    content: 'Customer inquiry: when will parcel arrive?',
                    messageType: 'incoming',
                    sender: { name: 'Bader Al-Mutairi' },
                    createdAt: '2026-10-24T12:00:00Z'
                }
            ],
            windowStatus: {
                inside24hWindow: true,
                remainingSeconds: 14400,
                expiresAt: '2026-10-25T12:00:00Z',
                reason: 'CUSTOMER_MESSAGE_WITHIN_24H'
            },
            logisticsContext: {
                customer: mockActiveConversation.contact,
                activeShipments: [mockActiveConversation.activeShipment],
                pastShipments: []
            },
            loadingMessages: false,
            loadingContext: false,
            sendingMessage: false,
            selectConversation: mockSelectConversation,
            loadConversationByTrackingNumber: mockLoadByTrackingNumber,
            loadConversationByPhone: mockLoadByPhone,
            sendMessage: mockSendMessage
        });
    });

    const renderDrawer = (props = {}) => {
        return render(
            <MemoryRouter>
                <NativeChatDrawer
                    isOpen={true}
                    onClose={mockOnClose}
                    phone="+965 97766554"
                    recipientName="Bader Al-Mutairi"
                    trackingNumber="TRG-KW-707"
                    chatwootConversationId={707}
                    {...props}
                />
            </MemoryRouter>
        );
    };

    it('renders null when isOpen is false', () => {
        const { container } = render(
            <MemoryRouter>
                <NativeChatDrawer
                    isOpen={false}
                    onClose={mockOnClose}
                    trackingNumber="TRG-KW-707"
                />
            </MemoryRouter>
        );

        expect(container.firstChild).toBeNull();
        expect(screen.queryByTestId('native-chat-drawer')).toBeNull();
    });

    it('mounts drawer with customer details and contains ZERO iframes in DOM', () => {
        renderDrawer();

        const drawer = screen.getByTestId('native-chat-drawer');
        expect(drawer).toBeInTheDocument();

        // Customer and shipment metadata rendered natively
        expect(screen.getByText('Bader Al-Mutairi')).toBeInTheDocument();
        expect(screen.getByText('TRG-KW-707')).toBeInTheDocument();
        expect(screen.getByText('+965 97766554')).toBeInTheDocument();

        // STRICT MANDATE: Confirm zero iframes exist anywhere in document
        const iframes = document.querySelectorAll('iframe');
        expect(iframes.length).toBe(0);
    });

    it('triggers onClose when clicking backdrop', () => {
        renderDrawer();

        const backdrop = screen.getByTestId('native-chat-drawer-backdrop');
        fireEvent.click(backdrop);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('triggers onClose when pressing Escape key', () => {
        renderDrawer();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('triggers onClose when clicking close button', () => {
        renderDrawer();

        const closeBtn = screen.getByTestId('native-chat-drawer-close-btn');
        fireEvent.click(closeBtn);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('switches between Live Chat tab and Logistics Context tab', async () => {
        renderDrawer();

        // Starts on chat tab
        await waitFor(() => {
            expect(screen.getByTestId('native-chat-drawer-thread')).toBeInTheDocument();
            expect(screen.getByTestId('native-chat-drawer-composer')).toBeInTheDocument();
        });

        // Click logistics tab
        const logisticsTab = screen.getByTestId('native-chat-drawer-tab-context');
        fireEvent.click(logisticsTab);

        // Shows CustomerContextPanel
        expect(screen.getByTestId('customer-context-panel')).toBeInTheDocument();
        expect(screen.queryByTestId('native-chat-drawer-thread')).toBeNull();

        // Switch back to chat tab
        const chatTab = screen.getByTestId('native-chat-drawer-tab-chat');
        fireEvent.click(chatTab);

        expect(screen.getByTestId('native-chat-drawer-thread')).toBeInTheDocument();
    });

    it('renders deep link to full Support Center for the conversation', () => {
        renderDrawer();

        const openFullBtn = screen.getByTestId('native-chat-drawer-open-full-btn');
        expect(openFullBtn).toBeInTheDocument();
        expect(openFullBtn.getAttribute('href')).toBe('/support/707');
    });

    it('keeps message thread and composer mounted without full-panel spinner during background message polling', async () => {
        useSupportChat.mockReturnValue({
            activeConversation: mockActiveConversation,
            messages: [
                {
                    id: 1,
                    content: 'Customer inquiry: when will parcel arrive?',
                    messageType: 'incoming',
                    sender: { name: 'Bader Al-Mutairi' },
                    createdAt: '2026-10-24T12:00:00Z'
                }
            ],
            windowStatus: {
                inside24hWindow: true,
                remainingSeconds: 14400,
                expiresAt: '2026-10-25T12:00:00Z',
                reason: 'CUSTOMER_MESSAGE_WITHIN_24H'
            },
            logisticsContext: {
                customer: mockActiveConversation.contact,
                activeShipments: [mockActiveConversation.activeShipment],
                pastShipments: []
            },
            loadingMessages: true, // background message polling flag
            loadingContext: false,
            sendingMessage: false,
            selectConversation: mockSelectConversation,
            loadConversationByTrackingNumber: mockLoadByTrackingNumber,
            loadConversationByPhone: mockLoadByPhone,
            sendMessage: mockSendMessage
        });

        renderDrawer();

        await waitFor(() => {
            // Thread and composer must remain mounted and visible
            expect(screen.getByTestId('native-chat-drawer-thread')).toBeInTheDocument();
            expect(screen.getByTestId('native-chat-drawer-composer')).toBeInTheDocument();
            // Full-panel connecting spinner should NOT be displayed
            expect(screen.queryByText(/Connecting live shipment chat thread/i)).toBeNull();
        });
    });
});
