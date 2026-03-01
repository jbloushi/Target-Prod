import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes, css } from 'styled-components';
import QrScanner from 'react-qr-scanner';
import { shipmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button, Card, StatusPill, Loader, Alert } from '../ui';

// --- Icons (Using SVG directly or imported if available, using SVGs for independence/consistency) ---
// Simplified icons for this view to reduce dependency on MUI icons if aiming for pure custom look, 
// but sticking to standard icons is fine if wrapped. 
// For this refactor, I'll assume we can still keep MUI Icons or replace them. 
// To allow "MUI-Independence" strictly, we should use SVGs, but for speed, keeping MUI Icons 
// wrapped in styled components is a common middle ground. 
// However, the prompt implies "independently of MUI" for *core components*, but often icons are excluded.
// I will use raw SVGs for the critical main actions to be minimal.

const QrIcon = () => (
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
        <path d="M7 12h10" /><path d="M12 7v10" />
    </svg>
);

const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

const TruckIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13"></rect>
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
        <circle cx="5.5" cy="18.5" r="2.5"></circle>
        <circle cx="18.5" cy="18.5" r="2.5"></circle>
    </svg>
);

const LogoutIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
);

const CameraSwitchIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11v7a1 1 0 0 0 1 1h7"></path>
        <path d="M20 4v7a1 1 0 0 1-1 1h-7"></path>
        <path d="M12 21a9 9 0 0 0 9-9"></path>
        <path d="M12 3a9 9 0 0 0-9 9"></path>
    </svg>
);

// --- Styled Components ---

const PageContainer = styled.div`
    min-height: 100vh;
    background: #0a0e1a;
    color: #e8eaf0;
    display: flex;
    flex-direction: column;
    padding-bottom: 40px;
`;

const Header = styled.header`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: transparent;
`;

const LogoSection = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const LogoIcon = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: var(--accent-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #0a0e1a;
`;

const BrandText = styled.div`
    display: flex;
    flex-direction: column;
    
    strong {
        font-family: 'Outfit', sans-serif;
        font-size: 16px;
        line-height: 1.2;
    }
    
    span {
        font-size: 12px;
        color: var(--text-secondary);
    }
`;

const IconButton = styled.button`
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    
    &:hover {
        background: rgba(255,255,255,0.05);
        color: var(--text-primary);
    }
`;

const MainContent = styled.main`
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    padding: 24px;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
    gap: 24px;
`;

const Greeting = styled.h1`
    font-family: 'Outfit', sans-serif;
    font-size: 32px;
    font-weight: 700;
    margin: 0;
`;

const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
`;

const StatCard = styled.div`
    background: #141929;
    border: 1px solid var(--border-color);
    border-radius: 16px;
    padding: 16px;
    
    label {
        font-size: 12px;
        color: var(--text-secondary);
        display: block;
        margin-bottom: 4px;
    }
    
    div {
        font-size: 32px;
        font-weight: 700;
        color: ${props => props.highlight ? 'var(--accent-primary)' : 'var(--text-primary)'};
    }
`;

const ScanButtonContainer = styled.div`
    flex-grow: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
`;

const BigScanButton = styled.button`
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: rgba(0, 217, 184, 0.1);
    border: 2px solid var(--accent-primary);
    color: var(--accent-primary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    cursor: pointer;
    box-shadow: 0 0 40px rgba(0, 217, 184, 0.2);
    transition: all 0.3s ease;
    
    &:hover {
        background: rgba(0, 217, 184, 0.2);
        transform: scale(1.05);
        box-shadow: 0 0 60px rgba(0, 217, 184, 0.4);
    }
    
    span {
        font-weight: 700;
        font-size: 18px;
    }
`;

// Scanner Overlay Styles
const ScannerOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 2000;
    display: flex;
    flex-direction: column;
`;

const ScannerHeader = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    padding: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
    
    h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
    }
`;

const ScannerViewport = styled.div`
    flex-grow: 1;
    position: relative;
    
    video {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
    }
`;

const scanAnimation = keyframes`
    0% { top: 0; opacity: 0; }
    50% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
`;

const TargetBox = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 250px;
    height: 250px;
    border: 2px solid var(--accent-primary);
    border-radius: 16px;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.7);
    
    &::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 2px;
        background: var(--accent-primary);
        animation: ${scanAnimation} 2s infinite ease-in-out;
    }
`;

const ScannerControls = styled.div`
    background: #0a0e1a;
    padding: 32px;
    display: flex;
    justify-content: space-around;
