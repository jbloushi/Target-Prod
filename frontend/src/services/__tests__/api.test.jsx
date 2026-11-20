import { describe, expect, it } from 'vitest';
import { redactFailedRequest } from '../api';

describe('API error logging redaction', () => {
    it('removes credentials, bodies, and query parameters from errors before they are logged', () => {
        const error = {
            message: 'Request failed: Authorization: Bearer private-token?access_token=private-query-token',
            config: {
                url: '/users/search?phone=private-number',
                headers: { Authorization: 'Bearer private-token' },
                data: JSON.stringify({ password: 'private-password' }),
                params: { access_token: 'private-query-token' }
            },
            response: {
                status: 500,
                config: {
                    url: '/users/search?phone=private-number',
                    headers: { Authorization: 'Bearer private-token' }
                },
                request: { privateToken: 'private-token' },
                data: { error: 'Request failed', access_token: 'private-query-token', details: 'Checkout?session_id=private-session' }
            },
            request: { privateToken: 'private-token' }
        };

        redactFailedRequest(error);

        const loggedError = JSON.stringify(error);
        expect(loggedError).not.toContain('private-token');
        expect(loggedError).not.toContain('private-password');
        expect(loggedError).not.toContain('private-number');
        expect(loggedError).not.toContain('private-query-token');
        expect(loggedError).not.toContain('private-session');
        expect(error.config.headers).toEqual({});
        expect(error.config.data).toBeUndefined();
        expect(error.config.params).toBeUndefined();
        expect(error.response.request).toBeUndefined();
    });
});
