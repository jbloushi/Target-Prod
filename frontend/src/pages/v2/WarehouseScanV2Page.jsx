import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useLanguage } from '../../context/LanguageContext';
import { shipmentService } from '../../services/api';
import StatusBadge from '../../components/common/StatusBadge';
import TradeRouteDisplay from '../../components/common/TradeRouteDisplay';
import ShipmentInspectorDrawer from '../../components/common/ShipmentInspectorDrawer';
import WarehouseIntakeModal from '../../components/warehouse/WarehouseIntakeModal';
import { generateCarrierManifestPDF } from '../../utils/pdfGenerator';
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

const QrScanner = lazy(() => import('react-qr-scanner'));

const playScanBeep = (type = 'success') => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'success') {
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
            osc.start();
            osc.stop(ctx.currentTime + 0.22);
        } else {
            osc.frequency.setValueAtTime(260, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
            osc.start();
            osc.stop(ctx.currentTime + 0.28);
        }
    } catch {
        // AudioContext blocked or unsupported
    }
};

export const WarehouseScanV2Page = () => {
    const { lang } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();
    const isRTL = lang === 'ar';

    // Scanner state
    const [manualInput, setManualInput] = useState('');
    const [isScanning, setIsScanning] = useState(true);
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [scanError, setScanError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [sessionIntakeCount, setSessionIntakeCount] = useState(0);

    // Inbound queue state
    const [incomingShipments, setIncomingShipments] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [inboundSearch, setInboundSearch] = useState('');

    // Manifest generation state
    const [selectedCarrier, setSelectedCarrier] = useState('ALL');
    const [manifestLoading, setManifestLoading] = useState(false);

    // Modal & Drawer state
    const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
    const [selectedTrackingNumber, setSelectedTrackingNumber] = useState('');
    const [inspectTrackingNumber, setInspectTrackingNumber] = useState(null);

    const fetchIncomingShipments = useCallback(async () => {
        setRefreshing(true);
        setLoadError('');
        try {
            const response = await shipmentService.getAllShipments({ status: 'picked_up' });
            if (response?.success && Array.isArray(response.data)) {
                setIncomingShipments(response.data);
            } else if (Array.isArray(response?.data?.shipments)) {
                setIncomingShipments(response.data.shipments);
            } else {
                setIncomingShipments([]);
            }
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || (isRTL ? 'تعذر تحميل قائمة الشحنات الواردة.' : 'Failed to load incoming shipments.');
            setLoadError(msg);
        } finally {
            setRefreshing(false);
        }
    }, [isRTL]);

    useEffect(() => {
        fetchIncomingShipments();
    }, [fetchIncomingShipments]);

    const handleScan = (data) => {
        if (data && isScanning) {
            setIsScanning(false);
            try {
                const text = data.text || data;
                let trackingNumber = String(text).trim();
                try {
                    const json = JSON.parse(text);
                    if (json.tracking) trackingNumber = json.tracking;
                } catch {
                    // plain text barcode
                }
                if (trackingNumber) {
                    playScanBeep('success');
                    setSelectedTrackingNumber(trackingNumber);
                    setIsIntakeModalOpen(true);
                }
            } catch {
                playScanBeep('error');
                setScanError(isRTL ? 'تنسيق رمز الباركود غير صالح' : 'Invalid barcode or QR format');
                setTimeout(() => setIsScanning(true), 2000);
            }
        }
    };

    const handleManualSubmit = (e) => {
        e.preventDefault();
        const tracking = manualInput.trim();
        if (!tracking) return;
        setManualInput('');
        playScanBeep('success');
        setSelectedTrackingNumber(tracking);
        setIsIntakeModalOpen(true);
    };

    const handleCameraError = () => {
        playScanBeep('error');
        setScanError(
            isRTL
                ? 'تعذر الوصول إلى الكاميرا. يرجى التأكد من منح الإذن أو استخدام الإدخال اليدوي.'
                : 'Camera access error or permission denied. Use manual tracking input below.'
        );
    };

    const handleModalClose = () => {
        setIsIntakeModalOpen(false);
        setSelectedTrackingNumber('');
        setScanError('');
        setIsScanning(true);
    };

    const handleProcessed = (trackingNumber) => {
        setSessionIntakeCount((prev) => prev + 1);
        setSuccessMsg(
            isRTL
                ? `تم استلام الشحنة ${trackingNumber} في المستودع بنجاح.`
                : `Shipment ${trackingNumber} checked into hub inventory.`
        );
        fetchIncomingShipments();
    };

    const handleGenerateManifest = async (carrier = 'ALL') => {
        try {
            setManifestLoading(true);
            const res = await shipmentService.generateCarrierManifest({ carrier });
            if (res?.data) {
                await generateCarrierManifestPDF(res.data);
                enqueueSnackbar(isRTL ? 'تم توليد كشف تسليم الناقل بنجاح' : 'Carrier manifest generated', { variant: 'success' });
            }
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || (isRTL ? 'فشل إنشاء بيان الشحن' : 'Failed to generate carrier manifest');
            setScanError(msg);
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setManifestLoading(false);
        }
    };

    const filteredInbound = useMemo(() => {
        if (!inboundSearch.trim()) return incomingShipments;
        const q = inboundSearch.toLowerCase();
        return incomingShipments.filter((s) =>
            (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q)) ||
            (s.senderAddress?.contactPerson && s.senderAddress.contactPerson.toLowerCase().includes(q)) ||
            (s.receiverAddress?.contactPerson && s.receiverAddress.contactPerson.toLowerCase().includes(q)) ||
            (s.originCity && s.originCity.toLowerCase().includes(q)) ||
            (s.destCity && s.destCity.toLowerCase().includes(q))
        );
    }, [incomingShipments, inboundSearch]);

    return (
        <div
            dir={isRTL ? 'rtl' : 'ltr'}
            className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden"
        >
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/80 dark:bg-sky-950/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-base text-primary shrink-0" aria-hidden="true">warehouse</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {isRTL ? 'واجهة استلام المستودع المطورة V2' : 'Warehouse Intake & Sort Hub V2'}
                        </span>
                    </div>
                    <Link to="/warehouse/scan" className="font-bold text-primary dark:text-sky-400 hover:underline shrink-0">
                        {isRTL ? 'العودة إلى V1' : 'Switch to V1'}
                    </Link>
                </div>

                {/* Page Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-2xl" aria-hidden="true">warehouse</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                                {isRTL ? 'استلام المستودع والفرز الذكي' : 'Warehouse Intake & Sort Hub'}
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                                {isRTL ? 'المسح الضوئي، الميزان المعتمد، وتوليد كشوفات شركات النقل' : 'Barcode scanning, certified scale intake & carrier dispatch manifests'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Link
                            to="/dashboard-v2"
                            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold inline-flex items-center gap-1.5 hover:border-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">dashboard</span>
                            <span>{isRTL ? 'لوحة القيادة' : 'Dashboard'}</span>
                        </Link>
                        <Link
                            to="/shipments-v2"
                            className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold inline-flex items-center gap-1.5 hover:border-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">view_list</span>
                            <span>{isRTL ? 'الشحنات' : 'Shipments'}</span>
                        </Link>
                        <button
                            type="button"
                            onClick={fetchIncomingShipments}
                            disabled={refreshing}
                            aria-label={isRTL ? 'تحديث القائمة' : 'Refresh queue'}
                            className="min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center hover:border-primary transition-colors cursor-pointer"
                        >
                            <span className={`material-symbols-outlined text-lg ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                        </button>
                    </div>
                </header>

                {loadError && (
                    <ErrorBannerV2 message={loadError} onRetry={fetchIncomingShipments} isRetrying={refreshing} />
                )}

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <MetricCardV2
                        title={isRTL ? 'شحنات في الطريق' : 'Pickups En Route'}
                        value={incomingShipments.length}
                        subtitle={isRTL ? 'بانتظار المسح' : 'Awaiting hub check-in'}
                        icon="local_shipping"
                        tone="info"
                    />
                    <MetricCardV2
                        title={isRTL ? 'استلام الجلسة' : 'Session Intakes'}
                        value={sessionIntakeCount}
                        subtitle={isRTL ? 'طرود تم فحصها' : 'Parcels verified'}
                        icon="task_alt"
                        tone="success"
                    />
                    <MetricCardV2
                        title={isRTL ? 'الميزان المعتمد' : 'Scale Gateway'}
                        value={isRTL ? 'متصل' : 'Ready'}
                        subtitle={isRTL ? 'دقة ±0.05 كجم' : 'Tolerance ±0.05 kg'}
                        icon="scale"
                        tone="neutral"
                    />
                    <MetricCardV2
                        title={isRTL ? 'كشف التسليم' : 'Line-haul Carrier'}
                        value={selectedCarrier}
                        subtitle={isRTL ? 'جاهز للتصدير' : 'Ready for handover'}
                        icon="outgoing_mail"
                        tone="warning"
                    />
                </div>

                {/* Main Split Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    {/* Left: Optical Scanner & Carrier Manifest */}
                    <div className="lg:col-span-7 space-y-5 min-w-0">
                        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">qr_code_scanner</span>
                                    <span>{isRTL ? 'ماسح الباركود المباشر' : 'Live Optical Barcode & QR Scanner'}</span>
                                </h2>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setCameraFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                                        className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-sm" aria-hidden="true">flip_camera_ios</span>
                                        <span>{isRTL ? 'تبديل' : 'Flip'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsScanning((prev) => !prev)}
                                        className={`min-h-[36px] px-3 rounded-xl text-xs font-bold cursor-pointer ${
                                            isScanning
                                                ? 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                                                : 'bg-primary text-white'
                                        }`}
                                    >
                                        {isScanning ? (isRTL ? 'إيقاف مؤقت' : 'Pause') : (isRTL ? 'استئناف' : 'Resume')}
                                    </button>
                                </div>
                            </div>

                            {scanError && (
                                <ErrorBannerV2
                                    message={scanError}
                                    onRetry={() => { setScanError(''); setIsScanning(true); }}
                                />
                            )}

                            {successMsg && (
                                <div role="status" className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100 px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2">
                                    <span>{successMsg}</span>
                                    <button type="button" onClick={() => setSuccessMsg('')} className="text-xs font-bold hover:underline cursor-pointer">
                                        {isRTL ? 'إغلاق' : 'Dismiss'}
                                    </button>
                                </div>
                            )}

                            <div className="rounded-xl overflow-hidden bg-slate-950 aspect-video max-h-72 flex items-center justify-center">
                                {isScanning ? (
                                    navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? (
                                        <Suspense fallback={<div className="text-xs text-slate-400">{isRTL ? 'جاري تشغيل الكاميرا...' : 'Starting camera...'}</div>}>
                                            <QrScanner
                                                delay={300}
                                                onError={handleCameraError}
                                                onScan={handleScan}
                                                constraints={{ video: { facingMode: cameraFacingMode } }}
                                                style={{ width: '100%', height: '100%' }}
                                            />
                                        </Suspense>
                                    ) : (
                                        <div className="p-6 text-center text-rose-400 text-xs max-w-sm">
                                            <span className="material-symbols-outlined text-3xl mb-1" aria-hidden="true">videocam_off</span>
                                            <p>{isRTL ? 'يتطلب الوصول للكاميرا اتصالاً آمناً (HTTPS) أو تشغيلاً محلياً. استخدم الإدخال اليدوي أدناه.' : 'Camera access requires HTTPS or localhost. Use manual tracking entry below.'}</p>
                                        </div>
                                    )
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setIsScanning(true)}
                                        className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer"
                                    >
                                        {isRTL ? 'تشغيل الماسح الضوئي' : 'Resume Scanner'}
                                    </button>
                                )}
                            </div>

                            <form onSubmit={handleManualSubmit} className="flex gap-2">
                                <input
                                    type="text"
                                    value={manualInput}
                                    onChange={(e) => setManualInput(e.target.value)}
                                    placeholder={isRTL ? 'أدخل رقم البوليصة يدوياً واضغط Enter...' : 'Enter or scan tracking number manually...'}
                                    className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs sm:text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={!manualInput.trim()}
                                    className="min-h-[44px] px-4 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer disabled:opacity-50 shrink-0"
                                >
                                    {isRTL ? 'فحص واستلام' : 'Intake Scale'}
                                </button>
                            </form>
                        </section>

                        {/* Carrier Handover Manifest */}
                        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3 shadow-2xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                                        {isRTL ? 'تصدير كشوفات تسليم شركات النقل' : 'Carrier Line-Haul Manifests'}
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {isRTL ? 'توليد ملف PDF معتمد لتسليم الشحنات المفحوصة' : 'Generate handover PDF for hub-verified shipments'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={selectedCarrier}
                                    onChange={(e) => setSelectedCarrier(e.target.value)}
                                    className="min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold flex-1 sm:flex-none sm:w-48"
                                >
                                    <option value="ALL">{isRTL ? 'جميع الناقلين' : 'All Carriers'}</option>
                                    <option value="DHL">DHL Express</option>
                                    <option value="LOGESTECHS">LogesTechs 3PL</option>
                                    <option value="ARAMEX">Aramex</option>
                                    <option value="FEDEX">FedEx Express</option>
                                    <option value="SMSA">SMSA Express</option>
                                    <option value="INTERNAL">{isRTL ? 'الأسطول الداخلي' : 'Internal Fleet'}</option>
                                </select>
                                <button
                                    type="button"
                                    disabled={manifestLoading}
                                    onClick={() => handleGenerateManifest(selectedCarrier)}
                                    className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-base" aria-hidden="true">picture_as_pdf</span>
                                    <span>{manifestLoading ? (isRTL ? 'جاري التوليد...' : 'Generating...') : (isRTL ? 'توليد كشف PDF' : 'Generate Manifest PDF')}</span>
                                </button>
                            </div>
                        </section>
                    </div>

                    {/* Right: Inbound Queue */}
                    <section className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-3.5 shadow-2xs min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                {isRTL ? `الطرود الواردة (${incomingShipments.length})` : `Inbound Queue (${incomingShipments.length})`}
                            </h2>
                            <button
                                type="button"
                                onClick={fetchIncomingShipments}
                                disabled={refreshing}
                                className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                                <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true">refresh</span>
                                <span>{isRTL ? 'تحديث' : 'Refresh'}</span>
                            </button>
                        </div>

                        {incomingShipments.length > 0 && (
                            <div className="relative">
                                <span className="material-symbols-outlined absolute inset-y-0 start-3 my-auto h-fit text-slate-400 text-lg" aria-hidden="true">
                                    search
                                </span>
                                <input
                                    type="text"
                                    value={inboundSearch}
                                    onChange={(e) => setInboundSearch(e.target.value)}
                                    placeholder={isRTL ? 'بحث برقم الشحنة أو العميل...' : 'Filter waybill or customer...'}
                                    className="w-full min-h-[42px] ps-9 pe-8 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                                />
                                {inboundSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setInboundSearch('')}
                                        aria-label={isRTL ? 'مسح البحث' : 'Clear search'}
                                        className="absolute inset-y-0 end-2.5 my-auto h-fit text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="space-y-2.5 max-h-[580px] overflow-y-auto pe-0.5">
                            {incomingShipments.length === 0 ? (
                                <EmptyStateV2
                                    icon="check_circle"
                                    title={isRTL ? 'لا توجد شحنات بالانتظار' : 'All Driver Collections Processed'}
                                    description={isRTL ? 'تم استلام كافة الطرود التي جمعها السائقون في المستودع.' : 'Every parcel collected in the field has been checked into the hub.'}
                                />
                            ) : filteredInbound.length === 0 ? (
                                <EmptyStateV2
                                    icon="search_off"
                                    title={isRTL ? 'لا توجد نتائج مطابقة' : 'No Matching Shipments'}
                                    description={isRTL ? 'جرّب البحث برقم بوليصة آخر.' : 'Try adjusting your tracking or customer filter.'}
                                />
                            ) : (
                                filteredInbound.map((s) => (
                                    <article
                                        key={s.trackingNumber || s.id}
                                        className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 p-3.5 space-y-2.5"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Link
                                                    to={`/shipment-v2/${s.trackingNumber}`}
                                                    className="font-mono font-bold text-xs text-primary dark:text-sky-400 hover:underline truncate"
                                                >
                                                    {s.trackingNumber}
                                                </Link>
                                                <button
                                                    type="button"
                                                    onClick={() => setInspectTrackingNumber(s.trackingNumber)}
                                                    aria-label={isRTL ? 'معاينة سريعة' : 'Quick inspect'}
                                                    className="min-h-[32px] min-w-[32px] rounded-lg flex items-center justify-center text-slate-500 hover:text-primary hover:bg-white dark:hover:bg-slate-700 cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-base" aria-hidden="true">visibility</span>
                                                </button>
                                            </div>
                                            <StatusBadge status={s.status || 'picked_up'} size="xs" />
                                        </div>

                                        <div className="flex items-center justify-between gap-2 text-xs">
                                            <TradeRouteDisplay
                                                originCountry={s.originCountry || s.senderAddress?.country || 'KW'}
                                                destCountry={s.destCountry || s.receiverAddress?.country || 'SA'}
                                                originCity={s.originCity || s.senderAddress?.city || ''}
                                                destCity={s.destCity || s.receiverAddress?.city || ''}
                                            />
                                            <span className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono text-[10px] font-bold shrink-0">
                                                {s.carrierCode || 'INTERNAL'}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-700 text-xs">
                                            <span className="text-slate-600 dark:text-slate-300 truncate min-w-0">
                                                {s.senderAddress?.contactPerson || s.sender?.name || (isRTL ? 'العميل' : 'Shipper')}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTrackingNumber(s.trackingNumber);
                                                    setIsIntakeModalOpen(true);
                                                }}
                                                className="min-h-[36px] px-3 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                                            >
                                                <span className="material-symbols-outlined text-sm" aria-hidden="true">scale</span>
                                                <span>{isRTL ? 'فحص واستلام' : 'Intake Scale'}</span>
                                            </button>
                                        </div>
                                    </article>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>

            <WarehouseIntakeModal
                isOpen={isIntakeModalOpen}
                onClose={handleModalClose}
                trackingNumber={selectedTrackingNumber}
                onProcessed={handleProcessed}
            />

            <ShipmentInspectorDrawer
                isOpen={!!inspectTrackingNumber}
                onClose={() => setInspectTrackingNumber(null)}
                trackingNumber={inspectTrackingNumber}
            />
        </div>
    );
};

export default WarehouseScanV2Page;
