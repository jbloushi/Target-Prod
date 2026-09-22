import React, { useState, useEffect } from 'react';
import { useSnackbar } from 'notistack';
import { whatsappService } from '../services/api';
import { TK } from '../tokens/kineticHorizon';
import { useLanguage } from '../context/LanguageContext';

export const AdminWhatsAppLogsPage = () => {
  const { t, lang, isRTL } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ sentToday: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  const fetchLogs = async (page = 1) => {
    try {
      setLoading(true);
      const res = await whatsappService.getLogs({
        page,
        limit: pagination.limit,
        status: statusFilter,
        search
      });
      const data = res.data || res;
      if (data.success || data.logs) {
        setLogs(data.logs || []);
        setStats(data.stats || { sentToday: 0, totalDelivered: 0, totalRead: 0, totalFailed: 0 });
        setPagination(data.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
      }
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل تحميل سجلات رسائل واتساب' : 'Failed to load WhatsApp message logs', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [statusFilter]);

  const handleResend = async (id) => {
    try {
      setResendingId(id);
      await whatsappService.resendNotification(id);
      enqueueSnackbar(lang === 'ar' ? 'تم إعادة إرسال رسالة واتساب بنجاح!' : 'WhatsApp message resent successfully!', { variant: 'success' });
      fetchLogs(pagination.page);
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? `فشل إعادة الإرسال: ${err.message}` : `Resend failed: ${err.message}`, { variant: 'error' });
    } finally {
      setResendingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DELIVERED':
        return { bg: '#dcfce7', text: '#15803d', label: lang === 'ar' ? 'تم التوصيل' : 'Delivered', icon: 'done_all' };
      case 'READ':
        return { bg: '#e0f2fe', text: '#0369a1', label: lang === 'ar' ? 'تمت القراءة' : 'Read', icon: 'visibility' };
      case 'SENT':
        return { bg: '#fef3c7', text: '#b45309', label: lang === 'ar' ? 'تم الإرسال' : 'Sent', icon: 'done' };
      case 'FAILED':
        return { bg: '#fee2e2', text: '#b91c1c', label: lang === 'ar' ? 'فشل' : 'Failed', icon: 'error' };
      default:
        return { bg: '#f1f5f9', text: '#475569', label: status || (lang === 'ar' ? 'في الانتظار' : 'Queued'), icon: 'schedule' };
    }
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px', fontFamily: TK.fontFamily, direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Header title */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: TK.text1, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#25D366' }}>chat</span>
            {lang === 'ar' ? 'لوحة تدقيق إشعارات واتساب' : 'WhatsApp Notification Audit Cockpit'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: TK.text3 }}>
            {lang === 'ar' ? 'مراقبة إيصالات استلام رسائل واتساب في الوقت الفعلي، وحالات الويب هوك، وتتبع المستلمين.' : 'Monitor real-time WhatsApp message delivery receipts, status webhooks, and recipient tracking.'}
          </p>
        </div>
        <button
          onClick={() => fetchLogs(pagination.page)}
          style={{
            padding: '10px 18px', borderRadius: 12, border: `1px solid ${TK.border}`,
            background: '#fff', color: TK.text1, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
          {lang === 'ar' ? 'تحديث السجلات' : 'Refresh Logs'}
        </button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: `1px solid ${TK.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>{lang === 'ar' ? 'المرسلة اليوم' : 'Sent Today'}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: TK.text1, marginTop: 4 }}>{stats.sentToday}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: `1px solid ${TK.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>{lang === 'ar' ? 'إجمالي المستلمة' : 'Total Delivered'}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#15803d', marginTop: 4 }}>{stats.totalDelivered}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: `1px solid ${TK.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>{lang === 'ar' ? 'إجمالي المقروءة' : 'Total Read'}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0369a1', marginTop: 4 }}>{stats.totalRead}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: `1px solid ${TK.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase' }}>{lang === 'ar' ? 'فشل التوصيل' : 'Delivery Failures'}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#b91c1c', marginTop: 4 }}>{stats.totalFailed}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['ALL', 'SENT', 'DELIVERED', 'READ', 'FAILED'].map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700,
                background: statusFilter === st ? TK.primary : '#f1f5f9',
                color: statusFilter === st ? '#fff' : TK.text2
              }}
            >
              {lang === 'ar' ? (st === 'ALL' ? 'الكل' : st === 'SENT' ? 'تم الإرسال' : st === 'DELIVERED' ? 'تم التوصيل' : st === 'READ' ? 'تمت القراءة' : 'فشل') : st}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); fetchLogs(1); }}
          style={{ display: 'flex', gap: 8, flex: '1 1 300px', maxWidth: 400 }}
        >
          <input
            type="text"
            placeholder={lang === 'ar' ? 'ابحث عن رقم التتبع أو الهاتف أو wamid...' : 'Search tracking #, phone, or wamid...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${TK.border}`,
              fontSize: 13, color: TK.text1, outline: 'none'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer'
            }}
          >
            {lang === 'ar' ? 'بحث' : 'Search'}
          </button>
        </form>
      </div>

      {/* Main Table */}
      <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${TK.border}`, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: TK.text3 }}>{lang === 'ar' ? 'جاري تحميل سجلات تدقيق الرسائل...' : 'Loading message audit logs...'}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: TK.text3 }}>{lang === 'ar' ? 'لم تتطابق أي سجلات رسائل واتساب مع معايير البحث.' : 'No WhatsApp message logs matched the criteria.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${TK.border}`, textAlign: lang === 'ar' ? 'right' : 'left' }}>
                  <th style={{ padding: '14px 18px', fontWeight: 700, color: TK.text2 }}>{lang === 'ar' ? 'رقم التتبع' : 'Tracking #'}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, color: TK.text2 }}>{lang === 'ar' ? 'المستلم' : 'Recipient'}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, color: TK.text2 }}>{lang === 'ar' ? 'الحدث / القالب' : 'Event / Template'}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, color: TK.text2 }}>{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, color: TK.text2 }}>{lang === 'ar' ? 'WAMID الخارجي' : 'External WAMID'}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, color: TK.text2 }}>{lang === 'ar' ? 'وقت الإرسال' : 'Sent Time'}</th>
                  <th style={{ padding: '14px 18px', fontWeight: 700, color: TK.text2, textAlign: lang === 'ar' ? 'left' : 'right' }}>{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const badge = getStatusBadge(log.status);
                  return (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${TK.border}` }}>
                      <td style={{ padding: '14px 18px', fontWeight: 800, color: TK.primary, fontFamily: 'monospace' }}>
                        {log.trackingNumber}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 700, color: TK.text1 }}>{log.recipientName || log.recipientRole}</div>
                        <div style={{ fontSize: 11, color: TK.text3, fontFamily: 'monospace', direction: 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}>{log.recipientPhone}</div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 600, color: TK.text1 }}>{log.eventType}</div>
                        <div style={{ fontSize: 11, color: TK.text3 }}>{log.templateName}</div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 800,
                          background: badge.bg, color: badge.text, display: 'inline-flex', alignItems: 'center', gap: 4
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{badge.icon}</span>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', fontFamily: 'monospace', fontSize: 11, color: TK.text3 }}>
                        {log.externalMessageId || '—'}
                      </td>
                      <td style={{ padding: '14px 18px', color: TK.text3, fontSize: 12 }}>
                        {new Date(log.sentAt).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US')}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: lang === 'ar' ? 'left' : 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: lang === 'ar' ? 'flex-start' : 'flex-end' }}>
                          <button
                            onClick={() => setSelectedLog(log)}
                            style={{
                              padding: '6px 12px', borderRadius: 8, border: `1px solid ${TK.border}`,
                              background: '#fff', fontSize: 12, fontWeight: 700, color: TK.text1, cursor: 'pointer'
                            }}
                          >
                            {lang === 'ar' ? 'فحص' : 'Inspect'}
                          </button>
                          {log.status === 'FAILED' && (
                            <button
                              onClick={() => handleResend(log.id)}
                              disabled={resendingId === log.id}
                              style={{
                                padding: '6px 12px', borderRadius: 8, border: 'none',
                                background: TK.primary, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer'
                              }}
                            >
                              {resendingId === log.id ? (lang === 'ar' ? 'جاري إعادة الإرسال...' : 'Resending...') : (lang === 'ar' ? 'إعادة إرسال' : 'Resend')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Raw Payload Inspection */}
      {selectedLog && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#fff', borderRadius: 18, width: '90%', maxWidth: 650, padding: 24,
            maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${TK.border}`,
            direction: 'ltr' // Keeping payload LTR might be better for pre tag but let's keep it contextual
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, direction: isRTL ? 'rtl' : 'ltr' }}>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18, color: TK.text1 }}>{lang === 'ar' ? 'سجل حمولة إشعارات واتساب' : 'WhatsApp Notification Payload Log'}</h3>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20 }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, direction: isRTL ? 'rtl' : 'ltr' }}>
              <div><strong>{lang === 'ar' ? 'رقم التتبع:' : 'Tracking Number:'}</strong> <span dir="ltr">{selectedLog.trackingNumber}</span></div>
              <div><strong>{lang === 'ar' ? 'هاتف المستلم:' : 'Recipient Phone:'}</strong> <span dir="ltr">{selectedLog.recipientPhone}</span></div>
              <div><strong>{lang === 'ar' ? 'معرف الرسالة الخارجي:' : 'External Message ID:'}</strong> <span dir="ltr">{selectedLog.externalMessageId || (lang === 'ar' ? 'لا يوجد' : 'None')}</span></div>
              {selectedLog.errorMessage && (
                <div style={{ color: '#b91c1c', background: '#fee2e2', padding: 12, borderRadius: 8, fontWeight: 600 }}>
                  {lang === 'ar' ? 'خطأ:' : 'Error:'} {selectedLog.errorMessage}
                </div>
              )}
              <div>
                <strong>{lang === 'ar' ? 'الحمولة الخام واستجابة Meta API:' : 'Raw Payload & Meta API Response:'}</strong>
                <pre style={{
                  background: '#0f172a', color: '#38bdf8', padding: 14, borderRadius: 10,
                  fontSize: 12, overflowX: 'auto', marginTop: 6, direction: 'ltr', textAlign: 'left'
                }}>
                  {JSON.stringify({ payload: selectedLog.payloadJson, response: selectedLog.responseJson }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWhatsAppLogsPage;
