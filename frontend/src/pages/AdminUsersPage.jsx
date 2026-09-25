import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useSnackbar } from 'notistack';
import { userService, organizationService, shipmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getRoleLabel } from '../utils/roleLabels';

const CARRIER_SERVICE_OPTIONS = {
    DGR: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    DHL: [
        { serviceCode: 'P', serviceName: 'DHL Express Worldwide' },
        { serviceCode: 'Y', serviceName: 'DHL Express 12:00' },
        { serviceCode: 'H', serviceName: 'DHL Economy Select' }
    ],
    ARAMEX: [
        { serviceCode: 'P', serviceName: 'Aramex Priority' }
    ],
    FEDEX: [
        { serviceCode: 'P', serviceName: 'FedEx Priority' }
    ],
    OTE: [
        { serviceCode: 'STD', serviceName: 'OTE Standard' }
    ]
};

const normalizeShippingAccess = (user = {}) => {
    const existing = user.agentPolicy?.shippingAccess;
    const carrierCode = (existing?.carrierCode || user.carrierConfig?.preferredCarrier || 'DGR').toUpperCase();

    if (existing?.mode === 'manual' || carrierCode === 'MANUAL') {
        return { mode: 'manual', carrierCode: 'MANUAL', serviceCode: '', serviceName: 'Manual Shipment' };
    }

    const serviceCode = existing?.serviceCode || user.carrierConfig?.serviceCode || '';
    const serviceName = existing?.serviceName
        || CARRIER_SERVICE_OPTIONS[carrierCode]?.find(service => service.serviceCode === serviceCode)?.serviceName
        || serviceCode;

    return { mode: 'carrier', carrierCode, serviceCode, serviceName };
};

