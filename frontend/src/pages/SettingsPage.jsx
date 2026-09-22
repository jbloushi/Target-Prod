import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import api, { settingsService } from '../services/api';
import { TK } from '../tokens/kineticHorizon';
import { WInput, WSelect } from '../ui';
import AddressPanel from '../components/AddressPanel';

const getTabs = (lang) => [
  { id: 'profile',       label: lang === 'ar' ? 'ملف الشاحن' : 'Shipper Profile', icon: 'person' },
  { id: 'addresses',     label: lang === 'ar' ? 'دفتر العناوين' : 'Address Book',    icon: 'location_on' },
  { id: 'api',           label: lang === 'ar' ? 'واجهة برمجة التطبيقات والويب هوك' : 'API & Webhooks',  icon: 'key' },
  { id: 'whatsapp',      label: lang === 'ar' ? 'واتساب وميتا ويب هوك' : 'WhatsApp & Meta Webhooks', icon: 'chat' },
  { id: 'notifications', label: lang === 'ar' ? 'الإشعارات' : 'Notifications',   icon: 'notifications' },
  { id: 'branding',      label: lang === 'ar' ? 'الناقل والمسار' : 'Carrier & Routing', icon: 'palette' },
  { id: 'security',      label: lang === 'ar' ? 'الأمان والمصادقة' : 'Security & 2FA',  icon: 'lock' },
];

