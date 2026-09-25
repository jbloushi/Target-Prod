import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';
import { shipmentService, financeService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { StatusBadge } from '../components/common/StatusBadge';
import ProofOfDeliveryModal from '../components/ProofOfDeliveryModal';

const QrScanner = lazy(() => import('react-qr-scanner'));

// ── Kuwait Governorate Resolver & Multi-Stop Route Builder ──────
const GOVERNORATE_MAP = {
    'Capital': [
        'kuwait city', 'sharq', 'dasman', 'mirqab', 'jibla', 'salhiya', 'bneid al-gar', 'bneid al gar',
        'kaifan', 'mansouriya', 'abdullah al-salem', 'nuzha', 'faiha', 'shamiya', 'rawda', 'adailiya',
        'khaldiya', 'qadsiya', 'yarmouk', 'shuwaikh', 'sulaibikhat', 'doha', 'ghernata', 'qairawan',
        'العاصمة', 'مدينة الكويت', 'الشرق', 'دسمان', 'المرقاب', 'القبلة', 'الصالحية', 'بنيد القار',
        'كيفان', 'المنصورية', 'عبدالله السالم', 'النزهة', 'الفيحاء', 'الشامية', 'الروضة', 'العديلية',
        'الخالدية', 'القادسية', 'اليرموك', 'الشويخ', 'الصليبخات', 'الدوحة', 'غرناطة', 'القيروان'
    ],
    'Hawalli': [
        'hawalli', 'salmiya', 'rumaithiya', 'jabriya', 'mishref', 'bayan', 'salwa', 'bidaa', 'shaab',
        'maidan hawalli', 'hateen', 'hitteen', 'al-siddiq', 'siddiq', 'al-salam', 'salam', 'al-zahra',
        'zahra', 'shuhada', 'حولي', 'السالمية', 'الرميثية', 'الجابرية', 'مشرف', 'بيان', 'سلوى',
        'البدع', 'الشعب', 'ميدان حولي', 'حطين', 'الصديق', 'السلام', 'الزهراء', 'الشهداء'
    ],
    'Farwaniya': [
        'farwaniya', 'khaitan', 'omariya', 'rabiya', 'ishbilya', 'jleeb al-shuyoukh', 'jleeb', 'andalus',
        'riggae', 'rehab', 'sabah al-nasser', 'abdullah al-mubarak', 'west abdullah al mubarak', 'dajeej',
        'ardiya', 'ardhiya', 'الفروانية', 'خيطان', 'العمرية', 'الرابية', 'إشبيلية', 'جليب الشيوخ',
        'الأندلس', 'الرقعي', 'الرحاب', 'صباح الناصر', 'عبدالله المبارك', 'غرب عبدالله المبارك', 'الضجيج', 'العارضية'
    ],
    'Mubarak Al-Kabeer': [
        'sabah al-salem', 'messila', 'abu fatira', 'al-fnaitees', 'fnaitees', 'al-qurain', 'qurain',
        'al-qusour', 'qusour', 'al-adan', 'adan', 'mubarak al-kabeer', 'مبارك الكبير', 'صباح السالم',
        'المسيلة', 'أبو فطيرة', 'الفنيطيس', 'القرين', 'القصور', 'العدان'
    ],
    'Ahmadi': [
        'ahmadi', 'fahaheel', 'mangaf', 'abu halifa', 'mahboula', 'egaila', 'sabahiya', 'riqqa',
        'hadiya', 'fintas', 'wafra', 'khiran', 'الأحمدي', 'الفحيحيل', 'المنقف', 'أبو حليفة',
        'المهبولة', 'العقيلة', 'الصباحية', 'الرقة', 'هدية', 'الفنطاس', 'الوفرة', 'الخيران'
    ],
    'Jahra': [
        'jahra', 'saad al-abdullah', 'sulaibiya', 'oyoun', 'waha', 'nasseem', 'taima', 'qasr', 'mutlaa',
        'الجهراء', 'سعد العبدالله', 'الصليبية', 'العيون', 'الواحة', 'النسيم', 'تيماء', 'القصر', 'المطلاع'
    ]
};

const resolveGovernorate = (addressObj = {}) => {
    const text = `${addressObj.governorate || ''} ${addressObj.state || ''} ${addressObj.city || ''} ${addressObj.street || ''} ${addressObj.addressLine1 || ''} ${addressObj.area || ''} ${addressObj.formattedAddress || ''}`.toLowerCase();
    for (const [gov, keywords] of Object.entries(GOVERNORATE_MAP)) {
        if (text.includes(gov.toLowerCase())) return gov;
        if (keywords.some(kw => text.includes(kw))) return gov;
    }
    return 'Other';
};

const getPartyAddress = (party = {}) => {
    return party.formattedAddress || [party.addressLine1 || party.street, party.area, party.city, party.country].filter(Boolean).join(', ') || 'Kuwait';
};

const generateMultiStopUrl = (shipmentList, isDeliverMode) => {
    if (!shipmentList || shipmentList.length === 0) return null;
    const destinations = shipmentList.map(s => {
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
 * DriverPickupPage — Mobile-First Courier & Pickup Command Center
 * Built with 100% Tailwind CSS + DaisyUI v4. Zero styled-components, zero MUI.
 */
const DriverPickupPage = () => {
    const { logout, user } = useAuth();
    const { lang, isRTL } = useLanguage();

    // Mode: 'pickup' | 'deliver' | 'cash' | 'scan'
    const [scanMode, setScanMode] = useState('pickup');
    const [selectedGovFilter, setSelectedGovFilter] = useState('ALL');

    // Scanner & Camera State
    const [isScanning, setIsScanning] = useState(false);
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [processing, setProcessing] = useState(false);
    const [manualTracking, setManualTracking] = useState('');
    const [manualLoading, setManualLoading] = useState(false);
    const [result, setResult] = useState(null); // { type: 'success' | 'error', message: '', detail: '' }

    // Manifest State
    const [readyShipments, setReadyShipments] = useState([]);
    const [deliveryShipments, setDeliveryShipments] = useState([]);
    const [stats, setStats] = useState({ pickedUpToday: 0, deliveredToday: 0 });
    const [actionLoadingId, setActionLoadingId] = useState(null);

    // COD State
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

    // POD Modal State
    const [selectedPodShipment, setSelectedPodShipment] = useState(null);
    const [isPodModalOpen, setIsPodModalOpen] = useState(false);

    const fetchDriverData = useCallback(async (overrideDriverId) => {
        try {
            // Load drivers list for staff / admin / managers
            if (['admin', 'staff', 'manager', 'accounting'].includes(user?.role)) {
                try {
                    const uRes = await userService.getUsers('driver');
                    if (uRes?.success && Array.isArray(uRes.data)) {
                        setDriversList(uRes.data);
                        if (!selectedDriverId && !overrideDriverId && uRes.data.length > 0) {
                            setSelectedDriverId(uRes.data[0].id);
                        }
                    }
                } catch (driverErr) {
                    console.debug('Driver list load warning:', driverErr);
                }
            }

            // Ready for pickup shipments
            const response = await shipmentService.getAllShipments({ status: 'ready_for_pickup' });
            if (response.success && Array.isArray(response.data)) {
                setReadyShipments(response.data);
            }

            // In-transit / Out for delivery shipments
            const outForDeliveryRes = await shipmentService.getAllShipments({ status: 'out_for_delivery' });
            if (outForDeliveryRes.success && Array.isArray(outForDeliveryRes.data)) {
                setDeliveryShipments(outForDeliveryRes.data);
            }

            // Picked up today & Delivered today stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const pickedResponse = await shipmentService.getAllShipments({
                status: 'picked_up',
                dateFrom: today.toISOString()
            });
            const deliveredResponse = await shipmentService.getAllShipments({
                status: 'delivered',
                dateFrom: today.toISOString()
            });

            setStats({
                pickedUpToday: Array.isArray(pickedResponse?.data) ? pickedResponse.data.length : 0,
                deliveredToday: Array.isArray(deliveredResponse?.data) ? deliveredResponse.data.length : 0
            });

            // Driver COD Cash Summary
            try {
                const targetId = overrideDriverId || selectedDriverId || (user?.role === 'driver' ? user.id : undefined);
                const params = targetId ? { driverId: targetId } : {};
                const codRes = await financeService.getDriverCodSummary(params);
                if (codRes?.success && codRes?.data) {
                    setCodSummary(codRes.data);
                    const totalKwd = codRes.data.unremittedTotalsByCurrency?.['KWD'] || 0;
                    if (totalKwd > 0) setRemitAmount(String(totalKwd));
                }
            } catch (codErr) {
                console.debug('Driver COD summary load warning:', codErr);
            }
        } catch (err) {
            console.error('Error fetching driver data:', err);
        }
    }, [user, selectedDriverId]);

    useEffect(() => {
        fetchDriverData();
    }, [fetchDriverData]);

    const handleDriverChange = async (driverId) => {
        setSelectedDriverId(driverId);
        setCodFeedback(null);
        await fetchDriverData(driverId);
    };

    // Confirm Pickup Direct
    const processPickup = async (trackingNumber) => {
        setActionLoadingId(trackingNumber);
        try {
            const response = await shipmentService.driverPickupScan(trackingNumber);
            if (response.success) {
                setResult({
                    type: 'success',
                    message: lang === 'ar' ? `تم تأكيد استلام الشحنة #${trackingNumber}` : `Shipment #${trackingNumber} Confirmed`,
                    detail: lang === 'ar' ? 'تم تسجيل الطرد كـ "تم الاستلام" بنجاح' : 'Package successfully marked as Picked Up'
                });
                fetchDriverData();
            } else {
                setResult({
                    type: 'error',
                    message: lang === 'ar' ? 'فشل تأكيد الاستلام' : 'Pickup Failed',
                    detail: response.error || 'Server rejected the update'
                });
            }
        } catch (err) {
            setResult({
                type: 'error',
                message: lang === 'ar' ? 'خطأ في عملية الاستلام' : 'Scan Error',
                detail: err.message || 'Could not connect to server'
            });
        } finally {
            setActionLoadingId(null);
        }
    };

    // Initiate POD Flow
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
                message: lang === 'ar' ? 'تعذر جلب تفاصيل الشحنة' : 'Shipment Lookup Failed',
                detail: err.message || 'Could not fetch package details for POD'
            });
        }
    };

    const handleScan = async (data) => {
        if (data && (isScanning || manualTracking) && !processing) {
            setProcessing(true);
            setIsScanning(false);

            try {
                const text = data.text || data;
                let trackingNumber = text;
                try {
                    const json = JSON.parse(text);
                    if (json.tracking) trackingNumber = json.tracking;
                } catch {
                    // Plain text tracking ID
                }

                if (scanMode === 'deliver') {
                    await initiatePodFlow(trackingNumber);
                } else {
                    await processPickup(trackingNumber);
                }
            } catch {
                setResult({
                    type: 'error',
                    message: lang === 'ar' ? 'رمز QR غير صالح' : 'Invalid QR Code',
                    detail: lang === 'ar' ? 'صيغة الباركود غير معتمدة' : 'Format not recognized'
                });
            } finally {
                setProcessing(false);
            }
        }
    };

    const handlePodSuccess = (updatedShipment) => {
        setResult({
            type: 'success',
            message: lang === 'ar' ? `اكتمل التسليم (#${updatedShipment.trackingNumber})` : `Delivery Complete (#${updatedShipment.trackingNumber})`,
            detail: lang === 'ar' ? 'تم حفظ التوقيع الإلكتروني وإثبات التسليم (POD) بنجاح.' : 'Proof of Delivery and signature captured successfully.'
        });
        fetchDriverData();
    };

    // Add COD Shipment Manually
    const handleAddCodShipment = async (trackingToLookup) => {
        const tracking = (trackingToLookup || codTrackingInput).trim();
        if (!tracking) return;

        try {
            setCodTrackingLoading(true);
            setCodFeedback(null);
            const res = await shipmentService.getShipment(tracking);
            const shipment = res?.data?.data || res?.data || res;

            if (!shipment || !shipment.trackingNumber) {
                setCodFeedback({ type: 'error', message: `Shipment "${tracking}" not found in system.` });
                return;
            }

            const codVal = parseFloat(shipment.codAmount || 0);
            if (codVal <= 0) {
                setCodFeedback({ type: 'error', message: `Shipment ${shipment.trackingNumber} has no COD amount registered.` });
                return;
            }

            if (shipment.codStatus === 'REMITTED') {
                setCodFeedback({ type: 'error', message: `Shipment ${shipment.trackingNumber} COD has already been remitted to vault.` });
                return;
            }

            const existing = (codSummary.shipments || []).find(s => s.id === shipment.id || s.trackingNumber === shipment.trackingNumber);
            if (existing) {
                setCodFeedback({ type: 'info', message: `Shipment ${shipment.trackingNumber} is already in the COD handover list.` });
                setCodTrackingInput('');
                return;
            }

            const cur = shipment.codCurrency || 'KWD';
            const newShipment = {
                ...shipment,
                codStatus: shipment.codStatus || 'COLLECTED',
                codCurrency: cur,
                codAmount: codVal,
                assignedDriver: shipment.assignedDriver || {
                    id: selectedDriverId || user?.id,
                    name: driversList.find(d => d.id === selectedDriverId)?.name || user?.name
                }
            };

            const updatedShipments = [newShipment, ...(codSummary.shipments || [])];
            const prevTotal = parseFloat(codSummary.unremittedTotalsByCurrency?.[cur] || 0);
            const updatedTotals = {
                ...(codSummary.unremittedTotalsByCurrency || {}),
                [cur]: (prevTotal + codVal).toFixed(3)
            };

            setCodSummary({
                ...codSummary,
                shipments: updatedShipments,
                unremittedCount: (codSummary.unremittedCount || 0) + 1,
                unremittedTotalsByCurrency: updatedTotals
            });

            setRemitAmount(prev => {
                const current = parseFloat(prev || 0);
                return String((current + codVal).toFixed(3));
            });

            setCodFeedback({
                type: 'success',
                message: `Shipment ${shipment.trackingNumber} (${codVal.toFixed(3)} ${cur}) linked to handover.`
            });
            setCodTrackingInput('');
        } catch (err) {
            console.error('Error adding COD shipment:', err);
            setCodFeedback({
                type: 'error',
                message: err.response?.data?.error || err.message || `Failed to find shipment ${tracking}`
            });
        } finally {
            setCodTrackingLoading(false);
        }
    };

    // Remit Submit
    const handleRemitSubmit = async () => {
        if (!remitAmount || parseFloat(remitAmount) <= 0) {
            alert('Please enter a valid cash amount to remit');
            return;
        }

        const effectiveDriverId = selectedDriverId || (user?.role === 'driver' ? user.id : '');
        if (!effectiveDriverId) {
            alert('Please select a driver from the pick list for this handover.');
            return;
        }

        try {
            setRemitLoading(true);
            const unremittedShipmentIds = (codSummary.shipments || [])
                .filter(s => s.codStatus !== 'REMITTED')
                .map(s => s.id || s.trackingNumber);

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
            const driverObj = driversList.find(d => d.id === effectiveDriverId);
            const driverName = driverObj?.name || user?.name || 'Driver';
            setResult({
                type: 'success',
                message: lang === 'ar' ? 'تم تسجيل تسليم العهدة النقدية' : 'Cash Handover Submitted',
                detail: `Handover request of ${parseFloat(remitAmount).toFixed(3)} ${remitCurrency} submitted for ${driverName}. Hand physical cash to the hub vault cashier.`
            });
            setCodFeedback({
                type: 'success',
                message: `Cash handover of ${parseFloat(remitAmount).toFixed(3)} ${remitCurrency} submitted for ${driverName}. Awaiting cashier verification.`
            });
            await fetchDriverData(effectiveDriverId);
        } catch (err) {
            console.error('Failed to submit cash handover:', err);
            alert(err.response?.data?.error || err.message || 'Failed to submit cash handover');
        } finally {
            setRemitLoading(false);
        }
    };

    // Calculations
    const isDeliverMode = scanMode === 'deliver';
    const isCashMode = scanMode === 'cash';
    const rawList = isDeliverMode ? deliveryShipments : readyShipments;

    const totalHeldCashKwd = parseFloat(codSummary.unremittedTotalsByCurrency?.['KWD'] || 0);
    const totalHeldCashFormatted = Object.entries(codSummary.unremittedTotalsByCurrency || {})
        .filter(([, amt]) => parseFloat(amt) > 0)
        .map(([curr, amt]) => `${Number(amt).toFixed(3)} ${curr}`)
        .join(', ') || '0.000 KWD';

    // Enrich list with detected governorate
    const enrichedList = useMemo(() => {
        return rawList.map(s => {
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
        return enrichedList.filter(s => s.governorate === selectedGovFilter);
    }, [enrichedList, selectedGovFilter]);

    const multiStopRouteUrl = useMemo(() => {
        return generateMultiStopUrl(filteredList, isDeliverMode);
    }, [filteredList, isDeliverMode]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-base-300 pb-20 text-base-content">
            {/* Top Driver Navigation Header */}
            <header className="sticky top-0 z-30 bg-base-100/90 backdrop-blur-md border-b border-base-200/80 px-4 py-3">
                <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
                            <span className="material-symbols-outlined text-2xl">local_shipping</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="font-black text-sm tracking-tight text-base-content">TARGET LOGISTICS</span>
                                <span className="badge badge-primary badge-xs font-bold uppercase">Driver App</span>
                            </div>
                            <div className="text-xs text-base-content/60 font-semibold">
                                {user?.name || 'Courier Operator'}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Logout / Exit */}
                        <button
                            type="button"
                            onClick={() => logout()}
                            title="Sign Out"
                            className="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-error"
                        >
                            <span className="material-symbols-outlined text-xl">logout</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-5">
                {/* Driver / Staff Scope Selector */}
                {['admin', 'staff', 'manager', 'accounting'].includes(user?.role) && driversList.length > 0 && (
                    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-lg">badge</span>
                            <span className="text-xs font-bold text-base-content/80">
                                {lang === 'ar' ? 'فحص مسار المندوب:' : 'Dispatch Driver View:'}
                            </span>
                        </div>
                        <select
                            value={selectedDriverId}
                            onChange={(e) => handleDriverChange(e.target.value)}
                            className="select select-bordered select-xs w-full sm:w-64 bg-base-100 text-xs font-semibold focus:select-primary"
                        >
                            <option value="">— {lang === 'ar' ? 'اختر مندوب' : 'Select Driver'} —</option>
                            {driversList.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.name} {d.phone ? `(${d.phone})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Mode Switcher Tabs */}
                <div className="tabs tabs-boxed bg-base-200/80 p-1.5 rounded-2xl w-full grid grid-cols-3 sm:grid-cols-4 gap-1">
                    <button
                        type="button"
                        onClick={() => { setScanMode('pickup'); setSelectedGovFilter('ALL'); }}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            scanMode === 'pickup' ? 'tab-active !bg-primary !text-white shadow-sm' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">flight_takeoff</span>
                        <span>{lang === 'ar' ? 'الاستلام' : 'Pickups'}</span>
                        <span className="badge badge-xs badge-neutral ms-1">{readyShipments.length}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => { setScanMode('deliver'); setSelectedGovFilter('ALL'); }}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            scanMode === 'deliver' ? 'tab-active !bg-primary !text-white shadow-sm' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">local_shipping</span>
                        <span>{lang === 'ar' ? 'التسليم' : 'Deliver'}</span>
                        <span className="badge badge-xs badge-neutral ms-1">{deliveryShipments.length}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setScanMode('cash')}
                        className={`tab tab-sm font-bold gap-1.5 rounded-xl transition-all ${
                            scanMode === 'cash' ? 'tab-active !bg-success !text-white shadow-sm' : 'text-base-content/70 hover:text-base-content'
                        }`}
                    >
                        <span className="material-symbols-outlined text-base">payments</span>
                        <span>{lang === 'ar' ? 'العهدة' : 'COD'}</span>
                        {totalHeldCashKwd > 0 && (
                            <span className="badge badge-xs badge-warning ms-1 font-mono font-bold text-black">{totalHeldCashKwd.toFixed(1)}</span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsScanning(true)}
                        className="tab tab-sm font-bold gap-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 col-span-3 sm:col-span-1 hidden sm:flex items-center justify-center"
                    >
                        <span className="material-symbols-outlined text-base">qr_code_scanner</span>
                        <span>{lang === 'ar' ? 'ماسح QR' : 'Scan'}</span>
                    </button>
                </div>

                {/* KPI Pulse Ribbon */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-3.5 space-y-1">
                        <div className="text-[11px] font-bold text-base-content/60 uppercase">
                            {isCashMode ? (lang === 'ar' ? 'الطلبات المحصلة' : 'Unremitted Orders')
                                : (isDeliverMode ? (lang === 'ar' ? 'بانتظار التسليم' : 'Out for Delivery')
                                : (lang === 'ar' ? 'جاهز للاستلام' : 'Ready for Pickup'))}
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-primary font-mono">
                            {isCashMode ? (codSummary.unremittedCount || 0) : (isDeliverMode ? deliveryShipments.length : readyShipments.length)}
                        </div>
                    </div>

                    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-3.5 space-y-1">
                        <div className="text-[11px] font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'المنجز اليوم' : 'Completed Today'}
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-success font-mono">
                            {isDeliverMode ? stats.deliveredToday : stats.pickedUpToday}
                        </div>
                    </div>

                    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-3.5 space-y-1 col-span-2 sm:col-span-2">
                        <div className="text-[11px] font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'العهدة النقدية بيدك (COD)' : 'Held COD Cash in Hand'}
                        </div>
                        <div className="text-lg sm:text-2xl font-black text-success font-mono">
                            {totalHeldCashFormatted}
                        </div>
                    </div>
                </div>

                {/* Result Feedback Banner */}
                {result && (
                    <div className={`alert ${result.type === 'success' ? 'alert-success text-success-content' : 'alert-error text-error-content'} shadow-sm rounded-2xl flex items-center justify-between`}>
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-2xl">
                                {result.type === 'success' ? 'check_circle' : 'error'}
                            </span>
                            <div>
                                <div className="font-black text-sm">{result.message}</div>
                                {result.detail && <div className="text-xs opacity-90">{result.detail}</div>}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setResult(null)}
                            className="btn btn-ghost btn-xs btn-circle"
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* CASH ON DELIVERY (COD) VIEW */}
                {isCashMode ? (
                    <div className="space-y-4">
                        {/* Alerts Banner */}
                        {codSummary.alerts && codSummary.alerts.length > 0 && (
                            <div className="alert alert-warning shadow-sm rounded-2xl">
                                <span className="material-symbols-outlined text-xl">warning</span>
                                <div>
                                    {codSummary.alerts.map((alert, idx) => (
                                        <div key={idx} className="text-xs font-bold">{alert.message}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Handover Action Card */}
                        <div className="card bg-base-100 shadow-sm border border-base-200/80 p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="font-extrabold text-base text-base-content flex items-center gap-2">
                                        <span className="material-symbols-outlined text-success">account_balance</span>
                                        {lang === 'ar' ? 'تسليم العهدة النقدية إلى الخزينة' : 'Hub Vault Cash Handover'}
                                    </h3>
                                    <p className="text-xs text-base-content/60">
                                        {lang === 'ar' ? 'تسليم المبالغ المحصلة إلى أمين الصندوق في نهاية الوردية' : 'Submit collected cash to the hub vault cashier at the end of your shift'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRemitAmount(String(totalHeldCashKwd || ''));
                                        setIsRemitModalOpen(true);
                                    }}
                                    disabled={totalHeldCashKwd <= 0 && codSummary.shipments?.length === 0}
                                    className="btn btn-success btn-sm font-bold text-success-content shadow-md shadow-success/20 gap-2 shrink-0"
                                >
                                    <span className="material-symbols-outlined text-base">savings</span>
                                    <span>{lang === 'ar' ? 'توريد النقدية' : 'Handover Cash to Vault'}</span>
                                </button>
                            </div>

                            {/* Add Consignment to Handover Input */}
                            <div className="pt-3 border-t border-base-200 space-y-2">
                                <label className="text-xs font-bold text-base-content/80">
                                    {lang === 'ar' ? 'إضافة بوليصة يدوياً للتسليم' : 'Link Shipment to Cash Handover'}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={codTrackingInput}
                                        onChange={(e) => setCodTrackingInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && codTrackingInput.trim() && handleAddCodShipment()}
                                        placeholder="Enter tracking number (e.g. TRK-COD-01)"
                                        className="input input-bordered input-sm flex-1 bg-base-100 font-mono text-sm focus:input-primary"
                                    />
                                    <button
                                        type="button"
                                        disabled={!codTrackingInput.trim() || codTrackingLoading}
                                        onClick={() => handleAddCodShipment()}
                                        className="btn btn-sm btn-primary font-bold px-4"
                                    >
                                        {codTrackingLoading ? <span className="loading loading-spinner loading-xs" /> : '+ Add'}
                                    </button>
                                </div>

                                {codFeedback && (
                                    <div className={`text-xs font-bold p-2.5 rounded-xl ${
                                        codFeedback.type === 'success' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                                    }`}>
                                        {codFeedback.message}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* List of Collected COD Orders */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs font-bold text-base-content/80 px-1">
                                <span>{lang === 'ar' ? 'الشحنات المحصلة' : 'Collected COD Shipments'} ({codSummary.shipments?.length || 0})</span>
                            </div>

                            {(!codSummary.shipments || codSummary.shipments.length === 0) ? (
                                <div className="card bg-base-100 shadow-sm border border-base-200/80 p-8 text-center text-xs text-base-content/50">
                                    {lang === 'ar' ? 'لا توجد مبالغ دفع عند الاستلام مسجلة في هذه الوردية' : 'No COD cash collected on record for this shift.'}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {codSummary.shipments.map(s => {
                                        const isRemitted = s.codStatus === 'REMITTED';
                                        return (
                                            <div key={s.id || s.trackingNumber} className="card bg-base-100 shadow-sm border border-base-200/80 p-4 flex flex-row items-center justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-sm text-base-content">#{s.trackingNumber}</span>
                                                        <span className={`badge badge-xs font-bold ${isRemitted ? 'badge-info' : 'badge-success'}`}>
                                                            {isRemitted ? 'REMITTED' : 'HELD IN HAND'}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-base-content/50 mt-1">
                                                        Updated: {new Date(s.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                <div className="text-end font-mono font-black text-base text-success">
                                                    {Number(s.codAmount).toFixed(3)} {s.codCurrency || 'KWD'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* PICKUPS & DELIVERIES MANIFEST VIEW */
                    <div className="space-y-4">
                        {/* Route Optimizer & Governorate Sequence Header */}
                        {filteredList.length > 0 && (
                            <div className="card bg-primary/5 border border-primary/20 p-4 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div>
                                        <div className="text-sm font-extrabold text-base-content flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-lg">route</span>
                                            <span>{lang === 'ar' ? `مسار التوصيل الذكي (${filteredList.length} محطات)` : `Route Optimizer (${filteredList.length} Stops)`}</span>
                                        </div>
                                        <div className="text-xs text-base-content/60">
                                            {lang === 'ar' ? 'مرتبة جغرافياً حسب محافظات الكويت' : 'Sequenced by Kuwait Governorate'}
                                        </div>
                                    </div>

                                    {multiStopRouteUrl && (
                                        <a
                                            href={multiStopRouteUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="btn btn-primary btn-sm font-bold text-xs gap-1.5 shadow-sm shadow-primary/20 shrink-0"
                                        >
                                            <span className="material-symbols-outlined text-sm">navigation</span>
                                            <span>{lang === 'ar' ? 'بدء مسار خرائط جوجل' : 'Start Google Route'}</span>
                                        </a>
                                    )}
                                </div>

                                {/* Governorate Filter Chips */}
                                <div className="flex gap-1.5 flex-wrap pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedGovFilter('ALL')}
                                        className={`badge badge-sm cursor-pointer font-bold ${
                                            selectedGovFilter === 'ALL' ? 'badge-primary' : 'badge-outline text-base-content/70'
                                        }`}
                                    >
                                        {lang === 'ar' ? 'الكل' : 'All'} ({enrichedList.length})
                                    </button>
                                    {Object.entries(govCounts).map(([gov, count]) => (
                                        <button
                                            key={gov}
                                            type="button"
                                            onClick={() => setSelectedGovFilter(gov)}
                                            className={`badge badge-sm cursor-pointer font-bold ${
                                                selectedGovFilter === gov ? 'badge-primary' : 'badge-outline text-base-content/70'
                                            }`}
                                        >
                                            {gov} ({count})
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quick Scanner Launch Button & Manual Input */}
                        <div className="card bg-base-100 shadow-sm border border-base-200/80 p-4 space-y-3">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsScanning(true)}
                                    className="btn btn-primary btn-sm font-bold gap-2 flex-1 shadow-md shadow-primary/20"
                                >
                                    <span className="material-symbols-outlined text-lg">qr_code_scanner</span>
                                    <span>{isDeliverMode ? (lang === 'ar' ? 'مسح باركود التسليم' : 'Scan to Deliver (POD)') : (lang === 'ar' ? 'مسح باركود الاستلام' : 'Tap to Scan Pickup')}</span>
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={manualTracking}
                                    onChange={e => setManualTracking(e.target.value)}
                                    placeholder={isDeliverMode ? 'Enter tracking # for Delivery POD' : 'Enter tracking # for Pickup'}
                                    onKeyDown={e => e.key === 'Enter' && manualTracking.trim() && handleScan({ text: manualTracking.trim() })}
                                    className="input input-bordered input-sm flex-1 bg-base-100 font-mono text-sm focus:input-primary"
                                />
                                <button
                                    type="button"
                                    disabled={!manualTracking.trim() || manualLoading}
                                    onClick={() => {
                                        setManualLoading(true);
                                        handleScan({ text: manualTracking.trim() }).finally(() => { setManualLoading(false); setManualTracking(''); });
                                    }}
                                    className="btn btn-sm btn-outline border-base-300 font-bold px-4"
                                >
                                    {manualLoading ? <span className="loading loading-spinner loading-xs" /> : 'Enter'}
                                </button>
                            </div>
                        </div>

                        {/* Manifest Stops List */}
                        <div className="space-y-3">
                            {filteredList.length === 0 ? (
                                <div className="card bg-base-100 shadow-sm border border-base-200/80 p-10 text-center space-y-2">
                                    <span className="material-symbols-outlined text-4xl text-base-content/30 mx-auto">task_alt</span>
                                    <div className="text-sm font-bold text-base-content/60">
                                        {isDeliverMode
                                            ? (lang === 'ar' ? 'لا توجد شحنات للتسليم في هذه المحافظة' : 'No packages pending delivery in selected area')
                                            : (lang === 'ar' ? 'لا توجد شحنات جاهزة للاستلام حالياً' : 'No shipments currently pending pickup')}
                                    </div>
                                </div>
                            ) : (
                                filteredList.map((shipment, index) => {
                                    const target = shipment.targetParty || {};
                                    const address = getPartyAddress(target);
                                    const phone = target.phone || '';
                                    const cleanPhone = phone.replace(/\D/g, '');
                                    const singleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
                                    const hasCod = shipment.codAmount && parseFloat(shipment.codAmount) > 0;
                                    const isCurrentLoading = actionLoadingId === shipment.trackingNumber;

                                    return (
                                        <div
                                            key={shipment.trackingNumber || index}
                                            className="card bg-base-100 shadow-sm border border-base-200/80 hover:border-primary/40 transition-all p-4 space-y-3"
                                        >
                                            {/* Stop Header */}
                                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-base-200">
                                                <div className="flex items-center gap-2">
                                                    <span className="badge badge-sm badge-neutral font-bold font-mono">
                                                        Stop #{index + 1}
                                                    </span>
                                                    <span className="font-mono font-bold text-sm text-primary">
                                                        #{shipment.trackingNumber}
                                                    </span>
                                                    <span className="badge badge-xs badge-outline font-semibold">
                                                        {shipment.governorate}
                                                    </span>
                                                </div>

                                                <StatusBadge status={shipment.status} size="xs" />
                                            </div>

                                            {/* Party & Contact Details */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                                <div className="space-y-0.5">
                                                    <div className="font-extrabold text-sm text-base-content">
                                                        {target.name || target.contactPerson || 'Customer'}
                                                    </div>
                                                    {target.company && (
                                                        <div className="text-base-content/70 font-medium">
                                                            {target.company}
                                                        </div>
                                                    )}
                                                    <div className="text-base-content/80 pt-0.5">
                                                        📍 {address}
                                                    </div>
                                                </div>

                                                {/* Contact Actions (Call & WhatsApp) */}
                                                {phone && (
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <a
                                                            href={`tel:${phone}`}
                                                            className="btn btn-outline btn-xs gap-1 font-bold"
                                                        >
                                                            <span className="material-symbols-outlined text-sm text-primary">call</span>
                                                            <span>Call</span>
                                                        </a>
                                                        <a
                                                            href={`https://wa.me/${cleanPhone}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 font-bold"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">chat</span>
                                                            <span>WhatsApp</span>
                                                        </a>
                                                    </div>
                                                )}
                                            </div>

                                            {/* COD Badge Alert */}
                                            {hasCod && (
                                                <div className="p-2.5 rounded-xl bg-success/10 border border-success/30 flex items-center justify-between text-xs font-bold text-success-content">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-success text-base">payments</span>
                                                        <span>{lang === 'ar' ? 'تحصيل نقدي عند الاستلام (COD):' : 'Collect Cash on Delivery:'}</span>
                                                    </div>
                                                    <span className="font-mono font-black text-sm text-success">
                                                        {Number(shipment.codAmount).toFixed(3)} {shipment.codCurrency || 'KWD'}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Card Footer Actions */}
                                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-base-200">
                                                <a
                                                    href={singleNavUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="btn btn-ghost btn-xs text-primary font-bold gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-sm">navigation</span>
                                                    <span>{lang === 'ar' ? 'ملاحة' : 'Navigate'}</span>
                                                </a>

                                                {isDeliverMode ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedPodShipment(shipment);
                                                            setIsPodModalOpen(true);
                                                        }}
                                                        className="btn btn-primary btn-sm font-bold gap-1.5 px-4"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">draw</span>
                                                        <span>{lang === 'ar' ? 'إثبات التسليم (POD)' : 'Deliver & POD'}</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={isCurrentLoading}
                                                        onClick={() => processPickup(shipment.trackingNumber)}
                                                        className="btn btn-primary btn-sm font-bold gap-1.5 px-4"
                                                    >
                                                        {isCurrentLoading && <span className="loading loading-spinner loading-xs" />}
                                                        <span className="material-symbols-outlined text-sm">check</span>
                                                        <span>{lang === 'ar' ? 'تأكيد الاستلام' : 'Confirm Pickup'}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* SCANNER OVERLAY MODAL */}
            {isScanning && (
                <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between p-4">
                    <div className="flex items-center justify-between text-white pb-3 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">qr_code_scanner</span>
                            <span className="font-extrabold text-sm">
                                {isDeliverMode ? 'Scan Waybill to Deliver (POD)' : 'Scan Waybill to Pickup'}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsScanning(false)}
                            className="btn btn-ghost btn-xs btn-circle text-white hover:bg-white/10"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Camera Viewport */}
                    <div className="relative flex-1 rounded-2xl overflow-hidden my-4 border-2 border-white/20 bg-black flex items-center justify-center">
                        {navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? (
                            <Suspense fallback={<div className="loading loading-spinner text-primary loading-lg" />}>
                                <QrScanner
                                    delay={300}
                                    onError={(err) => console.debug('Scanner error:', err)}
                                    onScan={handleScan}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    constraints={{
                                        video: { facingMode: cameraFacingMode }
                                    }}
                                />
                            </Suspense>
                        ) : (
                            <div className="text-error text-xs p-6 text-center">
                                Camera access requires HTTPS or localhost. Please check permissions.
                            </div>
                        )}

                        {/* Scanner Target Box */}
                        <div className="absolute w-64 h-64 border-2 border-primary rounded-2xl pointer-events-none shadow-2xl animate-pulse" />

                        {processing && (
                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-primary">
                                <span className="loading loading-spinner loading-lg" />
                            </div>
                        )}
                    </div>

                    {/* Camera Switch Controls */}
                    <div className="flex items-center justify-center gap-4 py-2">
                        <button
                            type="button"
                            onClick={() => setCameraFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
                            className="btn btn-circle btn-neutral text-white border-white/20"
                        >
                            <span className="material-symbols-outlined">flip_camera_android</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Proof of Delivery Modal */}
            <ProofOfDeliveryModal
                isOpen={isPodModalOpen}
                shipment={selectedPodShipment}
                onClose={() => {
                    setIsPodModalOpen(false);
                    setSelectedPodShipment(null);
                }}
                onDelivered={(updated) => {
                    setIsPodModalOpen(false);
                    setSelectedPodShipment(null);
                    handlePodSuccess(updated);
                }}
            />

            {/* Cash Handover Remittance Modal */}
            {isRemitModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="card bg-base-100 shadow-2xl border border-base-200/80 w-full max-w-md p-5 space-y-4"
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-base-200">
                            <div>
                                <h3 className="font-extrabold text-base text-base-content flex items-center gap-2">
                                    <span className="material-symbols-outlined text-success">payments</span>
                                    {lang === 'ar' ? 'توريد عهدة النقدية إلى الخزينة' : 'Hub Vault Cash Handover'}
                                </h3>
                                <div className="text-xs text-base-content/60">
                                    {lang === 'ar' ? 'تسليم المبالغ النقدية لأمين الصندوق' : 'Submit shift cash count to hub cashier'}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsRemitModalOpen(false)}
                                className="btn btn-ghost btn-xs btn-circle"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="form-control w-full">
                            <label className="text-xs font-bold text-base-content/80 mb-1">
                                Handover Cash Amount *
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.001"
                                    value={remitAmount}
                                    onChange={(e) => setRemitAmount(e.target.value)}
                                    placeholder="0.000"
                                    className="input input-bordered input-sm flex-1 bg-success/5 border-success text-success font-mono font-black text-base"
                                />
                                <select
                                    value={remitCurrency}
                                    onChange={(e) => setRemitCurrency(e.target.value)}
                                    className="select select-bordered select-sm w-24 bg-base-100 font-mono font-bold text-xs"
                                >
                                    <option value="KWD">KWD</option>
                                    <option value="SAR">SAR</option>
                                    <option value="AED">AED</option>
                                    <option value="USD">USD</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-control w-full">
                            <label className="text-xs font-bold text-base-content/80 mb-1">
                                Cash Bag / Security Envelope Ref (Optional)
                            </label>
                            <input
                                type="text"
                                value={remitBagRef}
                                onChange={(e) => setRemitBagRef(e.target.value)}
                                placeholder="e.g. BAG-0915"
                                className="input input-bordered input-sm w-full bg-base-100 text-sm"
                            />
                        </div>

                        <div className="form-control w-full">
                            <label className="text-xs font-bold text-base-content/80 mb-1">
                                Handover Notes (Optional)
                            </label>
                            <input
                                type="text"
                                value={remitNotes}
                                onChange={(e) => setRemitNotes(e.target.value)}
                                placeholder="e.g. Handed to Cashier Ahmed at Shuwaikh Hub"
                                className="input input-bordered input-sm w-full bg-base-100 text-sm"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-base-200">
                            <button
                                type="button"
                                onClick={() => setIsRemitModalOpen(false)}
                                disabled={remitLoading}
                                className="btn btn-sm btn-ghost text-base-content/70"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRemitSubmit}
                                disabled={remitLoading || !remitAmount || parseFloat(remitAmount) <= 0}
                                className="btn btn-sm btn-success font-bold text-success-content shadow-md shadow-success/20 gap-2"
                            >
                                {remitLoading && <span className="loading loading-spinner loading-xs" />}
                                <span>{remitLoading ? 'Submitting...' : 'Submit Handover'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriverPickupPage;
