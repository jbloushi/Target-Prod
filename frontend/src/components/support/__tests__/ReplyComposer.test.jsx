import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { ReplyComposer } from '../ReplyComposer';

const chat = vi.hoisted(() => ({ windowStatus: { inside24hWindow: true }, sendingMessage: false, sendMessage: vi.fn() }));
const auth = vi.hoisted(() => ({ user: {} }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../context/LanguageContext', () => ({ useLanguage: () => ({ isRTL: false }) }));
vi.mock('../../../context/SupportChatContext', () => ({ useSupportChat: () => chat }));
afterEach(cleanup);

it.each([true, false, undefined])('uses safe token configuration flag (%s) without receiving credentials', (configured) => {
    auth.user = { name: 'Agent', hasChatwootToken: configured };
    render(<ReplyComposer conversation={{ id: 1 }} draftText="Hello" />);
    expect(screen.getByTestId('free-text-input').disabled).toBe(configured !== true);
    expect(screen.getByTestId('send-free-text-btn').disabled).toBe(configured !== true);
});

it('saves private notes outside the WhatsApp reply window without sending a template', async () => {
    auth.user = { hasChatwootToken: true };
    chat.windowStatus.inside24hWindow = false;
    chat.sendMessage.mockResolvedValue({});
    render(<ReplyComposer conversation={{ id: 1 }} draftText="Staff follow-up" />);
    fireEvent.click(screen.getByTestId('private-note-toggle'));
    expect(screen.queryByTestId('window-expired-composer-banner')).toBeNull();
    fireEvent.click(screen.getByTestId('send-free-text-btn'));
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalledWith({
        content: 'Staff follow-up', isPrivate: true, isTemplate: false
    }));
});
