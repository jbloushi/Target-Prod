import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useShipment } from '../context/ShipmentContext';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from 'notistack';
import {
    StatusPill,
    Loader,
    Alert
} from '../ui';
import {
    Drawer,
    Typography,
    Stack,
    Box,
    Divider,
    TextField,
    Chip,
    Grid,
    IconButton as MuiIconButton,
    FormControl,
    InputLabel,
    Select,
    MenuItem
} from '@mui/material';
import TrackingTimeline from '../components/TrackingTimeline';
import AddressPanel from '../components/AddressPanel';
import ShipmentContent from '../components/shipment/ShipmentContent';
import ProofOfDeliveryModal from '../components/ProofOfDeliveryModal';
import { financeService, integrationService, shipmentService, userService } from '../services/api';
import api from '../services/api';
import {
    STATUS_ORDER, STATUS_LABELS, INTERNAL_SHIPMENT_STATUSES, getStepIndex
} from '../constants/statusConfig';
import {
    buildShipmentDeleteBlockedMessage,
    canDeleteShipmentStatus,
    getShipmentDeleteErrorMessage
} from '../utils/shipmentDeletionPolicy';
import { getCarrierDisplayName } from '../utils/shipmentDisplay';
import { generateWaybillPDF, generateCommercialInvoicePDF } from '../utils/pdfGenerator';
import { TK } from '../tokens/kineticHorizon';

const getAllowedStatusOptions = (user, shipment) => {
    if (!user || !shipment) return [];
    const role = user.role;
    if (['admin', 'staff', 'manager', 'accounting'].includes(role)) {
        return INTERNAL_SHIPMENT_STATUSES;
    }
    return [];
};

const getShipmentTypeLabel = (shipmentType) => (
    shipmentType === 'documents' ? 'Document Express' : 'Standard Package'
);

// --- Kinetic Horizon Styled Components ---

const PageContainer = styled.div`
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 20px 60px;
    min-height: 100vh;
`;

const KineticHeroCard = styled.div`
    background: #ffffff;
    border: 1px solid ${TK.border};
    border-radius: ${TK.radiusCard}px;
    padding: 28px 32px;
    margin-bottom: 24px;
    box-shadow: ${TK.shadowMd};
    position: relative;
    overflow: hidden;
`;

const TrackingHeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 20px;
`;

const TrackingNumberDisplay = styled.div`
    display: flex;
    align-items: center;
    gap: 14px;

    h1 {
        font-family: 'Outfit', 'Manrope', sans-serif;
        font-size: 28px;
        font-weight: 800;
        color: ${TK.text1};
        margin: 0;
        letter-spacing: -0.02em;
    }
`;

const CarrierBadge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: ${TK.radiusPill}px;
    font-size: 12px;
    font-weight: 700;
    background: ${TK.primaryBg};
    color: ${TK.primary};
    border: 1px solid ${TK.border};
`;

const QuickActionBar = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
`;

const ActionButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: ${TK.radiusMd}px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid ${props => props.primary ? 'transparent' : props.danger ? '#fca5a5' : TK.border};
    background: ${props => props.primary ? TK.primary : props.danger ? '#fee2e2' : '#ffffff'};
    color: ${props => props.primary ? '#ffffff' : props.danger ? '#dc2626' : TK.text1};

    &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: ${TK.shadowSm};
        background: ${props => props.primary ? TK.primaryDark : props.danger ? '#fecaca' : '#fafbfc'};
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }
`;

const RouteStatusBar = styled.div`
    background: ${TK.surface};
    border-radius: ${TK.radiusMd}px;
    padding: 20px 24px;
    margin-top: 16px;
    border: 1px solid ${TK.border};
`;

const ContentGrid = styled.div`
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 24px;
    align-items: start;

    @media (max-width: 1100px) {
        grid-template-columns: 1fr;
    }
`;

const MainColumn = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const SidebarColumn = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
    position: sticky;
    top: 24px;
`;

const KineticCard = styled.div`
    background: #ffffff;
    border: 1px solid ${TK.border};
    border-radius: ${TK.radiusCard}px;
    padding: 24px;
    box-shadow: ${TK.shadowSm};
    transition: box-shadow 0.2s ease;

    &:hover {
        box-shadow: ${TK.shadowMd};
    }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid ${TK.border};

    .title-group {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 800;
        color: ${TK.text1};
        letter-spacing: -0.01em;

        span.material-symbols-outlined {
            color: ${TK.primary};
            font-size: 20px;
        }
    }
`;

const DocumentTile = styled.div`
    background: ${TK.surface};
    border: 1px solid ${TK.border};
    border-radius: ${TK.radiusMd}px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: all 0.2s ease;

    &:hover {
        border-color: ${TK.primary};
        box-shadow: ${TK.shadowSm};
    }

    .doc-icon-wrapper {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        span {
            font-size: 24px;
        }
    }
`;

const PartyCard = styled.div`
    background: #ffffff;
    border: 1px solid ${TK.border};
    border-radius: ${TK.radiusCard}px;
    padding: 20px 24px;
    flex: 1;
    min-width: 280px;
`;

const PartyName = styled.div`
    font-size: 16px;
    font-weight: 700;
    color: ${TK.text1};
    margin-bottom: 4px;
`;

const PartyContact = styled.div`
    font-size: 13px;
    color: ${TK.text2};
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
`;

const PartyAddress = styled.div`
    font-size: 13px;
    color: ${TK.text2};
    line-height: 1.5;
    margin-top: 10px;
    padding: 10px 12px;
    background: ${TK.surface};
    border-radius: ${TK.radiusSm}px;
    border: 1px solid ${TK.border};
`;

const SummaryMetricsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
`;

const MetricBox = styled.div`
    background: ${TK.surface};
    border: 1px solid ${TK.border};
    border-radius: ${TK.radiusMd}px;
    padding: 14px 16px;

    label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: ${TK.text3};
        display: block;
        margin-bottom: 4px;
    }

    div {
        font-size: 16px;
        font-weight: 800;
        color: ${TK.text1};
    }
`;

const DataTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;

    th {
        text-align: left;
        padding: 10px 12px;
        background: ${TK.surface};
        color: ${TK.text2};
        font-weight: 700;
        font-size: 11.5px;
        text-transform: uppercase;
        border-bottom: 1px solid ${TK.border};
    }

    td {
        padding: 12px;
        border-bottom: 1px solid ${TK.border};
        color: ${TK.text1};
    }

    tr:last-child td {
        border-bottom: none;
    }
`;

const WhatsAppLogGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
`;

