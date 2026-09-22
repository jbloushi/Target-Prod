import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { shipmentService } from '../services/api';
import { Card, Button, StatusPill, Loader } from '../ui';
import { TK } from '../tokens/kineticHorizon';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PrintIcon from '@mui/icons-material/Print';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import StoreIcon from '@mui/icons-material/Store';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const PageWrapper = styled.div`
    min-height: 100vh;
    background: #f8fafc;
    color: ${TK.text1};
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px 64px;
`;

const Container = styled.div`
    width: 100%;
    max-width: 680px;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const HeaderBrand = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 8px;

    .logo-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: ${TK.primary};
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin: 0;
    }
`;

const StepCard = styled(Card)`
    padding: 28px;
    background: #ffffff;
    border: 1px solid ${TK.border};
    border-radius: 18px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.03);
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const Input = styled.input`
    width: 100%;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1.5px solid ${TK.border};
    font-size: 15px;
    font-weight: 600;
    color: ${TK.text1};
    outline: none;
    transition: all 0.2s ease;

    &:focus {
        border-color: ${TK.primary};
        box-shadow: 0 0 0 3px ${TK.primary}20;
    }
`;

const Select = styled.select`
    width: 100%;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1.5px solid ${TK.border};
    font-size: 14px;
    font-weight: 600;
    color: ${TK.text1};
    background: #ffffff;
    outline: none;
    cursor: pointer;

    &:focus {
        border-color: ${TK.primary};
    }
`;

const OptionButton = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border-radius: 14px;
    border: 2px solid ${props => props.selected ? TK.primary : TK.border};
    background: ${props => props.selected ? `${TK.primary}08` : '#ffffff'};
    cursor: pointer;
    transition: all 0.2s ease;

    .icon-box {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: ${props => props.selected ? TK.primary : '#f1f5f9'};
        color: ${props => props.selected ? '#ffffff' : TK.text2};
        display: flex;
        align-items: center;
        justify-content: center;
    }

    &:hover {
        border-color: ${TK.primary};
    }
`;

