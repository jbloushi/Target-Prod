import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Modal, Button, Input, StatusPill, Loader } from '../../ui';
import api from '../../services/api'; // use api directly if shipmentService is not exported, or just import shipmentService
import { shipmentService } from '../../services/api';

const ComparisonGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
`;

const StatCard = styled.div`
    background: var(--bg-secondary);
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--border-color);

    label {
        font-size: 12px;
        color: var(--text-secondary);
        display: block;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .value {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-primary);
        display: flex;
        align-items: baseline;
        gap: 4px;

        small {
            font-size: 14px;
            font-weight: normal;
            color: var(--text-secondary);
        }
    }
`;

const HeaderSection = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
`;

const TitleBlock = styled.div`
    h2 {
        margin: 0 0 8px 0;
        font-size: 20px;
    }
    p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 14px;
    }
`;

const DiscrepancyNotice = styled.div`
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
    padding: 12px;
    color: #ef4444;
    font-size: 13px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const WarehouseIntakeModal = ({ isOpen, onClose, trackingNumber, onProcessed }) => {
    const [shipment, setShipment] = useState(null);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    
    const [actualWeight, setActualWeight] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && trackingNumber) {
            fetchShipmentDetails();
        }
    }, [isOpen, trackingNumber]);

    const fetchShipmentDetails = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await shipmentService.getShipmentByTrackingNumber(trackingNumber);
            if (res?.data) {
                setShipment(res.data);
                const declared = calculateDeclaredWeight(res.data);
                setActualWeight(declared.toString());
            }
        } catch (err) {
            console.error('Failed to fetch shipment details:', err);
            setError('Failed to load shipment data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const calculateDeclaredWeight = (data) => {
        if (!data) return 0;
        if (Array.isArray(data.parcels) && data.parcels.length > 0) {
            return data.parcels.reduce((acc, p) => acc + (Number(p.weight) || 0), 0);
        }
        if (Array.isArray(data.items)) {
            return data.items.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);
        }
        return 0;
    };

    const handleProcess = async (action) => {
        setProcessing(true);
        setError('');
        try {
            const payload = {
                action, // 'receive' or 'verify'
                weight: parseFloat(actualWeight)
            };
            
            await shipmentService.warehouseScan(trackingNumber, payload);
            
            // Auto-book if 'verify' and not internal
            if (action === 'verify' && shipment.carrierCode && shipment.carrierCode !== 'INTERNAL') {
                try {
                    await shipmentService.bookShipment(trackingNumber, shipment.carrierCode);
                } catch (bookErr) {
                    console.error('Auto-booking failed:', bookErr);
                }
            }

            onProcessed(trackingNumber);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to process shipment. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen) return null;

    const declaredWeight = calculateDeclaredWeight(shipment);
    const weightDiff = parseFloat(actualWeight) - declaredWeight;
    const isDiscrepancy = Math.abs(weightDiff) > 0.05;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Warehouse Hub Intake">
            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <Loader size="large" />
                </div>
            ) : shipment ? (
                <div>
                    <HeaderSection>
                        <TitleBlock>
                            <h2>{shipment.trackingNumber}</h2>
                            <p>{shipment.shipperAddress?.contactPerson || 'Unknown Shipper'} &rarr; {shipment.receiverAddress?.contactPerson || 'Unknown Receiver'}</p>
                        </TitleBlock>
                        <StatusPill status={shipment.status} />
                    </HeaderSection>

                    {error && (
                        <div style={{ color: '#ef4444', marginBottom: '16px', fontSize: '14px' }}>
                            {error}
                        </div>
                    )}

                    <ComparisonGrid>
                        <StatCard>
                            <label>Declared Weight</label>
                            <div className="value">
                                {declaredWeight.toFixed(2)} <small>kg</small>
                            </div>
                        </StatCard>
                        <StatCard style={{ borderColor: isDiscrepancy ? '#ef4444' : 'var(--border-color)' }}>
                            <label>Certified Scale Weight</label>
                            <Input
                                type="number"
                                step="0.1"
                                value={actualWeight}
                                onChange={(e) => setActualWeight(e.target.value)}
                                style={{ marginTop: '8px' }}
                            />
                        </StatCard>
                    </ComparisonGrid>

                    {isDiscrepancy && (
                        <DiscrepancyNotice>
                            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Weight discrepancy detected: {weightDiff > 0 ? '+' : ''}{weightDiff.toFixed(2)} kg. System will apply discrepancy billing policy.
                        </DiscrepancyNotice>
                    )}

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px' }}>
                        <div>
                            {!shipment.paid && (
                                <Button
                                    variant="secondary"
                                    onClick={async () => {
                                        try {
                                            await shipmentService.sendPaymentLink(trackingNumber, { recipientRole: 'sender' });
                                            alert('WhatsApp payment link sent to customer!');
                                        } catch (e) {
                                            alert('Failed to send payment link');
                                        }
                                    }}
                                    disabled={processing}
                                    style={{ fontSize: '13px' }}
                                >
                                    💬 Send Pay-Link
                                </Button>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button variant="secondary" onClick={onClose} disabled={processing}>
                                Cancel
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => handleProcess('receive')}
                                disabled={processing || shipment.status === 'received_at_hub' || shipment.status === 'verified'}
                            >
                                Receive at Hub
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => handleProcess('verify')}
                                disabled={processing || shipment.status === 'verified'}
                            >
                                {processing ? 'Processing...' : 'Verify & Dispatch'}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Failed to load shipment data.
                </div>
            )}
        </Modal>
    );
};

export default WarehouseIntakeModal;
