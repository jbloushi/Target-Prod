import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { organizationService, settingsService, shipmentService, userService } from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import { getRoleLabel } from '../../utils/roleLabels';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

const CARRIER_SERVICE_OPTIONS = {
    DGR: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    DGR2: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    DHL: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    DHL2: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    ARAMEX: [{ serviceCode: 'P', serviceName: 'Aramex Priority' }],
    FEDEX: [{ serviceCode: 'P', serviceName: 'FedEx Priority' }],
    OTE: [{ serviceCode: 'STD', serviceName: 'OTE Standard' }],
    SMSA: [
        { serviceCode: 'DLV', serviceName: 'SMSA Express Delivery' },
        { serviceCode: 'RTN', serviceName: 'SMSA Reverse Return' }
    ]
};

const normalizeShippingAccess = (u = {}) => {
    const existing = u.agentPolicy?.shippingAccess;
    const carrierCode = (existing?.carrierCode || u.carrierConfig?.preferredCarrier || 'DGR').toUpperCase();
    if (existing?.mode === 'manual' || carrierCode === 'MANUAL') {
        return { mode: 'manual', carrierCode: 'MANUAL', serviceCode: '', serviceName: 'Manual Shipment' };
    }
    const serviceCode = existing?.serviceCode || u.carrierConfig?.serviceCode || '';
    const serviceName =
        existing?.serviceName ||
        CARRIER_SERVICE_OPTIONS[carrierCode]?.find((s) => s.serviceCode === serviceCode)?.serviceName ||
        serviceCode;
    return { mode: 'carrier', carrierCode, serviceCode, serviceName };
};

const ROLE_BADGE_STYLES = {
    admin: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    accounting: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    manager: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    staff: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    driver: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    org_manager: 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    org_agent: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    client: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
};

