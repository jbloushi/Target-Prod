import { describe, expect, it } from 'vitest';
import { getWhatsAppLogStatusPresentation } from './whatsappLogStatus';

describe('WhatsApp log status presentation', () => {
  it('shows provider-submitted messages as sent while keeping the pending-receipt meaning', () => {
    expect(getWhatsAppLogStatusPresentation('submitted')).toEqual({
      key: 'SUBMITTED',
      badgeKey: 'SENT',
      label: 'Sent',
      title: 'Accepted by the messaging provider; awaiting delivery receipt'
    });
  });

  it('normalizes delivery states and localizes labels', () => {
    expect(getWhatsAppLogStatusPresentation('submit').label).toBe('Sent');
    expect(getWhatsAppLogStatusPresentation('accepted').badgeKey).toBe('SENT');
    expect(getWhatsAppLogStatusPresentation('delivered', 'ar').label).toBe('تم التوصيل');
    expect(getWhatsAppLogStatusPresentation('READ').label).toBe('Read');
    expect(getWhatsAppLogStatusPresentation('queued').badgeKey).toBe('QUEUED');
    expect(getWhatsAppLogStatusPresentation('skipped').label).toBe('Skipped');
  });
});