const SectionCard = ({ title, children, action, subtitle }) => (
  <div style={{ background: '#fff', borderRadius: '20px', border: `1px solid ${TK.border}`, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 20 }}>
    <div style={{ padding: '18px 24px', borderBottom: `1px solid ${TK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15, color: TK.text1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: TK.text3, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
    <div style={{ padding: '22px 24px' }}>{children}</div>
  </div>
);

const ToggleRow = ({ value, onChange, label, desc }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: `1px solid ${TK.border}` }}>
    <div style={{ flex: 1, paddingRight: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 13.5, color: TK.text1 }}>{label}</div>
      {desc && <div style={{ fontSize: 12, color: TK.text3, marginTop: 3 }}>{desc}</div>}
    </div>
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: value ? TK.primary : '#d1d5db',
        position: 'relative', transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        transition: 'left 0.2s',
      }} />
    </button>
  </div>
);


export const SettingsPage = () => {
  const { t, lang, isRTL } = useLanguage();
  const { user, refreshUser, isStaff, isAdmin } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');

  // API Key State
  const [apiKey, setApiKey] = useState(user?.apiKey || '');
  const [loading, setLoading] = useState(false);

  // Shipper Profile State
  const [shipperProfile, setShipperProfile] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  // System Settings
  const [systemSettings, setSystemSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Notification Toggles
  const [notifs, setNotifs] = useState({
    email_ship: true,
    email_del: true,
    sms_pickup: false,
    sms_exception: true,
    whatsapp_tracking: true
  });

  // Webhook State
  const [webhooks, setWebhooks] = useState([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [showAddWebhookModal, setShowAddWebhookModal] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState(['shipment.created', 'shipment.status_updated', 'shipment.delivered']);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [selectedWebhookLogs, setSelectedWebhookLogs] = useState(null);
  const [webhookLogs, setWebhookLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchWebhooks = async () => {
    try {
      setLoadingWebhooks(true);
      const res = await api.get('/integrations/webhooks');
      if (res.data?.success) {
        setWebhooks(res.data.data || []);
      }
    } catch (err) {
      console.debug('Failed to fetch webhooks:', err.message);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'api') {
      fetchWebhooks();
    }
  }, [activeTab]);

  const handleCreateWebhook = async (e) => {
    e?.preventDefault();
    if (!newWebhookUrl.trim()) {
      enqueueSnackbar(lang === 'ar' ? 'الرجاء إدخال رابط صحيح' : 'Please provide a valid endpoint URL', { variant: 'warning' });
      return;
    }
    try {
      setCreatingWebhook(true);
      const res = await api.post('/integrations/webhooks', {
        targetUrl: newWebhookUrl.trim(),
        secret: newWebhookSecret.trim() || undefined,
        events: newWebhookEvents
      });
      if (res.data?.success) {
        enqueueSnackbar(lang === 'ar' ? 'تم تسجيل الويب هوك بنجاح!' : 'Webhook subscription registered successfully!', { variant: 'success' });
        setShowAddWebhookModal(false);
        setNewWebhookUrl('');
        setNewWebhookSecret('');
        fetchWebhooks();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || (lang === 'ar' ? 'فشل في تسجيل الويب هوك' : 'Failed to register webhook'), { variant: 'error' });
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleToggleWebhook = async (sub) => {
    try {
      await api.put(`/integrations/webhooks/${sub.id}`, { isActive: !sub.isActive });
      enqueueSnackbar(lang === 'ar' ? `تم ${!sub.isActive ? 'تفعيل' : 'إيقاف'} الويب هوك` : `Webhook ${!sub.isActive ? 'activated' : 'paused'}`, { variant: 'info' });
      fetchWebhooks();
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في تحديث الحالة' : 'Failed to update status', { variant: 'error' });
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!window.confirm(lang === 'ar' ? 'هل أنت متأكد من إزالة نقطة النهاية هذه؟' : 'Are you sure you want to remove this webhook endpoint?')) return;
    try {
      await api.delete(`/integrations/webhooks/${id}`);
      enqueueSnackbar(lang === 'ar' ? 'تم حذف الويب هوك' : 'Webhook deleted', { variant: 'success' });
      fetchWebhooks();
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في حذف الويب هوك' : 'Failed to delete webhook', { variant: 'error' });
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      setTestingWebhookId(id);
      setTestResult(null);
      const res = await api.post(`/integrations/webhooks/${id}/test`);
      setTestResult({ success: true, message: res.data?.message || 'Ping delivered successfully (HTTP 200 OK)', event: res.data?.event });
      enqueueSnackbar(lang === 'ar' ? 'تم إرسال اختبار الاتصال بنجاح!' : 'Test ping dispatched successfully!', { variant: 'success' });
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Webhook ping failed';
      setTestResult({ success: false, message: errMsg, event: err.response?.data?.event });
      enqueueSnackbar(lang === 'ar' ? `فشل إرسال الاختبار: ${errMsg}` : `Test dispatch failed: ${errMsg}`, { variant: 'error' });
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleViewLogs = async (sub) => {
    setSelectedWebhookLogs(sub);
    try {
      setLoadingLogs(true);
      const res = await api.get(`/integrations/webhooks/${sub.id}/events`);
      setWebhookLogs(res.data?.data || []);
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في تحميل سجلات الويب هوك' : 'Failed to load webhook logs', { variant: 'error' });
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await settingsService.getSystemSettings();
        setSystemSettings(res.data || res);
      } catch (err) {
        console.debug('Error loading system settings:', err.message);
      }
    };
    loadSettings();
  }, [isStaff, isAdmin]);

  const generateNewKey = async () => {
    try {
      setLoading(true);
      const res = await api.post('/auth/api-key');
      setApiKey(res.data.apiKey);
      enqueueSnackbar(lang === 'ar' ? 'تم إنشاء مفتاح واجهة برمجة تطبيقات جديد بنجاح!' : 'New API Key generated successfully!', { variant: 'success' });
      if (refreshUser) await refreshUser();
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في إنشاء مفتاح واجهة برمجة التطبيقات' : 'Failed to generate API Key', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.patch('/users/profile', {
        name: shipperProfile.contactPerson,
        company: shipperProfile.company,
        phone: shipperProfile.phone,
        carrierConfig: {
          vatNo: shipperProfile.vatNumber,
          eori: shipperProfile.eoriNumber,
          taxId: shipperProfile.taxId,
          traderType: shipperProfile.traderType,
          defaultReference: shipperProfile.reference
        }
      });
      enqueueSnackbar(lang === 'ar' ? 'تم تحديث ملف الشاحن بنجاح!' : 'Shipper profile updated successfully!', { variant: 'success' });
      if (refreshUser) await refreshUser();
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في تحديث الملف الشخصي' : 'Failed to update profile', { variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSystemSettings = async () => {
    setSavingSettings(true);
    try {
      await settingsService.updateSettings(systemSettings);
      enqueueSnackbar(lang === 'ar' ? 'تم حفظ إعدادات النظام بنجاح!' : 'System settings saved successfully!', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في حفظ الإعدادات' : 'Failed to save settings', { variant: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px', minHeight: '100vh', direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontWeight: 800, fontSize: 22, color: TK.text1, letterSpacing: '-0.03em', margin: 0 }}>
          {lang === 'ar' ? 'الإعدادات والتهيئة' : 'Settings & Configuration'}
        </h1>
        <p style={{ fontSize: 13.5, color: TK.text2, margin: '5px 0 0' }}>
          {lang === 'ar' ? 'إدارة ملف حسابك، سجل العناوين، تفضيلات الناقل، ومفاتيح واجهة برمجة التطبيقات للمطورين.' : 'Manage your account profile, address registry, carrier preferences, and developer API keys.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Sidebar Tabs */}
        <div style={{ width: 220, flexShrink: 0, background: '#fff', borderRadius: 16, border: `1px solid ${TK.border}`, padding: '10px' }}>
          {getTabs(lang).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: activeTab === t.id ? TK.primaryBg : 'transparent',
                color: activeTab === t.id ? TK.primary : TK.text2,
                fontWeight: activeTab === t.id ? 700 : 500, fontSize: 13.5,
                transition: 'all 0.12s', textAlign: 'left', marginBottom: 2
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 19, flexShrink: 0 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Pane */}
        <div style={{ flex: 1, minWidth: 320 }}>
          {/* TAB 1: Profile */}
          {activeTab === 'profile' && (
            <SectionCard
              title={lang === 'ar' ? 'الجمارك للشاحن وملف الاتصال' : 'Shipper Customs & Contact Profile'}
              subtitle={lang === 'ar' ? 'معلومات الاتصال الافتراضية والتعريف الجمركي للبيانات' : 'Default contact information and customs identification for manifests'}
              action={
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{
                    padding: '9px 18px', borderRadius: 10, border: 'none',
                    background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 12.5,
                    cursor: savingProfile ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  {savingProfile ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الملف الشخصي' : 'Save Profile')}
                </button>
              }
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                <WInput label={lang === 'ar' ? 'الاسم الكامل / مسؤول الاتصال' : 'Full Name / Contact Person'} value={shipperProfile.contactPerson} onChange={e => setShipperProfile({ ...shipperProfile, contactPerson: e.target.value })} half />
                <WInput label={lang === 'ar' ? 'اسم الشركة' : 'Company Name'} value={shipperProfile.company} onChange={e => setShipperProfile({ ...shipperProfile, company: e.target.value })} half />
                <WInput label={lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'} value={shipperProfile.phone} onChange={e => setShipperProfile({ ...shipperProfile, phone: e.target.value })} half />
                <WInput label={lang === 'ar' ? 'البريد الإلكتروني للحساب' : 'Account Email'} value={user?.email} disabled helper={lang === 'ar' ? 'تدار عبر المصادقة' : 'Managed via Auth'} half />
                <WInput label={lang === 'ar' ? 'الرقم الضريبي / تسجيل ضريبة القيمة المضافة' : 'Tax ID / VAT Registration'} value={shipperProfile.vatNumber} onChange={e => setShipperProfile({ ...shipperProfile, vatNumber: e.target.value })} half helper={lang === 'ar' ? 'ضريبة القيمة المضافة لدول مجلس التعاون / رقم التسجيل الضريبي' : 'GCC VAT / TRN'} />
                <WInput label={lang === 'ar' ? 'رقم EORI (جمارك الاتحاد الأوروبي)' : 'EORI Number (EU Customs)'} value={shipperProfile.eoriNumber} onChange={e => setShipperProfile({ ...shipperProfile, eoriNumber: e.target.value })} half helper={lang === 'ar' ? 'للشحنات الأوروبية' : 'For European consignments'} />
                <WInput label={lang === 'ar' ? 'المرجع الافتراضي للشحنة' : 'Default Consignment Reference'} value={shipperProfile.reference} onChange={e => setShipperProfile({ ...shipperProfile, reference: e.target.value })} placeholder="e.g. TLG-DIRECT" />
              </div>
            </SectionCard>
          )}

          {/* TAB 2: Addresses */}
          {activeTab === 'addresses' && (
            <AddressPanel />
          )}

          {/* TAB 3: API & Webhooks */}
          {activeTab === 'api' && (
            <div>
              <SectionCard
                title={lang === 'ar' ? 'مفاتيح API للمطورين' : 'Developer REST API Keys'}
                subtitle={lang === 'ar' ? 'قم بالمصادقة برمجياً لإرسال الشحنات والاستعلام عن التتبع' : 'Authenticate programmatically to dispatch consignments and query telemetry'}
              >
                <div style={{ padding: '16px', background: '#fafbfc', borderRadius: 12, border: `1px solid ${TK.border}`, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TK.text2, marginBottom: 6 }}>{lang === 'ar' ? 'المفتاح السري النشط' : 'Active Secret Key'}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={apiKey || (lang === 'ar' ? 'No key generated yet' : 'No key generated yet')}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${TK.border}`,
                        background: '#fff', fontFamily: 'monospace', fontSize: 13, color: TK.text1, outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (apiKey) {
                          navigator.clipboard.writeText(apiKey);
                          enqueueSnackbar('API Key copied to clipboard', { variant: 'success' });
                        }
                      }}
                      style={{
                        padding: '10px 16px', borderRadius: 10, border: `1px solid ${TK.border}`,
                        background: '#fff', color: TK.text1, fontWeight: 700, fontSize: 12.5, cursor: 'pointer'
                      }}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={generateNewKey}
                      disabled={loading}
                      style={{
                        padding: '10px 18px', borderRadius: 10, border: 'none',
                        background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer'
                      }}
                    >
                      {loading ? (lang === 'ar' ? 'جاري التوليد...' : 'Rolling...') : (lang === 'ar' ? 'توليد مفتاح' : 'Roll Key')}
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 12.5, color: TK.text2, lineHeight: 1.5 }}>
                  {lang === 'ar' ? 'قم بتضمين المفتاح في الترويسة:' : 'Include your key in the header:'} <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: TK.primary, fontWeight: 700 }}>X-API-Key: tl_live_...</code>
                </div>
              </SectionCard>

              {/* Webhook Subscriptions Section */}
              <SectionCard
                title={lang === 'ar' ? 'اشتراكات الويب هوك والأحداث المباشرة' : 'Webhook Subscriptions & Live Events'}
                subtitle={lang === 'ar' ? 'تلقي أحداث HTTP POST في الوقت الفعلي حول تغيرات الحالة ومراحل التوصيل' : 'Receive real-time HTTP POST event callbacks on status transitions and delivery milestones'}
                action={
                  <button
                    type="button"
                    onClick={() => setShowAddWebhookModal(true)}
                    style={{
                      padding: '9px 16px', borderRadius: 10, border: 'none',
                      background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_link</span>
                    Add Webhook
                  </button>
                }
              >
                {loadingWebhooks ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: TK.text3 }}>{lang === 'ar' ? 'جاري تحميل الويب هوك...' : 'Loading webhooks...'}</div>
                ) : webhooks.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: TK.text3, background: '#fafbfc', borderRadius: 12, border: `1px dashed ${TK.border}` }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: TK.text3, marginBottom: 8 }}>webhook</span>
                    <div style={{ fontWeight: 600, fontSize: 14, color: TK.text2 }}>{lang === 'ar' ? 'لم يتم تكوين أي ويب هوك' : 'No Webhooks Configured'}</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>{lang === 'ar' ? 'أضف رابط نقطة نهاية HTTP لبدء تلقي تحديثات الشحنات التلقائية.' : 'Add an HTTP endpoint URL to start receiving automated consignment updates.'}</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {webhooks.map(sub => (
                      <div
                        key={sub.id}
                        style={{
                          padding: '16px', background: '#fafbfc', borderRadius: 12, border: `1px solid ${TK.border}`,
                          display: 'flex', flexDirection: 'column', gap: 10
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                              width: 10, height: 10, borderRadius: '50%',
                              background: sub.isActive ? '#10b981' : '#9ca3af'
                            }} />
                            <code style={{ fontSize: 13, fontWeight: 700, color: TK.text1 }}>{sub.targetUrl}</code>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleTestWebhook(sub.id)}
                              disabled={testingWebhookId === sub.id}
                              style={{
                                padding: '6px 12px', borderRadius: 8, border: `1px solid ${TK.border}`,
                                background: '#fff', color: TK.primary, fontWeight: 700, fontSize: 11.5, cursor: 'pointer'
                              }}
                            >
                              {testingWebhookId === sub.id ? (lang === 'ar' ? 'جاري الإرسال...' : 'Sending...') : (lang === 'ar' ? '⚡ اختبار الاتصال' : '⚡ Test Ping')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewLogs(sub)}
                              style={{
                                padding: '6px 12px', borderRadius: 8, border: `1px solid ${TK.border}`,
                                background: '#fff', color: TK.text1, fontWeight: 600, fontSize: 11.5, cursor: 'pointer'
                              }}
                            >
                              📋 {lang === 'ar' ? 'سجلات الأحداث' : 'Event Logs'} ({sub._count?.deliveryEvents || 0})
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleWebhook(sub)}
                              style={{
                                padding: '6px 10px', borderRadius: 8, border: `1px solid ${TK.border}`,
                                background: '#fff', color: sub.isActive ? '#d97706' : '#10b981', fontWeight: 600, fontSize: 11.5, cursor: 'pointer'
                              }}
                            >
                              {sub.isActive ? (lang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : (lang === 'ar' ? 'تفعيل' : 'Activate')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWebhook(sub.id)}
                              style={{
                                padding: '6px 10px', borderRadius: 8, border: '1px solid #fee2e2',
                                background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: 11.5, cursor: 'pointer'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Events & Secret Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: TK.text2, flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>{lang === 'ar' ? 'الأحداث المشترك بها:' : 'Subscribed Events:'}</span>
                            {(Array.isArray(sub.events) ? sub.events : []).map(ev => (
                              <span key={ev} style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                                {ev}
                              </span>
                            ))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600 }}>{lang === 'ar' ? 'السر:' : 'Secret:'}</span>
                            <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{sub.secret?.slice(0, 8)}...</code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(sub.secret);
                                enqueueSnackbar('Signing secret copied', { variant: 'success' });
                              }}
                              style={{ border: 'none', background: 'transparent', color: TK.primary, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                            >
                              {lang === 'ar' ? 'نسخ السر' : 'Copy Secret'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Test Simulator Result Box */}
                {testResult && (
                  <div style={{
                    marginTop: 16, padding: '14px 16px', borderRadius: 12,
                    background: testResult.success ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${testResult.success ? '#bbf7d0' : '#fecaca'}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: testResult.success ? '#15803d' : '#b91c1c' }}>
                        {testResult.success ? '✅ ' : '❌ '} {testResult.message}
                      </div>
                      <button
                        type="button"
                        onClick={() => setTestResult(null)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontSize: 12 }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Event Logs Drawer / Section */}
              {selectedWebhookLogs && (
                <SectionCard
                  title={lang === 'ar' ? `سجلات التوصيل لـ: ${selectedWebhookLogs.targetUrl}` : `Delivery Logs for: ${selectedWebhookLogs.targetUrl}`}
                  subtitle={lang === 'ar' ? 'فحص محاولات إرسال الويب هوك الأخيرة والتوقيعات' : 'Inspecting recent webhook dispatch attempts and signatures'}
                  action={
                    <button
                      type="button"
                      onClick={() => setSelectedWebhookLogs(null)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${TK.border}`, background: '#fff', cursor: 'pointer', fontSize: 12 }}
                    >
                      {lang === 'ar' ? 'إغلاق السجلات' : 'Close Logs'}
                    </button>
                  }
                >
                  {loadingLogs ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: TK.text3 }}>{lang === 'ar' ? 'جاري تحميل السجلات...' : 'Loading logs...'}</div>
                  ) : webhookLogs.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: TK.text3 }}>{lang === 'ar' ? 'لم يتم تسجيل أي محاولات توصيل بعد.' : 'No delivery attempts recorded yet.'}</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${TK.border}`, textAlign: 'left' }}>
                            <th style={{ padding: '10px 12px' }}>Event</th>
                            <th style={{ padding: '10px 12px' }}>Status</th>
                            <th style={{ padding: '10px 12px' }}>Attempts</th>
                            <th style={{ padding: '10px 12px' }}>Timestamp</th>
                            <th style={{ padding: '10px 12px' }}>Error Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {webhookLogs.map(log => (
                            <tr key={log.id} style={{ borderBottom: `1px solid ${TK.border}` }}>
                              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{log.event}</td>
                              <td style={{ padding: '10px 12px' }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  background: log.status === 'success' ? '#dcfce7' : '#fee2e2',
                                  color: log.status === 'success' ? '#15803d' : '#b91c1c'
                                }}>
                                  {log.status}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px' }}>{log.attempts}</td>
                              <td style={{ padding: '10px 12px', color: TK.text3 }}>{new Date(log.createdAt).toLocaleString()}</td>
                              <td style={{ padding: '10px 12px', color: log.lastError ? '#b91c1c' : TK.text3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {log.lastError || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Add Webhook Modal */}
              {showAddWebhookModal && (
                <div style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
                }}>
                  <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: TK.text1 }}>{lang === 'ar' ? 'تسجيل نقطة نهاية ويب هوك' : 'Register Webhook Endpoint'}</div>
                      <button
                        type="button"
                        onClick={() => setShowAddWebhookModal(false)}
                        style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: TK.text3 }}
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleCreateWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <WInput
                        label={lang === 'ar' ? 'رابط نقطة النهاية الوجهة *' : 'Destination Endpoint URL *'}
                        placeholder="https://api.yourdomain.com/webhooks/orders"
                        value={newWebhookUrl}
                        onChange={e => setNewWebhookUrl(e.target.value)}
                        helper={lang === 'ar' ? 'يجب أن يكون رابط HTTPS أو HTTP صحيحاً' : 'Must be a valid HTTPS or HTTP URL'}
                      />

                      <WInput
                        label={lang === 'ar' ? 'سر التوقيع (اختياري)' : 'Signing Secret (Optional)'}
                        placeholder={lang === 'ar' ? 'اتركه فارغاً لإنشاء سر آمن بطول 24 بايت تلقائياً' : 'Leave blank to auto-generate secure 24-byte hex secret'}
                        value={newWebhookSecret}
                        onChange={e => setNewWebhookSecret(e.target.value)}
                        helper={lang === 'ar' ? 'يستخدم لتوقيع ترويسة HMAC SHA256' : 'Used to sign HMAC SHA256 header (X-Webhook-Signature-256)'}
                      />

                      <div>
                        <label style={{ fontWeight: 600, fontSize: 12, color: TK.text2, display: 'block', marginBottom: 8 }}>
                          Subscribed Events
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {[
                            { id: 'shipment.created', label: 'shipment.created (When a new shipment is created)' },
                            { id: 'shipment.status_updated', label: 'shipment.status_updated (When status or milestone changes)' },
                            { id: 'shipment.delivered', label: 'shipment.delivered (When Proof of Delivery is captured)' },
                            { id: 'shipment.booked', label: 'shipment.booked (When Carrier AWB is issued)' },
                            { id: '*', label: '* (All events)' }
                          ].map(ev => {
                            const isChecked = newWebhookEvents.includes(ev.id);
                            return (
                              <label key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: TK.text1, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setNewWebhookEvents(newWebhookEvents.filter(x => x !== ev.id));
                                    } else {
                                      setNewWebhookEvents([...newWebhookEvents, ev.id]);
                                    }
                                  }}
                                />
                                {ev.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                        <button
                          type="button"
                          onClick={() => setShowAddWebhookModal(false)}
                          style={{ padding: '10px 18px', borderRadius: 10, border: `1px solid ${TK.border}`, background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={creatingWebhook}
                          style={{
                            padding: '10px 20px', borderRadius: 10, border: 'none',
                            background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                          }}
                        >
                          {creatingWebhook ? (lang === 'ar' ? 'جاري التسجيل...' : 'Registering...') : (lang === 'ar' ? 'تسجيل نقطة النهاية' : 'Register Endpoint')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'whatsapp' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SectionCard
                title={lang === 'ar' ? 'إعدادات واجهة برمجة تطبيقات واتساب للأعمال من ميتا' : 'Meta WhatsApp Business API Settings'}
                subtitle={lang === 'ar' ? 'تكوين مفاتيح واجهة برمجة تطبيقات سحابة واتساب الرسمية أو تكامل Chatwoot لإشعارات العملاء التلقائية' : 'Configure official WhatsApp Cloud API keys or Chatwoot integration for automated customer notifications'}
                action={
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setSavingSettings(true);
                        await settingsService.updateSystemSettings({ whatsapp: systemSettings?.whatsapp });
                        enqueueSnackbar('WhatsApp settings updated successfully', { variant: 'success' });
                      } catch (err) {
                        enqueueSnackbar('Failed to update WhatsApp settings', { variant: 'error' });
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    disabled={savingSettings}
                    style={{
                      padding: '9px 18px', borderRadius: 10, border: 'none',
                      background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer'
                    }}
                  >
                    {savingSettings ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ الإعدادات' : 'Save Settings')}
                  </button>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 calc(50% - 8px)' }}>
                      <WSelect
                        label={lang === 'ar' ? 'وضع مزود واجهة برمجة التطبيقات' : 'API Provider Mode'}
                        value={systemSettings?.whatsapp?.provider || 'SHIPMENT_WHATSAPP'}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          whatsapp: { ...(systemSettings?.whatsapp || {}), provider: e.target.value }
                        })}
                        options={[
                          { value: 'SHIPMENT_WHATSAPP', label: lang === 'ar' ? 'خدمة واتساب تارجت المصغرة (msg.target-kw.com)' : 'Target WhatsApp Microservice (msg.target-kw.com)' },
                          { value: 'META', label: lang === 'ar' ? 'منصة واتساب للأعمال من ميتا (واجهة برمجة التطبيقات السحابية الرسمية)' : 'Meta WhatsApp Business Platform (Official Cloud API)' },
                          { value: 'CHATWOOT', label: lang === 'ar' ? 'بوابة صندوق وارد Chatwoot' : 'Chatwoot Inbox Gateway' },
                          { value: 'MOCK', label: lang === 'ar' ? 'بيئة الاختبار الوهمية (اختبار محلي)' : 'Mock Sandbox (Local Testing)' }
                        ]}
                      />
                    </div>

                    {(systemSettings?.whatsapp?.provider === 'SHIPMENT_WHATSAPP' || !systemSettings?.whatsapp?.provider) ? (
                      <WInput
                        half
                        label={lang === 'ar' ? 'رابط الخدمة المصغرة' : 'Microservice Endpoint URL'}
                        placeholder="https://msg.target-kw.com"
                        value={systemSettings?.whatsapp?.serviceUrl || 'https://msg.target-kw.com'}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          whatsapp: { ...(systemSettings?.whatsapp || {}), serviceUrl: e.target.value }
                        })}
                        helper={lang === 'ar' ? 'خدمة إرسال إشعارات واتساب عبر السحابة (shipment-whatsapp)' : 'Cloud API notification dispatcher (shipment-whatsapp)'}
                      />
                    ) : (
                      <WInput
                        half
                        label={lang === 'ar' ? 'معرف رقم الهاتف' : 'Phone Number ID'}
                        placeholder="e.g. 109823471928374"
                        value={systemSettings?.whatsapp?.phoneNumberId}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          whatsapp: { ...(systemSettings?.whatsapp || {}), phoneNumberId: e.target.value }
                        })}
                      />
                    )}
                  </div>

                  {systemSettings?.whatsapp?.provider !== 'SHIPMENT_WHATSAPP' && systemSettings?.whatsapp?.provider && (
                    <>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <WInput
                          half
                          label={lang === 'ar' ? 'معرف حساب واتساب للأعمال (WABA)' : 'WhatsApp Business Account ID (WABA)'}
                          placeholder="e.g. 209384019283741"
                          value={systemSettings?.whatsapp?.businessAccountId}
                          onChange={(e) => setSystemSettings({
                            ...systemSettings,
                            whatsapp: { ...(systemSettings?.whatsapp || {}), businessAccountId: e.target.value }
                          })}
                        />

                        <WInput
                          half
                          label={lang === 'ar' ? 'رمز سر التحقق من الويب هوك' : 'Webhook Verification Secret Token'}
                          placeholder="e.g. target_logistics_meta_verify_secret_2026"
                          value={systemSettings?.whatsapp?.webhookVerifyToken}
                          onChange={(e) => setSystemSettings({
                            ...systemSettings,
                            whatsapp: { ...(systemSettings?.whatsapp || {}), webhookVerifyToken: e.target.value }
                          })}
                        />
                      </div>

                      <WInput
                        label={lang === 'ar' ? 'رمز وصول مستخدم النظام (دائم / حامل)' : 'System User Access Token (Permanent / Bearer)'}
                        type="password"
                        placeholder="EAAG..."
                        value={systemSettings?.whatsapp?.accessToken}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          whatsapp: { ...(systemSettings?.whatsapp || {}), accessToken: e.target.value }
                        })}
                        helper={lang === 'ar' ? 'تم إنشاؤه في مدير أعمال ميتا ضمن مستخدمي النظام' : 'Generated in Meta Business Manager under System Users'}
                      />
                    </>
                  )}
                </div>
              </SectionCard>

              <SectionCard
                title={lang === 'ar' ? 'نقطة نهاية ويب هوك ميتا الواردة' : 'Incoming Meta Webhook Endpoint'}
                subtitle={lang === 'ar' ? 'الصق هذا الرابط في لوحة معلومات مطوري ميتا -> واتساب -> التكوين -> الويب هوك' : 'Paste this URL into Meta Developer Dashboard -> WhatsApp -> Configuration -> Webhook'}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{
                    flex: 1, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: `1px solid ${TK.border}`,
                    fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: TK.primary, wordBreak: 'break-all'
                  }}>
                    {`${window.location.origin}/api/whatsapp/webhook`}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp/webhook`);
                      enqueueSnackbar('Webhook URL copied to clipboard!', { variant: 'info' });
                    }}
                    style={{
                      padding: '11px 18px', borderRadius: 10, border: `1px solid ${TK.border}`,
                      background: '#fff', color: TK.text1, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>content_copy</span>
                    Copy URL
                  </button>
                </div>
              </SectionCard>
            </div>
          )}

          {/* TAB 4: Notifications */}
          {activeTab === 'notifications' && (
            <SectionCard title={lang === 'ar' ? 'إشعارات الأحداث التلقائية' : 'Automated Event Notifications'} subtitle={lang === 'ar' ? 'تكوين القنوات التلقائية لمراحل الشحنة' : 'Configure automated channels for shipment milestones'}>
              <ToggleRow
                value={notifs.email_ship}
                onChange={v => setNotifs({ ...notifs, email_ship: v })}
                label={lang === 'ar' ? 'تم إنشاء بيان الشحنة (بريد إلكتروني)' : 'Shipment Manifest Created (Email)'}
                desc={lang === 'ar' ? 'إرسال الإيصال وبوليصة الشحن كملف PDF عند تأكيد الإرسال' : 'Send receipt & waybill PDF upon dispatch confirmation'}
              />
              <ToggleRow
                value={notifs.email_del}
                onChange={v => setNotifs({ ...notifs, email_del: v })}
                label={lang === 'ar' ? 'تأكيد إثبات التوصيل (بريد إلكتروني)' : 'Proof of Delivery Confirmation (Email)'}
                desc={lang === 'ar' ? 'إرسال طابع زمني للتوصيل وإيصال توقيع المستلم' : 'Send delivery timestamp & receiver signature receipt'}
              />
              <ToggleRow
                value={notifs.whatsapp_tracking}
                onChange={v => setNotifs({ ...notifs, whatsapp_tracking: v })}
                label={lang === 'ar' ? 'تحديثات التوصيل عبر واتساب (Chatwoot)' : 'WhatsApp Delivery Updates (Chatwoot)'}
                desc={lang === 'ar' ? 'إرسال رابط التتبع المباشر إلى المرسل إليه عبر واتساب' : 'Send live tracking URL to consignee via WhatsApp'}
              />
              <ToggleRow
                value={notifs.sms_exception}
                onChange={v => setNotifs({ ...notifs, sms_exception: v })}
                label={lang === 'ar' ? 'استثناءات الجمارك والناقل (رسالة نصية)' : 'Customs & Carrier Exceptions (SMS)'}
                desc={lang === 'ar' ? 'تنبيه فوري إذا تم احتجاز البضائع على الحدود أو الجمارك' : 'Immediate alert if cargo is held at border or customs'}
              />
            </SectionCard>
          )}

          {/* TAB 5: Carrier & Routing */}
          {activeTab === 'branding' && (
            <SectionCard
              title={lang === 'ar' ? 'تكوين توجيه الناقل المزدوج' : 'Dual Carrier Routing Configuration'}
              subtitle={lang === 'ar' ? 'شركاء النقل الافتراضيون والافتراضيات لطبقة الخدمة' : 'Default carrier partners and service tier defaults'}
              action={
                isAdmin && (
                  <button
                    type="button"
                    onClick={handleSaveSystemSettings}
                    disabled={savingSettings}
                    style={{
                      padding: '9px 18px', borderRadius: 10, border: 'none',
                      background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer'
                    }}
                  >
                    {savingSettings ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ القواعد' : 'Save Rules')}
                  </button>
                )
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: 12, border: `1px solid ${TK.border}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1, marginBottom: 4 }}>{lang === 'ar' ? 'شريك الشحن السريع الأساسي: دي إتش إل إكسبرس العالمية' : 'Primary Express Partner: DHL Express Global'}</div>
                  <div style={{ fontSize: 12, color: TK.text2 }}>{lang === 'ar' ? 'تكامل مباشر مع واجهات برمجة تطبيقات DHL Express XML/REST للشحن الجوي العالمي.' : 'Direct integration with DHL Express XML/REST APIs for worldwide air cargo.'}</div>
                </div>

                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: 12, border: `1px solid ${TK.border}` }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1, marginBottom: 4 }}>{lang === 'ar' ? 'الشريك البري الإقليمي: لوجستيكس دول مجلس التعاون' : 'Regional Overland Partner: LogesTechs GCC'}</div>
                  <div style={{ fontSize: 12, color: TK.text2 }}>{lang === 'ar' ? 'التوجيه البري عبر الحدود في الكويت والسعودية والبحرين والإمارات وعمان.' : 'Overland border routing across Kuwait, Saudi Arabia, Bahrain, UAE, and Oman.'}</div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* TAB 6: Security */}
          {activeTab === 'security' && (
            <SectionCard title={lang === 'ar' ? 'الأمان والمصادقة' : 'Security & Authentication'} subtitle={lang === 'ar' ? 'إدارة بيانات اعتماد كلمة المرور وعناصر التحكم في الجلسة النشطة' : 'Manage password credentials and active session controls'}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <WInput label={lang === 'ar' ? 'كلمة المرور الحالية' : 'Current Password'} type="password" placeholder="••••••••" half />
                <WInput label={lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'} type="password" placeholder="••••••••" half />
                <button
                  type="button"
                  style={{
                    alignSelf: 'flex-start', padding: '10px 20px', borderRadius: 10, border: 'none',
                    background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 8
                  }}
                >
                  {lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password'}
                </button>
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

