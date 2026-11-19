import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { shipmentService } from '../../services/api';
import StatusBadge from '../common/StatusBadge';
import TradeRouteDisplay from '../common/TradeRouteDisplay';

const HUB_SHELF_PRESETS = [
    { id: 'SHW-BAY-A1', label: 'Shuwaikh Bay A-01' },
    { id: 'SHW-BAY-A2', label: 'Shuwaikh Bay A-02' },
    { id: 'SORT-OUTBOUND', label: 'Outbound Sort Rack' },
    { id: 'DGR-SECURE', label: 'DGR Secure Vault' },
    { id: 'HOLD-INSPECTION', label: 'Customs Hold' },
];

const WarehouseIntakeModal = ({ isOpen, onClose, trackingNumber, onProcessed }) => {
    const { lang, isRTL } = useLanguage();
    const [shipment, setShipment] = useState(null);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [sendingPayLink, setSendingPayLink] = useState(false);
    const [payLinkSuccess, setPayLinkSuccess] = useState(false);
    const [copied, setCopied] = useState(false);

    const [actualWeight, setActualWeight] = useState('');
    const [length, setLength] = useState('');
    const [width, setWidth] = useState('');
    const [height, setHeight] = useState('');
    const [shelfLocation, setShelfLocation] = useState('SHW-BAY-A1');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');

    const calculateDeclaredWeight = useCallback((data) => {
        if (!data) return 0;
        if (Array.isArray(data.parcels) && data.parcels.length > 0) {
            return data.parcels.reduce((acc, p) => acc + (Number(p.weight) || 0), 0);
        }
        if (Array.isArray(data.items) && data.items.length > 0) {
            return data.items.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);
        }
        return Number(data.totalWeight) || Number(data.weight) || 0;
    }, []);

    const fetchShipmentDetails = useCallback(async () => {
        if (!trackingNumber) return;
        setLoading(true);
        setError('');
        setPayLinkSuccess(false);
        try {
            const res = await shipmentService.getShipmentByTrackingNumber(trackingNumber);
            if (res?.data) {
                const s = res.data;
                setShipment(s);
                const declared = calculateDeclaredWeight(s);
                setActualWeight(declared > 0 ? declared.toString() : '');
                
                // Extract dimensions if available
                const firstParcel = (Array.isArray(s.parcels) && s.parcels[0]) || (Array.isArray(s.items) && s.items[0]) || null;
                if (firstParcel?.dimensions) {
                    setLength(firstParcel.dimensions.length?.toString() || '');
                    setWidth(firstParcel.dimensions.width?.toString() || '');
                    setHeight(firstParcel.dimensions.height?.toString() || '');
                } else {
                    setLength(s.length?.toString() || '');
                    setWidth(s.width?.toString() || '');
                    setHeight(s.height?.toString() || '');
                }
            } else {
                setError(lang === 'ar' ? 'لم يتم العثور على الشحنة' : 'Shipment not found');
            }
        } catch (err) {
            console.error('Failed to fetch shipment details:', err);
            setError(err.response?.data?.error || err.message || (lang === 'ar' ? 'فشل تحميل بيانات الشحنة' : 'Failed to load shipment data. Please try again.'));
        } finally {
            setLoading(false);
        }
    }, [trackingNumber, calculateDeclaredWeight, lang]);

    useEffect(() => {
        if (isOpen && trackingNumber) {
            fetchShipmentDetails();
        } else {
            setShipment(null);
            setError('');
            setNotes('');
        }
    }, [isOpen, trackingNumber, fetchShipmentDetails]);

    const declaredWeight = useMemo(() => calculateDeclaredWeight(shipment), [shipment, calculateDeclaredWeight]);
    const numActualWeight = parseFloat(actualWeight) || 0;
    const weightDiff = numActualWeight > 0 ? numActualWeight - declaredWeight : 0;
    const isDiscrepancy = numActualWeight > 0 && Math.abs(weightDiff) > 0.05;

    // Volumetric Weight: (L × W × H) / 5000 kg
    const volumetricWeight = useMemo(() => {
        const l = parseFloat(length) || 0;
        const w = parseFloat(width) || 0;
        const h = parseFloat(height) || 0;
        if (l > 0 && w > 0 && h > 0) {
            return (l * w * h) / 5000;
        }
        return 0;
    }, [length, width, height]);

    const handleCopyWaybill = () => {
        if (!trackingNumber) return;
        navigator.clipboard.writeText(trackingNumber);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleAdjustWeight = (delta) => {
        const current = parseFloat(actualWeight) || 0;
        const updated = Math.max(0.1, Number((current + delta).toFixed(2)));
        setActualWeight(updated.toString());
    };

    const handleSendPayLink = async () => {
        if (!trackingNumber) return;
        setSendingPayLink(true);
        try {
            await shipmentService.sendPaymentLink(trackingNumber, { recipientRole: 'sender' });
            setPayLinkSuccess(true);
            setTimeout(() => setPayLinkSuccess(false), 4000);
        } catch (err) {
            console.error('Failed to send payment link:', err);
            alert(err.response?.data?.error || (lang === 'ar' ? 'فشل إرسال رابط الدفع' : 'Failed to send payment link'));
        } finally {
            setSendingPayLink(false);
        }
    };

    const handleProcess = async (action) => {
        setProcessing(true);
        setError('');
        try {
            const payload = {
                action, // 'receive' or 'verify'
                weight: numActualWeight > 0 ? numActualWeight : declaredWeight,
            };

            const l = parseFloat(length) || 0;
            const w = parseFloat(width) || 0;
            const h = parseFloat(height) || 0;
            if (l > 0 && w > 0 && h > 0) {
                payload.dimensions = { length: l, width: w, height: h };
            }
            if (shelfLocation) {
                payload.shelfLocation = shelfLocation;
            }
            if (notes.trim()) {
                payload.notes = notes.trim();
            }

            await shipmentService.warehouseScan(trackingNumber, payload);

            // Auto-book carrier if 'verify' and not internal carrier
            if (action === 'verify' && shipment?.carrierCode && shipment.carrierCode !== 'INTERNAL') {
                try {
                    await shipmentService.bookShipment(trackingNumber, shipment.carrierCode);
                } catch (bookErr) {
                    console.error('Auto-booking failed:', bookErr);
                }
            }

            if (onProcessed) onProcessed(trackingNumber);
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || err.message || (lang === 'ar' ? 'فشلت معالجة الشحنة' : 'Failed to process shipment. Please try again.'));
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                dir={isRTL ? 'rtl' : 'ltr'}
                className="relative w-full max-w-2xl rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-7 text-slate-900 dark:text-white max-h-[92vh] overflow-y-auto"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider border border-primary/30 bg-primary/5 text-primary">
                                {lang === 'ar' ? 'بوابة استلام المستودع' : 'Warehouse Gate Intake'}
                            </span>
                            {shipment && <StatusBadge status={shipment.status} />}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <h2 className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white break-all">
                                {trackingNumber}
                            </h2>
                            <button
                                type="button"
                                onClick={handleCopyWaybill}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary transition-colors"
                                title={lang === 'ar' ? 'نسخ رقم التتبع' : 'Copy Tracking Number'}
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    {copied ? 'check' : 'content_copy'}
                                </span>
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                        aria-label="Close"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Body Content */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <span className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                            {lang === 'ar' ? 'جاري تحميل ملف الشحنة...' : 'Loading consignment dossier...'}
                        </p>
                    </div>
                ) : shipment ? (
                    <div className="py-4 space-y-5">
                        {error && (
                            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
                                <span className="material-symbols-outlined text-base shrink-0">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Trade Route & Parties */}
                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/80 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <TradeRouteDisplay
                                    originCountry={shipment.originCountry || shipment.senderAddress?.country || 'KW'}
                                    destCountry={shipment.destCountry || shipment.receiverAddress?.country || 'SA'}
                                    originCity={shipment.originCity || shipment.senderAddress?.city || 'Kuwait'}
                                    destCity={shipment.destCity || shipment.receiverAddress?.city || 'Riyadh'}
                                />
                                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                    {shipment.carrierCode || shipment.carrier || 'INTERNAL'}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 text-xs">
                                <div className="space-y-0.5 min-w-0">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {lang === 'ar' ? 'المرسل' : 'Shipper'}
                                    </span>
                                    <div className="font-bold text-slate-900 dark:text-white truncate">
                                        {shipment.senderAddress?.contactPerson || shipment.sender?.name || (lang === 'ar' ? 'مرسل غير محدد' : 'Shipper N/A')}
                                    </div>
                                    <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                                        {shipment.senderAddress?.phone || shipment.sender?.phone || ''} • {shipment.senderAddress?.street || ''}
                                    </div>
                                </div>
                                <div className="space-y-0.5 min-w-0">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        {lang === 'ar' ? 'المستلم' : 'Consignee'}
                                    </span>
                                    <div className="font-bold text-slate-900 dark:text-white truncate">
                                        {shipment.receiverAddress?.contactPerson || shipment.receiver?.name || (lang === 'ar' ? 'مستلم غير محدد' : 'Consignee N/A')}
                                    </div>
                                    <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                                        {shipment.receiverAddress?.phone || shipment.receiver?.phone || ''} • {shipment.receiverAddress?.street || ''}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Weight Comparison Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* Declared Weight */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {lang === 'ar' ? 'الوزن المصرح به (العميل)' : 'Declared Weight (Customer)'}
                                </span>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
                                        {declaredWeight.toFixed(2)}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">kg</span>
                                </div>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                    {lang === 'ar' ? 'بناءً على طلب الإنشاء الأصلي' : 'From original booking order'}
                                </span>
                            </div>

                            {/* Certified Scale Weight */}
                            <div className={`rounded-2xl p-4 border-2 transition-colors flex flex-col justify-between ${
                                isDiscrepancy
                                    ? 'border-amber-400/80 dark:border-amber-600/80 bg-amber-50/50 dark:bg-amber-950/20'
                                    : 'border-primary/50 bg-white dark:bg-slate-900'
                            }`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">scale</span>
                                        {lang === 'ar' ? 'وزن الميزان المعتمد' : 'Certified Scale Weight'}
                                    </span>
                                    {isDiscrepancy && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                            {weightDiff > 0 ? `+${weightDiff.toFixed(2)}` : weightDiff.toFixed(2)} kg
                                        </span>
                                    )}
                                </div>

                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        type="number"
                                        step="0.05"
                                        min="0.01"
                                        value={actualWeight}
                                        onChange={(e) => setActualWeight(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xl font-black focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                    />
                                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">kg</span>
                                </div>

                                {/* Quick adjustment chips */}
                                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => handleAdjustWeight(-0.1)}
                                        className="inline-flex items-center justify-center px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-mono text-[11px] font-bold transition-colors"
                                    >
                                        -0.1
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAdjustWeight(0.1)}
                                        className="inline-flex items-center justify-center px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 font-mono text-[11px] font-bold transition-colors"
                                    >
                                        +0.1
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActualWeight(declaredWeight.toFixed(2))}
                                        className="inline-flex items-center justify-center px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 dark:text-slate-400 ms-auto hover:text-primary transition-colors"
                                    >
                                        {lang === 'ar' ? 'إعادة ضبط' : 'Reset to Declared'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Discrepancy Warning Notice */}
                        {isDiscrepancy && (
                            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 shadow-2xs">
                                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl shrink-0">warning</span>
                                <div className="text-xs">
                                    <div className="font-bold text-amber-900 dark:text-amber-200">
                                        {lang === 'ar'
                                            ? `تم اكتشاف فرق في الوزن: ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(2)} كجم`
                                            : `Weight discrepancy detected: ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(2)} kg`}
                                    </div>
                                    <div className="text-amber-800/80 dark:text-amber-300/80 text-[11px] mt-0.5">
                                        {lang === 'ar'
                                            ? 'سيقوم النظام بتسجيل الوزن الفعلي للميزان المعتمد وإعادة حساب فاتورة العميل تلقائياً.'
                                            : 'System will log certified weight on the audit ledger and apply discrepancy pricing adjustments.'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Dimensions & Volumetric Weight */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/80">
                            <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px]">aspect_ratio</span>
                                    {lang === 'ar' ? 'أبعاد الطرد (سم) والوزن الحجمي' : 'Parcel Dimensions (cm) & Volumetric'}
                                </span>
                                {volumetricWeight > 0 && (
                                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">
                                        {lang === 'ar' ? 'الحجمي:' : 'Volumetric:'} <span className="text-primary">{volumetricWeight.toFixed(2)} kg</span>
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                                        {lang === 'ar' ? 'الطول L (سم)' : 'Length (cm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        placeholder="L"
                                        value={length}
                                        onChange={(e) => setLength(e.target.value)}
                                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                                        {lang === 'ar' ? 'العرض W (سم)' : 'Width (cm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        placeholder="W"
                                        value={width}
                                        onChange={(e) => setWidth(e.target.value)}
                                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                                        {lang === 'ar' ? 'الارتفاع H (سم)' : 'Height (cm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        placeholder="H"
                                        value={height}
                                        onChange={(e) => setHeight(e.target.value)}
                                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Hub Bay Assignment & Notes */}
                        <div className="space-y-2.5">
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-1.5">
                                    {lang === 'ar' ? 'موقع الرف / منطقة التخزين بالمستودع' : 'Warehouse Hub Shelf / Bay Location'}
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {HUB_SHELF_PRESETS.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setShelfLocation(p.id)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                                shelfLocation === p.id
                                                    ? 'bg-primary text-white shadow-2xs'
                                                    : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <input
                                    type="text"
                                    placeholder={lang === 'ar' ? 'ملاحظات الفحص أو رقم الرف المخصص...' : 'Inspection notes or custom shelf bay...'}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                            </div>
                        </div>

                        {/* Payment Status & WhatsApp Link */}
                        <div className="flex items-center justify-between gap-2 flex-wrap p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[11px] border ${
                                    shipment.paid
                                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                }`}>
                                    {shipment.paid ? (lang === 'ar' ? 'مدفوع' : 'Paid') : (lang === 'ar' ? 'غير مدفوع' : 'Unpaid')}
                                </span>
                                <span className="text-slate-600 dark:text-slate-300">
                                    {shipment.codAmount > 0
                                        ? `COD: ${shipment.codAmount} ${shipment.currency || 'KWD'}`
                                        : (shipment.paid ? (lang === 'ar' ? 'تم تحصيل الرسوم' : 'Prepaid Charges') : (lang === 'ar' ? 'في انتظار الدفع' : 'Payment Pending'))}
                                </span>
                            </div>

                            {!shipment.paid && (
                                <button
                                    type="button"
                                    onClick={handleSendPayLink}
                                    disabled={sendingPayLink || payLinkSuccess}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-[11px] font-semibold disabled:opacity-50 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[14px]">chat</span>
                                    {payLinkSuccess
                                        ? (lang === 'ar' ? 'تم الإرسال!' : 'Link Sent!')
                                        : (sendingPayLink ? (lang === 'ar' ? 'إرسال...' : 'Sending...') : (lang === 'ar' ? 'رابط واتساب' : 'WhatsApp Pay Link'))}
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="py-12 text-center text-slate-400 dark:text-slate-500">
                        <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
                        <p className="text-sm font-semibold">
                            {lang === 'ar' ? 'لم يتم العثور على بيانات لهذه الشحنة.' : 'No data found for this consignment.'}
                        </p>
                    </div>
                )}

                {/* Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={processing}
                        className="inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>

                    <div className="flex flex-wrap items-center gap-2 ms-auto">
                        <button
                            type="button"
                            onClick={() => handleProcess('receive')}
                            disabled={processing || !shipment || shipment.status === 'received_at_hub' || shipment.status === 'verified'}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 text-primary hover:bg-primary hover:text-white px-3.5 py-2 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <span className="material-symbols-outlined text-[17px]">inventory_2</span>
                            {lang === 'ar' ? 'استلام بالمركز' : 'Receive at Hub'}
                        </button>

                        <button
                            type="button"
                            onClick={() => handleProcess('verify')}
                            disabled={processing || !shipment || shipment.status === 'verified'}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white px-4 py-2 text-xs font-bold shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {processing ? (
                                <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <span className="material-symbols-outlined text-[17px]">verified</span>
                            )}
                            {processing
                                ? (lang === 'ar' ? 'جاري المعالجة...' : 'Processing...')
                                : (lang === 'ar' ? 'تحقق وتجهيز للشحن' : 'Verify & Dispatch')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WarehouseIntakeModal;
