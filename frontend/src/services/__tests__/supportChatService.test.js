import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
    default: {},
    API_URL: 'https://api.example.test/api'
}));

import supportChatService from '../supportChatService';

describe('supportChatService SSE authentication', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('authenticates the event stream with an HttpOnly cookie instead of a URL token', async () => {
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('event: message\ndata: {"conversationId":18}\n\n'));
            }
        });
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body });
        vi.stubGlobal('fetch', fetchMock);

        localStorage.setItem('token', 'sensitive-test-token');
        const source = supportChatService.createEventsSource();
        const receivedEvent = new Promise((resolve) => source.addEventListener('message', resolve));
        const event = await receivedEvent;

        expect(event.data).toBe('{"conversationId":18}');
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.test/api/support/events',
            expect.objectContaining({
                headers: { Accept: 'text/event-stream' },
                credentials: 'include'
            })
        );
        expect(fetchMock.mock.calls[0][0]).not.toContain('sensitive-test-token');
        expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('sensitive-test-token');
        localStorage.removeItem('token');

        source.close();
    });
});
