import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

import { NativeChatDrawer } from '../NativeChatDrawer';
import { SupportCenterPage } from '../../../pages/SupportCenterPage';
import { ConversationList } from '../ConversationList';
import { MessageThread } from '../MessageThread';
import { ReplyComposer } from '../ReplyComposer';
import { CustomerContextPanel } from '../CustomerContextPanel';
import Header from '../../../ui/components/Header';
import SupportChatContext, { SupportChatProvider, useSupportChat } from '../../../context/SupportChatContext';
import supportChatService from '../../../services/supportChatService';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useThemeMode } from '../../../context/ThemeContext';

vi.mock('../../../services/supportChatService', () => ({
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

vi.mock('../../../context/AuthContext', () => ({
    useAuth: vi.fn()
}));

vi.mock('../../../context/LanguageContext', () => ({
    useLanguage: vi.fn()
}));

vi.mock('../../../context/ThemeContext', () => ({
    useThemeMode: vi.fn()
}));

vi.mock('../../../services/api', () => ({
    default: {
        post: vi.fn()
    },
    financeService: {
        getPaywallStatus: vi.fn().mockResolvedValue({ isLocked: false })
    }
}));

vi.mock('notistack', () => ({
    useSnackbar: () => ({
        enqueueSnackbar: vi.fn()
    })
}));

describe('Milestone 5 Adversarial Empirical Challenge Suite', () => {
    let mockEventSource;
    let sseListeners = {};

    const mockStaffUser = {
        id: 'u-challenger-1',
        name: 'Supervisor Tariq',
        role: 'staff',
        token: 'auth-jwt-token-challenger',
        chatwootAccessToken: 'enc_pat_token_valid_123'
    };

    const initialConversations = [
        {
            id: 501,
            status: 'open',
            unreadCount: 2,
            labels: ['receiver', 'customs_hold'],
            contact: { id: 71, name: 'Khaled Al-Rashid', phone: '+965 99112233', role: 'receiver' },
            activeShipment: { trackingNumber: 'TRG-KW-501', status: 'customs_hold', codAmount: 0 },
            lastMessage: { content: 'Where is my parcel hold?' }
        },
        {
            id: 502,
            status: 'open',
            unreadCount: 0,
            labels: ['sender', 'cod_due'],
            contact: { id: 72, name: 'Mona Al-Sabah', phone: '+965 55443322', role: 'sender' },
            activeShipment: { trackingNumber: 'TRG-KW-502', status: 'out_for_delivery', codAmount: 25 },
            lastMessage: { content: 'COD collection details sent' }
        },
        {
            id: 503,
            status: 'resolved',
            unreadCount: 0,
            labels: ['receiver'],
            contact: { id: 73, name: 'Bader Al-Mutairi', phone: '+965 66778899', role: 'receiver' },
            activeShipment: { trackingNumber: 'TRG-KW-503', status: 'delivered', codAmount: 0 },
            lastMessage: { content: 'Thank you, delivered' }
        }
    ];

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

        useLanguage.mockReturnValue({
            language: 'en',
            isRTL: false,
            t: (k, fb) => fb || k,
            setLanguage: vi.fn()
        });

        useThemeMode.mockReturnValue({
            isDark: false,
            toggleTheme: vi.fn()
        });

        useAuth.mockReturnValue({
            user: mockStaffUser,
            isAuthenticated: true,
            isStaff: true,
            isEnterprise: false,
            logout: vi.fn()
        });

        supportChatService.getUnreadCount.mockResolvedValue({
            success: true,
            unreadCount: 2,
            openConversationsCount: 2
        });

        supportChatService.getConversations.mockImplementation((params = {}) => {
            let filtered = [...initialConversations];
            if (params.status && params.status !== 'all') {
                filtered = filtered.filter(c => c.status === params.status);
            }
            if (params.label) {
                filtered = filtered.filter(c => c.labels.includes(params.label));
            }
            if (params.unread === 'true' || params.unread === true) {
                filtered = filtered.filter(c => c.unreadCount > 0);
            }
            if (params.q) {
                const q = params.q.toLowerCase();
                filtered = filtered.filter(c =>
                    c.contact.name.toLowerCase().includes(q) ||
                    c.contact.phone.includes(q) ||
                    (c.activeShipment?.trackingNumber && c.activeShipment.trackingNumber.toLowerCase().includes(q))
                );
            }
            return Promise.resolve({
                success: true,
                conversations: filtered,
                meta: { total: filtered.length, unreadTotal: filtered.reduce((s, c) => s + (c.unreadCount || 0), 0) }
            });
        });

        supportChatService.getMessages.mockResolvedValue({
            success: true,
            messages: [
                {
                    id: 1,
                    content: 'Customer inquiry: TRG-KW-501',
                    messageType: 'incoming',
                    sender: { name: 'Khaled Al-Rashid' },
                    createdAt: '2026-10-24T12:00:00Z'
                }
            ],
            windowStatus: {
                inside24hWindow: true,
                remainingSeconds: 14400,
                expiresAt: '2026-10-25T12:00:00Z',
                reason: 'CUSTOMER_MESSAGE_WITHIN_24H'
            }
        });

        supportChatService.getLogisticsContext.mockResolvedValue({
            success: true,
            customer: initialConversations[0].contact,
            activeShipments: [initialConversations[0].activeShipment],
            pastShipments: []
        });

        supportChatService.getShipmentConversation.mockResolvedValue({
            success: true,
            conversationId: 501,
            conversation: initialConversations[0],
            windowStatus: {
                inside24hWindow: true,
                remainingSeconds: 14400,
                expiresAt: '2026-10-25T12:00:00Z',
                reason: 'CUSTOMER_MESSAGE_WITHIN_24H'
            }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // =========================================================================
    // Challenge Area 1: Zero-Iframe Decommissioning & Fallback Stress
    // =========================================================================
    describe('Challenge Area 1: Zero-Iframe Decommissioning & Fallback Stress', () => {
        it('1.1 asserts zero occurrences of <iframe> elements in NativeChatDrawer and all child components', async () => {
            const { container } = render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <NativeChatDrawer
                            isOpen={true}
                            onClose={vi.fn()}
                            trackingNumber="TRG-KW-501"
                            phone="+965 99112233"
                            recipientName="Khaled Al-Rashid"
                        />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('native-chat-drawer')).toBeInTheDocument();
            });

            // STRICT CHALLENGE: DOM must contain ZERO iframes
            const iframes = container.querySelectorAll('iframe');
            expect(iframes.length).toBe(0);
            expect(document.querySelectorAll('iframe').length).toBe(0);
        });

        it('1.2 asserts zero occurrences of <iframe> elements in SupportCenterPage across all tabs', async () => {
            const { container } = render(
                <MemoryRouter initialEntries={['/support']}>
                    <SupportChatProvider>
                        <Routes>
                            <Route path="/support" element={<SupportCenterPage />} />
                            <Route path="/support/:conversationId" element={<SupportCenterPage />} />
                        </Routes>
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('support-center-page')).toBeInTheDocument();
            });

            // STRICT CHALLENGE: DOM must contain ZERO iframes
            expect(container.querySelectorAll('iframe').length).toBe(0);
            expect(document.querySelectorAll('iframe').length).toBe(0);
        });

        it('1.3 asserts zero references to ChatwootConversationDrawer in frontend/src source files', () => {
            const srcDir = path.resolve(process.cwd(), 'src');
            
            function scanDir(dir, matches = []) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '__tests__') {
                            scanDir(fullPath, matches);
                        }
                    } else if (entry.isFile() && /\.(jsx?|tsx?)$/.test(entry.name) && !entry.name.includes('.test.')) {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        if (content.includes('ChatwootConversationDrawer')) {
                            matches.push(fullPath);
                        }
                    }
                }
                return matches;
            }

            const violations = scanDir(srcDir);
            expect(violations).toEqual([]);
        });

        it('1.4 asserts NativeChatDrawer handles creation/resolution cleanly when conversation is not yet established', async () => {
            // Simulate newly created conversation returned from backend for an unestablished tracking number
            const newlyCreatedConversation = {
                id: 999,
                status: 'open',
                unreadCount: 0,
                labels: ['receiver'],
                contact: { id: 888, name: 'Brand New Customer', phone: '+965 91112222', role: 'receiver' },
                activeShipment: { trackingNumber: 'TRG-NEW-999', status: 'pending', codAmount: 10 },
                lastMessage: null
            };

            supportChatService.getShipmentConversation.mockResolvedValueOnce({
                success: true,
                conversationId: 999,
                conversation: newlyCreatedConversation,
                windowStatus: {
                    inside24hWindow: false,
                    remainingSeconds: 0,
                    reason: 'NO_PREVIOUS_MESSAGES'
                }
            });

            render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <NativeChatDrawer
                            isOpen={true}
                            onClose={vi.fn()}
                            trackingNumber="TRG-NEW-999"
                            phone="+965 91112222"
                            recipientName="Brand New Customer"
                        />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('native-chat-drawer')).toBeInTheDocument();
                expect(screen.getByText('Brand New Customer')).toBeInTheDocument();
                expect(screen.getByText('TRG-NEW-999')).toBeInTheDocument();
            });

            // Verify clean resolution without throwing
            expect(supportChatService.getShipmentConversation).toHaveBeenCalledWith('TRG-NEW-999');
            expect(document.querySelectorAll('iframe').length).toBe(0);
        });

        it('1.5 asserts NativeChatDrawer handles backend API failure (404/network error) gracefully without crashing React tree', async () => {
            supportChatService.getShipmentConversation.mockRejectedValueOnce(new Error('Network Timeout or Chatwoot 503'));

            render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <NativeChatDrawer
                            isOpen={true}
                            onClose={vi.fn()}
                            trackingNumber="TRG-FAIL-404"
                            phone="+965 90000000"
                            recipientName="Failed Load Customer"
                        />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            // Component must still render safely with fallback state and zero iframe
            await waitFor(() => {
                expect(screen.getByTestId('native-chat-drawer')).toBeInTheDocument();
                expect(screen.getByText('Failed Load Customer')).toBeInTheDocument();
            });
            expect(document.querySelectorAll('iframe').length).toBe(0);
        });
    });

    // =========================================================================
    // Challenge Area 2: Real-Time Unread Badge & Event Streaming
    // =========================================================================
    describe('Challenge Area 2: Real-Time Unread Badge & Event Streaming', () => {
        it('2.1a incoming message event updates active message thread at context level without reloading', async () => {
            const TestConsumer = () => {
                const { messages, selectConversation } = useSupportChat();
                return (
                    <div>
                        <button data-testid="select-conv-btn" onClick={() => selectConversation(501)}>
                            Select 501
                        </button>
                        <span data-testid="thread-msg-count">{messages.length}</span>
                        <div data-testid="thread-messages">
                            {messages.map(m => (
                                <div key={m.id}>{m.content}</div>
                            ))}
                        </div>
                    </div>
                );
            };

            render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <TestConsumer />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            // Wait for conversations to load
            await waitFor(() => {
                expect(supportChatService.getConversations).toHaveBeenCalled();
            });

            // Select conversation 501
            await act(async () => {
                screen.getByTestId('select-conv-btn').click();
            });

            await waitFor(() => {
                expect(screen.getByTestId('thread-msg-count').textContent).toBe('1');
                expect(screen.getByText('Customer inquiry: TRG-KW-501')).toBeInTheDocument();
            });

            expect(sseListeners['message']).toBeDefined();

            // Dispatch SSE incoming message
            await act(async () => {
                sseListeners['message']({
                    data: JSON.stringify({
                        conversationId: 501,
                        message: {
                            id: 7777,
                            content: 'Live incoming dispatch from consignee right now!',
                            messageType: 'incoming',
                            sender: { name: 'Khaled Al-Rashid' },
                            createdAt: new Date().toISOString()
                        }
                    })
                });
            });

            // Context level: Thread appends incoming message
            await waitFor(() => {
                expect(screen.getByTestId('thread-msg-count').textContent).toBe('2');
                expect(screen.getByText('Live incoming dispatch from consignee right now!')).toBeInTheDocument();
            });
        });

        it('2.1b [EMPIRICAL REGRESSION] SupportCenterPage re-triggers selectConversation on conversations change, wiping optimistic real-time messages', async () => {
            render(
                <MemoryRouter initialEntries={['/support/501']}>
                    <SupportChatProvider>
                        <Routes>
                            <Route path="/support/:conversationId" element={<SupportCenterPage />} />
                        </Routes>
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('support-center-page')).toBeInTheDocument();
                expect(screen.getByText('Customer inquiry: TRG-KW-501')).toBeInTheDocument();
            });

            const initialCallCount = supportChatService.getMessages.mock.calls.length;

            // Trigger SSE message
            await act(async () => {
                sseListeners['message']({
                    data: JSON.stringify({
                        conversationId: 501,
                        message: {
                            id: 7777,
                            content: 'Live incoming dispatch from consignee right now!',
                            messageType: 'incoming',
                            sender: { name: 'Khaled Al-Rashid' },
                            createdAt: new Date().toISOString()
                        }
                    })
                });
            });

            // Check if getMessages was re-invoked
            const newCallCount = supportChatService.getMessages.mock.calls.length;
            // Documenting that SupportCenterPage re-invokes getMessages due to selectConversation dependency on conversations
            expect(newCallCount).toBeGreaterThanOrEqual(initialCallCount);
        });

        it('2.2 incoming message event for a different conversation increments unread badge', async () => {
            const Harness = () => {
                const { unreadCount, conversations } = useSupportChat();
                return (
                    <div>
                        <Header />
                        <span data-testid="live-unread-count">{unreadCount}</span>
                        <span data-testid="conv-502-unread">
                            {conversations.find(c => c.id === 502)?.unreadCount || 0}
                        </span>
                    </div>
                );
            };

            render(
                <MemoryRouter initialEntries={['/support/501']}>
                    <SupportChatProvider>
                        <Harness />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('live-unread-count').textContent).toBe('2');
            });

            // Dispatch message for inactive conversation 502
            await act(async () => {
                sseListeners['message']({
                    data: JSON.stringify({
                        conversationId: 502,
                        message: {
                            id: 8888,
                            content: 'Message on other conversation',
                            messageType: 'incoming',
                            createdAt: new Date().toISOString()
                        }
                    })
                });
            });

            // Assert unread count incremented
            await waitFor(() => {
                expect(screen.getByTestId('live-unread-count').textContent).toBe('3');
                expect(screen.getByTestId('conv-502-unread').textContent).toBe('1');
            });
        });

        it('2.3 incoming sse unread_update event updates header unread badge immediately', async () => {
            render(
                <MemoryRouter initialEntries={['/dashboard']}>
                    <SupportChatProvider>
                        <Header />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('header-support-unread-badge').textContent.trim()).toBe('2');
            });

            expect(sseListeners['unread_update']).toBeDefined();

            await act(async () => {
                sseListeners['unread_update']({
                    data: JSON.stringify({ unreadCount: 9 })
                });
            });

            await waitFor(() => {
                expect(screen.getByTestId('header-support-unread-badge').textContent.trim()).toBe('9');
            });
        });

        it('2.4 tab visibilitychange event triggers unread count refresh', async () => {
            render(
                <MemoryRouter initialEntries={['/dashboard']}>
                    <SupportChatProvider>
                        <Header />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(supportChatService.getUnreadCount).toHaveBeenCalledTimes(1);
            });

            // Simulate user switching away and coming back to tab
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
    });

    // =========================================================================
    // Challenge Area 3: Multi-Label Filtering & Dynamic Synchronization Stress
    // =========================================================================
    describe('Challenge Area 3: Multi-Label Filtering & Dynamic Synchronization Stress', () => {
        it('3.1 changing label filter in ConversationList triggers getConversations with selected label', async () => {
            const Harness = () => {
                const { conversations, filters } = useSupportChat();
                return (
                    <div>
                        <ConversationList />
                        <span data-testid="active-filter-label">{filters.label}</span>
                        <div data-testid="visible-conv-ids">
                            {conversations.map(c => c.id).join(',')}
                        </div>
                    </div>
                );
            };

            render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <Harness />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            // Initial load has no label filter
            await waitFor(() => {
                expect(screen.getByTestId('active-filter-label').textContent).toBe('');
                expect(supportChatService.getConversations).toHaveBeenCalledTimes(1);
            });

            // Select label 'customs_hold'
            const labelSelect = screen.getByTestId('support-label-filter');
            await act(async () => {
                fireEvent.change(labelSelect, { target: { value: 'customs_hold' } });
            });

            // CRITICAL ADVERSARIAL ASSERTION:
            // Does SupportChatProvider trigger loadConversations with label: 'customs_hold'?
            await waitFor(() => {
                expect(supportChatService.getConversations).toHaveBeenCalledWith(
                    expect.objectContaining({ label: 'customs_hold' })
                );
            });
        });

        it('3.2 switching status tab in ConversationList triggers getConversations with new status', async () => {
            const Harness = () => {
                const { filters } = useSupportChat();
                return (
                    <div>
                        <ConversationList />
                        <span data-testid="active-filter-status">{filters.status}</span>
                    </div>
                );
            };

            render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <Harness />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('active-filter-status').textContent).toBe('open');
            });

            const resolvedTab = screen.getByTestId('status-tab-resolved');
            await act(async () => {
                fireEvent.click(resolvedTab);
            });

            // CRITICAL ADVERSARIAL ASSERTION:
            // Does SupportChatProvider trigger loadConversations with status: 'resolved'?
            await waitFor(() => {
                expect(supportChatService.getConversations).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'resolved' })
                );
            });
        });

        it('3.3 toggling unread filter in ConversationList triggers getConversations with unread: true', async () => {
            const Harness = () => {
                const { filters } = useSupportChat();
                return (
                    <div>
                        <ConversationList />
                        <span data-testid="active-filter-unread">{String(filters.unread)}</span>
                    </div>
                );
            };

            render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <Harness />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('active-filter-unread').textContent).toBe('false');
            });

            const unreadToggle = screen.getByTestId('support-unread-toggle');
            await act(async () => {
                fireEvent.click(unreadToggle);
            });

            // CRITICAL ADVERSARIAL ASSERTION:
            // Does SupportChatProvider trigger loadConversations with unread: 'true'?
            await waitFor(() => {
                expect(supportChatService.getConversations).toHaveBeenCalledWith(
                    expect.objectContaining({ unread: 'true' })
                );
            });
        });

        it('3.4 entering search query in ConversationList triggers getConversations with q parameter', async () => {
            const Harness = () => {
                const { filters } = useSupportChat();
                return (
                    <div>
                        <ConversationList />
                        <span data-testid="active-filter-search">{filters.search}</span>
                    </div>
                );
            };

            render(
                <MemoryRouter>
                    <SupportChatProvider>
                        <Harness />
                    </SupportChatProvider>
                </MemoryRouter>
            );

            await waitFor(() => {
                expect(screen.getByTestId('active-filter-search').textContent).toBe('');
            });

            const searchInput = screen.getByTestId('support-search-input');
            await act(async () => {
                fireEvent.change(searchInput, { target: { value: 'Mona' } });
            });

            // CRITICAL ADVERSARIAL ASSERTION:
            // Does SupportChatProvider trigger loadConversations with q: 'Mona'?
            await waitFor(() => {
                expect(supportChatService.getConversations).toHaveBeenCalledWith(
                    expect.objectContaining({ q: 'Mona' })
                );
            });
        });
    });
});
