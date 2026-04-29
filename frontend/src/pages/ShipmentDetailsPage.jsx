import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { useShipment } from '../context/ShipmentContext';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from 'notistack';
import {
    PageHeader,
    Button,
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
import CloseIcon from '@mui/icons-material/Close';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import UpdateIcon from '@mui/icons-material/Update';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TrackingTimeline from '../components/TrackingTimeline';
import AddressPanel from '../components/AddressPanel';
import ShipmentContent from '../components/shipment/ShipmentContent';
import ShipmentBilling from '../components/shipment/ShipmentBilling';
import { financeService, shipmentService, userService } from '../services/api';
import api from '../services/api'; // Use the default api instance for generic get requests
import {
    STATUS_ORDER, STATUS_LABELS, MANUAL_SHIPMENT_STATUSES, getStepIndex
} from '../constants/statusConfig';

const getAllowedStatusOptions = (user, shipment) => {
    if (!user || !shipment) return [];

    const role = user.role;

    if (['admin', 'manager', 'accounting'].includes(role)) {
        return MANUAL_SHIPMENT_STATUSES;
    }

    return [];
};

const getShipmentTypeLabel = (shipmentType) => (
    shipmentType === 'documents' ? 'Document Express' : 'Standard Package'
);

// --- Styled Components ---

const HeroSection = styled.div`
    background: var(--surface-container-low, #ecf1f6);
    border-left: 6px solid var(--primary, #0050d4);
    border-radius: 20px;
    padding: 40px;
    margin-bottom: 32px;
    box-shadow: var(--shadow-ambient, 0 12px 32px -4px rgba(42, 47, 50, 0.06));
    position: relative;
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        top: 0; right: 0; bottom: 0; left: 0;
        background: radial-gradient(circle at top right, rgba(0, 80, 212, 0.05), transparent 70%);
        pointer-events: none;
    }
`;

const TrackingId = styled.div`
    font-family: 'Manrope', sans-serif;
    font-size: 36px;
    font-weight: 800;
    color: var(--on-surface, #2a2f32);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 16px;
    letter-spacing: -0.03em;
`;

const ShipmentMeta = styled.div`
    display: flex;
    gap: 32px;
    font-size: 14px;
    color: var(--on-surface-variant, #575c60);
    font-weight: 500;

    span {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    strong {
        color: var(--on-surface, #2a2f32);
        font-weight: 700;
    }
`;

const ContentGrid = styled.div`
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 32px;
    align-items: start;

    @media (max-width: 1200px) {
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

const InfoCard = styled.div`
    background: var(--surface-container-lowest, #ffffff);
    border: none;
    border-radius: 20px;
    padding: 32px;
    height: 100%;
    box-shadow: var(--shadow-ambient, 0 12px 32px -4px rgba(42, 47, 50, 0.06));
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 800;
    color: var(--primary, #0050d4);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 24px;
    border-bottom: 1px solid rgba(169, 174, 177, 0.1);
    padding-bottom: 16px;
    font-family: 'Manrope', sans-serif;

    .header-label {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    svg {
        width: 18px;
        height: 18px;
    }
`;

const PartyName = styled.div`
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
`;

const PartyType = styled.div`
    font-size: 13px;
    color: var(--on-surface-variant, #575c60);
    margin-bottom: 16px;
    font-weight: 500;
`;

const DetailRow = styled.div`
    margin-bottom: 16px;
    font-size: 14px;
    line-height: 1.5;
`;

const ContactInfo = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    font-size: 13px;

    svg {
        width: 14px;
        height: 14px;
        color: var(--accent-error);
    }
`;

const RouteProgressBar = ({ originCity, destCity, stepIndex }) => {
    const total = STATUS_ORDER.length - 1;
    const pct = Math.max(2, Math.min(98, (stepIndex / total) * 100));
    const DOTS = 7;
    return (
        <Box sx={{ mt: 4, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--on-surface)', minWidth: 80, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Manrope' }}>{originCity || 'Origin'}</Typography>
                <Box sx={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', mx: 3 }}>
                    <Box sx={{ height: 4, bgcolor: 'rgba(0,80,212,0.1)', width: '100%', position: 'absolute', borderRadius: 2 }} />
                    <Box sx={{ height: 4, bgcolor: 'var(--primary)', width: `${pct}%`, position: 'absolute', transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)', borderRadius: 2 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', position: 'relative', zIndex: 1 }}>
                        {[...Array(DOTS)].map((_, i) => {
                            const active = (i / (DOTS - 1)) * 100 <= pct;
                            return (
                                <Box
                                    key={i}
                                    sx={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        bgcolor: active ? 'var(--primary)' : 'var(--surface-container-high)',
                                        border: '3px solid #ffffff',
                                        boxShadow: active ? '0 0 10px rgba(0,80,212,0.3)' : 'none',
                                        transition: 'all 0.3s ease'
                                    }}
                                />
                            );
                        })}
                    </Box>
                    <Box sx={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', top: -28, fontSize: 20, zIndex: 2, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))' }}>✈️</Box>
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--on-surface)', minWidth: 80, textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'Manrope' }}>{destCity || 'Destination'}</Typography>
            </Box>
        </Box>
    );
};

const TrackingLink = styled.a`
    color: var(--accent-primary);
    font-weight: 600;
    text-decoration: none;

    &:hover {
        text-decoration: underline;
    }
`;

const DetailsCard = styled.div`
    grid-column: 1 / 3;
    background: var(--surface-container-lowest, #ffffff);
    border: none;
    border-radius: 20px;
    padding: 32px;
    box-shadow: var(--shadow-ambient, 0 12px 32px -4px rgba(42, 47, 50, 0.06));

    @media (max-width: 1200px) {
        grid-column: 1 / -1;
    }
`;

const DetailsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 24px;

    @media (max-width: 768px) {
        grid-template-columns: repeat(2, 1fr);
    }
`;

const DetailItem = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
`;

const DetailIcon = styled.div`
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(0, 80, 212, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary, #0050d4);
    flex-shrink: 0;

    svg {
        width: 22px;
        height: 22px;
    }
`;

const DetailContent = styled.div`
    flex: 1;
`;

const DetailContentLabel = styled.div`
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
`;

const DetailContentValue = styled.div`
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
`;

const SectionCard = styled.div`
    background: var(--surface-container-lowest, #ffffff);
    border: none;
    border-radius: 20px;
    padding: 32px;
    margin-bottom: 32px;
    box-shadow: var(--shadow-ambient, 0 12px 32px -4px rgba(42, 47, 50, 0.06));
`;

const SectionTitle = styled.h3`
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    font-family: 'Manrope', sans-serif;

    th, td {
        padding: 16px;
        text-align: left;
        border-bottom: 1px solid rgba(169, 174, 177, 0.1);
    }

    th {
        color: var(--on-surface-variant, #575c60);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 800;
        background: var(--surface-container-low, #ecf1f6);
    }

    td {
        color: var(--on-surface, #2a2f32);
        font-weight: 500;
    }
`;

const EmptyState = styled.div`
    padding: 24px;
    border: 1px dashed var(--border-color);
    border-radius: 10px;
    color: var(--text-secondary);
    text-align: center;
`;

const toDisplayText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
};