const PublicReturnPortalPage = () => {
    const { trackingNumber: initialTracking } = useParams();
    const navigate = useNavigate();

    const [trackingInput, setTrackingInput] = useState(initialTracking || '');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [eligibilityData, setEligibilityData] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    // Form fields
    const [selectedReason, setSelectedReason] = useState('');
    const [notes, setNotes] = useState('');
    const [pickupPreference, setPickupPreference] = useState('DROP_OFF'); // 'DROP_OFF' | 'COURIER_PICKUP'
    const [completedReturn, setCompletedReturn] = useState(null);

    const checkEligibility = async (tn) => {
        const queryTracking = (tn || trackingInput).trim();
        if (!queryTracking) return;

        try {
            setLoading(true);
            setErrorMsg('');
            setEligibilityData(null);
            setCompletedReturn(null);

            const res = await shipmentService.checkReturnEligibility(queryTracking);
            if (res.success && res.eligible) {
                setEligibilityData(res.data);
                setSelectedReason(res.data.allowedReasons?.[0] || 'Defective or Damaged');
            } else if (res.alreadyReturned) {
                setEligibilityData({ ...res, isAlreadyReturned: true });
            } else {
                setErrorMsg(res.error || 'This package is not eligible for return.');
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.error || err.message || 'Failed to verify return eligibility');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (initialTracking) {
            checkEligibility(initialTracking);
        }
    }, [initialTracking]);

    const handleSubmitReturn = async () => {
        if (!selectedReason) {
            alert('Please select a reason for the return.');
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                returnReason: selectedReason,
                customerNotes: notes,
                pickupPreference
            };

            const res = await shipmentService.createPublicReturn(eligibilityData.trackingNumber, payload);
            if (res.success && res.data) {
                setCompletedReturn(res.data);
            } else {
                alert(res.error || 'Failed to create return waybill');
            }
        } catch (err) {
            alert(err.response?.data?.error || err.message || 'Failed to submit return request');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <PageWrapper>
            <Container>
                <HeaderBrand>
                    <div className="logo-icon"><AssignmentReturnIcon /></div>
                    <div>
                        <h1>Target Logistics</h1>
                        <div style={{ fontSize: '13px', color: TK.text3, fontWeight: 600 }}>Customer Self-Service Returns</div>
                    </div>
                </HeaderBrand>

                {/* Step 1: Look up Package */}
                {!eligibilityData && !completedReturn && (
                    <StepCard>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Enter Delivered Tracking Number</h2>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: TK.text2 }}>
                                Eligible within 14 days of confirmed package delivery.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Input
                                value={trackingInput}
                                onChange={e => setTrackingInput(e.target.value)}
                                placeholder="e.g. TRK-KW-100234 or DGR-10029"
                                onKeyDown={e => e.key === 'Enter' && checkEligibility()}
                            />
                            <Button
                                variant="primary"
                                disabled={!trackingInput.trim() || loading}
                                onClick={() => checkEligibility()}
                                style={{ padding: '0 24px', flexShrink: 0 }}
                            >
                                {loading ? 'Verifying...' : 'Check Return'}
                            </Button>
                        </div>

                        {errorMsg && (
                            <div style={{
                                padding: '14px 16px', borderRadius: '12px',
                                background: '#fef2f2', border: '1px solid #fecaca',
                                color: '#991b1b', fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'center'
                            }}>
                                <ErrorOutlineIcon fontSize="small" />
                                <div>{errorMsg}</div>
                            </div>
                        )}
                    </StepCard>
                )}

                {/* Already Returned State */}
                {eligibilityData?.isAlreadyReturned && (
                    <StepCard>
                        <div style={{ textAlign: 'center', padding: '16px' }}>
                            <CheckCircleOutlineIcon sx={{ fontSize: 54, color: TK.primary, mb: 1 }} />
                            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px' }}>Return Already Authorized</h2>
                            <p style={{ color: TK.text2, fontSize: '14px', margin: '0 0 16px' }}>
                                A return waybill has already been created for this shipment.
                            </p>
                            <div style={{
                                background: '#f1f5f9', padding: '12px 16px', borderRadius: '12px',
                                fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, display: 'inline-block'
                            }}>
                                {eligibilityData.existingReturnTracking}
                            </div>
                        </div>

                        <Button variant="ghost" onClick={() => { setEligibilityData(null); setTrackingInput(''); }}>
                            Search Another Waybill
                        </Button>
                    </StepCard>
                )}

                {/* Step 2: Return Configuration Form */}
                {eligibilityData && !eligibilityData.isAlreadyReturned && !completedReturn && (
                    <StepCard>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${TK.border}`, pb: 2 }}>
                            <div>
                                <span style={{ fontSize: '12px', color: TK.text3, fontWeight: 700, textTransform: 'uppercase' }}>Shipment</span>
                                <h2 style={{ margin: '2px 0 0', fontSize: '18px', fontWeight: 800 }}>{eligibilityData.trackingNumber}</h2>
                                <div style={{ fontSize: '13px', color: TK.text2, marginTop: '2px' }}>
                                    Merchant: <strong>{eligibilityData.merchant}</strong> • {eligibilityData.daysRemaining} days left to return
                                </div>
                            </div>
                            <StatusPill status="delivered" />
                        </div>

                        {/* Return Reason */}
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: TK.text2, marginBottom: '6px' }}>
                                Reason for Return
                            </label>
                            <Select value={selectedReason} onChange={e => setSelectedReason(e.target.value)}>
                                {eligibilityData.allowedReasons?.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </Select>
                        </div>

                        {/* Customer Notes */}
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: TK.text2, marginBottom: '6px' }}>
                                Additional Details / Defect Description (Optional)
                            </label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Describe the reason for return in detail..."
                                rows={3}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '12px',
                                    border: `1.5px solid ${TK.border}`, fontSize: '14px', outline: 'none',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>

                        {/* Return Method */}
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: TK.text2, marginBottom: '8px' }}>
                                Return Handover Preference
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <OptionButton
                                    selected={pickupPreference === 'DROP_OFF'}
                                    onClick={() => setPickupPreference('DROP_OFF')}
                                >
                                    <div className="icon-box"><StoreIcon /></div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '14px' }}>Hub Drop-Off</div>
                                        <div style={{ fontSize: '12px', color: TK.text3 }}>Drop package at local hub</div>
                                    </div>
                                </OptionButton>

                                <OptionButton
                                    selected={pickupPreference === 'COURIER_PICKUP'}
                                    onClick={() => setPickupPreference('COURIER_PICKUP')}
                                >
                                    <div className="icon-box"><LocalShippingIcon /></div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '14px' }}>Courier Pickup</div>
                                        <div style={{ fontSize: '12px', color: TK.text3 }}>Driver picks up from address</div>
                                    </div>
                                </OptionButton>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <Button
                                variant="ghost"
                                onClick={() => { setEligibilityData(null); setTrackingInput(''); }}
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                disabled={submitting}
                                onClick={handleSubmitReturn}
                                style={{ flex: 2 }}
                            >
                                {submitting ? 'Generating Return Label...' : 'Authorize & Create Return'}
                            </Button>
                        </div>
                    </StepCard>
                )}

                {/* Step 3: Success & Printable Return Label */}
                {completedReturn && (
                    <StepCard>
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '50%',
                                background: '#f0fdf4', color: '#16a34a', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
                            }}>
                                <CheckCircleOutlineIcon sx={{ fontSize: 40 }} />
                            </div>
                            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px' }}>Return Waybill Generated!</h2>
                            <p style={{ color: TK.text2, fontSize: '14px', margin: 0 }}>
                                Please affix the return label to your packaged item.
                            </p>
                        </div>

                        <div style={{
                            background: '#f8fafc', border: `1px solid ${TK.border}`,
                            borderRadius: '14px', padding: '16px', display: 'flex',
                            flexDirection: 'column', gap: '10px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: TK.text3, fontWeight: 700 }}>RETURN TRACKING #</span>
                                <strong style={{ fontFamily: 'monospace', fontSize: '16px', color: TK.primary }}>
                                    {completedReturn.trackingNumber}
                                </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: TK.text3, fontWeight: 700 }}>DESTINATION</span>
                                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                                    {completedReturn.destination?.company || completedReturn.destination?.contactPerson || 'Merchant Hub'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: TK.text3, fontWeight: 700 }}>STATUS</span>
                                <StatusPill status={completedReturn.status} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button
                                variant="primary"
                                onClick={() => window.open(`/api/shipments/${completedReturn.trackingNumber}/label`, '_blank')}
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <PrintIcon fontSize="small" /> Print Return Label
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => navigate(`/track?tracking=${completedReturn.trackingNumber}`)}
                                style={{ flex: 1 }}
                            >
                                Track Return
                            </Button>
                        </div>
                    </StepCard>
                )}
            </Container>
        </PageWrapper>
    );
};

export default PublicReturnPortalPage;
