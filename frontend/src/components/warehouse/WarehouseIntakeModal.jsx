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
        <div className={`modal modal-bottom sm:modal-middle ${isOpen ? 'modal-open' : ''} z-50`}>
            <div className="modal-box max-w-2xl bg-base-100 border border-base-200/80 shadow-2xl p-6 sm:p-7 text-base-content max-h-[92vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-base-200">
                    <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="badge badge-primary badge-outline font-mono font-bold text-xs uppercase tracking-wider">
                                {lang === 'ar' ? 'بوابة استلام المستودع' : 'Warehouse Gate Intake'}
                            </span>
                            {shipment && <StatusBadge status={shipment.status} />}
                        </div>
                        <div className="flex items-center gap-2.5 mt-1">
                            <h2 className="text-xl sm:text-2xl font-black font-mono tracking-tight text-base-content">
                                {trackingNumber}
                            </h2>
                            <button
                                type="button"
                                onClick={handleCopyWaybill}
                                className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
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
                        className="btn btn-sm btn-circle btn-ghost text-base-content/60 hover:text-base-content"
                    >
                        ✕
                    </button>
                </div>

                {/* Body Content */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <span className="loading loading-spinner loading-lg text-primary"></span>
                        <p className="text-sm font-semibold text-base-content/60">
                            {lang === 'ar' ? 'جاري تحميل ملف الشحنة...' : 'Loading consignment dossier...'}
                        </p>
                    </div>
                ) : shipment ? (
                    <div className="py-4 space-y-5">
                        {error && (
                            <div className="alert alert-error text-xs font-semibold py-2.5">
                                <span className="material-symbols-outlined text-base">error</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Trade Route & Parties */}
                        <div className="bg-base-200/50 rounded-2xl p-4 border border-base-200 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <TradeRouteDisplay
                                    originCountry={shipment.originCountry || shipment.senderAddress?.country || 'KW'}
                                    destCountry={shipment.destCountry || shipment.receiverAddress?.country || 'SA'}
                                    originCity={shipment.originCity || shipment.senderAddress?.city || 'Kuwait'}
                                    destCity={shipment.destCity || shipment.receiverAddress?.city || 'Riyadh'}
                                />
                                <div className="badge badge-neutral text-xs font-semibold">
                                    {shipment.carrierCode || shipment.carrier || 'INTERNAL'}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-base-200/60 text-xs">
                                <div className="space-y-0.5">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                                        {lang === 'ar' ? 'المرسل' : 'Shipper'}
                                    </span>
                                    <div className="font-bold text-base-content truncate">
                                        {shipment.senderAddress?.contactPerson || shipment.sender?.name || (lang === 'ar' ? 'مرسل غير محدد' : 'Shipper N/A')}
                                    </div>
                                    <div className="text-base-content/60 text-[11px] truncate">
                                        {shipment.senderAddress?.phone || shipment.sender?.phone || ''} • {shipment.senderAddress?.street || ''}
                                    </div>
                                </div>
                                <div className="space-y-0.5">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                                        {lang === 'ar' ? 'المستلم' : 'Consignee'}
                                    </span>
                                    <div className="font-bold text-base-content truncate">
                                        {shipment.receiverAddress?.contactPerson || shipment.receiver?.name || (lang === 'ar' ? 'مستلم غير محدد' : 'Consignee N/A')}
                                    </div>
                                    <div className="text-base-content/60 text-[11px] truncate">
                                        {shipment.receiverAddress?.phone || shipment.receiver?.phone || ''} • {shipment.receiverAddress?.street || ''}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Weight Comparison Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* Declared Weight */}
                            <div className="bg-base-200/40 rounded-2xl p-4 border border-base-200 flex flex-col justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/55">
                                    {lang === 'ar' ? 'الوزن المصرح به (العميل)' : 'Declared Weight (Customer)'}
                                </span>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                    <span className="text-3xl font-black font-mono text-base-content">
                                        {declaredWeight.toFixed(2)}
                                    </span>
                                    <span className="text-sm font-semibold text-base-content/60">kg</span>
                                </div>
                                <span className="text-[11px] text-base-content/50 mt-1">
                                    {lang === 'ar' ? 'بناءً على طلب الإنشاء الأصلي' : 'From original booking order'}
                                </span>
                            </div>

                            {/* Certified Scale Weight */}
                            <div className={`bg-base-100 rounded-2xl p-4 border-2 transition-colors flex flex-col justify-between ${
                                isDiscrepancy ? 'border-warning/70 bg-warning/5' : 'border-primary/50'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">scale</span>
                                        {lang === 'ar' ? 'وزن الميزان المعتمد' : 'Certified Scale Weight'}
                                    </span>
                                    {isDiscrepancy && (
                                        <span className="badge badge-warning badge-sm font-bold text-[10px]">
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
                                        className="input input-bordered input-md w-full font-mono text-xl font-black focus:input-primary bg-base-100"
                                    />
                                    <span className="text-sm font-bold text-base-content/70">kg</span>
                                </div>

                                {/* Quick adjustment chips */}
                                <div className="flex items-center gap-1 mt-2.5">
                                    <button
                                        type="button"
                                        onClick={() => handleAdjustWeight(-0.1)}
                                        className="btn btn-xs btn-outline border-base-300 font-mono text-[11px]"
                                    >
                                        -0.1
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAdjustWeight(0.1)}
                                        className="btn btn-xs btn-outline border-base-300 font-mono text-[11px]"
                                    >
                                        +0.1
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActualWeight(declaredWeight.toFixed(2))}
                                        className="btn btn-xs btn-ghost text-[10px] text-base-content/60 ms-auto hover:text-primary"
                                    >
                                        {lang === 'ar' ? 'إعادة ضبط' : 'Reset to Declared'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Discrepancy Warning Notice */}
                        {isDiscrepancy && (
                            <div className="alert alert-warning shadow-sm border border-warning/30 rounded-2xl py-3 px-4">
                                <span className="material-symbols-outlined text-warning-content text-xl">warning</span>
                                <div className="text-xs">
                                    <div className="font-bold text-warning-content">
                                        {lang === 'ar'
                                            ? `تم اكتشاف فرق في الوزن: ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(2)} كجم`
                                            : `Weight discrepancy detected: ${weightDiff > 0 ? '+' : ''}${weightDiff.toFixed(2)} kg`}
                                    </div>
                                    <div className="text-warning-content/80 text-[11px] mt-0.5">
                                        {lang === 'ar'
                                            ? 'سيقوم النظام بتسجيل الوزن الفعلي للميزان المعتمد وإعادة حساب فاتورة العميل تلقائياً.'
                                            : 'System will log certified weight on the audit ledger and apply discrepancy pricing adjustments.'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Dimensions & Volumetric Weight */}
                        <div className="bg-base-200/30 rounded-2xl p-4 border border-base-200">
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/60 flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[16px]">aspect_ratio</span>
                                    {lang === 'ar' ? 'أبعاد الطرد (سم) والوزن الحجمي' : 'Parcel Dimensions (cm) & Volumetric'}
                                </span>
                                {volumetricWeight > 0 && (
                                    <span className="text-xs font-mono font-bold text-base-content/80">
                                        {lang === 'ar' ? 'الحجمي:' : 'Volumetric:'} <span className="text-primary">{volumetricWeight.toFixed(2)} kg</span>
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[10px] font-semibold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'الطول L (سم)' : 'Length (cm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        placeholder="L"
                                        value={length}
                                        onChange={(e) => setLength(e.target.value)}
                                        className="input input-sm input-bordered w-full font-mono font-bold bg-base-100"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'العرض W (سم)' : 'Width (cm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        placeholder="W"
                                        value={width}
                                        onChange={(e) => setWidth(e.target.value)}
                                        className="input input-sm input-bordered w-full font-mono font-bold bg-base-100"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-semibold text-base-content/60 block mb-1">
                                        {lang === 'ar' ? 'الارتفاع H (سم)' : 'Height (cm)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        placeholder="H"
                                        value={height}
                                        onChange={(e) => setHeight(e.target.value)}
                                        className="input input-sm input-bordered w-full font-mono font-bold bg-base-100"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Hub Bay Assignment & Notes */}
                        <div className="space-y-2.5">
                            <div>
                                <label className="text-[11px] font-bold uppercase tracking-wider text-base-content/60 block mb-1.5">
                                    {lang === 'ar' ? 'موقع الرف / منطقة التخزين بالمستودع' : 'Warehouse Hub Shelf / Bay Location'}
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {HUB_SHELF_PRESETS.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setShelfLocation(p.id)}
                                            className={`btn btn-xs ${
                                                shelfLocation === p.id
                                                    ? 'btn-primary'
                                                    : 'btn-outline border-base-300 text-base-content/70 hover:bg-base-200'
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
                                    className="input input-sm input-bordered w-full bg-base-100 text-xs"
                                />
                            </div>
                        </div>

                        {/* Payment Status & WhatsApp Link */}
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-base-200/40 border border-base-200 text-xs">
                            <div className="flex items-center gap-2">
                                <span className={`badge ${shipment.paid ? 'badge-success text-white' : 'badge-warning'} font-bold text-[11px]`}>
                                    {shipment.paid ? (lang === 'ar' ? 'مدفوع' : 'Paid') : (lang === 'ar' ? 'غير مدفوع' : 'Unpaid')}
                                </span>
                                <span className="text-base-content/70">
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
                                    className="btn btn-xs btn-outline btn-success gap-1 font-semibold"
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
                    <div className="py-12 text-center text-base-content/50">
                        <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
                        <p className="text-sm font-semibold">
                            {lang === 'ar' ? 'لم يتم العثور على بيانات لهذه الشحنة.' : 'No data found for this consignment.'}
                        </p>
                    </div>
                )}

                {/* Footer Actions */}
                <div className="modal-action flex items-center justify-between pt-4 border-t border-base-200 mt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={processing}
                        className="btn btn-ghost btn-sm text-base-content/70"
                    >
                        {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => handleProcess('receive')}
                            disabled={processing || !shipment || shipment.status === 'received_at_hub' || shipment.status === 'verified'}
                            className="btn btn-outline btn-primary btn-sm font-bold gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[17px]">inventory_2</span>
                            {lang === 'ar' ? 'استلام بالمركز' : 'Receive at Hub'}
                        </button>

                        <button
                            type="button"
                            onClick={() => handleProcess('verify')}
                            disabled={processing || !shipment || shipment.status === 'verified'}
                            className="btn btn-primary btn-sm font-bold shadow-md shadow-primary/20 gap-1.5"
                        >
                            {processing ? (
                                <span className="loading loading-spinner loading-xs"></span>
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
            <div className="modal-backdrop bg-black/60 backdrop-blur-xs" onClick={onClose} />
        </div>
    );
};

export default WarehouseIntakeModal;
