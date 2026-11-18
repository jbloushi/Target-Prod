import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { fleetService } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/common/StatusBadge';
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

/**
 * Normalize phone digits for WhatsApp deep links.
 * Preserves international numbers such as +201040957289 while adding 965 for 8-digit Kuwait local numbers.
 */
const formatWhatsAppDigits = (rawPhone) => {
    const digits = String(rawPhone || '').replace(/\D/g, '').replace(/^00/, '');
    if (!digits) return '';
    if (digits.length === 8) return `965${digits}`;
    return digits;
};

export const DriverRunV2Page = () => {
    const { enqueueSnackbar } = useSnackbar();
    const { lang } = useLanguage();
    const { user } = useAuth();
    const isRTL = lang === 'ar';

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [activeRun, setActiveRun] = useState(null);

    // Delivery POD modal state
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
    const [recipientName, setRecipientName] = useState('');
    const [collectedCod, setCollectedCod] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [signatureData, setSignatureData] = useState('');
    const [photoData, setPhotoData] = useState('');
    const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);

    // Exception modal state
    const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
    const [failureReason, setFailureReason] = useState('CUSTOMER_UNREACHABLE');
    const [failureNotes, setFailureNotes] = useState('');
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [isSubmittingException, setIsSubmittingException] = useState(false);

    const canvasRef = useRef(null);
    const isDrawing = useRef(false);

    const fetchActiveRun = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError('');
            const res = await fleetService.getDriverActiveRun();
            if (res?.success) {
                setActiveRun(res.data || null);
            } else {
                setLoadError(res?.error || (isRTL ? 'تعذر تحميل مسار التوصيل النشط.' : 'Failed to load active delivery run.'));
            }
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || (isRTL ? 'تعذر الاتصال بخادم الأسطول.' : 'Failed loading active delivery run.');
            setLoadError(msg);
        } finally {
            setLoading(false);
        }
    }, [isRTL]);

    useEffect(() => {
        fetchActiveRun();
    }, [fetchActiveRun]);

    const getCanvasCoords = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
        const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e) => {
        isDrawing.current = true;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { x, y } = getCanvasCoords(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { x, y } = getCanvasCoords(e);
        const isDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = isDark ? '#f8fafc' : '#0f172a';
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        const canvas = canvasRef.current;
        if (canvas) {
            setSignatureData(canvas.toDataURL('image/png'));
        }
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setSignatureData('');
        }
    };

    const handlePhotoUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setPhotoData(reader.result);
        reader.readAsDataURL(file);
    };

    const handleOpenDeliverModal = (shipment) => {
        setSelectedShipment(shipment);
        const dest = shipment.destination || {};
        setRecipientName(dest.contactPerson || dest.name || '');
        setCollectedCod(shipment.codAmount ? String(shipment.codAmount) : '0');
        setPaymentMethod('CASH');
        setSignatureData('');
        setPhotoData('');
        setIsDeliverModalOpen(true);
    };

    const handleOpenExceptionModal = (shipment) => {
        setSelectedShipment(shipment);
        setFailureReason('CUSTOMER_UNREACHABLE');
        setFailureNotes('');
        setRescheduleDate('');
        setIsExceptionModalOpen(true);
    };

    const handleSubmitDelivery = async () => {
        if (!recipientName.trim()) {
            enqueueSnackbar(isRTL ? 'اسم المستلم مطلوب' : 'Recipient name is required', { variant: 'warning' });
            return;
        }
        try {
            setIsSubmittingDelivery(true);
            await fleetService.completeStop({
                shipmentId: selectedShipment.id,
                trackingNumber: selectedShipment.trackingNumber,
                recipientName: recipientName.trim(),
                signatureUrl: signatureData || null,
                photoUrl: photoData || null,
                collectedCodAmount: parseFloat(collectedCod || 0),
                paymentMethod
            });
            enqueueSnackbar(
                isRTL ? `تم تسليم ${selectedShipment.trackingNumber} وحفظ الإثبات.` : `Delivered ${selectedShipment.trackingNumber}. POD saved.`,
                { variant: 'success' }
            );
            setIsDeliverModalOpen(false);
            fetchActiveRun();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (isRTL ? 'فشل حفظ التسليم' : 'Failed saving delivery'), { variant: 'error' });
        } finally {
            setIsSubmittingDelivery(false);
        }
    };

    const handleSubmitException = async () => {
        try {
            setIsSubmittingException(true);
            await fleetService.recordException({
                shipmentId: selectedShipment.id,
                trackingNumber: selectedShipment.trackingNumber,
                failureReason,
                failureNotes,
                rescheduleDate: rescheduleDate || null
            });
            enqueueSnackbar(
                isRTL ? `تم تسجيل تعذر التسليم للشحنة ${selectedShipment.trackingNumber}` : `Delivery exception logged for ${selectedShipment.trackingNumber}`,
                { variant: 'info' }
            );
            setIsExceptionModalOpen(false);
            fetchActiveRun();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || (isRTL ? 'فشل تسجيل الاستثناء' : 'Failed recording exception'), { variant: 'error' });
        } finally {
            setIsSubmittingException(false);
        }
    };

    const openWhatsApp = (phone, trackingNumber) => {
        const waDigits = formatWhatsAppDigits(phone);
        if (!waDigits) {
            enqueueSnackbar(isRTL ? 'رقم الهاتف غير متوفر' : 'Customer phone number unavailable', { variant: 'warning' });
            return;
        }
        const text = encodeURIComponent(
            isRTL
                ? `مرحباً، مندوب تارجت لوجستكس في الطريق لتسليم شحنتكم رقم ${trackingNumber}.`
                : `Hello, your Target Logistics courier is on the way with package ${trackingNumber}.`
        );
        window.open(`https://wa.me/${waDigits}?text=${text}`, '_blank', 'noopener,noreferrer');
    };

    const openMaps = (dest) => {
        const query = encodeURIComponent(
            dest.formattedAddress || `${dest.area || dest.city || 'Kuwait'} Block ${dest.block || ''} Street ${dest.street || ''}`
        );
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener,noreferrer');
    };

    const shipments = activeRun?.shipments || [];

    return (
        <div
            dir={isRTL ? 'rtl' : 'ltr'}
            className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 overflow-x-hidden"
        >
            <div className="max-w-2xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/80 dark:bg-sky-950/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-base text-primary shrink-0" aria-hidden="true">
                            route
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {isRTL ? 'تجربة السائق المطورة V2' : 'Driver Run Experience V2'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Link
                            to="/driver/pickup-v2"
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200 hover:border-primary transition-colors"
                        >
                            {isRTL ? 'الاستلام V2' : 'Pickup V2'}
                        </Link>
                        <Link
                            to="/driver/runs"
                            className="px-2.5 py-1 rounded-lg text-primary dark:text-sky-400 font-bold hover:underline"
                        >
                            {isRTL ? 'العودة إلى V1' : 'Switch to V1'}
                        </Link>
                    </div>
                </div>

                {/* Page Header */}
                <header className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-2xl" aria-hidden="true">local_shipping</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                                {activeRun ? activeRun.runNumber : (isRTL ? 'مسار التوصيل النشط' : 'Active Delivery Run')}
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {user?.name || (isRTL ? 'مندوب التوصيل' : 'Courier Operator')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={fetchActiveRun}
                        disabled={loading}
                        aria-label={isRTL ? 'تحديث المسار' : 'Refresh run'}
                        className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
                    >
                        <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`} aria-hidden="true">
                            refresh
                        </span>
                    </button>
                </header>

                {/* Error Banner */}
                {loadError && (
                    <ErrorBannerV2
                        message={loadError}
                        onRetry={fetchActiveRun}
                        isRetrying={loading}
                    />
                )}

                {/* Run Metrics */}
                {activeRun && (
                    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                        <MetricCardV2
                            title={isRTL ? 'المحطات' : 'Stops'}
                            value={`${activeRun.completedStops || 0}/${activeRun.totalStops || shipments.length}`}
                            icon="pin_drop"
                            tone="info"
                        />
                        <MetricCardV2
                            title={isRTL ? 'المنطقة' : 'Zone'}
                            value={activeRun.zone || '—'}
                            icon="map"
                            tone="neutral"
                        />
                        <MetricCardV2
                            title={isRTL ? 'التحصيل' : 'COD'}
                            value={`${Number(activeRun.totalCodCollected || 0).toFixed(3)}`}
                            subtitle="KWD"
                            icon="payments"
                            tone="success"
                        />
                    </div>
                )}

                {/* Stops List */}
                {loading ? (
                    <div className="space-y-3" aria-busy="true">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-36 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse p-4" />
                        ))}
                    </div>
                ) : !activeRun || shipments.length === 0 ? (
                    <EmptyStateV2
                        icon="check_circle"
                        title={isRTL ? 'لا توجد مسارات توصيل نشطة' : 'No Active Runs Dispatched'}
                        description={isRTL ? 'لم يتم إسناد أي مسارات توصيل لك حالياً من مركز العمليات.' : 'You do not have any pending runs assigned by dispatch right now.'}
                        actionLabel={isRTL ? 'تحديث' : 'Refresh'}
                        onAction={fetchActiveRun}
                    />
                ) : (
                    <section className="space-y-3" aria-label={isRTL ? 'قائمة المحطات' : 'Delivery stops'}>
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                            {isRTL ? `تسلسل التوصيل (${shipments.length} محطة)` : `Delivery Sequence (${shipments.length} Stops)`}
                        </h2>

                        {shipments.map((s, idx) => {
                            const dest = s.destination || {};
                            const isDelivered = s.status === 'delivered';
                            const isException = s.status === 'exception';
                            const phone = dest.phone || '';

                            return (
                                <article
                                    key={s.id || s.trackingNumber}
                                    className={`rounded-2xl border p-4 space-y-3 shadow-2xs transition-colors ${
                                        isDelivered
                                            ? 'bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-800/60'
                                            : isException
                                            ? 'bg-rose-50/40 dark:bg-rose-950/15 border-rose-200 dark:border-rose-800/60'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shrink-0 tabular-nums">
                                                {idx + 1}
                                            </span>
                                            <Link
                                                to={`/shipment-v2/${s.trackingNumber}`}
                                                className="font-mono text-xs font-bold text-primary dark:text-sky-400 hover:underline truncate"
                                            >
                                                {s.trackingNumber}
                                            </Link>
                                        </div>
                                        <StatusBadge status={s.status} size="xs" />
                                    </div>

                                    <div className="space-y-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base truncate">
                                                {dest.contactPerson || dest.name || (isRTL ? 'المستلم' : 'Recipient')}
                                            </h3>
                                            {Number(s.codAmount) > 0 && (
                                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-bold text-xs tabular-nums shrink-0">
                                                    COD {Number(s.codAmount).toFixed(3)} KWD
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 break-words">
                                            {dest.formattedAddress || `${dest.area || dest.city || ''} ${dest.block ? `Blk ${dest.block}` : ''} ${dest.street ? `St ${dest.street}` : ''}`.trim() || 'Kuwait'}
                                        </p>
                                    </div>

                                    {!isDelivered && (
                                        <>
                                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                {phone ? (
                                                    <a
                                                        href={`tel:${phone}`}
                                                        className="min-h-[44px] flex items-center justify-center gap-1.5 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">call</span>
                                                        <span>{isRTL ? 'اتصال' : 'Call'}</span>
                                                    </a>
                                                ) : (
                                                    <span className="min-h-[44px] flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800/40 text-slate-400 text-xs">
                                                        —
                                                    </span>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => openWhatsApp(phone, s.trackingNumber)}
                                                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-base" aria-hidden="true">chat</span>
                                                    <span>{isRTL ? 'واتساب' : 'WhatsApp'}</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => openMaps(dest)}
                                                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-bold border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-base" aria-hidden="true">location_on</span>
                                                    <span>{isRTL ? 'الخريطة' : 'Maps'}</span>
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenDeliverModal(s)}
                                                    className="col-span-2 min-h-[44px] flex items-center justify-center gap-2 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm shadow-xs transition-colors cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-lg" aria-hidden="true">check_circle</span>
                                                    <span>{isRTL ? 'إتمام التسليم (POD)' : 'Complete POD'}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenExceptionModal(s)}
                                                    className="min-h-[44px] flex items-center justify-center gap-1.5 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-base" aria-hidden="true">error</span>
                                                    <span>{isRTL ? 'تعذر' : 'Failed'}</span>
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {isDelivered && (
                                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 pt-1">
                                            <span className="material-symbols-outlined text-base" aria-hidden="true">check_circle</span>
                                            <span>{isRTL ? 'تم التسليم وتوثيق الإثبات' : 'Delivered • POD Signature Recorded'}</span>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </section>
                )}
            </div>

            {/* Deliver & POD Bottom-Sheet Modal */}
            {isDeliverModalOpen && selectedShipment && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl" aria-hidden="true">check_circle</span>
                                <span>{isRTL ? 'إثبات التسليم (POD)' : 'Proof of Delivery (POD)'}</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsDeliverModalOpen(false)}
                                aria-label={isRTL ? 'إغلاق' : 'Close'}
                                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                    {isRTL ? 'اسم المستلم *' : 'Recipient Name *'}
                                </label>
                                <input
                                    type="text"
                                    value={recipientName}
                                    onChange={(e) => setRecipientName(e.target.value)}
                                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                                />
                            </div>

                            {Number(selectedShipment.codAmount) > 0 && (
                                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                                    <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                        <span>{isRTL ? 'الدفع عند الاستلام (COD)' : 'Cash on Delivery (COD)'}</span>
                                        <span className="text-sm tabular-nums">{Number(selectedShipment.codAmount).toFixed(3)} KWD</span>
                                    </div>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={collectedCod}
                                        onChange={(e) => setCollectedCod(e.target.value)}
                                        placeholder={isRTL ? 'المبلغ المحصل (KWD)' : 'Amount Collected in KWD'}
                                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-sm font-bold text-emerald-700 dark:text-emerald-300 tabular-nums"
                                    />
                                </div>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1">
                                        <span className="material-symbols-outlined text-primary text-base" aria-hidden="true">draw</span>
                                        <span>{isRTL ? 'توقيع المستلم' : 'Customer Signature'}</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={clearSignature}
                                        className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                                    >
                                        {isRTL ? 'مسح' : 'Clear Pad'}
                                    </button>
                                </div>
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-950">
                                    <canvas
                                        ref={canvasRef}
                                        width={400}
                                        height={150}
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={draw}
                                        onTouchEnd={stopDrawing}
                                        className="w-full h-36 touch-none cursor-crosshair"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                    {isRTL ? 'صورة التسليم (اختياري)' : 'Doorstep / Parcel Photo (Optional)'}
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handlePhotoUpload}
                                    className="w-full text-xs text-slate-600 dark:text-slate-300 file:me-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-sky-50 dark:file:bg-sky-900/40 file:text-primary dark:file:text-sky-300 cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setIsDeliverModalOpen(false)}
                                className="min-h-[44px] px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                disabled={isSubmittingDelivery}
                                onClick={handleSubmitDelivery}
                                className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {isSubmittingDelivery ? (isRTL ? 'جاري الحفظ...' : 'Recording...') : (isRTL ? 'تأكيد التسليم' : 'Confirm Delivery')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Exception Modal */}
            {isExceptionModalOpen && selectedShipment && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-rose-600 dark:text-rose-400 text-2xl" aria-hidden="true">error</span>
                                <span>{isRTL ? 'تسجيل تعذر التسليم' : 'Record Failed Delivery'}</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsExceptionModalOpen(false)}
                                aria-label={isRTL ? 'إغلاق' : 'Close'}
                                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                    {isRTL ? 'سبب التعذر *' : 'Failure Reason *'}
                                </label>
                                <select
                                    value={failureReason}
                                    onChange={(e) => setFailureReason(e.target.value)}
                                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                                >
                                    <option value="CUSTOMER_UNREACHABLE">{isRTL ? 'لا يوجد رد من العميل' : 'Customer Unreachable / No Answer'}</option>
                                    <option value="CUSTOMER_RESCHEDULED">{isRTL ? 'طلب العميل إعادة الجدولة' : 'Customer Requested Reschedule'}</option>
                                    <option value="REFUSED_PACKAGE">{isRTL ? 'رفض العميل الاستلام' : 'Customer Refused Package'}</option>
                                    <option value="WRONG_ADDRESS">{isRTL ? 'عنوان غير صحيح / ناقص' : 'Wrong Address / Incomplete PACI'}</option>
                                    <option value="ACCESS_RESTRICTED">{isRTL ? 'تعذر الوصول للموقع' : 'Location Access Restricted'}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                    {isRTL ? 'تاريخ إعادة الجدولة' : 'Reschedule Date'}
                                </label>
                                <input
                                    type="date"
                                    value={rescheduleDate}
                                    onChange={(e) => setRescheduleDate(e.target.value)}
                                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                                    {isRTL ? 'ملاحظات المندوب' : 'Driver Notes'}
                                </label>
                                <textarea
                                    value={failureNotes}
                                    onChange={(e) => setFailureNotes(e.target.value)}
                                    placeholder={isRTL ? 'مثال: تم الاتصال 3 مرات، البوابة مغلقة' : 'e.g. Called 3 times, gate locked'}
                                    rows={3}
                                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setIsExceptionModalOpen(false)}
                                className="min-h-[44px] px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="button"
                                disabled={isSubmittingException}
                                onClick={handleSubmitException}
                                className="min-h-[44px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {isSubmittingException ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'تسجيل التعذر' : 'Log Failure')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriverRunV2Page;
