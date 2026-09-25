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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div
                onClick={(e) => e.stopPropagation()}
                className="card bg-base-100 shadow-2xl border border-base-200/80 w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 md:p-6 space-y-4"
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-base-200">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center text-success shrink-0">
                            <span className="material-symbols-outlined text-xl">draw</span>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-base text-base-content">Proof of Delivery (POD)</h3>
                            <div className="text-xs text-base-content/60 font-mono">
                                Tracking: <span className="font-bold text-primary">#{shipment.trackingNumber}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
                    >
                        ✕
                    </button>
                </div>

                {/* Recipient Full Name */}
                <div className="form-control w-full">
                    <label className="text-xs font-bold text-base-content/80 mb-1">
                        Recipient Full Name <span className="text-error font-bold">*</span>
                    </label>
                    <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="e.g. Fatima Al-Sabah"
                        className="input input-bordered input-sm w-full bg-base-100 font-medium text-sm focus:input-primary"
                    />
                </div>

                {/* Relationship & COD Grid */}
                <div className={`grid grid-cols-1 ${hasCodRequired ? 'sm:grid-cols-2' : ''} gap-3`}>
                    <div className="form-control w-full">
                        <label className="text-xs font-bold text-base-content/80 mb-1">
                            Relationship to Consignee
                        </label>
                        <select
                            value={relationship}
                            onChange={(e) => setRelationship(e.target.value)}
                            className="select select-bordered select-sm w-full bg-base-100 text-xs font-medium focus:select-primary"
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
                        <div className="form-control w-full">
                            <div className="flex justify-between items-baseline mb-1">
                                <label className="text-xs font-bold text-success">
                                    💵 COD Cash to Collect *
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setCodCollected(String(shipment.codAmount))}
                                    className="text-[11px] font-bold text-success underline hover:opacity-80"
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
                                className="input input-bordered input-sm w-full bg-success/5 border-success text-success font-mono font-bold text-sm"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 pt-6">
                            <input
                                type="checkbox"
                                id="extraCodCheck"
                                checked={parseFloat(codCollected || 0) > 0}
                                onChange={(e) => setCodCollected(e.target.checked ? '1' : '')}
                                className="checkbox checkbox-success checkbox-sm"
                            />
                            <label htmlFor="extraCodCheck" className="text-xs font-semibold text-base-content/80 cursor-pointer select-none">
                                💵 Cash collected on delivery
                            </label>
                            {parseFloat(codCollected || 0) > 0 && (
                                <input
                                    type="number"
                                    step="0.001"
                                    value={codCollected}
                                    onChange={(e) => setCodCollected(e.target.value)}
                                    placeholder="Amount (KWD)"
                                    className="input input-bordered input-xs w-24 ms-auto font-mono font-bold"
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Digital Signature Canvas */}
                <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline">
                        <label className="text-xs font-bold text-base-content/80">
                            Recipient Digital Signature
                        </label>
                        {hasSignature && (
                            <button
                                type="button"
                                onClick={clearCanvas}
                                className="text-[11px] font-bold text-error hover:underline"
                            >
                                Clear Signature
                            </button>
                        )}
                    </div>
                    <div className="relative border-2 border-dashed border-base-300 rounded-xl bg-base-200/40 cursor-crosshair touch-none overflow-hidden h-36">
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
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-base-content/40 font-medium">
                                Sign here with finger or stylus
                            </div>
                        )}
                    </div>
                </div>

                {/* Delivery Notes */}
                <div className="form-control w-full">
                    <label className="text-xs font-bold text-base-content/80 mb-1">
                        Delivery Notes (Optional)
                    </label>
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Handed at reception desk, building 4"
                        className="input input-bordered input-sm w-full bg-base-100 font-medium text-sm focus:input-primary"
                    />
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-base-200">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="btn btn-sm btn-ghost text-base-content/70"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={loading}
                        className="btn btn-sm btn-primary font-bold shadow-md shadow-primary/20 gap-2"
                    >
                        {loading && <span className="loading loading-spinner loading-xs" />}
                        <span>{loading ? 'Confirming...' : 'Confirm Delivery (POD)'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProofOfDeliveryModal;
