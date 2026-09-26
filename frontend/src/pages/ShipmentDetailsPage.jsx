import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useShipment } from '../context/ShipmentContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSnackbar } from 'notistack';
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
import { getCarrierDisplayName, getEventDisplayMessage } from '../utils/shipmentDisplay';
import { generateWaybillPDF } from '../utils/pdfGenerator';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';
import StatusBadge from '../components/common/StatusBadge';
import TradeRouteDisplay from '../components/common/TradeRouteDisplay';
import ProofOfDeliveryModal from '../components/ProofOfDeliveryModal';

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

// Edit Consignment 5 Tabs
const EDIT_TABS = [
    { key: 'sender', label: 'Shipper', labelAr: 'الراسل', icon: 'flight_takeoff' },
    { key: 'receiver', label: 'Consignee', labelAr: 'المستلم', icon: 'flight_land' },
    { key: 'content', label: 'Parcels & Goods', labelAr: 'الطرود والمحتويات', icon: 'inventory_2' },
    { key: 'billing', label: 'Billing & Terms', labelAr: 'الفواتير والرسوم', icon: 'receipt_long' },
    { key: 'status', label: 'Status & Checkpoints', labelAr: 'الحالة والملاحظات', icon: 'history' }
];

const formatTimestampKuwait = (timestamp) => {
    if (!timestamp) return { date: '—', time: '—' };
    try {
        const d = new Date(timestamp);
        return {
            date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' }),
            time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuwait' }) + ' AST'
        };
    } catch {
        return { date: String(timestamp), time: '' };
    }
};

/**
 * Target Logistics Global — Shipment Details & Tracking Dossier
 * Fully revamped with DaisyUI v4 + Tailwind CSS.
 * 100% Design Continuity with DashboardPage and ShipmentsPage.
 */
