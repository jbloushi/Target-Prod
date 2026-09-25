import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { financeService, organizationService, userService } from '../services/api';

const CARRIERS_CONFIG = [
    { code: 'DGR', name: 'DHL Express (DGR)' },
    { code: 'OTE', name: 'LogesTechs (OTE Ground)' },
    { code: 'ARAMEX', name: 'Aramex Express' },
    { code: 'INTERNAL', name: 'Target Local Fleet' }
];

const AdminOrganizationsPage = () => {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const { user } = useAuth();
    const { lang, isRTL } = useLanguage();
    
    // Superadmin, Target Owner, and Target Accounting have full administrative rights
    const canManage = ['admin', 'manager', 'accounting'].includes(user?.role);

    const [orgs, setOrgs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orgOverviews, setOrgOverviews] = useState({});

    // Filter & Search
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');

    // Dialog States
    const [openDialog, setOpenDialog] = useState(false);
    const [openMembersDialog, setOpenMembersDialog] = useState(false);
    const [editingOrg, setEditingOrg] = useState(null);
    const [saveLoading, setSaveLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        taxId: '',
        type: 'BUSINESS',
        creditLimit: 0,
        active: true,
        markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
        allowedCarriers: { allowed: ['DGR', 'OTE', 'ARAMEX'], defaultCarrier: 'DGR' }
    });

    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');
    const [memberLoading, setMemberLoading] = useState(false);

    const fetchOrgs = useCallback(async () => {
        setLoading(true);
        try {
            const [orgRes, userRes] = await Promise.all([
                organizationService.getOrganizations(),
                userService.getUsers()
            ]);
            const organizations = orgRes.data || [];
            setOrgs(organizations);
            setUsers(userRes.data || []);

            const overviewEntries = await Promise.all(organizations.map(async (org) => {
                try {
                    const response = await financeService.getOrganizationOverview(org.id);
                    return [org.id, response.data];
                } catch {
                    return [org.id, null];
                }
            }));
            setOrgOverviews(Object.fromEntries(overviewEntries));
        } catch (error) {
            console.error('Failed to load organizations', error);
            enqueueSnackbar(lang === 'ar' ? 'فشل تحميل قائمة المؤسسات' : 'Failed to load organizations', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar, lang]);

    useEffect(() => {
        fetchOrgs();
    }, [fetchOrgs]);

    // KPI Aggregations
    const kpiData = useMemo(() => {
        const total = orgs.length;
        const businessCount = orgs.filter(o => o.type?.toUpperCase() === 'BUSINESS').length;
        let totalCreditLimit = 0;
        let totalOutstanding = 0;

        orgs.forEach(o => {
            totalCreditLimit += parseFloat(o.creditLimit || 0);
            const overview = orgOverviews[o.id];
            if (overview?.balance) {
                totalOutstanding += parseFloat(overview.balance || 0);
            }
        });

        return {
            total,
            businessCount,
            totalCreditLimit,
            totalOutstanding
        };
    }, [orgs, orgOverviews]);

    // Filtered Organizations
    const filteredOrgs = useMemo(() => {
        return orgs.filter(org => {
            const matchesSearch = !search.trim() ||
                (org.name && org.name.toLowerCase().includes(search.toLowerCase())) ||
                (org.taxId && org.taxId.toLowerCase().includes(search.toLowerCase()));

            const matchesType = typeFilter === 'ALL' ||
                (typeFilter === 'BUSINESS' && org.type?.toUpperCase() === 'BUSINESS') ||
                (typeFilter === 'INTERNAL' && org.type?.toLowerCase() === 'internal') ||
                (typeFilter === 'GOVERNMENT' && org.type?.toUpperCase() === 'GOVERNMENT') ||
                (typeFilter === 'INDIVIDUAL' && org.type?.toUpperCase() === 'INDIVIDUAL');

            return matchesSearch && matchesType;
        });
    }, [orgs, search, typeFilter]);

    const handleOpenDialog = (org = null) => {
        if (!canManage) {
            enqueueSnackbar(lang === 'ar' ? 'فقط مسؤولو النظام يمكنهم تعديل المؤسسات.' : 'Only administrators or managers can edit organizations.', { variant: 'warning' });
            return;
        }
        if (org) {
            setEditingOrg(org);
            setFormData({
                name: org.name || '',
                taxId: org.taxId || '',
                type: org.type || 'BUSINESS',
                creditLimit: org.creditLimit || 0,
                active: org.active ?? true,
                markup: org.markup || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
                allowedCarriers: org.allowedCarriers || { allowed: ['DGR', 'OTE', 'ARAMEX'], defaultCarrier: 'DGR' }
            });
        } else {
            setEditingOrg(null);
            setFormData({
                name: '',
                taxId: '',
                type: 'BUSINESS',
                creditLimit: 0,
                active: true,
                markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
                allowedCarriers: { allowed: ['DGR', 'OTE', 'ARAMEX'], defaultCarrier: 'DGR' }
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        if (!formData.name.trim()) {
            enqueueSnackbar(lang === 'ar' ? 'اسم المؤسسة مطلوب' : 'Organization name is required', { variant: 'error' });
            return;
        }
        setSaveLoading(true);
        try {
            if (editingOrg) {
                await organizationService.updateOrganization(editingOrg.id, formData);
                enqueueSnackbar(lang === 'ar' ? `تم تحديث مؤسسة ${formData.name}` : `Organization ${formData.name} updated`, { variant: 'success' });
            } else {
                await organizationService.createOrganization(formData);
                enqueueSnackbar(lang === 'ar' ? `تم إنشاء مؤسسة ${formData.name}` : `Organization ${formData.name} created`, { variant: 'success' });
            }
            setOpenDialog(false);
            fetchOrgs();
        } catch (error) {
            const msg = error.response?.data?.error || (lang === 'ar' ? 'فشل حفظ المؤسسة' : 'Failed to save organization');
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleAddMember = async () => {
        if (!canManage) {
            enqueueSnackbar(lang === 'ar' ? 'غير مصرح لك بإدارة الأعضاء.' : 'Permission denied.', { variant: 'warning' });
            return;
        }
        if (!selectedMemberToAdd || !editingOrg) return;
        setMemberLoading(true);
        try {
            await organizationService.addMember(editingOrg.id, selectedMemberToAdd);
            enqueueSnackbar(lang === 'ar' ? 'تمت إضافة العضو بنجاح' : 'Member assigned successfully', { variant: 'success' });
            const updatedOrgRes = await organizationService.getOrganization(editingOrg.id);
            if (updatedOrgRes?.data) {
                setEditingOrg(updatedOrgRes.data);
            }
            setSelectedMemberToAdd('');
            fetchOrgs();
        } catch (err) {
            const msg = err.response?.data?.error || (lang === 'ar' ? 'فشل إضافة العضو' : 'Failed to add member');
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setMemberLoading(false);
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!canManage) {
            enqueueSnackbar(lang === 'ar' ? 'غير مصرح لك بإدارة الأعضاء.' : 'Permission denied.', { variant: 'warning' });
            return;
        }
        if (!editingOrg) return;
        try {
            await organizationService.removeMember(editingOrg.id, memberId);
            enqueueSnackbar(lang === 'ar' ? 'تمت إزالة العضو' : 'Member unassigned', { variant: 'success' });
            setEditingOrg(prev => ({
                ...prev,
                members: (prev.members || []).filter(m => m.id !== memberId)
            }));
            fetchOrgs();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || (lang === 'ar' ? 'فشل إزالة العضو' : 'Failed to remove member'), { variant: 'error' });
        }
    };

    const getTypeBadgeClass = (type) => {
        switch (type?.toLowerCase()) {
            case 'internal': return 'badge-warning text-warning-content';
            case 'government': return 'badge-success text-white';
            case 'individual': return 'badge-secondary text-white';
            default: return 'badge-info text-info-content';
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-base-200">
                <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="badge badge-primary font-mono font-bold text-xs uppercase tracking-wider">
                            {lang === 'ar' ? 'محفظة العملاء والمؤسسات B2B' : 'B2B Client Portfolio & Corporate Scope'}
                        </span>
                        <span className="badge badge-outline border-base-300 text-xs font-mono">
                            {lang === 'ar' ? 'إدارة الائتمان والفوترة' : 'Credit & Tariff Governance'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-2xl">corporate_fare</span>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content">
                                {lang === 'ar' ? 'إدارة المؤسسات والعملاء' : 'Organization & Client Management'}
                            </h1>
                            <p className="text-xs sm:text-sm text-base-content/60">
                                {lang === 'ar'
                                    ? 'إدارة الكيانات التجارية، الحدود الائتمانية، هوامش الربح، وسياسات وصول شركات النقل.'
                                    : 'Manage corporate entities, credit exposure, rate markups, and carrier access policies.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={fetchOrgs}
                        disabled={loading}
                        className="btn btn-sm btn-ghost border border-base-200 gap-1.5 font-bold"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
                            refresh
                        </span>
                        {lang === 'ar' ? 'تحديث' : 'Refresh'}
                    </button>

                    {canManage && (
                        <button
                            type="button"
                            onClick={() => handleOpenDialog()}
                            className="btn btn-sm btn-primary font-bold shadow-md shadow-primary/20 gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[18px]">add_business</span>
                            {lang === 'ar' ? 'إضافة مؤسسة جديدة' : 'New Organization'}
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Metrics Ribbon */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-primary">
                            <span className="material-symbols-outlined text-3xl">domain</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'إجمالي المؤسسات' : 'Total Organizations'}
                        </div>
                        <div className="stat-value text-2xl font-black text-primary font-mono mt-0.5">
                            {kpiData.total}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'كيانات مسجلة بالنظام' : 'Active and inactive entities'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-info">
                            <span className="material-symbols-outlined text-3xl">storefront</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'حسابات الأعمال B2B' : 'Business Accounts'}
                        </div>
                        <div className="stat-value text-2xl font-black text-info font-mono mt-0.5">
                            {kpiData.businessCount}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'تجار وشركات تجارية' : 'Commercial merchants'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-warning">
                            <span className="material-symbols-outlined text-3xl">credit_score</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'إجمالي الحد الائتماني' : 'Total Credit Extended'}
                        </div>
                        <div className="stat-value text-xl sm:text-2xl font-black text-base-content font-mono mt-0.5">
                            {kpiData.totalCreditLimit.toFixed(3)} <span className="text-xs font-bold text-base-content/60">KWD</span>
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'حدود التسهيلات المعتمدة' : 'Aggregated approved credit'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-error">
                            <span className="material-symbols-outlined text-3xl">account_balance_wallet</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'إجمالي المستحقات غير المسددة' : 'Outstanding Receivables'}
                        </div>
                        <div className={`stat-value text-xl sm:text-2xl font-black font-mono mt-0.5 ${
                            kpiData.totalOutstanding > 0 ? 'text-error' : 'text-success'
                        }`}>
                            {kpiData.totalOutstanding.toFixed(3)} <span className="text-xs font-bold text-base-content/60">KWD</span>
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {kpiData.totalOutstanding > 0
                                ? (lang === 'ar' ? 'أرصدة تتطلب التحصيل' : 'Receivables requiring collection')
                                : (lang === 'ar' ? 'جميع الحسابات مسددة' : 'All accounts settled')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <span className="material-symbols-outlined absolute inset-y-0 start-3 my-auto h-fit text-base-content/40 text-[19px]">
                        search
                    </span>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={lang === 'ar' ? 'ابحث باسم المؤسسة أو الرقم الضريبي...' : 'Search organization name or Tax ID...'}
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
                        { key: 'ALL', label: lang === 'ar' ? 'الكل' : 'All' },
                        { key: 'BUSINESS', label: lang === 'ar' ? 'أعمال' : 'Business' },
                        { key: 'INTERNAL', label: lang === 'ar' ? 'داخلي' : 'Internal' },
                        { key: 'GOVERNMENT', label: lang === 'ar' ? 'حكومي' : 'Gov' },
                        { key: 'INDIVIDUAL', label: lang === 'ar' ? 'أفراد' : 'Individual' },
                    ].map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setTypeFilter(f.key)}
                            className={`btn btn-xs ${
                                typeFilter === f.key
                                    ? 'btn-primary font-bold'
                                    : 'btn-ghost border border-base-200 text-base-content/70'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Organizations Table Card */}
            <div className="card bg-base-100 border border-base-200/80 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table table-zebra w-full text-xs">
                        <thead>
                            <tr className="bg-base-200/60 text-base-content/70 uppercase text-[11px] font-bold">
                                <th>{lang === 'ar' ? 'الكيان التجاري' : 'Company Entity'}</th>
                                <th>{lang === 'ar' ? 'النوع' : 'Type'}</th>
                                <th className="text-center">{lang === 'ar' ? 'فريق العمل' : 'Members'}</th>
                                <th className="text-end">{lang === 'ar' ? 'المستحقات' : 'Outstanding'}</th>
                                <th className="text-end">{lang === 'ar' ? 'الرصيد المتاح' : 'Available Credit'}</th>
                                <th className="text-end">{lang === 'ar' ? 'الحد الائتماني' : 'Credit Limit'}</th>
                                <th className="text-center">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                <th className="text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="py-16 text-center text-base-content/60">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="loading loading-spinner loading-md text-primary"></span>
                                            <span className="text-xs font-semibold">
                                                {lang === 'ar' ? 'جاري تحميل المؤسسات...' : 'Loading organization ledger...'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredOrgs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-16 text-center text-base-content/50">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-4xl text-base-content/30">domain_disabled</span>
                                            <p className="text-sm font-bold text-base-content">
                                                {lang === 'ar' ? 'لم يتم العثور على مؤسسات مطابقة' : 'No matching organizations found'}
                                            </p>
                                            <p className="text-xs text-base-content/50">
                                                {lang === 'ar' ? 'جرب تغيير شروط البحث أو الفرز' : 'Try adjusting your search criteria or add a new account'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredOrgs.map((org) => {
                                    const overview = orgOverviews[org.id];
                                    const outstanding = overview?.balance ?? 0;
                                    const availableCredit = overview?.availableCredit ?? 0;
                                    const creditLimit = parseFloat(org.creditLimit || 0);

                                    return (
                                        <tr key={org.id} className="hover">
                                            {/* Entity name & Avatar */}
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/10 to-indigo-500/20 text-primary font-black flex items-center justify-center text-sm border border-primary/20 shrink-0">
                                                        {org.name?.charAt(0).toUpperCase() || 'O'}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-base-content">
                                                            {org.name}
                                                        </div>
                                                        <div className="text-[11px] text-base-content/50 font-mono">
                                                            {org.taxId ? `Tax/EORI: ${org.taxId}` : (lang === 'ar' ? 'لا يوجد رقم ضريبي' : 'No Tax ID')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Type */}
                                            <td>
                                                <span className={`badge badge-sm font-bold uppercase text-[10px] ${getTypeBadgeClass(org.type)}`}>
                                                    {org.type || 'BUSINESS'}
                                                </span>
                                            </td>

                                            {/* Members count */}
                                            <td className="text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingOrg(org);
                                                        setOpenMembersDialog(true);
                                                    }}
                                                    className="btn btn-xs btn-outline border-base-300 hover:border-primary gap-1 font-mono"
                                                    title={lang === 'ar' ? 'عرض وإدارة الأعضاء' : 'Manage members'}
                                                >
                                                    <span className="material-symbols-outlined text-[14px] text-primary">group</span>
                                                    <span>{org.members?.length || 0}</span>
                                                </button>
                                            </td>

                                            {/* Outstanding Receivables */}
                                            <td className="text-end font-mono font-bold text-xs">
                                                <span className={outstanding > 0 ? 'text-error' : 'text-success'}>
                                                    {Number(outstanding).toFixed(3)}
                                                </span>
                                                <span className="text-[10px] text-base-content/50 ms-1">KWD</span>
                                            </td>

                                            {/* Available Credit */}
                                            <td className="text-end font-mono text-xs font-semibold text-base-content">
                                                {Number(availableCredit).toFixed(3)}
                                                <span className="text-[10px] text-base-content/50 ms-1">KWD</span>
                                            </td>

                                            {/* Credit Limit */}
                                            <td className="text-end font-mono text-xs text-base-content/70">
                                                {creditLimit.toFixed(3)}
                                                <span className="text-[10px] text-base-content/50 ms-1">KWD</span>
                                            </td>

                                            {/* Status */}
                                            <td className="text-center">
                                                <span className={`badge badge-xs ${org.active ? 'badge-success' : 'badge-ghost'} gap-1 font-bold text-[10px]`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${org.active ? 'bg-white' : 'bg-base-content/40'}`}></span>
                                                    {org.active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'معطل' : 'Disabled')}
                                                </span>
                                            </td>

                                            {/* Actions */}
                                            <td className="text-end">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingOrg(org);
                                                            setOpenMembersDialog(true);
                                                        }}
                                                        className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                                                        title={lang === 'ar' ? 'أعضاء المؤسسة' : 'Members'}
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">person_add</span>
                                                    </button>

                                                    {canManage && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenDialog(org)}
                                                            className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                                                            title={lang === 'ar' ? 'تعديل المؤسسة' : 'Edit organization'}
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">edit</span>
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/finance`)}
                                                        className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-success"
                                                        title={lang === 'ar' ? 'سجل المالية ودفتر الأستاذ' : 'Financial ledger'}
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(`/shipments`)}
                                                        className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-info"
                                                        title={lang === 'ar' ? 'بوالص الشحن' : 'Waybills'}
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                                    </button>
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

            {/* Create / Edit Organization Modal */}
            <div className={`modal modal-bottom sm:modal-middle ${openDialog ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-xl bg-base-100 border border-base-200/80 shadow-2xl p-6 text-base-content max-h-[92vh] overflow-y-auto">
                    <div className="flex items-center justify-between pb-3 border-b border-base-200">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">
                                {editingOrg ? 'edit_note' : 'add_business'}
                            </span>
                            <h3 className="font-black text-lg text-base-content">
                                {editingOrg
                                    ? (lang === 'ar' ? `تعديل مؤسسة: ${editingOrg.name}` : `Edit Organization: ${editingOrg.name}`)
                                    : (lang === 'ar' ? 'إنشاء مؤسسة تجارية جديدة' : 'Create New Organization')}
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

                    <form onSubmit={handleSave} className="py-4 space-y-4">
                        {/* Basic Identity */}
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-base-content/70 block mb-1">
                                    {lang === 'ar' ? 'اسم المؤسسة / الشركة *' : 'Organization Name *'}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={lang === 'ar' ? 'مثال: شركة البحر اللوجستية العالمية' : 'e.g. Al-Bahar Global Logistics'}
                                    className="input input-sm input-bordered w-full font-semibold focus:input-primary"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-base-content/70 block mb-1">
                                        {lang === 'ar' ? 'الرقم الضريبي / EORI' : 'Tax / EORI ID'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.taxId}
                                        onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                                        placeholder="KW-1002345"
                                        className="input input-sm input-bordered w-full font-mono text-xs focus:input-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-base-content/70 block mb-1">
                                        {lang === 'ar' ? 'نوع الكيان' : 'Organization Type'}
                                    </label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        className="select select-sm select-bordered w-full text-xs font-semibold focus:select-primary"
                                    >
                                        <option value="BUSINESS">{lang === 'ar' ? 'أعمال (عميل B2B)' : 'Business (B2B Client)'}</option>
                                        <option value="internal">{lang === 'ar' ? 'مركز لوجستي داخلي' : 'Internal Logistics Hub'}</option>
                                        <option value="GOVERNMENT">{lang === 'ar' ? 'جهة حكومية' : 'Government Agency'}</option>
                                        <option value="INDIVIDUAL">{lang === 'ar' ? 'شاحن فردي' : 'Individual Shipper'}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Carrier Access Policy */}
                        <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-2xl space-y-2.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                                <span className="material-symbols-outlined text-[17px] text-primary">local_shipping</span>
                                {lang === 'ar' ? 'سياسة شركات النقل المعتمدة' : 'Authorized Carrier Gateways'}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                {CARRIERS_CONFIG.map((c) => {
                                    const currentAllowed = formData.allowedCarriers?.allowed || ['DGR', 'OTE', 'ARAMEX'];
                                    const isChecked = currentAllowed.includes(c.code);
                                    return (
                                        <label key={c.code} className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-base-200/80">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    const next = e.target.checked
                                                        ? [...currentAllowed, c.code]
                                                        : currentAllowed.filter(x => x !== c.code);
                                                    setFormData({
                                                        ...formData,
                                                        allowedCarriers: { ...(formData.allowedCarriers || {}), allowed: next }
                                                    });
                                                }}
                                                className="checkbox checkbox-xs checkbox-primary"
                                            />
                                            <span className="font-semibold text-[11px] text-base-content/80">{c.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Commercial Pricing & Markup Policy */}
                        <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-2xl space-y-2.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                                <span className="material-symbols-outlined text-[17px] text-primary">price_change</span>
                                {lang === 'ar' ? 'هيكل التسعير وهوامش الربح' : 'Commercial Rate Markup Structure'}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                                <div>
                                    <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'نموذج الهامش' : 'Markup Model'}
                                    </label>
                                    <select
                                        value={formData.markup?.type || 'PERCENTAGE'}
                                        onChange={(e) => {
                                            const type = e.target.value;
                                            setFormData({
                                                ...formData,
                                                markup: {
                                                    ...(formData.markup || {}),
                                                    type,
                                                    percentageValue: formData.markup?.percentageValue ?? 15,
                                                    flatValue: formData.markup?.flatValue ?? 0
                                                }
                                            });
                                        }}
                                        className="select select-sm select-bordered w-full text-xs font-semibold focus:select-primary"
                                    >
                                        <option value="PERCENTAGE">{lang === 'ar' ? 'نسبة مئوية (%)' : 'Percentage (%)'}</option>
                                        <option value="FLAT">{lang === 'ar' ? 'مبلغ ثابت (د.ك)' : 'Flat Fee (KWD)'}</option>
                                        <option value="COMBINED">{lang === 'ar' ? 'مدمج (% + د.ك)' : 'Combined (% + KWD)'}</option>
                                    </select>
                                </div>

                                {(formData.markup?.type === 'PERCENTAGE' || formData.markup?.type === 'COMBINED' || !formData.markup?.type) && (
                                    <div>
                                        <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                            {lang === 'ar' ? 'هامش الربح (%)' : 'Percentage Markup (%)'}
                                        </label>
                                        <input
                                            type="number"
                                            step="0.5"
                                            value={formData.markup?.percentageValue ?? ''}
                                            onChange={(e) => {
                                                setFormData({
                                                    ...formData,
                                                    markup: {
                                                        ...(formData.markup || {}),
                                                        percentageValue: parseFloat(e.target.value) || 0
                                                    }
                                                });
                                            }}
                                            className="input input-sm input-bordered w-full font-mono text-xs focus:input-primary"
                                            placeholder="15.0"
                                        />
                                    </div>
                                )}

                                {(formData.markup?.type === 'FLAT' || formData.markup?.type === 'COMBINED') && (
                                    <div>
                                        <label className="text-[11px] font-bold text-base-content/60 block mb-1">
                                            {lang === 'ar' ? 'رسوم ثابتة (د.ك)' : 'Flat Surcharge (KWD)'}
                                        </label>
                                        <input
                                            type="number"
                                            step="0.25"
                                            value={formData.markup?.flatValue ?? ''}
                                            onChange={(e) => {
                                                setFormData({
                                                    ...formData,
                                                    markup: {
                                                        ...(formData.markup || {}),
                                                        flatValue: parseFloat(e.target.value) || 0
                                                    }
                                                });
                                            }}
                                            className="input input-sm input-bordered w-full font-mono text-xs focus:input-primary"
                                            placeholder="1.500"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Credit Terms & Limit */}
                        <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-2xl space-y-2">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                                <span className="material-symbols-outlined text-[17px] text-primary">credit_card</span>
                                {lang === 'ar' ? 'الحد الائتماني المعتمد (د.ك)' : 'Approved Credit Limit (KWD)'}
                            </div>
                            <input
                                type="number"
                                step="50"
                                value={formData.creditLimit}
                                onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                                placeholder="0.000"
                                className="input input-sm input-bordered w-full font-mono font-bold text-sm focus:input-primary"
                            />
                        </div>

                        {/* Active Switch */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-base-200/30 border border-base-200">
                            <div>
                                <div className="text-xs font-bold text-base-content">
                                    {lang === 'ar' ? 'حالة نشاط المؤسسة' : 'Account Active Status'}
                                </div>
                                <div className="text-[11px] text-base-content/60">
                                    {lang === 'ar' ? 'المؤسسات غير النشطة لا يمكنها إصدار بوالص جديدة' : 'Disabled accounts cannot book new consignments'}
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={formData.active}
                                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                className="toggle toggle-primary toggle-sm"
                            />
                        </div>

                        {/* Footer */}
                        <div className="modal-action flex items-center justify-end gap-2 pt-3 border-t border-base-200">
                            <button
                                type="button"
                                onClick={() => setOpenDialog(false)}
                                className="btn btn-sm btn-ghost"
                            >
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="submit"
                                disabled={saveLoading}
                                className="btn btn-sm btn-primary font-bold shadow-md shadow-primary/20 gap-1.5"
                            >
                                {saveLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                                {editingOrg ? (lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes') : (lang === 'ar' ? 'إنشاء المؤسسة' : 'Create Organization')}
                            </button>
                        </div>
                    </form>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setOpenDialog(false)} />
            </div>

            {/* Members Roster Modal */}
            <div className={`modal modal-bottom sm:modal-middle ${openMembersDialog ? 'modal-open' : ''} z-50`}>
                <div className="modal-box max-w-2xl bg-base-100 border border-base-200/80 shadow-2xl p-6 text-base-content max-h-[92vh] overflow-y-auto">
                    <div className="flex items-center justify-between pb-3 border-b border-base-200">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">group</span>
                            <div>
                                <h3 className="font-black text-lg text-base-content">
                                    {lang === 'ar' ? `فريق عمل: ${editingOrg?.name || ''}` : `Members Roster: ${editingOrg?.name || ''}`}
                                </h3>
                                <p className="text-[11px] text-base-content/60">
                                    {lang === 'ar' ? 'المستخدمون المعتمدون للشحن ضمن حساب هذه المؤسسة' : 'Authorized users operating under this corporate account'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpenMembersDialog(false)}
                            className="btn btn-sm btn-circle btn-ghost text-base-content/60"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="py-4 space-y-4">
                        {/* Members Table */}
                        <div className="border border-base-200 rounded-2xl overflow-hidden">
                            <table className="table table-zebra w-full text-xs">
                                <thead>
                                    <tr className="bg-base-200/60 text-base-content/70 text-[11px] font-bold uppercase">
                                        <th>{lang === 'ar' ? 'العضو' : 'Member'}</th>
                                        <th>{lang === 'ar' ? 'الدور' : 'Role'}</th>
                                        <th className="text-end">{lang === 'ar' ? 'الإجراء' : 'Action'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(!editingOrg?.members || editingOrg.members.length === 0) ? (
                                        <tr>
                                            <td colSpan={3} className="py-8 text-center text-base-content/50">
                                                <span className="material-symbols-outlined text-3xl mb-1 text-base-content/30">group_off</span>
                                                <p className="text-xs font-semibold">
                                                    {lang === 'ar' ? 'لا يوجد أعضاء معينين لهذه المؤسسة بعد.' : 'No members assigned to this organization yet.'}
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        editingOrg.members.map((member) => (
                                            <tr key={member.id} className="hover">
                                                <td>
                                                    <div className="font-bold text-base-content">{member.name}</div>
                                                    <div className="text-[11px] text-base-content/50 font-mono">{member.email}</div>
                                                </td>
                                                <td>
                                                    <span className="badge badge-sm badge-outline font-mono font-bold text-[10px] uppercase">
                                                        {member.role?.replace('_', ' ') || 'USER'}
                                                    </span>
                                                </td>
                                                <td className="text-end">
                                                    {canManage && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveMember(member.id)}
                                                            className="btn btn-ghost btn-xs text-error hover:bg-error/10 font-bold"
                                                        >
                                                            {lang === 'ar' ? 'إلغاء التعيين' : 'Remove'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Add User Section */}
                        {canManage && (
                            <div className="p-4 bg-base-200/40 border border-base-200 rounded-2xl space-y-2">
                                <label className="text-xs font-bold text-base-content/80 block">
                                    {lang === 'ar' ? 'تعيين مستخدم غير مرتبط بمؤسسة' : 'Assign Unlinked User to Organization'}
                                </label>
                                <div className="flex gap-2">
                                    <select
                                        value={selectedMemberToAdd}
                                        onChange={(e) => setSelectedMemberToAdd(e.target.value)}
                                        className="select select-sm select-bordered flex-1 text-xs font-semibold focus:select-primary"
                                    >
                                        <option value="">
                                            {lang === 'ar' ? '-- اختر مستخدماً غير مرتبط --' : '-- Choose unassigned user --'}
                                        </option>
                                        {users
                                            .filter(u => !editingOrg?.members?.some(m => m.id === u.id) && !u.organizationId)
                                            .map(u => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name} ({u.email}) — {u.role}
                                                </option>
                                            ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAddMember}
                                        disabled={!selectedMemberToAdd || memberLoading}
                                        className="btn btn-sm btn-primary font-bold gap-1 shadow-xs"
                                    >
                                        {memberLoading ? <span className="loading loading-spinner loading-xs"></span> : null}
                                        {lang === 'ar' ? 'إضافة' : 'Assign'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="modal-action pt-2">
                            <button
                                type="button"
                                onClick={() => setOpenMembersDialog(false)}
                                className="btn btn-sm btn-ghost text-base-content/70 ms-auto"
                            >
                                {lang === 'ar' ? 'إغلاق' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={() => setOpenMembersDialog(false)} />
            </div>
        </div>
    );
};

export default AdminOrganizationsPage;
