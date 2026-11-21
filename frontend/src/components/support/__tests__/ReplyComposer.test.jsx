import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { ReplyComposer } from '../ReplyComposer';

const auth = vi.hoisted(() => ({ user: {} }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../context/LanguageContext', () => ({ useLanguage: () => ({ isRTL: false }) }));
vi.mock('../../../context/SupportChatContext', () => ({ useSupportChat: () => ({
    windowStatus: { inside24hWindow: true }, sendingMessage: false, sendMessage: vi.fn()
}) }));
afterEach(cleanup);

it.each([true, false, undefined])('uses safe token configuration flag (%s) without receiving credentials', (configured) => {
    auth.user = { name: 'Agent', hasChatwootToken: configured };
    render(<ReplyComposer conversation={{ id: 1 }} draftText="Hello" />);
    expect(screen.getByTestId('free-text-input').disabled).toBe(configured !== true);
    expect(screen.getByTestId('send-free-text-btn').disabled).toBe(configured !== true);
});