const ShipmentDetailsPage = () => {
    const { trackingNumber } = useParams();
    const navigate = useNavigate();
    const { t, lang } = useLanguage();
    const isRTL = lang === 'ar';
    const fetchedRef = useRef(false);

    const { user, can } = useAuth();
    const { enqueueSnackbar } = useSnackbar();

    const {
        shipment,
        loading,
        error,
        getShipment,
    } = useShipment();

    // Local Component State
    const [accounting, setAccounting] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isGeneratingCarrierDocs, setIsGeneratingCarrierDocs] = useState(false);
    const [copiedTracking, setCopiedTracking] = useState(false);
    const [isCarrierDocsCollapsed, setIsCarrierDocsCollapsed] = useState(false);
    const [isPodModalOpen, setIsPodModalOpen] = useState(false);

    // Drawers State
    const [editDrawerOpen, setEditDrawerOpen] = useState(false);
    const [editSection, setEditSection] = useState('sender');
    const [editDraft, setEditDraft] = useState(null);
    const [clients, setClients] = useState([]);

    const [conversionDrawerOpen, setConversionDrawerOpen] = useState(false);
    const [conversionCarrierCode, setConversionCarrierCode] = useState('DGR');
    const [conversionServiceCode, setConversionServiceCode] = useState('P');
    const [conversionTargetCarriers, setConversionTargetCarriers] = useState([]);

    const [sendingWhatsAppRole, setSendingWhatsAppRole] = useState(null);
    const [sendingPaymentLink, setSendingPaymentLink] = useState(false);

    // Load shipment details
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

    // Load financial summary
    useEffect(() => {
        if (!shipmentId) return;

        const loadAccounting = async () => {
            try {
                const res = await financeService.getShipmentAccounting(shipmentId);
                setAccounting(res.data);
            } catch (err) {
                console.error('Failed to load shipment accounting:', err);
            }
        };

        loadAccounting();
    }, [shipmentId, organizationId]);

    // Copy Tracking Number
    const handleCopyTracking = () => {
        if (!shipment?.trackingNumber) return;
        navigator.clipboard.writeText(shipment.trackingNumber);
        setCopiedTracking(true);
        enqueueSnackbar(isRTL ? 'تم نسخ رقم البوليصة بنجاح' : 'Tracking number copied to clipboard!', { variant: 'success' });
        setTimeout(() => setCopiedTracking(false), 2000);
    };

    // Open Document PDF
    const handleOpenPdf = async (pdfData) => {
        if (!pdfData) return;
        try {
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

            if (typeof pdfData === 'string' && pdfData.startsWith('/uploads/documents/')) {
                const filename = pdfData.split('/').pop();
                const secureUrl = `/shipments/${shipment.trackingNumber}/documents/${filename}`;
                try {
                    const response = await api.get(secureUrl, { responseType: 'blob' });
                    const blobUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
                    window.open(blobUrl, '_blank');
                    return;
                } catch {
                    const { BACKEND_URL } = await import('../services/api');
                    window.open(`${BACKEND_URL}${pdfData}`, '_blank');
                    return;
                }
            }

            window.open(pdfData, '_blank');
        } catch (err) {
            console.error('Failed to open document:', err);
            enqueueSnackbar(isRTL ? 'تعذر فتح المستند' : 'Failed to open document', { variant: 'error' });
        }
    };

    // Generate Target Standard Invoice / QR
    const handleGenerateInvoiceQR = async () => {
        if (!shipment) return;
        try {
            await generateWaybillPDF(shipment);
            enqueueSnackbar(isRTL ? 'تم إصدار الفاتورة / QR بنجاح' : 'Target Invoice/QR generated successfully', { variant: 'success' });
        } catch (err) {
            console.error('Failed to generate Invoice/QR:', err);
            enqueueSnackbar('Failed to generate Target Invoice/QR PDF', { variant: 'error' });
        }
    };

    // Send WhatsApp Payment Link
    const handleSendPaymentLink = async (recipientRole = 'sender') => {
        if (!shipment?.trackingNumber) return;
        setSendingPaymentLink(true);
        try {
            await shipmentService.sendPaymentLink(shipment.trackingNumber, { recipientRole });
            enqueueSnackbar(isRTL ? 'تم إرسال رابط الدفع عبر واتساب للعميل' : 'WhatsApp Pay-by-Link sent to customer!', { variant: 'success' });
            await getShipment(shipment.trackingNumber);
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message || 'Failed to send WhatsApp payment link', { variant: 'error' });
        } finally {
            setSendingPaymentLink(false);
        }
    };

    // Copy Payment Link
    const handleCopyPaymentLink = () => {
        if (!shipment?.trackingNumber) return;
        const link = `${window.location.origin}/pay/${shipment.trackingNumber}`;
        navigator.clipboard.writeText(link);
        enqueueSnackbar(isRTL ? 'تم نسخ رابط الدفع الإلكتروني' : 'Payment checkout link copied to clipboard!', { variant: 'success' });
    };

    // Send WhatsApp Event
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
            enqueueSnackbar(isRTL ? `تم إرسال إشعار واتساب إلى ${recipientRole}` : `WhatsApp message queued for ${recipientRole}!`, { variant: 'success' });
            await getShipment(shipment.trackingNumber);
        } catch (err) {
            enqueueSnackbar(err.message || 'Failed to send WhatsApp message', { variant: 'error' });
        } finally {
            setSendingWhatsAppRole(null);
        }
    };

    // Open Edit Drawer
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
        setEditDrawerOpen(true);

        if ((section === 'billing' || section === 'sender') && isStaff && clients.length === 0) {
            userService.getClients().then(res => setClients(res.data || [])).catch(() => {});
        }
    };

    // Save Edited Consignment
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
            enqueueSnackbar(isRTL ? 'تم حفظ التعديلات بنجاح' : 'Consignment details saved successfully!', { variant: 'success' });
            setEditDrawerOpen(false);
            await getShipment(shipment.trackingNumber);
        } catch (err) {
            enqueueSnackbar(err.message || 'Failed to update shipment', { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Open Carrier Conversion Drawer
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

    // Convert and Book Carrier
    const handleConvertAndBook = async () => {
        if (!conversionCarrierCode || !conversionServiceCode) {
            enqueueSnackbar(isRTL ? 'يرجى اختيار شركة الشحن والخدمة' : 'Please select a carrier and service.', { variant: 'warning' });
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
            enqueueSnackbar(`Shipment converted & booked with ${conversionCarrierCode}! ${awb ? `(AWB: ${awb})` : ''}`, { variant: 'success' });
            setConversionDrawerOpen(false);
            await getShipment(shipment.trackingNumber);
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message || 'Failed to convert shipment', { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    // Generate Official Carrier Documents
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

            const openUrl = docTypeToOpen === 'invoice'
                ? (res?.data?.invoiceUrl || res?.data?.shipment?.invoiceUrl)
                : (res?.data?.awbUrl || res?.data?.labelUrl || res?.data?.shipment?.awbUrl || res?.data?.shipment?.labelUrl);

            if (openUrl) handleOpenPdf(openUrl);
        } catch (err) {
            console.error('Failed to generate carrier documents:', err);
            enqueueSnackbar(err.response?.data?.error || err.message || 'Failed to generate carrier documents', { variant: 'error' });
        } finally {
            setIsGeneratingCarrierDocs(false);
        }
    };

    // Delete Consignment
    const handleDelete = async () => {
        if (!canDeleteShipmentStatus(shipment.status)) {
            enqueueSnackbar(buildShipmentDeleteBlockedMessage(shipment.status).short, { variant: 'warning' });
            return;
        }
        if (window.confirm(`Delete consignment ${shipment.trackingNumber}? This action is irreversible.`)) {
            try {
                await shipmentService.deleteShipment(shipment.trackingNumber);
                enqueueSnackbar(isRTL ? 'تم حذف الشحنة بنجاح' : 'Consignment deleted successfully', { variant: 'success' });
                navigate('/shipments');
            } catch (err) {
                enqueueSnackbar(getShipmentDeleteErrorMessage(err, shipment.status), { variant: 'warning' });
            }
        }
    };

    // Loading State
    if (loading && !shipment) {
        return (
            <div className="flex flex-col justify-center items-center min-h-[65vh] space-y-3">
                <span className="loading loading-spinner loading-lg text-primary"></span>
                <p className="text-xs font-bold text-base-content/60">
                    {isRTL ? 'جاري تحميل ملف الشحنة...' : 'Loading consignment dossier...'}
                </p>
            </div>
        );
    }

    // Error State
    if (error || (!shipment && !loading)) {
        return (
            <div className="w-full max-w-xl mx-auto py-16 px-4">
                <div className="alert alert-error shadow-sm rounded-2xl">
                    <span className="material-symbols-outlined text-xl">error</span>
                    <div>
                        <h4 className="font-extrabold">{isRTL ? 'خطأ في تحميل الشحنة' : 'Shipment Not Found'}</h4>
                        <p className="text-xs">{error || 'The requested consignment could not be retrieved from the operations ledger.'}</p>
                    </div>
                </div>
                <div className="mt-4 text-center">
                    <button onClick={() => navigate('/shipments')} className="btn btn-primary btn-sm rounded-xl font-bold">
                        {isRTL ? 'الرجوع إلى قائمة الشحنات' : 'Back to Shipments'}
                    </button>
                </div>
            </div>
        );
    }

    // Resolved Derived Variables
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

    const isImported = Boolean(
        shipment.documents?.phenixBillId ||
        shipment.documents?.source === 'PHENIX_ERP' ||
        shipment.source === 'phenix_erp' ||
        (typeof shipment.documents === 'object' && !Array.isArray(shipment.documents) && (shipment.documents?.source === 'PHENIX_ERP' || shipment.documents?.phenixBillId))
    );

    const resolvedCarrierAwb = shipment.labelUrl || shipment.awbUrl || extractDocUrl(carrierAwbDoc);
    const resolvedCarrierInvoice = shipment.invoiceUrl || extractDocUrl(carrierInvoiceDoc);
    const canGenerateCarrierDocs = !isImported && isStaff && (!resolvedCarrierAwb || !resolvedCarrierInvoice);

    const statusEditOptions = getAllowedStatusOptions(user, shipment);

    const accountingSummary = accounting || {
        totalCharge: Number(shipment.price || 0),
        totalPaid: Number(shipment.totalPaid || 0),
        remainingBalance: Number(shipment.remainingBalance || (Number(shipment.price || 0) - Number(shipment.totalPaid || 0))),
        status: (Number(shipment.remainingBalance || 0) <= 0.001 && Number(shipment.price || 0) > 0) ? 'paid' : 'unpaid',
        allocations: []
    };

    const isPaid = Number(accountingSummary.remainingBalance || 0) <= 0.001 && Number(accountingSummary.totalCharge || 0) > 0;

    // Deduped and sorted tracking history
    const rawHistory = Array.isArray(shipment.history) ? shipment.history : [];
    const dedupedHistory = dedupeTrackingEvents(rawHistory, (e) => `${e?.status}|${e?.timestamp}|${e?.description}`);
    const sortedHistory = [...dedupedHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Calculate progression percentage across standard 5 steps
    const stepIdx = getStepIndex(shipment.status);
    const progressPct = Math.min(100, Math.max(15, (stepIdx / (STATUS_ORDER.length - 1)) * 100));

    return (
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 py-3 space-y-6">
            
            {/* Top Navigation & Breadcrumb Deck */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-base-content/70">
                    <button
                        type="button"
                        onClick={() => navigate('/shipments')}
                        className="btn btn-ghost btn-xs rounded-lg gap-1 text-base-content hover:text-primary"
                    >
                        <span className="material-symbols-outlined text-sm">{isRTL ? 'arrow_forward' : 'arrow_back'}</span>
                        {isRTL ? 'قائمة الشحنات' : 'Shipments'}
                    </button>
                    <span>/</span>
                    <span className="font-mono text-primary font-black">{shipment.trackingNumber}</span>
                    <span>/</span>
                    <span className="text-base-content/50">{isRTL ? 'ملف التتبع والعمليات' : 'Operations Dossier'}</span>
                </div>

                <div className="text-[11px] font-semibold text-base-content/60 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-xs">schedule</span>
                    <span>{isRTL ? 'آخر تحديث:' : 'Last Updated:'} {new Date(shipment.updatedAt || shipment.createdAt).toLocaleString()}</span>
                </div>
            </div>

            {/* 1. Command Hero Card: Tracking Number, Status, and Actions */}
            <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-6 space-y-5">
                
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                    {/* Left: Tracking # & Identity */}
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-base-content">
                                {shipment.trackingNumber}
                            </h1>
                            <button
                                type="button"
                                onClick={handleCopyTracking}
                                className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                                title={isRTL ? 'نسخ رقم التتبع' : 'Copy Tracking Number'}
                            >
                                <span className="material-symbols-outlined text-base">
                                    {copiedTracking ? 'done' : 'content_copy'}
                                </span>
                            </button>
                            <StatusBadge status={shipment.status} size="md" />
                            {shipment.isTest && (
                                <span className="badge badge-warning font-black text-xs">TEST</span>
                            )}
                            <div className="badge badge-outline badge-sm font-bold gap-1 text-primary">
                                <span className="material-symbols-outlined text-xs">local_shipping</span>
                                <span>{carrierDisplayName}</span>
                            </div>
                        </div>
                        <p className="text-xs text-base-content/60 font-semibold">
                            {getShipmentTypeLabel(shipment.shipmentType)} • {shipment.organization?.name || 'Standard Organization'}
                        </p>
                    </div>

                    {/* Right: Quick Action Buttons Toolbar */}
                    <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto">
                        
                        {/* Copy Public Link */}
                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard.writeText(publicTrackingUrl);
                                enqueueSnackbar(isRTL ? 'تم نسخ رابط التتبع العام' : 'Tracking link copied!', { variant: 'success' });
                            }}
                            className="btn btn-outline btn-sm rounded-xl font-bold gap-1 text-xs"
                        >
                            <span className="material-symbols-outlined text-base">share</span>
                            {isRTL ? 'مشاركة الرابط' : 'Share'}
                        </button>

                        {/* Official Carrier AWB */}
                        {resolvedCarrierAwb && (
                            <button
                                type="button"
                                onClick={() => handleOpenPdf(resolvedCarrierAwb)}
                                className="btn btn-primary btn-sm rounded-xl font-extrabold gap-1 text-xs shadow-sm"
                            >
                                <span className="material-symbols-outlined text-base">print</span>
                                {isRTL ? 'طباعة بوليصة الناقل' : 'Print Carrier AWB'}
                            </button>
                        )}

                        {/* Official Carrier Invoice */}
                        {resolvedCarrierInvoice && (
                            <button
                                type="button"
                                onClick={() => handleOpenPdf(resolvedCarrierInvoice)}
                                className="btn btn-outline btn-sm rounded-xl font-bold gap-1 text-xs"
                            >
                                <span className="material-symbols-outlined text-base">receipt_long</span>
                                {isRTL ? 'فاتورة الجمارك' : 'Customs Invoice'}
                            </button>
                        )}

                        {/* Generate Carrier AWB & Invoice Button (Prominent when pending) */}
                        {canGenerateCarrierDocs && (
                            <button
                                type="button"
                                disabled={isGeneratingCarrierDocs || isProcessing}
                                onClick={() => handleGenerateCarrierDocs('awb')}
                                className="btn btn-primary btn-sm rounded-xl font-extrabold gap-1 text-xs shadow-sm"
                            >
                                <span className="material-symbols-outlined text-base">
                                    {isGeneratingCarrierDocs ? 'hourglass_top' : 'bolt'}
                                </span>
                                {isGeneratingCarrierDocs
                                    ? (isRTL ? 'جاري الإصدار...' : 'Generating...')
                                    : (isInternalShipment 
                                        ? (isRTL ? 'تحويل وإصدار بوليصة الناقل' : 'Convert & Generate AWB')
                                        : (isRTL ? 'إصدار بوليصة الناقل الدولية' : 'Generate Carrier AWB'))}
                            </button>
                        )}

                        {/* Target Hub Standard Document: Invoice / QR */}
                        <button
                            type="button"
                            onClick={handleGenerateInvoiceQR}
                            className="btn btn-outline btn-sm rounded-xl font-bold gap-1 text-xs"
                        >
                            <span className="material-symbols-outlined text-base">qr_code_2</span>
                            {isRTL ? 'فاتورة / QR تارغت' : 'Invoice/QR'}
                        </button>

                        {/* Capture POD (For In Transit or Out for Delivery) */}
                        {['out_for_delivery', 'in_transit'].includes(shipment.status) && (
                            <button
                                type="button"
                                onClick={() => setIsPodModalOpen(true)}
                                className="btn btn-accent btn-sm rounded-xl font-extrabold gap-1 text-xs shadow-sm"
                            >
                                <span className="material-symbols-outlined text-base">draw</span>
                                {isRTL ? 'إثبات التسليم (POD)' : 'Capture POD'}
                            </button>
                        )}

                        {/* Customer Return (If Delivered) */}
                        {String(shipment.status || '').toLowerCase() === 'delivered' && (
                            <button
                                type="button"
                                onClick={() => window.open(`/returns/${shipment.trackingNumber}`, '_blank')}
                                className="btn btn-outline btn-sm rounded-xl font-bold gap-1 text-xs"
                            >
                                <span className="material-symbols-outlined text-base">assignment_return</span>
                                {isRTL ? 'طلب إرجاع' : 'Customer Return'}
                            </button>
                        )}

                        {/* Edit Consignment */}
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => handleOpenEdit('sender')}
                                className="btn btn-ghost btn-sm rounded-xl font-bold gap-1 text-xs border border-base-200"
                            >
                                <span className="material-symbols-outlined text-base">edit</span>
                                {isRTL ? 'تعديل البيانات' : 'Edit'}
                            </button>
                        )}

                        {/* Delete Consignment (Superadmin only) */}
                        {user?.role === 'admin' && (
                            <button
                                type="button"
                                disabled={!canDeleteShipmentStatus(shipment.status)}
                                onClick={handleDelete}
                                className="btn btn-error btn-outline btn-sm rounded-xl font-bold gap-1 text-xs"
                                title={!canDeleteShipmentStatus(shipment.status) ? buildShipmentDeleteBlockedMessage(shipment.status).tooltip : ''}
                            >
                                <span className="material-symbols-outlined text-base">delete</span>
                                {isRTL ? 'حذف' : 'Delete'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Route Visual Connector & Progress Line */}
                <div className="p-4 bg-base-200/50 rounded-2xl border border-base-200 space-y-3">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4 flex-1">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-base-content/60 block">
                                    {isRTL ? 'المنشأ' : 'Origin'}
                                </span>
                                <span className="font-extrabold text-sm sm:text-base text-base-content">
                                    {sender.city || 'Kuwait City'}, {sender.countryCode || 'KW'}
                                </span>
                            </div>

                            <div className="flex-1 mx-2 flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1.5 text-xs font-black text-primary">
                                    <span className="material-symbols-outlined text-base">flight_takeoff</span>
                                    <span>{getShipmentTypeLabel(shipment.shipmentType)}</span>
                                </div>
                                <progress className="progress progress-primary w-full h-2.5" value={progressPct} max="100"></progress>
                            </div>

                            <div className="text-end">
                                <span className="text-[10px] font-black uppercase tracking-wider text-base-content/60 block">
                                    {isRTL ? 'الوجهة والتسليم' : 'Destination'}
                                </span>
                                <span className="font-extrabold text-sm sm:text-base text-base-content">
                                    {receiver.city || 'Riyadh'}, {receiver.countryCode || 'SA'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Step Nodes Ribbon */}
                    <div className="flex justify-between items-center text-[10px] sm:text-xs font-extrabold text-base-content/60 px-1 pt-1">
                        <span className={stepIdx >= 0 ? 'text-primary' : ''}>{isRTL ? 'تم الإنشاء' : 'Created'}</span>
                        <span className={stepIdx >= 1 ? 'text-primary' : ''}>{isRTL ? 'تم الاستلام' : 'Picked Up'}</span>
                        <span className={stepIdx >= 2 ? 'text-primary' : ''}>{isRTL ? 'نقل جوي دولي' : 'In Transit'}</span>
                        <span className={stepIdx >= 3 ? 'text-primary' : ''}>{isRTL ? 'مع المندوب' : 'Out for Delivery'}</span>
                        <span className={stepIdx >= 4 ? 'text-success' : ''}>{isRTL ? 'تم التسليم' : 'Delivered'}</span>
                    </div>
                </div>

            </div>

            {/* 2. Main 2-Column Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                
                {/* LEFT WING (65% / 2 Columns) */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Origin & Destination Party Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Shipper Party Card */}
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-3">
                            <div className="flex justify-between items-center border-b border-base-200 pb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">flight_takeoff</span>
                                    <h3 className="text-xs font-black uppercase tracking-wider text-primary">
                                        {isRTL ? 'بيانات الراسل (المنشأ)' : 'Shipper (Origin)'}
                                    </h3>
                                </div>
                                {canEdit && (
                                    <button 
                                        onClick={() => handleOpenEdit('sender')} 
                                        className="btn btn-ghost btn-xs text-primary font-bold"
                                    >
                                        {isRTL ? 'تعديل' : 'Edit'}
                                    </button>
                                )}
                            </div>

                            <div className="space-y-1 text-xs">
                                <h4 className="font-black text-sm text-base-content">
                                    {sender.company || sender.contactPerson || (isRTL ? 'الراسل' : 'Shipper Contact')}
                                </h4>
                                {sender.contactPerson && sender.company && (
                                    <p className="text-base-content/70 font-semibold">{sender.contactPerson}</p>
                                )}
                                <div className="flex items-center gap-1.5 font-mono text-base-content/80 pt-1">
                                    <span className="material-symbols-outlined text-sm text-base-content/50">call</span>
                                    <span>{sender.phone || '+965 ********'}</span>
                                </div>
                                {sender.email && (
                                    <div className="flex items-center gap-1.5 text-base-content/80">
                                        <span className="material-symbols-outlined text-sm text-base-content/50">mail</span>
                                        <span>{sender.email}</span>
                                    </div>
                                )}
                            </div>

                            <div className="p-2.5 bg-base-200/40 rounded-xl border border-base-200 text-xs text-base-content/80 space-y-0.5">
                                <p>{[sender.line1, sender.line2, sender.address].filter(Boolean).join(', ') || 'Address on file'}</p>
                                <p className="font-extrabold text-base-content">{sender.city}, {sender.countryCode || 'KW'}</p>
                            </div>
                        </div>

                        {/* Consignee Party Card */}
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-3">
                            <div className="flex justify-between items-center border-b border-base-200 pb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-accent text-lg">flight_land</span>
                                    <h3 className="text-xs font-black uppercase tracking-wider text-accent">
                                        {isRTL ? 'بيانات المستلم (الوجهة)' : 'Consignee (Destination)'}
                                    </h3>
                                </div>
                                {canEdit && (
                                    <button 
                                        onClick={() => handleOpenEdit('receiver')} 
                                        className="btn btn-ghost btn-xs text-primary font-bold"
                                    >
                                        {isRTL ? 'تعديل' : 'Edit'}
                                    </button>
                                )}
                            </div>

                            <div className="space-y-1 text-xs">
                                <h4 className="font-black text-sm text-base-content">
                                    {receiver.company || receiver.contactPerson || (isRTL ? 'المستلم' : 'Consignee Contact')}
                                </h4>
                                {receiver.contactPerson && receiver.company && (
                                    <p className="text-base-content/70 font-semibold">{receiver.contactPerson}</p>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-1.5 font-mono text-base-content/80">
                                        <span className="material-symbols-outlined text-sm text-base-content/50">call</span>
                                        <span>{receiver.phone || 'No phone'}</span>
                                    </div>
                                    {receiver.phone && (
                                        <a
                                            href={`https://wa.me/${receiver.phone.replace(/\D/g, '')}?text=Hello%20${receiver.contactPerson || receiver.name},%20regarding%20Target%20Logistics%20Shipment%20${shipment.trackingNumber}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="btn btn-outline btn-success btn-xs font-bold rounded-lg gap-1"
                                        >
                                            <span className="material-symbols-outlined text-xs">chat</span>
                                            WhatsApp
                                        </a>
                                    )}
                                </div>
                                {receiver.email && (
                                    <div className="flex items-center gap-1.5 text-base-content/80">
                                        <span className="material-symbols-outlined text-sm text-base-content/50">mail</span>
                                        <span>{receiver.email}</span>
                                    </div>
                                )}
                            </div>

                            <div className="p-2.5 bg-base-200/40 rounded-xl border border-base-200 text-xs text-base-content/80 space-y-0.5">
                                <p>{[receiver.line1, receiver.line2, receiver.address].filter(Boolean).join(', ') || 'Address on file'}</p>
                                <p className="font-extrabold text-base-content">{receiver.city}, {receiver.countryCode || 'GCC'}</p>
                            </div>
                        </div>

                    </div>

                    {/* Consignment Packages & Content Structure */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
                        <div className="flex justify-between items-center border-b border-base-200 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-lg">inventory_2</span>
                                <h3 className="text-sm font-black text-base-content">
                                    {isRTL ? 'مواصفات الطرود والبضائع المشحونة' : 'Cargo & Consignment Specifications'}
                                </h3>
                            </div>
                            {canEdit && (
                                <button
                                    onClick={() => handleOpenEdit('content')}
                                    className="btn btn-ghost btn-xs text-primary font-bold"
                                >
                                    {isRTL ? 'تعديل الطرود' : 'Edit Parcels'}
                                </button>
                            )}
                        </div>

                        {/* Metric Tiles Ribbon */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="p-3 bg-base-200/40 border border-base-200 rounded-xl text-center">
                                <span className="text-[10px] font-black uppercase tracking-wider text-base-content/60 block">
                                    {isRTL ? 'عدد القطع' : 'Total Pieces'}
                                </span>
                                <span className="text-base sm:text-lg font-black text-base-content mt-0.5 block">
                                    {totalPieces} {isRTL ? 'طرد' : 'Pcs'}
                                </span>
                            </div>

                            <div className="p-3 bg-base-200/40 border border-base-200 rounded-xl text-center">
                                <span className="text-[10px] font-black uppercase tracking-wider text-base-content/60 block">
                                    {isRTL ? 'الوزن الفعلي' : 'Actual Weight'}
                                </span>
                                <span className="text-base sm:text-lg font-black text-base-content mt-0.5 block">
                                    {Number(totalWeight).toFixed(2)} KG
                                </span>
                            </div>

                            <div className="p-3 bg-base-200/40 border border-base-200 rounded-xl text-center">
                                <span className="text-[10px] font-black uppercase tracking-wider text-base-content/60 block">
                                    {isRTL ? 'نوع التغليف' : 'Packaging'}
                                </span>
                                <span className="text-base sm:text-lg font-black text-base-content mt-0.5 block truncate">
                                    {shipment.packagingType || 'Standard'}
                                </span>
                            </div>

                            <div className="p-3 bg-base-200/40 border border-base-200 rounded-xl text-center">
                                <span className="text-[10px] font-black uppercase tracking-wider text-base-content/60 block">
                                    {isRTL ? 'شرط الشحن (Incoterm)' : 'Incoterm'}
                                </span>
                                <span className="text-base sm:text-lg font-black text-primary mt-0.5 block">
                                    {shipment.incoterm || 'DAP'}
                                </span>
                            </div>
                        </div>

                        {/* Dangerous Goods (DGR) Banner if present */}
                        {shipment.dangerousGoods?.contains && (
                            <div className="alert bg-warning/10 border border-warning/30 text-warning-content rounded-xl p-3 flex items-center gap-3">
                                <span className="material-symbols-outlined text-warning text-xl">warning</span>
                                <div className="text-xs">
                                    <strong className="block font-black text-warning">DGR Dangerous Goods Declared</strong>
                                    <span>UN {shipment.dangerousGoods.unCode || '1266'} • {shipment.dangerousGoods.properShippingName || 'Perfumery Products'} • Class {shipment.dangerousGoods.hazardClass || '3'}</span>
                                </div>
                            </div>
                        )}

                        {/* Parcels Table */}
                        {parcels.length > 0 && (
                            <div className="overflow-x-auto border border-base-200 rounded-xl">
                                <table className="table table-zebra table-hover w-full text-xs">
                                    <thead>
                                        <tr className="text-xs uppercase text-base-content/60 bg-base-200/50 font-extrabold">
                                            <th>{isRTL ? 'رقم الطرد' : 'Parcel #'}</th>
                                            <th>{isRTL ? 'الوصف' : 'Description'}</th>
                                            <th>{isRTL ? 'الوزن' : 'Weight'}</th>
                                            <th>{isRTL ? 'الأبعاد (ط×ع×ا)' : 'Dimensions (L×W×H)'}</th>
                                            <th>{isRTL ? 'المرجع' : 'Reference'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parcels.map((p, idx) => (
                                            <tr key={idx}>
                                                <td className="font-bold text-base-content">Package {idx + 1}</td>
                                                <td>{p.description || 'General Cargo'}</td>
                                                <td className="font-extrabold">{Number(p.weight || 0).toFixed(2)} KG</td>
                                                <td>
                                                    {p.dimensions ? `${p.dimensions.length || p.length || 0}×${p.dimensions.width || p.width || 0}×${p.dimensions.height || p.height || 0} cm` : '—'}
                                                </td>
                                                <td className="font-mono text-base-content/60">{p.trackingReference || shipment.reference || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Declared Commercial Items Table */}
                        {items.length > 0 && (
                            <div className="space-y-2">
                                <div className="text-xs font-black uppercase tracking-wider text-base-content/70">
                                    {isRTL ? `البضائع المصرح عنها جمركياً (${items.length})` : `Declared Commercial Goods (${items.length})`}
                                </div>
                                <div className="overflow-x-auto border border-base-200 rounded-xl">
                                    <table className="table table-zebra table-hover w-full text-xs">
                                        <thead>
                                            <tr className="text-xs uppercase text-base-content/60 bg-base-200/50 font-extrabold">
                                                <th>{isRTL ? 'وصف البضاعة' : 'Item Description'}</th>
                                                <th>{isRTL ? 'الكمية' : 'Qty'}</th>
                                                <th>{isRTL ? 'القيمة المصرحة' : 'Declared Value'}</th>
                                                <th>{isRTL ? 'رمز النظام المنسق (HS)' : 'HS Code'}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((it, idx) => (
                                                <tr key={idx}>
                                                    <td className="font-bold text-base-content">{it.description}</td>
                                                    <td className="font-extrabold">{it.quantity || 1}</td>
                                                    <td className="font-extrabold text-primary">
                                                        {it.declaredValue != null ? `${it.declaredValue} ${shipment.currency || 'KWD'}` : '—'}
                                                    </td>
                                                    <td className="font-mono text-base-content/60">{it.hsCode || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Official Carrier Documents & Customs Hub (Hidden when imported from ERP) */}
                    {!isImported && (
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-base-200 pb-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">description</span>
                                    <h3 className="text-sm font-black text-base-content">
                                        {isRTL ? 'وثائق الناقل والبيانات الجمركية الرسمية' : 'Official Carrier Paperwork & Customs Hub'}
                                    </h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isStaff && (
                                        <button
                                            type="button"
                                            disabled={isGeneratingCarrierDocs || isProcessing}
                                            onClick={() => handleGenerateCarrierDocs('awb')}
                                            className="btn btn-outline btn-xs font-bold rounded-lg"
                                        >
                                            <span className="material-symbols-outlined text-sm">
                                                {isGeneratingCarrierDocs ? 'hourglass_top' : (!resolvedCarrierAwb ? 'bolt' : 'sync')}
                                            </span>
                                            {isGeneratingCarrierDocs 
                                                ? 'Generating...' 
                                                : (!resolvedCarrierAwb ? 'Generate Docs' : 'Sync Docs')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                
                                {/* Document 1: Official Carrier AWB */}
                                <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-xl flex flex-col justify-between space-y-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                                <span className="material-symbols-outlined text-base">local_shipping</span>
                                            </div>
                                            <span className={`badge badge-xs font-bold py-1 px-2 ${resolvedCarrierAwb ? 'badge-success' : 'badge-warning'}`}>
                                                {resolvedCarrierAwb ? 'READY' : 'PENDING'}
                                            </span>
                                        </div>
                                        <h4 className="font-extrabold text-xs text-base-content">
                                            {carrierDisplayName} Air Waybill (AWB)
                                        </h4>
                                        <p className="text-[11px] text-base-content/60">
                                            Official barcoded consignment label
                                        </p>
                                    </div>
                                    {resolvedCarrierAwb ? (
                                        <button onClick={() => handleOpenPdf(resolvedCarrierAwb)} className="btn btn-primary btn-xs font-bold rounded-lg w-full">
                                            <span className="material-symbols-outlined text-sm">print</span>
                                            Print AWB
                                        </button>
                                    ) : isStaff ? (
                                        <button onClick={() => handleGenerateCarrierDocs('awb')} disabled={isGeneratingCarrierDocs} className="btn btn-primary btn-xs font-bold rounded-lg w-full">
                                            <span className="material-symbols-outlined text-sm">bolt</span>
                                            Generate
                                        </button>
                                    ) : null}
                                </div>

                                {/* Document 2: Carrier Customs Invoice */}
                                <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-xl flex flex-col justify-between space-y-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="w-8 h-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                                                <span className="material-symbols-outlined text-base">receipt_long</span>
                                            </div>
                                            <span className={`badge badge-xs font-bold py-1 px-2 ${resolvedCarrierInvoice ? 'badge-success' : 'badge-warning'}`}>
                                                {resolvedCarrierInvoice ? 'READY' : 'PENDING'}
                                            </span>
                                        </div>
                                        <h4 className="font-extrabold text-xs text-base-content">
                                            Carrier Customs Invoice
                                        </h4>
                                        <p className="text-[11px] text-base-content/60">
                                            Itemized customs export declaration
                                        </p>
                                    </div>
                                    {resolvedCarrierInvoice ? (
                                        <button onClick={() => handleOpenPdf(resolvedCarrierInvoice)} className="btn btn-outline btn-xs font-bold rounded-lg w-full">
                                            <span className="material-symbols-outlined text-sm">print</span>
                                            Print Invoice
                                        </button>
                                    ) : isStaff ? (
                                        <button onClick={() => handleGenerateCarrierDocs('invoice')} disabled={isGeneratingCarrierDocs} className="btn btn-outline btn-xs font-bold rounded-lg w-full">
                                            <span className="material-symbols-outlined text-sm">bolt</span>
                                            Generate
                                        </button>
                                    ) : null}
                                </div>

                                {/* Document 3: Target Hub Handover / Invoice QR */}
                                <div className="p-3.5 bg-base-200/40 border border-base-200 rounded-xl flex flex-col justify-between space-y-3">
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="w-8 h-8 rounded-lg bg-base-300 text-base-content flex items-center justify-center">
                                                <span className="material-symbols-outlined text-base">qr_code_2</span>
                                            </div>
                                            <span className="badge badge-neutral badge-xs font-bold py-1 px-2">
                                                SYSTEM
                                            </span>
                                        </div>
                                        <h4 className="font-extrabold text-xs text-base-content">
                                            Target Hub Invoice & QR
                                        </h4>
                                        <p className="text-[11px] text-base-content/60">
                                            Hub handover & warehouse scan sheet
                                        </p>
                                    </div>
                                    <button onClick={handleGenerateInvoiceQR} className="btn btn-outline btn-xs font-bold rounded-lg w-full">
                                        <span className="material-symbols-outlined text-sm">print</span>
                                        Print Document
                                    </button>
                                </div>

                            </div>
                        </div>
                    )}

                    {/* Milestone History & Checkpoints (DaisyUI Vertical Timeline) */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
                        <div className="flex justify-between items-center border-b border-base-200 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-lg">timeline</span>
                                <h3 className="text-sm font-black text-base-content">
                                    {isRTL ? 'سجل المحطات ونقاط التتبع المباشرة' : 'Milestone History & Telemetry Timeline'}
                                </h3>
                            </div>
                            {canEdit && (
                                <button
                                    onClick={() => handleOpenEdit('status')}
                                    className="btn btn-primary btn-outline btn-xs font-bold rounded-lg gap-1"
                                >
                                    <span className="material-symbols-outlined text-xs">add_task</span>
                                    {isRTL ? 'إضافة محطة / تحديث الحالة' : 'Advance Milestone'}
                                </button>
                            )}
                        </div>

                        {sortedHistory.length === 0 ? (
                            <div className="text-center py-8 text-base-content/60 font-semibold text-xs">
                                {isRTL ? 'لا توجد محطات تتبع مسجلة حتى الآن.' : 'No checkpoint milestones recorded yet.'}
                            </div>
                        ) : (
                            <ul className="timeline timeline-vertical timeline-compact text-xs">
                                {sortedHistory.map((event, idx) => {
                                    const { date, time } = formatTimestampKuwait(event.timestamp);
                                    const isLatest = idx === 0;
                                    const statusStr = typeof event.status === 'object' ? (event.status?.status || event.status?.name || 'Update') : event.status;
                                    const displayMessage = getEventDisplayMessage(event, statusStr);

                                    return (
                                        <li key={idx}>
                                            {idx > 0 && <hr className={isLatest ? 'bg-primary' : 'bg-base-300'} />}
                                            <div className={`timeline-middle ${isLatest ? 'text-primary' : 'text-base-content/50'}`}>
                                                <span className="material-symbols-outlined text-base">
                                                    {isLatest ? 'check_circle' : 'circle'}
                                                </span>
                                            </div>
                                            <div className="timeline-end timeline-box py-2.5 px-3.5 border-base-200 bg-base-100 shadow-xs rounded-xl space-y-1 w-full max-w-2xl mb-2">
                                                <div className="flex justify-between items-baseline gap-2">
                                                    <span className="font-extrabold text-xs text-base-content">{displayMessage}</span>
                                                    <span className="font-mono text-[10.5px] text-base-content/50">{date} • {time}</span>
                                                </div>
                                                {event.location && (
                                                    <div className="text-[11px] text-base-content/70 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs text-primary">pin_drop</span>
                                                        <span>{typeof event.location === 'object' ? (event.location.formattedAddress || event.location.city || 'Kuwait') : event.location}</span>
                                                    </div>
                                                )}
                                                {event.pod && (
                                                    <div className="p-2 bg-success/10 border border-success/30 rounded-lg text-success-content text-[11px] space-y-1">
                                                        <div className="font-black text-success">✓ Proof of Delivery Recorded</div>
                                                        <div>Received by: <strong>{event.pod.recipientName}</strong> ({event.pod.recipientRelationship || 'Self'})</div>
                                                        {event.pod.signatureDataUrl && (
                                                            <img src={event.pod.signatureDataUrl} alt="Signature" className="h-8 max-w-[120px] object-contain bg-white rounded border border-success/20 p-0.5 mt-1" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {idx < sortedHistory.length - 1 && <hr className="bg-base-300" />}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                </div>

                {/* RIGHT SIDEBAR (35% / 1 Column) */}
                <div className="space-y-6">
                    
                    {/* Financial Summary Card */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
                        <div className="flex justify-between items-center border-b border-base-200 pb-2.5">
                            <div className="flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-primary text-lg">account_balance_wallet</span>
                                <h3 className="text-sm font-black text-base-content">
                                    {isRTL ? 'البيان المالي والرسوم' : 'Financial Ledger'}
                                </h3>
                            </div>
                            <span className={`badge badge-sm font-black ${isPaid ? 'badge-success' : 'badge-error'}`}>
                                {isPaid ? 'PAID' : 'DUE'}
                            </span>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center font-semibold">
                                <span className="text-base-content/60">{isRTL ? 'إجمالي الرسوم:' : 'Total Charge:'}</span>
                                <span className="font-black text-sm text-base-content">
                                    {Number(accountingSummary.totalCharge || 0).toFixed(3)} {shipment.currency || 'KWD'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center font-semibold">
                                <span className="text-base-content/60">{isRTL ? 'المدفوع:' : 'Total Paid:'}</span>
                                <span className="font-black text-success">
                                    {Number(accountingSummary.totalPaid || 0).toFixed(3)} {shipment.currency || 'KWD'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center font-semibold border-t border-base-200 pt-2">
                                <span className="text-base-content/60">{isRTL ? 'الرصيد المتبقي:' : 'Balance Due:'}</span>
                                <span className={`font-black text-sm ${accountingSummary.remainingBalance > 0 ? 'text-error' : 'text-success'}`}>
                                    {Number(accountingSummary.remainingBalance || 0).toFixed(3)} {shipment.currency || 'KWD'}
                                </span>
                            </div>
                        </div>

                        {accountingSummary.remainingBalance > 0 && (
                            <div className="space-y-2 pt-2 border-t border-base-200">
                                <button
                                    onClick={() => handleSendPaymentLink('sender')}
                                    disabled={sendingPaymentLink}
                                    className="btn btn-primary btn-sm rounded-xl font-extrabold w-full gap-1.5 shadow-sm text-xs"
                                >
                                    <span className="material-symbols-outlined text-base">chat</span>
                                    {sendingPaymentLink ? 'Dispatching...' : (isRTL ? 'إرسال رابط الدفع واتساب' : 'Send WhatsApp Payment Link')}
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCopyPaymentLink}
                                        className="btn btn-outline btn-xs rounded-lg font-bold flex-1"
                                    >
                                        {isRTL ? 'نسخ الرابط' : 'Copy Link'}
                                    </button>
                                    <button
                                        onClick={() => window.open(`/pay/${shipment.trackingNumber}`, '_blank')}
                                        className="btn btn-ghost btn-xs text-primary font-bold flex-1"
                                    >
                                        {isRTL ? 'بوابة الدفع ↗' : 'Pay Online ↗'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* WhatsApp Dispatch Tracker Card */}
                    {isStaff && (
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 space-y-4">
                            <div className="flex justify-between items-center border-b border-base-200 pb-2.5">
                                <div className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-success text-lg">chat</span>
                                    <h3 className="text-sm font-black text-base-content">
                                        {isRTL ? 'سجل إشعارات واتساب' : 'WhatsApp Dispatch Tracker'}
                                    </h3>
                                </div>
                                <span className="badge badge-outline badge-xs font-bold">
                                    {(shipment.notificationLogs || []).length} logs
                                </span>
                            </div>

                            <div className="space-y-3">
                                {[
                                    { key: 'sender', label: isRTL ? 'إشعار الراسل' : 'Sender Notification' },
                                    { key: 'receiver', label: isRTL ? 'إشعار المستلم' : 'Receiver Notification' }
                                ].map((role) => {
                                    const roleLogs = (shipment.notificationLogs || []).filter(l => l.recipientRole === role.key);
                                    const latestLog = roleLogs[0] || null;
                                    const isSent = latestLog && ['sent', 'delivered', 'read'].includes(latestLog.status);

                                    return (
                                        <div key={role.key} className="p-3 bg-base-200/40 border border-base-200 rounded-xl space-y-2 text-xs">
                                            <div className="flex justify-between items-center">
                                                <span className="font-extrabold text-base-content">{role.label}</span>
                                                <span className={`badge badge-xs font-bold py-1 px-2 ${isSent ? 'badge-success' : 'badge-warning'}`}>
                                                    {latestLog ? latestLog.status.toUpperCase() : 'QUEUED'}
                                                </span>
                                            </div>

                                            {latestLog && (
                                                <div className="text-[11px] text-base-content/60 font-mono">
                                                    To: {latestLog.recipientPhone || 'Customer'} • Event: {latestLog.eventType}
                                                </div>
                                            )}

                                            <button
                                                onClick={() => handleSendWhatsAppRole(role.key)}
                                                disabled={sendingWhatsAppRole === role.key || isSent}
                                                className={`btn btn-xs rounded-lg font-bold w-full gap-1 ${
                                                    isSent 
                                                        ? 'btn-disabled bg-base-300 text-base-content/40 cursor-not-allowed border-base-300' 
                                                        : 'btn-outline btn-success'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-sm">
                                                    {isSent ? 'check_circle' : 'send'}
                                                </span>
                                                {sendingWhatsAppRole === role.key 
                                                    ? (isRTL ? 'جاري الإرسال...' : 'Dispatching...') 
                                                    : (isSent 
                                                        ? (isRTL ? 'تم الإرسال مسبقاً' : 'Delivered (Already Sent)') 
                                                        : (isRTL ? 'إرسال الآن' : 'Send WhatsApp Now'))}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Operational Direct Conversion Card (If internally managed) */}
                    {isInternalShipment && (
                        <div className="alert bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-primary font-black text-xs uppercase">
                                <span className="material-symbols-outlined text-base">flight_takeoff</span>
                                <span>{isRTL ? 'الربط بالناقل الدولي' : 'Carrier Conversion'}</span>
                            </div>
                            <p className="text-xs text-base-content/70">
                                {isRTL 
                                    ? 'هذه الشحنة مدارة داخلياً. يمكنك تحويلها وحجزها مباشرة عبر ناقل دولي (DHL / LogesTechs).' 
                                    : 'Consignment managed internally. Convert to DHL Express or OTE to generate global air waybill.'}
                            </p>
                            <button
                                onClick={handleOpenConversion}
                                className="btn btn-primary btn-sm rounded-xl font-bold w-full"
                            >
                                {isRTL ? 'تحويل وحجز الناقل الدولي' : 'Convert & Book Carrier'}
                            </button>
                        </div>
                    )}

                </div>

            </div>

            {/* Proof of Delivery Modal */}
            <ProofOfDeliveryModal
                isOpen={isPodModalOpen}
                shipment={shipment}
                onClose={() => setIsPodModalOpen(false)}
                onDelivered={async () => {
                    setIsPodModalOpen(false);
                    enqueueSnackbar(isRTL ? 'تم تسجيل إثبات التسليم بنجاح' : 'Proof of delivery captured successfully!', { variant: 'success' });
                    await getShipment(shipment.trackingNumber);
                }}
            />

            {/* Slide-Over Edit Consignment Drawer (Pure DaisyUI) */}
            {editDrawerOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div 
                        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                        onClick={() => setEditDrawerOpen(false)}
                    />

                    <div className="relative w-full max-w-xl bg-base-100 h-full shadow-2xl z-10 flex flex-col overflow-y-auto border-s border-base-200 p-5 space-y-4 animate-in slide-in-from-right duration-200">
                        {/* Drawer Header */}
                        <div className="flex justify-between items-center border-b border-base-200 pb-3">
                            <div>
                                <h3 className="font-black text-base text-base-content">
                                    {isRTL ? 'تعديل بيانات الشحنة' : 'Edit Consignment Dossier'}
                                </h3>
                                <p className="text-xs text-base-content/50 font-mono mt-0.5">{shipment.trackingNumber}</p>
                            </div>
                            <button onClick={() => setEditDrawerOpen(false)} className="btn btn-ghost btn-sm btn-square rounded-full">
                                ✕
                            </button>
                        </div>

                        {/* Top 5 Section Tabs */}
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                            {EDIT_TABS.map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => setEditSection(tab.key)}
                                    className={`btn btn-xs rounded-xl font-bold shrink-0 gap-1 ${
                                        editSection === tab.key ? 'btn-primary' : 'btn-ghost border-base-200 text-base-content/70'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                                    <span>{isRTL ? tab.labelAr : tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Tab Content Body */}
                        <div className="flex-1 space-y-4 py-2">
                            {editDraft && (
                                <>
                                    {/* Shipper Tab */}
                                    {editSection === 'sender' && (
                                        <div className="space-y-3 text-xs">
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Shipper Name / Company</span></label>
                                                <input
                                                    type="text"
                                                    value={editDraft.sender?.company || editDraft.sender?.contactPerson || ''}
                                                    onChange={(e) => setEditDraft({ ...editDraft, sender: { ...editDraft.sender, company: e.target.value } })}
                                                    className="input input-bordered input-sm rounded-xl"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Contact Person</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.sender?.contactPerson || ''}
                                                        onChange={(e) => setEditDraft({ ...editDraft, sender: { ...editDraft.sender, contactPerson: e.target.value } })}
                                                        className="input input-bordered input-sm rounded-xl"
                                                    />
                                                </div>
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Phone Number</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.sender?.phone || ''}
                                                        onChange={(e) => setEditDraft({ ...editDraft, sender: { ...editDraft.sender, phone: e.target.value } })}
                                                        className="input input-bordered input-sm rounded-xl font-mono"
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Address Line 1</span></label>
                                                <input
                                                    type="text"
                                                    value={editDraft.sender?.line1 || editDraft.sender?.address || ''}
                                                    onChange={(e) => setEditDraft({ ...editDraft, sender: { ...editDraft.sender, line1: e.target.value, address: e.target.value } })}
                                                    className="input input-bordered input-sm rounded-xl"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">City</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.sender?.city || ''}
                                                        onChange={(e) => setEditDraft({ ...editDraft, sender: { ...editDraft.sender, city: e.target.value } })}
                                                        className="input input-bordered input-sm rounded-xl"
                                                    />
                                                </div>
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Country Code</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.sender?.countryCode || 'KW'}
                                                        onChange={(e) => setEditDraft({ ...editDraft, sender: { ...editDraft.sender, countryCode: e.target.value.toUpperCase() } })}
                                                        className="input input-bordered input-sm rounded-xl font-mono"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Consignee Tab */}
                                    {editSection === 'receiver' && (
                                        <div className="space-y-3 text-xs">
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Consignee Name / Company</span></label>
                                                <input
                                                    type="text"
                                                    value={editDraft.receiver?.company || editDraft.receiver?.contactPerson || ''}
                                                    onChange={(e) => setEditDraft({ ...editDraft, receiver: { ...editDraft.receiver, company: e.target.value } })}
                                                    className="input input-bordered input-sm rounded-xl"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Contact Person</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.receiver?.contactPerson || ''}
                                                        onChange={(e) => setEditDraft({ ...editDraft, receiver: { ...editDraft.receiver, contactPerson: e.target.value } })}
                                                        className="input input-bordered input-sm rounded-xl"
                                                    />
                                                </div>
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Phone Number</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.receiver?.phone || ''}
                                                        onChange={(e) => setEditDraft({ ...editDraft, receiver: { ...editDraft.receiver, phone: e.target.value } })}
                                                        className="input input-bordered input-sm rounded-xl font-mono"
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Delivery Address Line</span></label>
                                                <input
                                                    type="text"
                                                    value={editDraft.receiver?.line1 || editDraft.receiver?.address || ''}
                                                    onChange={(e) => setEditDraft({ ...editDraft, receiver: { ...editDraft.receiver, line1: e.target.value, address: e.target.value } })}
                                                    className="input input-bordered input-sm rounded-xl"
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">City</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.receiver?.city || ''}
                                                        onChange={(e) => setEditDraft({ ...editDraft, receiver: { ...editDraft.receiver, city: e.target.value } })}
                                                        className="input input-bordered input-sm rounded-xl"
                                                    />
                                                </div>
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Destination Country</span></label>
                                                    <input
                                                        type="text"
                                                        value={editDraft.receiver?.countryCode || 'SA'}
                                                        onChange={(e) => setEditDraft({ ...editDraft, receiver: { ...editDraft.receiver, countryCode: e.target.value.toUpperCase() } })}
                                                        className="input input-bordered input-sm rounded-xl font-mono"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Cargo & Goods Tab */}
                                    {editSection === 'content' && (
                                        <div className="space-y-3 text-xs">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Packaging Type</span></label>
                                                    <select
                                                        value={editDraft.packagingType || 'Standard'}
                                                        onChange={(e) => setEditDraft({ ...editDraft, packagingType: e.target.value })}
                                                        className="select select-bordered select-sm rounded-xl"
                                                    >
                                                        <option value="Standard">Standard Package</option>
                                                        <option value="Document">Document Envelope</option>
                                                        <option value="Pallet">Express Pallet</option>
                                                        <option value="Flyer">Target Courier Flyer</option>
                                                    </select>
                                                </div>
                                                <div className="form-control">
                                                    <label className="label py-1"><span className="label-text font-bold">Currency</span></label>
                                                    <select
                                                        value={editDraft.currency || 'KWD'}
                                                        onChange={(e) => setEditDraft({ ...editDraft, currency: e.target.value })}
                                                        className="select select-bordered select-sm rounded-xl font-bold"
                                                    >
                                                        <option value="KWD">KWD - Kuwaiti Dinar</option>
                                                        <option value="SAR">SAR - Saudi Riyal</option>
                                                        <option value="AED">AED - UAE Dirham</option>
                                                        <option value="USD">USD - US Dollar</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="form-control">
                                                <label className="label cursor-pointer justify-start gap-3 p-2 bg-base-200/50 rounded-xl">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(editDraft.dangerousGoods?.contains)}
                                                        onChange={(e) => setEditDraft({ ...editDraft, dangerousGoods: { ...editDraft.dangerousGoods, contains: e.target.checked } })}
                                                        className="checkbox checkbox-warning checkbox-sm rounded"
                                                    />
                                                    <span className="label-text font-bold text-xs">Contains Dangerous Goods (DGR / Perfumes / Lithium Batteries)</span>
                                                </label>
                                            </div>
                                        </div>
                                    )}

                                    {/* Billing & Terms Tab */}
                                    {editSection === 'billing' && (
                                        <div className="space-y-3 text-xs">
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Incoterm</span></label>
                                                <select
                                                    value={editDraft.incoterm || 'DAP'}
                                                    onChange={(e) => setEditDraft({ ...editDraft, incoterm: e.target.value })}
                                                    className="select select-bordered select-sm rounded-xl"
                                                >
                                                    <option value="DAP">DAP (Delivered at Place)</option>
                                                    <option value="DDP">DDP (Delivered Duty Paid)</option>
                                                    <option value="FOB">FOB (Free on Board)</option>
                                                    <option value="EXW">EXW (Ex Works)</option>
                                                </select>
                                            </div>
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Customer Reference</span></label>
                                                <input
                                                    type="text"
                                                    value={editDraft.reference || ''}
                                                    onChange={(e) => setEditDraft({ ...editDraft, reference: e.target.value })}
                                                    className="input input-bordered input-sm rounded-xl font-mono"
                                                />
                                            </div>

                                            {isInternalShipment && (
                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-base-200">
                                                    <div className="form-control">
                                                        <label className="label py-1"><span className="label-text font-bold">Customer Price (KWD)</span></label>
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            value={editDraft.price ?? ''}
                                                            onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                                                            className="input input-bordered input-sm rounded-xl font-mono"
                                                        />
                                                    </div>
                                                    <div className="form-control">
                                                        <label className="label py-1"><span className="label-text font-bold">Internal Cost (KWD)</span></label>
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            value={editDraft.costPrice ?? ''}
                                                            onChange={(e) => setEditDraft({ ...editDraft, costPrice: e.target.value })}
                                                            className="input input-bordered input-sm rounded-xl font-mono"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Status & Milestones Tab */}
                                    {editSection === 'status' && (
                                        <div className="space-y-3 text-xs">
                                            <div className="alert bg-info/10 text-info-content border border-info/20 rounded-xl p-2.5 text-xs">
                                                <span>Advancing status updates milestone telemetry and timestamps in the public tracking database.</span>
                                            </div>
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Consignment Status</span></label>
                                                <select
                                                    value={editDraft.status || ''}
                                                    onChange={(e) => setEditDraft({ ...editDraft, status: e.target.value })}
                                                    className="select select-bordered select-sm rounded-xl font-bold"
                                                >
                                                    {statusEditOptions.map((st) => (
                                                        <option key={st} value={st}>
                                                            {STATUS_LABELS[st] || st.replace(/_/g, ' ')}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="form-control">
                                                <label className="label py-1"><span className="label-text font-bold">Checkpoint Operational Note</span></label>
                                                <textarea
                                                    rows={3}
                                                    value={editDraft.statusDescription || ''}
                                                    onChange={(e) => setEditDraft({ ...editDraft, statusDescription: e.target.value })}
                                                    placeholder="e.g. Cleared customs at Kuwait Airport cargo hub..."
                                                    className="textarea textarea-bordered rounded-xl text-xs"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Drawer Actions */}
                        <div className="flex gap-2 pt-3 border-t border-base-200">
                            <button
                                type="button"
                                onClick={() => setEditDrawerOpen(false)}
                                className="btn btn-ghost btn-sm rounded-xl font-bold flex-1"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={isProcessing}
                                className="btn btn-primary btn-sm rounded-xl font-extrabold flex-1"
                            >
                                {isProcessing ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Carrier Conversion Drawer */}
            {conversionDrawerOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div 
                        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                        onClick={() => setConversionDrawerOpen(false)}
                    />

                    <div className="relative w-full max-w-md bg-base-100 h-full shadow-2xl z-10 flex flex-col overflow-y-auto border-s border-base-200 p-5 space-y-4 animate-in slide-in-from-right duration-200">
                        <div className="flex justify-between items-center border-b border-base-200 pb-3">
                            <h3 className="font-black text-base text-base-content">
                                Convert & Book Carrier
                            </h3>
                            <button onClick={() => setConversionDrawerOpen(false)} className="btn btn-ghost btn-sm btn-square rounded-full">
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 space-y-4 text-xs">
                            <p className="text-base-content/70">
                                Select a carrier gateway and service level to dispatch this consignment and generate carrier AWB instantly.
                            </p>

                            <div className="form-control">
                                <label className="label py-1"><span className="label-text font-bold">Target Carrier</span></label>
                                <select
                                    value={conversionCarrierCode}
                                    onChange={(e) => {
                                        setConversionCarrierCode(e.target.value);
                                        const c = conversionTargetCarriers.find(tc => tc.code === e.target.value);
                                        if (c?.serviceOptions?.[0]) setConversionServiceCode(c.serviceOptions[0].code);
                                    }}
                                    className="select select-bordered select-sm rounded-xl font-bold"
                                >
                                    <option value="DGR">Target International Air (DHL Express)</option>
                                    <option value="OTE">Target Regional Road (LogesTechs / OTE)</option>
                                </select>
                            </div>

                            <div className="form-control">
                                <label className="label py-1"><span className="label-text font-bold">Service Level</span></label>
                                <select
                                    value={conversionServiceCode}
                                    onChange={(e) => setConversionServiceCode(e.target.value)}
                                    className="select select-bordered select-sm rounded-xl"
                                >
                                    <option value="P">Express Worldwide (P)</option>
                                    <option value="N">Domestic Express (N)</option>
                                    <option value="D">Economy Select (D)</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-3 border-t border-base-200">
                            <button onClick={() => setConversionDrawerOpen(false)} className="btn btn-ghost btn-sm rounded-xl font-bold flex-1">
                                Cancel
                            </button>
                            <button onClick={handleConvertAndBook} disabled={isProcessing} className="btn btn-primary btn-sm rounded-xl font-extrabold flex-1">
                                {isProcessing ? 'Booking...' : 'Convert & Book Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ShipmentDetailsPage;
