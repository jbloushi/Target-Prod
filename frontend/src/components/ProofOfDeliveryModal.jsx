import React, { useState, useRef, useEffect } from 'react';
import { shipmentService } from '../services/api';

/**
 * ProofOfDeliveryModal — Pure DaisyUI v4 + Tailwind CSS Handover Capture
 * Captures recipient signature via HTML5 canvas, relationship, COD cash collection, and notes.
 */
const ProofOfDeliveryModal = ({ isOpen, onClose, shipment, onDelivered }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);
    const [recipientName, setRecipientName] = useState('');
    const [relationship, setRelationship] = useState('Self');
    const [codCollected, setCodCollected] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (shipment) {
            const defaultRecipient = shipment.destination?.contactPerson || shipment.destination?.company || shipment.receiver?.name || '';
            setRecipientName(defaultRecipient);
            setCodCollected(shipment.codAmount ? String(shipment.codAmount) : '');
        }
    }, [shipment]);

    useEffect(() => {
        if (isOpen && canvasRef.current) {
            const canvas = canvasRef.current;
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            const ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
    }, [isOpen]);

    if (!isOpen || !shipment) return null;

    const startDrawing = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
        setIsDrawing(true);
        setHasSignature(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        const ctx = canvas.getContext('2d');
        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
    };

    const handleSubmit = async () => {
        if (!recipientName.trim()) {
            alert('Please enter recipient full name');
            return;
        }

        try {
            setLoading(true);
            const signatureDataUrl = hasSignature && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null;

            const payload = {
                recipientName: recipientName.trim(),
                recipientRelationship: relationship,
                signatureDataUrl,
                notes: notes.trim(),
                codCollected: parseFloat(codCollected || 0)
            };

            const res = await shipmentService.confirmDeliveryWithPod(shipment.trackingNumber, payload);
            if (res?.data) {
                if (onDelivered) onDelivered(res.data);
                onClose();
            }
        } catch (err) {
            console.error('Failed to submit proof of delivery:', err);
            alert(err.response?.data?.error || err.message || 'Failed to record proof of delivery');
        } finally {
            setLoading(false);
        }
    };

    const hasCodRequired = shipment.codAmount && parseFloat(shipment.codAmount) > 0;

    return (
        <div
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 md:p-6 space-y-4"
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                            <span className="material-symbols-outlined text-xl">draw</span>
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white truncate">Proof of Delivery (POD)</h3>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                                Tracking: <span className="font-bold text-primary">#{shipment.trackingNumber}</span>
                            </div>
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

                {/* Recipient Full Name */}
                <div className="w-full">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                        Recipient Full Name <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="e.g. Fatima Al-Sabah"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                </div>

                {/* Relationship & COD Grid */}
                <div className={`grid grid-cols-1 ${hasCodRequired ? 'sm:grid-cols-2' : ''} gap-3`}>
                    <div className="w-full">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                            Relationship to Consignee
                        </label>
                        <select
                            value={relationship}
                            onChange={(e) => setRelationship(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        >
                            <option value="Self">Self / Consignee</option>
                            <option value="Security">Security Gate</option>
                            <option value="Reception">Reception / Mailroom</option>
                            <option value="Family">Family Member</option>
                            <option value="Assistant">Office Assistant</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {hasCodRequired ? (
                        <div className="w-full">
                            <div className="flex justify-between items-baseline mb-1">
                                <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    💵 COD Cash to Collect *
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setCodCollected(String(shipment.codAmount))}
                                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 underline hover:opacity-80"
                                >
                                    Exact Amount
                                </button>
                            </div>
                            <input
                                type="number"
                                step="0.001"
                                value={codCollected}
                                onChange={(e) => setCodCollected(e.target.value)}
                                placeholder={`Amount in ${shipment.codCurrency || shipment.currency || 'KWD'}`}
                                className="w-full px-3 py-2 rounded-xl border border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                            <input
                                type="checkbox"
                                id="extraCodCheck"
                                checked={parseFloat(codCollected || 0) > 0}
                                onChange={(e) => setCodCollected(e.target.checked ? '1' : '')}
                                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-emerald-600 cursor-pointer"
                            />
                            <label htmlFor="extraCodCheck" className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                                💵 Cash collected on delivery
                            </label>
                            {parseFloat(codCollected || 0) > 0 && (
                                <input
                                    type="number"
                                    step="0.001"
                                    value={codCollected}
                                    onChange={(e) => setCodCollected(e.target.value)}
                                    placeholder="Amount (KWD)"
                                    className="w-28 ms-auto px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Digital Signature Canvas */}
                <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Recipient Digital Signature
                        </label>
                        {hasSignature && (
                            <button
                                type="button"
                                onClick={clearCanvas}
                                className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                            >
                                Clear Signature
                            </button>
                        )}
                    </div>
                    <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-100 cursor-crosshair touch-none overflow-hidden h-36">
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="w-full h-full block"
                        />
                        {!hasSignature && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-slate-400 font-medium">
                                Sign here with finger or stylus
                            </div>
                        )}
                    </div>
                </div>

                {/* Delivery Notes */}
                <div className="w-full">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                        Delivery Notes (Optional)
                    </label>
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Handed at reception desk, building 4"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                </div>

                {/* Modal Actions */}
                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-white px-4 py-2 text-xs font-bold shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading && <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                        <span>{loading ? 'Confirming...' : 'Confirm Delivery (POD)'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProofOfDeliveryModal;