`;

const ControlButton = styled.button`
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    padding: 16px;
    border-radius: 50%;
    cursor: pointer;
    
    &:hover {
        background: rgba(255,255,255,0.1);
    }
`;

// Result Overlay
const popIn = keyframes`
    0% { transform: scale(0); }
    100% { transform: scale(1); }
`;

const ResultOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(10, 14, 26, 0.98);
    z-index: 2001;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
`;

const ResultIcon = styled.div`
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: ${props => props.success ? 'rgba(0, 217, 184, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
    color: ${props => props.success ? '#00d9b8' : '#ef4444'};
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    animation: ${popIn} 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    
    svg {
        width: 60px;
        height: 60px;
    }
`;

const ResultTitle = styled.h2`
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
`;

const ResultMessage = styled.p`
    color: var(--text-secondary);
    margin-bottom: 48px;
`;

const BottomSheet = styled.div`
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #141929;
    border-radius: 24px 24px 0 0;
    padding: 24px;
    transform: translateY(${props => props.open ? '0' : '100%'});
    transition: transform 0.3s ease;
    z-index: 1000;
    border-top: 1px solid var(--border-color);
    max-height: 80vh;
    overflow-y: auto;
`;

const DragHandle = styled.div`
    width: 40px;
    height: 4px;
    background: var(--border-color);
    border-radius: 2px;
    margin: 0 auto 16px;
`;

// --- Main Component ---

