import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { shipmentService, financeService, userService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import StatusBadge from '../../components/common/StatusBadge';
import ProofOfDeliveryModal from '../../components/ProofOfDeliveryModal';
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

const QrScanner = lazy(() => import('react-qr-scanner'));

const GOVERNORATE_MAP = {
    Capital: [
        'kuwait city', 'sharq', 'dasman', 'mirqab', 'jibla', 'salhiya', 'bneid al-gar', 'bneid al gar',
        'kaifan', 'mansouriya', 'abdullah al-salem', 'nuzha', 'faiha', 'shamiya', 'rawda', 'adailiya',
        'khaldiya', 'qadsiya', 'yarmouk', 'shuwaikh', 'sulaibikhat', 'doha', 'ghernata', 'qairawan',
        'العاصمة', 'مدينة الكويت', 'الشرق', 'دسمان', 'المرقاب', 'القبلة', 'الصالحية', 'بنيد القار',
        'كيفان', 'المنصورية', 'عبدالله السالم', 'النزهة', 'الفيحاء', 'الشامية', 'الروضة', 'العديلية'
    ],
    Hawalli: [
        'hawalli', 'salmiya', 'rumaithiya', 'jabriya', 'mishref', 'bayan', 'salwa', 'bidaa', 'shaab',
        'maidan hawalli', 'hateen', 'hitteen', 'al-siddiq', 'siddiq', 'al-salam', 'salam', 'al-zahra',
        'zahra', 'shuhada', 'حولي', 'السالمية', 'الرميثية', 'الجابرية', 'مشرف', 'بيان', 'سلوى', 'البدع', 'الشعب'
    ],
    Farwaniya: [
        'farwaniya', 'khaitan', 'omariya', 'rabiya', 'ishbilya', 'jleeb', 'andalus', 'riggae', 'rehab',
        'sabah al-nasser', 'abdullah al-mubarak', 'dajeej', 'ardiya', 'الفروانية', 'خيطان', 'العمرية', 'الرابية',
        'إشبيلية', 'الأندلس', 'الرقعي', 'الرحاب', 'صباح الناصر', 'عبدالله المبارك', 'الضجيج', 'العارضية'
    ],
    'Mubarak Al-Kabeer': [
        'sabah al-salem', 'messila', 'abu fatira', 'fnaitees', 'qurain', 'qusour', 'adan', 'mubarak al-kabeer',
        'مبارك الكبير', 'صباح السالم', 'المسيلة', 'أبو فطيرة', 'الفنيطيس', 'القرين', 'القصور', 'العدان'
    ],
    Ahmadi: [
        'ahmadi', 'fahaheel', 'mangaf', 'abu halifa', 'mahboula', 'egaila', 'sabahiya', 'riqqa',
        'hadiya', 'fintas', 'wafra', 'khiran', 'الأحمدي', 'الفحيحيل', 'المنقف', 'أبو حليفة', 'المهبولة', 'العقيلة'
    ],
    Jahra: [
        'jahra', 'saad al-abdullah', 'sulaibiya', 'oyoun', 'waha', 'nasseem', 'taima', 'qasr', 'mutlaa',
        'الجهراء', 'سعد العبدالله', 'الصليبية', 'العيون', 'الواحة', 'النسيم', 'تيماء', 'القصر', 'المطلاع'
    ]
};

const resolveGovernorate = (addressObj = {}) => {
    const text = `${addressObj.governorate || ''} ${addressObj.state || ''} ${addressObj.city || ''} ${addressObj.street || ''} ${addressObj.addressLine1 || ''} ${addressObj.area || ''} ${addressObj.formattedAddress || ''}`.toLowerCase();
    for (const [gov, keywords] of Object.entries(GOVERNORATE_MAP)) {
        if (text.includes(gov.toLowerCase()) || keywords.some((kw) => text.includes(kw))) return gov;
    }
    return 'Other';
};

const getPartyAddress = (party = {}) => {
    return party.formattedAddress || [party.addressLine1 || party.street, party.area, party.city, party.country].filter(Boolean).join(', ') || 'Kuwait';
};

const generateMultiStopUrl = (shipmentList, isDeliverMode) => {
    if (!shipmentList || shipmentList.length === 0) return null;
    const destinations = shipmentList.map((s) => {
        const party = isDeliverMode ? (s.destination || s.receiver || {}) : (s.origin || s.sender || {});
        return encodeURIComponent(getPartyAddress(party));
    });
    if (destinations.length === 1) {
        return `https://www.google.com/maps/dir/?api=1&destination=${destinations[0]}`;
    }
    const finalStop = destinations[destinations.length - 1];
    const waypoints = destinations.slice(0, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${finalStop}&waypoints=${waypoints}&travelmode=driving`;
};

/**
 * Normalize phone digits for WhatsApp deep links.
 * Preserves international numbers like +201040957289 while adding 965 for 8-digit Kuwait local numbers.
 */
const formatWhatsAppDigits = (rawPhone) => {
    const digits = String(rawPhone || '').replace(/\D/g, '').replace(/^00/, '');
    if (!digits) return '';
    if (digits.length === 8) return `965${digits}`;
    return digits;
};

export const DriverPickupV2Page = () => {
    const { logout, user } = useAuth();
    const { lang } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();
    const isRTL = lang === 'ar';
    const canDispatchView = hasCapability(user?.role, CAPABILITIES.VIEW_ALL_SHIPMENTS);

    const [scanMode, setScanMode] = useState('pickup'); // 'pickup' | 'deliver' | 'cash' | 'scan'
    const [selectedGovFilter, setSelectedGovFilter] = useState('ALL');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // Scanner state
    const [isScanning, setIsScanning] = useState(false);
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [processing, setProcessing] = useState(false);
    const [manualTracking, setManualTracking] = useState('');
    const [manualLoading, setManualLoading] = useState(false);
    const [result, setResult] = useState(null);

    // Manifest state
    const [readyShipments, setReadyShipments] = useState([]);
    const [deliveryShipments, setDeliveryShipments] = useState([]);
    const [actionLoadingId, setActionLoadingId] = useState(null);

    // COD state
    const [driversList, setDriversList] = useState([]);
    const [selectedDriverId, setSelectedDriverId] = useState(user?.role === 'driver' ? user.id : '');
    const [codTrackingInput, setCodTrackingInput] = useState('');
    const [codTrackingLoading, setCodTrackingLoading] = useState(false);
    const [codFeedback, setCodFeedback] = useState(null);
    const [codSummary, setCodSummary] = useState({
        unremittedTotalsByCurrency: {},
        unremittedCount: 0,
        alerts: [],
        shipments: []
    });

    const [isRemitModalOpen, setIsRemitModalOpen] = useState(false);
    const [remitAmount, setRemitAmount] = useState('');
    const [remitCurrency, setRemitCurrency] = useState('KWD');
    const [remitBagRef, setRemitBagRef] = useState('');
    const [remitNotes, setRemitNotes] = useState('');
    const [remitLoading, setRemitLoading] = useState(false);

    // POD Modal state
    const [selectedPodShipment, setSelectedPodShipment] = useState(null);
    const [isPodModalOpen, setIsPodModalOpen] = useState(false);

    const fetchDriverData = useCallback(async (overrideDriverId) => {
        try {
            setLoading(true);
            setLoadError('');

            if (canDispatchView) {
                try {
                    const uRes = await userService.getUsers('driver');
                    if (uRes?.success && Array.isArray(uRes.data)) {
                        setDriversList(uRes.data);
                        if (!selectedDriverId && !overrideDriverId && uRes.data.length > 0) {
                            setSelectedDriverId(uRes.data[0].id);
                        }
                    }
                } catch {
                    // Non-blocking driver list warning
                }
            }

            const [pickupRes, deliverRes] = await Promise.all([
                shipmentService.getAllShipments({ status: 'ready_for_pickup' }),
                shipmentService.getAllShipments({ status: 'out_for_delivery' })
            ]);

            if (pickupRes?.success && Array.isArray(pickupRes.data)) {
                setReadyShipments(pickupRes.data);
            }
            if (deliverRes?.success && Array.isArray(deliverRes.data)) {
                setDeliveryShipments(deliverRes.data);
            }

            try {
                const targetId = overrideDriverId || selectedDriverId || (user?.role === 'driver' ? user.id : undefined);
                const codRes = await financeService.getDriverUnremittedCod(targetId);
                if (codRes?.success && codRes.data) {
                    setCodSummary(codRes.data);
                }
            } catch {
                // Non-blocking COD summary
            }
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || (isRTL ? 'تعذر تحميل مهام المندوب.' : 'Failed to load driver queue.');
            setLoadError(msg);
        } finally {
            setLoading(false);
        }
    }, [canDispatchView, isRTL, selectedDriverId, user?.id, user?.role]);

    useEffect(() => {
        fetchDriverData();
    }, [fetchDriverData]);

    const handleDriverChange = async (driverId) => {
        setSelectedDriverId(driverId);
        setCodFeedback(null);
        await fetchDriverData(driverId);
    };

    const processPickup = async (trackingNumber) => {
        setActionLoadingId(trackingNumber);
        try {
            const response = await shipmentService.driverPickupScan(trackingNumber);
            if (response?.success) {
                setResult({
                    type: 'success',
                    message: isRTL ? `تم تأكيد استلام الشحنة #${trackingNumber}` : `Shipment #${trackingNumber} Confirmed`,
                    detail: isRTL ? 'تم تسجيل الطرد كـ "تم الاستلام" بنجاح' : 'Package marked as Picked Up'
                });
                fetchDriverData();
            } else {
                setResult({
                    type: 'error',
                    message: isRTL ? 'فشل تأكيد الاستلام' : 'Pickup Failed',
                    detail: response?.error || 'Server rejected the update'
                });
            }
        } catch (err) {
            setResult({
                type: 'error',
                message: isRTL ? 'خطأ في عملية الاستلام' : 'Scan Error',
                detail: err?.message || 'Could not connect to server'
            });
        } finally {
            setActionLoadingId(null);
        }
    };

    const initiatePodFlow = async (trackingNumber) => {
        try {
            const res = await shipmentService.getShipment(trackingNumber);
            const shipment = res?.data || res;
            if (!shipment || !shipment.trackingNumber) {
                throw new Error('Shipment not found');
            }
            setSelectedPodShipment(shipment);
            setIsPodModalOpen(true);
        } catch (err) {
            setResult({
                type: 'error',
                message: isRTL ? 'تعذر جلب تفاصيل الشحنة' : 'Shipment Lookup Failed',
                detail: err?.message || 'Could not fetch package details for POD'
            });
        }
    };

    const handleScan = async (data) => {
        if (data && (isScanning || manualTracking) && !processing) {
            setProcessing(true);
            setIsScanning(false);
            try {
                const text = data.text || data;
                let trackingNumber = String(text).trim();
                try {
                    const json = JSON.parse(text);
                    if (json.tracking) trackingNumber = json.tracking;
                } catch {
                    // plain tracking string
                }
                if (scanMode === 'deliver') {
                    await initiatePodFlow(trackingNumber);
                } else {
                    await processPickup(trackingNumber);
                }
            } catch {
                setResult({
                    type: 'error',
                    message: isRTL ? 'رمز QR غير صالح' : 'Invalid QR Code',
                    detail: isRTL ? 'صيغة الباركود غير معتمدة' : 'Format not recognized'
                });
            } finally {
                setProcessing(false);
            }
        }
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        const tracking = manualTracking.trim();
        if (!tracking) return;
        setManualLoading(true);
        try {
            if (scanMode === 'deliver') {
                await initiatePodFlow(tracking);
            } else {
                await processPickup(tracking);
            }
            setManualTracking('');
        } finally {
            setManualLoading(false);
        }
    };

    const handlePodSuccess = (updatedShipment) => {
        setResult({
            type: 'success',
            message: isRTL ? `اكتمل التسليم (#${updatedShipment.trackingNumber})` : `Delivery Complete (#${updatedShipment.trackingNumber})`,
            detail: isRTL ? 'تم حفظ التوقيع الإلكتروني وإثبات التسليم (POD) بنجاح.' : 'Proof of Delivery and signature captured successfully.'
        });
        fetchDriverData();
    };

    const handleAddCodShipment = async (trackingToLookup) => {
        const tracking = (trackingToLookup || codTrackingInput).trim();
        if (!tracking) return;
        try {
            setCodTrackingLoading(true);
            setCodFeedback(null);
            const res = await shipmentService.getShipment(tracking);
            const shipment = res?.data?.data || res?.data || res;

            if (!shipment || !shipment.trackingNumber) {
                setCodFeedback({ type: 'error', message: isRTL ? `الشحنة "${tracking}" غير موجودة.` : `Shipment "${tracking}" not found.` });
                return;
            }
            const codVal = parseFloat(shipment.codAmount || 0);
            if (codVal <= 0) {
                setCodFeedback({ type: 'error', message: isRTL ? `لا يوجد مبلغ COD مسجل للشحنة ${shipment.trackingNumber}.` : `Shipment ${shipment.trackingNumber} has no COD amount.` });
                return;
            }
            if (shipment.codStatus === 'REMITTED') {
                setCodFeedback({ type: 'error', message: isRTL ? `تم توريد مبلغ ${shipment.trackingNumber} مسبقاً.` : `Shipment ${shipment.trackingNumber} COD already remitted.` });
                return;
            }
            const existing = (codSummary.shipments || []).find((s) => s.id === shipment.id || s.trackingNumber === shipment.trackingNumber);
            if (existing) {
                setCodFeedback({ type: 'info', message: isRTL ? `الشحنة ${shipment.trackingNumber} مضافة بالفعل.` : `Shipment ${shipment.trackingNumber} already in list.` });
                setCodTrackingInput('');
                return;
            }

            const cur = shipment.codCurrency || 'KWD';
            const newShipment = {
                ...shipment,
                codStatus: shipment.codStatus || 'COLLECTED',
                codCurrency: cur,
                codAmount: codVal
            };
            const updatedShipments = [newShipment, ...(codSummary.shipments || [])];
            const prevTotal = parseFloat(codSummary.unremittedTotalsByCurrency?.[cur] || 0);

            setCodSummary({
                ...codSummary,
                shipments: updatedShipments,
                unremittedCount: (codSummary.unremittedCount || 0) + 1,
                unremittedTotalsByCurrency: {
                    ...(codSummary.unremittedTotalsByCurrency || {}),
                    [cur]: (prevTotal + codVal).toFixed(3)
                }
            });
            setRemitAmount((prev) => String(((parseFloat(prev || 0)) + codVal).toFixed(3)));
            setCodFeedback({ type: 'success', message: `${shipment.trackingNumber} (${codVal.toFixed(3)} ${cur}) ${isRTL ? 'أضيفت للعهدة' : 'linked'}.` });
            setCodTrackingInput('');
        } catch (err) {
            setCodFeedback({ type: 'error', message: err?.response?.data?.error || err?.message || `Failed to find ${tracking}` });
        } finally {
            setCodTrackingLoading(false);
        }
    };

    const handleRemitSubmit = async () => {
        if (!remitAmount || parseFloat(remitAmount) <= 0) {
            enqueueSnackbar(isRTL ? 'أدخل مبلغاً صحيحاً للتوريد' : 'Enter a valid cash amount to remit', { variant: 'warning' });
            return;
        }
        const effectiveDriverId = selectedDriverId || (user?.role === 'driver' ? user.id : '');
        if (!effectiveDriverId) {
            enqueueSnackbar(isRTL ? 'اختر المندوب أولاً' : 'Please select a driver for this handover', { variant: 'warning' });
            return;
        }

        try {
            setRemitLoading(true);
            const unremittedShipmentIds = (codSummary.shipments || [])
                .filter((s) => s.codStatus !== 'REMITTED')
                .map((s) => s.id || s.trackingNumber);

            await financeService.requestDriverCodRemittance({
                driverId: effectiveDriverId,
                amount: parseFloat(remitAmount),
                currency: remitCurrency,
                shipmentIds: unremittedShipmentIds,
                bagReference: remitBagRef.trim(),
                notes: remitNotes.trim()
            });

            setIsRemitModalOpen(false);
            setRemitBagRef('');
            setRemitNotes('');
            enqueueSnackbar(isRTL ? 'تم إرسال طلب توريد العهدة بنجاح' : 'Cash handover submitted to vault', { variant: 'success' });
            await fetchDriverData(effectiveDriverId);
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Failed to submit cash handover', { variant: 'error' });
        } finally {
            setRemitLoading(false);
        }
    };

    const isDeliverMode = scanMode === 'deliver';
    const isCashMode = scanMode === 'cash';
    const isScanTab = scanMode === 'scan';
    const rawList = isDeliverMode ? deliveryShipments : readyShipments;
    const totalHeldCashKwd = parseFloat(codSummary.unremittedTotalsByCurrency?.KWD || 0);

    const enrichedList = useMemo(() => {
        return rawList.map((s) => {
            const party = isDeliverMode ? (s.destination || s.receiver || {}) : (s.origin || s.sender || {});
            return {
                ...s,
                governorate: resolveGovernorate(party),
                targetParty: party
            };
        });
    }, [rawList, isDeliverMode]);

    const govCounts = useMemo(() => {
        return enrichedList.reduce((acc, s) => {
            acc[s.governorate] = (acc[s.governorate] || 0) + 1;
            return acc;
        }, {});
    }, [enrichedList]);

    const filteredList = useMemo(() => {
        if (selectedGovFilter === 'ALL') return enrichedList;
        return enrichedList.filter((s) => s.governorate === selectedGovFilter);
    }, [enrichedList, selectedGovFilter]);

    const multiStopUrl = generateMultiStopUrl(filteredList, isDeliverMode);

    return (
        <div
            dir={isRTL ? 'rtl' : 'ltr'}
            className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 overflow-x-clip"
        >
            {/* Top Mobile Header */}
            <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-3">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xl" aria-hidden="true">local_shipping</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white truncate">
                                {isRTL ? 'بوابة المندوب V2' : 'Target Driver Hub V2'}
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {user?.name || (isRTL ? 'مندوب العمليات' : 'Courier Operator')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                            to="/driver/runs-v2"
                            className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold flex items-center gap-1 hover:border-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">route</span>
                            <span className="hidden sm:inline">{isRTL ? 'المسارات' : 'Runs'}</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => logout()}
                            aria-label={isRTL ? 'تسجيل الخروج' : 'Sign Out'}
                            className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-xl" aria-hidden="true">logout</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/80 dark:bg-sky-950/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {isRTL ? 'تعمل الآن على واجهة المندوب المطورة V2' : 'Viewing Driver Pickup & COD Console V2'}
                    </span>
                    <Link to="/driver/pickup" className="font-bold text-primary dark:text-sky-400 hover:underline">
                        {isRTL ? 'العودة إلى V1' : 'Switch to V1'}
                    </Link>
                </div>

                {loadError && (
                    <ErrorBannerV2 message={loadError} onRetry={() => fetchDriverData()} isRetrying={loading} />
                )}

                {/* Staff Driver Selector */}
                {canDispatchView && driversList.length > 0 && (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <label htmlFor="driver-scope-select" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-primary text-base" aria-hidden="true">badge</span>
                            <span>{isRTL ? 'عرض مسار المندوب:' : 'Dispatch Driver View:'}</span>
                        </label>
                        <select
                            id="driver-scope-select"
                            value={selectedDriverId}
                            onChange={(e) => handleDriverChange(e.target.value)}
                            className="min-h-[40px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold w-full sm:w-64"
                        >
                            <option value="">{isRTL ? '— اختر مندوب —' : '— Select Driver —'}</option>
                            {driversList.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name} {d.phone ? `(${d.phone})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Summary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    <MetricCardV2
                        title={isRTL ? 'للاستلام' : 'Pickups'}
                        value={readyShipments.length}
                        icon="flight_takeoff"
                        tone="info"
                        isActive={scanMode === 'pickup'}
                        onClick={() => { setScanMode('pickup'); setSelectedGovFilter('ALL'); }}
                    />
                    <MetricCardV2
                        title={isRTL ? 'للتسليم' : 'Deliveries'}
                        value={deliveryShipments.length}
                        icon="local_shipping"
                        tone="neutral"
                        isActive={scanMode === 'deliver'}
                        onClick={() => { setScanMode('deliver'); setSelectedGovFilter('ALL'); }}
                    />
                    <MetricCardV2
                        title={isRTL ? 'عهدة COD' : 'Held COD'}
                        value={totalHeldCashKwd.toFixed(3)}
                        subtitle="KWD"
                        icon="payments"
                        tone="success"
                        isActive={scanMode === 'cash'}
                        onClick={() => setScanMode('cash')}
                    />
                </div>

                {/* Mode Switcher Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80">
                    {[
                        { id: 'pickup', label: isRTL ? 'استلام' : 'Pickups', icon: 'flight_takeoff' },
                        { id: 'deliver', label: isRTL ? 'تسليم' : 'Deliver', icon: 'local_shipping' },
                        { id: 'cash', label: isRTL ? 'النقدية' : 'Cash', icon: 'savings' },
                        { id: 'scan', label: isRTL ? 'مسح' : 'Scan', icon: 'qr_code_scanner' }
                    ].map((tab) => {
                        const active = scanMode === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                    setScanMode(tab.id);
                                    if (tab.id === 'scan') setIsScanning(true);
                                    else setIsScanning(false);
                                }}
                                className={`min-h-[44px] rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                                    active
                                        ? 'bg-primary text-white shadow-xs'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">{tab.icon}</span>
                                <span className="truncate">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Result Feedback Banner */}
                {result && (
                    <div
                        role="status"
                        className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${
                            result.type === 'success'
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                                : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                        }`}
                    >
                        <div className="min-w-0">
                            <div className="font-bold text-xs sm:text-sm">{result.message}</div>
                            <div className="text-xs opacity-80 truncate">{result.detail}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setResult(null)}
                            aria-label={isRTL ? 'إغلاق' : 'Dismiss'}
                            className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
                        </button>
                    </div>
                )}

                {/* SCAN MODE */}
                {isScanTab && (
                    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary" aria-hidden="true">qr_code_scanner</span>
                                <span>{isRTL ? 'ماسح البوليصة السريع' : 'Quick Barcode & QR Scanner'}</span>
                            </h2>
                            <button
                                type="button"
                                onClick={() => setCameraFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                                className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">flip_camera_ios</span>
                                <span>{isRTL ? 'تبديل الكاميرا' : 'Flip'}</span>
                            </button>
                        </div>

                        <div className="rounded-xl overflow-hidden bg-slate-950 aspect-video max-h-64 flex items-center justify-center">
                            {isScanning ? (
                                <Suspense fallback={<div className="text-xs text-slate-400">{isRTL ? 'جاري تشغيل الكاميرا...' : 'Starting camera...'}</div>}>
                                    <QrScanner
                                        delay={300}
                                        onError={() => {}}
                                        onScan={handleScan}
                                        constraints={{ video: { facingMode: cameraFacingMode } }}
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </Suspense>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsScanning(true)}
                                    className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
                                >
                                    {isRTL ? 'تشغيل الكاميرا' : 'Enable Camera'}
                                </button>
                            )}
                        </div>

                        <form onSubmit={handleManualSubmit} className="flex gap-2">
                            <input
                                type="text"
                                value={manualTracking}
                                onChange={(e) => setManualTracking(e.target.value)}
                                placeholder={isRTL ? 'أدخل رقم الشحنة يدوياً...' : 'Enter tracking number manually...'}
                                className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs sm:text-sm"
                            />
                            <button
                                type="submit"
                                disabled={!manualTracking.trim() || manualLoading}
                                className="min-h-[44px] px-4 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                            >
                                {manualLoading ? '...' : (isRTL ? 'تأكيد' : 'Submit')}
                            </button>
                        </form>
                    </section>
                )}

                {/* CASH / COD MODE */}
                {isCashMode && (
                    <section className="space-y-4">
                        {codSummary.alerts && codSummary.alerts.length > 0 && (
                            <div role="alert" className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3.5 space-y-1 text-xs font-bold text-amber-900 dark:text-amber-200">
                                {codSummary.alerts.map((al, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base text-amber-600 dark:text-amber-400" aria-hidden="true">warning</span>
                                        <span>{al.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400" aria-hidden="true">account_balance</span>
                                        <span>{isRTL ? 'تسليم العهدة النقدية للخزينة' : 'Hub Vault Cash Handover'}</span>
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {isRTL ? 'توريد المبالغ المحصلة إلى أمين الصندوق في نهاية الوردية' : 'Submit collected cash to the hub vault cashier at end of shift'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRemitAmount(String(totalHeldCashKwd || ''));
                                        setIsRemitModalOpen(true);
                                    }}
                                    disabled={totalHeldCashKwd <= 0 && (!codSummary.shipments || codSummary.shipments.length === 0)}
                                    className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">savings</span>
                                    <span>{isRTL ? 'توريد النقدية' : 'Handover Cash'}</span>
                                </button>
                            </div>

                            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                <label htmlFor="cod-link-input" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {isRTL ? 'ربط بوليصة يدوياً بالعهدة' : 'Link Shipment to Cash Handover'}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="cod-link-input"
                                        type="text"
                                        value={codTrackingInput}
                                        onChange={(e) => setCodTrackingInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && codTrackingInput.trim() && handleAddCodShipment()}
                                        placeholder="TRK-..."
                                        className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs sm:text-sm"
                                    />
                                    <button
                                        type="button"
                                        disabled={!codTrackingInput.trim() || codTrackingLoading}
                                        onClick={() => handleAddCodShipment()}
                                        className="min-h-[44px] px-4 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                                    >
                                        {codTrackingLoading ? '...' : (isRTL ? '+ إضافة' : '+ Add')}
                                    </button>
                                </div>
                                {codFeedback && (
                                    <div className={`text-xs font-semibold p-2.5 rounded-xl ${
                                        codFeedback.type === 'success'
                                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                            : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                                    }`}>
                                        {codFeedback.message}
                                    </div>
                                )}
                            </div>
                        </div>

                        {(!codSummary.shipments || codSummary.shipments.length === 0) ? (
                            <EmptyStateV2
                                icon="payments"
                                title={isRTL ? 'لا توجد مبالغ COD مسجلة' : 'No COD Cash Collected'}
                                description={isRTL ? 'لا توجد شحنات دفع عند الاستلام بانتظار التوريد في هذه الوردية.' : 'No unremitted COD shipments recorded for this shift.'}
                            />
                        ) : (
                            <div className="space-y-2.5">
                                {codSummary.shipments.map((s) => (
                                    <div
                                        key={s.id || s.trackingNumber}
                                        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs font-bold text-primary dark:text-sky-400 truncate">
                                                {s.trackingNumber}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                {s.codStatus || 'COLLECTED'}
                                            </div>
                                        </div>
                                        <div className="font-mono font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tabular-nums shrink-0">
                                            {Number(s.codAmount || 0).toFixed(3)} {s.codCurrency || 'KWD'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* PICKUP / DELIVER QUEUE */}
                {!isCashMode && !isScanTab && (
                    <section className="space-y-3">
                        {/* Governorate Filter + Multi-stop Route */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1">
                                <button
                                    type="button"
                                    onClick={() => setSelectedGovFilter('ALL')}
                                    className={`min-h-[36px] px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                                        selectedGovFilter === 'ALL'
                                            ? 'bg-primary text-white'
                                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    {isRTL ? 'الكل' : 'All'} ({enrichedList.length})
                                </button>
                                {Object.entries(govCounts).map(([gov, count]) => (
                                    <button
                                        key={gov}
                                        type="button"
                                        onClick={() => setSelectedGovFilter(gov)}
                                        className={`min-h-[36px] px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                                            selectedGovFilter === gov
                                                ? 'bg-primary text-white'
                                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        {gov} ({count})
                                    </button>
                                ))}
                            </div>

                            {multiStopUrl && (
                                <a
                                    href={multiStopUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-[36px] px-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">directions</span>
                                    <span>{isRTL ? 'مسار الخريطة' : 'Multi-Stop Route'}</span>
                                </a>
                            )}
                        </div>

                        {loading ? (
                            <div className="space-y-3" aria-busy="true">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="h-36 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
                                ))}
                            </div>
                        ) : filteredList.length === 0 ? (
                            <EmptyStateV2
                                icon="task_alt"
                                title={
                                    isDeliverMode
                                        ? (isRTL ? 'لا توجد شحنات للتسليم' : 'No Packages Pending Delivery')
                                        : (isRTL ? 'لا توجد شحنات جاهزة للاستلام' : 'No Shipments Pending Pickup')
                                }
                                description={isRTL ? 'تم إنجاز كافة المهام في هذه القائمة.' : 'All tasks in this queue have been processed.'}
                                actionLabel={isRTL ? 'تحديث' : 'Refresh'}
                                onAction={() => fetchDriverData()}
                            />
                        ) : (
                            <div className="space-y-3">
                                {filteredList.map((shipment, index) => {
                                    const target = shipment.targetParty || {};
                                    const address = getPartyAddress(target);
                                    const phone = target.phone || '';
                                    const waDigits = formatWhatsAppDigits(phone);
                                    const singleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
                                    const hasCod = Number(shipment.codAmount || 0) > 0;
                                    const isCurrentLoading = actionLoadingId === shipment.trackingNumber;

                                    return (
                                        <article
                                            key={shipment.trackingNumber || index}
                                            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xs"
                                        >
                                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold font-mono text-xs tabular-nums shrink-0">
                                                        #{index + 1}
                                                    </span>
                                                    <Link
                                                        to={`/shipment-v2/${shipment.trackingNumber}`}
                                                        className="font-mono font-bold text-xs sm:text-sm text-primary dark:text-sky-400 hover:underline truncate"
                                                    >
                                                        {shipment.trackingNumber}
                                                    </Link>
                                                    <span className="px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                                                        {shipment.governorate}
                                                    </span>
                                                </div>
                                                <StatusBadge status={shipment.status} size="xs" />
                                            </div>

                                            <div className="space-y-1 min-w-0">
                                                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                                    {target.name || target.contactPerson || (isRTL ? 'العميل' : 'Customer')}
                                                </div>
                                                {target.company && (
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                        {target.company}
                                                    </div>
                                                )}
                                                <p className="text-xs text-slate-600 dark:text-slate-300 break-words">
                                                    {address}
                                                </p>
                                            </div>

                                            {hasCod && (
                                                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-base text-emerald-600 dark:text-emerald-400" aria-hidden="true">payments</span>
                                                        <span>{isRTL ? 'تحصيل COD:' : 'Collect COD:'}</span>
                                                    </span>
                                                    <span className="font-mono tabular-nums">
                                                        {Number(shipment.codAmount).toFixed(3)} {shipment.codCurrency || 'KWD'}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Contact & Navigation */}
                                            <div className="grid grid-cols-3 gap-2">
                                                {phone ? (
                                                    <a
                                                        href={`tel:${phone}`}
                                                        className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">call</span>
                                                        <span>{isRTL ? 'اتصال' : 'Call'}</span>
                                                    </a>
                                                ) : (
                                                    <span className="min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-xs flex items-center justify-center">—</span>
                                                )}

                                                {waDigits ? (
                                                    <a
                                                        href={`https://wa.me/${waDigits}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined text-base" aria-hidden="true">chat</span>
                                                        <span>{isRTL ? 'واتساب' : 'WhatsApp'}</span>
                                                    </a>
                                                ) : (
                                                    <span className="min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-xs flex items-center justify-center">—</span>
                                                )}

                                                <a
                                                    href={singleNavUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="min-h-[44px] rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold flex items-center justify-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-base" aria-hidden="true">location_on</span>
                                                    <span>{isRTL ? 'توجيه' : 'Navigate'}</span>
                                                </a>
                                            </div>

                                            {/* Primary Action */}
                                            <button
                                                type="button"
                                                disabled={isCurrentLoading}
                                                onClick={() => (isDeliverMode ? initiatePodFlow(shipment.trackingNumber) : processPickup(shipment.trackingNumber))}
                                                className="w-full min-h-[44px] rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                                                    {isDeliverMode ? 'verified' : 'check_circle'}
                                                </span>
                                                <span>
                                                    {isCurrentLoading
                                                        ? (isRTL ? 'جاري التنفيذ...' : 'Processing...')
                                                        : isDeliverMode
                                                        ? (isRTL ? 'تسليم وإثبات POD' : 'Complete Delivery (POD)')
                                                        : (isRTL ? 'تأكيد الاستلام' : 'Confirm Pickup')}
                                                </span>
                                            </button>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}
            </main>

            {/* Cash Remittance Modal */}
            {isRemitModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white">
                                {isRTL ? 'تأكيد توريد العهدة النقدية' : 'Confirm Vault Cash Handover'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsRemitModalOpen(false)}
                                className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        {isRTL ? 'المبلغ' : 'Amount'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={remitAmount}
                                        onChange={(e) => setRemitAmount(e.target.value)}
                                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                        {isRTL ? 'العملة' : 'Currency'}
                                    </label>
                                    <select
                                        value={remitCurrency}
                                        onChange={(e) => setRemitCurrency(e.target.value)}
                                        className="w-full min-h-[44px] px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
                                    >
                                        <option value="KWD">KWD</option>
                                        <option value="SAR">SAR</option>
                                        <option value="AED">AED</option>
                                        <option value="USD">USD</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    {isRTL ? 'رقم الحقيبة / المرجع' : 'Cash Bag Reference'}
                                </label>
                                <input
                                    type="text"
                                    value={remitBagRef}
                                    onChange={(e) => setRemitBagRef(e.target.value)}
                                    placeholder="BAG-001"
                                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    {isRTL ? 'ملاحظات' : 'Notes'}
                                </label>
                                <textarea
                                    rows={2}
                                    value={remitNotes}
                                    onChange={(e) => setRemitNotes(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setIsRemitModalOpen(false)}
                                className="min-h-[44px] px-4 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                disabled={remitLoading}
                                onClick={handleRemitSubmit}
                                className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                            >
                                {remitLoading ? (isRTL ? 'جاري الإرسال...' : 'Submitting...') : (isRTL ? 'تأكيد التوريد' : 'Submit Handover')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ProofOfDeliveryModal
                isOpen={isPodModalOpen}
                onClose={() => {
                    setIsPodModalOpen(false);
                    setSelectedPodShipment(null);
                }}
                shipment={selectedPodShipment}
                onDelivered={(updated) => {
                    setIsPodModalOpen(false);
                    setSelectedPodShipment(null);
                    handlePodSuccess(updated);
                }}
            />
        </div>
    );
};

export default DriverPickupV2Page;