export const AdminUsersV2Page = () => {
    const { enqueueSnackbar } = useSnackbar();
    const { user: currentUser } = useAuth();
    const { lang, isRTL } = useLanguage();

    const role = currentUser?.role;
    const isOrgManager = role === 'org_manager';
    const canFullAdmin = ['admin', 'manager', 'accounting'].includes(role) && hasCapability(role, CAPABILITIES.MANAGE_USERS);
    const canManageOrgUsers = isOrgManager && hasCapability(role, CAPABILITIES.MANAGE_ORG_USERS);
    const hasPageAccess = canFullAdmin || canManageOrgUsers;
    const canViewCostData = hasCapability(role, CAPABILITIES.VIEW_COST_DATA);

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    // Edit / Create Modal
    const [openDialog, setOpenDialog] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');
    const [saveLoading, setSaveLoading] = useState(false);
    const [formData, setFormData] = useState({});
    const [showChatwootToken, setShowChatwootToken] = useState(false);

    // Aux Data
    const [organizations, setOrganizations] = useState([]);
    const [clientUsers, setClientUsers] = useState([]);
    const [availableCarriers, setAvailableCarriers] = useState([]);
    const [availableRateCards, setAvailableRateCards] = useState([]);

    // Delete & Reset Password
    const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [resetUser, setResetUser] = useState(null);
    const [resetPasswordValue, setResetPasswordValue] = useState('');
    const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

    const fetchUsers = useCallback(async () => {
        if (!hasPageAccess) return;
        setLoading(true);
        setFetchError(null);
        try {
            const res = await userService.getUsers(roleFilter);
            setUsers(res?.data || []);
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || (lang === 'ar' ? 'فشل تحميل المستخدمين' : 'Failed to load users');
            setFetchError(msg);
        } finally {
            setLoading(false);
        }
    }, [hasPageAccess, roleFilter, lang]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        if (!openDialog || !hasPageAccess) return;
        const onAuxError = (label) => () => {
            enqueueSnackbar(
                lang === 'ar' ? `تعذر تحميل ${label}` : `Failed to load ${label}`,
                { variant: 'warning' }
            );
        };
        if (isOrgManager) {
            setOrganizations(currentUser?.organization ? [currentUser.organization] : []);
        } else {
            organizationService.getOrganizations().then((r) => setOrganizations(r?.data || [])).catch(onAuxError('organizations'));
            userService.getUsers('org').then((r) => setClientUsers(r?.data || [])).catch(onAuxError('client users'));
        }
        shipmentService.getAvailableCarriers(undefined, { scope: 'assignment' }).then((r) => setAvailableCarriers(r?.data || [])).catch(onAuxError('carriers'));
        if (canViewCostData) {
            settingsService.getRateCards().then((r) => setAvailableRateCards(r?.data || [])).catch(onAuxError('rate cards'));
        }
    }, [openDialog, hasPageAccess, isOrgManager, currentUser, canViewCostData, enqueueSnackbar, lang]);

    const kpiMetrics = useMemo(() => {
        const total = users.length;
        const managementCount = users.filter((u) => ['admin', 'manager', 'accounting', 'staff'].includes(u.role)).length;
        const driverCount = users.filter((u) => u.role === 'driver').length;
        const clientCount = users.filter((u) => ['org_manager', 'org_agent', 'client'].includes(u.role)).length;
        return { total, managementCount, driverCount, clientCount };
    }, [users]);

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter((u) => {
            const matchesRole = !roleFilter || u.role === roleFilter;
            const matchesSearch =
                !q ||
                u.name?.toLowerCase().includes(q) ||
                u.email?.toLowerCase().includes(q) ||
                u.phone?.toLowerCase().includes(q) ||
                u.organization?.name?.toLowerCase().includes(q);
            return matchesRole && matchesSearch;
        });
    }, [users, roleFilter, search]);

    const handleOpenDialog = (targetUser = null) => {
        setEditingUser(targetUser);
        const initialData = targetUser
            ? { ...targetUser }
            : {
                  name: '',
                  email: '',
                  phone: '',
                  password: '',
                  role: isOrgManager ? 'org_agent' : 'staff',
                  organizationId: isOrgManager ? currentUser?.organizationId : '',
                  active: true,
                  carrierConfig: { preferredCarrier: 'DGR', traderType: 'business', pricingByCarrier: { OTE: { fixedFee: 25, currency: 'AED' } } },
                  markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
                  optionalServiceMarkup: { insurance: { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 } },
                  accessScopes: [],
                  chatwootUserId: '',
                  chatwootEmail: ''
              };

        initialData.shippingAccess = normalizeShippingAccess(initialData);
        if (!initialData.carrierConfig) initialData.carrierConfig = { preferredCarrier: 'DGR', traderType: 'business' };
        if (!initialData.carrierConfig.pricingByCarrier) initialData.carrierConfig.pricingByCarrier = {};
        if (!initialData.carrierConfig.pricingByCarrier.OTE) initialData.carrierConfig.pricingByCarrier.OTE = { fixedFee: 25, currency: 'AED' };
        if (!initialData.markup) initialData.markup = { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
        if (!initialData.optionalServiceMarkup) initialData.optionalServiceMarkup = { insurance: { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 } };
        initialData.accessScopes = initialData.accessScopes || [];
        initialData.chatwootUserId = targetUser?.chatwootUserId || '';
        initialData.chatwootEmail = targetUser?.chatwootEmail || '';
        initialData.chatwootAccessToken = '';
        initialData.hasChatwootAccessToken = Boolean(targetUser?.chatwootAccessToken);
        initialData.clearChatwootAccessToken = false;
        setShowChatwootToken(false);
        if (isOrgManager) {
            initialData.organizationId = currentUser?.organizationId || '';
        } else if (typeof initialData.organization === 'object' && initialData.organization) {
            initialData.organizationId = initialData.organization.id;
        }
        setFormData(initialData);
        setActiveTab('profile');
        setOpenDialog(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name?.trim() || !formData.email?.trim()) {
            enqueueSnackbar(lang === 'ar' ? 'الاسم والبريد الإلكتروني مطلوبان' : 'Name and email are required', { variant: 'warning' });
            return;
        }
        if (!editingUser && (!formData.password || formData.password.length < 8)) {
            enqueueSnackbar(lang === 'ar' ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters', { variant: 'warning' });
            return;
        }
        setSaveLoading(true);
        try {
            const payload = {
                name: formData.name.trim(),
                email: formData.email.trim(),
                phone: formData.phone?.trim() || '',
                role: isOrgManager ? (['org_manager', 'org_agent'].includes(formData.role) ? formData.role : 'org_agent') : formData.role,
                organizationId: isOrgManager ? currentUser?.organizationId : formData.organizationId || null,
                active: formData.active ?? true
            };
            if (!editingUser && formData.password) {
                payload.password = formData.password;
            }
            if (role === 'admin') {
                payload.chatwootUserId = formData.chatwootUserId ? String(formData.chatwootUserId).trim() : null;
                payload.chatwootEmail = formData.chatwootEmail ? String(formData.chatwootEmail).trim() : null;
                if (formData.clearChatwootAccessToken) {
                    payload.chatwootAccessToken = null;
                } else if (formData.chatwootAccessToken?.trim()) {
                    payload.chatwootAccessToken = formData.chatwootAccessToken.trim();
                }
            }
            if (canFullAdmin) {
                payload.agentPolicy = {
                    ...(editingUser?.agentPolicy || {}),
                    shippingAccess: formData.shippingAccess
                };
                payload.carrierConfig = {
                    ...(formData.carrierConfig || {}),
                    preferredCarrier: formData.shippingAccess?.carrierCode || 'DGR',
                    serviceCode: formData.shippingAccess?.serviceCode || ''
                };
            }
            if (canViewCostData && formData.markup) {
                payload.markup = {
                    type: formData.markup.type || 'PERCENTAGE',
                    percentageValue: Number(formData.markup.percentageValue || 0),
                    flatValue: Number(formData.markup.flatValue || 0)
                };
                if (formData.optionalServiceMarkup?.insurance) {
                    payload.optionalServiceMarkup = {
                        insurance: {
                            enabled: Boolean(formData.optionalServiceMarkup.insurance.enabled),
                            type: formData.optionalServiceMarkup.insurance.type || 'PERCENTAGE',
                            percentageValue: Number(formData.optionalServiceMarkup.insurance.percentageValue || 0),
                            flatValue: Number(formData.optionalServiceMarkup.insurance.flatValue || 0)
                        }
                    };
                }
            }

            const accessScopes = formData.accessScopes || [];
            if (editingUser) {
                await userService.updateUser(editingUser.id, payload);
                if (!isOrgManager && ['staff', 'driver'].includes(payload.role)) {
                    await userService.replaceAccessScopes(editingUser.id, accessScopes);
                }
                enqueueSnackbar(lang === 'ar' ? 'تم تحديث المستخدم بنجاح' : 'User updated successfully', { variant: 'success' });
            } else {
                const created = await userService.createUser(payload);
                if (!isOrgManager && ['staff', 'driver'].includes(payload.role) && created?.data?.id) {
                    await userService.replaceAccessScopes(created.data.id, accessScopes);
                }
                enqueueSnackbar(lang === 'ar' ? 'تم إنشاء المستخدم بنجاح' : 'User created successfully', { variant: 'success' });
            }
            setOpenDialog(false);
            fetchUsers();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (lang === 'ar' ? 'فشل حفظ المستخدم' : 'Failed to save user'), { variant: 'error' });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        if (!resetUser || !resetPasswordValue || resetPasswordValue.length < 8) {
            enqueueSnackbar(lang === 'ar' ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters', { variant: 'warning' });
            return;
        }
        setResetPasswordLoading(true);
        try {
            await userService.resetPassword(resetUser.id, resetPasswordValue);
            enqueueSnackbar(lang === 'ar' ? `تم إعادة تعيين كلمة المرور للمستخدم ${resetUser.name}` : `Password reset for ${resetUser.name}`, { variant: 'success' });
            setResetUser(null);
            setResetPasswordValue('');
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل إعادة تعيين كلمة المرور' : 'Failed to reset password'), { variant: 'error' });
        } finally {
            setResetPasswordLoading(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteConfirmUser) return;
        setDeleteLoading(true);
        try {
            await userService.deleteUser(deleteConfirmUser.id);
            enqueueSnackbar(lang === 'ar' ? 'تم حذف المستخدم بنجاح' : 'User deleted successfully', { variant: 'success' });
            setDeleteConfirmUser(null);
            fetchUsers();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل حذف المستخدم' : 'Failed to delete user'), { variant: 'error' });
        } finally {
            setDeleteLoading(false);
        }
    };

    if (!hasPageAccess) {
        return (
            <div dir={isRTL ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto px-4 py-12">
                <EmptyStateV2
                    icon="lock"
                    title={lang === 'ar' ? 'صلاحية الوصول مقيدة' : 'Access Restricted'}
                    description={lang === 'ar' ? 'إدارة المستخدمين متاحة فقط لمسؤولي النظام ومديري الشركات.' : 'User governance is restricted to authorized platform administrators and organization managers.'}
                />
            </div>
        );
    }

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="w-full min-h-screen pb-14">
            <div className="max-w-[1600px] mx-auto pt-5 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            V2 Governance
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? 'إدارة المستخدمين والصلاحيات مع عزل بيانات التكلفة' : 'Hardened user & RBAC governance with strict cost-data isolation'}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link
                            to="/dashboard-v2"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">dashboard</span>
                            <span>{lang === 'ar' ? 'لوحة V2' : 'V2 Cockpit'}</span>
                        </Link>
                        <Link
                            to="/admin/users"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{lang === 'ar' ? 'الرجوع إلى V1' : 'Switch to V1 Standard'}</span>
                        </Link>
                    </div>
                </div>

                {/* Page Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                            {lang === 'ar' ? 'إدارة المستخدمين والصلاحيات' : 'Users & Access Governance'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {isOrgManager
                                ? (lang === 'ar' ? 'إدارة حسابات أعضاء مؤسستك وصلاحياتهم.' : 'Manage user accounts and operational roles within your organization.')
                                : (lang === 'ar' ? 'إدارة حسابات المنصة، سياسات الشحن، وصلاحيات الوصول.' : 'Manage platform accounts, shipping policies, and organization assignments.')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={fetchUsers}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                        >
                            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                            <span>{lang === 'ar' ? 'تحديث' : 'Refresh'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenDialog(null)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">person_add</span>
                            <span>{lang === 'ar' ? 'مستخدم جديد' : 'New User'}</span>
                        </button>
                    </div>
                </div>

                {fetchError && <ErrorBannerV2 message={fetchError} onRetry={fetchUsers} isRetrying={loading} />}

                {/* KPI Summary Strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[
                        { label: lang === 'ar' ? 'إجمالي المستخدمين' : 'Total Users', value: kpiMetrics.total, icon: 'group', color: 'text-primary' },
                        { label: lang === 'ar' ? 'فريق المنصة' : 'Platform Ops', value: kpiMetrics.managementCount, icon: 'admin_panel_settings', color: 'text-indigo-600 dark:text-indigo-400' },
                        { label: lang === 'ar' ? 'السائقون' : 'Drivers', value: kpiMetrics.driverCount, icon: 'local_shipping', color: 'text-emerald-600 dark:text-emerald-400' },
                        { label: lang === 'ar' ? 'حسابات العملاء' : 'Client Accounts', value: kpiMetrics.clientCount, icon: 'apartment', color: 'text-violet-600 dark:text-violet-400' }
                    ].map((kpi) => (
                        <div key={kpi.label} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate">{kpi.label}</span>
                                <span className={`material-symbols-outlined text-xl shrink-0 ${kpi.color}`} aria-hidden="true">{kpi.icon}</span>
                            </div>
                            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1.5 tabular-nums" dir="ltr">
                                {kpi.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Search & Role Filters */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                    <div className="relative w-full">
                        <span className="material-symbols-outlined text-lg text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" aria-hidden="true">search</span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={lang === 'ar' ? 'بحث بالاسم، البريد، الهاتف، أو المؤسسة...' : 'Search by name, email, phone, or organization...'}
                            className="w-full ps-9 pe-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Clear search"
                                className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-base">close</span>
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        {[
                            { key: '', label: lang === 'ar' ? 'الكل' : 'All Roles' },
                            ...(!isOrgManager
                                ? [
                                      { key: 'admin', label: 'Admin' },
                                      { key: 'manager', label: 'Manager' },
                                      { key: 'accounting', label: 'Accounting' },
                                      { key: 'staff', label: 'Staff' },
                                      { key: 'driver', label: 'Driver' }
                                  ]
                                : []),
                            { key: 'org_manager', label: 'Company Manager' },
                            { key: 'org_agent', label: 'Company Client' }
                        ].map((f) => (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => setRoleFilter(f.key)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                    roleFilter === f.key
                                        ? 'bg-primary text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Users Content */}
                {loading ? (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center">
                        <span className="loading loading-spinner loading-md text-primary" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">
                            {lang === 'ar' ? 'جارٍ تحميل المستخدمين...' : 'Loading user directory...'}
                        </p>
                    </div>
                ) : filteredUsers.length === 0 && !fetchError ? (
                    <EmptyStateV2
                        icon="group_off"
                        title={lang === 'ar' ? 'لا يوجد مستخدمون مطابقون' : 'No users found'}
                        description={lang === 'ar' ? 'جرّب تعديل معايير البحث أو التصفية.' : 'Try adjusting your search query or role filter.'}
                        actionLabel={lang === 'ar' ? 'إضافة مستخدم' : 'New User'}
                        onAction={() => handleOpenDialog(null)}
                    />
                ) : (
                    <>
                        {/* Mobile Cards (< md) */}
                        <div className="grid grid-cols-1 gap-3 md:hidden">
                            {filteredUsers.map((u) => {
                                const access = normalizeShippingAccess(u);
                                return (
                                    <div key={u.id} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{u.name}</div>
                                                <div className="text-xs text-slate-600 dark:text-slate-400 truncate" dir="ltr">{u.email}</div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold shrink-0 ${ROLE_BADGE_STYLES[u.role] || ROLE_BADGE_STYLES.client}`}>
                                                {getRoleLabel(u.role, lang)}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">{lang === 'ar' ? 'المؤسسة' : 'Organization'}</span>
                                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">{u.organization?.name || '—'}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">{lang === 'ar' ? 'الشحن' : 'Network'}</span>
                                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block" dir="ltr">{access.carrierCode}</span>
                                            </div>
                                            {canViewCostData && (
                                                <div>
                                                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">{lang === 'ar' ? 'الهامش' : 'Markup'}</span>
                                                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums" dir="ltr">
                                                        {u.markup?.percentageValue ?? 15}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <button type="button" onClick={() => handleOpenDialog(u)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                {lang === 'ar' ? 'تعديل' : 'Edit'}
                                            </button>
                                            <button type="button" onClick={() => setResetUser(u)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                {lang === 'ar' ? 'كلمة المرور' : 'Reset PW'}
                                            </button>
                                            {canFullAdmin && u.id !== currentUser?.id && (
                                                <button type="button" onClick={() => setDeleteConfirmUser(u)} className="px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-xs font-bold text-rose-700 dark:text-rose-300 cursor-pointer">
                                                    {lang === 'ar' ? 'حذف' : 'Delete'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop Table (>= md) */}
                        <div className="hidden md:block rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-start">
                                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'المستخدم' : 'User'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'المؤسسة' : 'Organization'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'شبكة الشحن' : 'Assigned Network'}</th>
                                            {canViewCostData && <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الهامش' : 'Markup'}</th>}
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الحد الائتماني' : 'Credit Limit'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredUsers.map((u) => {
                                            const access = normalizeShippingAccess(u);
                                            const m = u.markup || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
                                            return (
                                                <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-900 dark:text-slate-100">{u.name}</div>
                                                        <div className="text-slate-500 dark:text-slate-400" dir="ltr">{u.email}</div>
                                                        {u.phone && <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400" dir="ltr">{u.phone}</div>}
                                                        {role === 'admin' && (u.chatwootUserId || u.chatwootEmail) && (
                                                            <span className="inline-flex mt-0.5 px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-mono text-[10px] font-bold" dir="ltr">
                                                                CW #{u.chatwootUserId || u.chatwootEmail}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[11px] font-bold ${ROLE_BADGE_STYLES[u.role] || ROLE_BADGE_STYLES.client}`}>
                                                            {getRoleLabel(u.role, lang)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">
                                                        {u.organization?.name || '—'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200" dir="ltr">{access.carrierCode}</span>
                                                        {access.serviceName && <div className="text-[11px] text-slate-500 dark:text-slate-400">{access.serviceName}</div>}
                                                    </td>
                                                    {canViewCostData && (
                                                        <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums" dir="ltr">
                                                            {m.type === 'FLAT' ? `${m.flatValue || 0} KWD` : `${m.percentageValue ?? 15}%`}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-end font-mono tabular-nums text-slate-600 dark:text-slate-400" dir="ltr">
                                                        {u.organization ? `${Number(u.organization.creditLimit || 0).toFixed(3)} KWD` : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-end">
                                                        <div className="inline-flex items-center justify-end gap-1">
                                                            <button type="button" onClick={() => handleOpenDialog(u)} title={lang === 'ar' ? 'تعديل' : 'Edit'} className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                                                <span className="material-symbols-outlined text-base">edit</span>
                                                            </button>
                                                            <button type="button" onClick={() => setResetUser(u)} title={lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset Password'} className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                                                <span className="material-symbols-outlined text-base">key</span>
                                                            </button>
                                                            {canFullAdmin && u.id !== currentUser?.id && (
                                                                <button type="button" onClick={() => setDeleteConfirmUser(u)} title={lang === 'ar' ? 'حذف' : 'Delete'} className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
                                                                    <span className="material-symbols-outlined text-base">delete</span>
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
                        </div>
                    </>
                )}
            </div>

            {/* Create / Edit User Modal */}
            {openDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                                {editingUser ? (lang === 'ar' ? `تعديل: ${editingUser.name}` : `Edit User: ${editingUser.name}`) : (lang === 'ar' ? 'إنشاء مستخدم جديد' : 'Create New User')}
                            </h2>
                            <button type="button" onClick={() => setOpenDialog(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
                            {[
                                { id: 'profile', label: lang === 'ar' ? 'البيانات الأساسية' : 'Profile & Role' },
                                ...(canFullAdmin ? [{ id: 'shipping', label: lang === 'ar' ? 'سياسة الشحن' : 'Shipping Access' }] : []),
                                ...(canViewCostData ? [{ id: 'pricing', label: lang === 'ar' ? 'الهامش والتسعير' : 'Markup & Cost' }] : [])
                            ].map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveTab(t.id)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                                        activeTab === t.id ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            {activeTab === 'profile' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'الاسم الكامل *' : 'Full Name *'}</label>
                                        <input type="text" required value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'البريد الإلكتروني *' : 'Email *'}</label>
                                        <input type="email" required dir="ltr" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'الهاتف' : 'Phone'}</label>
                                        <input type="text" dir="ltr" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'الدور *' : 'Role *'}</label>
                                        <select value={formData.role || 'staff'} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                            {!isOrgManager && (
                                                <>
                                                    <option value="admin">Admin</option>
                                                    <option value="manager">Manager</option>
                                                    <option value="accounting">Accounting</option>
                                                    <option value="staff">Staff</option>
                                                    <option value="driver">Driver</option>
                                                </>
                                            )}
                                            <option value="org_manager">Company Manager</option>
                                            <option value="org_agent">Company Client</option>
                                        </select>
                                    </div>
                                    {!editingUser && (
                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'كلمة المرور *' : 'Initial Password *'}</label>
                                            <input type="password" required minLength={8} dir="ltr" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100" />
                                        </div>
                                    )}
                                    {!isOrgManager && (
                                        <div className="sm:col-span-2">
                                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'المؤسسة' : 'Organization'}</label>
                                            <select value={formData.organizationId || ''} onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100">
                                                <option value="">{lang === 'ar' ? '— بدون مؤسسة —' : '— No Organization —'}</option>
                                                {organizations.map((org) => (
                                                    <option key={org.id} value={org.id}>{org.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {role === 'admin' && (
                                        <>
                                            <div>
                                                <label htmlFor="chatwoot-user-id-v2" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Inbox User ID</label>
                                                <input id="chatwoot-user-id-v2" type="text" dir="ltr" placeholder="e.g. 104" value={formData.chatwootUserId || ''} onChange={(e) => setFormData({ ...formData, chatwootUserId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100" />
                                            </div>
                                            <div>
                                                <label htmlFor="chatwoot-agent-email-v2" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Inbox Agent Email</label>
                                                <input id="chatwoot-agent-email-v2" type="email" dir="ltr" value={formData.chatwootEmail || ''} onChange={(e) => setFormData({ ...formData, chatwootEmail: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100" />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <label htmlFor="chatwoot-agent-token-v2" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                                        {lang === 'ar' ? 'رمز وصول الوكيل الشخصي' : 'Agent Personal Access Token'}
                                                    </label>
                                                    {formData.hasChatwootAccessToken && !formData.clearChatwootAccessToken && (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                                            <span className="material-symbols-outlined text-xs">check_circle</span>
                                                            {lang === 'ar' ? 'تم الإعداد' : 'Configured'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        id="chatwoot-agent-token-v2"
                                                        type={showChatwootToken ? 'text' : 'password'}
                                                        autoComplete="new-password"
                                                        spellCheck="false"
                                                        dir="ltr"
                                                        value={formData.chatwootAccessToken || ''}
                                                        onChange={(e) => setFormData({ ...formData, chatwootAccessToken: e.target.value })}
                                                        placeholder={lang === 'ar' ? 'أدخل رمزاً جديداً للاستبدال' : 'Enter a new token to replace the saved token'}
                                                        disabled={formData.clearChatwootAccessToken}
                                                        className="w-full pe-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
                                                        data-testid="input-chatwoot-access-token-v2"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowChatwootToken((visible) => !visible)}
                                                        aria-pressed={showChatwootToken}
                                                        aria-label={showChatwootToken
                                                            ? (lang === 'ar' ? 'إخفاء رمز Inbox' : 'Hide Inbox token')
                                                            : (lang === 'ar' ? 'إظهار رمز Inbox' : 'Show Inbox token')}
                                                        className="absolute inset-y-0 end-2 flex items-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{showChatwootToken ? 'visibility_off' : 'visibility'}</span>
                                                    </button>
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                                                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                                                        {lang === 'ar'
                                                            ? 'اتركه فارغاً للاحتفاظ بالرمز الحالي. يُشفّر الرمز عند حفظه.'
                                                            : 'Leave blank to keep the current token. Tokens are encrypted when saved.'}
                                                    </p>
                                                    {formData.hasChatwootAccessToken && (
                                                        <label className="inline-flex items-center gap-2 text-[10.5px] font-semibold text-rose-700 dark:text-rose-300 cursor-pointer">
                                                            <span>{lang === 'ar' ? 'إزالة الرمز المحفوظ' : 'Remove saved token'}</span>
                                                            <input type="checkbox" checked={Boolean(formData.clearChatwootAccessToken)} onChange={(e) => setFormData({ ...formData, clearChatwootAccessToken: e.target.checked })} className="checkbox checkbox-error checkbox-xs" />
                                                        </label>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <div className="sm:col-span-2 pt-1">
                                        <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                                            <input type="checkbox" checked={formData.active ?? true} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} className="checkbox checkbox-sm checkbox-primary" />
                                            <span>{lang === 'ar' ? 'حساب نشط' : 'Account Active'}</span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'shipping' && canFullAdmin && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'الناقل الافتراضي' : 'Preferred Carrier'}</label>
                                        <select
                                            value={formData.shippingAccess?.carrierCode || 'DGR'}
                                            onChange={(e) => {
                                                const code = e.target.value;
                                                setFormData({
                                                    ...formData,
                                                    shippingAccess: code === 'MANUAL'
                                                        ? { mode: 'manual', carrierCode: 'MANUAL', serviceCode: '', serviceName: 'Manual Shipment' }
                                                        : { mode: 'carrier', carrierCode: code, serviceCode: '', serviceName: 'Any Available Service' }
                                                });
                                            }}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100"
                                        >
                                            <option value="DGR">DGR</option>
                                            <option value="DGR2">DHL</option>
                                            <option value="FEDEX">FedEx Express</option>
                                            <option value="ARAMEX">Aramex</option>
                                            <option value="SMSA">SMSA Express</option>
                                            <option value="OTE">OTE / LogesTechs</option>
                                            <option value="MANUAL">Manual Shipment</option>
                                            {availableCarriers.filter((c) => !['DGR', 'DGR2', 'FEDEX', 'ARAMEX', 'SMSA', 'OTE', 'MANUAL'].includes(c.code)).map((c) => (
                                                <option key={c.code} value={c.code}>{c.name || c.code}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {['staff', 'driver'].includes(formData.role) && (
                                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                    {lang === 'ar' ? 'نطاقات الوصول المخصصة (Access Scopes)' : 'Assigned Access Scopes'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({
                                                        ...formData,
                                                        accessScopes: [...(formData.accessScopes || []), { scopeType: 'COMPANY_ALL_USERS', organizationId: '', clientUserId: '', canViewShipments: true, canCreateOnBehalf: false }]
                                                    })}
                                                    className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold cursor-pointer"
                                                >
                                                    + {lang === 'ar' ? 'إضافة نطاق' : 'Add Scope'}
                                                </button>
                                            </div>
                                            {(formData.accessScopes || []).map((scope, idx) => (
                                                <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <select
                                                            value={scope.scopeType || 'COMPANY_ALL_USERS'}
                                                            onChange={(e) => {
                                                                const next = [...(formData.accessScopes || [])];
                                                                next[idx] = { ...scope, scopeType: e.target.value };
                                                                setFormData({ ...formData, accessScopes: next });
                                                            }}
                                                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-slate-100"
                                                        >
                                                            <option value="COMPANY_ALL_USERS">Company (All Users)</option>
                                                            <option value="CLIENT_USER">Specific Client User</option>
                                                        </select>
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({
                                                                ...formData,
                                                                accessScopes: (formData.accessScopes || []).filter((_, i) => i !== idx)
                                                            })}
                                                            className="p-1 text-rose-600 cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-base">delete</span>
                                                        </button>
                                                    </div>
                                                    {scope.scopeType === 'CLIENT_USER' ? (
                                                        <select
                                                            value={scope.clientUserId || ''}
                                                            onChange={(e) => {
                                                                const next = [...(formData.accessScopes || [])];
                                                                next[idx] = { ...scope, clientUserId: e.target.value };
                                                                setFormData({ ...formData, accessScopes: next });
                                                            }}
                                                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                                                        >
                                                            <option value="">{lang === 'ar' ? 'اختر عميلاً...' : 'Select client user...'}</option>
                                                            {clientUsers.map((cu) => (
                                                                <option key={cu.id} value={cu.id}>{cu.name} ({cu.email})</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <select
                                                            value={scope.organizationId || ''}
                                                            onChange={(e) => {
                                                                const next = [...(formData.accessScopes || [])];
                                                                next[idx] = { ...scope, organizationId: e.target.value };
                                                                setFormData({ ...formData, accessScopes: next });
                                                            }}
                                                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                                                        >
                                                            <option value="">{lang === 'ar' ? 'اختر مؤسسة...' : 'Select organization...'}</option>
                                                            {organizations.map((org) => (
                                                                <option key={org.id} value={org.id}>{org.name}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'pricing' && canViewCostData && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'نموذج الهامش' : 'Markup Type'}</label>
                                        <select
                                            value={formData.markup?.type || 'PERCENTAGE'}
                                            onChange={(e) => setFormData({ ...formData, markup: { ...(formData.markup || {}), type: e.target.value } })}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100"
                                        >
                                            <option value="PERCENTAGE">Percentage (%)</option>
                                            <option value="FLAT">Flat (KWD)</option>
                                            <option value="COMBINED">Combined (% + Flat)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'نسبة الهامش (%)' : 'Percentage (%)'}</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            dir="ltr"
                                            value={formData.markup?.percentageValue ?? 15}
                                            onChange={(e) => setFormData({ ...formData, markup: { ...(formData.markup || {}), percentageValue: e.target.value } })}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'رسوم ثابتة (KWD)' : 'Flat Markup (KWD)'}</label>
                                        <input
                                            type="number"
                                            step="0.001"
                                            dir="ltr"
                                            value={formData.markup?.flatValue ?? 0}
                                            onChange={(e) => setFormData({ ...formData, markup: { ...(formData.markup || {}), flatValue: e.target.value } })}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'رسوم OTE الثابتة' : 'OTE Fixed Fee'}</label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            dir="ltr"
                                            value={formData.carrierConfig?.pricingByCarrier?.OTE?.fixedFee ?? 25}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                carrierConfig: {
                                                    ...(formData.carrierConfig || {}),
                                                    pricingByCarrier: {
                                                        ...(formData.carrierConfig?.pricingByCarrier || {}),
                                                        OTE: { ...(formData.carrierConfig?.pricingByCarrier?.OTE || { currency: 'AED' }), fixedFee: e.target.value }
                                                    }
                                                }
                                            })}
                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    {availableRateCards.length > 0 && (
                                        <div className="sm:col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
                                            {lang === 'ar' ? `بطاقات الأسعار المتاحة: ${availableRateCards.length}` : `Available system rate cards: ${availableRateCards.length}`}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                                <button type="button" onClick={() => setOpenDialog(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button type="submit" disabled={saveLoading} className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                    {saveLoading ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ' : 'Save User')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <form onSubmit={handleResetPasswordSubmit} className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                            {lang === 'ar' ? `إعادة تعيين كلمة المرور: ${resetUser.name}` : `Reset Password: ${resetUser.name}`}
                        </h3>
                        <input
                            type="password"
                            required
                            minLength={8}
                            dir="ltr"
                            placeholder="New password (min 8 chars)"
                            value={resetPasswordValue}
                            onChange={(e) => setResetPasswordValue(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setResetUser(null)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="submit" disabled={resetPasswordLoading} className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {resetPasswordLoading ? '...' : (lang === 'ar' ? 'تحديث' : 'Update')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirmUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <h3 className="text-base font-black text-rose-600 dark:text-rose-400">
                            {lang === 'ar' ? 'تأكيد حذف المستخدم' : 'Confirm User Deletion'}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? `هل أنت متأكد من حذف ${deleteConfirmUser.name}؟` : `Are you sure you want to delete ${deleteConfirmUser.name}?`}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDeleteConfirmUser(null)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="button" disabled={deleteLoading} onClick={handleDeleteUser} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {deleteLoading ? '...' : (lang === 'ar' ? 'حذف' : 'Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUsersV2Page;
