import { describe, expect, it } from 'vitest';
import { formatExactMessageCopy } from './AdminWhatsAppLogsPage';

describe('WhatsApp log message copy', () => {
    it('shows the recorded Chatwoot message instead of rebuilding it from recipient fields', () => {
        const content = 'Thank you for choosing us.\nReceiver Name: AMIRA ALOTAIBI\nReceiver Tel: 966533309338';
        const log = {
            templateName: 'shipment_confirmation_2',
            recipientRole: 'sender',
            recipientName: '55757585',
            recipientPhone: '+96555757585',
            payloadJson: {
                content,
                template_params: {
                    parameters: ['Bill #47251', '21 October 2026', 'AMIRA ALOTAIBI', '966533309338', 'https://target-kw.com/track/TRK-38290497081']
                }
            }
        };

        expect(formatExactMessageCopy(log)).toBe(content);
    });

    it('uses recorded template parameters when message content is unavailable', () => {
        const log = {
            trackingNumber: 'TRK-38290497081',
            templateName: 'shipment_confirmation_2',
            recipientName: '55757585',
            recipientPhone: '+96555757585',
            payloadJson: {
                template_params: {
                    parameters: ['Bill #47251', '21 October 2026', 'AMIRA ALOTAIBI', '966533309338', 'https://target-kw.com/track/TRK-38290497081']
                }
            }
        };

        const display = formatExactMessageCopy(log);
        expect(display).toContain('Receiver Name: AMIRA ALOTAIBI');
        expect(display).toContain('Receiver Tel: 966533309338');
        expect(display).not.toContain('55757585');
    });
});