const WhatsAppLogCardComponent = ({ logs = [], sendingRole = null, onSendRole }) => {
    const roles = [
        { key: 'sender', label: 'Sender Notification' },
        { key: 'receiver', label: 'Receiver Notification' }
    ];

    return (
        <KineticCard>
            <CardHeader>
                <div className="title-group">
                    <span className="material-symbols-outlined" style={{ color: '#25D366' }}>chat</span>
                    WhatsApp Dispatch Tracker
                </div>
                <Chip size="small" label={`${logs.length} logs`} sx={{ fontWeight: 700, fontSize: 11 }} />
            </CardHeader>

            <WhatsAppLogGrid>
                {roles.map(role => {
                    const roleLogs = (logs || []).filter(l => l.recipientRole === role.key);
                    const latestLog = roleLogs[0] || null;
                    const isSent = latestLog && ['sent', 'delivered', 'read'].includes(latestLog.status);

                    return (
                        <div
                            key={role.key}
                            style={{
                                padding: '14px 16px',
                                background: TK.surface,
                                borderRadius: TK.radiusMd,
                                border: `1px solid ${TK.border}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: TK.text1 }}>{role.label}</div>
                                <span style={{
                                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                                    background: isSent ? '#dcfce7' : '#fef3c7',
                                    color: isSent ? '#15803d' : '#b45309'
                                }}>
                                    {latestLog ? latestLog.status.toUpperCase() : 'QUEUED'}
                                </span>
                            </div>

                            {latestLog && (
                                <div style={{ fontSize: 12, color: TK.text2 }}>
                                    To: <strong>{latestLog.recipientPhone || 'Customer'}</strong> • Event: {latestLog.eventType}
                                </div>
                            )}

                            {onSendRole && (
                                <ActionButton
                                    primary
                                    onClick={() => onSendRole(role.key)}
                                    disabled={sendingRole === role.key}
                                    style={{ marginTop: 4, width: '100%', justifyContent: 'center' }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                                    {sendingRole === role.key ? 'Dispatching...' : isSent ? 'Re-send WhatsApp Update' : 'Send WhatsApp Now'}
                                </ActionButton>
                            )}
                        </div>
                    );
                })}
            </WhatsAppLogGrid>
        </KineticCard>
    );
};

// 5 Edit Tabs Definition
const EDIT_TABS = [
    { key: 'sender', label: 'Shipper', icon: 'flight_takeoff' },
    { key: 'receiver', label: 'Consignee', icon: 'flight_land' },
    { key: 'content', label: 'Parcels & Goods', icon: 'inventory_2' },
    { key: 'billing', label: 'Billing & Terms', icon: 'receipt_long' },
    { key: 'status', label: 'Status & Milestones', icon: 'history' }
];

export const ShipmentDetailsPage = () => {
    const { trackingNumber } = useParams();
    const navigate = useNavigate();
    const fetchedRef = useRef(false);
    const [accounting, setAccounting] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isGeneratingCarrierDocs, setIsGeneratingCarrierDocs] = useState(false);
    const [editDrawerOpen, setEditDrawerOpen] = useState(false);
    const [editSection, setEditSection] = useState('sender');
    const [editDraft, setEditDraft] = useState(null);
    const [editErrors, setEditErrors] = useState({});
    const [clients, setClients] = useState([]);
    const [sendingWhatsAppRole, setSendingWhatsAppRole] = useState(null);
    const [conversionDrawerOpen, setConversionDrawerOpen] = useState(false);
    const [conversionCarrierCode, setConversionCarrierCode] = useState('DGR');
    const [conversionServiceCode, setConversionServiceCode] = useState('P');
    const [conversionTargetCarriers, setConversionTargetCarriers] = useState([]);
    const [isPodModalOpen, setIsPodModalOpen] = useState(false);
    const [isCarrierDocsCollapsed, setIsCarrierDocsCollapsed] = useState(true);

    const { user, can } = useAuth();
    const { enqueueSnackbar } = useSnackbar();

    const {
        shipment,
        loading,
        error,
        getShipment,
    } = useShipment();

    useEffect(() => {
        if (!trackingNumber) return;
        fetchedRef.current = false;

        const fetchShipmentData = async () => {
            if (fetchedRef.current) return;
            fetchedRef.current = true;
            try {
                await getShipment(trackingNumber);
            } catch (err) {
                console.error('Failed to load shipment details:', err);
            }
        };

        fetchShipmentData();
    }, [trackingNumber, getShipment]);

    const shipmentId = shipment?._id || shipment?.id;
    const organizationId = shipment?.organizationId || shipment?.organization?._id;

    useEffect(() => {
        if (!shipmentId) return;

        const loadAccounting = async () => {
            try {
                const accountingResponse = await financeService.getShipmentAccounting(shipmentId);
                setAccounting(accountingResponse.data);
            } catch (error) {
                console.error('Failed to load shipment accounting:', error);
            }
        };

        loadAccounting();
    }, [shipmentId, organizationId]);

    const [sendingPaymentLink, setSendingPaymentLink] = useState(false);

    const handleSendPaymentLink = async (recipientRole = 'sender') => {
        if (!shipment?.trackingNumber) return;
        setSendingPaymentLink(true);
        try {
            await shipmentService.sendPaymentLink(shipment.trackingNumber, { recipientRole });
            enqueueSnackbar('WhatsApp Pay-by-Link sent to customer!', { variant: 'success' });
            await getShipment(shipment.trackingNumber);
        } catch (error) {
            console.error('Failed to send payment link:', error);
            enqueueSnackbar(error.response?.data?.error || error.message || 'Failed to send WhatsApp payment link', { variant: 'error' });
        } finally {
            setSendingPaymentLink(false);
        }
    };

    const handleCopyPaymentLink = () => {
        if (!shipment?.trackingNumber) return;
        const link = `${window.location.origin}/pay/${shipment.trackingNumber}`;
        navigator.clipboard.writeText(link);
        enqueueSnackbar('Payment checkout link copied to clipboard!', { variant: 'success' });
    };

    const handleOpenPdf = async (pdfData) => {
        if (!pdfData) return;
        try {
            // Handle base64 data
            if (typeof pdfData === 'string' && pdfData.startsWith('data:application/pdf;base64,')) {
                const base64Str = pdfData.split(',')[1];
                const byteCharacters = atob(base64Str);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank');
                return;
            }

            // Handle relative upload paths (convert to secure backend API call)
            if (typeof pdfData === 'string' && pdfData.startsWith('/uploads/documents/')) {
                const filename = pdfData.split('/').pop();
                const secureUrl = `/shipments/${shipment.trackingNumber}/documents/${filename}`;

                try {
                    const response = await api.get(secureUrl, { responseType: 'blob' });
                    const blob = response.data;
                    const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                    window.open(blobUrl, '_blank');
                } catch (err) {
                    console.error('Failed to load secure document:', err);
                    enqueueSnackbar('Failed to load secure document', { variant: 'error' });
                }
                return;
            }

            // Handle API endpoints or external URLs
            if (typeof pdfData === 'string' && (pdfData.startsWith('/api/') || pdfData.startsWith('http://') || pdfData.startsWith('https://'))) {
                window.open(pdfData, '_blank');
                return;
            }

            window.open(pdfData, '_blank');
        } catch (error) {
            console.error('Failed to open document:', error);
            enqueueSnackbar('Failed to load document', { variant: 'error' });
        }
    };

    const handleOpenEdit = (section = 'sender') => {
        if (!shipment) return;
        setEditSection(section);
        const draft = JSON.parse(JSON.stringify(shipment));
        if (!draft.sender && draft.origin) draft.sender = draft.origin;
        if (!draft.receiver && draft.destination) draft.receiver = draft.destination;
        draft.dangerousGoods = {
            contains: false,
            ...(draft.dangerousGoods || draft.origin?.dangerousGoods || {})
        };

        setEditDraft(draft);
        setEditErrors({});
        setEditDrawerOpen(true);

        if (section === 'billing' || section === 'sender') {
            if (isStaff && clients.length === 0) {
                userService.getClients().then(res => setClients(res.data || []));
            }
        }
    };

    const handleSaveEdit = async () => {
        if (!editDraft || !shipment) return;
        setIsProcessing(true);
        try {
            const payload = {
                origin: editDraft.sender || editDraft.origin,
                destination: editDraft.receiver || editDraft.destination,
                parcels: editDraft.parcels,
                items: editDraft.items,
                dangerousGoods: editDraft.dangerousGoods,
                packagingType: editDraft.packagingType,
                shipmentType: editDraft.shipmentType,
                incoterm: editDraft.incoterm,
                reference: editDraft.reference,
                currency: editDraft.currency
            };

            if (editDraft.status && editDraft.status !== shipment.status) {
                payload.status = editDraft.status;
                payload.description = editDraft.statusDescription || `Status changed to ${STATUS_LABELS[editDraft.status] || editDraft.status}`;
            }

            if (isInternalShipment) {
                if (editDraft.price !== undefined && editDraft.price !== '') payload.price = Number(editDraft.price);
                if (editDraft.costPrice !== undefined && editDraft.costPrice !== '') payload.costPrice = Number(editDraft.costPrice);
                if (editDraft.estimatedDelivery) payload.estimatedDelivery = editDraft.estimatedDelivery;
            }

            await shipmentService.updateShipmentDetails(shipment.trackingNumber, payload);
            enqueueSnackbar('Consignment details saved successfully!', { variant: 'success' });
            setEditDrawerOpen(false);
            await getShipment(shipment.trackingNumber);
        } catch (error) {
            enqueueSnackbar(error.message || 'Failed to update shipment', { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleGenerateInvoiceQR = async () => {
        if (!shipment) return;
        try {
            await generateWaybillPDF(shipment);
        } catch (err) {
            console.error('Failed to generate Invoice/QR:', err);
            enqueueSnackbar('Failed to generate Target Invoice/QR PDF', { variant: 'error' });
        }
    };

    const handleSendWhatsAppRole = async (recipientRole, eventType = 'shipment_created') => {
        if (!shipment?.trackingNumber || !recipientRole) return;
        setSendingWhatsAppRole(recipientRole);
        try {
            await integrationService.sendChatwootTestMessage({
                trackingNumber: shipment.trackingNumber,
                eventType,
                recipientRole,
                force: true
            });
            enqueueSnackbar(`WhatsApp message queued for ${recipientRole}!`, { variant: 'success' });
            await getShipment(shipment.trackingNumber);
        } catch (error) {
            enqueueSnackbar(error.message || 'Failed to send WhatsApp message', { variant: 'error' });
        } finally {
            setSendingWhatsAppRole(null);
        }
    };

    const handleOpenConversion = async () => {
        if (!shipment?.trackingNumber) return;
        setConversionDrawerOpen(true);
        try {
            const targetsRes = await shipmentService.getInternalShipmentConversionTargets(shipment.trackingNumber);
            const carriers = targetsRes.data || [];
            setConversionTargetCarriers(carriers);
            const defaultTarget = carriers[0];
            if (defaultTarget) {
                setConversionCarrierCode(defaultTarget.code);
                setConversionServiceCode(defaultTarget.serviceOptions?.[0]?.code || 'P');
            }
        } catch (err) {
            console.error('Failed to fetch conversion targets:', err);
        }
    };

    const handleConvertAndBook = async () => {
        if (!conversionCarrierCode || !conversionServiceCode) {
            enqueueSnackbar('Please select a carrier and service.', { variant: 'warning' });
            return;
        }
        setIsProcessing(true);
        try {
            const res = await shipmentService.convertInternalShipment(shipment.trackingNumber, {
                carrierCode: conversionCarrierCode,
                serviceCode: conversionServiceCode,
                bookWithCarrier: true,
                autoBook: true
            });
            const awb = res?.data?.booking?.trackingNumber || res?.data?.shipment?.dhlTrackingNumber || res?.data?.shipment?.carrierShipmentId;
            enqueueSnackbar(`Shipment converted and booked with ${conversionCarrierCode}! ${awb ? `(AWB: ${awb})` : ''}`, { variant: 'success' });
            setConversionDrawerOpen(false);
            await getShipment(shipment.trackingNumber);
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || error.message || 'Failed to convert shipment', { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApproveAndBook = async () => {
        if (!shipment) return;
        const rawCarrier = shipment.carrierCode || shipment.carrier || 'INTERNAL';
        const isInternal = String(rawCarrier).toUpperCase() === 'INTERNAL' || shipment.internallyManaged === true;

        if (isInternal) {
            handleOpenConversion();
            return;
        }

        setIsProcessing(true);
        try {
            const existingOptionalCodes = (shipment.pricingSnapshot?.optionalServices || []).map(s => s.serviceCode);
            const res = await shipmentService.bookShipment(shipment.trackingNumber, rawCarrier, existingOptionalCodes, false);
            const awb = res?.data?.trackingNumber || res?.data?.shipment?.dhlTrackingNumber || res?.data?.shipment?.carrierShipmentId;
            enqueueSnackbar(`Shipment booked with carrier successfully! ${awb ? `(AWB: ${awb})` : ''}`, { variant: 'success' });
            await getShipment(shipment.trackingNumber);
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || error.message || 'Failed to book with carrier', { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleGenerateCarrierDocs = async (docTypeToOpen = 'awb') => {
        if (!shipment) return;
        if (isInternalShipment) {
            handleOpenConversion();
            return;
        }

        setIsGeneratingCarrierDocs(true);
        try {
            const res = await shipmentService.generateCarrierDocuments(shipment.trackingNumber);
            const awb = res?.data?.carrierShipmentId || res?.data?.awbUrl || res?.data?.labelUrl;
            enqueueSnackbar(`Carrier AWB & Invoice generated successfully from ${carrierDisplayName}! ${awb ? `(AWB: ${awb})` : ''}`, { variant: 'success' });
            await getShipment(shipment.trackingNumber);

            let openUrl = null;
            if (docTypeToOpen === 'invoice') {
                openUrl = res?.data?.invoiceUrl || res?.data?.shipment?.invoiceUrl;
            } else {
                openUrl = res?.data?.awbUrl || res?.data?.labelUrl || res?.data?.shipment?.awbUrl || res?.data?.shipment?.labelUrl;
            }

            if (openUrl) {
                handleOpenPdf(openUrl);
            }
        } catch (err) {
            console.error('Failed to generate carrier documents:', err);
            enqueueSnackbar(err.response?.data?.error || err.message || 'Failed to generate carrier documents', { variant: 'error' });
        } finally {
            setIsGeneratingCarrierDocs(false);
        }
    };

    const handleDelete = async () => {
        if (!canDeleteShipmentStatus(shipment.status)) {
            enqueueSnackbar(buildShipmentDeleteBlockedMessage(shipment.status).short, { variant: 'warning' });
            return;
        }
        if (window.confirm(`Delete consignment ${shipment.trackingNumber}? This cannot be undone.`)) {
            try {
                await shipmentService.deleteShipment(shipment.trackingNumber);
                enqueueSnackbar('Consignment deleted successfully', { variant: 'success' });
                navigate('/shipments');
            } catch (err) {
                enqueueSnackbar(getShipmentDeleteErrorMessage(err, shipment.status), { variant: 'warning' });
            }
        }
    };

    if (loading && !shipment) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <Loader size="48px" />
            </div>
        );
    }

    if (error || (!shipment && !loading)) {
        return (
            <div style={{ maxWidth: '800px', margin: '40px auto' }}>
                <Alert type="error" title="Error">
                    {error || 'Shipment not found.'}
                </Alert>
                <div style={{ marginTop: '24px' }}>
                    <ActionButton primary onClick={() => navigate('/shipments')}>
                        Back to Shipments
                    </ActionButton>
                </div>
            </div>
        );
    }

    const sender = shipment.origin || shipment.sender || {};
    const receiver = shipment.destination || shipment.receiver || {};
    const parcels = shipment.parcels || [];
    const items = shipment.items || [];
    const totalWeight = parcels.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
    const totalPieces = parcels.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0);
    const rawCarrierCode = (shipment.carrier || shipment.carrierCode || 'DGR').toUpperCase();
    const isInternalShipment = rawCarrierCode === 'INTERNAL' || shipment.internallyManaged === true;
    const carrierDisplayName = getCarrierDisplayName(rawCarrierCode);
    const publicTrackingUrl = `${window.location.origin}/track/${shipment.trackingNumber}`;

    const isStaff = !user || ['admin', 'staff', 'manager', 'accounting', 'org_manager', 'org_agent'].includes(user?.role) || (typeof can === 'function' && can('BOOK_CARRIERS'));
    const canEdit = isStaff || shipment.status === 'draft';

    const rawDocuments = Array.isArray(shipment.documents) ? shipment.documents : [];
    const extractDocUrl = (doc) => {
        if (!doc) return null;
        if (typeof doc === 'string') return doc;
        return doc.url || doc.path || null;
    };

    const carrierAwbDoc = rawDocuments.find(d => ['label', 'awb', 'waybilldoc'].includes(String(d?.type || '').toLowerCase()));
    const carrierInvoiceDoc = rawDocuments.find(d => ['invoice', 'customs_invoice'].includes(String(d?.type || '').toLowerCase()));

    const resolvedCarrierAwb = shipment.labelUrl || shipment.awbUrl || extractDocUrl(carrierAwbDoc);
    const resolvedCarrierInvoice = shipment.invoiceUrl || extractDocUrl(carrierInvoiceDoc);
    const hasCarrierBooking = Boolean(shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.dhlConfirmed || resolvedCarrierAwb);
    const canApproveOrBook = isStaff && !hasCarrierBooking && ['draft', 'pending', 'pending_approval', 'ready_for_pickup', 'created'].includes(shipment.status);
    const canGenerateCarrierDocs = isStaff && (!resolvedCarrierAwb || !resolvedCarrierInvoice);

    const statusEditOptions = getAllowedStatusOptions(user, shipment);

    const accountingSummary = accounting || {
        totalCharge: Number(shipment.price || 0),
        totalPaid: Number(shipment.totalPaid || 0),
        remainingBalance: Number(shipment.remainingBalance || (Number(shipment.price || 0) - Number(shipment.totalPaid || 0))),
        status: (Number(shipment.remainingBalance || 0) <= 0.001 && Number(shipment.price || 0) > 0) ? 'paid' : 'unpaid',
        allocations: []
    };

    return (
        <PageContainer>
            {/* Top Breadcrumb Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                        type="button"
                        onClick={() => navigate('/shipments')}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                            background: '#ffffff', border: `1px solid ${TK.border}`, borderRadius: TK.radiusMd,
                            fontSize: 12.5, fontWeight: 700, color: TK.text2, cursor: 'pointer'
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                        Shipments
                    </button>
                    <span style={{ color: TK.text3 }}>/</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: TK.text2 }}>Consignment Details</span>
                </div>

                <div style={{ fontSize: 12, color: TK.text3 }}>
                    Last Updated: {new Date(shipment.updatedAt || shipment.createdAt).toLocaleString()}
                </div>
            </div>

            {/* Kinetic Hero Card */}
            <KineticHeroCard>
                <TrackingHeaderRow>
                    <TrackingNumberDisplay>
                        <h1>{shipment.trackingNumber}</h1>
                        <StatusPill status={shipment.status} />
                        <CarrierBadge>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>local_shipping</span>
                            {carrierDisplayName}
                        </CarrierBadge>
                    </TrackingNumberDisplay>

                    <QuickActionBar>
                        <ActionButton
                            onClick={() => {
                                navigator.clipboard.writeText(publicTrackingUrl);
                                enqueueSnackbar('Tracking link copied to clipboard!', { variant: 'success' });
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span>
                            Copy Link
                        </ActionButton>

                        {/* Official Carrier AWB from Carrier */}
                        {resolvedCarrierAwb && (
                            <ActionButton primary onClick={() => handleOpenPdf(resolvedCarrierAwb)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                                Print Carrier AWB
                            </ActionButton>
                        )}

                        {/* Official Carrier Customs Invoice from Carrier */}
                        {resolvedCarrierInvoice && (
                            <ActionButton onClick={() => handleOpenPdf(resolvedCarrierInvoice)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                                Print Carrier Invoice
                            </ActionButton>
                        )}

                        {/* Generate Carrier AWB & Invoice Button (prominent when not yet generated) */}
                        {canGenerateCarrierDocs && (
                            <ActionButton
                                primary
                                disabled={isGeneratingCarrierDocs || isProcessing}
                                onClick={() => handleGenerateCarrierDocs('awb')}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                    {isGeneratingCarrierDocs ? 'hourglass_top' : 'bolt'}
                                </span>
                                {isGeneratingCarrierDocs
                                    ? 'Generating...'
                                    : (isInternalShipment ? 'Convert & Generate Carrier Docs' : 'Generate AWB & Invoice from Carrier')}
                            </ActionButton>
                        )}

                        {/* Target Hub Standard Document: Invoice/QR */}
                        <ActionButton onClick={handleGenerateInvoiceQR}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>qr_code_2</span>
                            Invoice/QR
                        </ActionButton>

                        {['out_for_delivery', 'in_transit'].includes(shipment.status) && (
                            <ActionButton primary onClick={() => setIsPodModalOpen(true)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>draw</span>
                                Capture POD
                            </ActionButton>
                        )}

                        {String(shipment.status || '').toLowerCase() === 'delivered' && (
                            <ActionButton onClick={() => window.open(`/returns/${shipment.trackingNumber}`, '_blank')}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>assignment_return</span>
                                Customer Return
                            </ActionButton>
                        )}

                        {canEdit && (
                            <ActionButton onClick={() => handleOpenEdit('sender')}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                                Edit Consignment
                            </ActionButton>
                        )}

                        {user?.role === 'admin' && (
                            <ActionButton
                                danger
                                disabled={!canDeleteShipmentStatus(shipment.status)}
                                onClick={handleDelete}
                                title={!canDeleteShipmentStatus(shipment.status) ? buildShipmentDeleteBlockedMessage(shipment.status).tooltip : ''}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                Delete
                            </ActionButton>
                        )}
                    </QuickActionBar>
                </TrackingHeaderRow>

                {/* Route Visual Connector */}
                <RouteStatusBar>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>Origin</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: TK.text1 }}>
                                {sender.city || 'Kuwait City'}, {sender.countryCode || 'KW'}
                            </div>
                        </div>

                        <div style={{ flex: 1, margin: '0 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: TK.primary }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>flight_takeoff</span>
                                <span>{getShipmentTypeLabel(shipment.shipmentType)}</span>
                            </div>
                            <div style={{ height: 4, width: '100%', background: TK.border, borderRadius: 2, position: 'relative' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${Math.min(100, Math.max(15, (getStepIndex(shipment.status) / (STATUS_ORDER.length - 1)) * 100))}%`,
                                    background: TK.primary,
                                    borderRadius: 2,
                                    transition: 'width 0.4s ease'
                                }} />
                            </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>Destination</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: TK.text1 }}>
                                {receiver.city || 'Destination'}, {receiver.countryCode || 'GCC'}
                            </div>
                        </div>
                    </div>
                </RouteStatusBar>
            </KineticHeroCard>

            {/* 2-Column Content Layout */}
            <ContentGrid>
                {/* Left Main Column */}
                <MainColumn>
                    {/* Origin & Destination Parties */}
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        {/* Shipper Party Card */}
                        <PartyCard>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: TK.primary, textTransform: 'uppercase' }}>
                                    Shipper (From)
                                </div>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => handleOpenEdit('sender')}
                                        style={{ border: 'none', background: 'transparent', color: TK.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>

                            <PartyName>{sender.company || sender.contactPerson || 'Shipper Contact'}</PartyName>
                            <PartyContact>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>call</span>
                                {sender.phone || 'No phone'}
                            </PartyContact>
                            {sender.email && (
                                <PartyContact>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>mail</span>
                                    {sender.email}
                                </PartyContact>
                            )}

                            <PartyAddress>
                                <div>{[sender.line1, sender.line2, sender.address].filter(Boolean).join(', ') || 'Address on file'}</div>
                                <div style={{ fontWeight: 600, marginTop: 4 }}>{sender.city}, {sender.countryCode || 'KW'}</div>
                            </PartyAddress>
                        </PartyCard>

                        {/* Consignee Party Card */}
                        <PartyCard>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: TK.info, textTransform: 'uppercase' }}>
                                    Consignee (To)
                                </div>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={() => handleOpenEdit('receiver')}
                                        style={{ border: 'none', background: 'transparent', color: TK.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>

                            <PartyName>{receiver.company || receiver.contactPerson || 'Consignee Contact'}</PartyName>
                            <PartyContact>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>call</span>
                                {receiver.phone || 'No phone'}
                            </PartyContact>
                            {receiver.email && (
                                <PartyContact>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>mail</span>
                                    {receiver.email}
                                </PartyContact>
                            )}

                            <PartyAddress>
                                <div>{[receiver.line1, receiver.line2, receiver.address].filter(Boolean).join(', ') || 'Address on file'}</div>
                                <div style={{ fontWeight: 600, marginTop: 4 }}>{receiver.city}, {receiver.countryCode || 'GCC'}</div>
                            </PartyAddress>
                        </PartyCard>
                    </div>

                    {/* Consignment Packages & Content Summary */}
                    <KineticCard>
                        <CardHeader>
                            <div className="title-group">
                                <span className="material-symbols-outlined">inventory_2</span>
                                Package & Consignment Structure
                            </div>
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenEdit('content')}
                                    style={{ border: 'none', background: 'transparent', color: TK.primary, cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
                                >
                                    Edit Parcels
                                </button>
                            )}
                        </CardHeader>

                        <SummaryMetricsGrid>
                            <MetricBox>
                                <label>Total Pieces</label>
                                <div>{totalPieces} Pcs</div>
                            </MetricBox>
                            <MetricBox>
                                <label>Actual Weight</label>
                                <div>{Number(totalWeight).toFixed(2)} KG</div>
                            </MetricBox>
                            <MetricBox>
                                <label>Packaging</label>
                                <div>{shipment.packagingType || 'Standard'}</div>
                            </MetricBox>
                            <MetricBox>
                                <label>Incoterm</label>
                                <div>{shipment.incoterm || 'DAP'}</div>
                            </MetricBox>
                        </SummaryMetricsGrid>

                        {/* Parcels Table */}
                        {parcels.length > 0 && (
                            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                                <DataTable>
                                    <thead>
                                        <tr>
                                            <th>Parcel #</th>
                                            <th>Description</th>
                                            <th>Weight</th>
                                            <th>Dimensions (L×W×H)</th>
                                            <th>Reference</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parcels.map((p, idx) => (
                                            <tr key={idx}>
                                                <td style={{ fontWeight: 700 }}>Package {idx + 1}</td>
                                                <td>{p.description || 'General Goods'}</td>
                                                <td>{Number(p.weight || 0).toFixed(2)} KG</td>
                                                <td>
                                                    {p.dimensions ? `${p.dimensions.length || p.length || 0}×${p.dimensions.width || p.width || 0}×${p.dimensions.height || p.height || 0} cm` : '—'}
                                                </td>
                                                <td style={{ color: TK.text3 }}>{p.trackingReference || shipment.reference || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </DataTable>
                            </div>
                        )}

                        {/* Items Table */}
                        {items.length > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: TK.text2, marginBottom: 8, textTransform: 'uppercase' }}>
                                    Declared Commercial Goods ({items.length})
                                </div>
                                <DataTable>
                                    <thead>
                                        <tr>
                                            <th>Item Description</th>
                                            <th>Qty</th>
                                            <th>Declared Value</th>
                                            <th>HS Code</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((it, idx) => (
                                            <tr key={idx}>
                                                <td style={{ fontWeight: 600 }}>{it.description}</td>
                                                <td>{it.quantity || 1}</td>
                                                <td>{it.declaredValue != null ? `${it.declaredValue} ${shipment.currency || 'KWD'}` : '—'}</td>
                                                <td style={{ color: TK.text3 }}>{it.hsCode || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </DataTable>
                            </div>
                        )}
                    </KineticCard>

                    {/* Official Carrier Paperwork & Customs Documents Card (Collapsed by default, positioned after Package structure) */}
                    <KineticCard>
                        <CardHeader style={{
                            marginBottom: isCarrierDocsCollapsed ? 0 : 18,
                            borderBottom: isCarrierDocsCollapsed ? 'none' : `1px solid ${TK.border}`,
                            paddingBottom: isCarrierDocsCollapsed ? 0 : 14
                        }}>
                            <div
                                className="title-group"
                                onClick={() => setIsCarrierDocsCollapsed(prev => !prev)}
                                style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
                            >
                                <span className="material-symbols-outlined">description</span>
                                <span>Official Carrier Paperwork & Customs Documents</span>
                                {resolvedCarrierAwb && resolvedCarrierInvoice ? (
                                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>
                                        2 DOCS READY
                                    </span>
                                ) : resolvedCarrierAwb ? (
                                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>
                                        AWB READY
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#b45309' }}>
                                        PENDING
                                    </span>
                                )}
                                <span className="material-symbols-outlined" style={{
                                    fontSize: 20,
                                    color: TK.text3,
                                    transition: 'transform 0.2s ease',
                                    transform: isCarrierDocsCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'
                                }}>
                                    expand_more
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {isStaff && (
                                    <ActionButton
                                        primary={!resolvedCarrierAwb || !resolvedCarrierInvoice}
                                        disabled={isGeneratingCarrierDocs || isProcessing}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleGenerateCarrierDocs('awb');
                                        }}
                                        style={{ fontSize: 12, padding: '4px 14px' }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                                            {isGeneratingCarrierDocs ? 'hourglass_top' : (!resolvedCarrierAwb || !resolvedCarrierInvoice ? 'bolt' : 'sync')}
                                        </span>
                                        {isGeneratingCarrierDocs
                                            ? 'Generating...'
                                            : (!resolvedCarrierAwb || !resolvedCarrierInvoice
                                                ? (isInternalShipment ? 'Convert & Generate Carrier Docs' : 'Generate AWB & Invoice from Carrier')
                                                : 'Re-generate Carrier Docs')}
                                    </ActionButton>
                                )}
                            </div>
                        </CardHeader>

                        {!isCarrierDocsCollapsed && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 14 }}>
                                {/* Carrier Official AWB */}
                                <DocumentTile>
                                    <div className="doc-icon-wrapper" style={{ background: '#eff6ff', color: '#2563eb' }}>
                                        <span className="material-symbols-outlined">local_shipping</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: 13, color: TK.text1 }}>
                                            Carrier Air Waybill (AWB)
                                        </div>
                                        <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 2 }}>
                                            Official {carrierDisplayName} Consignment Label & Barcode
                                        </div>
                                        <div style={{ marginTop: 6 }}>
                                            {resolvedCarrierAwb ? (
                                                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>
                                                    READY FOR PRINTING
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#b45309' }}>
                                                    NOT GENERATED YET
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {resolvedCarrierAwb ? (
                                        <ActionButton primary onClick={() => handleOpenPdf(resolvedCarrierAwb)} style={{ padding: '6px 14px', fontSize: 12 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>print</span>
                                            Print AWB
                                        </ActionButton>
                                    ) : isStaff ? (
                                        <ActionButton primary onClick={() => handleGenerateCarrierDocs('awb')} disabled={isGeneratingCarrierDocs || isProcessing} style={{ padding: '6px 14px', fontSize: 12 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                                            Generate AWB
                                        </ActionButton>
                                    ) : null}
                                </DocumentTile>

                                {/* Carrier Customs Commercial Invoice */}
                                <DocumentTile>
                                    <div className="doc-icon-wrapper" style={{ background: '#fef3c7', color: '#d97706' }}>
                                        <span className="material-symbols-outlined">receipt</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: 13, color: TK.text1 }}>
                                            Carrier Customs Invoice
                                        </div>
                                        <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 2 }}>
                                            Official {carrierDisplayName} Itemized Customs Declaration
                                        </div>
                                        <div style={{ marginTop: 6 }}>
                                            {resolvedCarrierInvoice ? (
                                                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>
                                                    READY FOR PRINTING
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#fef3c7', color: '#b45309' }}>
                                                    NOT GENERATED YET
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {resolvedCarrierInvoice ? (
                                        <ActionButton onClick={() => handleOpenPdf(resolvedCarrierInvoice)} style={{ padding: '6px 14px', fontSize: 12 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>print</span>
                                            Print Invoice
                                        </ActionButton>
                                    ) : isStaff ? (
                                        <ActionButton onClick={() => handleGenerateCarrierDocs('invoice')} disabled={isGeneratingCarrierDocs || isProcessing} style={{ padding: '6px 14px', fontSize: 12 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                                            Generate Invoice
                                        </ActionButton>
                                    ) : null}
                                </DocumentTile>

                                {/* Target Hub Standard Document: Invoice / QR */}
                                <DocumentTile>
                                    <div className="doc-icon-wrapper" style={{ background: '#f1f5f9', color: '#0f172a' }}>
                                        <span className="material-symbols-outlined">qr_code_2</span>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: 13, color: TK.text1 }}>
                                            Target Invoice / QR
                                        </div>
                                        <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 2 }}>
                                            Official Consignment Invoice & Hub Handover Document with QR Code
                                        </div>
                                        <div style={{ marginTop: 6 }}>
                                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                                                SYSTEM GENERATED
                                            </span>
                                        </div>
                                    </div>
                                    <ActionButton onClick={handleGenerateInvoiceQR} style={{ padding: '6px 14px', fontSize: 12 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>print</span>
                                        Print
                                    </ActionButton>
                                </DocumentTile>
                            </div>
                        )}
                    </KineticCard>

                    {/* Tracking History Timeline */}
                    <KineticCard>
                        <CardHeader>
                            <div className="title-group">
                                <span className="material-symbols-outlined">timeline</span>
                                Milestone History & Checkpoints
                            </div>
                            {canEdit && (
                                <ActionButton onClick={() => handleOpenEdit('status')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_task</span>
                                    Update Status
                                </ActionButton>
                            )}
                        </CardHeader>
                        <TrackingTimeline history={shipment.history || []} currentStatus={shipment.status} />
                    </KineticCard>
                </MainColumn>

                {/* Right Sidebar Column */}
                <SidebarColumn>
                    {/* Financial Summary Card */}
                    <KineticCard>
                        <CardHeader>
                            <div className="title-group">
                                <span className="material-symbols-outlined">account_balance_wallet</span>
                                Financial Summary
                            </div>
                        </CardHeader>

                        <DataTable>
                            <tbody>
                                <tr>
                                    <td>Total Charge</td>
                                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 15 }}>
                                        {Number(accountingSummary.totalCharge || 0).toFixed(3)} {shipment.currency || 'KWD'}
                                    </td>
                                </tr>
                                <tr>
                                    <td>Total Paid</td>
                                    <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 700 }}>
                                        {Number(accountingSummary.totalPaid || 0).toFixed(3)} {shipment.currency || 'KWD'}
                                    </td>
                                </tr>
                                <tr>
                                    <td>Remaining</td>
                                    <td style={{
                                        textAlign: 'right', fontWeight: 800,
                                        color: accountingSummary.remainingBalance > 0 ? '#dc2626' : '#15803d'
                                    }}>
                                        {Number(accountingSummary.remainingBalance || 0).toFixed(3)} {shipment.currency || 'KWD'}
                                    </td>
                                </tr>
                                <tr>
                                    <td>Payment Status</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <StatusPill status={accountingSummary.status || 'unpaid'} />
                                    </td>
                                </tr>
                            </tbody>
                        </DataTable>

                        {accountingSummary.remainingBalance > 0 && (
                            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <ActionButton
                                    primary
                                    onClick={() => handleSendPaymentLink('sender')}
                                    disabled={sendingPaymentLink}
                                    style={{ width: '100%', justifyContent: 'center' }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chat</span>
                                    {sendingPaymentLink ? 'Dispatching...' : 'Send WhatsApp Payment Link'}
                                </ActionButton>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <ActionButton onClick={handleCopyPaymentLink} style={{ flex: 1, justifyContent: 'center' }}>
                                        Copy Link
                                    </ActionButton>
                                    <ActionButton
                                        onClick={() => window.open(`/pay/${shipment.trackingNumber}`, '_blank')}
                                        style={{ flex: 1, justifyContent: 'center' }}
                                    >
                                        Pay Online ↗
                                    </ActionButton>
                                </div>
                            </div>
                        )}
                    </KineticCard>

                    {/* WhatsApp Notification Log Card */}
                    {isStaff && (
                        <WhatsAppLogCardComponent
                            logs={shipment.notificationLogs || []}
                            sendingRole={sendingWhatsAppRole}
                            onSendRole={handleSendWhatsAppRole}
                        />
                    )}
                </SidebarColumn>
            </ContentGrid>

            {/* Proof of Delivery Modal */}
            <ProofOfDeliveryModal
                isOpen={isPodModalOpen}
                shipment={shipment}
                onClose={() => setIsPodModalOpen(false)}
                onDelivered={async () => {
                    setIsPodModalOpen(false);
                    enqueueSnackbar('Proof of delivery captured successfully!', { variant: 'success' });
                    await getShipment(shipment.trackingNumber);
                }}
            />

            {/* Kinetic Redesigned Edit Consignment Drawer with 5 Top Tabs */}
            <Drawer
                anchor="right"
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 620 },
                        bgcolor: '#ffffff',
                        borderLeft: `1px solid ${TK.border}`,
                        boxShadow: TK.shadowModal
                    }
                }}
            >
                <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {/* Drawer Header */}
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6" fontWeight="800" color={TK.text1} sx={{ fontFamily: 'Outfit, Manrope, sans-serif' }}>
                            Edit Consignment
                        </Typography>
                        <MuiIconButton onClick={() => setEditDrawerOpen(false)} sx={{ color: TK.text3 }}>
                            <span className="material-symbols-outlined">close</span>
                        </MuiIconButton>
                    </Box>

                    {/* 5 Top Navigation Tabs */}
                    <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 2, mb: 3, borderBottom: `1px solid ${TK.border}` }}>
                        {EDIT_TABS.map(tab => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setEditSection(tab.key)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 14px',
                                    borderRadius: TK.radiusPill,
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    border: editSection === tab.key ? `1.5px solid ${TK.primary}` : `1px solid ${TK.border}`,
                                    background: editSection === tab.key ? TK.primaryBg : '#ffffff',
                                    color: editSection === tab.key ? TK.primary : TK.text2,
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </Box>

                    {/* Drawer Body Form */}
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', mb: 3, pr: 1 }}>
                        {editDraft && (
                            <>
                                {editSection === 'sender' && (
                                    <AddressPanel
                                        title="Shipper (Origin) Details"
                                        type="sender"
                                        value={editDraft.sender}
                                        onChange={(val) => setEditDraft({ ...editDraft, sender: val })}
                                        isStaff={isStaff}
                                        clients={clients}
                                        onClientSelect={(client) => setEditDraft({ ...editDraft, client: client._id, organization: client.organization?._id })}
                                    />
                                )}

                                {editSection === 'receiver' && (
                                    <AddressPanel
                                        title="Consignee (Destination) Details"
                                        type="receiver"
                                        value={editDraft.receiver}
                                        onChange={(val) => setEditDraft({ ...editDraft, receiver: val })}
                                    />
                                )}

                                {editSection === 'content' && (
                                    <ShipmentContent
                                        parcels={editDraft.parcels || []}
                                        setParcels={(val) => setEditDraft({ ...editDraft, parcels: val })}
                                        items={editDraft.items || []}
                                        setItems={(val) => setEditDraft({ ...editDraft, items: val })}
                                        dangerousGoods={editDraft.dangerousGoods}
                                        setDangerousGoods={(val) => setEditDraft({ ...editDraft, dangerousGoods: val })}
                                        packagingType={editDraft.packagingType}
                                        setPackagingType={(val) => setEditDraft({ ...editDraft, packagingType: val })}
                                        shipmentType={editDraft.shipmentType}
                                        currency={editDraft.currency}
                                        setCurrency={(val) => {
                                            setEditDraft(prev => ({
                                                ...prev,
                                                currency: val,
                                                items: (prev.items || []).map(item => ({ ...item, currency: val }))
                                            }));
                                        }}
                                        errors={editErrors}
                                        defaultOrigin={editDraft.sender?.countryCode || 'KW'}
                                    />
                                )}

                                {editSection === 'billing' && (
                                    <Stack spacing={3}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Incoterm</InputLabel>
                                            <Select
                                                label="Incoterm"
                                                value={editDraft.incoterm || 'DAP'}
                                                onChange={(e) => setEditDraft({ ...editDraft, incoterm: e.target.value })}
                                            >
                                                <MenuItem value="DAP">DAP (Delivered at Place)</MenuItem>
                                                <MenuItem value="DDP">DDP (Delivered Duty Paid)</MenuItem>
                                                <MenuItem value="FOB">FOB (Free on Board)</MenuItem>
                                                <MenuItem value="EXW">EXW (Ex Works)</MenuItem>
                                                <MenuItem value="CIF">CIF (Cost, Insurance & Freight)</MenuItem>
                                            </Select>
                                        </FormControl>

                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Export Reason"
                                            value={editDraft.exportReason || 'Commercial / Merchandise'}
                                            onChange={(e) => setEditDraft({ ...editDraft, exportReason: e.target.value })}
                                        />

                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Customer Reference / Notes"
                                            value={editDraft.reference || ''}
                                            onChange={(e) => setEditDraft({ ...editDraft, reference: e.target.value })}
                                        />

                                        {isInternalShipment && (
                                            <>
                                                <Divider />
                                                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                                                    Internal Pricing & Logistics
                                                </Typography>
                                                <Grid container spacing={2}>
                                                    <Grid item xs={12} sm={6}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="number"
                                                            label="Customer Price"
                                                            value={editDraft.price ?? ''}
                                                            onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={6}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="number"
                                                            label="Internal Cost"
                                                            value={editDraft.costPrice ?? ''}
                                                            onChange={(e) => setEditDraft({ ...editDraft, costPrice: e.target.value })}
                                                        />
                                                    </Grid>
                                                </Grid>
                                            </>
                                        )}
                                    </Stack>
                                )}

                                {editSection === 'status' && (
                                    <Stack spacing={3}>
                                        <Alert type="info">
                                            Status changes update milestone history and tracking timestamps.
                                        </Alert>

                                        <FormControl fullWidth size="small">
                                            <InputLabel>Status</InputLabel>
                                            <Select
                                                label="Status"
                                                value={editDraft.status || ''}
                                                onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value })}
                                            >
                                                {statusEditOptions.map((status) => (
                                                    <MenuItem key={status} value={status}>
                                                        {STATUS_LABELS[status] || status.replace(/_/g, ' ')}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>

                                        <TextField
                                            fullWidth
                                            multiline
                                            minRows={3}
                                            label="Status Checkpoint Note"
                                            placeholder="Add operational checkpoint note..."
                                            value={editDraft.statusDescription || ''}
                                            onChange={(event) => setEditDraft({ ...editDraft, statusDescription: event.target.value })}
                                        />
                                    </Stack>
                                )}
                            </>
                        )}
                    </Box>

                    {/* Drawer Footer Actions */}
                    <Box display="flex" gap={2} pt={2} sx={{ borderTop: `1px solid ${TK.border}` }}>
                        <ActionButton
                            type="button"
                            onClick={() => setEditDrawerOpen(false)}
                            style={{ flex: 1, justifyContent: 'center' }}
                        >
                            Cancel
                        </ActionButton>
                        <ActionButton
                            primary
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={isProcessing}
                            style={{ flex: 1, justifyContent: 'center' }}
                        >
                            {isProcessing ? 'Saving...' : 'Save Changes'}
                        </ActionButton>
                    </Box>
                </Box>
            </Drawer>

            {/* Carrier Conversion Drawer */}
            <Drawer
                anchor="right"
                open={conversionDrawerOpen}
                onClose={() => setConversionDrawerOpen(false)}
                PaperProps={{
                    sx: {
                        width: { xs: '100%', sm: 500 },
                        bgcolor: '#ffffff',
                        borderLeft: `1px solid ${TK.border}`,
                        boxShadow: TK.shadowModal
                    }
                }}
            >
                <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} pb={2} sx={{ borderBottom: `1px solid ${TK.border}` }}>
                        <Typography variant="h6" fontWeight="800" color={TK.text1} sx={{ fontFamily: 'Outfit, Manrope, sans-serif' }}>
                            Convert & Book Carrier
                        </Typography>
                        <MuiIconButton onClick={() => setConversionDrawerOpen(false)} sx={{ color: TK.text3 }}>
                            <span className="material-symbols-outlined">close</span>
                        </MuiIconButton>
                    </Box>

                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                        <Typography variant="body2" color="text.secondary" mb={3}>
                            Select a target carrier and service level to dispatch this consignment and generate carrier AWB immediately.
                        </Typography>

                        <Stack spacing={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Carrier</InputLabel>
                                <Select
                                    label="Carrier"
                                    value={conversionCarrierCode}
                                    onChange={(e) => {
                                        setConversionCarrierCode(e.target.value);
                                        const carrier = conversionTargetCarriers.find(c => c.code === e.target.value);
                                        if (carrier?.serviceOptions?.[0]) {
                                            setConversionServiceCode(carrier.serviceOptions[0].code);
                                        }
                                    }}
                                >
                                    <MenuItem value="DGR">Target International Air (DHL Express)</MenuItem>
                                    <MenuItem value="OTE">Target Regional Road (LogesTechs / OTE)</MenuItem>
                                </Select>
                            </FormControl>

                            <FormControl fullWidth size="small">
                                <InputLabel>Service Option</InputLabel>
                                <Select
                                    label="Service Option"
                                    value={conversionServiceCode}
                                    onChange={(e) => setConversionServiceCode(e.target.value)}
                                >
                                    <MenuItem value="P">Express Worldwide (P)</MenuItem>
                                    <MenuItem value="N">Domestic Express (N)</MenuItem>
                                    <MenuItem value="D">Economy Select (D)</MenuItem>
                                </Select>
                            </FormControl>
                        </Stack>
                    </Box>

                    <Box display="flex" gap={2} pt={2} sx={{ borderTop: `1px solid ${TK.border}` }}>
                        <ActionButton
                            type="button"
                            onClick={() => setConversionDrawerOpen(false)}
                            style={{ flex: 1, justifyContent: 'center' }}
                        >
                            Cancel
                        </ActionButton>
                        <ActionButton
                            primary
                            type="button"
                            onClick={handleConvertAndBook}
                            disabled={isProcessing}
                            style={{ flex: 1, justifyContent: 'center' }}
                        >
                            {isProcessing ? 'Booking...' : 'Convert & Book Carrier Now'}
                        </ActionButton>
                    </Box>
                </Box>
            </Drawer>
        </PageContainer>
    );
};

export default ShipmentDetailsPage;
