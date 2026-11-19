import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { organizationService, userService } from '../../services/api';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

const CARRIERS_CONFIG = [
    { code: 'DGR', name: 'DGR' },
    { code: 'DGR2', name: 'DHL' },
    { code: 'FEDEX', name: 'FedEx Express (FDX)' },
    { code: 'ARAMEX', name: 'Aramex Express' },
    { code: 'INTERNAL', name: 'Target Local Fleet' },
    { code: 'SMSA', name: 'SMSA Express' }
];

export const AdminOrganizationsV2Page = () => {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();
    const { user } = useAuth();
    const { lang, isRTL } = useLanguage();

    const role = user?.role;
    const hasPageAccess = ['admin', 'manager', 'accounting'].includes(role) && hasCapability(role, CAPABILITIES.MANAGE_ORGS);
    const canViewCostData = hasCapability(role, CAPABILITIES.VIEW_COST_DATA);
    const canViewFinance = hasCapability(role, CAPABILITIES.VIEW_FINANCE);
    const canDeleteOrg = role === 'admin';

    const [orgs, setOrgs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');

    // Modals
    const [openDialog, setOpenDialog] = useState(false);
    const [openMembersDialog, setOpenMembersDialog] = useState(false);
    const [editingOrg, setEditingOrg] = useState(null);
    const [saveLoading, setSaveLoading] = useState(false);
    const [deleteConfirmOrg, setDeleteConfirmOrg] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const [selectedMemberToAdd, setSelectedMemberToAdd] = useState('');
    const [memberLoading, setMemberLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        taxId: '',
        type: 'BUSINESS',
        creditLimit: 0,
        active: true,
        markup: { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
        allowedCarriers: { allowed: ['DGR', 'FEDEX', 'ARAMEX', 'INTERNAL', 'SMSA'], defaultCarrier: 'DGR' }
    });

    const fetchOrgs = useCallback(async () => {
        if (!hasPageAccess) return;
        setLoading(true);
        setFetchError(null);
        try {
            const [orgRes, userRes] = await Promise.all([
                organizationService.getOrganizations(),
                userService.getUsers()
            ]);
            setOrgs(orgRes?.data || []);
            setUsers(userRes?.data || []);
        } catch (err) {
            setFetchError(err?.response?.data?.error || err?.message || (lang === 'ar' ? 'فشل تحميل قائمة المؤسسات' : 'Failed to load organizations'));
        } finally {
            setLoading(false);
        }
    }, [hasPageAccess, lang]);

    useEffect(() => {
        fetchOrgs();
    }, [fetchOrgs]);

    const kpiData = useMemo(() => {
        let totalCreditLimit = 0;
        let totalOutstanding = 0;
        orgs.forEach((o) => {
            totalCreditLimit += parseFloat(o.creditLimit || 0);
            totalOutstanding += parseFloat(o.balance || 0);
        });
        return {
            total: orgs.length,
            businessCount: orgs.filter((o) => o.type?.toUpperCase() === 'BUSINESS').length,
            totalCreditLimit,
            totalOutstanding
        };
    }, [orgs]);

    const filteredOrgs = useMemo(() => {
        const q = search.trim().toLowerCase();
        return orgs.filter((org) => {
            const matchesSearch =
                !q ||
                org.name?.toLowerCase().includes(q) ||
                org.taxId?.toLowerCase().includes(q);
            const matchesType =
                typeFilter === 'ALL' ||
                org.type?.toUpperCase() === typeFilter;
            return matchesSearch && matchesType;
        });
    }, [orgs, search, typeFilter]);

    const handleOpenDialog = (org = null) => {
        if (org) {
            setEditingOrg(org);
            setFormData({
                name: org.name || '',
                taxId: org.taxId || '',
                type: org.type || 'BUSINESS',
                creditLimit: org.creditLimit || 0,
                active: org.active ?? true,
                markup: org.markup || { type: 'PERCENTAGE', percentageValue: 15, flatValue: 0 },
                allowedCarriers: org.allowedCarriers || { allowed: ['DGR', 'FEDEX', 'ARAMEX', 'INTERNAL', 'SMSA'], defaultCarrier: 'DGR' }
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
                allowedCarriers: { allowed: ['DGR', 'FEDEX', 'ARAMEX', 'INTERNAL', 'SMSA'], defaultCarrier: 'DGR' }
            });
        }
        setOpenDialog(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            enqueueSnackbar(lang === 'ar' ? 'اسم المؤسسة مطلوب' : 'Organization name is required', { variant: 'error' });
            return;
        }
        setSaveLoading(true);
        try {
            const payload = {
                name: formData.name.trim(),
                taxId: formData.taxId?.trim() || '',
                type: formData.type,
                creditLimit: Number(formData.creditLimit || 0),
                active: Boolean(formData.active),
                allowedCarriers: formData.allowedCarriers
            };
            if (canViewCostData) {
                payload.markup = {
                    type: formData.markup?.type || 'PERCENTAGE',
                    percentageValue: Number(formData.markup?.percentageValue || 0),
                    flatValue: Number(formData.markup?.flatValue || 0)
                };
            }

            if (editingOrg) {
                await organizationService.updateOrganization(editingOrg.id, payload);
                enqueueSnackbar(lang === 'ar' ? `تم تحديث مؤسسة ${payload.name}` : `Organization ${payload.name} updated`, { variant: 'success' });
            } else {
                await organizationService.createOrganization(payload);
                enqueueSnackbar(lang === 'ar' ? `تم إنشاء مؤسسة ${payload.name}` : `Organization ${payload.name} created`, { variant: 'success' });
            }
            setOpenDialog(false);
            fetchOrgs();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل حفظ المؤسسة' : 'Failed to save organization'), { variant: 'error' });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleAddMember = async () => {
        if (!selectedMemberToAdd || !editingOrg) return;
        setMemberLoading(true);
        try {
            await organizationService.addMember(editingOrg.id, selectedMemberToAdd);
            enqueueSnackbar(lang === 'ar' ? 'تمت إضافة العضو بنجاح' : 'Member assigned successfully', { variant: 'success' });
            const updatedRes = await organizationService.getOrganization(editingOrg.id);
            if (updatedRes?.data) setEditingOrg(updatedRes.data);
            setSelectedMemberToAdd('');
            fetchOrgs();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل إضافة العضو' : 'Failed to add member'), { variant: 'error' });
        } finally {
            setMemberLoading(false);
        }
    };

    const handleRemoveMember = async (memberId) => {
        if (!editingOrg) return;
        try {
            await organizationService.removeMember(editingOrg.id, memberId);
            enqueueSnackbar(lang === 'ar' ? 'تمت إزالة العضو' : 'Member unassigned', { variant: 'success' });
            setEditingOrg((prev) => ({
                ...prev,
                members: (prev.members || []).filter((m) => m.id !== memberId)
            }));
            fetchOrgs();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل إزالة العضو' : 'Failed to remove member'), { variant: 'error' });
        }
    };

    const handleDeleteOrg = async () => {
        if (!deleteConfirmOrg) return;
        setDeleteLoading(true);
        try {
            await organizationService.deleteOrganization(deleteConfirmOrg.id);
            enqueueSnackbar(lang === 'ar' ? `تم حذف مؤسسة ${deleteConfirmOrg.name}` : `Organization ${deleteConfirmOrg.name} deleted`, { variant: 'success' });
            setDeleteConfirmOrg(null);
            fetchOrgs();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || (lang === 'ar' ? 'فشل حذف المؤسسة' : 'Failed to delete organization'), { variant: 'error' });
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
                    description={lang === 'ar' ? 'إدارة المؤسسات متاحة فقط لمسؤولي المنصة والإدارة المالية.' : 'Organization governance is restricted to authorized platform administrators.'}
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
                            {lang === 'ar' ? 'إدارة المؤسسات والحدود الائتمانية مع حماية بيانات التكلفة' : 'Organization & credit governance with strict cost/margin isolation'}
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
                            to="/admin/organizations"
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
                            {lang === 'ar' ? 'المؤسسات والكيانات التجارية' : 'Organizations & Corporate Accounts'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {lang === 'ar' ? 'إدارة حسابات الشركات، الحدود الائتمانية، والأعضاء المرتبطين.' : 'Manage corporate entities, credit exposure, and assigned member directories.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={fetchOrgs} disabled={loading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                            <span>{lang === 'ar' ? 'تحديث' : 'Refresh'}</span>
                        </button>
                        <button type="button" onClick={() => handleOpenDialog(null)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs cursor-pointer">
                            <span className="material-symbols-outlined text-base" aria-hidden="true">add_business</span>
                            <span>{lang === 'ar' ? 'مؤسسة جديدة' : 'New Organization'}</span>
                        </button>
                    </div>
                </div>

                {fetchError && <ErrorBannerV2 message={fetchError} onRetry={fetchOrgs} isRetrying={loading} />}

                {/* KPI Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[
                        { label: lang === 'ar' ? 'إجمالي المؤسسات' : 'Total Organizations', value: kpiData.total, icon: 'corporate_fare', color: 'text-primary', isMoney: false },
                        { label: lang === 'ar' ? 'الشركات التجارية' : 'Business Entities', value: kpiData.businessCount, icon: 'storefront', color: 'text-indigo-600 dark:text-indigo-400', isMoney: false },
                        { label: lang === 'ar' ? 'إجمالي الحدود الائتمانية' : 'Total Credit Limit', value: `${kpiData.totalCreditLimit.toFixed(3)} KWD`, icon: 'credit_score', color: 'text-emerald-600 dark:text-emerald-400', isMoney: true },
                        { label: lang === 'ar' ? 'إجمالي المستحقات' : 'Total Receivables', value: `${kpiData.totalOutstanding.toFixed(3)} KWD`, icon: 'account_balance_wallet', color: 'text-amber-600 dark:text-amber-400', isMoney: true }
                    ].map((kpi) => (
                        <div key={kpi.label} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs min-w-0">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate">{kpi.label}</span>
                                <span className={`material-symbols-outlined text-xl shrink-0 ${kpi.color}`} aria-hidden="true">{kpi.icon}</span>
                            </div>
                            <div className={`font-black text-slate-900 dark:text-slate-100 mt-1.5 tabular-nums truncate ${kpi.isMoney ? 'text-lg sm:text-xl font-mono' : 'text-2xl'}`} dir="ltr">
                                {kpi.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Search & Type Filter */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 min-w-0">
                        <span className="material-symbols-outlined text-lg text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" aria-hidden="true">search</span>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={lang === 'ar' ? 'بحث باسم المؤسسة أو الرقم الضريبي...' : 'Search by organization name or Tax ID...'}
                            className="w-full ps-9 pe-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                        />
                    </div>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100"
                    >
                        <option value="ALL">{lang === 'ar' ? 'جميع الأنواع' : 'All Types'}</option>
                        <option value="BUSINESS">Business</option>
                        <option value="INTERNAL">Internal</option>
                        <option value="GOVERNMENT">Government</option>
                        <option value="INDIVIDUAL">Individual</option>
                    </select>
                </div>

                {/* Content */}
                {loading ? (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center">
                        <span className="loading loading-spinner loading-md text-primary" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">
                            {lang === 'ar' ? 'جارٍ تحميل المؤسسات...' : 'Loading organizations...'}
                        </p>
                    </div>
                ) : filteredOrgs.length === 0 && !fetchError ? (
                    <EmptyStateV2
                        icon="domain_disabled"
                        title={lang === 'ar' ? 'لا توجد مؤسسات مطابقة' : 'No organizations found'}
                        description={lang === 'ar' ? 'جرّب تعديل البحث أو أضف مؤسسة جديدة.' : 'Try adjusting your filters or create a new organization.'}
                        actionLabel={lang === 'ar' ? 'مؤسسة جديدة' : 'New Organization'}
                        onAction={() => handleOpenDialog(null)}
                    />
                ) : (
                    <>
                        {/* Mobile Cards (< md) */}
                        <div className="grid grid-cols-1 gap-3 md:hidden">
                            {filteredOrgs.map((org) => {
                                const outstanding = parseFloat(org.balance || 0);
                                const creditLimit = parseFloat(org.creditLimit || 0);
                                const availableCredit = Math.max(0, creditLimit - outstanding);
                                return (
                                    <div key={org.id} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{org.name}</div>
                                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400" dir="ltr">{org.taxId || 'No Tax ID'}</div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase shrink-0 ${org.active ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                                {org.active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'معطل' : 'Disabled')}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">{lang === 'ar' ? 'المستحق' : 'Outstanding'}</span>
                                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums" dir="ltr">{outstanding.toFixed(3)} KWD</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">{lang === 'ar' ? 'الائتمان المتاح' : 'Available Credit'}</span>
                                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums" dir="ltr">{availableCredit.toFixed(3)} KWD</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <button type="button" onClick={() => { setEditingOrg(org); setOpenMembersDialog(true); }} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                {lang === 'ar' ? `الأعضاء (${org.members?.length || 0})` : `Members (${org.members?.length || 0})`}
                                            </button>
                                            <button type="button" onClick={() => handleOpenDialog(org)} className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                                {lang === 'ar' ? 'تعديل' : 'Edit'}
                                            </button>
                                            {canViewFinance && (
                                                <button type="button" onClick={() => navigate('/finance-v2')} className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer">
                                                    {lang === 'ar' ? 'المالية' : 'Ledger'}
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
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'المؤسسة' : 'Organization'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                                            <th className="px-4 py-3 text-center">{lang === 'ar' ? 'الأعضاء' : 'Members'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'المستحق' : 'Outstanding'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الائتمان المتاح' : 'Available'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الحد الائتماني' : 'Credit Limit'}</th>
                                            {canViewCostData && <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الهامش' : 'Markup'}</th>}
                                            <th className="px-4 py-3 text-center">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredOrgs.map((org) => {
                                            const outstanding = parseFloat(org.balance || 0);
                                            const creditLimit = parseFloat(org.creditLimit || 0);
                                            const availableCredit = Math.max(0, creditLimit - outstanding);
                                            return (
                                                <tr key={org.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-900 dark:text-slate-100">{org.name}</div>
                                                        {org.taxId && <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400" dir="ltr">{org.taxId}</div>}
                                                    </td>
                                                    <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300">{org.type || 'BUSINESS'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button type="button" onClick={() => { setEditingOrg(org); setOpenMembersDialog(true); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 hover:border-primary cursor-pointer" dir="ltr">
                                                            <span className="material-symbols-outlined text-sm text-primary">group</span>
                                                            <span>{org.members?.length || 0}</span>
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 text-end font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100" dir="ltr">
                                                        {outstanding.toFixed(3)} KWD
                                                    </td>
                                                    <td className="px-4 py-3 text-end font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300" dir="ltr">
                                                        {availableCredit.toFixed(3)} KWD
                                                    </td>
                                                    <td className="px-4 py-3 text-end font-mono tabular-nums text-slate-600 dark:text-slate-400" dir="ltr">
                                                        {creditLimit.toFixed(3)} KWD
                                                    </td>
                                                    {canViewCostData && (
                                                        <td className="px-4 py-3 text-end font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200" dir="ltr">
                                                            {org.markup?.type === 'FLAT' ? `${org.markup?.flatValue || 0} KWD` : `${org.markup?.percentageValue ?? 15}%`}
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold ${org.active ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                                                            {org.active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'معطل' : 'Disabled')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-end">
                                                        <div className="inline-flex items-center justify-end gap-1">
                                                            <button type="button" onClick={() => handleOpenDialog(org)} title={lang === 'ar' ? 'تعديل' : 'Edit'} className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                                                <span className="material-symbols-outlined text-base">edit</span>
                                                            </button>
                                                            {canViewFinance && (
                                                                <button type="button" onClick={() => navigate('/finance-v2')} title={lang === 'ar' ? 'دفتر الأستاذ' : 'Financial Ledger'} className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer">
                                                                    <span className="material-symbols-outlined text-base">account_balance_wallet</span>
                                                                </button>
                                                            )}
                                                            <button type="button" onClick={() => navigate('/shipments-v2')} title={lang === 'ar' ? 'بوالص الشحن' : 'Waybills'} className="p-1.5 rounded-lg text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer">
                                                                <span className="material-symbols-outlined text-base">inventory_2</span>
                                                            </button>
                                                            {canDeleteOrg && (
                                                                <button type="button" onClick={() => setDeleteConfirmOrg(org)} title={lang === 'ar' ? 'حذف' : 'Delete'} className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
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

            {/* Create / Edit Modal */}
            {openDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <form onSubmit={handleSave} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                                {editingOrg ? (lang === 'ar' ? `تعديل: ${editingOrg.name}` : `Edit Organization: ${editingOrg.name}`) : (lang === 'ar' ? 'إنشاء مؤسسة جديدة' : 'Create Organization')}
                            </h2>
                            <button type="button" onClick={() => setOpenDialog(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'اسم المؤسسة *' : 'Organization Name *'}</label>
                                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'الرقم الضريبي' : 'Tax ID'}</label>
                                <input type="text" dir="ltr" value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'النوع' : 'Entity Type'}</label>
                                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                    <option value="BUSINESS">BUSINESS</option>
                                    <option value="INTERNAL">INTERNAL</option>
                                    <option value="GOVERNMENT">GOVERNMENT</option>
                                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'الحد الائتماني (KWD)' : 'Credit Limit (KWD)'}</label>
                                <input type="number" step="0.001" dir="ltr" value={formData.creditLimit} onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100" />
                            </div>
                            <div className="flex items-end pb-1">
                                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input type="checkbox" checked={formData.active} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} className="checkbox checkbox-sm checkbox-primary" />
                                    <span>{lang === 'ar' ? 'حساب نشط' : 'Active Account'}</span>
                                </label>
                            </div>

                            {canViewCostData && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'نموذج الهامش' : 'Markup Model'}</label>
                                        <select value={formData.markup?.type || 'PERCENTAGE'} onChange={(e) => setFormData({ ...formData, markup: { ...(formData.markup || {}), type: e.target.value } })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                            <option value="PERCENTAGE">Percentage (%)</option>
                                            <option value="FLAT">Flat (KWD)</option>
                                            <option value="COMBINED">Combined (% + Flat)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'نسبة الهامش (%)' : 'Percentage Markup (%)'}</label>
                                        <input type="number" step="0.1" dir="ltr" value={formData.markup?.percentageValue ?? 15} onChange={(e) => setFormData({ ...formData, markup: { ...(formData.markup || {}), percentageValue: e.target.value } })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{lang === 'ar' ? 'رسوم ثابتة (KWD)' : 'Flat Markup (KWD)'}</label>
                                        <input type="number" step="0.001" dir="ltr" value={formData.markup?.flatValue ?? 0} onChange={(e) => setFormData({ ...formData, markup: { ...(formData.markup || {}), flatValue: e.target.value } })} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100" />
                                    </div>
                                </>
                            )}

                            {/* Allowed Carriers Policy */}
                            <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {lang === 'ar' ? 'شركات الشحن المسموح بها' : 'Allowed Carriers Policy'}
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    {CARRIERS_CONFIG.map((c) => {
                                        const currentAllowed = formData.allowedCarriers?.allowed || ['DGR', 'FEDEX', 'ARAMEX', 'INTERNAL', 'SMSA'];
                                        const isChecked = currentAllowed.includes(c.code);
                                        return (
                                            <label key={c.code} className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        const next = e.target.checked
                                                            ? [...new Set([...currentAllowed, c.code])]
                                                            : currentAllowed.filter((x) => x !== c.code);
                                                        setFormData({
                                                            ...formData,
                                                            allowedCarriers: { ...(formData.allowedCarriers || {}), allowed: next }
                                                        });
                                                    }}
                                                    className="checkbox checkbox-xs checkbox-primary"
                                                />
                                                <span className="font-semibold text-slate-800 dark:text-slate-200">{c.name}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        {lang === 'ar' ? 'الناقل الافتراضي' : 'Default Carrier'}
                                    </label>
                                    <select
                                        value={formData.allowedCarriers?.defaultCarrier || 'DGR'}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            allowedCarriers: { ...(formData.allowedCarriers || {}), defaultCarrier: e.target.value }
                                        })}
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100"
                                    >
                                        {CARRIERS_CONFIG.map((c) => (
                                            <option key={c.code} value={c.code}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={() => setOpenDialog(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="submit" disabled={saveLoading} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {saveLoading ? '...' : (lang === 'ar' ? 'حفظ' : 'Save Organization')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Members Modal */}
            {openMembersDialog && editingOrg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                            <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                                {lang === 'ar' ? `أعضاء ${editingOrg.name}` : `Members — ${editingOrg.name}`}
                            </h2>
                            <button type="button" onClick={() => setOpenMembersDialog(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <select value={selectedMemberToAdd} onChange={(e) => setSelectedMemberToAdd(e.target.value)} className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100">
                                <option value="">{lang === 'ar' ? 'اختر مستخدماً لإضافته...' : 'Select user to assign...'}</option>
                                {users.filter((u) => u.organizationId !== editingOrg.id).map((u) => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                ))}
                            </select>
                            <button type="button" disabled={!selectedMemberToAdd || memberLoading} onClick={handleAddMember} className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-bold shrink-0 cursor-pointer disabled:opacity-50">
                                {lang === 'ar' ? 'إضافة' : 'Assign'}
                            </button>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {(editingOrg.members || []).length === 0 ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                                    {lang === 'ar' ? 'لا يوجد أعضاء مرتبطون بهذه المؤسسة.' : 'No members assigned to this organization.'}
                                </p>
                            ) : (
                                (editingOrg.members || []).map((m) => (
                                    <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{m.name}</div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" dir="ltr">{m.email}</div>
                                        </div>
                                        <button type="button" onClick={() => handleRemoveMember(m.id)} className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold shrink-0 cursor-pointer">
                                            {lang === 'ar' ? 'إزالة' : 'Remove'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirmOrg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <h3 className="text-base font-black text-rose-600 dark:text-rose-400">
                            {lang === 'ar' ? 'تأكيد حذف المؤسسة' : 'Confirm Organization Deletion'}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? `هل أنت متأكد من حذف مؤسسة "${deleteConfirmOrg.name}"؟` : `Are you sure you want to delete "${deleteConfirmOrg.name}"?`}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDeleteConfirmOrg(null)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="button" disabled={deleteLoading} onClick={handleDeleteOrg} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {deleteLoading ? '...' : (lang === 'ar' ? 'حذف' : 'Delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminOrganizationsV2Page;