const normalizePartyAddress = (party = {}) => {
    const nestedAddress = party.address && typeof party.address === 'object' ? party.address : {};
    const streetLines = Array.isArray(party.streetLines)
        ? party.streetLines
        : Array.isArray(nestedAddress.streetLines)
            ? nestedAddress.streetLines
            : [];

    return {
        ...party,
        line1: toDisplayText(party.line1 || nestedAddress.line1 || nestedAddress.street || streetLines[0]),
        line2: toDisplayText(party.line2 || nestedAddress.line2 || streetLines[1]),
        line3: toDisplayText(party.line3 || nestedAddress.line3 || streetLines[2]),
        city: toDisplayText(party.city || nestedAddress.city),
        state: toDisplayText(party.state || nestedAddress.state),
        postalCode: toDisplayText(party.postalCode || nestedAddress.postalCode),
        countryCode: toDisplayText(party.countryCode || nestedAddress.countryCode),
        email: toDisplayText(party.email || nestedAddress.email),
        phone: toDisplayText(party.phone || nestedAddress.phone),
        company: toDisplayText(party.company || nestedAddress.company),
        contactPerson: toDisplayText(party.contactPerson || nestedAddress.contactPerson)
    };
};

// --- Main Component ---

const ShipmentDetailsPage = () => {
    const { trackingNumber } = useParams();
    const navigate = useNavigate();
    const fetchedRef = useRef(false);
    const [accounting, setAccounting] = useState(null);
    const [payments, setPayments] = useState([]);
    const [allocationForm, setAllocationForm] = useState({ paymentId: '', amount: '' });
    const [approvalDrawerOpen, setApprovalDrawerOpen] = useState(false);
    const [approvalComment, setApprovalComment] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [editDrawerOpen, setEditDrawerOpen] = useState(false);
    const [editSection, setEditSection] = useState(null); // 'sender', 'receiver', 'content', 'billing'
    const [editDraft, setEditDraft] = useState(null);
    const [editErrors, setEditErrors] = useState({});
    const [clients, setClients] = useState([]);
    const [availableCarriers, setAvailableCarriers] = useState([]);
    const [availableOptionalServices, setAvailableOptionalServices] = useState([]);
    const [selectedOptionalServiceCodes, setSelectedOptionalServiceCodes] = useState([]);
    const [editInsuredValue, setEditInsuredValue] = useState('');

    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const location = useLocation();

    const {
        shipment,
        loading,
        error,
        getShipment,
    } = useShipment();

    // Fetch shipment data on component mount
    useEffect(() => {
        if (!trackingNumber) return;
        fetchedRef.current = false;

        const fetchShipmentData = async () => {
            if (fetchedRef.current) return;
            fetchedRef.current = true;
            try {
                await getShipment(trackingNumber);
            } catch (error) {
                console.error('Error fetching shipment:', error);
            }
        };

        fetchShipmentData();
    }, [trackingNumber, getShipment]);


    // Capability and Status Checks
    const isStaff = ['admin', 'staff', 'manager', 'accounting'].includes(user?.role);
    const isClient = user?.role === 'client';
    const approvalStatuses = ['pending', 'draft', 'updated', 'ready_for_pickup', 'picked_up'];
    const clientEditableStatuses = ['draft', 'pending', 'updated'];
    const isManualShipment = shipment && (
        String(shipment.carrierCode || '').toUpperCase() === 'MANUAL'
        || shipment.manualShipment === true
    );
    const statusEditOptions = shipment ? getAllowedStatusOptions(user, shipment) : [];
    const canEditStatus = statusEditOptions.length > 0;
    const canManageApproval = canEditStatus && shipment && approvalStatuses.includes(shipment.status);
    const canApprove = canManageApproval && !isManualShipment;
    const canEdit = isClient && shipment && clientEditableStatuses.includes(shipment.status);

    const canEditSection = (section) => {
        if (!shipment) return false;
        if (section === 'status') return canEditStatus;
        if (isStaff) return true;
        return clientEditableStatuses.includes(shipment.status);
    };

    const shipmentId = shipment?.id || shipment?._id;
    const organizationId = shipment?.organizationId || shipment?.organization?.id || shipment?.organization?._id || shipment?.organization;

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('action') === 'approve' && canApprove) {
            setApprovalDrawerOpen(true);
        }
    }, [location.search, canApprove]);

    useEffect(() => {
        const loadAccounting = async () => {
            if (!shipmentId) return;
            try {
                const accountingResponse = await financeService.getShipmentAccounting(shipmentId);
                setAccounting(accountingResponse.data);
                // allocations are already filtered by shipmentId inside getShipmentAccounting
                setPayments(accountingResponse.data?.allocations || []);
            } catch (error) {
                console.error('Failed to load shipment accounting:', error);
            }
        };

        loadAccounting();
    }, [shipmentId, organizationId]);

    const refreshAccounting = async () => {
        if (!shipmentId) return;
        const accountingResponse = await financeService.getShipmentAccounting(shipmentId);
        setAccounting(accountingResponse.data);
        setPayments(accountingResponse.data?.allocations || []);
    };

    const handleAllocatePayment = async () => {
        if (!allocationForm.paymentId || !allocationForm.amount) return;
        try {
            await financeService.allocatePaymentManual(organizationId, {
                paymentId: allocationForm.paymentId,
                shipmentId,
                amount: parseFloat(allocationForm.amount)
            });
            setAllocationForm({ paymentId: '', amount: '' });
            await refreshAccounting();
        } catch (error) {
            console.error('Failed to allocate payment:', error);
        }
    };

    const handleReverseAllocation = async (allocationId) => {
        try {
            await financeService.reverseAllocation(allocationId, { reason: 'Manual reversal' });
            await refreshAccounting();
        } catch (error) {
            console.error('Failed to reverse allocation:', error);
        }
    };

    const handleOpenEdit = (section) => {
        if (!shipment) return;
        setEditSection(section);

        // Fix: Map origin to sender and destination to receiver for the edit form
        const draft = JSON.parse(JSON.stringify(shipment));
        if (!draft.sender && draft.origin) draft.sender = draft.origin;
        if (!draft.receiver && draft.destination) draft.receiver = draft.destination;
        const dangerousGoodsSource = draft.dangerousGoods || draft.origin?.dangerousGoods || {};
        draft.dangerousGoods = {
            contains: false,
            ...(dangerousGoodsSource || {})
        };

        setEditDraft(draft);
        setEditErrors({});
        setEditDrawerOpen(true);

        // Fetch auxiliary data if editing billing/setup
        if (section === 'billing' || section === 'sender') {
            if (isStaff && clients.length === 0) {
                userService.getClients().then(res => setClients(res.data || []));
            }
            if (availableCarriers.length === 0) {
                shipmentService.getAvailableCarriers().then(res => setAvailableCarriers(res.data || []));
            }
            
            // If editing billing, fetch quotes to get available optional services
            if (section === 'billing' && shipment) {
                const quotePayload = {
                    sender: shipment.origin,
                    receiver: shipment.destination,
                    parcels: shipment.parcels,
                    items: shipment.items,
                    carrierCode: shipment.carrierCode,
                    serviceCode: shipment.serviceCode,
                    shipmentType: shipment.shipmentType || 'package'
                };
                shipmentService.getQuotes(quotePayload).then(res => {
                    if (res.success && Array.isArray(res.data)) {
                        const active = res.data.find(q => q.serviceCode === shipment.serviceCode) || res.data[0];
                        if (active) {
                            setAvailableOptionalServices(active.optionalServices || []);
                        }
                    }
                }).catch(err => console.error('Failed to fetch optional services for edit:', err));
                
                // Initialize selected codes from shipment pricing snapshot or current state
                const selected = (shipment.pricingSnapshot?.optionalServices || []).map(s => s.serviceCode);
                const selectedFallback = Array.isArray(shipment.origin?.optionalServiceCodes)
                    ? shipment.origin.optionalServiceCodes
                    : [];
                const selectedCodes = selected.length > 0 ? selected : selectedFallback;
                setSelectedOptionalServiceCodes(selectedCodes);
                const declaredValue = (shipment.items || []).reduce((sum, item) => {
                    const itemValue = Number(item?.declaredValue || 0) * Number(item?.quantity || 1);
                    return sum + itemValue;
                }, 0);
                const savedInsuredValueRaw = shipment.insuredValue ?? shipment.origin?.insuredValue;
                const savedInsuredValue = savedInsuredValueRaw != null
                    ? Number(savedInsuredValueRaw)
                    : declaredValue;
                setEditInsuredValue(
                    selectedCodes.includes('II') && savedInsuredValue > 0
                        ? String(savedInsuredValue)
                        : ''
                );
            }
        }
    };

    const handleSaveEdit = async () => {
        if (!editDraft) return;
        setIsProcessing(true);
        try {
            let payload = {};
            if (editSection === 'sender') payload = { origin: editDraft.sender };
            else if (editSection === 'receiver') payload = { destination: editDraft.receiver };
            else if (editSection === 'content') {
                payload = {
                    parcels: editDraft.parcels,
                    items: editDraft.items,
                    dangerousGoods: editDraft.dangerousGoods,
                    packagingType: editDraft.packagingType,
                    currency: editDraft.currency
                };
            }
            else if (editSection === 'billing') {
                const effectiveInsuredValue = selectedOptionalServiceCodes.includes('II')
                    ? Number(editInsuredValue || 0)
                    : undefined;

                if (selectedOptionalServiceCodes.includes('II') && (!effectiveInsuredValue || effectiveInsuredValue <= 0)) {
                    enqueueSnackbar('Insurance value must be greater than 0 when insurance service (II) is selected.', { variant: 'warning' });
                    setIsProcessing(false);
                    return;
                }

                const quotePayload = {
                    sender: editDraft.sender || shipment.origin,
                    receiver: editDraft.receiver || shipment.destination,
                    parcels: editDraft.parcels || shipment.parcels,
                    items: editDraft.items || shipment.items,
                    carrierCode: shipment.carrierCode,
                    serviceCode: shipment.serviceCode,
                    shipmentType: editDraft.shipmentType || shipment.shipmentType || 'package',
                    optionalServiceCodes: selectedOptionalServiceCodes,
                    insuredValue: effectiveInsuredValue
                };

                const quoteResponse = await shipmentService.getQuotes(quotePayload);
                if (quoteResponse.success && Array.isArray(quoteResponse.data)) {
                    const activeQuote = quoteResponse.data.find(q => q.serviceCode === shipment.serviceCode) || quoteResponse.data[0];
                    if (activeQuote) {
                        setAvailableOptionalServices(activeQuote.optionalServices || []);
                    }
                }

                payload = {
                    exportReason: editDraft.exportReason,
                    incoterm: editDraft.incoterm,
                    invoiceRemarks: editDraft.invoiceRemarks,
                    signatureName: editDraft.signatureName,
                    signatureTitle: editDraft.signatureTitle,
                    payerOfVat: editDraft.payerOfVat,
                    gstPaid: editDraft.gstPaid,
                    shipperAccount: editDraft.shipperAccount,
                    labelFormat: editDraft.labelFormat,
                    palletCount: editDraft.palletCount,
                    packageMarks: editDraft.packageMarks,
                    allowPublicLocationUpdate: editDraft.allowPublicLocationUpdate,
                    allowPublicInfoUpdate: editDraft.allowPublicInfoUpdate,
                    reference: editDraft.reference,
                    optionalServiceCodes: selectedOptionalServiceCodes,
                    insuredValue: effectiveInsuredValue
                };
            }
            else if (editSection === 'status') {
                payload = {
                    status: editDraft.status,
                    description: editDraft.statusDescription || `Status changed to ${STATUS_LABELS[editDraft.status] || editDraft.status}`,
                    ...(isManualShipment ? {
                        price: editDraft.price,
                        costPrice: editDraft.costPrice,
                        currency: editDraft.currency,
                        estimatedDelivery: editDraft.estimatedDelivery
                    } : {})
                };
            }

            console.info('[ShipmentDetailsPage] Saving edit payload keys:', Object.keys(payload || {}));
            const response = await shipmentService.updateShipmentDetails(shipment.trackingNumber, payload);
            if (response.success) {
                enqueueSnackbar(`${editSection.charAt(0).toUpperCase() + editSection.slice(1)} updated successfully`, { variant: 'success' });
                setEditDrawerOpen(false);
                getShipment(shipment.trackingNumber);
            }
        } catch (error) {
            console.error(`Error saving ${editSection} edit: `, error);
            enqueueSnackbar(error.message || `Failed to update ${editSection} `, { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApprovalAction = async (action) => {
        setIsProcessing(true);
        try {
            if (action === 'approve') {
                const carrier = shipment.carrierCode || shipment.carrier;
                const serviceCode = shipment.serviceCode;
                const isManual = String(carrier || '').toUpperCase() === 'MANUAL'
                    || shipment.manualShipment === true;

                if (isManual) {
                    await shipmentService.updateStatus(shipment.trackingNumber, {
                        status: 'ready_for_pickup',
                        description: approvalComment || 'Manual Shipment approved for internal handling'
                    });

                    enqueueSnackbar('Manual Shipment approved', { variant: 'success' });
                    setApprovalDrawerOpen(false);
                    getShipment(shipment.trackingNumber);
                    return;
                }

                if (!carrier || !serviceCode) {
                    enqueueSnackbar('Missing carrier or service info. Redirecting to Edit to fix.', { variant: 'warning' });
                    navigate(`/shipment/${shipment.trackingNumber}/edit`);
                    return;
                }

                const existingOptionalCodes = (shipment.pricingSnapshot?.optionalServices || []).map(s => s.serviceCode);

                await shipmentService.bookShipment(shipment.trackingNumber, carrier, existingOptionalCodes);

                enqueueSnackbar('Shipment Approved & Booked Successfully', { variant: 'success' });
                setApprovalDrawerOpen(false);
                getShipment(shipment.trackingNumber);
            } else if (action === 'reject') {
                await shipmentService.updateStatus(shipment.trackingNumber, {
                    status: 'exception',
                    description: approvalComment || 'Shipment rejected during review'
                });
                enqueueSnackbar('Shipment marked as exception', { variant: 'info' });
                setApprovalDrawerOpen(false);
                getShipment(shipment.trackingNumber);
            } else if (action === 'update') {
                await shipmentService.updateStatus(shipment.trackingNumber, {
                    status: 'pending',
                    description: approvalComment || 'Shipment update requested from client'
                });
                enqueueSnackbar('Update requested from client', { variant: 'info' });
                setApprovalDrawerOpen(false);
                getShipment(shipment.trackingNumber);
            }
        } catch (error) {
            console.error(`Failed to ${action} shipment:`, error);
            enqueueSnackbar(error.message || `Failed to ${action} shipment`, { variant: 'error' });
        } finally {
            setIsProcessing(false);
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
                    <Button variant="primary" onClick={() => navigate('/shipments')}>
                        Back to Shipments
                    </Button>
                </div>
            </div>
        );
    }

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

            // Handle relative upload paths (Convert to secure backend API call)
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

            // Handle API endpoints (detect if they return HTML or PDF)
            if (typeof pdfData === 'string' && pdfData.startsWith('/api/')) {
                const response = await api.get(pdfData, { responseType: 'blob' });
                const blob = response.data;
                const contentType = response.headers['content-type'];

                if (contentType && contentType.includes('text/html')) {
                    // It's an HTML label, not a PDF
                    const reader = new FileReader();
                    reader.onload = () => {
                        const htmlContent = reader.result;
                        const newTab = window.open();
                        newTab.document.write(htmlContent);
                        newTab.document.close();
                    };
                    reader.readAsText(blob);
                } else {
                    // It's a PDF blob
                    const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                    window.open(blobUrl, '_blank');
                }
                return;
            }

            // Fallback for absolute URLs or other strings
            window.open(pdfData, '_blank');
        } catch (error) {
            console.error('Failed to open document:', error);
            enqueueSnackbar('Failed to load document', { variant: 'error' });
        }
    };

    const handleGenerateWaybill = async () => {
        const { generateWaybillPDF } = await import('../utils/pdfGenerator');
        await generateWaybillPDF(shipment);
    };

    const sender = normalizePartyAddress(shipment.origin || shipment.sender || {});
    const receiver = normalizePartyAddress(shipment.destination || shipment.receiver || {});
    const parcels = shipment.parcels || [];
    const items = shipment.items || [];
    const rawDocuments = Array.isArray(shipment.documents) ? shipment.documents : [];
    const extractDocumentUrl = (value) => {
        if (!value) return null;
        if (typeof value === 'string') return value;
        if (typeof value === 'object') {
            const candidate = value.url || value.href || value.path || value.link;
            return typeof candidate === 'string' ? candidate : null;
        }
        return null;
    };

    // Robust document resolving for Labels and Invoices, especially when standard backend URLs fall back to the generic documents array
    // Ignore blob URLs as they are temporary local drafts that expire on page refresh. 
    // Fall back to the internal backend generated label URL.
    const resolvedLabelUrl = shipment.labelUrl && !shipment.labelUrl.startsWith('blob:')
        ? shipment.labelUrl
        : `/api/shipments/${shipment.trackingNumber}/label`;

    const invoiceDocument = rawDocuments.find((d) => {
        const type = String(d?.type || '').toLowerCase();
        const url = String(extractDocumentUrl(d?.url) || extractDocumentUrl(d) || '').toLowerCase();
        return type === 'invoice' || url.includes('invoice');
    });
    const resolvedInvoiceUrl = shipment.invoiceUrl
        || extractDocumentUrl(invoiceDocument?.url)
        || extractDocumentUrl(invoiceDocument);

    // Filter out resolved documents from the general stack
    const documents = rawDocuments
        .map((doc) => ({ ...doc, resolvedUrl: extractDocumentUrl(doc?.url) || extractDocumentUrl(doc) }))
        .filter((doc) => doc.resolvedUrl && doc.resolvedUrl !== resolvedLabelUrl && doc.resolvedUrl !== resolvedInvoiceUrl);

    const totalWeight = parcels.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
    const totalPieces = parcels.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0);
    const totalVolumetric = parcels.reduce((sum, p) => {
        if (p.volumetricWeight) return sum + Number(p.volumetricWeight);
        if (p.dimensions?.length && p.dimensions?.width && p.dimensions?.height) {
            return sum + ((p.dimensions.length * p.dimensions.width * p.dimensions.height) / 5000) * (Number(p.quantity) || 1);
        }
        return sum;
    }, 0);
    const carrierTrackingNumber = shipment.carrierShipmentId || shipment.dhlTrackingNumber;
    const carrierCode = (shipment.carrier || shipment.carrierCode || 'DGR').toUpperCase();
    const carrierTrackingUrl = carrierTrackingNumber && (carrierCode === 'DGR' || carrierCode === 'DHL')
        ? `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${carrierTrackingNumber}`
        : null;
    const fallbackTotalCharge = Number(
        shipment.pricingSnapshot?.totalPrice
        ?? shipment.price
        ?? 0
    );
    const fallbackTotalPaid = Number(shipment.totalPaid ?? 0);
    const fallbackRemainingBalance = Number(
        shipment.remainingBalance
        ?? Math.max(fallbackTotalCharge - fallbackTotalPaid, 0)
    );
    const accountingSummary = accounting || {
        totalCharge: fallbackTotalCharge,
        totalPaid: fallbackTotalPaid,
        remainingBalance: fallbackRemainingBalance,
        status: fallbackRemainingBalance <= 0.001 && fallbackTotalCharge > 0 ? 'paid' : 'unpaid',
        allocations: []
    };
    // Billing currency rule: OTE/LOGESTECHS = AED, everything else = KWD.
    // Never derive from pricingSnapshot.currency or shipment.currency — those reflect declared value currency, not billing.
    const _carrierUpper = (shipment.carrierCode || '').toUpperCase();
    const billingCurrency = shipment.billingCurrency || (['OTE', 'LOGESTECHS'].includes(_carrierUpper) ? 'AED' : 'KWD');

    const publicTrackingUrl = `${window.location.origin}/track/${shipment.trackingNumber}`;

    const handleCopyTrackingLink = () => {
        navigator.clipboard.writeText(publicTrackingUrl);
        enqueueSnackbar('Tracking link copied to clipboard!', { variant: 'success' });
    };

    return (
        <div style={{ paddingBottom: '40px' }}>
            <PageHeader
                title="Shipment Details"
                description={`Tracking Number: ${shipment.trackingNumber}`}
                action={
                    <>
                        {canEdit && (
                            <Button variant="secondary" onClick={() => navigate(`/shipment/${shipment.trackingNumber}/edit`)}>
                                Edit Shipment
                            </Button>
                        )}
                        {canManageApproval && (
                            <Button
                                variant="primary"
                                onClick={() => !isManualShipment && setApprovalDrawerOpen(true)}
                                disabled={isManualShipment}
                            >
                                Manage Approval
                            </Button>
                        )}
                        <Button
                            variant="primary"
                            onClick={handleGenerateWaybill}
                        >
                            Print Label
                        </Button>
                        {user?.role === 'admin' && (
                            <Button
                                variant="secondary"
                                onClick={async () => {
                                    if (window.confirm('Are you sure you want to delete this shipment?')) {
                                        try {
                                            await shipmentService.deleteShipment(shipment.trackingNumber);
                                            enqueueSnackbar('Shipment deleted successfully', { variant: 'success' });
                                            navigate('/shipments');
                                        } catch (error) {
                                            enqueueSnackbar('Failed to delete shipment', { variant: 'error' });
                                        }
                                    }
                                }}
                                style={{ color: '#ff4d4d', borderColor: '#ff4d4d', marginLeft: '8px' }}
                            >
                                Delete
                            </Button>
                        )}
                    </>
                }
                secondaryAction={
                    <Button variant="secondary" onClick={() => navigate('/shipments')}>
                        Back to List
                    </Button>
                }
            />

            <HeroSection>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                    <div style={{ flex: 1 }}>
                        <TrackingId>
                            {shipment.trackingNumber}
                            <StatusPill status={shipment.status} />
                        </TrackingId>
                        <ShipmentMeta>
                            <span>Created: <strong>{new Date(shipment.createdAt).toLocaleDateString()}</strong></span>
                            <span>Type: <strong>{getShipmentTypeLabel(shipment.shipmentType)}</strong></span>
                            {isStaff && <span>Carrier: <strong>{carrierCode}</strong></span>}
                            <span>Total Weight: <strong>{totalWeight.toFixed(2)} KG</strong></span>
                        </ShipmentMeta>

                        <RouteProgressBar
                            originCity={sender.city}
                            destCity={receiver.city}
                            stepIndex={getStepIndex(shipment.status)}
                        />

                        {shipment.history && shipment.history.length > 0 && (
                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, color: 'var(--text-secondary)', fontSize: '13px' }}>
                                <AccessTimeIcon sx={{ fontSize: 16 }} />
                                Last Update: {new Date(shipment.history[shipment.history.length - 1].timestamp).toLocaleString()}
                            </Box>
                        )}
                    </div>

                    <Box sx={{
                        background: 'var(--surface-container-lowest, #ffffff)',
                        p: 3,
                        borderRadius: '16px',
                        border: 'none',
                        minWidth: { xs: '100%', sm: '320px' },
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
                        alignSelf: 'stretch',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    }}>
                        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                            <ShareIcon sx={{ fontSize: 18, color: 'var(--primary)' }} />
                            <Typography variant="caption" sx={{ color: 'var(--on-surface-variant)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Manrope' }}>
                                Shareable Tracking Link
                            </Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Box sx={{
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '13px',
                                color: 'var(--on-surface)',
                                background: 'var(--surface-container-low)',
                                p: '10px 16px',
                                borderRadius: '8px',
                                border: '1px solid rgba(169, 174, 177, 0.1)',
                                fontFamily: 'monospace',
                                fontWeight: 600
                            }}>
                                {publicTrackingUrl}
                            </Box>
                            <MuiIconButton
                                size="small"
                                onClick={handleCopyTrackingLink}
                                sx={{
                                    color: 'var(--primary)',
                                    bgcolor: 'rgba(0,80,212,0.06)',
                                    '&:hover': { bgcolor: 'rgba(0,80,212,0.12)' },
                                    borderRadius: '8px',
                                    p: 1.2
                                }}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </MuiIconButton>
                        </Stack>
                    </Box>
                </div>
            </HeroSection>

            <ContentGrid>
                <MainColumn>
                    {/* Origin & Destination Container */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                        {/* Origin Card */}
                        <InfoCard>
                            <CardHeader>
                                <div className="header-label">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                    Shipper (From)
                                </div>
                                {canEditSection('sender') && (
                                    <MuiIconButton size="small" onClick={() => handleOpenEdit('sender')} sx={{ color: 'var(--primary)', bgcolor: 'rgba(0,80,212,0.06)', borderRadius: '8px', p: 0.8 }}>
                                        <EditIcon fontSize="small" />
                                    </MuiIconButton>
                                )}
                            </CardHeader>
                            <PartyName>{sender.company || sender.contactPerson || 'N/A'}</PartyName>
                            {sender.company && <PartyType>c/o {sender.contactPerson || 'N/A'}</PartyType>}

                            <DetailRow>
                                {sender.line1 && <div>{sender.line1}</div>}
                                {sender.line2 && <div>{sender.line2}</div>}
                                {sender.line3 && <div>{sender.line3}</div>}
                                <div>
                                    {sender.city}{sender.state ? `, ${sender.state}` : ''} {sender.postalCode}
                                </div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                                    {sender.countryCode}
                                </div>
                            </DetailRow>

                            <DetailRow>
                                <ContactInfo>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                    {sender.phone || 'No phone'}
                                </ContactInfo>
                                <ContactInfo>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                        <polyline points="22,6 12,13 2,6"></polyline>
                                    </svg>
                                    {sender.email || 'No email'}
                                </ContactInfo>
                            </DetailRow>
                        </InfoCard>

                        {/* Destination Card */}
                        <InfoCard>
                            <CardHeader>
                                <div className="header-label">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                        <circle cx="12" cy="10" r="3"></circle>
                                    </svg>
                                    Consignee (To)
                                </div>
                                {canEditSection('receiver') && (
                                    <MuiIconButton size="small" onClick={() => handleOpenEdit('receiver')} sx={{ color: '#00d9b8', p: 0.5 }}>
                                        <EditIcon fontSize="small" />
                                    </MuiIconButton>
                                )}
                            </CardHeader>

                            <PartyName>{receiver.company || receiver.contactPerson || 'N/A'}</PartyName>
                            {receiver.company && <PartyType>c/o {receiver.contactPerson || 'N/A'}</PartyType>}

                            <DetailRow>
                                {receiver.line1 && <div>{receiver.line1}</div>}
                                {receiver.line2 && <div>{receiver.line2}</div>}
                                {receiver.line3 && <div>{receiver.line3}</div>}
                                <div>
                                    {receiver.city}{receiver.state ? `, ${receiver.state}` : ''} {receiver.postalCode}
                                </div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>
                                    {receiver.countryCode}
                                </div>
                            </DetailRow>

                            <DetailRow>
                                <ContactInfo>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                    {receiver.phone || 'No phone'}
                                </ContactInfo>
                                <ContactInfo>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                        <polyline points="22,6 12,13 2,6"></polyline>
                                    </svg>
                                    {receiver.email || 'No email'}
                                </ContactInfo>
                            </DetailRow>
                        </InfoCard>
                    </div>

                    {/* Shipment Details & Content Summary Card */}
                    <DetailsCard>
                        <CardHeader>
                            <div className="header-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                </svg>
                                Shipment & Content Summary
                            </div>
                            {canEditSection('content') && (
                                <MuiIconButton size="small" onClick={() => handleOpenEdit('content')} sx={{ color: '#00d9b8', p: 0.5 }}>
                                    <EditIcon fontSize="small" />
                                </MuiIconButton>
                            )}
                        </CardHeader>

                        <DetailsGrid>
                            {isStaff && (
                                <DetailItem>
                                    <DetailIcon>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                                        </svg>
                                    </DetailIcon>
                                    <Box flex={1}>
                                        <DetailContentLabel>Service Mode</DetailContentLabel>
                                        <DetailContentValue>{shipment.serviceCode || 'Standard'}</DetailContentValue>
                                    </Box>
                                </DetailItem>
                            )}

                            <DetailItem>
                                <DetailIcon>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                                    </svg>
                                </DetailIcon>
                                <DetailContent>
                                    <DetailContentLabel>Parcels & Weight</DetailContentLabel>
                                    <DetailContentValue>
                                        {totalPieces} Pcs ({Number(totalWeight).toFixed(2)} KG)
                                        {totalVolumetric ? ` / Vol: ${Number(totalVolumetric).toFixed(2)} KG` : ''}
                                    </DetailContentValue>
                                </DetailContent>
                            </DetailItem>

                            <DetailItem>
                                <DetailIcon>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                        <polyline points="16 17 21 12 16 7"></polyline>
                                        <line x1="21" y1="12" x2="9" y2="12"></line>
                                    </svg>
                                </DetailIcon>
                                <DetailContent>
                                    <DetailContentLabel>Content Items</DetailContentLabel>
                                    <DetailContentValue>
                                        {items.length} Declared Items
                                    </DetailContentValue>
                                </DetailContent>
                            </DetailItem>

                            {isStaff && (
                                <>
                                    <DetailItem>
                                        <DetailIcon>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                                <line x1="8" y1="21" x2="16" y2="21"></line>
                                                <line x1="12" y1="17" x2="12" y2="21"></line>
                                            </svg>
                                        </DetailIcon>
                                        <DetailContent>
                                            <DetailContentLabel>Carrier</DetailContentLabel>
                                            <DetailContentValue>{carrierCode || '-'}</DetailContentValue>
                                        </DetailContent>
                                    </DetailItem>
                                    <DetailItem>
                                        <DetailIcon>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"></circle>
                                                <path d="M12 16v-4"></path>
                                                <path d="M12 8h.01"></path>
                                            </svg>
                                        </DetailIcon>
                                        <DetailContent>
                                            <DetailContentLabel>Carrier Tracking Link</DetailContentLabel>
                                            <DetailContentValue>
                                                {carrierTrackingUrl ? (
                                                    <TrackingLink href={carrierTrackingUrl} target="_blank" rel="noreferrer">
                                                        Open Tracking
                                                    </TrackingLink>
                                                ) : (
                                                    'Not available'
                                                )}
                                            </DetailContentValue>
                                        </DetailContent>
                                    </DetailItem>
                                </>
                            )}
                        </DetailsGrid>

                        {/* Contents & Parcels List Summaries */}
                        {items.length > 0 && (
                            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Declared Items</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {items.map((item, index) => (
                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
                                            <div style={{ color: '#00d9b8' }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <path d="M12 8v4l3 3"></path>
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1, color: 'var(--text-primary)' }}>{item.description || 'Item'} (x{item.quantity || 1})</div>
                                            <div style={{ color: 'var(--text-secondary)' }}>{item.declaredValue != null ? `${item.declaredValue} ${shipment.currency || ''}` : ''}</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>HS: {item.hsCode || '—'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {parcels.length > 0 && (
                            <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Parcels Structure</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {parcels.map((parcel, index) => (
                                        <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
                                            <div style={{ color: '#3b82f6' }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                                                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1, color: 'var(--text-primary)' }}>{parcel.description || 'Parcel'}</div>
                                            <div style={{ color: 'var(--text-secondary)' }}>{Number(parcel.weight || 0).toFixed(2)} KG</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                {parcel.dimensions ? `${parcel.dimensions.length || 0}×${parcel.dimensions.width || 0}×${parcel.dimensions.height || 0} cm` : 'No Dims'}
                                            </div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                                                Ref: {parcel.trackingReference || shipment.reference || '—'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </DetailsCard>

                    {/* Generated Documents Section Card */}
                    {(documents.length > 0 || shipment.trackingNumber || resolvedInvoiceUrl || resolvedLabelUrl) && (
                        <SectionCard>
                            <SectionTitle>Generated Documents</SectionTitle>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', paddingTop: '12px' }}>
                                {/* System Label - Always Available, now restricted to Staff */}
                                {isStaff && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ color: '#00d9b8', background: 'rgba(0,217,184,0.1)', padding: '8px', borderRadius: '6px' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                                <rect x="6" y="14" width="12" height="8"></rect>
                                            </svg>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>AWB</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>System QR Code</div>
                                        </div>
                                        <Button variant="secondary" onClick={handleGenerateWaybill} style={{ padding: '6px 16px', fontSize: '13px', minHeight: 'auto' }}>
                                            View
                                        </Button>
                                    </div>
                                )}

                                {/* Carrier AWB */}
                                {(isStaff && resolvedLabelUrl && resolvedLabelUrl !== `/api/shipments/${shipment.trackingNumber}/label`) && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '8px', borderRadius: '6px' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                <polyline points="14 2 14 8 20 8"></polyline>
                                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                                <polyline points="10 9 9 9 8 9"></polyline>
                                            </svg>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Carrier AWB</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Official Waybill</div>
                                        </div>
                                        <Button variant="secondary" onClick={() => handleOpenPdf(resolvedLabelUrl)} style={{ padding: '6px 16px', fontSize: '13px', minHeight: 'auto' }}>
                                            View
                                        </Button>
                                    </div>
                                )}

                                {/* Commercial Invoice */}
                                {(isStaff && resolvedInvoiceUrl) && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '8px', borderRadius: '6px' }}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                <polyline points="14 2 14 8 20 8"></polyline>
                                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                                <polyline points="10 9 9 9 8 9"></polyline>
                                            </svg>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Invoice</div>
                                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Customs Declaration</div>
                                        </div>
                                        <Button variant="secondary" onClick={() => handleOpenPdf(resolvedInvoiceUrl)} style={{ padding: '6px 16px', fontSize: '13px', minHeight: 'auto' }}>
                                            View
                                        </Button>
                                    </div>
                                )}

                                {/* Other Documents */}
                                {documents.map((doc, index) => (
                                    doc.resolvedUrl && (
                                        <div key={`doc-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '8px', borderRadius: '6px' }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                    <polyline points="14 2 14 8 20 8"></polyline>
                                                    <line x1="16" y1="13" x2="8" y2="13"></line>
                                                    <line x1="16" y1="17" x2="8" y2="17"></line>
                                                    <polyline points="10 9 9 9 8 9"></polyline>
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>{doc.type}</div>
                                                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', textTransform: 'uppercase' }}>{doc.format || 'doc'}</div>
                                            </div>
                                            <Button variant="secondary" onClick={() => handleOpenPdf(doc.resolvedUrl)} style={{ padding: '6px 16px', fontSize: '13px', minHeight: 'auto' }}>
                                                View
                                            </Button>
                                        </div>
                                    )
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    {/* Track History Section */}
                    <SectionCard>
                        <SectionTitle>Track History</SectionTitle>
                        <div style={{ padding: '12px 0' }}>
                            <TrackingTimeline history={shipment.history || []} currentStatus={shipment.status} />
                        </div>
                    </SectionCard>

                    {/* Operational Status Section */}
                    <SectionCard>
                        <CardHeader>
                            <div className="header-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                                Operational Status
                            </div>
                            {canEditSection('status') && (
                                <MuiIconButton size="small" onClick={() => handleOpenEdit('status')} sx={{ color: 'var(--primary)', bgcolor: 'rgba(0,80,212,0.06)', borderRadius: '8px', p: 0.8 }}>
                                    <EditIcon fontSize="small" />
                                </MuiIconButton>
                            )}
                        </CardHeader>
                        <Table>
                            <tbody>
                                <tr>
                                    <td>Current Status</td>
                                    <td><StatusPill status={shipment.status} /></td>
                                </tr>
                                <tr>
                                    <td>Status Source</td>
                                    <td>{String(carrierCode).toUpperCase() === 'MANUAL' ? 'Manual Shipment' : 'Platform / Carrier'}</td>
                                </tr>
                                <tr>
                                    <td>Status Editing</td>
                                    <td>{canEditStatus ? 'Allowed for your role' : 'Restricted'}</td>
                                </tr>
                            </tbody>
                        </Table>
                    </SectionCard>


                    {/* Shipment Settings Section */}
                    <SectionCard style={{ margin: 0 }}>
                        <CardHeader>
                            <div className="header-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                                Shipment Settings
                            </div>
                            {canEditSection('billing') && (
                                <MuiIconButton size="small" onClick={() => handleOpenEdit('billing')} sx={{ color: '#00d9b8', p: 0.5 }}>
                                    <EditIcon fontSize="small" />
                                </MuiIconButton>
                            )}
                        </CardHeader>
                        <Table>
                            <tbody>
                                <tr>
                                    <td>Public Loc Updates</td>
                                    <td>{shipment.allowPublicLocationUpdate ? 'Enabled' : 'Disabled'}</td>
                                </tr>
                                <tr>
                                    <td>Public Info Updates</td>
                                    <td>{shipment.allowPublicInfoUpdate ? 'Enabled' : 'Disabled'}</td>
                                </tr>
                                <tr>
                                    <td>Incoterm</td>
                                    <td>{shipment.incoterm || '—'}</td>
                                </tr>
                                <tr>
                                    <td>Export Reason</td>
                                    <td>{shipment.exportReason || '—'}</td>
                                </tr>
                                <tr>
                                    <td>Reference</td>
                                    <td>{shipment.reference || '—'}</td>
                                </tr>
                            </tbody>
                        </Table>
                    </SectionCard>
                </MainColumn>

                <SidebarColumn>
                    {/* Accounting Summary Card */}
                    <SectionCard style={{ margin: 0 }}>
                        <CardHeader>
                            <div className="header-label">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                FINANCIAL SUMMARY
                            </div>
                        </CardHeader>
                        <Table style={{ marginTop: '16px' }}>
                            <tbody>
                                <tr>
                                    <td>Total Charge</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{Number(accountingSummary.totalCharge || 0).toFixed(3)} {billingCurrency}</td>
                                </tr>
                                <tr>
                                    <td>Total Paid</td>
                                    <td style={{ textAlign: 'right', color: 'var(--primary)', fontWeight: '800' }}>{Number(accountingSummary.totalPaid || 0).toFixed(3)} {billingCurrency}</td>
                                </tr>
                                <tr>
                                    <td>Remaining</td>
                                    <td style={{ textAlign: 'right', color: accountingSummary.remainingBalance > 0 ? '#b31b25' : 'var(--primary)', fontWeight: '800' }}>
                                        {Number(accountingSummary.remainingBalance || 0).toFixed(3)} {billingCurrency}
                                    </td>
                                </tr>
                                <tr>
                                    <td>Status</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <StatusPill status={accountingSummary.status || 'unpaid'} />
                                    </td>
                                </tr>
                            </tbody>
                        </Table>
                    </SectionCard>
                    {/* Accounting Management Section (Staff Only) */}
                    {isStaff && (
                        <>
                            <SectionCard style={{ margin: 0 }}>
                                <CardHeader>
                                    <div className="header-label">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                                            <line x1="1" y1="10" x2="23" y2="10"></line>
                                        </svg>
                                        Allocate Payment
                                    </div>
                                </CardHeader>
                                <Box sx={{ p: 0 }}>
                                    <TextField
                                        label="Payment Reference ID"
                                        value={allocationForm.paymentId}
                                        onChange={(e) => setAllocationForm({ ...allocationForm, paymentId: e.target.value })}
                                        fullWidth
                                        margin="normal"
                                        size="small"
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'var(--surface-container-low)' } }}
                                    />
                                    <TextField
                                        label={`Amount (${billingCurrency})`}
                                        type="number"
                                        value={allocationForm.amount}
                                        onChange={(e) => setAllocationForm({ ...allocationForm, amount: e.target.value })}
                                        fullWidth
                                        margin="normal"
                                        size="small"
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'var(--surface-container-low)' } }}
                                    />
                                    <Button
                                        variant="primary"
                                        onClick={handleAllocatePayment}
                                        disabled={!allocationForm.paymentId || !allocationForm.amount || isProcessing}
                                        style={{ marginTop: '16px', width: '100%' }}
                                    >
                                        {isProcessing ? 'Processing...' : 'Allocate Payment'}
                                    </Button>
                                </Box>
                            </SectionCard>

                            <SectionCard style={{ margin: 0 }}>
                                <CardHeader>
                                    <div className="header-label">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <polyline points="12 6 12 12 16 14"></polyline>
                                        </svg>
                                        Payment History
                                    </div>
                                </CardHeader>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 12px', lineHeight: 1.5 }}>
                                    Payments manually allocated to this shipment by staff. Each entry reduces the outstanding balance.
                                </p>
                                {payments.length > 0 ? (
                                    <Table>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Amount ({billingCurrency})</th>
                                                <th>Status</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {payments.map(allocation => (
                                                <tr key={allocation.id}>
                                                    <td>{new Date(allocation.createdAt).toLocaleDateString()}</td>
                                                    <td>{Number(allocation.amount || 0).toFixed(3)}</td>
                                                    <td>
                                                        <StatusPill status={allocation.status} />
                                                    </td>
                                                    <td>
                                                        {allocation.status === 'ACTIVE' ? (
                                                            <Button variant="secondary" onClick={() => handleReverseAllocation(allocation._id)} style={{ padding: '4px 8px', fontSize: '11px' }}>
                                                                Reverse
                                                            </Button>
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                ) : (
                                    <EmptyState style={{ padding: '16px', fontSize: '13px' }}>No payment allocations yet.</EmptyState>
                                )}
                            </SectionCard>
                        </>
                    )}


                </SidebarColumn>
            </ContentGrid>

            <Drawer
                anchor="right"
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                PaperProps={{
                    sx: { width: { xs: '100%', sm: 600 }, bgcolor: '#ffffff', borderLeft: 'none', boxShadow: '-12px 0 32px rgba(0,0,0,0.05)' }
                }}
            >
                <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
                        <Typography variant="h5" fontWeight="800" color="var(--primary)" sx={{ fontFamily: 'Manrope', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Edit {editSection}
                        </Typography>
                        <MuiIconButton onClick={() => setEditDrawerOpen(false)} sx={{ color: 'text.secondary' }}>
                            <CloseIcon />
                        </MuiIconButton>
                    </Box>

                    <Box sx={{ flexGrow: 1, overflowY: 'auto', mb: 3, px: 1 }}>
                        {editDraft && (
                            <>
                                {editSection === 'sender' && (
                                    <AddressPanel
                                        title="Shipper Details"
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
                                        title="Consignee Details"
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
                                    <ShipmentBilling
                                        exportReason={editDraft.exportReason}
                                        setExportReason={(val) => setEditDraft({ ...editDraft, exportReason: val })}
                                        incoterm={editDraft.incoterm}
                                        setIncoterm={(val) => setEditDraft({ ...editDraft, incoterm: val })}
                                        invoiceRemarks={editDraft.invoiceRemarks}
                                        setInvoiceRemarks={(val) => setEditDraft({ ...editDraft, invoiceRemarks: val })}
                                        signatureName={editDraft.signatureName}
                                        setSignatureName={(val) => setEditDraft({ ...editDraft, signatureName: val })}
                                        signatureTitle={editDraft.signatureTitle}
                                        setSignatureTitle={(val) => setEditDraft({ ...editDraft, signatureTitle: val })}
                                        payerOfVat={editDraft.payerOfVat}
                                        setPayerOfVat={(val) => setEditDraft({ ...editDraft, payerOfVat: val })}
                                        gstPaid={editDraft.gstPaid}
                                        setGstPaid={(val) => setEditDraft({ ...editDraft, gstPaid: val })}
                                        shipperAccount={editDraft.shipperAccount}
                                        setShipperAccount={(val) => setEditDraft({ ...editDraft, shipperAccount: val })}
                                        labelFormat={editDraft.labelFormat}
                                        setLabelFormat={(val) => setEditDraft({ ...editDraft, labelFormat: val })}
                                        palletCount={editDraft.palletCount}
                                        setPalletCount={(val) => setEditDraft({ ...editDraft, palletCount: val })}
                                        packageMarks={editDraft.packageMarks}
                                        setPackageMarks={(val) => setEditDraft({ ...editDraft, packageMarks: val })}
                                        allowPublicLocationUpdate={editDraft.allowPublicLocationUpdate}
                                        setAllowPublicLocationUpdate={(val) => setEditDraft({ ...editDraft, allowPublicLocationUpdate: val })}
                                        allowPublicInfoUpdate={editDraft.allowPublicInfoUpdate}
                                        setAllowPublicInfoUpdate={(val) => setEditDraft({ ...editDraft, allowPublicInfoUpdate: val })}
                                        reference={editDraft.reference}
                                        setReference={(val) => setEditDraft({ ...editDraft, reference: val })}
                                        availableOptionalServices={availableOptionalServices}
                                        selectedOptionalServiceCodes={selectedOptionalServiceCodes}
                                        onToggleOptionalService={(code) => {
                                            setSelectedOptionalServiceCodes(prev => 
                                                prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
                                            );
                                        }}
                                        insuredValue={editInsuredValue}
                                        setInsuredValue={setEditInsuredValue}
                                        currency={editDraft.currency}
                                        showMarkupDetails={isStaff}
                                    />
                                )}

                                {editSection === 'status' && (
                                    <Stack spacing={3}>
                                        <Alert type="info">
                                            Status changes are written to shipment history and are limited by role.
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
                                            label="Status note"
                                            placeholder="Add context for the tracking history..."
                                            value={editDraft.statusDescription || ''}
                                            onChange={(event) => setEditDraft({ ...editDraft, statusDescription: event.target.value })}
                                        />

                                        {isManualShipment && (
                                            <>
                                                <Divider />
                                                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
                                                    Manual Shipment Details
                                                </Typography>
                                                <Grid container spacing={2}>
                                                    <Grid item xs={12} sm={6}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="number"
                                                            label="Customer price"
                                                            value={editDraft.price ?? ''}
                                                            onChange={(event) => setEditDraft({ ...editDraft, price: event.target.value })}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={6}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="number"
                                                            label="Internal cost"
                                                            value={editDraft.costPrice ?? ''}
                                                            onChange={(event) => setEditDraft({ ...editDraft, costPrice: event.target.value })}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={6}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Currency"
                                                            value={editDraft.currency || 'KWD'}
                                                            onChange={(event) => setEditDraft({ ...editDraft, currency: event.target.value.toUpperCase() })}
                                                            inputProps={{ maxLength: 3 }}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={6}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            type="date"
                                                            label="Estimated delivery"
                                                            InputLabelProps={{ shrink: true }}
                                                            value={editDraft.estimatedDelivery ? new Date(editDraft.estimatedDelivery).toISOString().slice(0, 10) : ''}
                                                            onChange={(event) => setEditDraft({ ...editDraft, estimatedDelivery: event.target.value })}
                                                        />
                                                    </Grid>
                                                </Grid>
                                            </>
                                        )}
                                    </Stack>
                                )}
                            </>
                        )}
                    </Box>

                    <Divider sx={{ mb: 3, opacity: 0.1 }} />

                    <Box display="flex" gap={2}>
                        <Button
                            variant="secondary"
                            onClick={() => setEditDrawerOpen(false)}
                            fullWidth
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveEdit}
                            disabled={isProcessing}
                            fullWidth
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            {isProcessing ? <Loader size={20} /> : <SaveIcon />}
                            {isProcessing ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </Box>
                </Box>
            </Drawer>

            <Drawer
                anchor="right"
                open={approvalDrawerOpen}
                onClose={() => setApprovalDrawerOpen(false)}
                PaperProps={{
                    sx: { width: { xs: '100%', sm: 450 }, bgcolor: '#ffffff', borderLeft: 'none', boxShadow: '-12px 0 32px rgba(0,0,0,0.05)' }
                }}
            >
                <Box sx={{ p: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                        <Typography variant="h5" fontWeight="800" color="var(--primary)" sx={{ fontFamily: 'Manrope', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Decision Center
                        </Typography>
                        <MuiIconButton onClick={() => setApprovalDrawerOpen(false)} sx={{ color: 'text.secondary' }}>
                            <CloseIcon />
                        </MuiIconButton>
                    </Box>

                    <Alert type="info" sx={{ mb: 3 }}>
                        Please review the shipment details carefully before taking action.
                        Approving will move the shipment to the next stage of booking.
                    </Alert>

                    <Stack spacing={3} sx={{ flexGrow: 1 }}>
                        <Box>
                            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Shipment Summary</Typography>
                            <Box sx={{ bgcolor: 'var(--surface-container-low)', p: 3, borderRadius: '16px' }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 700, mb: 0.5 }}>TRACKING ID</Typography>
                                        <Typography variant="body2" fontWeight="800" sx={{ fontFamily: 'Manrope' }}>{shipment.trackingNumber}</Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 700, mb: 0.5 }}>CURRENT STATUS</Typography>
                                        <Chip label={shipment.status.toUpperCase()} size="small" sx={{ height: 20, bgcolor: 'rgba(0,80,212,0.1)', color: 'var(--primary)', fontWeight: '800', fontSize: '10px', fontFamily: 'Manrope' }} />
                                    </Grid>

                                    <Grid item xs={6}>
                                        <Typography variant="caption" display="block" color="text.secondary">Sender</Typography>
                                        <Typography variant="body2" fontWeight="500">{sender.company || sender.contactPerson || 'N/A'}</Typography>
                                        <Typography variant="caption" color="text.secondary">{sender.city}, {sender.countryCode}</Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" display="block" color="text.secondary">Receiver</Typography>
                                        <Typography variant="body2" fontWeight="500">{receiver.company || receiver.contactPerson || 'N/A'}</Typography>
                                        <Typography variant="caption" color="text.secondary">{receiver.city}, {receiver.countryCode}</Typography>
                                    </Grid>

                                    <Grid item xs={6}>
                                        <Typography variant="caption" display="block" color="text.secondary">Content Summary</Typography>
                                        <Typography variant="body2">{totalPieces} Pcs | {Number(totalWeight).toFixed(2)} KG</Typography>
                                        <Typography variant="caption" color="text.secondary">{shipment.serviceCode || 'Standard'}</Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" display="block" color="text.secondary" sx={{ fontWeight: 700, mb: 0.5 }}>REVENUE EST.</Typography>
                                        <Typography variant="body2" color="var(--primary)" fontWeight="800" sx={{ fontFamily: 'Manrope' }}>{Number(accountingSummary.totalCharge).toFixed(3)} {billingCurrency}</Typography>
                                        <Typography variant="caption" color="text.secondary">{carrierCode}</Typography>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Box>

                        <Box>
                            <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 800 }}>Internal Notes / Feedback</Typography>
                            <TextField
                                fullWidth
                                multiline
                                rows={4}
                                placeholder="Add comments for the client or internal logs..."
                                value={approvalComment}
                                onChange={(e) => setApprovalComment(e.target.value)}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        bgcolor: 'var(--surface-container-low)',
                                        color: 'var(--on-surface)'
                                    }
                                }}
                            />
                        </Box>

                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.1)' }} />

                        <Stack spacing={2}>
                            <Button
                                variant="primary"
                                fullWidth
                                onClick={() => handleApprovalAction('approve')}
                                disabled={isProcessing}
                                icon={<CheckCircleOutlineIcon />}
                            >
                                {isProcessing ? 'Processing...' : 'Approve & Book'}
                            </Button>

                            <Box display="flex" gap={2}>
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => handleApprovalAction('update')}
                                    disabled={isProcessing}
                                    icon={<UpdateIcon />}
                                >
                                    Request Update
                                </Button>
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => handleApprovalAction('reject')}
                                    disabled={isProcessing}
                                    icon={<CancelOutlinedIcon />}
                                    style={{ color: '#ff4d4d', borderColor: 'rgba(255, 77, 77, 0.4)' }}
                                >
                                    Reject
                                </Button>
                            </Box>

                            <Button
                                variant="secondary"
                                fullWidth
                                onClick={() => {
                                    setApprovalDrawerOpen(false);
                                    navigate(`/shipment/${shipment.trackingNumber}/edit`);
                                }}
                                disabled={isProcessing}
                                icon={<RequestQuoteIcon />}
                            >
                                Edit Full Shipment
                            </Button>
                        </Stack>
                    </Stack>

                    <Box mt={4} textAlign="center">
                        <Typography variant="caption" color="text.secondary">
                            Decision actions are logged for audit purposes.
                        </Typography>
                    </Box>
                </Box>
            </Drawer>
        </div >
    );
};

export default ShipmentDetailsPage;
