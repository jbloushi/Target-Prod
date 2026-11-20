const STATUS_DISPLAY = {
  SENT: { en: 'Sent', ar: 'تم الإرسال', title: 'Accepted by the messaging provider; awaiting delivery receipt' },
  SUBMITTED: { en: 'Sent', ar: 'تم الإرسال', title: 'Accepted by the messaging provider; awaiting delivery receipt' },
  SUBMIT: { en: 'Sent', ar: 'تم الإرسال', title: 'Accepted by the messaging provider; awaiting delivery receipt' },
  ACCEPTED: { en: 'Sent', ar: 'تم الإرسال', title: 'Accepted by the messaging provider; awaiting delivery receipt' },
  DELIVERED: { en: 'Delivered', ar: 'تم التوصيل', title: 'Delivery confirmed by the recipient handset' },
  READ: { en: 'Read', ar: 'تمت القراءة', title: 'Read receipt confirmed by the recipient handset' },
  FAILED: { en: 'Failed', ar: 'فشل', title: 'The provider reported that the message failed' },
  QUEUED: { en: 'Queued', ar: 'في الانتظار', title: 'Waiting to be dispatched' },
  PENDING: { en: 'Queued', ar: 'في الانتظار', title: 'Waiting to be dispatched' },
  SKIPPED: { en: 'Skipped', ar: 'تم التخطي', title: 'Dispatch was intentionally skipped' }
};

export const getWhatsAppLogStatusPresentation = (status, lang = 'en') => {
  const key = String(status || 'QUEUED').trim().toUpperCase();
  const entry = STATUS_DISPLAY[key];
  return {
    key,
    badgeKey: ['SUBMITTED', 'SUBMIT', 'ACCEPTED'].includes(key) ? 'SENT' : key,
    label: entry ? entry[lang === 'ar' ? 'ar' : 'en'] : key,
    title: entry?.title || key
  };
};
