import React, { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import { phenixService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export const PhenixAuditLogsPage = () => {
    const { lang, isRTL } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();

    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState({
        totalFetched: 0,
        totalMatched: 0,
        completeCount: 0,
        incompleteCount: 0,
        completionRate: 100,
        missingBreakdown: {
            missingPhone: 0,
            missingAwb: 0,
            missingName: 0,
            missingCountry: 0,
            missingSenderPhone: 0
        },
        window: { from: null, to: null }
    });

    const [loading, setLoading] = useState(false);
    const [daysBack, setDaysBack] = useState(7);
    const [carrierFilter, setCarrierFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('INCOMPLETE_ONLY'); // 'ALL' | 'INCOMPLETE_ONLY' | 'COMPLETE_ONLY'
    const [missingFieldFilter, setMissingFieldFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [copiedJson, setCopiedJson] = useState(false);

    const fetchAudit = useCallback(async () => {
        try {
            setLoading(true);
            const res = await phenixService.previewShipments({
                daysBack,
                carrier: carrierFilter,
                onlyComplete: statusFilter === 'COMPLETE_ONLY',
                onlyIncomplete: statusFilter === 'INCOMPLETE_ONLY'
            });

            const data = res?.data || res;
            if (data?.items) {
                setItems(data.items || []);
                setSummary({
                    totalFetched: data.totalFetched || 0,
                    totalMatched: data.totalMatched || 0,
                    completeCount: data.completeCount || 0,
                    incompleteCount: data.incompleteCount || 0,
                    completionRate: data.completionRate ?? 100,
                    missingBreakdown: data.missingBreakdown || {
                        missingPhone: 0,
                        missingAwb: 0,
                        missingName: 0,
                        missingCountry: 0,
                        missingSenderPhone: 0
                    },
                    window: data.window || null
                });
            }
        } catch (err) {
            console.error('Phenix Audit fetch error:', err);
            enqueueSnackbar(lang === 'ar' ? 'فشل جلب تدقيق فواتير فينيكس' : 'Failed to fetch Phenix consignment audit', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [daysBack, carrierFilter, statusFilter, lang, enqueueSnackbar]);

    useEffect(() => {
        fetchAudit();
    }, [fetchAudit]);

    // Client-side filtering for search & missing field type
    const filteredItems = items.filter(item => {
        if (missingFieldFilter !== 'ALL') {
            if (missingFieldFilter === 'PHONE' && !item.missingFields.includes('Receiver Phone')) return false;
            if (missingFieldFilter === 'AWB' && !item.missingFields.includes('Carrier AWB')) return false;
            if (missingFieldFilter === 'NAME' && !item.missingFields.includes('Receiver Name')) return false;
            if (missingFieldFilter === 'COUNTRY' && !item.missingFields.includes('Destination Country')) return false;
        }

        if (search.trim()) {
            const q = search.toLowerCase().trim();
            const bill = String(item.billId || '').toLowerCase();
            const awb = String(item.carrierTracking || '').toLowerCase();
            const receiver = String(item.receiverName || '').toLowerCase();
            const phone = String(item.receiverPhone || '').toLowerCase();
            const merchant = String(item.merchantName || '').toLowerCase();
            return bill.includes(q) || awb.includes(q) || receiver.includes(q) || phone.includes(q) || merchant.includes(q);
        }

        return true;
    });

    const handleCopyJson = () => {
        if (!selectedItem) return;
        navigator.clipboard.writeText(JSON.stringify(selectedItem.rawRow || selectedItem, null, 2));
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
    };

    return (
        <div className={`p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto min-h-screen bg-base-100 ${isRTL ? 'rtl' : 'ltr'}`}>
            {/* Header Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-200 pb-5">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="badge badge-primary badge-sm font-bold tracking-wider">PHENIX ERP GATEWAY • AUDIT COCKPIT</span>
                        <span className="badge badge-neutral badge-sm">REST API v201</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-base-content mt-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-3xl">rule_folder</span>
                        {lang === 'ar' ? 'تدقيق فواتير فينيكس والنواقص' : 'Phenix Consignment Completeness Audit'}
                    </h1>
                    <p className="text-sm text-base-content/60 mt-0.5">
                        {lang === 'ar'
                            ? 'مراقبة الفواتير المستوردة وتحديد الشحنات المرفوضة لعدم اكتمال بيانات المستلم أو رقم التتبع'
                            : 'Review raw Phenix bills, identify rejected consignments with missing requirements, and verify ingestion readiness before import.'}
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    <button
                        onClick={fetchAudit}
                        disabled={loading}
                        className="btn btn-sm btn-outline gap-1.5 font-bold"
                    >
                        <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        {lang === 'ar' ? 'تحديث الآن' : 'Refresh Audit'}
                    </button>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Bills */}
                <div
                    onClick={() => setStatusFilter('ALL')}
                    className={`card bg-base-200/50 border hover:border-primary/50 cursor-pointer transition-all p-4 shadow-sm ${statusFilter === 'ALL' ? 'ring-2 ring-primary border-primary' : 'border-base-300'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-base-content/60 uppercase tracking-wider">{lang === 'ar' ? 'إجمالي الفواتير المفحوصة' : 'Total Bills Audited'}</span>
                        <span className="p-2 rounded-xl bg-primary/10 text-primary material-symbols-outlined text-lg">receipt_long</span>
                    </div>
                    <div className="text-3xl font-black text-base-content mt-2">{summary.totalFetched}</div>
                    <div className="text-[11px] text-base-content/50 mt-1">
                        {summary.window?.from ? `${summary.window.from.year}/${summary.window.from.month}/${summary.window.from.day} → ${summary.window.to.year}/${summary.window.to.month}/${summary.window.to.day}` : 'Last ' + daysBack + ' days'}
                    </div>
                </div>

                {/* Eligible / Complete */}
                <div
                    onClick={() => setStatusFilter('COMPLETE_ONLY')}
                    className={`card bg-base-200/50 border hover:border-success/50 cursor-pointer transition-all p-4 shadow-sm ${statusFilter === 'COMPLETE_ONLY' ? 'ring-2 ring-success border-success' : 'border-base-300'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-base-content/60 uppercase tracking-wider">{lang === 'ar' ? 'مكتملة وجاهزة للاستيراد' : 'Complete (Eligible)'}</span>
                        <span className="p-2 rounded-xl bg-success/10 text-success material-symbols-outlined text-lg">check_circle</span>
                    </div>
                    <div className="text-3xl font-black text-success mt-2">{summary.completeCount}</div>
                    <div className="text-[11px] text-success/80 font-semibold mt-1">
                        {lang === 'ar' ? 'بيانات كاملة (هاتف، بوليصة، اسم)' : 'Full data: AWB, Phone, Receiver'}
                    </div>
                </div>

                {/* Rejected / Incomplete */}
                <div
                    onClick={() => setStatusFilter('INCOMPLETE_ONLY')}
                    className={`card bg-base-200/50 border hover:border-error/50 cursor-pointer transition-all p-4 shadow-sm ${statusFilter === 'INCOMPLETE_ONLY' ? 'ring-2 ring-error border-error' : 'border-base-300'}`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-base-content/60 uppercase tracking-wider">{lang === 'ar' ? 'مرفوضة لنقص البيانات' : 'Rejected (Incomplete)'}</span>
                        <span className="p-2 rounded-xl bg-error/10 text-error material-symbols-outlined text-lg">report_problem</span>
                    </div>
                    <div className="text-3xl font-black text-error mt-2">{summary.incompleteCount}</div>
                    <div className="text-[11px] text-error/80 font-semibold mt-1">
                        {lang === 'ar' ? 'تم تخطيها لمنع مشاكل الشحن' : 'Skipped automatically from import'}
                    </div>
                </div>

                {/* Completeness Health Rate */}
                <div className="card bg-base-200/50 border border-base-300 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-base-content/60 uppercase tracking-wider">{lang === 'ar' ? 'نسبة اكتمال البيانات' : 'Data Completeness Rate'}</span>
                        <span className="p-2 rounded-xl bg-info/10 text-info material-symbols-outlined text-lg">donut_large</span>
                    </div>
                    <div className="text-3xl font-black text-info mt-2">{summary.completionRate}%</div>
                    <progress
                        className={`progress mt-2 w-full ${summary.completionRate >= 80 ? 'progress-success' : summary.completionRate >= 50 ? 'progress-warning' : 'progress-error'}`}
                        value={summary.completionRate}
                        max="100"
                    />
                </div>
            </div>

            {/* Missing Breakdown Quick-Filters Bar */}
            <div className="bg-base-200/40 border border-base-300 rounded-2xl p-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-base-content/70 mr-2 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">filter_alt</span>
                    {lang === 'ar' ? 'تصنيف النواقص الشائعة:' : 'Filter by Missing Requirement:'}
                </span>

                <button
                    onClick={() => setMissingFieldFilter('ALL')}
                    className={`btn btn-xs ${missingFieldFilter === 'ALL' ? 'btn-neutral' : 'btn-ghost'}`}
                >
                    {lang === 'ar' ? 'الكل' : 'All Missing'}
                </button>

                <button
                    onClick={() => setMissingFieldFilter('PHONE')}
                    className={`btn btn-xs gap-1 ${missingFieldFilter === 'PHONE' ? 'btn-error' : 'btn-outline btn-error'}`}
                >
                    <span className="material-symbols-outlined text-xs">phone_missed</span>
                    {lang === 'ar' ? `نقص هاتف المستلم (${summary.missingBreakdown.missingPhone})` : `Missing Phone (${summary.missingBreakdown.missingPhone})`}
                </button>

                <button
                    onClick={() => setMissingFieldFilter('AWB')}
                    className={`btn btn-xs gap-1 ${missingFieldFilter === 'AWB' ? 'btn-warning' : 'btn-outline btn-warning'}`}
                >
                    <span className="material-symbols-outlined text-xs">barcode</span>
                    {lang === 'ar' ? `نقص رقم البوليصة (${summary.missingBreakdown.missingAwb})` : `Missing AWB (${summary.missingBreakdown.missingAwb})`}
                </button>

                <button
                    onClick={() => setMissingFieldFilter('NAME')}
                    className={`btn btn-xs gap-1 ${missingFieldFilter === 'NAME' ? 'btn-info' : 'btn-outline btn-info'}`}
                >
                    <span className="material-symbols-outlined text-xs">person_off</span>
                    {lang === 'ar' ? `نقص اسم المستلم (${summary.missingBreakdown.missingName})` : `Missing Name (${summary.missingBreakdown.missingName})`}
                </button>

                <button
                    onClick={() => setMissingFieldFilter('COUNTRY')}
                    className={`btn btn-xs gap-1 ${missingFieldFilter === 'COUNTRY' ? 'btn-secondary' : 'btn-outline btn-secondary'}`}
                >
                    <span className="material-symbols-outlined text-xs">public_off</span>
                    {lang === 'ar' ? `نقص دولة الوجهة (${summary.missingBreakdown.missingCountry})` : `Missing Country (${summary.missingBreakdown.missingCountry})`}
                </button>
            </div>

            {/* Toolbar Filters */}
            <div className="bg-base-200/50 p-4 rounded-2xl border border-base-300 flex flex-col md:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 text-lg">search</span>
                    <input
                        type="text"
                        placeholder={lang === 'ar' ? 'بحث برقم الفاتورة، البوليصة، اسم المستلم، أو الهاتف...' : 'Search by Bill ID, AWB, Receiver Name, Phone, Merchant...'}
                        className="input input-sm input-bordered w-full pl-9 bg-base-100 text-xs font-semibold"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Carrier Filter */}
                    <select
                        className="select select-sm select-bordered text-xs font-bold bg-base-100"
                        value={carrierFilter}
                        onChange={(e) => setCarrierFilter(e.target.value)}
                    >
                        <option value="ALL">{lang === 'ar' ? 'جميع شركات الشحن' : 'All Carriers'}</option>
                        <option value="ARAMEX">Aramex</option>
                        <option value="FEDEX">FedEx</option>
                        <option value="DHL">DHL / DGR</option>
                        <option value="OTE">LogesTechs / OTE</option>
                    </select>

                    {/* Window Filter */}
                    <select
                        className="select select-sm select-bordered text-xs font-bold bg-base-100"
                        value={daysBack}
                        onChange={(e) => setDaysBack(Number(e.target.value))}
                    >
                        <option value={1}>{lang === 'ar' ? 'آخر 24 ساعة (اليوم)' : 'Last 24 Hours (Today)'}</option>
                        <option value={3}>{lang === 'ar' ? 'آخر 3 أيام' : 'Last 3 Days'}</option>
                        <option value={7}>{lang === 'ar' ? 'آخر 7 أيام' : 'Last 7 Days'}</option>
                        <option value={14}>{lang === 'ar' ? 'آخر 14 يوم' : 'Last 14 Days'}</option>
                        <option value={30}>{lang === 'ar' ? 'آخر 30 يوم' : 'Last 30 Days'}</option>
                    </select>

                    {/* Status Filter */}
                    <select
                        className="select select-sm select-bordered text-xs font-bold bg-base-100"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="INCOMPLETE_ONLY">{lang === 'ar' ? 'المرفوضة فقط (نواقص)' : 'Incomplete Only (Rejected)'}</option>
                        <option value="COMPLETE_ONLY">{lang === 'ar' ? 'المكتملة فقط (مؤهلة)' : 'Complete Only (Eligible)'}</option>
                        <option value="ALL">{lang === 'ar' ? 'جميع الفواتير' : 'All Records'}</option>
                    </select>
                </div>
            </div>

            {/* Audit Table */}
            <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="table table-sm w-full">
                        <thead className="bg-base-200/60 text-xs font-extrabold text-base-content/80 uppercase">
                            <tr>
                                <th>{lang === 'ar' ? 'الفاتورة والتاريخ' : 'Bill # / Date'}</th>
                                <th>{lang === 'ar' ? 'التاجر / المرسل' : 'Merchant / Sender'}</th>
                                <th>{lang === 'ar' ? 'المستلم والهاتف' : 'Consignee (Receiver)'}</th>
                                <th>{lang === 'ar' ? 'الناقل والبوليصة' : 'Carrier & AWB'}</th>
                                <th>{lang === 'ar' ? 'الوجهة' : 'Destination'}</th>
                                <th>{lang === 'ar' ? 'حالة الاكتمال' : 'Data Status'}</th>
                                <th>{lang === 'ar' ? 'النواقص المطلوبة' : 'Missing Requirements'}</th>
                                <th className="text-center">{lang === 'ar' ? 'فحص البيانات' : 'Inspect'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-base-200 text-xs font-medium">
                            {loading ? (
                                <tr>
                                    <td colSpan="8" className="text-center py-12">
                                        <span className="loading loading-spinner loading-md text-primary"></span>
                                        <p className="mt-2 text-xs font-bold text-base-content/60">{lang === 'ar' ? 'جاري فحص وتدقيق فواتير فينيكس...' : 'Auditing Phenix consignments in real time...'}</p>
                                    </td>
                                </tr>
                            ) : filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="text-center py-12 text-base-content/50">
                                        <span className="material-symbols-outlined text-4xl text-success mb-1">verified</span>
                                        <p className="text-sm font-bold text-base-content">
                                            {statusFilter === 'INCOMPLETE_ONLY'
                                                ? (lang === 'ar' ? 'رائع! لا توجد فواتير ناقصة مطابقة للشروط' : 'No incomplete consignments found matching current criteria!')
                                                : (lang === 'ar' ? 'لا توجد سجلات مطابقة للبحث' : 'No records match the current filter.')}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map((item, idx) => (
                                    <tr key={`${item.billId}-${idx}`} className="hover:bg-base-200/30 transition-colors">
                                        {/* Bill ID & Date */}
                                        <td className="font-mono">
                                            <div className="font-bold text-primary">#{item.billId || 'N/A'}</div>
                                            <div className="text-[10px] text-base-content/50">{item.date || '—'}</div>
                                            {item.receiptNo && (
                                                <div className="text-[10px] text-base-content/40">Rec: {item.receiptNo}</div>
                                            )}
                                        </td>

                                        {/* Merchant / Sender */}
                                        <td>
                                            <div className="font-bold">{item.merchantName || item.senderName || '—'}</div>
                                            <div className="text-[10px] text-base-content/50 font-mono">{item.senderPhone || '—'}</div>
                                        </td>

                                        {/* Receiver & Phone */}
                                        <td>
                                            <div className="font-bold">{item.receiverName && item.receiverName !== '-' ? item.receiverName : <span className="text-error italic">Missing Name</span>}</div>
                                            <div className="font-mono text-[11px] mt-0.5">
                                                {item.receiverPhone && !item.receiverPhone.startsWith('Invalid') ? (
                                                    <span className="text-success font-bold">{item.receiverPhone}</span>
                                                ) : (
                                                    <span className="badge badge-error badge-xs text-[10px] font-bold py-1">
                                                        {item.receiverPhone || 'No Phone'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Carrier & AWB */}
                                        <td>
                                            <span className="badge badge-outline badge-xs font-bold uppercase mb-0.5">
                                                {item.derivedCarrier || item.costCenter || 'CARRIER'}
                                            </span>
                                            <div className="font-mono font-bold">
                                                {item.carrierTracking ? (
                                                    item.carrierTracking
                                                ) : (
                                                    <span className="text-error font-extrabold flex items-center gap-0.5">
                                                        <span className="material-symbols-outlined text-xs">close</span> Missing AWB
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Destination */}
                                        <td>
                                            <span className="badge badge-sm badge-ghost font-bold font-mono">
                                                {item.destCountryCode || '—'}
                                            </span>
                                            <div className="text-[10px] text-base-content/60 truncate max-w-[100px]">{item.destCountryName || ''}</div>
                                        </td>

                                        {/* Data Status */}
                                        <td>
                                            {item.isComplete ? (
                                                <span className="badge badge-success text-white badge-sm font-bold gap-1">
                                                    <span className="material-symbols-outlined text-xs">check</span>
                                                    {lang === 'ar' ? 'مكتمل (مؤهل)' : 'Eligible'}
                                                </span>
                                            ) : (
                                                <span className="badge badge-error text-white badge-sm font-bold gap-1">
                                                    <span className="material-symbols-outlined text-xs">block</span>
                                                    {lang === 'ar' ? 'مرفوض (ناقص)' : 'Rejected'}
                                                </span>
                                            )}
                                        </td>

                                        {/* Missing Requirements List */}
                                        <td>
                                            {item.missingFields && item.missingFields.length > 0 ? (
                                                <div className="flex flex-wrap gap-1 max-w-[220px]">
                                                    {item.missingFields.map((field, fIdx) => (
                                                        <span key={fIdx} className="badge badge-xs bg-error/15 text-error border-error/20 font-bold">
                                                            {field}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-success text-[11px] font-semibold flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-xs">verified</span>
                                                    {lang === 'ar' ? 'كل الحقول مكتملة' : 'Full Consignment Data'}
                                                </span>
                                            )}
                                        </td>

                                        {/* Inspect Action */}
                                        <td className="text-center">
                                            <button
                                                onClick={() => setSelectedItem(item)}
                                                className="btn btn-ghost btn-xs btn-square text-primary"
                                                title="Inspect Phenix Raw Fields"
                                            >
                                                <span className="material-symbols-outlined text-base">info</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Consignment Raw Payload Inspector Modal */}
            {selectedItem && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-2xl bg-base-100 border border-base-300 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-base-200 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">data_object</span>
                                <h3 className="font-extrabold text-lg">
                                    {lang === 'ar' ? `فحص الفاتورة #${selectedItem.billId}` : `Phenix Consignment #${selectedItem.billId} Inspector`}
                                </h3>
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="btn btn-sm btn-ghost btn-circle">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="py-4 space-y-4">
                            {/* Completeness Diagnostic Alert */}
                            {!selectedItem.isComplete ? (
                                <div className="alert alert-error bg-error/10 text-error border-error/30 text-xs">
                                    <span className="material-symbols-outlined">error</span>
                                    <div>
                                        <p className="font-bold">{lang === 'ar' ? 'هذه الفاتورة تم استبعادها من الاستيراد للأسباب التالية:' : 'This consignment was rejected from database ingestion:'}</p>
                                        <ul className="list-disc list-inside mt-1 font-semibold">
                                            {selectedItem.missingFields.map((f, i) => (
                                                <li key={i}>{f}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ) : (
                                <div className="alert alert-success bg-success/10 text-success border-success/30 text-xs">
                                    <span className="material-symbols-outlined">check_circle</span>
                                    <div>
                                        <p className="font-bold">{lang === 'ar' ? 'هذه الفاتورة مكتملة ومؤهلة للاستيراد التلقائي.' : 'This consignment satisfies all completeness requirements.'}</p>
                                    </div>
                                </div>
                            )}

                            {/* Summary Fields Grid */}
                            <div className="grid grid-cols-2 gap-3 text-xs bg-base-200/50 p-3 rounded-xl">
                                <div>
                                    <span className="text-base-content/50 block font-bold">Phenix Bill ID:</span>
                                    <span className="font-mono font-bold text-primary">#{selectedItem.billId}</span>
                                </div>
                                <div>
                                    <span className="text-base-content/50 block font-bold">Carrier Tracking / AWB:</span>
                                    <span className="font-mono font-bold">{selectedItem.carrierTracking || 'None (Missing)'}</span>
                                </div>
                                <div>
                                    <span className="text-base-content/50 block font-bold">Receiver Name:</span>
                                    <span className="font-bold">{selectedItem.receiverName || 'None'}</span>
                                </div>
                                <div>
                                    <span className="text-base-content/50 block font-bold">Receiver Phone:</span>
                                    <span className="font-mono font-bold">{selectedItem.receiverPhone || 'None'}</span>
                                </div>
                                <div>
                                    <span className="text-base-content/50 block font-bold">Cost Center / Carrier:</span>
                                    <span className="font-bold uppercase">{selectedItem.costCenter || selectedItem.derivedCarrier}</span>
                                </div>
                                <div>
                                    <span className="text-base-content/50 block font-bold">Destination Country:</span>
                                    <span className="font-bold">{selectedItem.destCountryName} ({selectedItem.destCountryCode})</span>
                                </div>
                            </div>

                            {/* Raw Phenix JSON */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-bold text-base-content/60 uppercase tracking-wider">Raw Phenix Payload (ERP Response):</span>
                                    <button
                                        onClick={handleCopyJson}
                                        className="btn btn-xs btn-outline gap-1 font-mono"
                                    >
                                        <span className="material-symbols-outlined text-xs">
                                            {copiedJson ? 'check' : 'content_copy'}
                                        </span>
                                        {copiedJson ? 'Copied!' : 'Copy JSON'}
                                    </button>
                                </div>
                                <pre className="bg-neutral text-neutral-content p-3 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56">
                                    {JSON.stringify(selectedItem.rawRow || selectedItem, null, 2)}
                                </pre>
                            </div>
                        </div>

                        <div className="modal-action border-t border-base-200 pt-3">
                            <button onClick={() => setSelectedItem(null)} className="btn btn-sm btn-ghost">
                                {lang === 'ar' ? 'إغلاق' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhenixAuditLogsPage;