const DriverPickupPage = () => {
    const { logout, user } = useAuth();
    const navigate = useNavigate();

    // State
    const [isScanning, setIsScanning] = useState(false);
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState(null); // { type: 'success' | 'error', message: '' }
    const [readyShipments, setReadyShipments] = useState([]);
    const [stats, setStats] = useState({ pickedUpToday: 0 });
    const [isListOpen, setIsListOpen] = useState(false);
    const [manualTracking, setManualTracking] = useState('');
    const [manualLoading, setManualLoading] = useState(false);

    const fetchReadyShipments = async () => {
        try {
            setLoading(true);
            const response = await shipmentService.getAllShipments({ status: 'ready_for_pickup' });
            if (response.success && Array.isArray(response.data)) {
                setReadyShipments(response.data);
            }
            // Fetch live "Picked Up Today" count for this driver
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const pickedResponse = await shipmentService.getAllShipments({
                status: 'picked_up',
                dateFrom: today.toISOString()
            });
            if (pickedResponse.success && Array.isArray(pickedResponse.data)) {
                setStats({ pickedUpToday: pickedResponse.data.length });
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReadyShipments();
    }, []);

    const handleScan = async (data) => {
        if (data && isScanning && !processing) {
            setProcessing(true);
            setIsScanning(false); // Pause scanning

            try {
                const text = data.text || data;
                let trackingNumber = text;
                try {
                    const json = JSON.parse(text);
                    if (json.tracking) trackingNumber = json.tracking;
                } catch (e) { }

                await processPickup(trackingNumber);
            } catch (err) {
                setResult({
                    type: 'error',
                    message: 'Invalid QR Code',
                    detail: 'Format not recognized'
                });
            } finally {
                setProcessing(false);
            }
        }
    };

    const handleError = (err) => {
        console.error(err);
    };

    const processPickup = async (trackingNumber) => {
        try {
            const response = await shipmentService.driverPickupScan(trackingNumber);
            if (response.success) {
                setResult({
                    type: 'success',
                    message: `Shipment ${trackingNumber} Confirmed`,
                    detail: 'Package successfully marked as Picked Up'
                });
                fetchReadyShipments();
            } else {
                setResult({
                    type: 'error',
                    message: 'Pickup Failed',
                    detail: response.error || 'Server rejected the update'
                });
            }
        } catch (err) {
            setResult({
                type: 'error',
                message: 'Scan Error',
                detail: err.message || 'Could not connect to server'
            });
        }
    };

    const resetScanner = () => {
        setResult(null);
        setIsScanning(true);
    };

    const closeScanner = () => {
        setResult(null);
        setIsScanning(false);
    };

    return (
        <PageContainer>
            <Header>
                <LogoSection>
                    <LogoIcon><TruckIcon /></LogoIcon>
                    <BrandText>
                        <strong>TARGET</strong>
                        <span>Driver App</span>
                    </BrandText>
                </LogoSection>
                <IconButton onClick={() => logout()}>
                    <LogoutIcon />
                </IconButton>
            </Header>

            <MainContent>
                <div>
                    <Greeting>Hello, {user?.name?.split(' ')[0] || 'Driver'}</Greeting>
                    <div style={{ marginTop: '16px' }}>
                        <StatsGrid>
                            <StatCard highlight>
                                <label>Ready for Pickup</label>
                                <div>{readyShipments.length}</div>
                            </StatCard>
                            <StatCard>
                                <label>Picked Up Today</label>
                                <div>{stats.pickedUpToday}</div>
                            </StatCard>
                        </StatsGrid>
                    </div>
                </div>

                <ScanButtonContainer>
                    <BigScanButton onClick={() => setIsScanning(true)}>
                        <QrIcon />
                        <span>Tap to Scan</span>
                    </BigScanButton>
                </ScanButtonContainer>

                {/* Manual Tracking Input Fallback */}
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        value={manualTracking}
                        onChange={e => setManualTracking(e.target.value)}
                        placeholder="Enter tracking # manually"
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.05)', color: '#e8eaf0',
                            fontSize: '14px', outline: 'none'
                        }}
                        onKeyDown={e => e.key === 'Enter' && manualTracking.trim() && handleScan({ text: manualTracking.trim() })}
                    />
                    <button
                        disabled={!manualTracking.trim() || manualLoading}
                        onClick={() => {
                            setManualLoading(true);
                            handleScan({ text: manualTracking.trim() }).finally(() => { setManualLoading(false); setManualTracking(''); });
                        }}
                        style={{
                            padding: '12px 20px', borderRadius: '12px', border: 'none',
                            background: '#00d9b8', color: '#0a0e1a', fontWeight: 700,
                            cursor: 'pointer', opacity: (!manualTracking.trim() || manualLoading) ? 0.5 : 1
                        }}
                    >
                        {manualLoading ? '...' : '→'}
                    </button>
                </div>

                <Button variant="ghost" onClick={() => setIsListOpen(!isListOpen)}>
                    {isListOpen ? 'Hide List' : 'View Ready List'}
                </Button>
            </MainContent>

            {/* Scanner Modal */}
            {isScanning && (
                <ScannerOverlay>
                    <ScannerHeader>
                        <h2>Scan Waybill</h2>
                        <IconButton onClick={closeScanner} style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                            <CloseIcon />
                        </IconButton>
                    </ScannerHeader>

                    <ScannerViewport>
                        {navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? (
                            <QrScanner
                                delay={300}
                                onError={handleError}
                                onScan={handleScan}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                constraints={{
                                    video: { facingMode: cameraFacingMode }
                                }}
                            />
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                Camera access requires a secure connection (HTTPS) or localhost. Please check your URL.
                            </div>
                        )}
                        {navigator.mediaDevices && navigator.mediaDevices.getUserMedia && <TargetBox />}
                        {processing && (
                            <div style={{
                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00d9b8'
                            }}>
                                <Loader />
                            </div>
                        )}
                    </ScannerViewport>

                    <ScannerControls>
                        <ControlButton onClick={() => setCameraFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}>
                            <CameraSwitchIcon />
                        </ControlButton>
                    </ScannerControls>
                </ScannerOverlay>
            )}

            {/* Result Overlay */}
            {result && (
                <ResultOverlay>
                    <ResultIcon success={result.type === 'success'}>
                        {result.type === 'success' ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ) : (
                            <CloseIcon />
                        )}
                    </ResultIcon>
                    <ResultTitle>{result.message}</ResultTitle>
                    <ResultMessage>{result.detail}</ResultMessage>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '300px' }}>
                        <Button variant={result.type === 'success' ? 'primary' : 'secondary'} onClick={resetScanner}>
                            Scan Next
                        </Button>
                        <Button variant="ghost" onClick={closeScanner}>
                            Return to Dashboard
                        </Button>
                    </div>
                </ResultOverlay>
            )}

            {/* Bottom Sheet List */}
            <BottomSheet open={isListOpen}>
                <DragHandle onClick={() => setIsListOpen(false)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>Ready Shipments ({readyShipments.length})</h3>
                    <Button variant="ghost" onClick={() => setIsListOpen(false)} style={{ padding: '4px' }}>Close</Button>
                </div>

                {readyShipments.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No shipments pending pickup
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {readyShipments.map(shipment => (
                            <Card key={shipment.trackingNumber}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: 'rgba(0, 217, 184, 0.1)', color: 'var(--accent-primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <TruckIcon />
                                    </div>
                                    <div style={{ flexGrow: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{shipment.trackingNumber}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            {shipment.origin?.city || 'Origin'} → {shipment.destination?.city || 'Dest'}
                                        </div>
                                    </div>
                                    <StatusPill status="ready" />
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </BottomSheet>
        </PageContainer>
    );
};

export default DriverPickupPage;
