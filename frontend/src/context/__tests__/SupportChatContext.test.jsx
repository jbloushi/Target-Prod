import React, { useContext } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import SupportChatContext, { SupportChatProvider, useSupportChat } from '../SupportChatContext';
import supportChatService from '../../services/supportChatService';
import { useAuth } from '../AuthContext';

vi.mock('../../services/supportChatService', () => ({
    default: {
        getUnreadCount: vi.fn(),
        getConversations: vi.fn(),
        getMessages: vi.fn(),
        getLogisticsContext: vi.fn(),
        getShipmentConversation: vi.fn(),
        sendMessage: vi.fn(),
        toggleStatus: vi.fn(),
        updateLabels: vi.fn(),
        requestLocation: vi.fn(),
        createEventsSource: vi.fn()
    }
}));

vi.mock('../AuthContext', () => ({
    useAuth: vi.fn()
}));

describe('SupportChatContext & Provider', () => {
    let mockEventSource;
    let sseListeners = {};

    const mockUser = {
        id: 'u-agent-1',
        name: 'Fatima Al-Support',
        email: 'fatima@target-kw.com',
        role: 'staff',
        token: 'auth-jwt-token-xyz',
        chatwootAccessToken: 'enc_token_fatima'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        sseListeners = {};
        mockEventSource = {
            addEventListener: vi.fn((event, handler) => {
                sseListeners[event] = handler;
            }),
            removeEventListener: vi.fn(),
            close: vi.fn()
        };
        supportChatService.createEventsSource.mockReturnValue(mockEventSource);

        useAuth.mockReturnValue({
            user: mockUser,
            isAuthenticated: true
        });

        supportChatService.getUnreadCount.mockResolvedValue({
            success: true,
            unreadCount: 4,
            openConversationsCount: 12
        });

        supportChatService.getConversations.mockResolvedValue({
            success: true,
            conversations: [
                {
                    id: 101,
                    status: 'open',
                    unreadCount: 2,
                    labels: ['receiver'],
                    contact: { name: 'Nawaf Al-Mutawa', phone: '+965 99887766' },
                    activeShipment: { trackingNumber: 'TRG-KW-101' },
                    lastMessage: { content: 'Where is my order?' }
                },
                {
                    id: 102,
                    status: 'open',
                    unreadCount: 2,
                    labels: ['customs_hold'],
                    contact: { name: 'Mona Al-Sabah', phone: '+965 55443322' },
                    activeShipment: { trackingNumber: 'TRG-KW-102' },
                    lastMessage: { content: 'Please check customs hold' }
                }
            ],
            meta: { unreadTotal: 4 }
        });

        supportChatService.getMessages.mockResolvedValue({
            success: true,
            messages: [
                { id: 1, content: 'Hello', messageType: 'incoming', createdAt: '2026-10-24T10:00:00Z' }
            ],
            windowStatus: {
                inside24hWindow: true,
                remainingSeconds: 7200,
                expiresAt: '2026-10-24T22:00:00Z',
                reason: 'CUSTOMER_MESSAGE_WITHIN_24H'
            }
        });

        supportChatService.getLogisticsContext.mockResolvedValue({
            success: true,
            customer: { name: 'Nawaf Al-Mutawa', phone: '+965 99887766' },
            activeShipments: [
                { trackingNumber: 'TRG-KW-101', status: 'in_transit', codAmount: 15 }
            ],
            pastShipments: []
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Test Harness Component
    const TestConsumer = () => {
        const {
            unreadCount,
            conversations,
            messages,
            activeConversation,
            selectConversation,
            sendMessage,
            toggleConversationStatus,
            windowStatus,
            loadingMessages
        } = useSupportChat();

        return (
            <div>
                <span data-testid="unread-count">{unreadCount}</span>
                <span data-testid="conversations-count">{conversations.length}</span>
                <span data-testid="messages-count">{messages.length}</span>
                <span data-testid="active-id">{activeConversation?.id || 'none'}</span>
                <span data-testid="window-status">{windowStatus.inside24hWindow ? 'active' : 'expired'}</span>
                <span data-testid="loading-messages">{String(loadingMessages)}</span>
                <div data-testid="message-list">
                    {messages.map(m => (
                        <div key={m.id} data-testid={`msg-${m.id}`}>
                            {m.content}
                        </div>
                    ))}
                </div>
                <button
                    data-testid="select-btn"
                    onClick={() => selectConversation(101)}
                >
                    Select 101
                </button>
                <button
                    data-testid="select-102-btn"
                    onClick={() => selectConversation(102)}
                >
                    Select 102
                </button>
                <button
                    data-testid="send-btn"
                    onClick={() => sendMessage({ content: 'Agent response test' })}
                >
                    Send
                </button>
                <button
                    data-testid="resolve-btn"
                    onClick={() => toggleConversationStatus(101, 'resolved')}
                >
                    Resolve 101
                </button>
            </div>
        );
    };

    it('initializes and computes initial unread count math and loads conversations', async () => {
        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('unread-count').textContent).toBe('4');
            expect(screen.getByTestId('conversations-count').textContent).toBe('2');
        });

        expect(supportChatService.getUnreadCount).toHaveBeenCalled();
        expect(supportChatService.getConversations).toHaveBeenCalled();
    });

    it('selects conversation, loads messages and decreases unread count', async () => {
        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('conversations-count').textContent).toBe('2');
        });

        await act(async () => {
            screen.getByTestId('select-btn').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('active-id').textContent).toBe('101');
            expect(screen.getByTestId('messages-count').textContent).toBe('1');
            // Unread count decremented by 1 when opened
            expect(screen.getByTestId('unread-count').textContent).toBe('3');
        });

        expect(supportChatService.getMessages).toHaveBeenCalledWith(101);
        expect(supportChatService.getLogisticsContext).toHaveBeenCalled();
    });

    it('handles incoming SSE real-time message event without full page reload', async () => {
        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('conversations-count').textContent).toBe('2');
        });

        // Select conversation 101
        await act(async () => {
            screen.getByTestId('select-btn').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('messages-count').textContent).toBe('1');
        });

        // Trigger incoming SSE message on conversation 101
        expect(sseListeners['message']).toBeDefined();
        await act(async () => {
            sseListeners['message']({
                data: JSON.stringify({
                    conversationId: 101,
                    message: {
                        id: 999,
                        content: 'Realtime update received!',
                        messageType: 'incoming',
                        createdAt: new Date().toISOString()
                    }
                })
            });
        });

        // Thread appends incoming real-time message
        await waitFor(() => {
            expect(screen.getByTestId('messages-count').textContent).toBe('2');
        });
    });

    it('handles incoming SSE unread_update event', async () => {
        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('unread-count').textContent).toBe('4');
        });

        expect(sseListeners['unread_update']).toBeDefined();
        await act(async () => {
            sseListeners['unread_update']({
                data: JSON.stringify({ unreadCount: 7 })
            });
        });

        await waitFor(() => {
            expect(screen.getByTestId('unread-count').textContent).toBe('7');
        });
    });

    it('triggers sync when document visibilitychange occurs (tab focus restored)', async () => {
        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(supportChatService.getUnreadCount).toHaveBeenCalledTimes(1);
        });

        // Simulate switching away and coming back to tab
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible'
        });

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        await waitFor(() => {
            expect(supportChatService.getUnreadCount).toHaveBeenCalledTimes(2);
        });
    });

    it('sends agent reply and updates status correctly', async () => {
        supportChatService.sendMessage.mockResolvedValue({
            success: true,
            message: { id: 888, content: 'Agent response test', status: 'delivered' }
        });
        supportChatService.toggleStatus.mockResolvedValue({
            success: true,
            status: 'resolved'
        });

        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('conversations-count').textContent).toBe('2');
        });

        // Select 101
        await act(async () => {
            screen.getByTestId('select-btn').click();
        });

        // Send message
        await act(async () => {
            screen.getByTestId('send-btn').click();
        });

        await waitFor(() => {
            expect(supportChatService.sendMessage).toHaveBeenCalledWith(101, expect.objectContaining({
                content: 'Agent response test'
            }));
            expect(screen.getByTestId('messages-count').textContent).toBe('2');
        });

        // Resolve conversation
        await act(async () => {
            screen.getByTestId('resolve-btn').click();
        });

        await waitFor(() => {
            expect(supportChatService.toggleStatus).toHaveBeenCalledWith(101, 'resolved');
        });
    });

    it('prevents cross-conversation message bleed when switching from Conversation A to Conversation B', async () => {
        supportChatService.getMessages.mockImplementation(async (convId) => {
            if (convId === 101) {
                return {
                    success: true,
                    messages: [
                        { id: 1011, content: 'Message for Conversation 101', messageType: 'incoming', createdAt: '2026-10-24T10:00:00Z' }
                    ],
                    windowStatus: { inside24hWindow: true, remainingSeconds: 7200 }
                };
            }
            if (convId === 102) {
                return {
                    success: true,
                    messages: [
                        { id: 1021, content: 'Message for Conversation 102', messageType: 'incoming', createdAt: '2026-10-24T11:00:00Z' }
                    ],
                    windowStatus: { inside24hWindow: true, remainingSeconds: 7200 }
                };
            }
            return { success: true, messages: [] };
        });

        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('conversations-count').textContent).toBe('2');
        });

        // 1. Select Conversation 101
        await act(async () => {
            screen.getByTestId('select-btn').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('active-id').textContent).toBe('101');
            expect(screen.getByTestId('msg-1011')).toBeInTheDocument();
            expect(screen.getByTestId('messages-count').textContent).toBe('1');
        });

        // 2. Select Conversation 102
        await act(async () => {
            screen.getByTestId('select-102-btn').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('active-id').textContent).toBe('102');
            expect(screen.getByTestId('msg-1021')).toBeInTheDocument();
            expect(screen.queryByTestId('msg-1011')).toBeNull();
            expect(screen.getByTestId('messages-count').textContent).toBe('1');
        });
    });

    it('discards stale message response if active conversation switched while previous request was in flight', async () => {
        let resolve101;
        const promise101 = new Promise((resolve) => {
            resolve101 = resolve;
        });

        supportChatService.getMessages.mockImplementation(async (convId) => {
            if (convId === 101) {
                return await promise101;
            }
            if (convId === 102) {
                return {
                    success: true,
                    messages: [
                        { id: 1021, content: 'Valid messages for 102', messageType: 'incoming', createdAt: '2026-10-24T11:00:00Z' }
                    ],
                    windowStatus: { inside24hWindow: true, remainingSeconds: 7200 }
                };
            }
            return { success: true, messages: [] };
        });

        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId('conversations-count').textContent).toBe('2');
        });

        // Start selecting 101 (in flight)
        act(() => {
            screen.getByTestId('select-btn').click();
        });

        // While 101 is in flight, select 102
        await act(async () => {
            screen.getByTestId('select-102-btn').click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('active-id').textContent).toBe('102');
            expect(screen.getByTestId('msg-1021')).toBeInTheDocument();
        });

        // Now resolve 101's stale response
        await act(async () => {
            resolve101({
                success: true,
                messages: [
                    { id: 1011, content: 'Stale 101 message that must be discarded', messageType: 'incoming', createdAt: '2026-10-24T10:00:00Z' }
                ],
                windowStatus: { inside24hWindow: true, remainingSeconds: 7200 }
            });
        });

        // 101 message must NOT bleed into 102
        expect(screen.queryByTestId('msg-1011')).toBeNull();
        expect(screen.getByTestId('messages-count').textContent).toBe('1');
        expect(screen.getByTestId('msg-1021')).toBeInTheDocument();
    });

    it('runs 4-second background interval polling with silent: true without setting loadingMessages', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });

        supportChatService.getMessages.mockResolvedValue({
            success: true,
            messages: [
                { id: 101, content: 'Initial message', messageType: 'incoming', createdAt: '2026-10-24T10:00:00Z' }
            ],
            windowStatus: { inside24hWindow: true, remainingSeconds: 7200 }
        });

        render(
            <SupportChatProvider>
                <TestConsumer />
            </SupportChatProvider>
        );

        // Select 101
        await act(async () => {
            screen.getByTestId('select-btn').click();
        });

        expect(screen.getByTestId('active-id').textContent).toBe('101');
        expect(screen.getByTestId('loading-messages').textContent).toBe('false');

        const callsBefore = supportChatService.getMessages.mock.calls.length;

        // Advance timers by 4000ms
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000);
        });

        // Background poll was triggered
        expect(supportChatService.getMessages.mock.calls.length).toBeGreaterThan(callsBefore);
        const lastCall = supportChatService.getMessages.mock.calls[supportChatService.getMessages.mock.calls.length - 1];
        expect(lastCall[0]).toBe(101);

        // loadingMessages was not turned on during silent background poll
        expect(screen.getByTestId('loading-messages').textContent).toBe('false');

        vi.useRealTimers();
    });
});
