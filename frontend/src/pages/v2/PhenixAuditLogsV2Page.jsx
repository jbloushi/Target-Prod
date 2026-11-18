import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { phenixService } from '../../services/api';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

export const PhenixAuditLogsV2Page = () => {
    const { lang, isRTL } = useLanguage();
    const { user } = useAuth();

    const hasPageAccess = ['admin', 'manager', 'accounting'].includes(user?.role);

    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState({
        totalFetched: 0,
        completeCount: 0,
        incompleteCount: 0,
        completionRate: 100,
        missingBreakdown: {
            missingPhone: 0,
            missingAwb: 0,
            missingName: 0,
            missingCountry: 0
        },
        window: null
    });

    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [daysBack, setDaysBack] = useState(7);
    const [carrierFilter, setCarrierFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('INCOMPLETE_ONLY');
    const [missingFieldFilter, setMissingFieldFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [copiedJson, setCopiedJson] = useState(false);

    const fetchAudit = useCallback(async () => {
        if (!hasPageAccess) return;
        setLoading(true);
        setFetchError(null);
        try {
            const res = await phenixService.previewShipments({
                daysBack,
                carrier: carrierFilter,
                onlyComplete: statusFilter === 'COMPLETE_ONLY',
                onlyIncomplete: statusFilter === 'INCOMPLETE_ONLY'
            });
            const data = res?.data || res;
            setItems(data?.items || []);
            setSummary({
                totalFetched: data?.totalFetched || 0,
                completeCount: data?.completeCount || 0,
                incompleteCount: data?.incompleteCount || 0,
                completionRate: data?.completionRate ?? 100,
                missingBreakdown: data?.missingBreakdown || {
                    missingPhone: 0,
                    missingAwb: 0,
                    missingName: 0,
                    missingCountry: 0
                },
                window: data?.window || null
            });
        } catch (err) {
            setFetchError(err?.response?.data?.error || err?.message || (lang === 'ar' ? 'فشل جلب تدقيق فينيكس' : 'Failed to fetch Phenix audit logs'));
        } finally {
            setLoading(false);
        }
    }, [hasPageAccess, daysBack, carrierFilter, statusFilter, lang]);

    useEffect(() => {
        fetchAudit();
    }, [fetchAudit]);

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((item) => {
            if (missingFieldFilter !== 'ALL') {
                const missing = item.missingFields || [];
                if (missingFieldFilter === 'PHONE' && !missing.includes('Receiver Phone')) return false;
                if (missingFieldFilter === 'AWB' && !missing.includes('Carrier AWB')) return false;
                if (missingFieldFilter === 'NAME' && !missing.includes('Receiver Name')) return false;
                if (missingFieldFilter === 'COUNTRY' && !missing.includes('Destination Country')) return false;
            }
            if (!q) return true;
            return (
                String(item.billId || '').toLowerCase().includes(q) ||
                String(item.carrierTracking || '').toLowerCase().includes(q) ||
                String(item.receiverName || '').toLowerCase().includes(q) ||
                String(item.receiverPhone || '').toLowerCase().includes(q) ||
                String(item.merchantName || '').toLowerCase().includes(q)
            );
        });
    }, [items, missingFieldFilter, search]);

    const handleCopyJson = () => {
        if (!selectedItem) return;
        navigator.clipboard.writeText(JSON.stringify(selectedItem.rawRow || selectedItem, null, 2));
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    if (!hasPageAccess) {
        return (
            <div dir={isRTL ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto px-4 py-12">
                <EmptyStateV2
                    icon="lock"
                    title={lang === 'ar' ? 'صلاحية الوصول مقيدة' : 'Access Restricted'}
                    description={lang === 'ar' ? 'تدقيق فواتير فينيكس متاح فقط لمسؤولي النظام والإدارة.' : 'Phenix ERP audit logs are restricted to Admin, Manager, and Accounting roles.'}
                />
            </div>
        );
    }

    return (
        <div dir={isRTL ? 'rtl' : 'ltr'} className="w-full min-h-screen pb-14">
            <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:px-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            V2 Governance
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {lang === 'ar' ? 'تدقيق فواتير فينيكس ERP مع حماية الصلاحيات' : 'Phenix ERP completeness audit with hardened RBAC isolation'}
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
                            to="/admin/phenix-audit"
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
                            {lang === 'ar' ? 'تدقيق فواتير فينيكس والنواقص' : 'Phenix Consignment Completeness Audit'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {lang === 'ar' ? 'مراجعة الفواتير المستوردة وتحديد الشحنات المرفوضة لنقص البيانات.' : 'Review raw Phenix bills, identify missing requirements, and verify ingestion readiness.'}
                        </p>
                    </div>
                    <button type="button" onClick={fetchAudit} disabled={loading} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer self-start sm:self-auto">
                        <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                        <span>{lang === 'ar' ? 'تحديث التدقيق' : 'Refresh Audit'}</span>
                    </button>
                </div>

                {fetchError && <ErrorBannerV2 message={fetchError} onRetry={fetchAudit} isRetrying={loading} />}

                {/* KPI Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {[
                        { label: lang === 'ar' ? 'إجمالي الفواتير' : 'Bills Audited', value: summary.totalFetched, icon: 'receipt_long', color: 'text-primary', filter: 'ALL' },
                        { label: lang === 'ar' ? 'مكتملة (مؤهلة)' : 'Complete', value: summary.completeCount, icon: 'check_circle', color: 'text-emerald-600 dark:text-emerald-400', filter: 'COMPLETE_ONLY' },
                        { label: lang === 'ar' ? 'مرفوضة (نواقص)' : 'Incomplete', value: summary.incompleteCount, icon: 'report_problem', color: 'text-rose-600 dark:text-rose-400', filter: 'INCOMPLETE_ONLY' },
                        { label: lang === 'ar' ? 'نسبة الاكتمال' : 'Completeness', value: `${summary.completionRate}%`, icon: 'donut_large', color: 'text-sky-600 dark:text-sky-400', filter: null }
                    ].map((kpi) => (
                        <button
                            key={kpi.label}
                            type="button"
                            onClick={() => kpi.filter && setStatusFilter(kpi.filter)}
                            className={`text-start rounded-2xl bg-white dark:bg-slate-900 border p-4 shadow-2xs transition-colors min-w-0 ${
                                kpi.filter && statusFilter === kpi.filter
                                    ? 'border-primary ring-2 ring-primary/20'
                                    : 'border-slate-200/90 dark:border-slate-800'
                            } ${kpi.filter ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate">{kpi.label}</span>
                                <span className={`material-symbols-outlined text-xl shrink-0 ${kpi.color}`} aria-hidden="true">{kpi.icon}</span>
                            </div>
                            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1.5 font-mono tabular-nums" dir="ltr">
                                {kpi.value}
                            </div>
                            {kpi.filter === 'ALL' && summary.window?.from && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono truncate" dir="ltr">
                                    {summary.window.from.year}/{summary.window.from.month}/{summary.window.from.day} → {summary.window.to.year}/{summary.window.to.month}/{summary.window.to.day}
                                </div>
                            )}
                            {kpi.filter === null && (
                                <progress
                                    className={`progress mt-2 w-full h-1.5 ${summary.completionRate >= 80 ? 'progress-success' : summary.completionRate >= 50 ? 'progress-warning' : 'progress-error'}`}
                                    value={summary.completionRate}
                                    max="100"
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Missing Requirement Chips + Search */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[
                            { id: 'ALL', label: lang === 'ar' ? 'الكل' : 'All Missing' },
                            { id: 'PHONE', label: `${lang === 'ar' ? 'نقص الهاتف' : 'Missing Phone'} (${summary.missingBreakdown.missingPhone})` },
                            { id: 'AWB', label: `${lang === 'ar' ? 'نقص البوليصة' : 'Missing AWB'} (${summary.missingBreakdown.missingAwb})` },
                            { id: 'NAME', label: `${lang === 'ar' ? 'نقص الاسم' : 'Missing Name'} (${summary.missingBreakdown.missingName})` },
                            { id: 'COUNTRY', label: `${lang === 'ar' ? 'نقص الدولة' : 'Missing Country'} (${summary.missingBreakdown.missingCountry})` }
                        ].map((chip) => (
                            <button
                                key={chip.id}
                                type="button"
                                onClick={() => setMissingFieldFilter(chip.id)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                                    missingFieldFilter === chip.id
                                        ? 'bg-primary text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-3">
                        <div className="relative flex-1 min-w-0">
                            <span className="material-symbols-outlined text-lg text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" aria-hidden="true">search</span>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={lang === 'ar' ? 'بحث برقم الفاتورة، البوليصة، المستلم، أو الهاتف...' : 'Search by Bill ID, AWB, Receiver, or Phone...'}
                                className="w-full ps-9 pe-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                <option value="ALL">{lang === 'ar' ? 'كل الناقلين' : 'All Carriers'}</option>
                                <option value="ARAMEX">Aramex</option>
                                <option value="FEDEX">FedEx</option>
                                <option value="DHL">DHL / DGR</option>
                                <option value="OTE">OTE</option>
                                <option value="SMSA">SMSA</option>
                                <option value="POSTA_PLUS">Posta Plus</option>
                                <option value="IW_EXPRESS">IW Express</option>
                            </select>
                            <select value={daysBack} onChange={(e) => setDaysBack(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                <option value={1}>24 Hours</option>
                                <option value={3}>3 Days</option>
                                <option value={7}>7 Days</option>
                                <option value={14}>14 Days</option>
                                <option value={30}>30 Days</option>
                            </select>
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
                                <option value="INCOMPLETE_ONLY">{lang === 'ar' ? 'المرفوضة فقط' : 'Incomplete Only'}</option>
                                <option value="COMPLETE_ONLY">{lang === 'ar' ? 'المكتملة فقط' : 'Complete Only'}</option>
                                <option value="ALL">{lang === 'ar' ? 'الكل' : 'All Records'}</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Audit Content */}
                {loading ? (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-12 text-center">
                        <span className="loading loading-spinner loading-md text-primary" />
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">
                            {lang === 'ar' ? 'جارٍ تدقيق فواتير فينيكس...' : 'Auditing Phenix consignments...'}
                        </p>
                    </div>
                ) : filteredItems.length === 0 && !fetchError ? (
                    <EmptyStateV2
                        icon="verified"
                        title={lang === 'ar' ? 'لا توجد فواتير مطابقة' : 'No matching Phenix bills'}
                        description={lang === 'ar' ? 'لا توجد سجلات مطابقة لمعايير التصفية الحالية.' : 'No consignments match the current audit filters.'}
                    />
                ) : (
                    <>
                        {/* Mobile Cards (< md) */}
                        <div className="grid grid-cols-1 gap-3 md:hidden">
                            {filteredItems.map((item, idx) => (
                                <div key={`${item.billId}-${idx}`} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-mono font-bold text-sm text-primary" dir="ltr">#{item.billId || 'N/A'}</div>
                                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{item.receiverName || 'Missing Name'}</div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${item.isComplete ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`}>
                                            {item.isComplete ? (lang === 'ar' ? 'مكتمل' : 'Eligible') : (lang === 'ar' ? 'مرفوض' : 'Rejected')}
                                        </span>
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 flex justify-between gap-2" dir="ltr">
                                        <span>{item.receiverPhone || 'No Phone'}</span>
                                        <span>{item.carrierTracking || 'No AWB'}</span>
                                    </div>
                                    <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                                        <button type="button" onClick={() => setSelectedItem(item)} className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                            {lang === 'ar' ? 'فحص البيانات' : 'Inspect Payload'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table (>= md) */}
                        <div className="hidden md:block rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-start">
                                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 uppercase font-bold border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الفاتورة' : 'Bill #'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'المرسل' : 'Merchant'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'المستلم والهاتف' : 'Consignee'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الناقل والبوليصة' : 'Carrier & AWB'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                                            <th className="px-4 py-3 text-start">{lang === 'ar' ? 'النواقص' : 'Missing Fields'}</th>
                                            <th className="px-4 py-3 text-end">{lang === 'ar' ? 'فحص' : 'Inspect'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {filteredItems.map((item, idx) => (
                                            <tr key={`${item.billId}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-4 py-3 font-mono" dir="ltr">
                                                    <div className="font-bold text-primary">#{item.billId || 'N/A'}</div>
                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.date || '—'}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-slate-900 dark:text-slate-100">{item.merchantName || item.senderName || '—'}</div>
                                                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400" dir="ltr">{item.senderPhone || '—'}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-slate-900 dark:text-slate-100">{item.receiverName || 'Missing Name'}</div>
                                                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400" dir="ltr">{item.receiverPhone || 'No Phone'}</div>
                                                </td>
                                                <td className="px-4 py-3 font-mono" dir="ltr">
                                                    <div className="font-bold text-slate-800 dark:text-slate-200">{item.derivedCarrier || item.costCenter || 'CARRIER'}</div>
                                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.carrierTracking || 'Missing AWB'}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold ${item.isComplete ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`}>
                                                        {item.isComplete ? (lang === 'ar' ? 'مكتمل' : 'Eligible') : (lang === 'ar' ? 'مرفوض' : 'Rejected')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {(item.missingFields || []).length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.missingFields.map((f, i) => (
                                                                <span key={i} className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                                                                    {f}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{lang === 'ar' ? 'مكتمل' : 'Complete'}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-end">
                                                    <button type="button" onClick={() => setSelectedItem(item)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10 cursor-pointer" title="Inspect">
                                                        <span className="material-symbols-outlined text-base">info</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Inspector Modal */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                            <h3 className="text-base font-black text-slate-900 dark:text-slate-100" dir="ltr">
                                Phenix Consignment #{selectedItem.billId}
                            </h3>
                            <button type="button" onClick={() => setSelectedItem(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        {!selectedItem.isComplete ? (
                            <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-800 dark:text-rose-200 space-y-1">
                                <div className="font-bold flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-base">error</span>
                                    <span>{lang === 'ar' ? 'تم استبعاد الفاتورة للأسباب التالية:' : 'Rejected from ingestion due to missing fields:'}</span>
                                </div>
                                <ul className="list-disc list-inside font-semibold">
                                    {(selectedItem.missingFields || []).map((f, i) => (
                                        <li key={i}>{f}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs text-emerald-800 dark:text-emerald-200 font-bold flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-base">check_circle</span>
                                <span>{lang === 'ar' ? 'الفاتورة مكتملة ومؤهلة للاستيراد.' : 'Consignment satisfies all completeness requirements.'}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl">
                            <div>
                                <span className="text-slate-500 dark:text-slate-400 block font-bold">Phenix Bill ID:</span>
                                <span className="font-mono font-bold text-primary" dir="ltr">#{selectedItem.billId}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 dark:text-slate-400 block font-bold">Cost Center / Carrier:</span>
                                <span className="font-bold uppercase text-slate-900 dark:text-slate-100" dir="ltr">{selectedItem.costCenter || selectedItem.derivedCarrier || '—'}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 dark:text-slate-400 block font-bold">AWB:</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100" dir="ltr">{selectedItem.carrierTracking || 'None'}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 dark:text-slate-400 block font-bold">Receiver Phone:</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100" dir="ltr">{selectedItem.receiverPhone || 'None'}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 dark:text-slate-400 block font-bold">Receiver Name:</span>
                                <span className="font-bold text-slate-900 dark:text-slate-100">{selectedItem.receiverName || 'None'}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 dark:text-slate-400 block font-bold">Destination:</span>
                                <span className="font-bold text-slate-900 dark:text-slate-100" dir="ltr">{selectedItem.destCountryName} ({selectedItem.destCountryCode})</span>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Raw Phenix Payload</span>
                                <button type="button" onClick={handleCopyJson} className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                    {copiedJson ? 'Copied' : 'Copy JSON'}
                                </button>
                            </div>
                            <pre dir="ltr" className="bg-slate-950 text-slate-100 p-3.5 rounded-xl text-[11px] font-mono overflow-x-auto max-h-60">
                                {JSON.stringify(selectedItem.rawRow || selectedItem, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhenixAuditLogsV2Page;
