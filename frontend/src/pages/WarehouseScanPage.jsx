import React, { Suspense, lazy, useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { shipmentService } from '../services/api';
import {
    PageHeader,
    Card,
    Button,
    StatusPill,
    Loader,
    Alert
} from '../ui';

const QrScanner = lazy(() => import('react-qr-scanner'));

// --- Icons ---
const WarehouseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8" />
        <path d="M6 6h12v11H6z" />
        <path d="M3 6h18" />
        <path d="M8 21v-5h8v5" />
    </svg>
);

const CameraSwitchIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const RefreshIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
);

// --- Styled Components ---

const Container = styled.div`
    max-width: 900px;
    margin: 0 auto;
    padding: 24px;
`;

const ScannerCard = styled(Card)`
    text-align: center;
    max-width: 600px;
    margin: 0 auto 32px auto;
    padding: 32px;
    position: relative;
    overflow: hidden;
`;

const ScannerViewport = styled.div`
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: #000;
    height: 350px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 20px rgba(0,0,0,0.5);
    margin-bottom: 24px;
    
    video {
        object-fit: cover !important;
    }
`;

const scanAnimation = keyframes`
    0% { top: 10%; opacity: 0; }
    50% { opacity: 1; }
    100% { top: 90%; opacity: 0; }
`;

const ScanLine = styled.div`
    position: absolute;
    width: 80%;
    height: 2px;
    background: var(--accent-secondary, #3b82f6);
    top: 50%;
    left: 10%;
    box-shadow: 0 0 8px var(--accent-secondary, #3b82f6);
    animation: ${scanAnimation} 2s infinite ease-in-out;
    pointer-events: none;
`;

const Overlay = styled.div`
    position: absolute;
    inset: 0;
    pointer-events: none;
    border: 50px solid rgba(0,0,0,0.6);
`;

const TargetBox = styled.div`
    position: absolute;
    width: 70%;
    height: 250px;
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-radius: 8px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
`;

const IncomingList = styled(Card)`
    max-width: 600px;
    margin: 0 auto;
`;

const ListHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    
    h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
    }
`;

const ListContent = styled.div`
    max-height: 400px;
    overflow-y: auto;
`;

const ListItem = styled.div`
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    cursor: pointer;
    transition: background 0.2s;
    
    &:hover {
        background: var(--bg-secondary);
    }
    
    &:last-child {
        border-bottom: none;
    }
