import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatwootConversationDrawer from './ChatwootConversationDrawer';

describe('ChatwootConversationDrawer Component', () => {
    const defaultProps = {
        isOpen: true,
        onClose: vi.fn(),
        accountId: '1',
        chatwootConversationId: '4501',
        phone: '+965 99112233',
        recipientName: 'Fahad Al-Mutawa',
        trackingNumber: 'TRG-KW-2026-00123'
    };

    it('renders null when isOpen is false', () => {
        const { container } = render(
            <ChatwootConversationDrawer {...defaultProps} isOpen={false} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders header with tracking number, recipient details, and thread badge when thread exists', () => {
        render(<ChatwootConversationDrawer {...defaultProps} />);

        expect(screen.getByText('TRG-KW-2026-00123')).toBeInTheDocument();
        expect(screen.getByText('Fahad Al-Mutawa')).toBeInTheDocument();
        expect(screen.getByText('+965 99112233')).toBeInTheDocument();
        expect(screen.getByText('Thread #4501')).toBeInTheDocument();
    });

    it('embeds iframe pointing to correct Chatwoot conversation URL with required sandbox attributes', () => {
        render(<ChatwootConversationDrawer {...defaultProps} />);

        const iframe = screen.getByTestId('chatwoot-iframe');
        expect(iframe).toBeInTheDocument();
        expect(iframe).toHaveAttribute(
            'src',
            'https://inbox.mawthook.io/app/accounts/1/conversations/4501'
        );
        expect(iframe).toHaveAttribute(
            'sandbox',
            'allow-same-origin allow-scripts allow-forms allow-popups'
        );
        expect(iframe).toHaveAttribute(
            'allow',
            'camera; microphone; clipboard-read; clipboard-write; fullscreen'
        );
    });

    it('renders loading indicator initially and hides it when iframe loads', () => {
        render(<ChatwootConversationDrawer {...defaultProps} />);

        expect(screen.getByTestId('chatwoot-iframe-loading')).toBeInTheDocument();

        const iframe = screen.getByTestId('chatwoot-iframe');
        fireEvent.load(iframe);

        expect(screen.queryByTestId('chatwoot-iframe-loading')).not.toBeInTheDocument();
    });

    it('renders fallback card with 1-click contact search button when chatwootConversationId is absent', () => {
        render(
            <ChatwootConversationDrawer
                {...defaultProps}
                chatwootConversationId={null}
                conversationId={null}
            />
        );

        expect(screen.queryByTestId('chatwoot-iframe')).not.toBeInTheDocument();
        expect(screen.getByTestId('chatwoot-fallback-card')).toBeInTheDocument();
        expect(
            screen.getByText('No existing conversation thread found for this shipment')
        ).toBeInTheDocument();

        const searchBtn = screen.getByTestId('chatwoot-fallback-search-btn');
        expect(searchBtn).toBeInTheDocument();
        expect(searchBtn).toHaveAttribute(
            'href',
            `https://inbox.mawthook.io/app/accounts/1/contacts?q=${encodeURIComponent('+965 99112233')}`
        );
        expect(searchBtn).toHaveAttribute('target', '_blank');
    });

    it('header open-in-new-tab button links directly to conversation URL when ID is present', () => {
        render(<ChatwootConversationDrawer {...defaultProps} />);

        const newTabBtn = screen.getByTestId('chatwoot-open-new-tab-btn');
        expect(newTabBtn).toHaveAttribute(
            'href',
            'https://inbox.mawthook.io/app/accounts/1/conversations/4501'
        );
    });

    it('header open-in-new-tab button links to contact search when conversation ID is missing', () => {
        render(
            <ChatwootConversationDrawer
                {...defaultProps}
                chatwootConversationId={null}
                conversationId={null}
            />
        );

        const newTabBtn = screen.getByTestId('chatwoot-open-new-tab-btn');
        expect(newTabBtn).toHaveAttribute(
            'href',
            `https://inbox.mawthook.io/app/accounts/1/contacts?q=${encodeURIComponent('+965 99112233')}`
        );
    });

    it('invokes onClose when close button or backdrop is clicked', () => {
        const onCloseMock = vi.fn();
        render(<ChatwootConversationDrawer {...defaultProps} onClose={onCloseMock} />);

        const closeBtn = screen.getByTestId('chatwoot-drawer-close-btn');
        fireEvent.click(closeBtn);
        expect(onCloseMock).toHaveBeenCalledTimes(1);

        const backdrop = screen.getByTestId('chatwoot-drawer-backdrop');
        fireEvent.click(backdrop);
        expect(onCloseMock).toHaveBeenCalledTimes(2);
    });

    it('invokes onClose when Escape key is pressed', () => {
        const onCloseMock = vi.fn();
        render(<ChatwootConversationDrawer {...defaultProps} onClose={onCloseMock} />);

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
});
