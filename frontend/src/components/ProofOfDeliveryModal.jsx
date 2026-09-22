import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { Card, Button, StatusPill, Loader } from '../ui';
import { shipmentService } from '../services/api';
import { TK } from '../tokens/kineticHorizon';

const ModalBackdrop = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 16px;
`;

const ModalCard = styled(Card)`
    width: 100%;
    max-width: 520px;
    background: #ffffff;
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-height: 90vh;
    overflow-y: auto;
`;

const CanvasWrapper = styled.div`
    border: 2px dashed ${TK.border};
    border-radius: 10px;
    background: #fafafa;
    position: relative;
    cursor: crosshair;
    touch-action: none;
`;

const Canvas = styled.canvas`
    width: 100%;
    height: 160px;
    display: block;
    border-radius: 8px;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Label = styled.label`
    font-size: 12px;
    font-weight: 700;
    color: ${TK.text2};
`;

const Input = styled.input`
    padding: 10px 12px;
    border: 1px solid ${TK.border};
    border-radius: 8px;
    font-size: 14px;
    &:focus {
        border-color: ${TK.accent};
        outline: none;
    }
`;

const Select = styled.select`
    padding: 10px 12px;
    border: 1px solid ${TK.border};
    border-radius: 8px;
    font-size: 14px;
    background: #fff;
    &:focus {
        border-color: ${TK.accent};
        outline: none;
    }
`;

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
            const defaultRecipient = shipment.destination?.contactPerson || shipment.destination?.company || '';
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
            alert('Please enter recipient name');
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

    return (
        <ModalBackdrop onClick={onClose}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Proof of Delivery (POD)</h3>
                        <div style={{ fontSize: '13px', color: TK.text2, marginTop: '2px' }}>
                            Tracking: <strong style={{ fontFamily: 'monospace' }}>{shipment.trackingNumber}</strong>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: TK.text3 }}
                    >
                        ✕
                    </button>
                </div>

                <InputGroup>
                    <Label>Recipient Full Name *</Label>
                    <Input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="e.g. Fatima Al-Sabah"
                    />
                </InputGroup>

                <div style={{ display: 'grid', gridTemplateColumns: (shipment.codAmount && parseFloat(shipment.codAmount) > 0) ? '1fr 1fr' : '1fr', gap: '12px' }}>
                    <InputGroup>
                        <Label>Relationship</Label>
                        <Select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                            <option value="Self">Self / Consignee</option>
                            <option value="Security">Security Gate</option>
                            <option value="Reception">Reception / Mailroom</option>
                            <option value="Family">Family Member</option>
                            <option value="Assistant">Office Assistant</option>
                            <option value="Other">Other</option>
                        </Select>
                    </InputGroup>

                    {shipment.codAmount && parseFloat(shipment.codAmount) > 0 ? (
                        <InputGroup>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Label style={{ color: '#059669' }}>💵 COD Cash to Collect *</Label>
                                <button
                                    type="button"
                                    onClick={() => setCodCollected(String(shipment.codAmount))}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#059669',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    Exact Amount
                                </button>
                            </div>
                            <Input
                                type="number"
                                step="0.001"
                                value={codCollected}
                                onChange={(e) => setCodCollected(e.target.value)}
                                style={{
                                    borderColor: '#10b981',
                                    background: 'rgba(16, 185, 129, 0.05)',
                                    fontWeight: 700,
                                    fontSize: '15px'
                                }}
                                placeholder={`Amount in ${shipment.codCurrency || shipment.currency || 'KWD'}`}
                            />
                        </InputGroup>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <input
                                type="checkbox"
                                id="extraCodCheck"
                                checked={parseFloat(codCollected || 0) > 0}
                                onChange={(e) => setCodCollected(e.target.checked ? '1' : '')}
                                style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                            />
                            <label htmlFor="extraCodCheck" style={{ fontSize: '12px', fontWeight: 600, color: TK.text2, cursor: 'pointer' }}>
                                💵 Cash collected on delivery
                            </label>
                            {parseFloat(codCollected || 0) > 0 && (
                                <Input
                                    type="number"
                                    step="0.001"
                                    value={codCollected}
                                    onChange={(e) => setCodCollected(e.target.value)}
                                    placeholder="Amount (KWD)"
                                    style={{ width: '110px', padding: '6px 8px', fontSize: '13px' }}
                                />
                            )}
                        </div>
                    )}
                </div>

                <InputGroup>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Label>Recipient Digital Signature</Label>
                        {hasSignature && (
                            <button
                                type="button"
                                onClick={clearCanvas}
                                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Clear Signature
                            </button>
                        )}
                    </div>
                    <CanvasWrapper>
                        <Canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                        />
                        {!hasSignature && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                pointerEvents: 'none',
                                color: TK.text3,
                                fontSize: '12px'
                            }}>
                                Sign here with finger or mouse
                            </div>
                        )}
                    </CanvasWrapper>
                </InputGroup>

                <InputGroup>
                    <Label>Delivery Notes</Label>
                    <Input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Handed at front door"
                    />
                </InputGroup>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Confirming...' : 'Confirm Delivery (POD)'}
                    </Button>
                </div>
            </ModalCard>
        </ModalBackdrop>
    );
};

export default ProofOfDeliveryModal;
