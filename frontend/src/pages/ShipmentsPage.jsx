import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import ShipmentList from '../components/ShipmentList';
import BulkShipmentImportModal from '../components/BulkShipmentImportModal';
import PhenixSyncModal from '../components/PhenixSyncModal';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getRoleLabel } from '../utils/roleLabels';
import { organizationService } from '../services/api';

/**
 * ShipmentsPage — Target Logistics Global Consignment Command
 * Revamped with 100% design and architectural continuity with DashboardPage.
 */
const ShipmentsPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const { t, lang } = useLanguage();
    const isRTL = lang === 'ar';

    const userRole = user?.role || 'staff';
    const isSuperadmin = userRole === 'admin';
    const isTargetOwner = userRole === 'manager';
    const isTargetAccounting = userRole === 'accounting';
    const isTargetManagement = ['admin', 'manager', 'accounting', 'staff'].includes(userRole);

    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isPhenixModalOpen, setIsPhenixModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const initialOrgId = searchParams.get('org') || 'all';
    const initialStatus = searchParams.get('status') || 'all';
    const initialCarrier = searchParams.get('carrier') || searchParams.get('carrierCode') || 'all';
    const initialPeriod = searchParams.get('period') || 'all';
    
    const [selectedOrgId, setSelectedOrgId] = useState(initialOrgId);
    const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);
    const [customStartDate, setCustomStartDate] = useState(searchParams.get('startDate') || '');
    const [customEndDate, setCustomEndDate] = useState(searchParams.get('endDate') || '');
    const [isCustomDateOpen, setIsCustomDateOpen] = useState(Boolean(searchParams.get('startDate') || searchParams.get('endDate')));

    const [organizations, setOrganizations] = useState([
        { id: 'all', name: isRTL ? 'جميع الحسابات (نظرة شاملة)' : 'All Network Organizations', balance: 0 },
    ]);

    // Fetch live organizations from backend
    useEffect(() => {
        let isMounted = true;
        organizationService.getOrganizations()
            .then(res => {
                const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                if (list.length > 0 && isMounted) {
                    const totalBal = list.reduce((acc, o) => acc + (Number(o.balance) || 0), 0);
                    const mapped = list.map(o => ({
                        id: o.id,
                        name: o.name,
                        balance: Number(o.balance) || 0,
                    }));
                    setOrganizations([
                        { id: 'all', name: isRTL ? 'جميع الحسابات (نظرة شاملة)' : 'All Network Organizations', balance: totalBal },
                        ...mapped
                    ]);
                }
            })
            .catch(() => {
                // Keep initial state
            });
        return () => { isMounted = false; };
    }, [isRTL]);

    // Keep state in sync with URL
    useEffect(() => {
        const orgFromUrl = searchParams.get('org');
        if (orgFromUrl && orgFromUrl !== selectedOrgId) {
            setSelectedOrgId(orgFromUrl);
        }
        const periodFromUrl = searchParams.get('period');
        if (periodFromUrl && periodFromUrl !== selectedPeriod) {
            setSelectedPeriod(periodFromUrl);
        }
    }, [searchParams, selectedOrgId, selectedPeriod]);

    const handleOrgChange = (newOrgId) => {
        setSelectedOrgId(newOrgId);
        const newParams = new URLSearchParams(searchParams);
        if (newOrgId === 'all') {
            newParams.delete('org');
        } else {
            newParams.set('org', newOrgId);
        }
        setSearchParams(newParams);
    };

    const handlePeriodChange = (newPeriod) => {
        setSelectedPeriod(newPeriod);
        const newParams = new URLSearchParams(searchParams);
        if (newPeriod === 'all') {
            newParams.delete('period');
            newParams.delete('startDate');
            newParams.delete('endDate');
            setCustomStartDate('');
            setCustomEndDate('');
            setIsCustomDateOpen(false);
        } else if (newPeriod === 'custom') {
            newParams.set('period', 'custom');
            setIsCustomDateOpen(true);
        } else {
            newParams.set('period', newPeriod);
            newParams.delete('startDate');
            newParams.delete('endDate');
            setCustomStartDate('');
            setCustomEndDate('');
            setIsCustomDateOpen(false);
        }
        setSearchParams(newParams);
    };

    const handleCustomDateChange = (start, end) => {
        const newParams = new URLSearchParams(searchParams);
        newParams.set('period', 'custom');
        if (start) {
            setCustomStartDate(start);
            newParams.set('startDate', start);
        } else {
            setCustomStartDate('');
            newParams.delete('startDate');
        }
        if (end) {
            setCustomEndDate(end);
            newParams.set('endDate', end);
        } else {
            setCustomEndDate('');
            newParams.delete('endDate');
        }
        setSelectedPeriod('custom');
        setSearchParams(newParams);
    };

    const activeOrg = useMemo(() => {
        return organizations.find(o => o.id === selectedOrgId) || organizations[0];
    }, [organizations, selectedOrgId]);

    return (
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 py-3 space-y-5">
            
            {/* Command Header: Identity, Account Scope, and Actions */}
            <div className="bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                
                {/* Left: Icon, Title & Role Clearance */}
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined text-2xl">local_shipping</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-base-content">
                                {t('shipments_title', 'Consignment & Dispatch Center')}
                            </h1>
                            <span className="badge badge-primary text-[11px] font-black uppercase tracking-wider py-2">
                                {getRoleLabel(userRole)}
                            </span>
                            {isSuperadmin && <span className="badge badge-outline text-[10px] font-bold">Admin Clearance</span>}
                            {isTargetOwner && <span className="badge badge-warning text-[10px] font-bold">Executive Authority</span>}
                            {isTargetAccounting && <span className="badge badge-accent text-[10px] font-bold">Finance Controller</span>}
                        </div>
                        <p className="text-xs text-base-content/60 font-semibold mt-0.5">
                            {t('shipments_subtitle', 'Manage end-to-end consignment manifests, dual-carrier trade routes, and delivery triage.')}
                        </p>
                    </div>
                </div>

                {/* Right: Organization Scope Selector & Quick Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    
                    {/* Organization Dropdown (Matches Dashboard selector) */}
                    {isTargetManagement && (
                        <div className="form-control">
                            <label className="label py-0.5 px-1">
                                <span className="label-text text-[10.5px] font-black uppercase tracking-wider text-base-content/60">
                                    {isRTL ? 'نطاق الحساب المحدد' : 'Selected Account Scope'}
                                </span>
                            </label>
                            <select 
                                value={selectedOrgId} 
                                onChange={(e) => handleOrgChange(e.target.value)}
                                className="select select-bordered select-sm rounded-xl font-bold text-xs bg-base-100 text-base-content w-full sm:w-64"
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 sm:self-end">
                        {isTargetManagement && (
                            <button
                                type="button"
                                onClick={() => setIsPhenixModalOpen(true)}
                                className="btn btn-outline btn-accent btn-sm rounded-xl font-bold flex-1 sm:flex-initial gap-1.5"
                            >
                                <span className="material-symbols-outlined text-base">sync_alt</span>
                                {t('sync_phenix_erp', 'Sync Phenix')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsBulkModalOpen(true)}
                            className="btn btn-outline btn-sm rounded-xl font-bold flex-1 sm:flex-initial"
                        >
                            <span className="material-symbols-outlined text-base text-primary">upload_file</span>
                            {t('bulk_import_csv', 'Bulk Import')}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/shipment/new')}
                            className="btn btn-primary btn-sm rounded-xl font-extrabold shadow-sm flex-1 sm:flex-initial gap-1.5"
                        >
                            <span className="material-symbols-outlined text-base">add_circle</span>
                            {t('new_shipment', 'New Shipment')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Timeframe & Period Control Deck */}
            <div className="bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-lg">calendar_month</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-base-content">
                                {isRTL ? 'نطاق الفترة الزمنية للشحنات' : 'Consignment Manifest Period'}
                            </span>
                            <span className="badge badge-primary badge-outline badge-xs font-bold">
                                {selectedPeriod === 'today' && (isRTL ? 'اليوم' : 'Today')}
                                {selectedPeriod === '7days' && (isRTL ? 'آخر 7 أيام' : 'Past 7 Days')}
                                {selectedPeriod === 'this_month' && (isRTL ? 'هذا الشهر' : 'This Month')}
                                {selectedPeriod === 'last_month' && (isRTL ? 'الشهر الماضي' : 'Last Month')}
                                {selectedPeriod === 'all' && (isRTL ? 'جميع البيانات التاريخية' : 'All-Time')}
                                {selectedPeriod === 'custom' && (isRTL ? 'نطاق مخصص' : 'Custom Range')}
                            </span>
                        </div>
                        <p className="text-[11px] text-base-content/60 font-medium mt-0.5">
                            {selectedPeriod === 'today' && (isRTL ? 'عرض الشحنات والمنافيست المسجلة اليوم فقط' : 'Displaying consignments recorded today')}
                            {selectedPeriod === '7days' && (isRTL ? 'عرض الشحنات لآخر 7 أيام تشغيلية' : 'Displaying consignments for the past 7 operational days')}
                            {selectedPeriod === 'this_month' && (isRTL ? 'عرض شحنات دورة الشهر الحالي' : 'Displaying consignments for current monthly operational cycle')}
                            {selectedPeriod === 'last_month' && (isRTL ? 'عرض شحنات الشهر الماضي كاملاً' : 'Displaying consignments for full previous calendar month')}
                            {selectedPeriod === 'all' && (isRTL ? 'نظرة شاملة لكافة الشحنات المسجلة تاريخياً' : 'Complete historical consignment manifest')}
                            {selectedPeriod === 'custom' && (isRTL ? `الفترة المحددة: ${customStartDate || 'من البداية'} إلى ${customEndDate || 'اليوم'}` : `Selected range: ${customStartDate || 'Start'} to ${customEndDate || 'End'}`)}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Preset Period Buttons */}
                    <div className="join w-full sm:w-auto overflow-x-auto">
                        {[
                            { id: 'today', label: isRTL ? 'اليوم' : 'Today', icon: 'today' },
                            { id: '7days', label: isRTL ? '7 أيام' : '7 Days', icon: 'date_range' },
                            { id: 'this_month', label: isRTL ? 'هذا الشهر' : 'This Month', icon: 'calendar_today' },
                            { id: 'last_month', label: isRTL ? 'الشهر الماضي' : 'Last Month', icon: 'history' },
                            { id: 'all', label: isRTL ? 'الكل' : 'All Time', icon: 'all_inclusive' },
                            { id: 'custom', label: isRTL ? 'مخصص' : 'Custom', icon: 'tune' },
                        ].map((p) => (
                            <button
                                key={p.id}
                                onClick={() => handlePeriodChange(p.id)}
                                className={`btn btn-xs sm:btn-sm join-item font-bold text-xs gap-1 ${
                                    selectedPeriod === p.id ? 'btn-primary shadow-sm' : 'btn-ghost border-base-200 text-base-content/70'
                                }`}
                            >
                                <span className="material-symbols-outlined text-sm">{p.icon}</span>
                                <span>{p.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Custom Date Pickers Popover / Controls */}
                    {(selectedPeriod === 'custom' || isCustomDateOpen) && (
                        <div className="flex items-center gap-1.5 bg-base-200/70 p-1.5 rounded-xl border border-base-300 w-full sm:w-auto animate-in fade-in duration-200">
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => handleCustomDateChange(e.target.value, customEndDate)}
                                className="input input-bordered input-xs rounded-lg font-mono text-xs bg-base-100"
                                title={isRTL ? 'تاريخ البدء' : 'Start Date'}
                            />
                            <span className="text-xs font-bold text-base-content/50">{isRTL ? '←' : '→'}</span>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => handleCustomDateChange(customStartDate, e.target.value)}
                                className="input input-bordered input-xs rounded-lg font-mono text-xs bg-base-100"
                                title={isRTL ? 'تاريخ الانتهاء' : 'End Date'}
                            />
                            {(customStartDate || customEndDate) && (
                                <button
                                    type="button"
                                    onClick={() => handlePeriodChange('all')}
                                    className="btn btn-ghost btn-xs text-base-content/60 hover:text-error"
                                    title={isRTL ? 'مسح' : 'Clear'}
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Active Account Scope Alert Ribbon (Visible when filtering to a specific client organization) */}
            {selectedOrgId !== 'all' && (
                <div className="alert bg-primary/5 border border-primary/20 rounded-2xl py-2.5 px-4 flex items-center justify-between text-xs animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5 font-bold text-base-content flex-wrap">
                        <span className="material-symbols-outlined text-primary text-base">apartment</span>
                        <span>{isRTL ? 'تصفية الشحنات لحساب:' : 'Filtered to client:'} <strong className="text-primary">{activeOrg.name}</strong></span>
                        {activeOrg.balance !== undefined && (
                            <span className="badge badge-sm badge-outline font-mono">
                                {isRTL ? `الرصيد القائم: ${activeOrg.balance.toFixed(3)} د.ك` : `Ledger: ${activeOrg.balance.toFixed(3)} KWD`}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to={`/dashboard?org=${selectedOrgId}`} className="btn btn-ghost btn-xs text-primary font-bold">
                            {isRTL ? 'لوحة تحكم الحساب' : 'Account Cockpit'}
                        </Link>
                        <button 
                            onClick={() => handleOrgChange('all')}
                            className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content font-bold"
                        >
                            {isRTL ? 'إلغاء التصفية (عرض الكل)' : 'Clear Filter (Show All)'}
                        </button>
                    </div>
                </div>
            )}

            {/* Revamped Shipment List Component with Canonical Continuity */}
            <ShipmentList 
                key={`${refreshKey}-${selectedOrgId}-${initialStatus}-${initialCarrier}-${selectedPeriod}-${customStartDate}-${customEndDate}`} 
                organizationId={selectedOrgId}
                initialFilter={initialStatus}
                period={selectedPeriod}
                startDate={customStartDate}
                endDate={customEndDate}
            />

            {/* Bulk Shipment Import Modal */}
            <BulkShipmentImportModal
                isOpen={isBulkModalOpen}
                onClose={() => setIsBulkModalOpen(false)}
                onImportSuccess={() => setRefreshKey(prev => prev + 1)}
            />

            {/* Phenix ERP Ingestion & Synchronization Modal */}
            <PhenixSyncModal
                isOpen={isPhenixModalOpen}
                onClose={() => setIsPhenixModalOpen(false)}
                onSyncSuccess={() => setRefreshKey(prev => prev + 1)}
            />
        </div>
    );
};

export default ShipmentsPage;