const AdminUsersPage = () => {
    const { enqueueSnackbar } = useSnackbar();
    const { user: currentUser } = useAuth();
    const { lang, isRTL } = useLanguage();

    const isOrgManager = currentUser?.role === 'org_manager';
    const canFullAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager';

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    // Dialog State
    const [openDialog, setOpenDialog] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');
    const [saveLoading, setSaveLoading] = useState(false);

    // Filter State
    const [roleFilter, setRoleFilter] = useState('');

    // Form Data
    const [formData, setFormData] = useState({});

    // Aux Data
    const [organizations, setOrganizations] = useState([]);
    const [clientUsers, setClientUsers] = useState([]);
    const [availableCarriers, setAvailableCarriers] = useState([]);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await userService.getUsers(roleFilter);
            setUsers(res.data || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
            enqueueSnackbar(lang === 'ar' ? 'فشل تحميل المستخدمين' : 'Failed to load users', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar, roleFilter, lang]);

    const fetchOrgs = useCallback(async () => {
        if (isOrgManager) {
            setOrganizations(currentUser?.organization ? [currentUser.organization] : []);
            return;
        }
        try {
            const res = await organizationService.getOrganizations();
            setOrganizations(res.data || []);
        } catch (err) {
            console.error('Failed to fetch organizations:', err);
        }
    }, [isOrgManager, currentUser]);

    const fetchClientUsers = useCallback(async () => {
        try {
            const res = await userService.getUsers('org');
            setClientUsers(res.data || []);
        } catch (err) {
            console.error('Failed to fetch client users:', err);
        }
    }, []);

    const fetchCarriers = useCallback(async () => {
        try {
            const res = await shipmentService.getAvailableCarriers(undefined, { scope: 'assignment' });
            setAvailableCarriers(res.data || []);
        } catch (err) {
            console.error('Failed to fetch carriers:', err);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        if (openDialog) {
            fetchOrgs();
            fetchCarriers();
            fetchClientUsers();
        }
    }, [openDialog, fetchOrgs, fetchCarriers, fetchClientUsers]);

    // KPI Metrics
    const kpiMetrics = useMemo(() => {
        const total = users.length;
        const managementCount = users.filter(u => ['admin', 'manager', 'accounting', 'staff'].includes(u.role)).length;
        const driverCount = users.filter(u => u.role === 'driver').length;
        const clientCount = users.filter(u => ['org_manager', 'org_agent', 'client'].includes(u.role)).length;
        return { total, managementCount, driverCount, clientCount };
    }, [users]);

    // Filtered list
    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const matchesRole = !roleFilter || u.role === roleFilter;
            const matchesSearch = !search.trim() ||
                (u.name && u.name.toLowerCase().includes(search.toLowerCase())) ||
                (u.email && u.email.toLowerCase().includes(search.toLowerCase())) ||
                (u.phone && u.phone.toLowerCase().includes(search.toLowerCase())) ||
                (u.organization?.name && u.organization.name.toLowerCase().includes(search.toLowerCase()));
            return matchesRole && matchesSearch;
        });
    }, [users, roleFilter, search]);

    const handleOpenDialog = (targetUser = null) => {
        setEditingUser(targetUser);

        const initialData = targetUser ? { ...targetUser } : {
            role: isOrgManager ? 'org_agent' : 'staff',
            organizationId: isOrgManager ? currentUser?.organizationId : undefined,
            carrierConfig: {
                preferredCarrier: 'DGR',
                traderType: 'business',
                pricingByCarrier: {
                    OTE: { fixedFee: 25, currency: 'AED' }
                }
            },
            shippingAccess: { mode: 'carrier', carrierCode: 'DGR', serviceCode: '', serviceName: 'Any Available Service' },
            markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
            optionalServiceMarkup: {
                insurance: { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 }
            }
        };

        if (!initialData.carrierConfig) initialData.carrierConfig = { preferredCarrier: 'DGR', traderType: 'business' };
        if (!initialData.carrierConfig.pricingByCarrier) initialData.carrierConfig.pricingByCarrier = {};
        if (!initialData.carrierConfig.pricingByCarrier.OTE) {
            initialData.carrierConfig.pricingByCarrier.OTE = { fixedFee: 25, currency: 'AED' };
        }
        initialData.shippingAccess = normalizeShippingAccess(initialData);
        if (!initialData.markup) initialData.markup = { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
        if (!initialData.optionalServiceMarkup) {
            initialData.optionalServiceMarkup = {
                insurance: { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 }
            };
        }
        if (!initialData.optionalServiceMarkup.insurance) {
            initialData.optionalServiceMarkup.insurance = { enabled: false, type: 'PERCENTAGE', percentageValue: 0, flatValue: 0 };
        }
        if (isOrgManager) {
            initialData.organizationId = currentUser?.organizationId;
            initialData.organization = currentUser?.organization || initialData.organization;
        } else if (typeof initialData.organization === 'object' && initialData.organization) {
            initialData.organizationId = initialData.organization.id;
        }
        initialData.accessScopes = initialData.accessScopes || [];

        setFormData(initialData);
        setActiveTab('profile');
        setOpenDialog(true);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        setSaveLoading(true);
        try {
            const payload = { ...formData };
            const accessScopes = payload.accessScopes || [];
            delete payload.accessScopes;

            if (isOrgManager) {
                payload.organizationId = currentUser?.organizationId;
                if (!['org_manager', 'org_agent', 'client'].includes(payload.role)) {
                    payload.role = 'org_agent';
                }
                delete payload.creditLimit;
            }

            if (payload.creditLimit !== undefined) payload.creditLimit = Number(payload.creditLimit);
            if (payload.organization && !payload.organizationId) payload.organizationId = payload.organization;

            if (payload.markup) {
                payload.markup.percentageValue = Number(payload.markup.percentageValue || 0);
                payload.markup.flatValue = Number(payload.markup.flatValue || 0);
            }
            if (payload.optionalServiceMarkup?.insurance) {
                payload.optionalServiceMarkup.insurance = {
                    ...payload.optionalServiceMarkup.insurance,
                    enabled: Boolean(payload.optionalServiceMarkup.insurance.enabled),
                    percentageValue: Number(payload.optionalServiceMarkup.insurance.percentageValue || 0),
                    flatValue: Number(payload.optionalServiceMarkup.insurance.flatValue || 0)
                };
            }

            if (payload.shippingAccess?.mode === 'manual') {
                payload.shippingAccess = {
                    mode: 'manual',
                    carrierCode: 'MANUAL',
                    serviceCode: null,
                    serviceName: 'Manual Shipment'
                };
            } else if (payload.shippingAccess) {
                const carrierCode = payload.shippingAccess.carrierCode || 'DGR';
                const serviceCode = payload.shippingAccess.serviceCode || '';
                payload.shippingAccess = {
                    mode: 'carrier',
                    carrierCode,
                    serviceCode: serviceCode || null,
                    serviceName: serviceCode
                        ? (CARRIER_SERVICE_OPTIONS[carrierCode]?.find(service => service.serviceCode === serviceCode)?.serviceName || serviceCode)
                        : 'Any Available Service'
                };
            }

            if (!payload.carrierConfig) payload.carrierConfig = {};
            if (!payload.carrierConfig.pricingByCarrier) payload.carrierConfig.pricingByCarrier = {};
            const currentOtePricing = payload.carrierConfig.pricingByCarrier.OTE || {};
            payload.carrierConfig.pricingByCarrier.OTE = {
                fixedFee: Number(currentOtePricing.fixedFee || 25),
                currency: String(currentOtePricing.currency || 'AED').toUpperCase().slice(0, 3)
            };

            if (editingUser?.id) {
                await userService.updateUser(editingUser.id, payload);
                if (!isOrgManager && ['staff', 'driver'].includes(payload.role)) {
                    await userService.replaceAccessScopes(editingUser.id, accessScopes);
                }
                enqueueSnackbar(lang === 'ar' ? 'تم تحديث بيانات المستخدم' : 'User updated successfully', { variant: 'success' });
            } else {
                const created = await userService.createUser(payload);
                if (!isOrgManager && ['staff', 'driver'].includes(payload.role) && created.data?.id) {
                    await userService.replaceAccessScopes(created.data.id, accessScopes);
                }
                enqueueSnackbar(lang === 'ar' ? 'تم إنشاء المستخدم بنجاح' : 'User created successfully', { variant: 'success' });
            }
            setOpenDialog(false);
            fetchUsers();
        } catch (error) {
            console.error('Save error:', error);
            const msg = error.response?.data?.error || (lang === 'ar' ? 'فشل حفظ بيانات المستخدم' : 'Failed to save user');
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await userService.deleteUser(id);
            enqueueSnackbar(lang === 'ar' ? 'تم حذف المستخدم بنجاح' : 'User deleted', { variant: 'success' });
            setDeleteConfirmId(null);
            fetchUsers();
        } catch (error) {
            enqueueSnackbar(lang === 'ar' ? 'فشل حذف المستخدم' : 'Failed to delete user', { variant: 'error' });
        }
    };

    const updateField = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
    const updateNested = (parent, field, value) => setFormData(prev => ({
        ...prev,
        [parent]: { ...prev[parent], [field]: value }
    }));

    const updateShippingAccess = (field, value) => {
        setFormData(prev => {
            const current = prev.shippingAccess || normalizeShippingAccess(prev);
            const next = { ...current, [field]: value };

            if (field === 'mode' && value === 'manual') {
                return {
                    ...prev,
                    shippingAccess: { mode: 'manual', carrierCode: 'MANUAL', serviceCode: '', serviceName: 'Manual Shipment' }
                };
            }

            if (field === 'carrierCode') {
                const options = CARRIER_SERVICE_OPTIONS[value] || [];
                next.mode = value === 'MANUAL' ? 'manual' : 'carrier';
                next.serviceCode = value === 'MANUAL' ? '' : (options[0]?.serviceCode || '');
                next.serviceName = value === 'MANUAL' ? 'Manual Shipment' : (options[0]?.serviceName || 'Any Available Service');
            }

            if (field === 'serviceCode') {
                next.serviceName = CARRIER_SERVICE_OPTIONS[next.carrierCode]?.find(service => service.serviceCode === value)?.serviceName || value;
            }

            return { ...prev, shippingAccess: next };
        });
    };

    const updateAccessScope = (index, field, value) => {
        setFormData(prev => {
            const accessScopes = [...(prev.accessScopes || [])];
            const current = { ...accessScopes[index], [field]: value };
            if (field === 'scopeType') {
                current.clientUserId = '';
                current.organizationId = '';
            }
            accessScopes[index] = current;
            return { ...prev, accessScopes };
        });
    };

    const addAccessScope = (scopeType = 'CLIENT_USER') => {
        setFormData(prev => ({
            ...prev,
            accessScopes: [
                ...(prev.accessScopes || []),
                {
                    scopeType,
                    clientUserId: '',
                    organizationId: '',
                    canViewShipments: true,
                    canCreateOnBehalf: false
                }
            ]
        }));
    };

    const removeAccessScope = (index) => {
        setFormData(prev => ({
            ...prev,
            accessScopes: (prev.accessScopes || []).filter((_, scopeIndex) => scopeIndex !== index)
        }));
    };

    const getRoleBadgeStyle = (role) => {
        switch (role) {
            case 'admin': return 'badge-error text-white font-black';
            case 'manager': return 'badge-primary text-white font-bold';
            case 'accounting': return 'badge-info text-info-content font-bold';
            case 'staff': return 'badge-warning text-warning-content font-bold';
            case 'driver': return 'badge-accent text-accent-content font-bold';
            case 'org_manager': return 'badge-secondary text-white font-bold';
            default: return 'badge-ghost text-base-content/80 font-semibold';
        }
    };

    return (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-base-200">
                <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="badge badge-primary font-mono font-bold text-xs uppercase tracking-wider">
                            {lang === 'ar' ? 'إدارة الهوية وصلاحيات النظام' : 'Identity & Access Governance • RBAC Matrix'}
                        </span>
                        <span className="badge badge-outline border-base-300 text-xs font-mono">
                            {lang === 'ar' ? 'تدرج الأدوار' : 'Dual-Perspective Scope'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-2xl">manage_accounts</span>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content">
                                {lang === 'ar' ? 'إدارة المستخدمين والصلاحيات' : 'User Management & Permissions'}
                            </h1>
                            <p className="text-xs sm:text-sm text-base-content/60">
                                {lang === 'ar'
                                    ? 'التحكم بحسابات الإدارة، المالكين، المحاسبين، المناديب، وعملاء الشركات B2B.'
                                    : 'Administer Superadmins, Target Owners, Accounting, Staff, Drivers, and B2B Clients.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={fetchUsers}
                        disabled={loading}
                        className="btn btn-sm btn-ghost border border-base-200 gap-1.5 font-bold"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                            refresh
                        </span>
                        {lang === 'ar' ? 'تحديث' : 'Refresh'}
                    </button>

                    {(canFullAdmin || isOrgManager) && (
                        <button
                            type="button"
                            onClick={() => handleOpenDialog()}
                            className="btn btn-sm btn-primary font-bold shadow-md shadow-primary/20 gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[18px]">person_add</span>
                            {lang === 'ar' ? 'إضافة مستخدم جديد' : 'Add New User'}
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Metrics Ribbon */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-primary">
                            <span className="material-symbols-outlined text-3xl">group</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'إجمالي المستخدمين' : 'Total System Users'}
                        </div>
                        <div className="stat-value text-2xl font-black text-primary font-mono mt-0.5">
                            {kpiMetrics.total}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'حسابات مسجلة بالمنصة' : 'All active directory users'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-info">
                            <span className="material-symbols-outlined text-3xl">shield_person</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'فريق إدارة تارغت' : 'Target Management'}
                        </div>
                        <div className="stat-value text-2xl font-black text-info font-mono mt-0.5">
                            {kpiMetrics.managementCount}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'المالك، الإدارة، المحاسبة، العمليات' : 'Owner, Accounting, Ops'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-accent">
                            <span className="material-symbols-outlined text-3xl">two_wheeler</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'أسطول السائقين والمناديب' : 'Courier Fleet'}
                        </div>
                        <div className="stat-value text-2xl font-black text-accent-content font-mono mt-0.5">
                            {kpiMetrics.driverCount}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'سائقو الاستلام والتسليم' : 'Pickups & deliveries'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-secondary">
                            <span className="material-symbols-outlined text-3xl">corporate_fare</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'حسابات عملاء الشركات' : 'B2B Client Users'}
                        </div>
                        <div className="stat-value text-2xl font-black text-secondary font-mono mt-0.5">
                            {kpiMetrics.clientCount}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'مدراء ومندوبو الشركات' : 'Company merchants & agents'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <span className="material-symbols-outlined absolute inset-y-0 start-3 my-auto h-fit text-base-content/40 text-[19px]">
                        search
                    </span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={lang === 'ar' ? 'ابحث بالاسم أو البريد أو الهاتف أو الشركة...' : 'Search name, email, phone, company...'}
                        className="input input-sm input-bordered w-full ps-10 text-xs bg-base-100 focus:input-primary"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute inset-y-0 end-2.5 my-auto h-fit text-xs text-base-content/40 hover:text-base-content"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {[
                        { key: '', label: lang === 'ar' ? 'جميع الأدوار' : 'All Roles' },
                        ...(!isOrgManager ? [
                            { key: 'admin', label: 'Superadmin' },
                            { key: 'manager', label: 'Target Owner' },
                            { key: 'accounting', label: 'Accounting' },
                            { key: 'staff', label: 'Ops Staff' },
                            { key: 'driver', label: 'Courier Driver' },
                        ] : []),
                        { key: 'org_manager', label: 'Company Manager' },
                        { key: 'org_agent', label: 'Company Client' },
                    ].map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setRoleFilter(f.key)}
                            className={`btn btn-xs ${
                                roleFilter === f.key
                                    ? 'btn-primary font-bold'
                                    : 'btn-ghost border border-base-200 text-base-content/70'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Users Table Card */}
            <div className="card bg-base-100 border border-base-200/80 shadow-xs rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table table-zebra w-full text-xs">
                        <thead>
                            <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                <th>{lang === 'ar' ? 'المستخدم والاتصال' : 'User & Contact'}</th>
                                <th>{lang === 'ar' ? 'الدور والصلاحية' : 'Role & Scope'}</th>
                                <th>{lang === 'ar' ? 'المؤسسة التابع لها' : 'Organization'}</th>
                                <th>{lang === 'ar' ? 'شبكة الشحن المعتمدة' : 'Assigned Network'}</th>
                                <th>{lang === 'ar' ? 'هامش الربح' : 'Markup'}</th>
                                <th className="text-end">{lang === 'ar' ? 'الحد الائتماني' : 'Credit Limit'}</th>
                                <th className="text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-base-content/50">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="loading loading-spinner loading-md text-primary"></span>
                                            <span className="text-xs font-semibold">
                                                {lang === 'ar' ? 'جاري تحميل المستخدمين...' : 'Loading users...'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-base-content/50">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-4xl text-base-content/30">person_off</span>
                                            <p className="text-sm font-bold text-base-content">
                                                {lang === 'ar' ? 'لم يتم العثور على مستخدمين' : 'No users match criteria'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((u) => {
                                    const shippingAccess = normalizeShippingAccess(u);
                                    const m = u.markup || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 };
                                    const scopeCount = u.accessScopes?.length || 0;

                                    return (
                                        <tr key={u.id} className="hover">
                                            {/* Name & Contact */}
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/10 to-indigo-500/20 text-primary font-bold flex items-center justify-center text-xs shrink-0 border border-primary/20">
                                                        {u.name?.charAt(0).toUpperCase() || 'U'}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-base-content">{u.name}</div>
                                                        <div className="text-[11px] text-base-content/60 font-mono">{u.email}</div>
                                                        {u.phone && <div className="text-[10.5px] text-base-content/50">{u.phone}</div>}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Role */}
                                            <td>
                                                <span className={`badge badge-sm uppercase text-[10px] ${getRoleBadgeStyle(u.role)}`}>
                                                    {getRoleLabel(u.role)}
                                                </span>
                                            </td>

                                            {/* Organization */}
                                            <td>
                                                {u.organization ? (
                                                    <div className="flex items-center gap-1.5 font-semibold text-base-content">
                                                        <span className="material-symbols-outlined text-[15px] text-primary">business</span>
                                                        <span>{u.organization.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-base-content/40 italic text-[11px]">
                                                        {lang === 'ar' ? 'حساب فردي مباشر' : 'Solo Account'}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Shipping Access & Scopes */}
                                            <td>
                                                <div className="font-semibold text-xs text-base-content">
                                                    {shippingAccess.mode === 'manual' ? 'Manual Shipment' : `${shippingAccess.carrierCode} • ${shippingAccess.serviceName}`}
                                                </div>
                                                {['staff', 'driver'].includes(u.role) && (
                                                    <div className="text-[11px] text-base-content/50 mt-0.5">
                                                        {scopeCount ? `${scopeCount} ${lang === 'ar' ? 'نطاقات عملاء مخصصة' : 'client scopes'}` : (lang === 'ar' ? 'لا يوجد نطاق مخصص' : 'No client scope')}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Markup */}
                                            <td>
                                                <span className="badge badge-outline border-base-300 font-mono text-[10.5px] font-bold">
                                                    {m.type === 'PERCENTAGE'
                                                        ? `${m.percentageValue}%`
                                                        : m.type === 'FLAT'
                                                            ? `${m.flatValue} KD`
                                                            : `${m.percentageValue}% + ${m.flatValue}K`}
                                                </span>
                                            </td>

                                            {/* Credit Limit */}
                                            <td className="text-end font-mono">
                                                {u.organization ? (
                                                    <span className="text-[11px] text-base-content/50">
                                                        {lang === 'ar' ? 'تابع للمؤسسة' : 'Org-governed'}
                                                    </span>
                                                ) : (
                                                    <span className="font-bold text-xs text-base-content">
                                                        {Number(u.creditLimit || 0).toFixed(3)} KWD
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="text-end">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDialog(u)}
                                                        className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                                                        title={lang === 'ar' ? 'تعديل المستخدم' : 'Edit User'}
                                                    >
                                                        <span className="material-symbols-outlined text-[17px]">edit</span>
                                                    </button>
                                                    {canFullAdmin && u.id !== currentUser?.id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteConfirmId(u.id)}
                                                            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-error"
                                                            title={lang === 'ar' ? 'حذف المستخدم' : 'Delete User'}
                                                        >
                                                            <span className="material-symbols-outlined text-[17px]">delete</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create / Edit User Modal */}
            <div className={`modal modal-bottom sm:modal-middle ${openDialog ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-2xl bg-base-100 border border-base-200/80 shadow-2xl p-6 text-base-content max-h-[92vh] overflow-y-auto">
                    <div className="flex items-center justify-between pb-3 border-b border-base-200">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">
                                {editingUser ? 'manage_accounts' : 'person_add'}
                            </span>
                            <h3 className="font-black text-lg text-base-content">
                                {editingUser
                                    ? (lang === 'ar' ? `تعديل المستخدم: ${editingUser.name}` : `Edit User: ${editingUser.name}`)
                                    : (lang === 'ar' ? 'إضافة مستخدم جديد' : 'Create New User')}
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpenDialog(false)}
                            className="btn btn-sm btn-circle btn-ghost text-base-content/60"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Modal Tab Switcher */}
                    <div className="tabs tabs-boxed bg-base-200/60 p-1 rounded-xl flex gap-1 mt-4">
                        <button
                            type="button"
                            onClick={() => setActiveTab('profile')}
                            className={`tab tab-sm font-bold rounded-lg ${activeTab === 'profile' ? 'tab-active !bg-primary !text-primary-content' : ''}`}
                        >
                            {lang === 'ar' ? 'الملف الشخصي' : 'Profile'}
                        </button>
                        {!isOrgManager && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('org')}
                                className={`tab tab-sm font-bold rounded-lg ${activeTab === 'org' ? 'tab-active !bg-primary !text-primary-content' : ''}`}
                            >
                                {lang === 'ar' ? 'المؤسسة' : 'Organization'}
                            </button>
                        )}
                        {!isOrgManager && ['staff', 'driver'].includes(formData.role) && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('access')}
                                className={`tab tab-sm font-bold rounded-lg ${activeTab === 'access' ? 'tab-active !bg-primary !text-primary-content' : ''}`}
                            >
                                {lang === 'ar' ? 'نطاق العملاء' : 'Client Access'}
                            </button>
                        )}
                        {!isOrgManager && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('config')}
                                className={`tab tab-sm font-bold rounded-lg ${activeTab === 'config' ? 'tab-active !bg-primary !text-primary-content' : ''}`}
                            >
                                {lang === 'ar' ? 'المالية والتسعير' : 'Financials & Network'}
                            </button>
                        )}
                    </div>

                    {/* Tab Contents */}
                    <div className="py-4">
                        {activeTab === 'profile' && (
                            <div className="space-y-3.5">
                                <div>
                                    <label className="text-xs font-bold text-base-content/70 block mb-1">
                                        {lang === 'ar' ? 'الاسم الكامل *' : 'Full Name *'}
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name || ''}
                                        onChange={(e) => updateField('name', e.target.value)}
                                        placeholder="e.g. Faisal Al-Sabah"
                                        className="input input-sm input-bordered w-full font-semibold focus:input-primary"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold text-base-content/70 block mb-1">
                                            {lang === 'ar' ? 'البريد الإلكتروني *' : 'Email Address *'}
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            value={formData.email || ''}
                                            onChange={(e) => updateField('email', e.target.value)}
                                            placeholder="user@example.com"
                                            className="input input-sm input-bordered w-full font-mono text-xs focus:input-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-base-content/70 block mb-1">
                                            {lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.phone || ''}
                                            onChange={(e) => updateField('phone', e.target.value)}
                                            placeholder="+965 9999 9999"
                                            className="input input-sm input-bordered w-full font-mono text-xs focus:input-primary"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-base-content/70 block mb-1">
                                        {lang === 'ar' ? 'الدور الوظيفي والصلاحية' : 'System Role'}
                                    </label>
                                    <select
                                        value={formData.role || 'org_agent'}
                                        onChange={(e) => updateField('role', e.target.value)}
                                        className="select select-sm select-bordered w-full font-semibold focus:select-primary"
                                    >
                                        {!isOrgManager && <option value="admin">Superadmin (Platform Admin)</option>}
                                        {!isOrgManager && <option value="manager">Target Owner (Manager)</option>}
                                        {!isOrgManager && <option value="accounting">Target Accounting</option>}
                                        {!isOrgManager && <option value="staff">Target Ops Staff</option>}
                                        {!isOrgManager && <option value="driver">Courier Driver</option>}
                                        <option value="org_manager">Company Manager (B2B Org)</option>
                                        <option value="org_agent">Company Client User</option>
                                        <option value="client">Solo Client</option>
                                    </select>
                                </div>

                                {!editingUser && (
                                    <div>
                                        <label className="text-xs font-bold text-base-content/70 block mb-1">
                                            {lang === 'ar' ? 'كلمة المرور *' : 'Password *'}
                                        </label>
                                        <input
                                            type="password"
                                            required
                                            value={formData.password || ''}
                                            onChange={(e) => updateField('password', e.target.value)}
                                            placeholder="••••••••"
                                            className="input input-sm input-bordered w-full font-mono focus:input-primary"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'org' && (
                            <div className="space-y-3">
                                <div className="alert alert-info text-xs py-2.5 rounded-xl">
                                    <span className="material-symbols-outlined text-base">info</span>
                                    <span>{lang === 'ar' ? 'المستخدمون التابعون لمؤسسة يتشاركون رصيد دفتر الأستاذ والحد الائتماني المعتمد.' : 'Users assigned to an organization share its ledger-based credit limit and balance.'}</span>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-base-content/70 block mb-1">
                                        {lang === 'ar' ? 'اختر المؤسسة' : 'Assigned Organization'}
                                    </label>
                                    <select
                                        value={formData.organizationId || formData.organization || ''}
                                        onChange={(e) => updateField('organizationId', e.target.value)}
                                        className="select select-sm select-bordered w-full font-semibold focus:select-primary"
                                    >
                                        <option value="">{lang === 'ar' ? '-- بدون مؤسسة (حساب فردي) --' : '-- No Organization (Solo) --'}</option>
                                        {organizations.map(org => (
                                            <option key={org.id} value={org.id}>{org.name} ({org.type})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {activeTab === 'access' && ['staff', 'driver'].includes(formData.role) && (
                            <div className="space-y-3.5">
                                <div className="alert alert-info text-xs py-2.5 rounded-xl">
                                    <span className="material-symbols-outlined text-base">security</span>
                                    <span>{lang === 'ar' ? 'حدد العملاء أو الشركات التي يمكن لهذا السائق أو الموظف الاطلاع عليها وتنفيذ المهام نيابة عنها.' : 'Explicitly grant permissions for specific client users or organizations.'}</span>
                                </div>

                                <div className="space-y-2">
                                    {(formData.accessScopes || []).map((scope, index) => (
                                        <div key={index} className="p-3 bg-base-200/40 border border-base-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 items-center text-xs">
                                            <select
                                                value={scope.scopeType || 'CLIENT_USER'}
                                                onChange={(e) => updateAccessScope(index, 'scopeType', e.target.value)}
                                                className="select select-xs select-bordered font-semibold"
                                            >
                                                <option value="CLIENT_USER">Client User</option>
                                                <option value="COMPANY_ALL_USERS">Company</option>
                                            </select>

                                            {scope.scopeType === 'COMPANY_ALL_USERS' ? (
                                                <select
                                                    value={scope.organizationId || ''}
                                                    onChange={(e) => updateAccessScope(index, 'organizationId', e.target.value)}
                                                    className="select select-xs select-bordered"
                                                >
                                                    <option value="">Select company</option>
                                                    {organizations.map(org => (
                                                        <option key={org.id} value={org.id}>{org.name}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <select
                                                    value={scope.clientUserId || ''}
                                                    onChange={(e) => updateAccessScope(index, 'clientUserId', e.target.value)}
                                                    className="select select-xs select-bordered"
                                                >
                                                    <option value="">Select client user</option>
                                                    {clientUsers.map(client => (
                                                        <option key={client.id} value={client.id}>{client.name}</option>
                                                    ))}
                                                </select>
                                            )}

                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={scope.canCreateOnBehalf}
                                                    onChange={(e) => updateAccessScope(index, 'canCreateOnBehalf', e.target.checked)}
                                                    className="checkbox checkbox-xs checkbox-primary"
                                                />
                                                <span className="text-[11px] font-semibold">{lang === 'ar' ? 'إنشاء نيابة' : 'Create On-Behalf'}</span>
                                            </label>

                                            <div className="text-end">
                                                <button
                                                    type="button"
                                                    onClick={() => removeAccessScope(index)}
                                                    className="btn btn-ghost btn-xs text-error"
                                                >
                                                    {lang === 'ar' ? 'حذف' : 'Remove'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => addAccessScope('CLIENT_USER')}
                                        className="btn btn-xs btn-outline border-base-300 font-bold"
                                    >
                                        + {lang === 'ar' ? 'إضافة عميل فردي' : 'Add Client User'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => addAccessScope('COMPANY_ALL_USERS')}
                                        className="btn btn-xs btn-outline border-base-300 font-bold"
                                    >
                                        + {lang === 'ar' ? 'إضافة شركة كاملة' : 'Add Company'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'config' && (
                            <div className="space-y-4">
                                {/* Credit Limit */}
                                <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-2xl space-y-2">
                                    <div className="text-xs font-bold text-base-content flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[17px] text-primary">credit_card</span>
                                        {lang === 'ar' ? 'الحد الائتماني للحساب الفردي (د.ك)' : 'Solo Account Credit Limit (KWD)'}
                                    </div>
                                    <input
                                        type="number"
                                        value={formData.creditLimit || 0}
                                        onChange={(e) => updateField('creditLimit', e.target.value)}
                                        placeholder="0.000"
                                        className="input input-sm input-bordered w-full font-mono font-bold"
                                    />
                                </div>

                                {/* Rate Markup */}
                                <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-2xl space-y-2.5">
                                    <div className="text-xs font-bold text-base-content flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[17px] text-primary">price_change</span>
                                        {lang === 'ar' ? 'هيكل هامش الربح التجاري' : 'Commercial Rate Markup Structure'}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                        <div>
                                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                                {lang === 'ar' ? 'النوع' : 'Type'}
                                            </label>
                                            <select
                                                value={formData.markup?.type || 'PERCENTAGE'}
                                                onChange={(e) => updateNested('markup', 'type', e.target.value)}
                                                className="select select-sm select-bordered w-full text-xs font-semibold"
                                            >
                                                <option value="PERCENTAGE">% Only</option>
                                                <option value="FLAT">Flat Only</option>
                                                <option value="COMBINED">Combined</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                                {lang === 'ar' ? 'النسبة المئوية %' : 'Percentage %'}
                                            </label>
                                            <input
                                                type="number"
                                                step="0.5"
                                                value={formData.markup?.percentageValue || 0}
                                                onChange={(e) => updateNested('markup', 'percentageValue', e.target.value)}
                                                className="input input-sm input-bordered w-full font-mono text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                                {lang === 'ar' ? 'مبلغ ثابت (د.ك)' : 'Flat Value (KWD)'}
                                            </label>
                                            <input
                                                type="number"
                                                step="0.25"
                                                value={formData.markup?.flatValue || 0}
                                                onChange={(e) => updateNested('markup', 'flatValue', e.target.value)}
                                                className="input input-sm input-bordered w-full font-mono text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Shipping Access */}
                                <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-2xl space-y-2.5">
                                    <div className="text-xs font-bold text-base-content flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[17px] text-primary">local_shipping</span>
                                        {lang === 'ar' ? 'شبكة الشحن المعينة' : 'Assigned Shipping Network'}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                                {lang === 'ar' ? 'الناقل المعتمد' : 'Assigned Carrier'}
                                            </label>
                                            <select
                                                value={formData.shippingAccess?.carrierCode || 'DGR'}
                                                onChange={(e) => updateShippingAccess('carrierCode', e.target.value)}
                                                className="select select-sm select-bordered w-full text-xs font-semibold"
                                            >
                                                {(availableCarriers.length ? availableCarriers : [
                                                    { code: 'MANUAL', name: 'Manual Shipment', active: true },
                                                    { code: 'DGR', name: 'DHL Express (DGR)', active: true },
                                                    { code: 'ARAMEX', name: 'Aramex', active: true },
                                                    { code: 'OTE', name: 'LogesTechs (OTE)', active: true }
                                                ]).map(carrier => (
                                                    <option key={carrier.code} value={carrier.code}>
                                                        {carrier.code === 'MANUAL' ? 'Manual Shipment' : carrier.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                                {lang === 'ar' ? 'طريقة الخدمة' : 'Service Method'}
                                            </label>
                                            {formData.shippingAccess?.carrierCode !== 'MANUAL' ? (
                                                <select
                                                    value={formData.shippingAccess?.serviceCode || ''}
                                                    onChange={(e) => updateShippingAccess('serviceCode', e.target.value)}
                                                    className="select select-sm select-bordered w-full text-xs"
                                                >
                                                    <option value="">Any Available Service</option>
                                                    {(CARRIER_SERVICE_OPTIONS[formData.shippingAccess?.carrierCode || 'DGR'] || CARRIER_SERVICE_OPTIONS.DGR).map(service => (
                                                        <option key={service.serviceCode} value={service.serviceCode}>
                                                            {service.serviceName}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value="Manual Shipment"
                                                    disabled
                                                    className="input input-sm input-bordered w-full text-xs opacity-60"
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="modal-action pt-3 border-t border-base-200">
                        <button
                            type="button"
                            onClick={() => setOpenDialog(false)}
                            className="btn btn-sm btn-ghost"
                        >
                            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saveLoading}
                            className="btn btn-sm btn-primary font-bold shadow-md shadow-primary/20 gap-1.5"
                        >
                            {saveLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                            {editingUser ? (lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes') : (lang === 'ar' ? 'إنشاء المستخدم' : 'Create User')}
                        </button>
                    </div>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setOpenDialog(false)} />
            </div>

            {/* Delete User Confirmation Modal */}
            <div className={`modal modal-bottom sm:modal-middle ${deleteConfirmId ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-sm bg-base-100 border border-base-200 shadow-2xl p-6 text-base-content">
                    <div className="flex items-center gap-2 pb-3 border-b border-base-200 text-error">
                        <span className="material-symbols-outlined text-xl">warning</span>
                        <h3 className="font-black text-lg text-base-content">
                            {lang === 'ar' ? 'حذف المستخدم نهائياً؟' : 'Delete User?'}
                        </h3>
                    </div>
                    <p className="py-4 text-xs text-base-content/70">
                        {lang === 'ar'
                            ? 'هل أنت متأكد من رغبتك في حذف هذا المستخدم نهائياً؟ لا يمكن التراجع عن هذه الخطوة.'
                            : 'Are you sure you want to permanently delete this user? This cannot be undone.'}
                    </p>
                    <div className="modal-action pt-3 border-t border-base-200">
                        <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="btn btn-sm btn-ghost"
                        >
                            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleDelete(deleteConfirmId)}
                            className="btn btn-sm btn-error text-white font-bold"
                        >
                            {lang === 'ar' ? 'تأكيد الحذف' : 'Delete'}
                        </button>
                    </div>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setDeleteConfirmId(null)} />
            </div>
        </div>
    );
};

export default AdminUsersPage;
