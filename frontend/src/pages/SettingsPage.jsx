import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSnackbar } from 'notistack';
import api, { settingsService } from '../services/api';
import PageHeader from '../components/common/PageHeader';

const ROLE_DISPLAY_NAMES = {
  admin: 'Superadmin (Full Control)',
  manager: 'Target Owner (Executive)',
  accounting: 'Target Accounting (Ledgers & Billing)',
  staff: 'Target Ops Staff (Dispatch & Clearance)',
  driver: 'Courier Driver (Field Mobile)',
  org_manager: 'Company Manager (Client B2B)',
  org_agent: 'Company Client (Consignor)',
  client: 'Direct Shipper',
};

const getTabs = (lang) => [
  { id: 'profile', label: lang === 'ar' ? 'ملف الشاحن' : 'Shipper Profile', icon: 'person' },
  { id: 'addresses', label: lang === 'ar' ? 'سجل العناوين' : 'Address Presets', icon: 'location_on' },
  { id: 'api', label: lang === 'ar' ? 'واجهة API والويب هوك' : 'API & Webhooks', icon: 'key' },
  { id: 'phenix', label: lang === 'ar' ? 'مزامنة فينيكس ERP' : 'Phenix ERP Sync', icon: 'sync_alt' },
  { id: 'whatsapp', label: lang === 'ar' ? 'إشعارات واتساب وميتا' : 'Meta WhatsApp Alerts', icon: 'chat' },
  { id: 'notifications', label: lang === 'ar' ? 'قنوات الإشعار' : 'Event Triggers', icon: 'notifications' },
  { id: 'routing', label: lang === 'ar' ? 'مسارات وبوابات النقل' : 'Carrier Gateways', icon: 'hub' },
  { id: 'security', label: lang === 'ar' ? 'الأمان والحساب' : 'Security & Access', icon: 'lock' },
];

