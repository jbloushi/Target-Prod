import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { fleetService } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import StatusBadge from '../../components/common/StatusBadge';
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

export const FleetDispatchV2Page = () => {
    const { enqueueSnackbar } = useSnackbar();
    const { lang } = useLanguage();
    const { user } = useAuth();
    const isRTL = lang === 'ar';

    const canManageFleet = hasCapability(user?.role, CAPABILITIES.MANAGE_FLEET);
    const canSettleCod = hasCapability(user?.role, CAPABILITIES.MANAGE_PAYMENTS);

    const [activeTab, setActiveTab] = useState('dispatch'); // 'dispatch' | 'runs' | 'vehicles'
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // Deck data
    const [clusters, setClusters] = useState({});
    const [totalPending, setTotalPending] = useState(0);
    const [drivers, setDrivers] = useState([]);
    const [vehicles, setVehicles] = useState([]);

    // Selection
    const [selectedZone, setSelectedZone] = useState('ALL');
    const [selectedShipmentIds, setSelectedShipmentIds] = useState([]);

    // Create Run modal
    const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [selectedVehicleId, setSelectedVehicleId] = useState('');
    const [runNotes, setRunNotes] = useState('');
    const [isSubmittingRun, setIsSubmittingRun] = useState(false);

    // Runs data
    const [runs, setRuns] = useState([]);
    const [runsLoading, setRunsLoading] = useState(false);
    const [selectedRun, setSelectedRun] = useState(null);

    // Vehicle modal
    const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
    const [newVehicle, setNewVehicle] = useState({
        plateNumber: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        capacityParcels: 50,
        capacityWeightKg: 500
    });

    const fetchDeck = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError('');
            const res = await fleetService.getDispatchDeck();
            if (res?.success && res.data) {
                setClusters(res.data.clusters || {});
                setTotalPending(res.data.totalPending || 0);
                setDrivers(res.data.drivers || []);
                setVehicles(res.data.vehicles || []);
            } else {
                setLoadError(res?.error || (isRTL ? 'تعذر تحميل لوحة توزيع الأسطول.' : 'Failed loading fleet dispatch deck.'));
            }
        } catch (err) {
            setLoadError(err?.response?.data?.error || err?.message || (isRTL ? 'تعذر تحميل لوحة توزيع الأسطول.' : 'Failed loading fleet dispatch deck.'));
        } finally {
            setLoading(false);
        }
    }, [isRTL]);

    const fetchRuns = useCallback(async () => {
        try {
            setRunsLoading(true);
            const res = await fleetService.getRuns({ limit: 50 });
            if (res?.success && res.data) {
                setRuns(res.data.runs || []);
            }
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (isRTL ? 'فشل تحميل المسارات' : 'Failed loading delivery runs'), { variant: 'error' });
        } finally {
            setRunsLoading(false);
        }
    }, [enqueueSnackbar, isRTL]);

    useEffect(() => {
        fetchDeck();
        fetchRuns();
    }, [fetchDeck, fetchRuns]);

    const handleSelectAllInZone = (zoneKey) => {
        const list = clusters[zoneKey] || [];
        const idsInZone = list.map((s) => s.id);
        const allSelected = idsInZone.every((id) => selectedShipmentIds.includes(id));
        if (allSelected) {
            setSelectedShipmentIds((prev) => prev.filter((id) => !idsInZone.includes(id)));
        } else {
            setSelectedShipmentIds((prev) => Array.from(new Set([...prev, ...idsInZone])));
        }
    };

    const handleToggleShipment = (id) => {
        setSelectedShipmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const handleCreateRun = async () => {
        if (!canManageFleet) return;
        if (!selectedDriverId) {
            enqueueSnackbar(isRTL ? 'يرجى اختيار المندوب' : 'Please select a driver for this run', { variant: 'warning' });
            return;
        }
        if (selectedShipmentIds.length === 0) {
            enqueueSnackbar(isRTL ? 'يرجى تحديد شحنة واحدة على الأقل' : 'Please select at least one shipment', { variant: 'warning' });
            return;
        }

        try {
            setIsSubmittingRun(true);
            const res = await fleetService.createRun({
                driverId: selectedDriverId,
                vehicleId: selectedVehicleId || null,
                zone: selectedZone !== 'ALL' ? selectedZone : 'MULTI_ZONE',
                shipmentIds: selectedShipmentIds,
                notes: runNotes
            });
            enqueueSnackbar(res?.message || (isRTL ? 'تم إنشاء وإرسال المسار بنجاح' : 'Delivery run created & dispatched!'), { variant: 'success' });
            setIsDispatchModalOpen(false);
            setSelectedShipmentIds([]);
            setRunNotes('');
            fetchDeck();
            fetchRuns();
            setActiveTab('runs');
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (isRTL ? 'فشل إنشاء المسار' : 'Failed creating delivery run'), { variant: 'error' });
        } finally {
            setIsSubmittingRun(false);
        }
    };

    const handleSettleCod = async (runId) => {
        if (!canSettleCod) return;
        try {
            const res = await fleetService.settleRunCod(runId);
            enqueueSnackbar(res?.message || (isRTL ? 'تم توريد التحصيل النقدي للخزينة' : 'COD settled into vault!'), { variant: 'success' });
            fetchRuns();
            if (selectedRun?.id === runId) setSelectedRun(null);
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (isRTL ? 'فشل تسوية التحصيل' : 'Failed settling run COD'), { variant: 'error' });
        }
    };

    const handleAddVehicle = async () => {
        if (!canManageFleet) return;
        if (!newVehicle.plateNumber.trim()) {
            enqueueSnackbar(isRTL ? 'رقم اللوحة مطلوب' : 'Plate number is required', { variant: 'warning' });
            return;
        }
        try {
            await fleetService.createVehicle(newVehicle);
            enqueueSnackbar(isRTL ? 'تمت إضافة المركبة للأسطول' : 'Vehicle added to fleet', { variant: 'success' });
            setIsVehicleModalOpen(false);
            setNewVehicle({ plateNumber: '', make: '', model: '', year: new Date().getFullYear(), capacityParcels: 50, capacityWeightKg: 500 });
            fetchDeck();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (isRTL ? 'فشل إضافة المركبة' : 'Failed adding vehicle'), { variant: 'error' });
        }
    };

    const filteredClusters = Object.entries(clusters).filter(([zoneKey]) => selectedZone === 'ALL' || zoneKey === selectedZone);

    return (
        <div
            dir={isRTL ? 'rtl' : 'ltr'}
            className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden"
        >
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/80 dark:bg-sky-950/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-base text-primary shrink-0" aria-hidden="true">local_shipping</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {isRTL ? 'لوحة إدارة الأسطول والتوزيع المطورة V2' : 'Fleet Control Tower V2'}
                        </span>
                    </div>
                    <Link to="/fleet/dispatch" className="font-bold text-primary dark:text-sky-400 hover:underline shrink-0">
                        {isRTL ? 'العودة إلى V1' : 'Switch to V1'}
                    </Link>
                </div>

                {/* Page Header */}
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-2xl" aria-hidden="true">local_shipping</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                                {isRTL ? 'برج مراقبة الأسطول والتوزيع' : 'Fleet Control Tower'}
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                                {isRTL ? 'تجميع المناطق تلقائياً، مسارات المندوبين، وتسوية التحصيل النقدي' : 'Zone & PACI dispatch clustering, driver runsheets & COD settlement'}
                            </p>
                        </div>
                    </div>

                    {/* Tab Switcher */}
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80 w-full md:w-auto">
                        {[
                            { id: 'dispatch', label: isRTL ? `التوزيع (${totalPending})` : `Dispatch (${totalPending})` },
                            { id: 'runs', label: isRTL ? `المسارات (${runs.length})` : `Runs (${runs.length})` },
                            { id: 'vehicles', label: isRTL ? `المركبات (${vehicles.length})` : `Fleet (${vehicles.length})` }
                        ].map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                    setActiveTab(t.id);
                                    if (t.id === 'runs') fetchRuns();
                                }}
                                className={`min-h-[40px] px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer truncate ${
                                    activeTab === t.id
                                        ? 'bg-white dark:bg-slate-900 text-primary dark:text-sky-400 shadow-2xs'
                                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </header>

                {loadError && (
                    <ErrorBannerV2 message={loadError} onRetry={fetchDeck} isRetrying={loading} />
                )}

                {/* KPI Summary */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <MetricCardV2
                        title={isRTL ? 'بانتظار التوزيع' : 'Pending Dispatch'}
                        value={totalPending}
                        icon="inventory_2"
                        tone="info"
                    />
                    <MetricCardV2
                        title={isRTL ? 'المسارات النشطة' : 'Delivery Runs'}
                        value={runs.length}
                        icon="route"
                        tone="neutral"
                    />
                    <MetricCardV2
                        title={isRTL ? 'المندوبون المتاحون' : 'Active Drivers'}
                        value={drivers.length}
                        icon="badge"
                        tone="success"
                    />
                    <MetricCardV2
                        title={isRTL ? 'مركبات الأسطول' : 'Fleet Vehicles'}
                        value={vehicles.length}
                        icon="directions_car"
                        tone="warning"
                    />
                </div>

                {/* TAB 1: ZONE DISPATCH */}
                {activeTab === 'dispatch' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1">
                                <button
                                    type="button"
                                    onClick={() => setSelectedZone('ALL')}
                                    className={`min-h-[36px] px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                                        selectedZone === 'ALL'
                                            ? 'bg-primary text-white'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    {isRTL ? `الكل (${totalPending})` : `All Zones (${totalPending})`}
                                </button>
                                {Object.keys(clusters).map((z) => (
                                    <button
                                        key={z}
                                        type="button"
                                        onClick={() => setSelectedZone(z)}
                                        className={`min-h-[36px] px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                                            selectedZone === z
                                                ? 'bg-primary text-white'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        {z.replace(/_/g, ' ')} ({clusters[z]?.length || 0})
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={fetchDeck}
                                    aria-label={isRTL ? 'تحديث' : 'Refresh'}
                                    className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                                >
                                    <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`} aria-hidden="true">sync</span>
                                </button>

                                {canManageFleet && (
                                    <button
                                        type="button"
                                        disabled={selectedShipmentIds.length === 0}
                                        onClick={() => setIsDispatchModalOpen(true)}
                                        className="min-h-[40px] px-4 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <span className="material-symbols-outlined text-base" aria-hidden="true">add</span>
                                        <span>{isRTL ? `توزيع (${selectedShipmentIds.length})` : `Dispatch (${selectedShipmentIds.length})`}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
                                ))}
                            </div>
                        ) : totalPending === 0 ? (
                            <EmptyStateV2
                                icon="check_circle"
                                title={isRTL ? 'لا توجد شحنات بانتظار التوزيع' : 'All Clear! No Pending Shipments'}
                                description={isRTL ? 'تم إسناد جميع الشحنات المعتمدة إلى مسارات التوصيل.' : 'All approved shipments have been assigned to delivery runs.'}
                            />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredClusters.map(([zoneKey, shipments]) => {
                                    const totalCod = shipments.reduce((sum, s) => sum + (Number(s.codAmount) || 0), 0);
                                    const allSelected = shipments.every((s) => selectedShipmentIds.includes(s.id));

                                    return (
                                        <section
                                            key={zoneKey}
                                            className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden"
                                        >
                                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="material-symbols-outlined text-primary text-lg shrink-0" aria-hidden="true">location_on</span>
                                                    <h2 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base truncate">
                                                        {zoneKey.replace(/_/g, ' ')}
                                                    </h2>
                                                </div>
                                                {canManageFleet && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectAllInZone(zoneKey)}
                                                        className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer shrink-0"
                                                    >
                                                        {allSelected ? (isRTL ? 'إلغاء الكل' : 'Deselect All') : (isRTL ? 'تحديد الكل' : 'Select All')}
                                                    </button>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 text-xs border-b border-slate-100 dark:border-slate-800">
                                                <div>
                                                    <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'المحطات:' : 'Stops:'}</span>{' '}
                                                    <strong className="text-slate-900 dark:text-white tabular-nums">{shipments.length}</strong>
                                                </div>
                                                <div className="text-end">
                                                    <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'COD:' : 'COD:'}</span>{' '}
                                                    <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">{totalCod.toFixed(3)} KWD</strong>
                                                </div>
                                            </div>

                                            <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto flex-1">
                                                {shipments.map((s) => {
                                                    const isSelected = selectedShipmentIds.includes(s.id);
                                                    const dest = s.destination || {};
                                                    return (
                                                        <div
                                                            key={s.id}
                                                            onClick={() => canManageFleet && handleToggleShipment(s.id)}
                                                            className={`p-2.5 rounded-xl flex items-start gap-2.5 my-1 transition-colors ${
                                                                canManageFleet ? 'cursor-pointer' : ''
                                                            } ${
                                                                isSelected
                                                                    ? 'bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800'
                                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                                            }`}
                                                        >
                                                            {canManageFleet && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={() => {}}
                                                                    className="mt-1 rounded text-primary focus:ring-primary"
                                                                />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="font-mono text-xs font-bold text-primary dark:text-sky-400 truncate">
                                                                        {s.trackingNumber}
                                                                    </span>
                                                                    {Number(s.codAmount) > 0 && (
                                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold tabular-nums shrink-0">
                                                                            {Number(s.codAmount).toFixed(3)} KWD
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                                                                    {dest.contactPerson || dest.name || 'Recipient'} {dest.phone ? `• ${dest.phone}` : ''}
                                                                </p>
                                                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                                    {dest.formattedAddress || `${dest.area || dest.city || ''} ${dest.block ? `Blk ${dest.block}` : ''}`}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 2: DELIVERY RUNS */}
                {activeTab === 'runs' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-2">
                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                {isRTL ? 'مسارات التوصيل النشطة والمرسلة' : 'Active & Dispatched Delivery Runs'}
                            </h2>
                            <button
                                type="button"
                                onClick={fetchRuns}
                                aria-label={isRTL ? 'تحديث المسارات' : 'Refresh runs'}
                                className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center cursor-pointer"
                            >
                                <span className={`material-symbols-outlined text-lg ${runsLoading ? 'animate-spin' : ''}`} aria-hidden="true">sync</span>
                            </button>
                        </div>

                        {runs.length === 0 ? (
                            <EmptyStateV2
                                icon="route"
                                title={isRTL ? 'لا توجد مسارات مسجلة' : 'No Delivery Runs Found'}
                                description={isRTL ? 'قم بتحديد شحنات من تبويب التوزيع لإنشاء مسار جديد.' : 'Select shipments from the Dispatch tab to create a delivery run.'}
                            />
                        ) : (
                            <>
                                {/* Mobile Card List (0px overflow on 390px) */}
                                <div className="space-y-3 md:hidden">
                                    {runs.map((r) => {
                                        const progressPercent = r.totalStops > 0 ? Math.round((r.completedStops / r.totalStops) * 100) : 0;
                                        return (
                                            <article key={r.id} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono font-bold text-sm text-primary dark:text-sky-400">{r.runNumber}</span>
                                                    <StatusBadge status={r.status} size="xs" />
                                                </div>
                                                <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                                                    <div><strong>{r.driver?.name || (isRTL ? 'غير مسند' : 'Unassigned')}</strong> • {r.zone}</div>
                                                    <div className="flex justify-between text-slate-500 dark:text-slate-400 tabular-nums">
                                                        <span>{isRTL ? 'التقدم:' : 'Progress:'} {r.completedStops}/{r.totalStops} ({progressPercent}%)</span>
                                                        <span className="text-emerald-700 dark:text-emerald-400 font-bold">{Number(r.totalCodCollected || 0).toFixed(3)} KWD</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            const res = await fleetService.getRunDetails(r.id);
                                                            if (res?.success) setSelectedRun(res.data);
                                                        }}
                                                        className="flex-1 min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
                                                    >
                                                        {isRTL ? 'عرض المحطات' : 'View Stops'}
                                                    </button>
                                                    {canSettleCod && Number(r.totalCodCollected) > 0 && !r.codSettled && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSettleCod(r.id)}
                                                            className="flex-1 min-h-[40px] rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                                                        >
                                                            {isRTL ? 'تسوية COD' : 'Settle COD'}
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>

                                {/* Desktop Table */}
                                <div className="hidden md:block rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-start text-sm">
                                            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-5 py-3.5 text-start">{isRTL ? 'رقم المسار' : 'Run #'}</th>
                                                    <th className="px-5 py-3.5 text-start">{isRTL ? 'المندوب والمركبة' : 'Driver & Van'}</th>
                                                    <th className="px-5 py-3.5 text-start">{isRTL ? 'المنطقة' : 'Zone'}</th>
                                                    <th className="px-5 py-3.5 text-start">{isRTL ? 'الإنجاز' : 'Progress'}</th>
                                                    <th className="px-5 py-3.5 text-start">{isRTL ? 'التحصيل (COD)' : 'COD Exp / Col'}</th>
                                                    <th className="px-5 py-3.5 text-start">{isRTL ? 'الحالة' : 'Status'}</th>
                                                    <th className="px-5 py-3.5 text-end">{isRTL ? 'إجراءات' : 'Actions'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {runs.map((r) => {
                                                    const progressPercent = r.totalStops > 0 ? Math.round((r.completedStops / r.totalStops) * 100) : 0;
                                                    return (
                                                        <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                            <td className="px-5 py-3.5 font-mono font-bold text-primary dark:text-sky-400">{r.runNumber}</td>
                                                            <td className="px-5 py-3.5">
                                                                <div className="font-semibold text-slate-900 dark:text-white">{r.driver?.name || (isRTL ? 'غير مسند' : 'Unassigned')}</div>
                                                                <div className="text-xs text-slate-500 dark:text-slate-400">{r.vehicle?.plateNumber || (isRTL ? 'بدون مركبة' : 'No vehicle')}</div>
                                                            </td>
                                                            <td className="px-5 py-3.5 text-xs font-semibold">{r.zone}</td>
                                                            <td className="px-5 py-3.5">
                                                                <div className="w-32">
                                                                    <div className="flex justify-between text-xs mb-1 tabular-nums">
                                                                        <span>{r.completedStops}/{r.totalStops}</span>
                                                                        <span>{progressPercent}%</span>
                                                                    </div>
                                                                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                                                                        <div className="bg-primary h-1.5 rounded-full" style={{ width: `${progressPercent}%` }} />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-3.5 text-xs tabular-nums">
                                                                <div><span className="text-slate-500">{isRTL ? 'متوقع:' : 'Exp:'}</span> {Number(r.totalCodExpected || 0).toFixed(3)} KWD</div>
                                                                <div className="text-emerald-700 dark:text-emerald-400 font-bold">{isRTL ? 'محصل:' : 'Col:'} {Number(r.totalCodCollected || 0).toFixed(3)} KWD</div>
                                                            </td>
                                                            <td className="px-5 py-3.5"><StatusBadge status={r.status} size="xs" /></td>
                                                            <td className="px-5 py-3.5 text-end space-x-2 rtl:space-x-reverse">
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        const res = await fleetService.getRunDetails(r.id);
                                                                        if (res?.success) setSelectedRun(res.data);
                                                                    }}
                                                                    aria-label={isRTL ? 'عرض المحطات' : 'View Run Stops'}
                                                                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                                                                >
                                                                    <span className="material-symbols-outlined text-base" aria-hidden="true">visibility</span>
                                                                </button>
                                                                {canSettleCod && Number(r.totalCodCollected) > 0 && !r.codSettled && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSettleCod(r.id)}
                                                                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                                                                    >
                                                                        {isRTL ? 'تسوية COD' : 'Settle COD'}
                                                                    </button>
                                                                )}
                                                                {r.codSettled && (
                                                                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                                                        {isRTL ? '✓ مسوى' : '✓ Settled'}
                                                                    </span>
                                                                )}
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
                )}

                {/* TAB 3: VEHICLES */}
                {activeTab === 'vehicles' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-2">
                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                {isRTL ? 'مركبات الأسطول' : 'Fleet Vans & Vehicles'}
                            </h2>
                            {canManageFleet && (
                                <button
                                    type="button"
                                    onClick={() => setIsVehicleModalOpen(true)}
                                    className="min-h-[40px] px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">add</span>
                                    <span>{isRTL ? 'إضافة مركبة' : 'Add Vehicle'}</span>
                                </button>
                            )}
                        </div>

                        {vehicles.length === 0 ? (
                            <EmptyStateV2
                                icon="directions_car"
                                title={isRTL ? 'لا توجد مركبات مسجلة' : 'No Vehicles Registered'}
                                description={isRTL ? 'أضف مركبات الأسطول لتخصيصها لمسارات التوصيل.' : 'Register fleet vehicles to assign them to delivery runs.'}
                            />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {vehicles.map((v) => (
                                    <article key={v.id} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-xl" aria-hidden="true">local_shipping</span>
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">{v.plateNumber}</h3>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{v.make} {v.model} ({v.year || 2026})</p>
                                                </div>
                                            </div>
                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 text-xs font-bold shrink-0">
                                                {v.status}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs pt-2.5 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 tabular-nums">
                                            <div>{isRTL ? 'السعة:' : 'Capacity:'} <strong>{v.capacityParcels}</strong></div>
                                            <div>{isRTL ? 'الوزن:' : 'Max Weight:'} <strong>{v.capacityWeightKg} kg</strong></div>
                                            <div className="truncate">{isRTL ? 'السائق:' : 'Driver:'} <strong>{v.driver?.name || '—'}</strong></div>
                                            <div>{isRTL ? 'المسارات:' : 'Runs:'} <strong>{v._count?.runs || 0}</strong></div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Dispatch Run Modal */}
            {isDispatchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div role="dialog" aria-modal="true" className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                {isRTL ? `إرسال مسار توصيل (${selectedShipmentIds.length} طرود)` : `Dispatch Delivery Run (${selectedShipmentIds.length} Parcels)`}
                            </h3>
                            <button type="button" onClick={() => setIsDispatchModalOpen(false)} className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'تعيين المندوب *' : 'Assign Driver *'}</label>
                                <select
                                    value={selectedDriverId}
                                    onChange={(e) => setSelectedDriverId(e.target.value)}
                                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                >
                                    <option value="">{isRTL ? 'اختر مندوب...' : 'Select a Driver...'}</option>
                                    {drivers.map((d) => (
                                        <option key={d.id} value={d.id}>{d.name} ({d.phone || '—'})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'المركبة (اختياري)' : 'Assign Vehicle (Optional)'}</label>
                                <select
                                    value={selectedVehicleId}
                                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                >
                                    <option value="">{isRTL ? 'اختر مركبة...' : 'Select a Vehicle...'}</option>
                                    {vehicles.map((v) => (
                                        <option key={v.id} value={v.id}>{v.plateNumber} - {v.make} {v.model}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'ملاحظات المسار' : 'Run Notes'}</label>
                                <textarea
                                    rows={3}
                                    value={runNotes}
                                    onChange={(e) => setRunNotes(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button type="button" onClick={() => setIsDispatchModalOpen(false)} className="min-h-[44px] px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="button" disabled={isSubmittingRun} onClick={handleCreateRun} className="min-h-[44px] px-5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {isSubmittingRun ? (isRTL ? 'جاري الإنشاء...' : 'Creating...') : (isRTL ? 'تأكيد وإرسال' : 'Confirm & Dispatch')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Run Details Drawer */}
            {selectedRun && (
                <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/70 backdrop-blur-xs">
                    <div role="dialog" aria-modal="true" className="w-full max-w-xl h-full bg-white dark:bg-slate-900 shadow-2xl p-5 sm:p-6 overflow-y-auto space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div>
                                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white font-mono">{selectedRun.runNumber}</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedRun.driver?.name} • {selectedRun.zone}</p>
                            </div>
                            <button type="button" onClick={() => setSelectedRun(null)} className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                                <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
                            </button>
                        </div>
                        <div className="space-y-2.5">
                            {selectedRun.shipments?.map((s, idx) => {
                                const dest = s.destination || {};
                                return (
                                    <div key={s.id} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
                                        <span className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0">{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-xs font-bold text-primary dark:text-sky-400 truncate">{s.trackingNumber}</span>
                                                <StatusBadge status={s.status} size="xs" />
                                            </div>
                                            <p className="text-xs font-semibold text-slate-900 dark:text-white mt-1 truncate">
                                                {dest.contactPerson || dest.name} {dest.phone ? `(${dest.phone})` : ''}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 break-words">{dest.formattedAddress}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Vehicle Modal */}
            {isVehicleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div role="dialog" aria-modal="true" className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                            {isRTL ? 'تسجيل مركبة أسطول' : 'Register Fleet Vehicle'}
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'رقم اللوحة *' : 'Plate Number *'}</label>
                                <input
                                    type="text"
                                    value={newVehicle.plateNumber}
                                    onChange={(e) => setNewVehicle({ ...newVehicle, plateNumber: e.target.value })}
                                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'الشركة المصنعة' : 'Make'}</label>
                                    <input
                                        type="text"
                                        value={newVehicle.make}
                                        onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
                                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'الموديل' : 'Model'}</label>
                                    <input
                                        type="text"
                                        value={newVehicle.model}
                                        onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2.5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'السنة' : 'Year'}</label>
                                    <input
                                        type="number"
                                        value={newVehicle.year}
                                        onChange={(e) => setNewVehicle({ ...newVehicle, year: Number(e.target.value) })}
                                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm tabular-nums"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'السعة (طرود)' : 'Parcels Cap.'}</label>
                                    <input
                                        type="number"
                                        value={newVehicle.capacityParcels}
                                        onChange={(e) => setNewVehicle({ ...newVehicle, capacityParcels: Number(e.target.value) })}
                                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm tabular-nums"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRTL ? 'الوزن (كجم)' : 'Weight (kg)'}</label>
                                    <input
                                        type="number"
                                        value={newVehicle.capacityWeightKg}
                                        onChange={(e) => setNewVehicle({ ...newVehicle, capacityWeightKg: Number(e.target.value) })}
                                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm tabular-nums"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button type="button" onClick={() => setIsVehicleModalOpen(false)} className="min-h-[44px] px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="button" onClick={handleAddVehicle} className="min-h-[44px] px-5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer">
                                {isRTL ? 'حفظ المركبة' : 'Save Vehicle'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FleetDispatchV2Page;