`;

const ItemIcon = styled.div`
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: rgba(59, 130, 246, 0.1);
    color: var(--accent-secondary, #3b82f6);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16px;
`;

// --- Main Component ---

const WarehouseScanPage = () => {
    const [scanResult, setScanResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [isScanning, setIsScanning] = useState(true);
    const [incomingShipments, setIncomingShipments] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const fetchIncomingShipments = async () => {
        setRefreshing(true);
        try {
            const response = await shipmentService.getAllShipments({ status: 'picked_up' });
            if (response.success && Array.isArray(response.data)) {
                setIncomingShipments(response.data);
            }
        } catch (err) {
            console.error('Failed to fetch incoming shipments', err);
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchIncomingShipments();
    }, []);

    const handleScan = async (data) => {
        if (data && isScanning) {
            setIsScanning(false);
            try {
                const text = data.text || data;
                let trackingNumber = text;
                try {
                    const json = JSON.parse(text);
                    if (json.tracking) trackingNumber = json.tracking;
                } catch (e) {
                    // Non-JSON QR payloads are valid when they contain the tracking number directly.
                }

                await processInbound(trackingNumber);
            } catch (err) {
                setError('Invalid QR Code format');
                setScanResult(null);
                setTimeout(() => setIsScanning(true), 2000);
            }
        }
    };

    const handleError = (err) => {
        console.error(err);
        setError('Camera access error or Permission denied.');
    };

    const processInbound = async (trackingNumber) => {
        setLoading(true);
        setError('');
        setSuccessMsg('');
        setScanResult(trackingNumber);

        try {
            const response = await shipmentService.warehouseScan(trackingNumber);
            if (response.success) {
                setSuccessMsg(`Shipment ${trackingNumber} Processed Successfully!`);
                fetchIncomingShipments();
            } else {
                setError(response.error || 'Failed to update shipment');
            }
        } catch (err) {
            if (err.response && err.response.status === 404) {
                setError(`Shipment not found: ${trackingNumber}. Ensure it's a valid label.`);
            } else {
                setError(err.message || 'Network or Server Error');
            }
        } finally {
            setLoading(false);
        }
    };

    const resetScanner = () => {
        setScanResult(null);
        setError('');
        setSuccessMsg('');
        setIsScanning(true);
    };

    const toggleCamera = () => {
        setCameraFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    };

    return (
        <Container>
            <PageHeader
                title="Warehouse Inbound"
                description="Scan incoming shipments to confirm arrival at facility."
                secondaryAction={
                    <Button variant="secondary" onClick={() => window.location.href = '/dashboard'}>
                        Dashboard
                    </Button>
                }
            />

            <ScannerCard>
                {error && (
                    <div style={{ marginBottom: '24px' }}>
                        <Alert type="error" title="Error">{error}</Alert>
                    </div>
                )}

                {successMsg ? (
                    <div style={{ padding: '32px 0' }}>
                        <div style={{
                            width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)',
                            color: '#3b82f6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: '24px'
                        }}>
                            <WarehouseIcon />
                        </div>
                        <h2 style={{ fontSize: '24px', margin: '0 0 16px 0' }}>Inbound Processed</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>{successMsg}</p>
                        <Button variant="primary" onClick={resetScanner} style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                            Scan Next
                        </Button>
                    </div>
                ) : (
                    <>
                        <ScannerViewport>
                            {loading && (
                                <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <Loader color="white" />
                                    <span style={{ color: 'white', marginTop: '16px', fontWeight: 600 }}>Processing...</span>
                                </div>
                            )}

                            {isScanning ? (
                                navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? (
                                    <Suspense fallback={<Loader />}>
                                        <QrScanner
                                            delay={300}
                                            onError={handleError}
                                            onScan={handleScan}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            constraints={{ video: { facingMode: cameraFacingMode } }}
                                        />
                                    </Suspense>
                                ) : (
                                    <div style={{ padding: '24px', textAlign: 'center', color: '#ef4444', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, position: 'relative' }}>
                                        Camera access requires a secure connection (HTTPS) or localhost. Please check your URL.
                                    </div>
                                )
                            ) : (
                                <div style={{ color: 'white' }}>Paused</div>
                            )}

                            <Overlay />
                            {navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (
                                <>
                                    <TargetBox />
                                    <ScanLine />
                                </>
                            )}
                        </ScannerViewport>

                        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', alignItems: 'center' }}>
                            <Button width="auto" variant="secondary" onClick={toggleCamera}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <CameraSwitchIcon /> Switch Camera
                                </div>
                            </Button>
                        </div>

                        {scanResult && !successMsg && !loading && !error && (
                            <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                Last Scanned: {scanResult}
                            </div>
                        )}
                    </>
                )}
            </ScannerCard>

            <IncomingList>
                <ListHeader>
                    <h3>Incoming from Drivers</h3>
                    <Button variant="ghost" onClick={fetchIncomingShipments} disabled={refreshing} style={{ padding: '8px' }}>
                        <RefreshIcon />
                    </Button>
                </ListHeader>
                <ListContent>
                    {incomingShipments.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            No shipments currently en route from drivers.
                        </div>
                    ) : (
                        incomingShipments.map((shipment) => (
                            <ListItem key={shipment.trackingNumber} onClick={() => processInbound(shipment.trackingNumber)}>
                                <ItemIcon>
                                    <WarehouseIcon />
                                </ItemIcon>
                                <div style={{ flexGrow: 1 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{shipment.trackingNumber}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        {shipment.origin?.city || 'Origin'} → {shipment.destination?.city || 'Dest'}
                                    </div>
                                </div>
                                <StatusPill status="in_transit">Incoming</StatusPill>
                            </ListItem>
                        ))
                    )}
                </ListContent>
            </IncomingList>
        </Container>
    );
};

export default WarehouseScanPage;