export const SettingsPage = () => {
  const { t, lang, isRTL } = useLanguage();
  const { user, refreshUser, isStaff, isAdmin } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [activeTab, setActiveTab] = useState('profile');

  // API Key State
  const [apiKey, setApiKey] = useState(user?.apiKey || '');
  const [loadingKey, setLoadingKey] = useState(false);

  // Shipper Profile State
  const [shipperProfile, setShipperProfile] = useState({
    contactPerson: user?.name || '',
    company: user?.company || '',
    phone: user?.phone || '',
    vatNumber: user?.carrierConfig?.vatNo || '',
    eoriNumber: user?.carrierConfig?.eori || '',
    reference: user?.carrierConfig?.defaultReference || '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Saved Addresses State
  const [addresses, setAddresses] = useState(user?.addresses || []);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [newAddr, setNewAddr] = useState({
    label: '',
    contactPerson: '',
    phone: '',
    city: 'Kuwait City',
    state: 'Capital',
    streetLines: [''],
    buildingName: '',
    unitNumber: '',
    postalCode: '',
    countryCode: 'KW',
  });
  const [savingAddr, setSavingAddr] = useState(false);

  // System Settings (WhatsApp, Carrier Defaults)
  const [systemSettings, setSystemSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Notification Toggles
  const [notifs, setNotifs] = useState({
    email_ship: true,
    email_del: true,
    sms_pickup: false,
    sms_exception: true,
    whatsapp_tracking: true,
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

  // Password Change
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setApiKey(user.apiKey || '');
      setShipperProfile({
        contactPerson: user.name || '',
        company: user.company || '',
        phone: user.phone || '',
        vatNumber: user.carrierConfig?.vatNo || '',
        eoriNumber: user.carrierConfig?.eori || '',
        reference: user.carrierConfig?.defaultReference || '',
      });
      setAddresses(user.addresses || []);
    }
  }, [user]);

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
      setLoadingKey(true);
      const res = await api.post('/auth/api-key');
      setApiKey(res.data.apiKey);
      enqueueSnackbar(lang === 'ar' ? 'تم إنشاء مفتاح API جديد بنجاح!' : 'New API Key generated successfully!', { variant: 'success' });
      if (refreshUser) await refreshUser();
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في إنشاء مفتاح API' : 'Failed to generate API Key', { variant: 'error' });
    } finally {
      setLoadingKey(false);
    }
  };

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/users/profile', {
        name: shipperProfile.contactPerson,
        company: shipperProfile.company,
        phone: shipperProfile.phone,
        carrierConfig: {
          vatNo: shipperProfile.vatNumber,
          eori: shipperProfile.eoriNumber,
          defaultReference: shipperProfile.reference,
        },
      });
      enqueueSnackbar(lang === 'ar' ? 'تم تحديث ملف الشاحن بنجاح!' : 'Shipper profile updated successfully!', { variant: 'success' });
      if (refreshUser) await refreshUser();
    } catch (err) {
      enqueueSnackbar(lang === 'ar' ? 'فشل في تحديث الملف الشخصي' : 'Failed to update profile', { variant: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAddress = async (e) => {
    if (e) e.preventDefault();
    if (!newAddr.label || !newAddr.contactPerson) {
      enqueueSnackbar('Label and contact person are required', { variant: 'warning' });
      return;
    }
    setSavingAddr(true);
    try {
      const updatedList = [...addresses, { ...newAddr, _id: `addr_${Date.now()}` }];
      await api.patch('/users/profile', { addresses: updatedList });
      setAddresses(updatedList);
      setShowAddressModal(false);
      setNewAddr({
        label: '',
        contactPerson: '',
        phone: '',
        city: 'Kuwait City',
        state: 'Capital',
        streetLines: [''],
        buildingName: '',
        unitNumber: '',
        postalCode: '',
        countryCode: 'KW',
      });
      enqueueSnackbar('Address saved to presets', { variant: 'success' });
      if (refreshUser) await refreshUser();
    } catch (err) {
      enqueueSnackbar('Failed to save address preset', { variant: 'error' });
    } finally {
      setSavingAddr(false);
    }
  };

  const handleDeleteAddress = async (indexToDelete) => {
    if (!window.confirm('Delete this saved address preset?')) return;
    try {
      const updatedList = addresses.filter((_, idx) => idx !== indexToDelete);
      await api.patch('/users/profile', { addresses: updatedList });
      setAddresses(updatedList);
      enqueueSnackbar('Address deleted', { variant: 'info' });
      if (refreshUser) await refreshUser();
    } catch (err) {
      enqueueSnackbar('Failed to delete address', { variant: 'error' });
    }
  };

  const handleCreateWebhook = async (e) => {
    if (e) e.preventDefault();
    if (!newWebhookUrl.trim()) {
      enqueueSnackbar(lang === 'ar' ? 'الرجاء إدخال رابط صحيح' : 'Please provide a valid endpoint URL', { variant: 'warning' });
      return;
    }
    try {
      setCreatingWebhook(true);
      const res = await api.post('/integrations/webhooks', {
        targetUrl: newWebhookUrl.trim(),
        secret: newWebhookSecret.trim() || undefined,
        events: newWebhookEvents,
      });
      if (res.data?.success) {
        enqueueSnackbar(lang === 'ar' ? 'تم تسجيل الويب هوك بنجاح!' : 'Webhook registered successfully!', { variant: 'success' });
        setShowAddWebhookModal(false);
        setNewWebhookUrl('');
        setNewWebhookSecret('');
        fetchWebhooks();
      }
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || 'Failed to register webhook', { variant: 'error' });
    } finally {
      setCreatingWebhook(false);
    }
  };

  const handleToggleWebhook = async (sub) => {
    try {
      await api.put(`/integrations/webhooks/${sub.id}`, { isActive: !sub.isActive });
      enqueueSnackbar(`Webhook ${!sub.isActive ? 'activated' : 'paused'}`, { variant: 'info' });
      fetchWebhooks();
    } catch (err) {
      enqueueSnackbar('Failed to update status', { variant: 'error' });
    }
  };

  const handleDeleteWebhook = async (id) => {
    if (!window.confirm('Remove this webhook endpoint?')) return;
    try {
      await api.delete(`/integrations/webhooks/${id}`);
      enqueueSnackbar('Webhook removed', { variant: 'success' });
      fetchWebhooks();
    } catch (err) {
      enqueueSnackbar('Failed to delete webhook', { variant: 'error' });
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      setTestingWebhookId(id);
      setTestResult(null);
      const res = await api.post(`/integrations/webhooks/${id}/test`);
      setTestResult({
        success: true,
        message: res.data?.message || 'Ping delivered successfully (HTTP 200 OK)',
        event: res.data?.event,
      });
      enqueueSnackbar('Test ping dispatched successfully!', { variant: 'success' });
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Webhook ping failed';
      setTestResult({ success: false, message: errMsg, event: err.response?.data?.event });
      enqueueSnackbar(`Test dispatch failed: ${errMsg}`, { variant: 'error' });
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
      enqueueSnackbar('Failed to load webhook logs', { variant: 'error' });
    } finally {
      setLoadingLogs(false);
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

  const handlePasswordChange = async (e) => {
    if (e) e.preventDefault();
    if (!passwords.newPass || passwords.newPass !== passwords.confirm) {
      enqueueSnackbar('New passwords do not match', { variant: 'warning' });
      return;
    }
    setSavingPassword(true);
    try {
      await api.patch('/users/password', {
        currentPassword: passwords.current,
        newPassword: passwords.newPass,
      });
      enqueueSnackbar('Password updated successfully', { variant: 'success' });
      setPasswords({ current: '', newPass: '', confirm: '' });
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || 'Failed to update password', { variant: 'error' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title={lang === 'ar' ? 'الإعدادات والتهيئة التشغيلية' : 'Settings & Operational Hub'}
        subtitle={lang === 'ar' ? 'إدارة ملف الشاحن، مفاتيح REST API، إشعارات واتساب، وبوابات النقل' : 'Manage shipper identity, REST API credentials, Meta WhatsApp dispatch, and routing gateways.'}
      >
        <div className="flex items-center gap-2">
          <span className="badge badge-primary badge-outline font-bold text-xs py-3 px-3">
            {ROLE_DISPLAY_NAMES[user?.role] || user?.role || 'Authenticated Account'}
          </span>
        </div>
      </PageHeader>

      {/* Main Grid: Sidebar Menu + Tab Pane */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Navigation Menu */}
        <div className="md:col-span-3 card bg-base-100 border border-base-200 shadow-sm p-3">
          <ul className="menu menu-sm w-full gap-1 p-0">
            {getTabs(lang).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 py-3 px-3 rounded-lg font-bold text-xs transition-all ${
                      isActive ? 'active bg-primary text-white font-extrabold shadow-sm' : 'text-base-content/70 hover:bg-base-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Content Pane */}
        <div className="md:col-span-9 space-y-6">
          {/* TAB 1: Shipper Profile */}
          {activeTab === 'profile' && (
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="card-body p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-base-200">
                  <div>
                    <h2 className="text-lg font-black text-base-content tracking-tight">
                      {lang === 'ar' ? 'البيانات الجمركية وهوية الشاحن' : 'Shipper Customs & Contact Identity'}
                    </h2>
                    <p className="text-xs text-base-content/60 mt-0.5">
                      Default commercial manifest contact, VAT tax identifier, and Kuwait trade credentials.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="btn btn-primary btn-sm font-bold text-xs shadow-md shadow-primary/20 gap-2"
                  >
                    {savingProfile ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <span className="material-symbols-outlined text-base">save</span>
                    )}
                    <span>{lang === 'ar' ? 'حفظ الملف الشخصي' : 'Save Profile'}</span>
                  </button>
                </div>

                <form onSubmit={handleSaveProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Full Contact Person *</label>
                    <input
                      type="text"
                      value={shipperProfile.contactPerson}
                      onChange={(e) => setShipperProfile({ ...shipperProfile, contactPerson: e.target.value })}
                      placeholder="e.g. Bader Al-Ahmad"
                      className="input input-bordered w-full text-sm font-medium focus:input-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Company Name</label>
                    <input
                      type="text"
                      value={shipperProfile.company}
                      onChange={(e) => setShipperProfile({ ...shipperProfile, company: e.target.value })}
                      placeholder="e.g. Al-Bader Trading Co."
                      className="input input-bordered w-full text-sm font-medium focus:input-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Phone Number *</label>
                    <input
                      type="text"
                      value={shipperProfile.phone}
                      onChange={(e) => setShipperProfile({ ...shipperProfile, phone: e.target.value })}
                      placeholder="+965 9000 0000"
                      className="input input-bordered w-full font-mono text-sm focus:input-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Account Email (Verified)</label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="input input-bordered w-full text-sm bg-base-200 text-base-content/60 cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">VAT Registration / TRN</label>
                    <input
                      type="text"
                      value={shipperProfile.vatNumber}
                      onChange={(e) => setShipperProfile({ ...shipperProfile, vatNumber: e.target.value })}
                      placeholder="e.g. KW-VAT-982347"
                      className="input input-bordered w-full font-mono text-sm focus:input-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">EORI Number (EU Customs)</label>
                    <input
                      type="text"
                      value={shipperProfile.eoriNumber}
                      onChange={(e) => setShipperProfile({ ...shipperProfile, eoriNumber: e.target.value })}
                      placeholder="e.g. GB123456789000"
                      className="input input-bordered w-full font-mono text-sm focus:input-primary"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Default Consignment Reference Prefix</label>
                    <input
                      type="text"
                      value={shipperProfile.reference}
                      onChange={(e) => setShipperProfile({ ...shipperProfile, reference: e.target.value })}
                      placeholder="e.g. TLG-DIRECT-ORD"
                      className="input input-bordered w-full font-mono text-sm focus:input-primary"
                    />
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: Addresses & Hub Presets */}
          {activeTab === 'addresses' && (
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="card-body p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-base-200">
                  <div>
                    <h2 className="text-lg font-black text-base-content tracking-tight">
                      Saved Address & Hub Presets
                    </h2>
                    <p className="text-xs text-base-content/60 mt-0.5">
                      Fast 1-click address injection for origin collections and destination deliveries.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddressModal(true)}
                    className="btn btn-primary btn-sm font-bold text-xs gap-1.5 shadow-md shadow-primary/20"
                  >
                    <span className="material-symbols-outlined text-base">add_location_alt</span>
                    <span>Add New Address</span>
                  </button>
                </div>

                {addresses.length === 0 ? (
                  <div className="p-8 text-center bg-base-200/40 rounded-2xl border border-dashed border-base-300 space-y-3">
                    <span className="material-symbols-outlined text-4xl text-base-content/40">location_off</span>
                    <div className="font-bold text-sm text-base-content">No Saved Addresses Found</div>
                    <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                      Save frequent collection warehouses in Shuwaikh, Farwaniya, or GCC hub locations for quick dispatch.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {addresses.map((addr, idx) => (
                      <div key={addr._id || idx} className="p-4 rounded-xl bg-base-200/50 border border-base-200 relative group flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="badge badge-primary font-bold text-xs">{addr.label || 'Saved Location'}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteAddress(idx)}
                              className="btn btn-ghost btn-circle btn-xs text-error opacity-60 hover:opacity-100"
                              title="Delete Address"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="font-bold text-sm text-base-content">{addr.contactPerson}</div>
                          <div className="text-xs text-base-content/70">
                            {addr.streetLines?.[0] || addr.address || ''}
                            {addr.buildingName && `, ${addr.buildingName}`}
                          </div>
                          <div className="text-xs text-base-content/60 font-mono">
                            {addr.city}, {addr.state} • {addr.countryCode || 'KW'}
                          </div>
                        </div>
                        <div className="pt-3 mt-3 border-t border-base-300/50 flex items-center justify-between text-[11px] text-base-content/50">
                          <span>Phone: {addr.phone || 'N/A'}</span>
                          <span className="badge badge-xs badge-neutral">{addr.countryCode || 'KW'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: API & Webhooks */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              {/* REST API Key Card */}
              <div className="card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-8 space-y-4">
                <div>
                  <h2 className="text-lg font-black text-base-content tracking-tight">
                    Developer REST API Credentials
                  </h2>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Programmatic bearer token for B2B e-commerce ERP integration and bulk order injection.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-3">
                  <div className="text-[11px] font-bold text-base-content/60 uppercase">ACTIVE SECRET API KEY</div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      readOnly
                      value={apiKey || 'No API key generated yet'}
                      className="input input-bordered flex-1 font-mono text-xs bg-base-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (apiKey) {
                          navigator.clipboard.writeText(apiKey);
                          enqueueSnackbar('API Key copied to clipboard', { variant: 'success' });
                        }
                      }}
                      className="btn btn-outline border-base-300 font-bold text-xs gap-1"
                    >
                      <span className="material-symbols-outlined text-base">content_copy</span>
                      <span>Copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={generateNewKey}
                      disabled={loadingKey}
                      className="btn btn-primary font-bold text-xs gap-1 shadow-md shadow-primary/20"
                    >
                      <span className="material-symbols-outlined text-base">refresh</span>
                      <span>{loadingKey ? 'Rolling...' : 'Roll Key'}</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-base-content/60">
                    Include in authorization header: <code className="bg-base-300 px-1.5 py-0.5 rounded font-mono font-bold text-primary">X-API-Key: {apiKey ? `${apiKey.slice(0, 10)}...` : 'tl_live_...'}</code>
                  </div>
                </div>
              </div>

              {/* Webhooks Section */}
              <div className="card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-base-200">
                  <div>
                    <h2 className="text-lg font-black text-base-content tracking-tight">
                      Webhook Subscriptions (HTTP Callbacks)
                    </h2>
                    <p className="text-xs text-base-content/60 mt-0.5">
                      Receive real-time signed HMAC SHA-256 webhooks for status updates and proof of delivery.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddWebhookModal(true)}
                    className="btn btn-primary btn-sm font-bold text-xs gap-1.5 shadow-md shadow-primary/20"
                  >
                    <span className="material-symbols-outlined text-base">add_link</span>
                    <span>Add Webhook</span>
                  </button>
                </div>

                {loadingWebhooks ? (
                  <div className="p-8 text-center">
                    <span className="loading loading-spinner loading-md text-primary" />
                  </div>
                ) : webhooks.length === 0 ? (
                  <div className="p-8 text-center bg-base-200/40 rounded-2xl border border-dashed border-base-300 space-y-2">
                    <span className="material-symbols-outlined text-4xl text-base-content/40">webhook</span>
                    <div className="font-bold text-sm text-base-content">No Webhook Endpoints Configured</div>
                    <p className="text-xs text-base-content/60 max-w-sm mx-auto">
                      Add your store or logistics server URL to listen for automated consignment events.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {webhooks.map((sub) => (
                      <div key={sub.id} className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${sub.isActive ? 'bg-success' : 'bg-base-content/30'}`} />
                            <code className="font-mono font-bold text-xs text-base-content break-all">{sub.targetUrl}</code>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleTestWebhook(sub.id)}
                              disabled={testingWebhookId === sub.id}
                              className="btn btn-xs btn-outline border-base-300 font-bold gap-1 text-primary"
                            >
                              <span className="material-symbols-outlined text-xs">bolt</span>
                              <span>{testingWebhookId === sub.id ? 'Sending...' : 'Test Ping'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleViewLogs(sub)}
                              className="btn btn-xs btn-ghost border border-base-300 text-xs font-bold gap-1"
                            >
                              <span className="material-symbols-outlined text-xs">history</span>
                              <span>Logs ({sub._count?.deliveryEvents || 0})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleWebhook(sub)}
                              className={`btn btn-xs font-bold ${sub.isActive ? 'btn-warning btn-outline' : 'btn-success btn-outline'}`}
                            >
                              {sub.isActive ? 'Pause' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWebhook(sub.id)}
                              className="btn btn-xs btn-ghost text-error"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-base-200">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-base-content/60">Events:</span>
                            {(Array.isArray(sub.events) ? sub.events : []).map((ev) => (
                              <span key={ev} className="badge badge-xs badge-info font-bold">{ev}</span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px] text-base-content/50">
                            <span>Secret: {sub.secret?.slice(0, 8)}...</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(sub.secret);
                                enqueueSnackbar('Webhook secret copied', { variant: 'success' });
                              }}
                              className="link link-primary font-sans text-xs font-bold"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ping Result Alert */}
                {testResult && (
                  <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'} text-xs shadow-sm`}>
                    <span className="material-symbols-outlined text-base">
                      {testResult.success ? 'check_circle' : 'error'}
                    </span>
                    <span className="flex-1 font-bold">{testResult.message}</span>
                    <button type="button" onClick={() => setTestResult(null)} className="btn btn-ghost btn-xs">
                      ✕
                    </button>
                  </div>
                )}

                {/* Delivery Logs Viewer */}
                {selectedWebhookLogs && (
                  <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-base-200">
                      <span className="font-bold text-xs text-base-content">
                        Delivery Logs for: <code className="text-primary font-mono">{selectedWebhookLogs.targetUrl}</code>
                      </span>
                      <button type="button" onClick={() => setSelectedWebhookLogs(null)} className="btn btn-xs btn-ghost">
                        Close
                      </button>
                    </div>

                    {loadingLogs ? (
                      <div className="p-4 text-center">
                        <span className="loading loading-spinner loading-xs" />
                      </div>
                    ) : webhookLogs.length === 0 ? (
                      <div className="text-xs text-base-content/50 py-4 text-center">
                        No dispatch attempts recorded yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="table table-xs table-zebra w-full font-mono">
                          <thead>
                            <tr className="text-base-content/60">
                              <th>Event</th>
                              <th>Status</th>
                              <th>Attempts</th>
                              <th>Timestamp</th>
                              <th>Error Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {webhookLogs.map((log) => (
                              <tr key={log.id}>
                                <td className="font-bold">{log.event}</td>
                                <td>
                                  <span className={`badge badge-xs font-bold ${log.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                                    {log.status}
                                  </span>
                                </td>
                                <td>{log.attempts}</td>
                                <td className="text-base-content/60">{new Date(log.createdAt).toLocaleTimeString()}</td>
                                <td className="text-error truncate max-w-xs">{log.lastError || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Phenix ERP Sync & Auto-Pull */}
          {activeTab === 'phenix' && (
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="card-body p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-base-200">
                  <div>
                    <h2 className="text-lg font-black text-base-content tracking-tight">
                      Phenix ERP Gateway & Background Auto-Sync
                    </h2>
                    <p className="text-xs text-base-content/60 mt-0.5">
                      Automated background synchronization, merchant organization attribution, and multi-carrier live checkpoints.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setSavingSettings(true);
                        await settingsService.updateSystemSettings({ phenixSync: systemSettings?.phenixSync });
                        enqueueSnackbar('Phenix ERP settings saved successfully', { variant: 'success' });
                      } catch (err) {
                        enqueueSnackbar('Failed to update Phenix ERP settings: ' + err.message, { variant: 'error' });
                      } finally {
                        setSavingSettings(false);
                      }
                    }}
                    disabled={savingSettings}
                    className="btn btn-primary btn-sm font-bold text-xs gap-1.5 shadow-md shadow-primary/20"
                  >
                    {savingSettings ? <span className="loading loading-spinner loading-xs" /> : <span className="material-symbols-outlined text-base">save</span>}
                    <span>Save Phenix Config</span>
                  </button>
                </div>

                {/* Auto-Sync Master Toggle */}
                <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        systemSettings?.phenixSync?.autoSyncEnabled ? 'bg-success text-success-content' : 'bg-base-300 text-base-content/60'
                      }`}>
                        <span className="material-symbols-outlined text-2xl">
                          {systemSettings?.phenixSync?.autoSyncEnabled ? 'autorenew' : 'pause_circle'}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-sm text-base-content flex items-center gap-2">
                          <span>Periodic Background Auto-Pull (Cron Worker)</span>
                          <span className={`badge badge-xs font-bold ${systemSettings?.phenixSync?.autoSyncEnabled ? 'badge-success' : 'badge-ghost'}`}>
                            {systemSettings?.phenixSync?.autoSyncEnabled ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </div>
                        <div className="text-xs text-base-content/60">
                          Automatically query Phenix API on a recurring schedule to ingest new consignments and link merchant stores.
                        </div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(systemSettings?.phenixSync?.autoSyncEnabled)}
                      onChange={(e) => setSystemSettings({
                        ...systemSettings,
                        phenixSync: { ...(systemSettings?.phenixSync || {}), autoSyncEnabled: e.target.checked }
                      })}
                      className="toggle toggle-success toggle-md"
                    />
                  </div>

                  {systemSettings?.phenixSync?.lastAutoSyncAt && (
                    <div className="p-3 bg-base-100 rounded-lg border border-base-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-success">schedule</span>
                        <span className="font-semibold">Last Background Sync:</span>
                        <span className="font-mono text-base-content/70">{new Date(systemSettings.phenixSync.lastAutoSyncAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="badge badge-sm badge-outline font-bold">
                          Created: {systemSettings.phenixSync.lastAutoSyncSummary?.createdCount || 0}
                        </span>
                        <span className="badge badge-sm badge-outline font-bold">
                          Updated: {systemSettings.phenixSync.lastAutoSyncSummary?.updatedCount || 0}
                        </span>
                        <span className="badge badge-sm badge-accent font-bold">
                          Carrier Synced: {systemSettings.phenixSync.lastAutoSyncSummary?.carrierSyncedCount || 0}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Configuration Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Sync Frequency</label>
                    <select
                      value={systemSettings?.phenixSync?.intervalMinutes || 15}
                      onChange={(e) => setSystemSettings({
                        ...systemSettings,
                        phenixSync: { ...(systemSettings?.phenixSync || {}), intervalMinutes: Number(e.target.value) }
                      })}
                      className="select select-bordered select-sm w-full font-bold text-xs"
                    >
                      <option value={5}>Every 5 Minutes (Real-Time)</option>
                      <option value={15}>Every 15 Minutes (Standard)</option>
                      <option value={30}>Every 30 Minutes</option>
                      <option value={60}>Every 1 Hour</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Carrier Filter</label>
                    <select
                      value={systemSettings?.phenixSync?.carrier || 'ALL'}
                      onChange={(e) => setSystemSettings({
                        ...systemSettings,
                        phenixSync: { ...(systemSettings?.phenixSync || {}), carrier: e.target.value }
                      })}
                      className="select select-bordered select-sm w-full font-bold text-xs"
                    >
                      <option value="ALL">All Carriers in Report</option>
                      <option value="DHL">DHL Express (DGR)</option>
                      <option value="ARAMEX">Aramex</option>
                      <option value="FEDEX">FedEx</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Rolling Lookback Window</label>
                    <select
                      value={systemSettings?.phenixSync?.daysBack || 3}
                      onChange={(e) => setSystemSettings({
                        ...systemSettings,
                        phenixSync: { ...(systemSettings?.phenixSync || {}), daysBack: Number(e.target.value) }
                      })}
                      className="select select-bordered select-sm w-full font-bold text-xs"
                    >
                      <option value={1}>1 Day (Today Only)</option>
                      <option value={3}>3 Days (Rolling Window)</option>
                      <option value={7}>7 Days (Weekly)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Consignment Validation</label>
                    <label className="label cursor-pointer py-1.5 px-3 bg-base-200/50 rounded-lg border border-base-200">
                      <span className="label-text text-xs font-bold">Require Full Data</span>
                      <input
                        type="checkbox"
                        checked={systemSettings?.phenixSync?.onlyComplete !== false}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          phenixSync: { ...(systemSettings?.phenixSync || {}), onlyComplete: e.target.checked }
                        })}
                        className="toggle toggle-primary toggle-sm"
                      />
                    </label>
                  </div>
                </div>

                {/* Info Card */}
                <div className="p-4 bg-info/10 border border-info/20 rounded-xl text-xs space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-info">
                    <span className="material-symbols-outlined text-sm">info</span>
                    <span>Automated Organization & Consignee Architecture</span>
                  </div>
                  <p className="text-base-content/80">
                    When consignments are fetched from Phenix ERP, the system matches <code>Client</code> (Merchant Store Name) to an existing <strong>Organization</strong> in Target-Prod or creates one on the fly. The recipient name and phone are stored as the Consignee with normalized destination country codes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: WhatsApp & Meta Cloud API */}
          {activeTab === 'whatsapp' && (
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="card-body p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-base-200">
                  <div>
                    <h2 className="text-lg font-black text-base-content tracking-tight">
                      Meta WhatsApp Business Cloud API
                    </h2>
                    <p className="text-xs text-base-content/60 mt-0.5">
                      Direct automated notifications for pickups, tracking links, and digital delivery confirmations.
                    </p>
                  </div>
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
                    className="btn btn-primary btn-sm font-bold text-xs gap-1.5 shadow-md shadow-primary/20"
                  >
                    {savingSettings ? <span className="loading loading-spinner loading-xs" /> : <span className="material-symbols-outlined text-base">save</span>}
                    <span>Save WhatsApp Config</span>
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-base-content/70 uppercase">API Provider Mode</label>
                      <select
                        value={systemSettings?.whatsapp?.provider || 'SHIPMENT_WHATSAPP'}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          whatsapp: { ...(systemSettings?.whatsapp || {}), provider: e.target.value },
                        })}
                        className="select select-bordered w-full text-sm font-medium focus:select-primary"
                      >
                        <option value="SHIPMENT_WHATSAPP">Target Microservice (msg.target-kw.com)</option>
                        <option value="META">Meta Official WhatsApp Cloud API</option>
                        <option value="CHATWOOT">Chatwoot Omnichannel Inbox</option>
                        <option value="MOCK">Mock Local Sandbox</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-base-content/70 uppercase">Service Endpoint URL / Phone ID</label>
                      <input
                        type="text"
                        value={systemSettings?.whatsapp?.serviceUrl || systemSettings?.whatsapp?.phoneNumberId || 'https://msg.target-kw.com'}
                        onChange={(e) => setSystemSettings({
                          ...systemSettings,
                          whatsapp: { ...(systemSettings?.whatsapp || {}), serviceUrl: e.target.value },
                        })}
                        placeholder="https://msg.target-kw.com"
                        className="input input-bordered w-full font-mono text-sm focus:input-primary"
                      />
                    </div>
                  </div>

                  {/* Incoming Webhook Box */}
                  <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-2">
                    <div className="text-[11px] font-bold text-base-content/60 uppercase">INCOMING META WEBHOOK ENDPOINT</div>
                    <div className="flex flex-col sm:flex-row gap-2 items-center">
                      <code className="input input-bordered w-full flex-1 font-mono text-xs flex items-center bg-base-100 select-all">
                        {`${window.location.origin}/api/whatsapp/webhook`}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp/webhook`);
                          enqueueSnackbar('Meta Webhook URL copied to clipboard!', { variant: 'info' });
                        }}
                        className="btn btn-outline border-base-300 btn-sm font-bold text-xs gap-1.5"
                      >
                        <span className="material-symbols-outlined text-base">content_copy</span>
                        <span>Copy URL</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-base-content/50">
                      Paste this URL into Meta App Dashboard &rarr; WhatsApp &rarr; Configuration &rarr; Webhook callback.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Notification Triggers */}
          {activeTab === 'notifications' && (
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="card-body p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-lg font-black text-base-content tracking-tight">
                    Automated Event Notification Triggers
                  </h2>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Configure customer alerting rules across SMS, Email, and WhatsApp channels.
                  </p>
                </div>

                <div className="divide-y divide-base-200 space-y-3">
                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <div className="font-bold text-sm text-base-content">Manifest Created (Email)</div>
                      <div className="text-xs text-base-content/60">Send PDF waybill receipt upon dispatch creation.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifs.email_ship}
                      onChange={(e) => setNotifs({ ...notifs, email_ship: e.target.checked })}
                      className="toggle toggle-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <div className="font-bold text-sm text-base-content">Proof of Delivery Captured (Email)</div>
                      <div className="text-xs text-base-content/60">Send delivery timestamp and signature POD receipt to shipper.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifs.email_del}
                      onChange={(e) => setNotifs({ ...notifs, email_del: e.target.checked })}
                      className="toggle toggle-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <div className="font-bold text-sm text-base-content">WhatsApp Live Radar Dispatch</div>
                      <div className="text-xs text-base-content/60">Send tracking web link to recipient mobile upon driver pickup.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifs.whatsapp_tracking}
                      onChange={(e) => setNotifs({ ...notifs, whatsapp_tracking: e.target.checked })}
                      className="toggle toggle-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-3">
                    <div>
                      <div className="font-bold text-sm text-base-content">Customs & Border Hold Alerts (SMS)</div>
                      <div className="text-xs text-base-content/60">Immediate alert if consignment is held at border checkpoints.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifs.sms_exception}
                      onChange={(e) => setNotifs({ ...notifs, sms_exception: e.target.checked })}
                      className="toggle toggle-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Carrier Gateways */}
          {activeTab === 'routing' && (
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="card-body p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-lg font-black text-base-content tracking-tight">
                    Active Multi-Carrier Gateways
                  </h2>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Authorized transport backbones connected to the Target Logistics Global operating network.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-base-content">DHL Express Global</span>
                      <span className="badge badge-success badge-sm font-bold">API Online</span>
                    </div>
                    <p className="text-xs text-base-content/60 leading-relaxed">
                      Worldwide priority airfreight, Dangerous Goods (DGR), and European bonded customs clearance.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-base-content">LogesTechs GCC Corridor</span>
                      <span className="badge badge-success badge-sm font-bold">Active Linehaul</span>
                    </div>
                    <p className="text-xs text-base-content/60 leading-relaxed">
                      Cross-border overland linehaul between Kuwait, Saudi Arabia, UAE, Bahrain, and Oman.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-base-content">Target Direct Courier Fleet</span>
                      <span className="badge badge-primary badge-sm font-bold">Internal Ops</span>
                    </div>
                    <p className="text-xs text-base-content/60 leading-relaxed">
                      Same-day courier dispatch across all 6 Kuwait Governorates with digital mobile POD.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-black text-sm text-base-content">OTE Overland Express</span>
                      <span className="badge badge-info badge-sm font-bold">Regional Freight</span>
                    </div>
                    <p className="text-xs text-base-content/60 leading-relaxed">
                      Heavy parcel, palletized freight, and scheduled regional cargo trailers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: Security & Access */}
          {activeTab === 'security' && (
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="card-body p-6 sm:p-8 space-y-6">
                <div>
                  <h2 className="text-lg font-black text-base-content tracking-tight">
                    Security Credentials & Password
                  </h2>
                  <p className="text-xs text-base-content/60 mt-0.5">
                    Update your account credentials and maintain secure platform access.
                  </p>
                </div>

                <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Current Password *</label>
                    <input
                      type="password"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      placeholder="••••••••"
                      className="input input-bordered w-full text-sm focus:input-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">New Password *</label>
                    <input
                      type="password"
                      value={passwords.newPass}
                      onChange={(e) => setPasswords({ ...passwords, newPass: e.target.value })}
                      placeholder="Minimum 8 characters"
                      className="input input-bordered w-full text-sm focus:input-primary"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-base-content/70 uppercase">Confirm New Password *</label>
                    <input
                      type="password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      placeholder="••••••••"
                      className="input input-bordered w-full text-sm focus:input-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingPassword || !passwords.newPass}
                    className="btn btn-primary font-bold text-xs shadow-md shadow-primary/20 gap-2"
                  >
                    {savingPassword ? <span className="loading loading-spinner loading-xs" /> : <span className="material-symbols-outlined text-base">lock_reset</span>}
                    <span>Update Password</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Address Modal */}
      {showAddressModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <h3 className="font-black text-base text-base-content">Add Address Preset</h3>
              <button
                type="button"
                onClick={() => setShowAddressModal(false)}
                className="btn btn-ghost btn-circle btn-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Preset Label *</label>
                  <input
                    type="text"
                    value={newAddr.label}
                    onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })}
                    placeholder="e.g. Shuwaikh Warehouse"
                    className="input input-bordered input-sm w-full"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Contact Person *</label>
                  <input
                    type="text"
                    value={newAddr.contactPerson}
                    onChange={(e) => setNewAddr({ ...newAddr, contactPerson: e.target.value })}
                    placeholder="Full Name"
                    className="input input-bordered input-sm w-full"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Phone Number</label>
                  <input
                    type="text"
                    value={newAddr.phone}
                    onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                    placeholder="+965 ..."
                    className="input input-bordered input-sm w-full font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Governorate</label>
                  <input
                    type="text"
                    value={newAddr.state}
                    onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })}
                    placeholder="Capital, Hawalli..."
                    className="input input-bordered input-sm w-full"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-base-content/70 uppercase">Street Address / Block</label>
                <input
                  type="text"
                  value={newAddr.streetLines[0]}
                  onChange={(e) => setNewAddr({ ...newAddr, streetLines: [e.target.value] })}
                  placeholder="Block, Street, Building"
                  className="input input-bordered input-sm w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">City / Area</label>
                  <input
                    type="text"
                    value={newAddr.city}
                    onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                    className="input input-bordered input-sm w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-base-content/70 uppercase">Country</label>
                  <select
                    value={newAddr.countryCode}
                    onChange={(e) => setNewAddr({ ...newAddr, countryCode: e.target.value })}
                    className="select select-bordered select-sm w-full"
                  >
                    <option value="KW">Kuwait 🇰🇼</option>
                    <option value="SA">Saudi Arabia 🇸🇦</option>
                    <option value="AE">UAE 🇦🇪</option>
                    <option value="BH">Bahrain 🇧🇭</option>
                    <option value="QA">Qatar 🇶🇦</option>
                    <option value="OM">Oman 🇴🇲</option>
                  </select>
                </div>
              </div>

              <div className="modal-action pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAddr}
                  className="btn btn-primary btn-sm font-bold"
                >
                  {savingAddr ? 'Saving...' : 'Save Preset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Webhook Modal */}
      {showAddWebhookModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <h3 className="font-black text-base text-base-content">Register Webhook Endpoint</h3>
              <button
                type="button"
                onClick={() => setShowAddWebhookModal(false)}
                className="btn btn-ghost btn-circle btn-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-base-content/70 uppercase">Destination URL *</label>
                <input
                  type="url"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  placeholder="https://api.yourdomain.com/webhooks/shipments"
                  className="input input-bordered input-sm w-full font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-base-content/70 uppercase">Signing Secret (Optional)</label>
                <input
                  type="text"
                  value={newWebhookSecret}
                  onChange={(e) => setNewWebhookSecret(e.target.value)}
                  placeholder="Leave empty to auto-generate secure 24-byte hex"
                  className="input input-bordered input-sm w-full font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-base-content/70 uppercase">Subscribed Events</label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 border border-base-200 rounded-lg bg-base-200/30">
                  {[
                    { id: 'shipment.created', label: 'shipment.created (Consignment booking)' },
                    { id: 'shipment.status_updated', label: 'shipment.status_updated (Milestone transitions)' },
                    { id: 'shipment.delivered', label: 'shipment.delivered (POD capture)' },
                    { id: 'shipment.booked', label: 'shipment.booked (Carrier AWB issued)' },
                    { id: '*', label: '* (All platform events)' },
                  ].map((ev) => {
                    const isChecked = newWebhookEvents.includes(ev.id);
                    return (
                      <label key={ev.id} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setNewWebhookEvents(newWebhookEvents.filter((x) => x !== ev.id));
                            } else {
                              setNewWebhookEvents([...newWebhookEvents, ev.id]);
                            }
                          }}
                          className="checkbox checkbox-primary checkbox-xs"
                        />
                        <span>{ev.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="modal-action pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddWebhookModal(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingWebhook}
                  className="btn btn-primary btn-sm font-bold"
                >
                  {creatingWebhook ? 'Registering...' : 'Register Endpoint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
