import React, { Suspense, lazy, useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { shipmentService, financeService, userService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button, Card, StatusPill, Loader } from '../ui';
import ProofOfDeliveryModal from '../components/ProofOfDeliveryModal';

const QrScanner = lazy(() => import('react-qr-scanner'));

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

const ModeSwitcher = styled.div`
    display: flex;
    background: #141929;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 4px;
    gap: 4px;
    margin-bottom: 8px;
`;

const ModeTab = styled.button`
    flex: 1;
    padding: 10px 14px;
    border-radius: 8px;
    border: none;
    background: ${props => props.active ? 'var(--accent-primary)' : 'transparent'};
    color: ${props => props.active ? '#0a0e1a' : 'var(--text-secondary)'};
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    &:hover {
        color: ${props => props.active ? '#0a0e1a' : 'var(--text-primary)'};
    }
`;

const ScanButtonContainer = styled.div`
    flex-grow: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 280px;
`;

const BigScanButton = styled.button`
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: ${props => props.isDeliver ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0, 217, 184, 0.1)'};
    border: 2px solid ${props => props.isDeliver ? '#3b82f6' : 'var(--accent-primary)'};
    color: ${props => props.isDeliver ? '#3b82f6' : 'var(--accent-primary)'};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    cursor: pointer;
    box-shadow: 0 0 40px ${props => props.isDeliver ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0, 217, 184, 0.2)'};
    transition: all 0.3s ease;
    
    &:hover {
        background: ${props => props.isDeliver ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0, 217, 184, 0.2)'};
        transform: scale(1.05);
        box-shadow: 0 0 60px ${props => props.isDeliver ? 'rgba(59, 130, 246, 0.4)' : 'rgba(0, 217, 184, 0.4)'};
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

// --- Kuwait Governorate Resolver & Route Builder ---
const GOVERNORATE_MAP = {
    'Capital': ['kuwait city', 'sharq', 'dasman', 'mirqab', 'jibla', 'salhiya', 'bneid al-gar', 'bneid al gar', 'kaifan', 'mansouriya', 'abdullah al-salem', 'nuzha', 'faiha', 'shamiya', 'rawda', 'adailiya', 'khaldiya', 'qadsiya', 'yarmouk', 'shuwaikh', 'sulaibikhat', 'doha', 'ghernata', 'qairawan', 'العاصمة', 'مدينة الكويت', 'الشرق', 'دسمان', 'المرقاب', 'القبلة', 'الصالحية', 'بنيد القار', 'كيفان', 'المنصورية', 'عبدالله السالم', 'النزهة', 'الفيحاء', 'الشامية', 'الروضة', 'العديلية', 'الخالدية', 'القادسية', 'اليرموك', 'الشويخ', 'الصليبخات', 'الدوحة', 'غرناطة', 'القيروان'],
    'Hawalli': ['hawalli', 'salmiya', 'rumaithiya', 'jabriya', 'mishref', 'bayan', 'salwa', 'bidaa', 'shaab', 'maidan hawalli', 'hateen', 'hitteen', 'al-siddiq', 'siddiq', 'al-salam', 'salam', 'al-zahra', 'zahra', 'shuhada', 'حولي', 'السالمية', 'الرميثية', 'الجابرية', 'مشرف', 'بيان', 'سلوى', 'البدع', 'الشعب', 'ميدان حولي', 'حطين', 'الصديق', 'السلام', 'الزهراء', 'الشهداء'],
    'Farwaniya': ['farwaniya', 'khaitan', 'omariya', 'rabiya', 'ishbilya', 'jleeb al-shuyoukh', 'jleeb', 'andalus', 'riggae', 'rehab', 'sabah al-nasser', 'abdullah al-mubarak', 'west abdullah al mubarak', 'dajeej', 'ardiya', 'ardhiya', 'الفروانية', 'خيطان', 'العمرية', 'الرابية', 'إشبيلية', 'جليب الشيوخ', 'الأندلس', 'الرقعي', 'الرحاب', 'صباح الناصر', 'عبدالله المبارك', 'غرب عبدالله المبارك', 'الضجيج', 'العارضية'],
    'Mubarak Al-Kabeer': ['sabah al-salem', 'messila', 'abu fatira', 'al-fnaitees', 'fnaitees', 'al-qurain', 'qurain', 'al-qusour', 'qusour', 'al-adan', 'adan', 'mubarak al-kabeer', 'مبارك الكبير', 'صباح السالم', 'المسيلة', 'أبو فطيرة', 'الفنيطيس', 'القرين', 'القصور', 'العدان'],
    'Ahmadi': ['ahmadi', 'fahaheel', 'mangaf', 'abu halifa', 'mahboula', 'egaila', 'sabahiya', 'riqqa', 'hadiya', 'fintas', 'wafra', 'khiran', 'الأحمدي', 'الفحيحيل', 'المنقف', 'أبو حليفة', 'المهبولة', 'العقيلة', 'الصباحية', 'الرقة', 'هدية', 'الفنطاس', 'الوفرة', 'الخيران'],
    'Jahra': ['jahra', 'saad al-abdullah', 'sulaibiya', 'oyoun', 'waha', 'nasseem', 'taima', 'qasr', 'mutlaa', 'الجهراء', 'سعد العبدالله', 'الصليبية', 'العيون', 'الواحة', 'النسيم', 'تيماء', 'القصر', 'المطلاع']
};

const resolveGovernorate = (addressObj = {}) => {
    const text = `${addressObj.governorate || ''} ${addressObj.state || ''} ${addressObj.city || ''} ${addressObj.street || ''} ${addressObj.formattedAddress || ''}`.toLowerCase();
    for (const [gov, keywords] of Object.entries(GOVERNORATE_MAP)) {
        if (text.includes(gov.toLowerCase())) return gov;
        if (keywords.some(kw => text.includes(kw))) return gov;
    }
    return 'Other';
};

const getDestinationAddress = (shipment) => {
    const dest = shipment.destination || {};
    return dest.formattedAddress || [dest.street, dest.city, dest.country].filter(Boolean).join(', ') || 'Kuwait';
};

const generateMultiStopUrl = (shipmentList) => {
    if (!shipmentList || shipmentList.length === 0) return null;
    const destinations = shipmentList.map(s => encodeURIComponent(getDestinationAddress(s)));
    if (destinations.length === 1) {
        return `https://www.google.com/maps/dir/?api=1&destination=${destinations[0]}`;
    }
    const finalStop = destinations[destinations.length - 1];
    const waypoints = destinations.slice(0, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${finalStop}&waypoints=${waypoints}&travelmode=driving`;
};

// --- Main Component ---

const DriverPickupPage = () => {
    const { logout, user } = useAuth();

    // Mode: 'pickup' | 'deliver'
    const [scanMode, setScanMode] = useState('pickup');
    const [selectedGovFilter, setSelectedGovFilter] = useState('ALL');

    // State
    const [isScanning, setIsScanning] = useState(false);
    const [cameraFacingMode, setCameraFacingMode] = useState('environment');
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState(null); // { type: 'success' | 'error', message: '' }
    const [readyShipments, setReadyShipments] = useState([]);
    const [deliveryShipments, setDeliveryShipments] = useState([]);
    const [stats, setStats] = useState({ pickedUpToday: 0, deliveredToday: 0 });
    const [isListOpen, setIsListOpen] = useState(false);
    const [manualTracking, setManualTracking] = useState('');
    const [manualLoading, setManualLoading] = useState(false);

    // COD State
    const [driversList, setDriversList] = useState([]);
    const [selectedDriverId, setSelectedDriverId] = useState(user?.role === 'driver' ? user.id : '');
    const [codTrackingInput, setCodTrackingInput] = useState('');
    const [codTrackingLoading, setCodTrackingLoading] = useState(false);
    const [codFeedback, setCodFeedback] = useState(null);

    const [codSummary, setCodSummary] = useState({
        unremittedTotalsByCurrency: {},
        unremittedCount: 0,
        alerts: [],
        shipments: []
    });
    const [isRemitModalOpen, setIsRemitModalOpen] = useState(false);
    const [remitAmount, setRemitAmount] = useState('');
    const [remitCurrency, setRemitCurrency] = useState('KWD');
    const [remitBagRef, setRemitBagRef] = useState('');
    const [remitNotes, setRemitNotes] = useState('');
    const [remitLoading, setRemitLoading] = useState(false);

    // POD Modal State
    const [selectedPodShipment, setSelectedPodShipment] = useState(null);
    const [isPodModalOpen, setIsPodModalOpen] = useState(false);

    const fetchDriverData = async (overrideDriverId) => {
        try {
            // Load drivers list for staff / admin / managers
            if (['admin', 'staff', 'manager', 'accounting'].includes(user?.role)) {
                try {
                    const uRes = await userService.getUsers('driver');
                    if (uRes?.success && Array.isArray(uRes.data)) {
                        setDriversList(uRes.data);
                        if (!selectedDriverId && !overrideDriverId && uRes.data.length > 0) {
                            setSelectedDriverId(uRes.data[0].id);
                        }
                    }
                } catch (driverErr) {
                    console.warn('Driver list load warning:', driverErr);
                }
            }

            // Ready for pickup shipments
            const response = await shipmentService.getAllShipments({ status: 'ready_for_pickup' });
            if (response.success && Array.isArray(response.data)) {
                setReadyShipments(response.data);
            }

            // In-transit / Out for delivery shipments
            const outForDeliveryRes = await shipmentService.getAllShipments({ status: 'out_for_delivery' });
            if (outForDeliveryRes.success && Array.isArray(outForDeliveryRes.data)) {
                setDeliveryShipments(outForDeliveryRes.data);
            }

            // Picked up today & Delivered today stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const pickedResponse = await shipmentService.getAllShipments({
                status: 'picked_up',
                dateFrom: today.toISOString()
            });
            const deliveredResponse = await shipmentService.getAllShipments({
                status: 'delivered',
                dateFrom: today.toISOString()
            });

            setStats({
                pickedUpToday: Array.isArray(pickedResponse?.data) ? pickedResponse.data.length : 0,
                deliveredToday: Array.isArray(deliveredResponse?.data) ? deliveredResponse.data.length : 0
            });

            // Driver COD Cash Summary
            try {
                const targetId = overrideDriverId || selectedDriverId || (user?.role === 'driver' ? user.id : undefined);
                const params = targetId ? { driverId: targetId } : {};
                const codRes = await financeService.getDriverCodSummary(params);
                if (codRes?.success && codRes?.data) {
                    setCodSummary(codRes.data);
                    const totalKwd = codRes.data.unremittedTotalsByCurrency?.['KWD'] || 0;
                    if (totalKwd > 0) setRemitAmount(String(totalKwd));
                }
            } catch (codErr) {
                console.warn('Driver COD summary load warning:', codErr);
            }
        } catch (err) {
            console.error('Error fetching driver data:', err);
        }
    };

    useEffect(() => {
        fetchDriverData();
    }, []);

    const handleDriverChange = async (driverId) => {
        setSelectedDriverId(driverId);
        setCodFeedback(null);
        await fetchDriverData(driverId);
    };

    const handleAddCodShipment = async (trackingToLookup) => {
        const tracking = (trackingToLookup || codTrackingInput).trim();
        if (!tracking) return;

        try {
            setCodTrackingLoading(true);
            setCodFeedback(null);
            const res = await shipmentService.getShipment(tracking);
            const shipment = res?.data?.data || res?.data || res;

            if (!shipment || !shipment.trackingNumber) {
                setCodFeedback({ type: 'error', message: `Shipment "${tracking}" not found in system.` });
                return;
            }

            const codVal = parseFloat(shipment.codAmount || 0);
            if (codVal <= 0) {
                setCodFeedback({ type: 'error', message: `Shipment ${shipment.trackingNumber} has no COD amount registered.` });
                return;
            }

            if (shipment.codStatus === 'REMITTED') {
                setCodFeedback({ type: 'error', message: `Shipment ${shipment.trackingNumber} COD has already been remitted to vault.` });
                return;
            }

            const existing = (codSummary.shipments || []).find(s => s.id === shipment.id || s.trackingNumber === shipment.trackingNumber);
            if (existing) {
                setCodFeedback({ type: 'info', message: `Shipment ${shipment.trackingNumber} is already in the COD handover list.` });
                setCodTrackingInput('');
                return;
            }

            const cur = shipment.codCurrency || 'KWD';
            const newShipment = {
                ...shipment,
                codStatus: shipment.codStatus || 'COLLECTED',
                codCurrency: cur,
                codAmount: codVal,
                assignedDriver: shipment.assignedDriver || {
                    id: selectedDriverId || user?.id,
                    name: driversList.find(d => d.id === selectedDriverId)?.name || user?.name
                }
            };

            const updatedShipments = [newShipment, ...(codSummary.shipments || [])];
            const prevTotal = parseFloat(codSummary.unremittedTotalsByCurrency?.[cur] || 0);
            const updatedTotals = {
                ...(codSummary.unremittedTotalsByCurrency || {}),
                [cur]: (prevTotal + codVal).toFixed(3)
            };

            setCodSummary({
                ...codSummary,
                shipments: updatedShipments,
                unremittedCount: (codSummary.unremittedCount || 0) + 1,
                unremittedTotalsByCurrency: updatedTotals
            });

            setRemitAmount(prev => {
                const current = parseFloat(prev || 0);
                return String((current + codVal).toFixed(3));
            });

            setCodFeedback({
                type: 'success',
                message: `Shipment ${shipment.trackingNumber} (${codVal.toFixed(3)} ${cur}) linked to handover.`
            });
            setCodTrackingInput('');
        } catch (err) {
            console.error('Error adding COD shipment:', err);
            setCodFeedback({
                type: 'error',
                message: err.response?.data?.error || err.message || `Failed to find shipment ${tracking}`
            });
        } finally {
            setCodTrackingLoading(false);
        }
    };

    const handleRemitSubmit = async () => {
        if (!remitAmount || parseFloat(remitAmount) <= 0) {
            alert('Please enter a valid cash amount to remit');
            return;
        }

        const effectiveDriverId = selectedDriverId || (user?.role === 'driver' ? user.id : '');
        if (!effectiveDriverId) {
            alert('Please select a driver from the pick list for this handover.');
            return;
        }

        try {
            setRemitLoading(true);
            const unremittedShipmentIds = (codSummary.shipments || [])
                .filter(s => s.codStatus !== 'REMITTED')
                .map(s => s.id || s.trackingNumber);

            await financeService.requestDriverCodRemittance({
                driverId: effectiveDriverId,
                amount: parseFloat(remitAmount),
                currency: remitCurrency,
                shipmentIds: unremittedShipmentIds,
                bagReference: remitBagRef.trim(),
                notes: remitNotes.trim()
            });

            setIsRemitModalOpen(false);
            setRemitBagRef('');
            setRemitNotes('');
            const driverObj = driversList.find(d => d.id === effectiveDriverId);
            const driverName = driverObj?.name || user?.name || 'Driver';
            setResult({
                type: 'success',
                message: 'Cash Handover Submitted',
                detail: `Handover request of ${parseFloat(remitAmount).toFixed(3)} ${remitCurrency} submitted for ${driverName}. Hand physical cash to the hub vault cashier.`
            });
            setCodFeedback({
                type: 'success',
                message: `Cash handover of ${parseFloat(remitAmount).toFixed(3)} ${remitCurrency} submitted for ${driverName}. Awaiting cashier verification.`
            });
            await fetchDriverData(effectiveDriverId);
        } catch (err) {
            console.error('Failed to submit cash handover:', err);
            alert(err.response?.data?.error || err.message || 'Failed to submit cash handover');
        } finally {
            setRemitLoading(false);
        }
    };

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
                } catch (e) {
                    // Non-JSON QR payloads are valid when they contain the tracking number directly.
                }

                if (scanMode === 'deliver') {
                    await initiatePodFlow(trackingNumber);
                } else {
                    await processPickup(trackingNumber);
                }
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

    const initiatePodFlow = async (trackingNumber) => {
        try {
            const res = await shipmentService.getShipment(trackingNumber);
            const shipment = res?.data || res;
            if (!shipment || !shipment.trackingNumber) {
                throw new Error('Shipment not found');
            }
            setSelectedPodShipment(shipment);
            setIsPodModalOpen(true);
        } catch (err) {
            setResult({
                type: 'error',
                message: 'Shipment Lookup Failed',
                detail: err.message || 'Could not fetch package details for POD'
            });
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
                fetchDriverData();
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

    const handlePodSuccess = (updatedShipment) => {
        setResult({
            type: 'success',
            message: `Delivery Complete (${updatedShipment.trackingNumber})`,
            detail: 'Proof of Delivery and signature captured successfully.'
        });
        fetchDriverData();
    };

    const resetScanner = () => {
        setResult(null);
        setIsScanning(true);
    };

    const closeScanner = () => {
        setResult(null);
        setIsScanning(false);
    };

    const rawList = scanMode === 'pickup' ? readyShipments : deliveryShipments;
    const isDeliverMode = scanMode === 'deliver';
    const isCashMode = scanMode === 'cash';

    const totalHeldCashKwd = (codSummary.unremittedTotalsByCurrency?.['KWD'] || 0);
    const totalHeldCashFormatted = Object.entries(codSummary.unremittedTotalsByCurrency || {})
        .map(([curr, amt]) => `${Number(amt).toFixed(3)} ${curr}`)
        .join(', ') || '0.000 KWD';

    // Enrich list with detected governorate
    const enrichedList = rawList.map(s => ({
        ...s,
        governorate: resolveGovernorate(isDeliverMode ? s.destination : s.origin)
    }));

    // Filter by selected governorate
    const filteredList = selectedGovFilter === 'ALL'
        ? enrichedList
        : enrichedList.filter(s => s.governorate === selectedGovFilter);

    // Available Governorates with counts
    const govCounts = enrichedList.reduce((acc, s) => {
        acc[s.governorate] = (acc[s.governorate] || 0) + 1;
        return acc;
    }, {});

    const multiStopRouteUrl = generateMultiStopUrl(filteredList);

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
                        <ModeSwitcher>
                            <ModeTab
                                active={scanMode === 'pickup'}
                                onClick={() => { setScanMode('pickup'); setSelectedGovFilter('ALL'); }}
                            >
                                <TruckIcon /> Pickup
                            </ModeTab>
                            <ModeTab
                                active={scanMode === 'deliver'}
                                onClick={() => { setScanMode('deliver'); setSelectedGovFilter('ALL'); }}
                            >
                                ✍️ Deliver & POD
                            </ModeTab>
                            <ModeTab
                                active={scanMode === 'cash'}
                                onClick={() => { setScanMode('cash'); }}
                            >
                                💵 Cash & COD ({totalHeldCashKwd > 0 ? `${totalHeldCashKwd.toFixed(3)} KWD` : '0 KWD'})
                            </ModeTab>
                        </ModeSwitcher>

                        {isCashMode ? (
                            <StatsGrid>
                                <StatCard highlight={true}>
                                    <label>Held COD Cash in Hand</label>
                                    <div style={{ fontSize: '24px', color: '#10b981' }}>{totalHeldCashFormatted}</div>
                                </StatCard>
                                <StatCard highlight={false}>
                                    <label>Unremitted COD Orders</label>
                                    <div style={{ fontSize: '24px' }}>{codSummary.unremittedCount || 0}</div>
                                </StatCard>
                            </StatsGrid>
                        ) : (
                            <StatsGrid>
                                <StatCard highlight={scanMode === 'pickup'}>
                                    <label>{scanMode === 'pickup' ? 'Ready for Pickup' : 'Out for Delivery'}</label>
                                    <div>{scanMode === 'pickup' ? readyShipments.length : deliveryShipments.length}</div>
                                </StatCard>
                                <StatCard highlight={scanMode === 'deliver'}>
                                    <label>{scanMode === 'pickup' ? 'Picked Up Today' : 'Delivered Today'}</label>
                                    <div>{scanMode === 'pickup' ? stats.pickedUpToday : stats.deliveredToday}</div>
                                </StatCard>
                            </StatsGrid>
                        )}
                    </div>
                </div>

                {/* Cash & COD Mode Dedicated View */}
                {isCashMode ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Alerts Banner */}
                        {codSummary.alerts && codSummary.alerts.length > 0 && (
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid #ef4444',
                                borderRadius: '16px',
                                padding: '16px',
                                color: '#fca5a5'
                            }}>
                                {codSummary.alerts.map((alert, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                                        <span>⚠️</span>
                                        <span>{alert.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Remittance Action Card */}
                        <Card style={{ background: '#141929', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#e8eaf0' }}>
                                        💵 Hub Vault Handover
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        Hand over collected cash to the hub cashier at the end of your shift
                                    </div>
                                </div>
                                <Button
                                    variant="primary"
                                    onClick={() => {
                                        setRemitAmount(String(totalHeldCashKwd || ''));
                                        setIsRemitModalOpen(true);
                                    }}
                                    disabled={totalHeldCashKwd <= 0 && codSummary.shipments?.length === 0}
                                    style={{
                                        background: '#10b981',
                                        padding: '10px 18px',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
                                    }}
                                >
                                    🏦 Handover Cash to Vault
                                </Button>
                            </div>
                        </Card>

                        {/* Driver Selector (staff / admin / manager only) */}
                        {['admin', 'staff', 'manager', 'accounting'].includes(user?.role) && driversList.length > 0 && (
                            <Card style={{ background: '#141929', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                    👤 Select Driver
                                </label>
                                <select
                                    value={selectedDriverId}
                                    onChange={(e) => handleDriverChange(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        background: '#1c2333',
                                        color: '#e8eaf0',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="">— Select a driver —</option>
                                    {driversList.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} {d.phone ? `(${d.phone})` : ''}</option>
                                    ))}
                                </select>
                            </Card>
                        )}

                        {/* Add Shipment to Handover */}
                        <Card style={{ background: '#141929', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                📦 Add Shipment to Handover
                            </label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    value={codTrackingInput}
                                    onChange={(e) => setCodTrackingInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && codTrackingInput.trim() && handleAddCodShipment()}
                                    placeholder="Enter tracking number (e.g. TRK-COD-01)"
                                    style={{
                                        flex: 1,
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#e8eaf0',
                                        fontSize: '14px',
                                        outline: 'none'
                                    }}
                                />
                                <button
                                    disabled={!codTrackingInput.trim() || codTrackingLoading}
                                    onClick={() => handleAddCodShipment()}
                                    style={{
                                        padding: '10px 18px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: codTrackingLoading ? '#374151' : '#10b981',
                                        color: '#0a0e1a',
                                        fontWeight: 700,
                                        cursor: (!codTrackingInput.trim() || codTrackingLoading) ? 'not-allowed' : 'pointer',
                                        opacity: (!codTrackingInput.trim() || codTrackingLoading) ? 0.5 : 1,
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {codTrackingLoading ? '⌛' : '+ Add'}
                                </button>
                            </div>
                            {codFeedback && (
                                <div style={{
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: codFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)'
                                        : codFeedback.type === 'error' ? 'rgba(239, 68, 68, 0.15)'
                                        : 'rgba(59, 130, 246, 0.15)',
                                    color: codFeedback.type === 'success' ? '#6ee7b7'
                                        : codFeedback.type === 'error' ? '#fca5a5'
                                        : '#93c5fd',
                                    border: `1px solid ${codFeedback.type === 'success' ? 'rgba(16,185,129,0.3)' : codFeedback.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`
                                }}>
                                    {codFeedback.type === 'success' ? '✓' : codFeedback.type === 'error' ? '✕' : 'ℹ'} {codFeedback.message}
                                </div>
                            )}
                        </Card>

                        {/* List of Collected COD Shipments */}
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-secondary)' }}>
                                Collected COD Shipments ({codSummary.shipments?.length || 0})
                            </div>
                            {(!codSummary.shipments || codSummary.shipments.length === 0) ? (
                                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', background: '#141929', borderRadius: '16px' }}>
                                    No COD cash collected on record for this shift.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {codSummary.shipments.map((s) => {
                                        const isRemitted = s.codStatus === 'REMITTED';
                                        return (
                                            <Card key={s.id || s.trackingNumber} style={{ background: '#141929', border: '1px solid var(--border-color)', padding: '14px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontWeight: 700, color: '#e8eaf0' }}>{s.trackingNumber}</span>
                                                            <span style={{
                                                                fontSize: '10px',
                                                                fontWeight: 700,
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                background: isRemitted ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                                                color: isRemitted ? '#93c5fd' : '#6ee7b7'
                                                            }}>
                                                                {isRemitted ? 'VAULT REMITTED' : 'HELD IN HAND'}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                            Updated: {new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>
                                                            {Number(s.codAmount).toFixed(3)} {s.codCurrency || 'KWD'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Route Optimization & Multi-Stop Dispatch Banner */}
                        {filteredList.length > 0 && (
                            <div style={{
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(0, 217, 184, 0.08))',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '16px',
                                padding: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#e8eaf0' }}>
                                            🗺️ Route Optimizer ({filteredList.length} Stops)
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            Sequenced by Kuwait Governorate
                                        </div>
                                    </div>
                                    {multiStopRouteUrl && (
                                        <a
                                            href={multiStopRouteUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                background: '#3b82f6',
                                                color: '#fff',
                                                padding: '8px 14px',
                                                borderRadius: '10px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                textDecoration: 'none',
                                                boxShadow: '0 2px 10px rgba(59, 130, 246, 0.3)'
                                            }}
                                        >
                                            🚀 Start Google Route
                                        </a>
                                    )}
                                </div>

                                {/* Governorate Filter Chips */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => setSelectedGovFilter('ALL')}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '8px',
                                            border: selectedGovFilter === 'ALL' ? '1px solid #00d9b8' : '1px solid rgba(255,255,255,0.1)',
                                            background: selectedGovFilter === 'ALL' ? 'rgba(0, 217, 184, 0.15)' : 'rgba(255,255,255,0.03)',
                                            color: selectedGovFilter === 'ALL' ? '#00d9b8' : 'var(--text-secondary)',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        All ({enrichedList.length})
                                    </button>
                                    {Object.entries(govCounts).map(([gov, count]) => (
                                        <button
                                            key={gov}
                                            onClick={() => setSelectedGovFilter(gov)}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '8px',
                                                border: selectedGovFilter === gov ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                                                background: selectedGovFilter === gov ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                                                color: selectedGovFilter === gov ? '#93c5fd' : 'var(--text-secondary)',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {gov} ({count})
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <ScanButtonContainer>
                            <BigScanButton isDeliver={isDeliverMode} onClick={() => setIsScanning(true)}>
                                <QrIcon />
                                <span>{isDeliverMode ? 'Scan & POD' : 'Tap to Scan'}</span>
                            </BigScanButton>
                        </ScanButtonContainer>

                        {/* Manual Tracking Input Fallback */}
                        <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                                value={manualTracking}
                                onChange={e => setManualTracking(e.target.value)}
                                placeholder={`Enter tracking # for ${isDeliverMode ? 'Delivery POD' : 'Pickup'}`}
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
                                    background: isDeliverMode ? '#3b82f6' : '#00d9b8', color: '#0a0e1a', fontWeight: 700,
                                    cursor: 'pointer', opacity: (!manualTracking.trim() || manualLoading) ? 0.5 : 1
                                }}
                            >
                                {manualLoading ? '...' : '→'}
                            </button>
                        </div>

                        <Button variant="ghost" onClick={() => setIsListOpen(!isListOpen)}>
                            {isListOpen ? 'Hide List' : `View ${isDeliverMode ? 'Delivery' : 'Pickup'} List (${filteredList.length})`}
                        </Button>
                    </>
                )}
            </MainContent>

            {/* Scanner Modal */}
            {isScanning && (
                <ScannerOverlay>
                    <ScannerHeader>
                        <h2>{isDeliverMode ? 'Scan Package to Deliver (POD)' : 'Scan Waybill to Pickup'}</h2>
                        <IconButton onClick={closeScanner} style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                            <CloseIcon />
                        </IconButton>
                    </ScannerHeader>

                    <ScannerViewport>
                        {navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? (
                            <Suspense fallback={<Loader />}>
                                <QrScanner
                                    delay={300}
                                    onError={handleError}
                                    onScan={handleScan}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    constraints={{
                                        video: { facingMode: cameraFacingMode }
                                    }}
                                />
                            </Suspense>
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

            {/* Proof of Delivery Modal */}
            <ProofOfDeliveryModal
                isOpen={isPodModalOpen}
                shipment={selectedPodShipment}
                onClose={() => {
                    setIsPodModalOpen(false);
                    setSelectedPodShipment(null);
                }}
                onDelivered={(updated) => {
                    setIsPodModalOpen(false);
                    setSelectedPodShipment(null);
                    handlePodSuccess(updated);
                }}
            />

            {/* Cash Handover Remittance Modal */}
            {isRemitModalOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }}>
                    <Card style={{
                        background: '#141929', border: '1px solid var(--border-color)',
                        borderRadius: '20px', padding: '24px', width: '100%', maxWidth: '440px',
                        display: 'flex', flexDirection: 'column', gap: '16px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#e8eaf0' }}>
                                    💵 Hub Vault Cash Handover
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    Submit shift cash count to cashier
                                </div>
                            </div>
                            <button
                                onClick={() => setIsRemitModalOpen(false)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '20px', cursor: 'pointer' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                Handover Cash Amount *
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                                <input
                                    type="number"
                                    step="0.001"
                                    value={remitAmount}
                                    onChange={(e) => setRemitAmount(e.target.value)}
                                    placeholder="0.000"
                                    style={{
                                        padding: '12px 14px', borderRadius: '10px',
                                        border: '1px solid rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.05)',
                                        color: '#10b981', fontSize: '16px', fontWeight: 800, outline: 'none'
                                    }}
                                />
                                <select
                                    value={remitCurrency}
                                    onChange={(e) => setRemitCurrency(e.target.value)}
                                    style={{
                                        padding: '12px 10px', borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.15)', background: '#1c2333',
                                        color: '#e8eaf0', fontSize: '14px', fontWeight: 700, outline: 'none'
                                    }}
                                >
                                    <option value="KWD">KWD</option>
                                    <option value="SAR">SAR</option>
                                    <option value="AED">AED</option>
                                    <option value="BHD">BHD</option>
                                    <option value="OMR">OMR</option>
                                    <option value="QAR">QAR</option>
                                    <option value="USD">USD</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                Cash Bag / Security Envelope Ref (Optional)
                            </label>
                            <input
                                type="text"
                                value={remitBagRef}
                                onChange={(e) => setRemitBagRef(e.target.value)}
                                placeholder="e.g. BAG-0915"
                                style={{
                                    padding: '10px 14px', borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
                                    color: '#e8eaf0', fontSize: '14px', outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                Handover Notes (Optional)
                            </label>
                            <input
                                type="text"
                                value={remitNotes}
                                onChange={(e) => setRemitNotes(e.target.value)}
                                placeholder="e.g. Handed to Cashier Ahmed at Shuwaikh Hub"
                                style={{
                                    padding: '10px 14px', borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)',
                                    color: '#e8eaf0', fontSize: '14px', outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <Button variant="ghost" onClick={() => setIsRemitModalOpen(false)} disabled={remitLoading}>
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleRemitSubmit}
                                disabled={remitLoading || !remitAmount || parseFloat(remitAmount) <= 0}
                                style={{ background: '#10b981', fontWeight: 700 }}
                            >
                                {remitLoading ? 'Submitting...' : 'Submit Handover'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* Bottom Sheet List */}
            <BottomSheet open={isListOpen}>
                <DragHandle onClick={() => setIsListOpen(false)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>
                        {isDeliverMode ? 'Delivery Packages' : 'Ready for Pickup'} ({filteredList.length})
                    </h3>
                    <Button variant="ghost" onClick={() => setIsListOpen(false)} style={{ padding: '4px' }}>Close</Button>
                </div>

                {filteredList.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {isDeliverMode ? 'No packages in selected governorate' : 'No shipments pending pickup'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {filteredList.map((shipment, index) => {
                            const destAddress = getDestinationAddress(shipment);
                            const singleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destAddress)}`;
                            const hasCod = shipment.codAmount && parseFloat(shipment.codAmount) > 0;
                            return (
                                <Card key={shipment.trackingNumber}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.08)',
                                            color: '#fff', fontSize: '12px', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            #{index + 1}
                                        </div>
                                        <div style={{ flexGrow: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 600 }}>{shipment.trackingNumber}</span>
                                                <span style={{
                                                    fontSize: '10px',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(59, 130, 246, 0.2)',
                                                    color: '#93c5fd'
                                                }}>
                                                    {shipment.governorate}
                                                </span>
                                                {hasCod && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(16, 185, 129, 0.2)',
                                                        color: '#6ee7b7',
                                                        fontWeight: 700
                                                    }}>
                                                        💵 {Number(shipment.codAmount).toFixed(3)} {shipment.codCurrency || 'KWD'} COD
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                {destAddress}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <a
                                                href={singleNavUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                style={{
                                                    padding: '6px 10px',
                                                    borderRadius: '8px',
                                                    background: 'rgba(255,255,255,0.08)',
                                                    color: '#e8eaf0',
                                                    fontSize: '11px',
                                                    textDecoration: 'none',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                📍
                                            </a>
                                            {isDeliverMode ? (
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    style={{ padding: '6px 12px', fontSize: '12px', background: '#3b82f6' }}
                                                    onClick={() => {
                                                        setSelectedPodShipment(shipment);
                                                        setIsPodModalOpen(true);
                                                        setIsListOpen(false);
                                                    }}
                                                >
                                                    Deliver
                                                </Button>
                                            ) : (
                                                <StatusPill status="ready" />
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </BottomSheet>
        </PageContainer>
    );
};

export default DriverPickupPage;

