import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { shipmentService } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import TradeRouteDisplay from '../components/common/TradeRouteDisplay';
import ShipmentInspectorDrawer from '../components/common/ShipmentInspectorDrawer';
import WarehouseIntakeModal from '../components/warehouse/WarehouseIntakeModal';
import { generateCarrierManifestPDF } from '../utils/pdfGenerator';

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
        // audio context blocked or unsupported
    }
};

const WarehouseScanPage = () => {
    const { lang, isRTL } = useLanguage();
    const navigate = useNavigate();

    // Scanner state
    const [manualInput, setManualInput] = useState('');
    const [isScanning, setIsScanning] = useState(true);
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [scanLoading, setScanLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [sessionIntakeCount, setSessionIntakeCount] = useState(0);

    // Inbound queue state
    const [incomingShipments, setIncomingShipments] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [inboundSearch, setInboundSearch] = useState('');

    // Manifest generation state
    const [selectedCarrier, setSelectedCarrier] = useState('ALL');
    const [manifestLoading, setManifestLoading] = useState(false);

    // Modal & Drawer state
    const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
    const [selectedTrackingNumber, setSelectedTrackingNumber] = useState('');
    const [inspectTrackingNumber, setInspectTrackingNumber] = useState(null);

    const toggleCamera = () => {
        setCameraFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    };

    const fetchIncomingShipments = useCallback(async () => {
        setRefreshing(true);
        try {
            const response = await shipmentService.getAllShipments({ status: 'picked_up' });
            if (response?.success && Array.isArray(response.data)) {
                setIncomingShipments(response.data);
            } else if (Array.isArray(response?.data?.shipments)) {
                setIncomingShipments(response.data.shipments);
            }
        } catch (err) {
            console.error('Failed to fetch incoming shipments', err);
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchIncomingShipments();
    }, [fetchIncomingShipments]);

    const handleScan = (data) => {
        if (data && isScanning) {
            setIsScanning(false);
            try {
                const text = data.text || data;
                let trackingNumber = text.toString().trim();
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
            } catch (err) {
                console.error('Scan error:', err);
                playScanBeep('error');
                setError(lang === 'ar' ? 'تنسيق رمز الباركود غير صالح' : 'Invalid barcode or QR format');
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

    const handleCameraError = (err) => {
        console.error('Camera error:', err);
        playScanBeep('error');
        setError(lang === 'ar' ? 'تعذر الوصول إلى الكاميرا. يرجى التأكد من منح الإذن أو استخدام الإدخال اليدوي.' : 'Camera access error or permission denied. Use manual tracking input below.');
    };

    const handleModalClose = () => {
        setIsIntakeModalOpen(false);
        setSelectedTrackingNumber('');
        setError('');
        setIsScanning(true);
    };

    const handleProcessed = (trackingNumber) => {
        setSessionIntakeCount(prev => prev + 1);
        setSuccessMsg(lang === 'ar' ? `تم استلام الشحنة ${trackingNumber} بنجاح!` : `Shipment ${trackingNumber} processed successfully into hub inventory!`);
        fetchIncomingShipments();
    };

    const resetScanner = () => {
        setError('');
        setSuccessMsg('');
        setIsScanning(true);
    };

    const handleGenerateManifest = async (carrier = 'ALL') => {
        try {
            setManifestLoading(true);
            const res = await shipmentService.generateCarrierManifest({ carrier });
            if (res?.data) {
                await generateCarrierManifestPDF(res.data);
            }
        } catch (err) {
            console.error('Error generating carrier manifest:', err);
            alert(err.response?.data?.error || err.message || (lang === 'ar' ? 'فشل إنشاء بيان الشحن' : 'Failed to generate carrier manifest'));
        } finally {
            setManifestLoading(false);
        }
    };

    const filteredInbound = useMemo(() => {
        if (!inboundSearch.trim()) return incomingShipments;
        const q = inboundSearch.toLowerCase();
        return incomingShipments.filter(s =>
            (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q)) ||
            (s.senderAddress?.contactPerson && s.senderAddress.contactPerson.toLowerCase().includes(q)) ||
            (s.receiverAddress?.contactPerson && s.receiverAddress.contactPerson.toLowerCase().includes(q)) ||
            (s.originCity && s.originCity.toLowerCase().includes(q)) ||
            (s.destCity && s.destCity.toLowerCase().includes(q))
        );
    }, [incomingShipments, inboundSearch]);

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* Header Ribbon */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-base-200">
                <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="badge badge-primary font-mono font-bold text-xs uppercase tracking-wider">
                            {lang === 'ar' ? 'مركز عمليات المستودع الرئيسي' : 'Kuwait Hub Terminal • Inbound & Dispatch'}
                        </span>
                        <span className="badge badge-outline border-base-300 text-xs font-mono">
                            SHU-WH-01
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <span className="material-symbols-outlined text-2xl">warehouse</span>
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content">
                                {lang === 'ar' ? 'استلام المستودع والفرز الذكي' : 'Warehouse Intake & Sort Hub'}
                            </h1>
                            <p className="text-xs sm:text-sm text-base-content/60">
                                {lang === 'ar'
                                    ? 'المسح الضوئي للطرود، التحقق من أوزان الميزان المعتمد، وتوليد كشوفات تسليم شركات النقل.'
                                    : 'Optical barcode scanning, certified scale intake, and carrier dispatch manifests.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className="btn btn-sm btn-ghost border border-base-200 gap-1.5 font-bold"
                    >
                        <span className="material-symbols-outlined text-[18px]">dashboard</span>
                        {lang === 'ar' ? 'لوحة القيادة' : 'Dashboard'}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/shipments')}
                        className="btn btn-sm btn-outline border-base-300 hover:border-primary gap-1.5 font-bold"
                    >
                        <span className="material-symbols-outlined text-[18px]">view_list</span>
                        {lang === 'ar' ? 'سجل الشحنات' : 'Shipments'}
                    </button>
                    <button
                        type="button"
                        onClick={fetchIncomingShipments}
                        disabled={refreshing}
                        className="btn btn-sm btn-circle btn-ghost"
                        title={lang === 'ar' ? 'تحديث البيانات' : 'Refresh queue'}
                    >
                        <span className={`material-symbols-outlined text-[20px] ${refreshing ? 'animate-spin' : ''}`}>
                            refresh
                        </span>
                    </button>
                </div>
            </div>

            {/* KPI Pulse Ribbon */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-primary">
                            <span className="material-symbols-outlined text-3xl">local_shipping</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'شحنات في الطريق من السائقين' : 'Driver Pickups En Route'}
                        </div>
                        <div className="stat-value text-2xl font-black text-primary font-mono mt-0.5">
                            {incomingShipments.length}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'بانتظار المسح عند البوابة' : 'Awaiting hub check-in'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-success">
                            <span className="material-symbols-outlined text-3xl">task_alt</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'تم استلامه في هذه الجلسة' : 'Session Hub Intakes'}
                        </div>
                        <div className="stat-value text-2xl font-black text-success font-mono mt-0.5">
                            {sessionIntakeCount}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'طرود تم تسجيلها بالمستودع' : 'Parcels verified today'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-info">
                            <span className="material-symbols-outlined text-3xl">scale</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'ميزان المستودع المعتمد' : 'Scale Gateway Status'}
                        </div>
                        <div className="stat-value text-base font-black text-info mt-1 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse inline-block"></span>
                            {lang === 'ar' ? 'جاهز ومتصل' : 'Calibrated & Ready'}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'تسامح الخطأ: 0.05 كجم' : 'Tolerance limit: 0.05 kg'}
                        </div>
                    </div>
                </div>

                <div className="stats bg-base-100 border border-base-200/80 shadow-xs rounded-2xl">
                    <div className="stat p-4">
                        <div className="stat-figure text-warning">
                            <span className="material-symbols-outlined text-3xl">outgoing_mail</span>
                        </div>
                        <div className="stat-title text-xs font-bold text-base-content/60 uppercase">
                            {lang === 'ar' ? 'بيانات الشحن الصادرة' : 'Line-haul Manifest'}
                        </div>
                        <div className="stat-value text-base font-black text-base-content mt-1">
                            {selectedCarrier}
                        </div>
                        <div className="stat-desc text-[11px] text-base-content/50">
                            {lang === 'ar' ? 'جاهز للتوليد والتصدير' : 'Ready for flight handover'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Interactive Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Optical Scanner & Manual Input (7 cols) */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Scanner Terminal Card */}
                    <div className="card bg-base-100 border border-base-200/80 shadow-xs overflow-hidden">
                        <div className="card-body p-5 sm:p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-xl">qr_code_scanner</span>
                                    <h2 className="card-title text-base sm:text-lg font-black text-base-content">
                                        {lang === 'ar' ? 'ماسح الباركود ورمز QR المباشر' : 'Live Optical Barcode & QR Scanner'}
                                    </h2>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={toggleCamera}
                                        className="btn btn-xs btn-outline border-base-300 gap-1"
                                        title={lang === 'ar' ? 'تبديل الكاميرا' : 'Switch camera'}
                                    >
                                        <span className="material-symbols-outlined text-[15px]">flip_camera_ios</span>
                                        <span className="hidden sm:inline">{lang === 'ar' ? 'تبديل العدسة' : 'Flip Lens'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsScanning(prev => !prev)}
                                        className={`btn btn-xs ${isScanning ? 'btn-ghost' : 'btn-primary'}`}
                                    >
                                        {isScanning ? (lang === 'ar' ? 'إيقاف مؤقت' : 'Pause') : (lang === 'ar' ? 'استئناف' : 'Resume')}
                                    </button>
                                </div>
                            </div>

                            {/* Error Banner */}
                            {error && (
                                <div className="alert alert-error text-xs font-semibold py-2.5 rounded-xl">
                                    <span className="material-symbols-outlined text-base">error</span>
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Success State or Viewport */}
                            {successMsg ? (
                                <div className="bg-success/5 border border-success/30 rounded-2xl p-8 text-center space-y-4">
                                    <div className="w-16 h-16 rounded-2xl bg-success text-white flex items-center justify-center mx-auto shadow-lg shadow-success/20">
                                        <span className="material-symbols-outlined text-3xl">verified</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-base-content">
                                            {lang === 'ar' ? 'اكتمل استلام الطرد بنجاح' : 'Consignment Intake Complete!'}
                                        </h3>
                                        <p className="text-xs text-base-content/70 mt-1 max-w-md mx-auto">
                                            {successMsg}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-center gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={resetScanner}
                                            className="btn btn-primary btn-sm font-bold shadow-md shadow-primary/20 gap-1.5"
                                        >
                                            <span className="material-symbols-outlined text-[17px]">qr_code_scanner</span>
                                            {lang === 'ar' ? 'مسح طرد تالٍ' : 'Scan Next Parcel'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/shipments')}
                                            className="btn btn-ghost btn-sm text-xs font-semibold"
                                        >
                                            {lang === 'ar' ? 'عرض السجل' : 'View in Ledger'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* High Contrast Camera Reticle Viewport */}
                                    <div className="relative rounded-2xl overflow-hidden bg-slate-950 h-72 sm:h-80 flex items-center justify-center border border-slate-800 shadow-inner">
                                        {scanLoading && (
                                            <div className="absolute inset-0 z-20 bg-black/70 flex flex-col items-center justify-center gap-2">
                                                <span className="loading loading-spinner loading-md text-primary"></span>
                                                <span className="text-white text-xs font-semibold">
                                                    {lang === 'ar' ? 'جاري جلب تفاصيل الشحنة...' : 'Resolving waybill...'}
                                                </span>
                                            </div>
                                        )}

                                        {isScanning ? (
                                            navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? (
                                                <Suspense fallback={
                                                    <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                                                        <span className="loading loading-spinner text-primary"></span>
                                                        <span className="text-xs">{lang === 'ar' ? 'جاري بدء الكاميرا...' : 'Starting camera feed...'}</span>
                                                    </div>
                                                }>
                                                    <QrScanner
                                                        delay={300}
                                                        onError={handleCameraError}
                                                        onScan={handleScan}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        constraints={{ video: { facingMode: cameraFacingMode } }}
                                                    />
                                                </Suspense>
                                            ) : (
                                                <div className="p-6 text-center text-rose-400 text-xs z-10 max-w-sm">
                                                    <span className="material-symbols-outlined text-3xl mb-1 text-rose-400">videocam_off</span>
                                                    <p>{lang === 'ar' ? 'يتطلب الوصول للكاميرا اتصالاً آمناً (HTTPS) أو تشغيلاً محلياً. استخدم الإدخال اليدوي أو ماسح USB أدناه.' : 'Camera access requires HTTPS or localhost. Please use the USB scanner / manual waybill entry below.'}</p>
                                                </div>
                                            )
                                        ) : (
                                            <div className="text-center text-slate-400 space-y-2 z-10">
                                                <span className="material-symbols-outlined text-4xl text-slate-500">motion_photos_paused</span>
                                                <p className="text-xs font-semibold">{lang === 'ar' ? 'تم إيقاف الماسح الضوئي مؤقتاً' : 'Scanner paused'}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsScanning(true)}
                                                    className="btn btn-xs btn-primary font-bold"
                                                >
                                                    {lang === 'ar' ? 'استئناف المسح' : 'Resume Scan'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Targeting HUD Reticle Overlay */}
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                            {/* Mask cutout border */}
                                            <div className="relative w-64 h-48 sm:w-72 sm:h-52 border-2 border-primary/80 rounded-2xl shadow-[0_0_20px_rgba(0,80,212,0.3)]">
                                                {/* Corner brackets */}
                                                <div className="absolute -top-1 -start-1 w-5 h-5 border-t-4 border-s-4 border-primary rounded-tl-lg"></div>
                                                <div className="absolute -top-1 -end-1 w-5 h-5 border-t-4 border-e-4 border-primary rounded-tr-lg"></div>
                                                <div className="absolute -bottom-1 -start-1 w-5 h-5 border-b-4 border-s-4 border-primary rounded-bl-lg"></div>
                                                <div className="absolute -bottom-1 -end-1 w-5 h-5 border-b-4 border-e-4 border-primary rounded-br-lg"></div>

                                                {/* Horizontal Scanning Laser line */}
                                                {isScanning && (
                                                    <div className="absolute start-2 end-2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-[bounce_2.2s_infinite]"></div>
                                                )}

                                                <div className="absolute bottom-2 start-0 end-0 text-center">
                                                    <span className="bg-black/60 backdrop-blur-xs text-[10px] font-mono font-bold text-white/80 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                                        {lang === 'ar' ? 'ضع الرمز في الإطار' : 'Align Barcode in frame'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* USB Gun Scanner / Manual Input Form */}
                                    <form onSubmit={handleManualSubmit} className="flex gap-2">
                                        <div className="relative flex-1">
                                            <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-base-content/40">
                                                <span className="material-symbols-outlined text-[19px]">barcode_reader</span>
                                            </div>
                                            <input
                                                type="text"
                                                value={manualInput}
                                                onChange={(e) => setManualInput(e.target.value)}
                                                placeholder={lang === 'ar' ? 'أدخل رقم التتبع يدوياً أو استخدم ماسح الباركود USB...' : 'Scan with USB gun or enter tracking number...'}
                                                className="input input-bordered w-full ps-10 font-mono text-sm font-bold bg-base-100 focus:input-primary"
                                                autoFocus
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!manualInput.trim()}
                                            className="btn btn-primary font-bold px-5 gap-1.5 shadow-md shadow-primary/20"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">input</span>
                                            {lang === 'ar' ? 'استلام' : 'Intake'}
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Carrier Dispatch Manifest Generator */}
                    <div className="card bg-base-100 border border-base-200/80 shadow-xs">
                        <div className="card-body p-5 sm:p-6 space-y-4">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-xl">assignment_turned_in</span>
                                <div>
                                    <h2 className="card-title text-base sm:text-lg font-black text-base-content">
                                        {lang === 'ar' ? 'كشف تسليم الناقل الرسمي (Carrier Handover Manifest)' : 'Official Carrier Dispatch Manifest'}
                                    </h2>
                                    <p className="text-xs text-base-content/60">
                                        {lang === 'ar'
                                            ? 'توليد إيصال تسليم رسمي بصيغة PDF لرحلات الشحن الصادرة وسائقي الشركاء.'
                                            : 'Generate an official custody handover receipt and consolidated manifest PDF.'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {[
                                    { id: 'ALL', label: lang === 'ar' ? 'جميع شركات النقل' : 'All Carriers' },
                                    { id: 'DHL', label: 'DHL Express' },
                                    { id: 'LOGESTECHS', label: 'LogesTechs 3PL' },
                                    { id: 'INTERNAL', label: lang === 'ar' ? 'الأسطول الداخلي' : 'Internal Fleet' },
                                ].map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelectedCarrier(c.id)}
                                        className={`btn btn-sm ${
                                            selectedCarrier === c.id
                                                ? 'btn-primary'
                                                : 'btn-outline border-base-300 text-base-content/70 hover:bg-base-200'
                                        }`}
                                    >
                                        {c.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => handleGenerateManifest(selectedCarrier)}
                                disabled={manifestLoading}
                                className="btn btn-primary w-full font-bold shadow-md shadow-primary/20 gap-2"
                            >
                                {manifestLoading ? (
                                    <span className="loading loading-spinner loading-xs"></span>
                                ) : (
                                    <span className="material-symbols-outlined text-[19px]">picture_as_pdf</span>
                                )}
                                {manifestLoading
                                    ? (lang === 'ar' ? 'جاري تجميع كشف التسليم الرسمي...' : 'Compiling Official Manifest...')
                                    : (lang === 'ar' ? `توليد وتصدير كشف PDF (${selectedCarrier})` : `Generate Official PDF Manifest (${selectedCarrier})`)}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Column: Inbound Pickups En Route Queue (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                    <div className="card bg-base-100 border border-base-200/80 shadow-xs">
                        <div className="card-body p-5 space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-info text-xl">inventory_2</span>
                                    <div>
                                        <h2 className="card-title text-base font-black text-base-content flex items-center gap-2">
                                            {lang === 'ar' ? 'شحنات السائقين الواردة' : 'Incoming Driver Pickups'}
                                            <span className="badge badge-primary badge-sm font-mono font-bold">
                                                {incomingShipments.length}
                                            </span>
                                        </h2>
                                        <p className="text-[11px] text-base-content/60">
                                            {lang === 'ar' ? 'طرود تم جمعها بواسطة المناديب وفي طريقها للمستودع' : 'Parcels collected on road awaiting warehouse check-in'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchIncomingShipments}
                                    disabled={refreshing}
                                    className="btn btn-xs btn-ghost btn-circle"
                                    title={lang === 'ar' ? 'تحديث' : 'Refresh'}
                                >
                                    <span className={`material-symbols-outlined text-[18px] ${refreshing ? 'animate-spin' : ''}`}>
                                        refresh
                                    </span>
                                </button>
                            </div>

                            {/* Search filter input */}
                            {incomingShipments.length > 0 && (
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute inset-y-0 start-3 my-auto h-fit text-base-content/40 text-[18px]">
                                        search
                                    </span>
                                    <input
                                        type="text"
                                        value={inboundSearch}
                                        onChange={(e) => setInboundSearch(e.target.value)}
                                        placeholder={lang === 'ar' ? 'بحث برقم الشحنة أو العميل...' : 'Filter incoming waybill, customer...'}
                                        className="input input-sm input-bordered w-full ps-9 text-xs bg-base-100 focus:input-primary"
                                    />
                                    {inboundSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setInboundSearch('')}
                                            className="absolute inset-y-0 end-2.5 my-auto h-fit text-xs text-base-content/40 hover:text-base-content"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Inbound List */}
                            <div className="space-y-2.5 max-h-[580px] overflow-y-auto pe-1">
                                {incomingShipments.length === 0 ? (
                                    <div className="py-12 text-center text-base-content/50 space-y-2">
                                        <div className="w-12 h-12 rounded-2xl bg-base-200 text-base-content/40 flex items-center justify-center mx-auto">
                                            <span className="material-symbols-outlined text-2xl">check_circle</span>
                                        </div>
                                        <div className="text-xs font-bold text-base-content">
                                            {lang === 'ar' ? 'لا توجد شحنات بالانتظار' : 'All driver collections processed'}
                                        </div>
                                        <p className="text-[11px] text-base-content/50 max-w-xs mx-auto">
                                            {lang === 'ar' ? 'تم استلام كافة الطرود التي جمعها السائقون في المستودع بنجاح.' : 'Every parcel collected in the field has been checked into the hub.'}
                                        </p>
                                    </div>
                                ) : filteredInbound.length === 0 ? (
                                    <div className="py-8 text-center text-base-content/50 text-xs">
                                        {lang === 'ar' ? 'لا توجد نتائج مطابقة لبحثك' : 'No incoming consignments match search'}
                                    </div>
                                ) : (
                                    filteredInbound.map((s) => (
                                        <div
                                            key={s.trackingNumber || s.id}
                                            className="group bg-base-200/40 hover:bg-base-200/80 border border-base-200 hover:border-primary/40 rounded-2xl p-3.5 transition-all flex flex-col gap-2.5"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-xs text-base-content group-hover:text-primary transition-colors">
                                                        {s.trackingNumber}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setInspectTrackingNumber(s.trackingNumber);
                                                        }}
                                                        className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity text-base-content/60 hover:text-primary"
                                                        title={lang === 'ar' ? 'معاينة سريعة' : 'Quick inspect dossier'}
                                                    >
                                                        <span className="material-symbols-outlined text-[15px]">visibility</span>
                                                    </button>
                                                </div>
                                                <StatusBadge status={s.status || 'picked_up'} />
                                            </div>

                                            <div className="flex items-center justify-between text-xs">
                                                <TradeRouteDisplay
                                                    originCountry={s.originCountry || s.senderAddress?.country || 'KW'}
                                                    destCountry={s.destCountry || s.receiverAddress?.country || 'SA'}
                                                    originCity={s.originCity || s.senderAddress?.city || ''}
                                                    destCity={s.destCity || s.receiverAddress?.city || ''}
                                                />
                                                <span className="badge badge-neutral badge-xs font-mono font-bold">
                                                    {s.carrierCode || 'INTERNAL'}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between pt-1 border-t border-base-200/60 text-[11px] text-base-content/60">
                                                <div className="truncate max-w-[200px]">
                                                    {s.senderAddress?.contactPerson || s.sender?.name || (lang === 'ar' ? 'العميل' : 'Shipper')}
                                                    {s.driver?.name && ` • ${lang === 'ar' ? 'السائق:' : 'Driver:'} ${s.driver.name}`}
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedTrackingNumber(s.trackingNumber);
                                                        setIsIntakeModalOpen(true);
                                                    }}
                                                    className="btn btn-primary btn-xs font-bold gap-1 shadow-xs"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">scale</span>
                                                    {lang === 'ar' ? 'فحص واستلام' : 'Intake Scale'}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Warehouse Hub Intake Scale Modal */}
            <WarehouseIntakeModal
                isOpen={isIntakeModalOpen}
                onClose={handleModalClose}
                trackingNumber={selectedTrackingNumber}
                onProcessed={handleProcessed}
            />

            {/* Quick Dossier Inspector Drawer */}
            <ShipmentInspectorDrawer
                isOpen={!!inspectTrackingNumber}
                onClose={() => setInspectTrackingNumber(null)}
                trackingNumber={inspectTrackingNumber}
            />
        </div>
    );
};

export default WarehouseScanPage;
