import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useShipment } from '../context/ShipmentContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useSnackbar } from 'notistack';
import { financeService, integrationService, shipmentService, userService } from '../services/api';
import api from '../services/api';
import {
    STATUS_ORDER, STATUS_LABELS, INTERNAL_SHIPMENT_STATUSES, getStepIndex, normalizeStatus, isStatusAhead
} from '../constants/statusConfig';
import {
    buildShipmentDeleteBlockedMessage,
    canDeleteShipmentStatus,
    getShipmentDeleteErrorMessage,
    hasCarrierBooking
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

const parseDateRobust = (raw) => {
    if (!raw) return null;
    const str = String(raw).trim();
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
        return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    }
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
};

const formatTimestampKuwait = (timestamp) => {
    if (!timestamp) return { date: '—', time: '—', dayHeader: '—', dayKey: '' };
    try {
        const d = parseDateRobust(timestamp) || new Date(timestamp);
        if (Number.isNaN(d.getTime())) {
            return { date: String(timestamp), time: '', dayHeader: String(timestamp), dayKey: '' };
        }
        return {
            date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' }),
            time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuwait' }) + ' AST',
            dayHeader: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kuwait' }),
            dayKey: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }) // YYYY-MM-DD
        };
    } catch {
        return { date: String(timestamp), time: '', dayHeader: String(timestamp), dayKey: '' };
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
    const shipmentRef = useRef(null);

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
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadDocType, setUploadDocType] = useState('awb');
    const [uploadFile, setUploadFile] = useState(null);
    const [isUploadingDoc, setIsUploadingDoc] = useState(false);
    const [historyTab, setHistoryTab] = useState('milestones'); // 'milestones' | 'telemetry' | 'comments'
    const [newCommentText, setNewCommentText] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

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

    // Keep ref in sync so polling interval can read latest status without stale closures
    shipmentRef.current = shipment;

    // Load shipment details — initial fetch + auto-refresh every 2 min for active shipments
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

        // Silent background refresh (no loading spinner) every 2 minutes for non-terminal shipments
        const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
        const TERMINAL = ['delivered', 'cancelled', 'returned', 'rejected'];
        const pollId = setInterval(async () => {
            const currentStatus = shipmentRef.current?.status?.toLowerCase();
            if (currentStatus && TERMINAL.includes(currentStatus)) return;
            try {
                await getShipment(trackingNumber);
            } catch { /* silent */ }
        }, POLL_INTERVAL);

        // Refresh immediately when the browser tab regains focus after being hidden
        const handleVisibility = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    await getShipment(trackingNumber);
                } catch { /* silent */ }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(pollId);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
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

    // Share Location Pin with Carrier / Courier Driver
    const handleShareLocationWithCarrier = () => {
        if (!shipment?.trackingNumber) return;
        const url = `${window.location.origin}/track/${shipment.trackingNumber}/location`;
        const text = encodeURIComponent(`Target Logistics - Pinned GPS Location for Consignment #${shipment.trackingNumber}: ${url}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    const handleCopyLocationLink = () => {
        if (!shipment?.trackingNumber) return;
        const url = `${window.location.origin}/track/${shipment.trackingNumber}/location`;
        navigator.clipboard.writeText(url);
        enqueueSnackbar(isRTL ? 'تم نسخ رابط موقع التسليم (GPS) بنجاح' : 'Delivery GPS Location link copied!', { variant: 'success' });
    };

    // Share Returns & Paperwork with Carrier / Shipper
    const handleShareReturnWithCarrier = () => {
        if (!shipment?.trackingNumber) return;
        const url = `${window.location.origin}/returns/${shipment.trackingNumber}`;
        const text = encodeURIComponent(`Target Logistics - Reverse Return & Paperwork Portal for Consignment #${shipment.trackingNumber}: ${url}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    const handleCopyReturnLink = () => {
        if (!shipment?.trackingNumber) return;
        const url = `${window.location.origin}/returns/${shipment.trackingNumber}`;
        navigator.clipboard.writeText(url);
        enqueueSnackbar(isRTL ? 'تم نسخ رابط بوابة المرتجعات بنجاح' : 'Customer returns portal link copied!', { variant: 'success' });
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

    // Upload Carrier or Customs Document
    const handleUploadDocument = async (e) => {
        if (e) e.preventDefault();
        if (!uploadFile) {
            enqueueSnackbar(isRTL ? 'يرجى اختيار ملف PDF للرفع' : 'Please select a PDF document to upload', { variant: 'warning' });
            return;
        }
        setIsUploadingDoc(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64Data = reader.result;
                    await shipmentService.uploadDocument(shipment.trackingNumber, {
                        docType: uploadDocType,
                        base64Data,
                        filename: uploadFile.name
                    });
                    enqueueSnackbar(isRTL ? 'تم رفع المستند وإرفاقه بالشحنة بنجاح' : 'Document uploaded and attached successfully', { variant: 'success' });
                    setIsUploadModalOpen(false);
                    setUploadFile(null);
                    await getShipment(shipment.trackingNumber);
                } catch (uploadErr) {
                    console.error('Failed to upload document payload:', uploadErr);
                    enqueueSnackbar(uploadErr.response?.data?.error || uploadErr.message || 'Failed to upload document', { variant: 'error' });
                } finally {
                    setIsUploadingDoc(false);
                }
            };
            reader.readAsDataURL(uploadFile);
        } catch (err) {
            console.error('Failed to read document file:', err);
            enqueueSnackbar(err.message || 'Failed to read file', { variant: 'error' });
            setIsUploadingDoc(false);
        }
    };

    // Delete Consignment
    const handleDelete = async () => {
        if (!canDeleteShipmentStatus(shipment?.status, shipment, user?.role)) {
            enqueueSnackbar(buildShipmentDeleteBlockedMessage(shipment?.status, hasCarrierBooking(shipment)).short, { variant: 'warning' });
            return;
        }
        const confirmMsg = isRTL
            ? `هل أنت متأكد من حذف الشحنة ${shipment.trackingNumber} وجميع السجلات المالية المرتبطة بها نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`
            : `Delete consignment ${shipment.trackingNumber} and all associated financial/ledger records? This action is irreversible.`;
            
        if (window.confirm(confirmMsg)) {
            try {
                await shipmentService.deleteShipment(shipment.trackingNumber);
                enqueueSnackbar(isRTL ? 'تم حذف الشحنة وسجلاتها المالية بنجاح' : 'Consignment and related finance records deleted successfully', { variant: 'success' });
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
    const canGenerateCarrierDocs = isStaff && (!resolvedCarrierAwb || !resolvedCarrierInvoice);

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

    // Helper to map carrier tracking events into clean, readable Target statuses & milestones
    const reformatToTargetMilestone = (evt) => {
        const rawStatus = typeof evt.status === 'object' ? (evt.status?.status || evt.status?.name || 'in_transit') : (evt.status || 'in_transit');
        const s = String(rawStatus || '').toLowerCase();
        const desc = String(evt.description || '').toLowerCase();

        let targetStatus = 'in_transit';
        let badgeColor = 'badge-primary';
        let friendlyTitle = getEventDisplayMessage(evt, 'In Transit');

        let isExceptionEvent = false;

        if (s.includes('exception') || s.includes('hold') || desc.includes('held') || desc.includes('delay') || desc.includes('undelivered') || desc.includes('failed') || desc.includes('incomplete') || desc.includes('damage') || desc.includes('clearance_delay')) {
            targetStatus = 'exception';
            badgeColor = 'badge-error text-white';
            friendlyTitle = isRTL ? 'طابور التدخل والاستثناءات الفورية' : 'Active Triage & Exception Flag';
            isExceptionEvent = true;
        } else if (s.includes('out_for_delivery') || desc.includes('out for delivery') || s.includes('for_delivery') || desc.includes('for delivery') || s === 'od' || desc.includes('with courier') || desc.includes('with driver')) {
            targetStatus = 'out_for_delivery';
            badgeColor = 'badge-secondary text-white';
            friendlyTitle = isRTL ? 'مع المندوب للتسليم' : 'Out for Delivery with Courier';
        } else if (s.includes('delivered') || desc.includes('delivered') || desc.includes('consignee') || evt.pod || s === 'dlv' || desc.includes('proof of delivery')) {
            targetStatus = 'delivered';
            badgeColor = 'badge-success text-white';
            friendlyTitle = isRTL ? 'تم التسليم للمستلم' : 'Delivered to Consignee';
        } else if (s.includes('custom') || desc.includes('customs') || desc.includes('clearance') || desc.includes('duty')) {
            targetStatus = 'in_transit';
            badgeColor = 'badge-accent text-white';
            friendlyTitle = isRTL ? 'التخليص الجمركي' : 'Customs Clearance Processed';
        } else if (s.includes('arrive') || desc.includes('arrived') || desc.includes('received at hub') || desc.includes('facility') || s === 'af') {
            targetStatus = 'received_at_hub';
            badgeColor = 'badge-primary';
            friendlyTitle = isRTL ? 'وصل مركز الفرز والعمليات' : 'Arrived at Sorting Hub';
        } else if (s.includes('depart') || desc.includes('departed') || desc.includes('in transit') || desc.includes('flight') || s === 'sh') {
            targetStatus = 'in_transit';
            badgeColor = 'badge-info text-white';
            friendlyTitle = isRTL ? 'قيد النقل الدولي' : 'In Transit / International Transit';
        } else if (s.includes('pick') || desc.includes('picked up') || desc.includes('collected') || s === 'pu') {
            targetStatus = 'picked_up';
            badgeColor = 'badge-warning text-white';
            friendlyTitle = isRTL ? 'تم استلام الشحنة' : 'Picked Up from Shipper';
        } else if (s.includes('book') || s.includes('creat') || desc.includes('created') || desc.includes('record created')) {
            targetStatus = 'booked';
            badgeColor = 'badge-ghost';
            friendlyTitle = isRTL ? 'تم إنشاء وحجز البوليصة' : 'Consignment Booked & Registered';
        }

        const dateParts = formatTimestampKuwait(evt.timestamp);
        const loc = typeof evt.location === 'object' ? (evt.location?.formattedAddress || evt.location?.city || '') : (evt.location || '');

        return {
            ...evt,
            targetStatus,
            badgeColor,
            friendlyTitle,
            isExceptionEvent,
            dateParts,
            locationText: loc,
            rawDescription: evt.description || evt.status || 'Carrier update',
            carrierSource: evt.source || shipment.carrierCode || shipment.carrier || 'Target Network'
        };
    };

    // Tab 1: Formatted Milestone Events
    const milestoneEvents = sortedHistory.map(reformatToTargetMilestone);

    // Compute effective status linking normalized milestones directly to progression and top badge
    const latestMilestone = milestoneEvents[0];
    const hasDeliveredMilestone = milestoneEvents.some(m => m.targetStatus === 'delivered');

    const getEffectiveStatus = () => {
        const rawNorm = normalizeStatus(shipment.status);
        if (rawNorm === 'cancelled') return 'cancelled';
        if (rawNorm === 'delivered' || hasDeliveredMilestone) return 'delivered';
        
        // If the LATEST milestone is an active exception
        if (latestMilestone?.isExceptionEvent || latestMilestone?.targetStatus === 'exception') {
            return 'exception';
        }

        // If the LATEST milestone is active movement, any prior hold was resolved!
        if (latestMilestone?.targetStatus && ['picked_up', 'received_at_hub', 'in_transit', 'out_for_delivery'].includes(latestMilestone.targetStatus)) {
            return latestMilestone.targetStatus;
        }

        if (latestMilestone?.targetStatus) {
            if (isStatusAhead(rawNorm, latestMilestone.targetStatus)) {
                return latestMilestone.targetStatus;
            }
        }
        return rawNorm;
    };

    const effectiveStatus = getEffectiveStatus();
    const normStatus = effectiveStatus;

    // Calculate progression percentage across standard 5 visual milestones
    let visualStep = 0;
    let progressPct = 10;
    let indicatorIcon = 'inventory_2';

    switch (effectiveStatus) {
        case 'delivered':
            visualStep = 4;
            progressPct = 100;
            indicatorIcon = 'check_circle';
            break;
        case 'out_for_delivery':
            visualStep = 3;
            progressPct = 75;
            indicatorIcon = 'local_shipping';
            break;
        case 'in_transit':
            visualStep = 2;
            progressPct = 50;
            indicatorIcon = 'flight_takeoff';
            break;
        case 'received_at_hub':
            visualStep = 2;
            progressPct = 40;
            indicatorIcon = 'warehouse';
            break;
        case 'picked_up':
        case 'ready_for_pickup':
            visualStep = 1;
            progressPct = 25;
            indicatorIcon = 'package_2';
            break;
        case 'exception':
            visualStep = 2;
            progressPct = 50;
            indicatorIcon = 'warning';
            break;
        case 'cancelled':
            visualStep = -1;
            progressPct = 100;
            indicatorIcon = 'cancel';
            break;
        default:
            visualStep = 0;
            progressPct = 10;
            indicatorIcon = 'inventory_2';
            break;
    }

    // Tab 2: Raw Telemetry Events
    const telemetryEvents = rawHistory.map((evt, idx) => {
        const dateParts = formatTimestampKuwait(evt.timestamp);
        const loc = typeof evt.location === 'object' ? (evt.location?.formattedAddress || evt.location?.city || '') : (evt.location || '—');
        return {
            idx: rawHistory.length - idx,
            timestamp: evt.timestamp,
            dateParts,
            location: loc,
            description: evt.description || (typeof evt.status === 'object' ? evt.status?.status : evt.status) || 'Scan Event',
            statusCode: evt.statusCode || evt.code || (typeof evt.status === 'string' ? evt.status.toUpperCase() : 'SCAN'),
            source: evt.source || shipment.carrierCode || 'CARRIER'
        };
    });

    // Tab 3: Comments & Operational Notes
    const commentEvents = (() => {
        const list = [];
        sortedHistory.forEach((evt) => {
            if (evt.comment || evt.notes || evt.remarks || evt.type === 'comment' || evt.type === 'note' || evt.source === 'staff') {
                list.push({
                    text: evt.comment || evt.notes || evt.remarks || evt.description,
                    author: evt.author || evt.createdBy || (evt.source === 'carrier' ? 'Carrier Operational Remark' : 'Operations Staff'),
                    timestamp: evt.timestamp,
                    source: evt.source || 'staff'
                });
            }
        });
        if (shipment.customer?.notes) {
            list.push({
                text: shipment.customer.notes,
                author: 'Customer Special Request',
                timestamp: shipment.createdAt,
                source: 'customer'
            });
        }
        if (shipment.notes) {
            list.push({
                text: shipment.notes,
                author: 'Booking Operational Notes',
                timestamp: shipment.createdAt,
                source: 'booking'
            });
        }
        return list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    })();

    // Active Triage & Health Status: check for exceptions or delivery blockers
    // An active blocker ONLY exists if the shipment is currently in an exception or the LATEST milestone is an exception
    const isTriageException = ['exception', 'failed', 'cancelled', 'returned', 'rto_in_transit'].includes(effectiveStatus)
        || latestMilestone?.isExceptionEvent
        || latestMilestone?.targetStatus === 'exception';

    const triageDetail = isTriageException
        ? ((latestMilestone?.isExceptionEvent ? latestMilestone?.rawDescription : null)
            || (effectiveStatus === 'exception' ? milestoneEvents.find(e => e.isExceptionEvent)?.rawDescription : null)
            || (isRTL ? 'حالة استثنائية تعيق التسليم — تتطلب تدخلاً تشغيلياً' : 'Active exception blocking delivery — operator intervention required'))
        : null;

    // Quick Add Note Handler
    const handleAddComment = async (e) => {
        if (e) e.preventDefault();
        const note = newCommentText.trim();
        if (!note || !shipment?.trackingNumber) return;

        setIsSubmittingComment(true);
        try {
            const newEntry = {
                status: shipment.status || 'in_transit',
                description: note,
                comment: note,
                timestamp: new Date().toISOString(),
                source: 'staff',
                author: user?.name || user?.email || 'Operations Staff'
            };

            const updatedHistory = [newEntry, ...(Array.isArray(shipment.history) ? shipment.history : [])];
            await api.put(`/shipments/${shipment.id}`, {
                history: updatedHistory
            });

            enqueueSnackbar(isRTL ? 'تمت إضافة الملاحظة التشغيلية بنجاح' : 'Operational note recorded!', { variant: 'success' });
            setNewCommentText('');
            await getShipment(shipment.trackingNumber);
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message || 'Failed to add note', { variant: 'error' });
        } finally {
            setIsSubmittingComment(false);
        }
    };

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
                                <span className="material-symbols-outlined text-xs">
                                    {copiedTracking ? 'done' : 'content_copy'}
                                </span>
                            </button>
                            <StatusBadge status={effectiveStatus} size="md" />
                            {shipment.isTest && (
                                <span className="badge badge-warning font-black text-xs">TEST</span>
                            )}
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-950 border border-blue-200">
                                <span className="material-symbols-outlined text-xs text-blue-700">local_shipping</span>
                                <span>{carrierDisplayName}</span>
                            </div>
                        </div>
                        <p className="text-xs text-base-content/60 font-semibold flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span>{getShipmentTypeLabel(shipment.shipmentType)} • {shipment.organization?.name || 'Standard Organization'}</span>
                            <span className="opacity-40">•</span>
                            <span>{isRTL ? 'تاريخ الحجز:' : 'Booked:'} {formatTimestampKuwait((() => {
                                let earliest = parseDateRobust(shipment.createdAt);
                                const rawHistory = Array.isArray(shipment.history) ? shipment.history : [];
                                for (const h of rawHistory) {
                                    if (h.timestamp) {
                                        const ht = new Date(h.timestamp);
                                        if (!Number.isNaN(ht.getTime())) {
                                            if (!earliest || ht.getTime() < earliest.getTime()) {
                                                earliest = ht;
                                            }
                                        }
                                    }
                                }
                                const rawPhenixDate = shipment.documents?.rawDate || shipment.documents?.date;
                                const phenixParsed = parseDateRobust(rawPhenixDate);
                                return (phenixParsed && (!earliest || phenixParsed < earliest)) ? phenixParsed : (earliest || phenixParsed);
                            })()).date}</span>
                            {isImported && (
                                <span className="badge badge-ghost badge-xs text-[9px] font-mono text-primary/80">PHENIX ERP</span>
                            )}
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
                            <span className="material-symbols-outlined text-xs">share</span>
                            {isRTL ? 'مشاركة الرابط' : 'Share'}
                        </button>

                        {/* Official Carrier AWB */}
                        {resolvedCarrierAwb && (
                            <button
                                type="button"
                                onClick={() => handleOpenPdf(resolvedCarrierAwb)}
                                className="btn btn-primary btn-sm rounded-xl font-extrabold gap-1 text-xs shadow-sm"
                            >
                                <span className="material-symbols-outlined text-xs">print</span>
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
                                <span className="material-symbols-outlined text-xs">receipt_long</span>
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
                                <span className="material-symbols-outlined text-xs">
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
                            <span className="material-symbols-outlined text-xs">qr_code_2</span>
                            {isRTL ? 'فاتورة / QR تارغت' : 'Invoice/QR'}
                        </button>

                        {/* Capture POD (For In Transit or Out for Delivery) */}
                        {['out_for_delivery', 'in_transit'].includes(effectiveStatus) && (
                            <button
                                type="button"
                                onClick={() => setIsPodModalOpen(true)}
                                className="btn btn-accent btn-sm rounded-xl font-extrabold gap-1 text-xs shadow-sm"
                            >
                                <span className="material-symbols-outlined text-xs">draw</span>
                                {isRTL ? 'إثبات التسليم (POD)' : 'Capture POD'}
                            </button>
                        )}

                        {/* Customer Return (If Delivered) */}
                        {effectiveStatus === 'delivered' && (
                            <button
                                type="button"
                                onClick={() => window.open(`/returns/${shipment.trackingNumber}`, '_blank')}
                                className="btn btn-outline btn-sm rounded-xl font-bold gap-1 text-xs"
                            >
                                <span className="material-symbols-outlined text-xs">assignment_return</span>
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
                                <span className="material-symbols-outlined text-xs">edit</span>
                                {isRTL ? 'تعديل البيانات' : 'Edit'}
                            </button>
                        )}

                        {/* Delete Consignment (Admin, Owner, Accounting - only before carrier is connected) */}
                        {['admin', 'manager', 'accounting'].includes(user?.role) && !hasCarrierBooking(shipment) && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="btn btn-error btn-outline btn-sm rounded-xl font-bold gap-1 text-xs"
                                title={isRTL ? 'حذف الشحنة وسجلاتها المالية' : 'Delete shipment and related financial records'}
                            >
                                <span className="material-symbols-outlined text-xs">delete</span>
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

                            <div className="flex-1 mx-2 sm:mx-4 flex flex-col items-center gap-1.5 min-w-[220px]">
                                <div className="flex items-center justify-between w-full px-1 text-xs font-black">
                                    <div className="flex items-center gap-1.5 text-primary">
                                        <span className="material-symbols-outlined text-base">flight_takeoff</span>
                                        <span>{getShipmentTypeLabel(shipment.shipmentType)}</span>
                                    </div>
                                    <span className={`badge badge-sm font-black tracking-wide ${
                                        normStatus === 'delivered'
                                            ? 'badge-success text-white shadow-sm'
                                            : (normStatus === 'cancelled' || normStatus === 'exception')
                                            ? 'badge-error text-white animate-pulse shadow-sm'
                                            : 'badge-primary text-white shadow-sm'
                                    }`}>
                                        {normStatus === 'exception'
                                            ? (isRTL ? 'تنبيه استثناء وعائق' : 'Action Required / Exception')
                                            : `${progressPct}% ${normStatus === 'delivered' ? (isRTL ? 'مكتمل' : 'Delivered') : (isRTL ? 'قيد المعالجة' : 'In Progress')}`}
                                    </span>
                                </div>
                                
                                {/* Custom Progress Track with High-Visibility Loading Bar & Live Moving Position Pin */}
                                <div className="relative w-full py-2.5">
                                    {/* High-Visibility Track Bar Background */}
                                    <div className="w-full h-4 bg-base-300 rounded-full overflow-hidden shadow-inner relative border border-base-content/10">
                                        {/* Dynamic Filled Loading Bar with Shimmer Animation */}
                                        <div 
                                            className={`h-full transition-all duration-700 ease-out rounded-full relative overflow-hidden ${
                                                normStatus === 'delivered'
                                                    ? 'bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-400 shadow-[0_0_15px_rgba(34,197,94,0.7)]'
                                                    : normStatus === 'cancelled'
                                                    ? 'bg-gradient-to-r from-red-600 via-rose-500 to-red-500'
                                                    : normStatus === 'exception'
                                                    ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-red-600 shadow-[0_0_15px_rgba(239,68,68,0.7)]'
                                                    : 'bg-gradient-to-r from-primary via-blue-500 to-indigo-500 shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                                            }`}
                                            style={{
                                                width: `${progressPct}%`,
                                                float: isRTL ? 'right' : 'left'
                                            }}
                                        >
                                            {/* Animated Loading Shimmer Stripes across the bar */}
                                            {normStatus !== 'delivered' && normStatus !== 'cancelled' && (
                                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.25)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.25)_50%,rgba(255,255,255,0.25)_75%,transparent_75%,transparent)] bg-[length:24px_24px] animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
                                            )}
                                            {/* Glossy top reflection */}
                                            <div className="absolute inset-x-0 top-0 h-1/2 bg-white/20 rounded-t-full" />
                                        </div>
                                    </div>

                                    {/* Moving Position Indicator Icon Badge */}
                                    <div 
                                        className="absolute top-1/2 transition-all duration-700 ease-out pointer-events-none z-20"
                                        style={{
                                            [isRTL ? 'right' : 'left']: `${Math.min(97, Math.max(3, progressPct))}%`,
                                            transform: isRTL ? 'translate(50%, -50%)' : 'translate(-50%, -50%)'
                                        }}
                                    >
                                        <div 
                                            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shadow-xl border-2 border-base-100 ${
                                                normStatus === 'delivered'
                                                    ? 'bg-success text-white ring-4 ring-success/30 shadow-success/40'
                                                    : (normStatus === 'cancelled' || normStatus === 'exception')
                                                    ? 'bg-error text-white ring-4 ring-error/30 shadow-error/40'
                                                    : 'bg-primary text-white ring-4 ring-primary/30 shadow-primary/40'
                                            }`}
                                            title={`${progressPct}% - ${normStatus}`}
                                        >
                                            <span className="material-symbols-outlined text-sm sm:text-base font-black">
                                                {indicatorIcon}
                                            </span>
                                        </div>
                                    </div>
                                </div>
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
                        <span className={`flex items-center gap-1 ${visualStep >= 0 ? 'text-primary font-black' : ''}`}>
                            {visualStep >= 0 && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>}
                            {isRTL ? 'تم الإنشاء' : 'Created'}
                        </span>
                        <span className={`flex items-center gap-1 ${visualStep >= 1 ? 'text-primary font-black' : ''}`}>
                            {visualStep >= 1 && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>}
                            {isRTL ? 'تم الاستلام' : 'Picked Up'}
                        </span>
                        <span className={`flex items-center gap-1 ${visualStep >= 2 ? 'text-primary font-black' : ''}`}>
                            {visualStep >= 2 && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>}
                            {isRTL ? 'نقل جوي دولي' : 'In Transit'}
                        </span>
                        <span className={`flex items-center gap-1 ${visualStep >= 3 ? 'text-primary font-black' : ''}`}>
                            {visualStep >= 3 && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>}
                            {isRTL ? 'مع المندوب' : 'Out for Delivery'}
                        </span>
                        <span className={`flex items-center gap-1 ${visualStep >= 4 ? 'text-success font-black' : ''}`}>
                            {visualStep >= 4 && <span className="w-1.5 h-1.5 rounded-full bg-success inline-block"></span>}
                            {isRTL ? 'تم التسليم' : 'Delivered'}
                        </span>
                    </div>
                </div>

            </div>

            {/* Active Triage & Operations Health Banner - Only rendered if active triage/exception exists */}
            {isTriageException && (
                <div className="card bg-error/5 border border-error/25 shadow-xs rounded-2xl p-4 sm:p-5 transition-all">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex items-center gap-3">
                            <span className="relative flex h-3 w-3 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-error"></span>
                            </span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xs sm:text-sm font-black text-error uppercase tracking-wider">
                                        {isRTL ? 'طابور التدخل والاستثناءات الفورية' : 'Active Triage & Exceptions'}
                                    </h3>
                                    <span className="badge badge-error text-white badge-xs font-black">
                                        {isRTL ? 'تنبيه استثنائي' : '1 Critical Blocker'}
                                    </span>
                                </div>
                                <p className="text-xs text-base-content/70 font-semibold mt-0.5">
                                    {isRTL ? `حالة استثنائية تعيق التسليم: ${triageDetail}` : `Critical issue blocking delivery: ${triageDetail}`}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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

                    {/* Official Carrier Documents & Customs Hub (Available for All Consignments) */}
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
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setIsUploadModalOpen(true)}
                                            className="btn btn-outline btn-xs font-bold rounded-lg gap-1"
                                        >
                                            <span className="material-symbols-outlined text-sm">upload_file</span>
                                            {isRTL ? 'رفع ملف' : 'Upload PDF'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isGeneratingCarrierDocs || isProcessing}
                                            onClick={() => handleGenerateCarrierDocs('awb')}
                                            className="btn btn-primary btn-xs font-bold rounded-lg gap-1"
                                        >
                                            <span className="material-symbols-outlined text-sm">
                                                {isGeneratingCarrierDocs ? 'hourglass_top' : (!resolvedCarrierAwb ? 'bolt' : 'sync')}
                                            </span>
                                            {isGeneratingCarrierDocs 
                                                ? (isRTL ? 'جاري التوليد...' : 'Generating...') 
                                                : (!resolvedCarrierAwb ? (isRTL ? 'توليد الوثائق' : 'Generate Docs') : (isRTL ? 'تحديث الوثائق' : 'Sync Docs'))}
                                        </button>
                                    </>
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
                                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border shadow-2xs ${
                                             resolvedCarrierAwb ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-amber-100 text-amber-950 border-amber-300'
                                         }`}>
                                             {resolvedCarrierAwb ? 'READY' : 'PENDING'}
                                         </span>
                                     </div>
                                     <h4 className="font-extrabold text-xs text-base-content">
                                         {carrierDisplayName} Air Waybill (AWB)
                                     </h4>
                                     <p className="text-[11px] text-base-content/60">
                                         {isRTL ? 'بوليصة الشحن الجوي الرسمية' : 'Official barcoded consignment label'}
                                     </p>
                                 </div>
                                 {resolvedCarrierAwb ? (
                                     <button onClick={() => handleOpenPdf(resolvedCarrierAwb)} className="btn btn-primary btn-xs font-bold rounded-lg w-full gap-1">
                                         <span className="material-symbols-outlined text-[12px]">print</span>
                                         {isRTL ? 'طباعة البوليصة' : 'Print AWB'}
                                     </button>
                                 ) : isStaff ? (
                                     <button onClick={() => handleGenerateCarrierDocs('awb')} disabled={isGeneratingCarrierDocs} className="btn btn-primary btn-xs font-bold rounded-lg w-full gap-1">
                                         <span className="material-symbols-outlined text-[12px]">bolt</span>
                                         {isRTL ? 'توليد البوليصة' : 'Generate AWB'}
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
                                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border shadow-2xs ${
                                             resolvedCarrierInvoice ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-amber-100 text-amber-950 border-amber-300'
                                         }`}>
                                             {resolvedCarrierInvoice ? 'READY' : 'PENDING'}
                                         </span>
                                     </div>
                                     <h4 className="font-extrabold text-xs text-base-content">
                                         {carrierDisplayName} Customs Invoice
                                     </h4>
                                     <p className="text-[11px] text-base-content/60">
                                         {isRTL ? 'الفاتورة والبيان الجمركي المعتمد' : 'Itemized customs export declaration'}
                                     </p>
                                 </div>
                                 {resolvedCarrierInvoice ? (
                                     <button onClick={() => handleOpenPdf(resolvedCarrierInvoice)} className="btn btn-outline btn-xs font-bold rounded-lg w-full gap-1">
                                         <span className="material-symbols-outlined text-[12px]">print</span>
                                         {isRTL ? 'طباعة الفاتورة' : 'Print Invoice'}
                                     </button>
                                 ) : isStaff ? (
                                     <button onClick={() => handleGenerateCarrierDocs('invoice')} disabled={isGeneratingCarrierDocs} className="btn btn-outline btn-xs font-bold rounded-lg w-full gap-1">
                                         <span className="material-symbols-outlined text-[12px]">bolt</span>
                                         {isRTL ? 'توليد الفاتورة' : 'Generate Invoice'}
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
                                         <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase bg-slate-100 text-slate-900 border border-slate-300 shadow-2xs">
                                             SYSTEM
                                         </span>
                                     </div>
                                     <h4 className="font-extrabold text-xs text-base-content">
                                         {isRTL ? 'منافست الفرز وباركود المخزن' : 'Target Hub Invoice & QR'}
                                     </h4>
                                     <p className="text-[11px] text-base-content/60">
                                         {isRTL ? 'تسليم مركز العمليات ومسح المخازن' : 'Hub handover & warehouse scan sheet'}
                                     </p>
                                 </div>
                                 <button onClick={handleGenerateInvoiceQR} className="btn btn-outline btn-xs font-bold rounded-lg w-full gap-1">
                                     <span className="material-symbols-outlined text-[12px]">print</span>
                                     {isRTL ? 'طباعة المنافست' : 'Print Document'}
                                 </button>
                             </div>

                        </div>

                        {/* Extra Uploaded Documents List */}
                        {rawDocuments.filter(d => typeof d === 'object' && d?.url && d.type !== 'label' && d.type !== 'invoice' && d.type !== 'awb').length > 0 && (
                            <div className="pt-2 border-t border-base-200/60">
                                <h5 className="text-[11px] font-bold text-base-content/60 uppercase tracking-wider mb-2">
                                    {isRTL ? 'المستندات والملفات الإضافية المرفقة' : 'Additional Attached Documents'}
                                </h5>
                                <div className="flex flex-wrap gap-2">
                                    {rawDocuments.filter(d => typeof d === 'object' && d?.url && d.type !== 'label' && d.type !== 'invoice' && d.type !== 'awb').map((doc, idx) => (
                                        <div key={idx} className="flex items-center gap-2 bg-base-200/50 border border-base-200 rounded-lg px-2.5 py-1 text-xs">
                                            <span className="material-symbols-outlined text-sm text-primary">attach_file</span>
                                            <span className="font-bold">{doc.filename || doc.type || `Document #${idx + 1}`}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenPdf(doc.url)}
                                                className="btn btn-ghost btn-xs text-primary font-bold p-0.5"
                                            >
                                                <span className="material-symbols-outlined text-xs">visibility</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Compact Location Pin & Customer Return Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* 1. Pin GPS Delivery Location */}
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                            <div>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-base">pin_drop</span>
                                        </div>
                                        <div>
                                            <h4 className="font-extrabold text-xs text-base-content leading-tight">
                                                {isRTL ? 'تثبيت الموقع الجغرافي (GPS)' : 'Pin Delivery GPS Location'}
                                            </h4>
                                            <p className="text-[11px] text-base-content/60 mt-0.5 line-clamp-1">
                                                {isRTL ? 'مساعدة المندوب بالإحداثيات ورقم الآلي' : 'Courier delivery address & PACI pin'}
                                            </p>
                                        </div>
                                    </div>
                                    {receiver.city && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                            {receiver.city}, {receiver.countryCode || 'KW'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="pt-2 border-t border-base-200 flex items-center justify-between gap-1.5 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => window.open(`/track/${shipment.trackingNumber}/location`, '_blank')}
                                    className="btn btn-xs btn-outline btn-primary font-bold gap-1"
                                >
                                    <span className="material-symbols-outlined text-[11px]">map</span>
                                    <span>{isRTL ? 'فتح موقع GPS' : 'Open Location Pin'}</span>
                                </button>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={handleShareLocationWithCarrier}
                                        className="btn btn-xs bg-[#25D366] text-white hover:bg-[#1ebc57] border-none font-bold gap-1 shadow-xs"
                                        title={isRTL ? 'مشاركة الموقع مع السائق عبر واتساب' : 'Share Location Link with Courier Driver'}
                                    >
                                        <span className="material-symbols-outlined text-[11px]">share</span>
                                        <span>{isRTL ? 'مشاركة' : 'Share'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCopyLocationLink}
                                        className="btn btn-xs btn-ghost border border-base-300 font-bold gap-1"
                                        title={isRTL ? 'نسخ رابط الموقع' : 'Copy Location Link'}
                                    >
                                        <span className="material-symbols-outlined text-[11px]">content_copy</span>
                                        <span>{isRTL ? 'نسخ' : 'Copy'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 2. Customer Return & Paperwork */}
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                            <div>
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-base">assignment_return</span>
                                        </div>
                                        <div>
                                            <h4 className="font-extrabold text-xs text-base-content leading-tight">
                                                {isRTL ? 'بوابة المرتجعات والمستندات' : 'Customer Return & Paperwork'}
                                            </h4>
                                            <p className="text-[11px] text-base-content/60 mt-0.5 line-clamp-1">
                                                {isRTL ? 'إصدار بوليصة الإرجاع خلال 14 يوماً' : 'Initiate 14-day reverse parcel returns'}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                        {shipment.carrierCode || shipment.carrier || 'Target'}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-base-200 flex items-center justify-between gap-1.5 flex-wrap">
                                <div className="flex items-center gap-1">
                                    {resolvedCarrierAwb ? (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenPdf(resolvedCarrierAwb)}
                                            className="btn btn-xs btn-ghost border border-base-300 text-xs font-bold gap-1"
                                        >
                                            <span className="material-symbols-outlined text-[11px]">print</span>
                                            <span>{isRTL ? 'البوليصة' : 'AWB'}</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleGenerateInvoiceQR}
                                            className="btn btn-xs btn-ghost border border-base-300 text-xs font-bold gap-1"
                                        >
                                            <span className="material-symbols-outlined text-[11px]">description</span>
                                            <span>{isRTL ? 'فاتورة' : 'QR'}</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => window.open(`/returns/${shipment.trackingNumber}`, '_blank')}
                                        className="btn btn-xs btn-outline btn-secondary text-xs font-bold gap-1"
                                    >
                                        <span className="material-symbols-outlined text-[11px]">assignment_return</span>
                                        <span>{isRTL ? 'المرتجع' : 'Check Return'}</span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={handleShareReturnWithCarrier}
                                        className="btn btn-xs bg-[#25D366] text-white hover:bg-[#1ebc57] border-none font-bold gap-1 shadow-xs"
                                        title={isRTL ? 'مشاركة رابط المرتجع والمستندات عبر واتساب' : 'Share Return Portal with Shipper/Carrier'}
                                    >
                                        <span className="material-symbols-outlined text-[11px]">share</span>
                                        <span>{isRTL ? 'مشاركة' : 'Share'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCopyReturnLink}
                                        className="btn btn-xs btn-ghost border border-base-300 text-xs font-bold gap-1"
                                        title={isRTL ? 'نسخ رابط بوابة المرتجعات' : 'Copy Returns Link'}
                                    >
                                        <span className="material-symbols-outlined text-[11px]">content_copy</span>
                                        <span>{isRTL ? 'نسخ' : 'Copy'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Milestone History, Telemetry & Operational Comments Tabs */}
                    <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl overflow-hidden space-y-0">
                        {/* Tabs Header */}
                        <div className="border-b border-base-200 px-4 sm:px-6 pt-4 bg-base-200/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div role="tablist" className="tabs tabs-bordered">
                                <button
                                    role="tab"
                                    type="button"
                                    onClick={() => setHistoryTab('milestones')}
                                    className={`tab tab-bordered font-black text-xs sm:text-sm gap-1.5 pb-3 ${
                                        historyTab === 'milestones' ? 'tab-active text-primary border-primary' : 'text-base-content/60'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-base">timeline</span>
                                    <span>{isRTL ? 'المحطات والأحداث' : 'Milestones Timeline'}</span>
                                    <span className="badge badge-xs badge-primary font-mono">{milestoneEvents.length}</span>
                                </button>
                                <button
                                    role="tab"
                                    type="button"
                                    onClick={() => setHistoryTab('telemetry')}
                                    className={`tab tab-bordered font-black text-xs sm:text-sm gap-1.5 pb-3 ${
                                        historyTab === 'telemetry' ? 'tab-active text-primary border-primary' : 'text-base-content/60'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-base">receipt_long</span>
                                    <span>{isRTL ? 'سجل مسح الناقل' : 'Carrier Telemetry'}</span>
                                    <span className="badge badge-xs badge-neutral font-mono">{telemetryEvents.length}</span>
                                </button>
                                <button
                                    role="tab"
                                    type="button"
                                    onClick={() => setHistoryTab('comments')}
                                    className={`tab tab-bordered font-black text-xs sm:text-sm gap-1.5 pb-3 ${
                                        historyTab === 'comments' ? 'tab-active text-primary border-primary' : 'text-base-content/60'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-base">chat</span>
                                    <span>{isRTL ? 'الملاحظات والتعليقات' : 'Comments & Notes'}</span>
                                    <span className="badge badge-xs badge-secondary font-mono">{commentEvents.length}</span>
                                </button>
                            </div>

                            {canEdit && (
                                <button
                                    onClick={() => handleOpenEdit('status')}
                                    className="btn btn-primary btn-outline btn-xs font-bold rounded-lg gap-1 mb-2 sm:mb-0"
                                >
                                    <span className="material-symbols-outlined text-xs">add_task</span>
                                    {isRTL ? 'إضافة محطة / تحديث الحالة' : 'Advance Milestone'}
                                </button>
                            )}
                        </div>

                        {/* Tab 1 Content: Milestones Timeline */}
                        {historyTab === 'milestones' && (
                            <div className="p-4 sm:p-6 space-y-4">
                                {milestoneEvents.length === 0 ? (
                                    <div className="text-center py-8 text-base-content/60 font-semibold text-xs">
                                        {isRTL ? 'لا توجد محطات تتبع مسجلة حتى الآن.' : 'No checkpoint milestones recorded yet.'}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {milestoneEvents.map((event, idx) => {
                                            const isLatest = idx === 0;
                                            const prevEvent = idx > 0 ? milestoneEvents[idx - 1] : null;
                                            const isNewDay = !prevEvent || prevEvent.dateParts?.dayKey !== event.dateParts?.dayKey;

                                            return (
                                                <React.Fragment key={idx}>
                                                    {/* Date Group Header */}
                                                    {isNewDay && (
                                                        <div className="flex items-center gap-2 pt-2 pb-1">
                                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-base-200/80 border border-base-300/60 rounded-lg text-xs font-bold text-base-content">
                                                                <span className="material-symbols-outlined text-xs text-primary">calendar_month</span>
                                                                <span>{event.dateParts.dayHeader}</span>
                                                            </div>
                                                            <div className="flex-1 h-px bg-base-300/60" />
                                                        </div>
                                                    )}

                                                    <ul className="timeline timeline-vertical timeline-compact text-xs !m-0 !p-0">
                                                        <li>
                                                            {idx > 0 && !isNewDay && <hr className={isLatest ? 'bg-primary' : 'bg-base-300'} />}
                                                            <div className={`timeline-middle ${isLatest ? 'text-primary' : 'text-base-content/50'}`}>
                                                                <span className="material-symbols-outlined text-base">
                                                                    {isLatest ? 'check_circle' : 'circle'}
                                                                </span>
                                                            </div>
                                                            <div className="timeline-end timeline-box py-3 px-4 border-base-200 bg-base-100 shadow-xs rounded-xl space-y-1.5 w-full max-w-3xl mb-1">
                                                                <div className="flex flex-wrap justify-between items-baseline gap-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`badge badge-xs font-black ${event.badgeColor}`}>
                                                                            {event.friendlyTitle}
                                                                        </span>
                                                                        <span className="font-extrabold text-xs text-base-content">
                                                                            {event.rawDescription}
                                                                        </span>
                                                                    </div>
                                                                    <span className="font-mono text-[10.5px] text-base-content/50">
                                                                        {event.dateParts.time}
                                                                    </span>
                                                                </div>

                                                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-base-content/70">
                                                                    {event.locationText && (
                                                                        <div className="flex items-center gap-1 font-medium">
                                                                            <span className="material-symbols-outlined text-xs text-primary">pin_drop</span>
                                                                            <span>{event.locationText}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex items-center gap-1 font-mono text-[10px] text-base-content/50">
                                                                        <span className="badge badge-ghost badge-xs text-[10px]">
                                                                            {event.carrierSource}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {event.pod && (
                                                                    <div className="p-2.5 bg-success/10 border border-success/30 rounded-lg text-success-content text-[11px] space-y-1 mt-1">
                                                                        <div className="font-black text-success flex items-center gap-1">
                                                                            <span className="material-symbols-outlined text-sm">verified</span>
                                                                            <span>{isRTL ? 'تم تسجيل إثبات التسليم (POD)' : 'Proof of Delivery Recorded'}</span>
                                                                        </div>
                                                                        <div>{isRTL ? 'المستلم:' : 'Received by:'} <strong>{event.pod.recipientName}</strong> ({event.pod.recipientRelationship || 'Consignee'})</div>
                                                                        {event.pod.signatureDataUrl && (
                                                                            <img src={event.pod.signatureDataUrl} alt="Signature" className="h-8 max-w-[120px] object-contain bg-white rounded border border-success/20 p-0.5 mt-1" />
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {idx < milestoneEvents.length - 1 && milestoneEvents[idx + 1]?.dateParts?.dayKey === event.dateParts?.dayKey && (
                                                                <hr className="bg-base-300" />
                                                            )}
                                                        </li>
                                                    </ul>
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab 2 Content: Carrier Telemetry (Raw Scan Stream) */}
                        {historyTab === 'telemetry' && (
                            <div className="p-4 sm:p-6 space-y-4">
                                <div className="flex justify-between items-center text-xs text-base-content/60">
                                    <span className="font-semibold">{isRTL ? 'بيانات المسح الخام الواردة مباشرة من شبكة الناقل' : 'Live scan telemetry recorded directly from carrier network'}</span>
                                    <span className="font-mono text-[11px]">AWB: <strong>{shipment.dhlTrackingNumber || shipment.carrierShipmentId || shipment.trackingNumber}</strong></span>
                                </div>

                                {telemetryEvents.length === 0 ? (
                                    <div className="text-center py-8 text-base-content/60 font-semibold text-xs">
                                        {isRTL ? 'لا توجد بيانات مسح خام واردة من الناقل حتى الآن.' : 'No raw telemetry events recorded yet.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto border border-base-200 rounded-xl">
                                        <table className="table table-zebra table-xs w-full">
                                            <thead className="bg-base-200/60 text-base-content/70">
                                                <tr>
                                                    <th className="w-12">#</th>
                                                    <th>{isRTL ? 'الوقت والتاريخ' : 'Timestamp (Kuwait)'}</th>
                                                    <th>{isRTL ? 'كود الحالة' : 'Code'}</th>
                                                    <th>{isRTL ? 'وصف المسح الأصلي' : 'Raw Event Description'}</th>
                                                    <th>{isRTL ? 'الموقع / المحطة' : 'Facility Location'}</th>
                                                    <th>{isRTL ? 'المصدر' : 'Source'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono text-xs">
                                                {telemetryEvents.map((tEvt, tIdx) => {
                                                    const prevEvt = tIdx > 0 ? telemetryEvents[tIdx - 1] : null;
                                                    const isNewDay = !prevEvt || prevEvt.dateParts?.dayKey !== tEvt.dateParts?.dayKey;

                                                    return (
                                                        <React.Fragment key={tEvt.idx}>
                                                            {isNewDay && (
                                                                <tr className="bg-base-200/90 font-sans font-bold text-[11px] text-base-content border-t-2 border-base-300">
                                                                    <td colSpan={6} className="py-1.5 px-3">
                                                                        <div className="flex items-center gap-1.5 text-primary">
                                                                            <span className="material-symbols-outlined text-xs">calendar_month</span>
                                                                            <span>{tEvt.dateParts.dayHeader}</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            <tr className="hover">
                                                                <td className="text-base-content/40">{tEvt.idx}</td>
                                                                <td className="whitespace-nowrap font-bold text-base-content">{tEvt.dateParts.time}</td>
                                                                <td>
                                                                    <span className="badge badge-xs badge-neutral font-bold">{tEvt.statusCode}</span>
                                                                </td>
                                                                <td className="font-sans font-medium text-base-content">{tEvt.description}</td>
                                                                <td className="whitespace-nowrap">{tEvt.location}</td>
                                                                <td>
                                                                    <span className="badge badge-xs badge-ghost text-[10px] uppercase">{tEvt.source}</span>
                                                                </td>
                                                            </tr>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab 3 Content: Comments & Operational Notes */}
                        {historyTab === 'comments' && (
                            <div className="p-4 sm:p-6 space-y-5">
                                {/* Quick Add Note Form */}
                                {canEdit && (
                                    <form onSubmit={handleAddComment} className="p-3.5 bg-base-200/40 rounded-xl border border-base-200 space-y-2">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                                            <span className="material-symbols-outlined text-sm text-primary">edit_note</span>
                                            <span>{isRTL ? 'إضافة ملاحظة أو تعليق تشغيلي' : 'Add Consignment Comment / Operational Note'}</span>
                                        </div>
                                        <textarea
                                            rows={2}
                                            value={newCommentText}
                                            onChange={(e) => setNewCommentText(e.target.value)}
                                            placeholder={isRTL ? 'اكتب ملاحظة تشغيلية (مثال: تم التنسيق مع العميل للاستلام بعد الساعة 4 مساءً)...' : 'Write an operational comment (e.g. Consignee requested delivery after 4 PM, customs duty collected)...'}
                                            className="textarea textarea-bordered textarea-sm w-full text-xs font-normal bg-base-100"
                                            disabled={isSubmittingComment}
                                        />
                                        <div className="flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={isSubmittingComment || !newCommentText.trim()}
                                                className="btn btn-primary btn-xs font-bold rounded-lg gap-1"
                                            >
                                                <span className="material-symbols-outlined text-xs">send</span>
                                                <span>{isSubmittingComment ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'إضافة الملاحظة' : 'Post Note')}</span>
                                            </button>
                                        </div>
                                    </form>
                                )}

                                {/* Existing Notes Stream */}
                                {commentEvents.length === 0 ? (
                                    <div className="text-center py-8 text-base-content/60 font-semibold text-xs">
                                        {isRTL ? 'لا توجد ملاحظات أو تعليقات مسجلة لهذه الشحنة.' : 'No comments or operational notes recorded for this consignment.'}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {commentEvents.map((cEvt, idx) => {
                                            const { date, time } = formatTimestampKuwait(cEvt.timestamp);
                                            return (
                                                <div key={idx} className="p-3 bg-base-100 border border-base-200 rounded-xl shadow-xs space-y-1">
                                                    <div className="flex justify-between items-baseline gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-extrabold text-xs text-primary">{cEvt.author}</span>
                                                            <span className="badge badge-xs badge-ghost text-[10px]">{cEvt.source}</span>
                                                        </div>
                                                        <span className="font-mono text-[10.5px] text-base-content/50">{date} • {time}</span>
                                                    </div>
                                                    <p className="text-xs text-base-content font-medium whitespace-pre-wrap">{cEvt.text}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
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
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border shadow-2xs ${
                                isPaid ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-rose-100 text-rose-950 border-rose-300'
                            }`}>
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
                                    <span className="material-symbols-outlined text-[13px]">chat</span>
                                    {sendingPaymentLink ? 'Dispatching...' : (isRTL ? 'إرسال رابط الدفع واتساب' : 'Send WhatsApp Payment Link')}
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCopyPaymentLink}
                                        className="btn btn-outline btn-xs rounded-lg font-bold flex-1 gap-1"
                                    >
                                        <span className="material-symbols-outlined text-[11px]">content_copy</span>
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
                        <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-xl p-3 sm:p-3.5 space-y-3">
                            <div className="flex justify-between items-center border-b border-base-200 pb-2">
                                <div className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-success text-sm">chat</span>
                                    <h3 className="text-xs font-black text-base-content">
                                        {isRTL ? 'سجل إشعارات واتساب' : 'WhatsApp Dispatch Tracker'}
                                    </h3>
                                </div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                                    {(shipment.notificationLogs || []).length} logs
                                </span>
                            </div>

                            <div className="space-y-3">
                                {[
                                    { key: 'sender', label: isRTL ? 'إشعار الراسل' : 'Sender Notification' },
                                    { key: 'receiver', label: isRTL ? 'إشعار المستلم' : 'Receiver Notification' }
                                ].map((role) => {
                                    const isSenderRole = role.key === 'sender';
                                    const roleAliases = isSenderRole ? ['sender', 'shipper', 'merchant'] : ['receiver', 'consignee', 'customer'];
                                    const roleLogs = (shipment.notificationLogs || []).filter(l => 
                                        roleAliases.includes((l.recipientRole || '').toLowerCase())
                                    );
                                    const latestLog = roleLogs[0] || null;
                                    const logStatus = (latestLog?.status || '').toUpperCase();
                                    const isSent = ['SENT', 'DELIVERED', 'READ'].includes(logStatus);
                                    const isFailed = logStatus === 'FAILED';
                                    const phone = latestLog?.recipientPhone || (isSenderRole ? sender.phone : receiver.phone) || '';
                                    const sentDate = latestLog?.sentAt ? new Date(latestLog.sentAt).toLocaleDateString() : '';

                                    return (
                                        <div key={role.key} className="p-2.5 bg-base-200/40 border border-base-200 rounded-xl space-y-1.5 text-xs">
                                            {/* Line 1: Role Title & optional Send button when not sent */}
                                            <div className="flex justify-between items-center gap-2">
                                                <span className="font-extrabold text-xs text-base-content">{role.label}</span>
                                                {!isSent ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSendWhatsAppRole(role.key)}
                                                        disabled={sendingWhatsAppRole === role.key}
                                                        className={`btn btn-xs h-6 min-h-6 text-[10.5px] px-2 rounded-lg font-bold gap-1 ${
                                                            isFailed 
                                                                ? 'btn-outline btn-error' 
                                                                : 'btn-outline btn-success'
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined text-[11px]">
                                                            {isFailed ? 'replay' : 'send'}
                                                        </span>
                                                        <span>
                                                            {sendingWhatsAppRole === role.key 
                                                                ? (isRTL ? 'إرسال...' : 'Sending...') 
                                                                : isFailed 
                                                                    ? (isRTL ? 'إعادة' : 'Retry') 
                                                                    : (isRTL ? 'إرسال' : 'Send')}
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <Link
                                                        to={`/admin/whatsapp-logs?search=${shipment.trackingNumber}`}
                                                        className="btn btn-ghost btn-xs h-6 min-h-6 text-[10.5px] px-2 rounded-lg font-bold gap-1 text-primary hover:bg-primary/10 border border-primary/20"
                                                        title={isRTL ? 'عرض سجلات واتساب' : 'View WhatsApp logs'}
                                                    >
                                                        <span className="material-symbols-outlined text-[11px]">history</span>
                                                        <span>{isRTL ? 'السجلات' : 'Logs'}</span>
                                                    </Link>
                                                )}
                                            </div>

                                            {/* Line 2: Status Badge (Larger to fit font, high contrast) */}
                                            <div>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black tracking-wider uppercase border shadow-2xs ${
                                                    isSent 
                                                        ? 'bg-emerald-100 text-emerald-950 border-emerald-300' 
                                                        : isFailed 
                                                            ? 'bg-rose-100 text-rose-950 border-rose-300' 
                                                            : 'bg-slate-100 text-slate-800 border-slate-300'
                                                }`}>
                                                    {latestLog ? logStatus : (isRTL ? 'لم يُرسل' : 'NOT SENT')}
                                                </span>
                                            </div>

                                            {/* Line 3: Phone • Date */}
                                            <div className="text-xs font-mono font-bold text-base-content/80">
                                                <span>{phone || (isRTL ? 'لا يوجد هاتف مسجل' : 'No phone')}</span>
                                                {sentDate && (
                                                    <span className="ms-1 font-semibold text-base-content/60">• {sentDate}</span>
                                                )}
                                            </div>

                                            {isFailed && latestLog?.errorMessage && (
                                                <div className="text-[10px] text-rose-950 bg-rose-50 border border-rose-200 p-1.5 rounded-lg flex items-center gap-1 font-medium">
                                                    <span className="material-symbols-outlined text-xs shrink-0 text-rose-700">error</span>
                                                    <span className="truncate">{latestLog.errorMessage}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Detailed Dispatch Attempts & History Audit List (Shown if sent / logs exist) */}
                            {Array.isArray(shipment.notificationLogs) && shipment.notificationLogs.length > 0 ? (
                                <div className="pt-2 border-t border-base-200/80 space-y-1.5">
                                    <div className="flex justify-between items-center text-[10px] font-black text-base-content/70 uppercase">
                                        <span>{isRTL ? 'سجل المحاولات' : 'Dispatch History'}</span>
                                        <Link to={`/admin/whatsapp-logs?search=${shipment.trackingNumber}`} className="text-primary hover:underline font-bold text-[10px]">
                                            {isRTL ? 'سجلات النظام ↗' : 'System Logs ↗'}
                                        </Link>
                                    </div>
                                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                                        {shipment.notificationLogs.map((log) => {
                                            const s = (log.status || '').toUpperCase();
                                            const badgeStyle = s === 'DELIVERED' || s === 'READ' || s === 'SENT'
                                                ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                                                : s === 'FAILED'
                                                    ? 'bg-rose-100 text-rose-950 border border-rose-300'
                                                    : 'bg-slate-100 text-slate-900 border border-slate-300';
                                            const roleName = ['receiver', 'consignee', 'customer'].includes((log.recipientRole || '').toLowerCase())
                                                ? (isRTL ? 'المستلم' : 'Receiver')
                                                : (isRTL ? 'الراسل' : 'Sender');

                                            return (
                                                <div key={log.id} className="p-1.5 bg-base-200/40 rounded-lg text-[10.5px] border border-base-200/70 flex justify-between items-center gap-1">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="font-bold text-base-content shrink-0">{roleName}:</span>
                                                        <span className="font-mono text-base-content/70 truncate">{log.recipientPhone || 'N/A'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="font-mono text-base-content/50 text-[9.5px]">
                                                            {log.sentAt || log.createdAt ? new Date(log.sentAt || log.createdAt).toLocaleDateString() : ''}
                                                        </span>
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-black uppercase ${badgeStyle}`}>
                                                            {s || 'QUEUED'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-1.5 text-[10px] text-base-content/50 italic border-t border-base-200/60">
                                    {isRTL ? 'لا توجد محاولات إرسال مسجلة' : 'No previous dispatch attempts recorded'}
                                </div>
                            )}
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

            {/* Upload Document Modal */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="bg-base-100 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-base-200 space-y-4">
                        <div className="flex justify-between items-center border-b border-base-200 pb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-xl">upload_file</span>
                                <h3 className="font-extrabold text-base text-base-content">
                                    {isRTL ? 'إرفاق ورفع مستند للشحنة' : 'Upload Consignment Document'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsUploadModalOpen(false); setUploadFile(null); }}
                                className="btn btn-ghost btn-xs btn-square rounded-full"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleUploadDocument} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-base-content/70">
                                    {isRTL ? 'نوع المستند' : 'Document Classification'}
                                </label>
                                <select
                                    value={uploadDocType}
                                    onChange={(e) => setUploadDocType(e.target.value)}
                                    className="select select-bordered select-sm w-full rounded-xl text-xs"
                                >
                                    <option value="awb">{isRTL ? 'بوليصة شحن جوي (AWB / Shipping Label)' : 'Air Waybill (AWB / Shipping Label)'}</option>
                                    <option value="invoice">{isRTL ? 'فاتورة جمركية (Customs / Commercial Invoice)' : 'Customs / Commercial Invoice'}</option>
                                    <option value="pod">{isRTL ? 'إثبات تسليم (Proof of Delivery - POD)' : 'Proof of Delivery (POD)'}</option>
                                    <option value="customs_declaration">{isRTL ? 'بيان جمركي وتخليص' : 'Customs Declaration / Clearance'}</option>
                                    <option value="other">{isRTL ? 'مستند إضافي / شهادة' : 'Other Document / Certificate'}</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-base-content/70">
                                    {isRTL ? 'ملف المستند (PDF)' : 'Document File (PDF)'}
                                </label>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                                    className="file-input file-input-bordered file-input-primary file-input-sm w-full rounded-xl text-xs"
                                    required
                                />
                                {uploadFile && (
                                    <p className="text-[11px] font-mono text-base-content/60 pt-1">
                                        {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                                    </p>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-2 border-t border-base-200">
                                <button
                                    type="button"
                                    onClick={() => { setIsUploadModalOpen(false); setUploadFile(null); }}
                                    className="btn btn-ghost btn-sm rounded-xl font-bold"
                                    disabled={isUploadingDoc}
                                >
                                    {isRTL ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isUploadingDoc || !uploadFile}
                                    className="btn btn-primary btn-sm rounded-xl font-bold gap-1"
                                >
                                    {isUploadingDoc && <span className="loading loading-spinner loading-xs"></span>}
                                    <span className="material-symbols-outlined text-sm">cloud_upload</span>
                                    {isRTL ? 'رفع وحفظ' : 'Upload & Attach'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
