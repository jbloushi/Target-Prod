import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useShipment } from '../../context/ShipmentContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { financeService, shipmentService, whatsappService } from '../../services/api';
import api, { BACKEND_URL } from '../../services/api';
import { CAPABILITIES, hasCapability, isPlatformRole } from '../../utils/capabilities';
import { canDeleteShipmentStatus, getShipmentDeleteErrorMessage } from '../../utils/shipmentDeletionPolicy';
import { getCarrierDisplayName } from '../../utils/shipmentDisplay';
import { generateWaybillPDF } from '../../utils/pdfGenerator';
import { normalizeStatus, getStepIndex, isNegativeOrExceptionPhrase } from '../../constants/statusConfig';
import StatusBadge from '../../components/common/StatusBadge';
import TradeRouteDisplay from '../../components/common/TradeRouteDisplay';
import ProofOfDeliveryModal from '../../components/ProofOfDeliveryModal';
import NativeChatDrawer from '../../components/support/NativeChatDrawer';
import ManualPaymentLinkModal from '../../components/shipments/ManualPaymentLinkModal';
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import ShipmentTimelineTabsV2 from './shipment-details/ShipmentTimelineTabsV2';
import ShipmentSidebarV2 from './shipment-details/ShipmentSidebarV2';

const formatWhatsAppDigits = (rawPhone) => {
    const digits = String(rawPhone || '').replace(/\D/g, '').replace(/^00/, '');
    if (!digits) return '';
    if (digits.length === 8) return `965${digits}`;
    return digits;
};

export const ShipmentDetailsV2Page = () => {
    const { trackingNumber } = useParams();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { lang } = useLanguage();
    const isRTL = lang === 'ar';
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const { shipment, loading, error, getShipment } = useShipment();
    const approvalHandledRef = useRef(false);

    // Strict RBAC & Capability Gating
    const isPlatformOps = Boolean(user && isPlatformRole(user.role));
    const canViewCost = Boolean(user && hasCapability(user.role, CAPABILITIES.VIEW_COST_DATA));
    const canBookCarriers = Boolean(user && hasCapability(user.role, CAPABILITIES.BOOK_CARRIERS));
    const canApproveShipments = Boolean(user && hasCapability(user.role, CAPABILITIES.APPROVE_SHIPMENTS));
    const canManageCheckpoints = Boolean(user && hasCapability(user.role, CAPABILITIES.MANAGE_SHIPMENT_CHECKPOINTS));
    const canDelete = canDeleteShipmentStatus(shipment?.status, shipment, user?.role);
    const canEdit = isPlatformOps || shipment?.status === 'draft';

    // State
    const [accounting, setAccounting] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSyncingCarrier, setIsSyncingCarrier] = useState(false);
    const [isGeneratingDocs, setIsGeneratingDocs] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [uploadDocType, setUploadDocType] = useState('awb');
    const [uploadFile, setUploadFile] = useState(null);
    const [isUploadingDoc, setIsUploadingDoc] = useState(false);
    const [isPodModalOpen, setIsPodModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [chatwootDrawerOpen, setChatwootDrawerOpen] = useState(false);
    const [chatwootDrawerTarget, setChatwootDrawerTarget] = useState(null);
    const [conversionDrawerOpen, setConversionDrawerOpen] = useState(false);
    const [conversionCarrierCode, setConversionCarrierCode] = useState('DGR');
    const [conversionServiceCode, setConversionServiceCode] = useState('P');
    const [conversionTargetCarriers, setConversionTargetCarriers] = useState([]);
    const [sendingWhatsAppRole, setSendingWhatsAppRole] = useState(null);
    const [resendingUpdate, setResendingUpdate] = useState(false);
    const [sendingLocationReq, setSendingLocationReq] = useState(false);
    const [startingEngagement, setStartingEngagement] = useState(false);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [statusUpdating, setStatusUpdating] = useState(false);

    const loadShipmentData = useCallback(async () => {
        if (!trackingNumber) return;
        await getShipment(trackingNumber);
    }, [getShipment, trackingNumber]);

    const handleOpenEdit = useCallback(() => {
        if (!trackingNumber) return;
        navigate(`/shipment-v2/${trackingNumber}/edit`);
    }, [navigate, trackingNumber]);

    useEffect(() => {
        loadShipmentData();
    }, [loadShipmentData]);

    // Auto-refresh active shipments every 2 minutes + on tab focus
    useEffect(() => {
        if (!trackingNumber) return undefined;
        const TERMINAL = ['delivered', 'cancelled', 'returned', 'rejected'];
        const pollId = setInterval(() => {
            const st = shipment?.status?.toLowerCase();
            if (st && TERMINAL.includes(st)) return;
            getShipment(trackingNumber).catch((err) => {
                console.warn('ShipmentV2 background poll failed:', err);
            });
        }, 120000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                getShipment(trackingNumber).catch((err) => {
                    console.warn('ShipmentV2 visibility refresh failed:', err);
                });
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(pollId);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [trackingNumber, shipment?.status, getShipment]);

    // Handle ?action=approve, /edit suffix, and #invoice hash
    useEffect(() => {
        if (!shipment) return;
        if (location.pathname.endsWith('/edit') && canEdit && !approvalHandledRef.current) {
            approvalHandledRef.current = true;
            handleOpenEdit();
        } else if (searchParams.get('action') === 'approve' && isPlatformOps && canApproveShipments && !approvalHandledRef.current) {
            approvalHandledRef.current = true;
            handleOpenEdit();
        }
        if (location.hash === '#invoice') {
            setTimeout(() => {
                document.getElementById('invoice')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);
        }
    }, [shipment, location.pathname, location.hash, searchParams, canEdit, isPlatformOps, canApproveShipments, handleOpenEdit]);

    useEffect(() => {
        const sid = shipment?.id || shipment?._id;
        if (!sid || !isPlatformOps) return;
        let cancelled = false;
        financeService.getShipmentAccounting(sid)
            .then((res) => {
                if (!cancelled && res?.data) setAccounting(res.data);
            })
            .catch((err) => {
                console.warn('ShipmentV2 accounting fetch failed:', err);
            });
        return () => { cancelled = true; };
    }, [shipment?.id, shipment?._id, isPlatformOps]);

    // Handlers
    const handleCopyTracking = () => {
        if (!shipment?.trackingNumber) return;
        navigator.clipboard.writeText(shipment.trackingNumber);
        enqueueSnackbar(isRTL ? 'تم نسخ رقم البوليصة' : 'Tracking number copied!', { variant: 'success' });
    };

    const handleCopyPublicLink = () => {
        if (!shipment?.trackingNumber) return;
        navigator.clipboard.writeText(`${window.location.origin}/track/${shipment.trackingNumber}`);
        enqueueSnackbar(isRTL ? 'تم نسخ رابط التتبع العام' : 'Public tracking link copied!', { variant: 'success' });
    };

    const handleOpenPdf = (pdfData) => {
        if (!pdfData) return;
        if (typeof pdfData === 'string' && pdfData.startsWith('data:application/pdf')) {
            const win = window.open('', '_blank');
            if (win) win.document.write(`<iframe width="100%" height="100%" src="${pdfData}" style="border:none;"></iframe>`);
            return;
        }
        const raw = String(pdfData);
        const finalUrl = raw.startsWith('http') || raw.startsWith('blob:')
            ? raw
            : `${BACKEND_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
        window.open(finalUrl, '_blank', 'noopener,noreferrer');
    };

    const handleGenerateInvoiceQR = async () => {
        if (!shipment) return;
        try {
            await generateWaybillPDF(shipment);
            enqueueSnackbar(isRTL ? 'تم إصدار بوليصة المستودع بنجاح' : 'Target Hub Waybill PDF generated', { variant: 'success' });
        } catch {
            enqueueSnackbar(isRTL ? 'تعذر إصدار المستند' : 'Failed to generate PDF', { variant: 'error' });
        }
    };

    const handleOpenConversion = async () => {
        if (!isPlatformOps || !canBookCarriers || !shipment?.trackingNumber) return;
        setConversionDrawerOpen(true);
        try {
            const targetsRes = await shipmentService.getInternalShipmentConversionTargets(shipment.trackingNumber);
            const carriers = targetsRes?.data || [];
            setConversionTargetCarriers(carriers);
            if (carriers[0]) {
                setConversionCarrierCode(carriers[0].code);
                setConversionServiceCode(carriers[0].serviceOptions?.[0]?.code || 'P');
            }
        } catch {
            // fallback to default carrier options
        }
    };

    const handleConvertAndBook = async () => {
        if (!conversionCarrierCode || !conversionServiceCode) return;
        setIsProcessing(true);
        try {
            const res = await shipmentService.convertInternalShipment(shipment.trackingNumber, {
                carrierCode: conversionCarrierCode,
                serviceCode: conversionServiceCode,
                bookWithCarrier: true,
                autoBook: true
            });
            const awb = res?.data?.booking?.trackingNumber || res?.data?.shipment?.dhlTrackingNumber;
            enqueueSnackbar(`Converted & booked with ${conversionCarrierCode}${awb ? ` (AWB: ${awb})` : ''}`, { variant: 'success' });
            setConversionDrawerOpen(false);
            await loadShipmentData();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed converting shipment', { variant: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleGenerateCarrierDocs = async (docTypeToOpen = 'awb') => {
        if (!isPlatformOps || !canBookCarriers || !shipment?.trackingNumber) return;
        if (isInternalShipment && !isManualShipment) {
            handleOpenConversion();
            return;
        }
        setIsGeneratingDocs(true);
        try {
            const res = await shipmentService.generateCarrierDocuments(shipment.trackingNumber, { force: true, autoBook: Boolean(isPlatformOps && canBookCarriers) });
            enqueueSnackbar(isRTL ? 'تم توليد وثائق الناقل بنجاح' : 'Carrier documents generated!', { variant: 'success' });
            await loadShipmentData();
            const openUrl = docTypeToOpen === 'invoice'
                ? (res?.data?.invoiceUrl || res?.data?.shipment?.invoiceUrl)
                : (docTypeToOpen === 'receipt'
                    ? (res?.data?.receiptUrl || res?.data?.documents?.find((d) => /receipt|shiprcpt/i.test(String(d?.type || '')))?.url)
                    : (res?.data?.awbUrl || res?.data?.labelUrl || res?.data?.shipment?.awbUrl));
            if (openUrl) {
                handleOpenPdf(openUrl);
            } else if (docTypeToOpen === 'receipt') {
                enqueueSnackbar(isRTL ? 'لم يتم العثور على رابط إيصال الشحنة بعد التوليد' : 'Receipt URL was not returned by the server', { variant: 'warning' });
            }
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed generating carrier docs', { variant: 'error' });
        } finally {
            setIsGeneratingDocs(false);
        }
    };

    const handleUploadDocument = async (e) => {
        e.preventDefault();
        if (!uploadFile || !shipment?.trackingNumber) return;
        setIsUploadingDoc(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    await shipmentService.uploadDocument(shipment.trackingNumber, {
                        docType: uploadDocType,
                        base64Data: reader.result,
                        filename: uploadFile.name
                    });
                    enqueueSnackbar(isRTL ? 'تم رفع المستند بنجاح' : 'Document uploaded and attached!', { variant: 'success' });
                    setIsUploadModalOpen(false);
                    setUploadFile(null);
                    await loadShipmentData();
                } catch (err) {
                    enqueueSnackbar(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Upload failed', { variant: 'error' });
                } finally {
                    setIsUploadingDoc(false);
                }
            };
            reader.readAsDataURL(uploadFile);
        } catch {
            setIsUploadingDoc(false);
        }
    };

    const handleSyncCarrierTracking = async () => {
        if (!shipment?.trackingNumber || isSyncingCarrier) return;
        setIsSyncingCarrier(true);
        try {
            await api.get(`/shipments/${shipment.trackingNumber}?refresh=true`);
            await loadShipmentData();
            enqueueSnackbar(isRTL ? 'تمت مزامنة التتبع بنجاح' : 'Carrier tracking milestones synced!', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed syncing carrier tracking', { variant: 'error' });
        } finally {
            setIsSyncingCarrier(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        if (!isPlatformOps || !canManageCheckpoints || !shipment?.trackingNumber) return;
        setStatusUpdating(true);
        try {
            await shipmentService.updateStatus(shipment.trackingNumber, { status: newStatus });
            enqueueSnackbar(isRTL ? 'تم تحديث حالة الشحنة' : 'Shipment status updated', { variant: 'success' });
            await loadShipmentData();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed updating status', { variant: 'error' });
        } finally {
            setStatusUpdating(false);
        }
    };

    const handleAddComment = async (note) => {
        if (!shipment?.id) return false;
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
            await api.put(`/shipments/${shipment.id}`, { history: updatedHistory });
            enqueueSnackbar(isRTL ? 'تمت إضافة الملاحظة التشغيلية' : 'Operational note recorded!', { variant: 'success' });
            await loadShipmentData();
            return true;
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Failed to add note', { variant: 'error' });
            return false;
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleSendWhatsAppRole = async (recipientRole, forceSend = false) => {
        if (!isPlatformOps || !shipment?.trackingNumber) return;
        setSendingWhatsAppRole(recipientRole);
        try {
            await whatsappService.sendRoleNotification(shipment.trackingNumber, {
                recipientRole,
                eventType: 'shipment_created',
                forceSend
            });
            enqueueSnackbar(isRTL ? `تم إرسال إشعار واتساب إلى ${recipientRole}` : `WhatsApp notification sent to ${recipientRole}`, { variant: 'success' });
            await loadShipmentData();
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'WhatsApp dispatch failed', { variant: 'error' });
        } finally {
            setSendingWhatsAppRole(null);
        }
    };

    const handleResendUpdate = async () => {
        if (!shipment?.trackingNumber) return;
        setResendingUpdate(true);
        try {
            await whatsappService.resendShipmentUpdate(shipment.trackingNumber);
            enqueueSnackbar(isRTL ? 'تم إرسال تحديث التتبع عبر واتساب' : 'Tracking update dispatched via WhatsApp!', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Failed dispatching update', { variant: 'error' });
        } finally {
            setResendingUpdate(false);
        }
    };

    const handleRequestLocationPin = async () => {
        if (!shipment?.trackingNumber) return;
        setSendingLocationReq(true);
        try {
            await whatsappService.sendLocationRequest(shipment.trackingNumber);
            enqueueSnackbar(isRTL ? 'تم إرسال طلب تحديد الموقع للمستلم' : 'GPS location request sent to consignee!', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Failed sending location request', { variant: 'error' });
        } finally {
            setSendingLocationReq(false);
        }
    };

    const handleStartWhatsAppEngagement = async () => {
        if (!shipment?.trackingNumber) return;
        setStartingEngagement(true);
        try {
            await whatsappService.startCustomerEngagement(shipment.trackingNumber);
            enqueueSnackbar(isRTL ? 'تم بدء محادثة واتساب الرسمية' : 'WhatsApp template engagement initiated!', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err?.response?.data?.error || err?.message || 'Failed starting engagement', { variant: 'error' });
        } finally {
            setStartingEngagement(false);
        }
    };

    const handleDelete = async () => {
        if (!canDelete || !shipment?.trackingNumber) return;
        if (!window.confirm(isRTL ? `حذف الشحنة ${shipment.trackingNumber} نهائياً؟` : `Delete consignment ${shipment.trackingNumber}? This is irreversible.`)) return;
        try {
            await shipmentService.deleteShipment(shipment.trackingNumber);
            enqueueSnackbar(isRTL ? 'تم حذف الشحنة بنجاح' : 'Consignment deleted!', { variant: 'success' });
            navigate('/shipments-v2');
        } catch (err) {
            enqueueSnackbar(getShipmentDeleteErrorMessage(err, shipment.status), { variant: 'warning' });
        }
    };

    // Derived Data
    const sender = shipment?.sender || shipment?.origin || {};
    const receiver = shipment?.receiver || shipment?.destination || {};
    const parcels = useMemo(() => (Array.isArray(shipment?.parcels) ? shipment.parcels : []), [shipment?.parcels]);
    const items = useMemo(() => (Array.isArray(shipment?.items) ? shipment.items : []), [shipment?.items]);

    const { totalWeight, volumetricWeight, totalPieces } = useMemo(() => {
        const w = parcels.reduce((sum, p) => sum + (Number(p.weight) || 0), 0) || Number(shipment?.weight || 0);
        const pcs = parcels.reduce((sum, p) => sum + (Number(p.quantity || p.qty) || 1), 0) || Number(shipment?.totalPieces || shipment?.pieces || 1);
        const vol = parcels.reduce((sum, p) => {
            const l = Number(p.dimensions?.length || p.length || 0);
            const wi = Number(p.dimensions?.width || p.width || 0);
            const h = Number(p.dimensions?.height || p.height || 0);
            const q = Number(p.quantity || p.qty || 1);
            return sum + ((l * wi * h) / 5000) * q;
        }, 0);
        return { totalWeight: w, volumetricWeight: vol, totalPieces: pcs };
    }, [parcels, shipment]);

    const rawCarrierCode = String(shipment?.carrier || shipment?.carrierCode || 'INTERNAL').toUpperCase();
    const isInternalShipment = rawCarrierCode === 'INTERNAL' || shipment?.internallyManaged === true;
    const isManualShipment = Boolean(shipment?.manualShipment || shipment?.serviceType === 'manual' || rawCarrierCode === 'MANUAL');
    const canSeeCarrier = ['admin', 'staff', 'warehouse', 'accounting', 'driver'].includes(String(user?.role || '').toLowerCase());
    const carrierDisplayName = !canSeeCarrier
        ? (isRTL ? 'تارجت لوجستكس' : 'Target Logistics')
        : (isManualShipment ? (isRTL ? 'شحنة يدوية (Target)' : 'Manual Shipment') : getCarrierDisplayName(rawCarrierCode));

    const rawDocuments = Array.isArray(shipment?.documents) ? shipment.documents : [];
    const extractDocUrl = (doc) => (typeof doc === 'string' ? doc : doc?.url || doc?.path || null);
    const carrierAwbDoc = rawDocuments.find((d) => /label|awb|waybill/i.test(String(d?.type || '')));
    const carrierInvoiceDoc = rawDocuments.find((d) => /inv|customs|commercial/i.test(String(d?.type || '')));
    const carrierReceiptDoc = rawDocuments.find((d) => /receipt|shiprcpt/i.test(String(d?.type || '')));
    const resolvedCarrierAwb = shipment?.labelUrl || shipment?.awbUrl || extractDocUrl(carrierAwbDoc);
    const resolvedCarrierInvoice = shipment?.invoiceUrl || extractDocUrl(carrierInvoiceDoc);
    const resolvedCarrierReceipt = extractDocUrl(carrierReceiptDoc);

    const accountingSummary = accounting || {
        totalCharge: Number(shipment?.price || 0),
        totalPaid: Number(shipment?.totalPaid || 0),
        remainingBalance: Number(shipment?.remainingBalance ?? (Number(shipment?.price || 0) - Number(shipment?.totalPaid || 0)))
    };
    const isPaid = Number(accountingSummary.remainingBalance || 0) <= 0.001 && Number(accountingSummary.totalCharge || 0) > 0;

    // Cost / Margin (strictly VIEW_COST_DATA)
    const salePrice = Number(shipment?.price || accountingSummary.totalCharge || 0);
    const carrierCost = Number(shipment?.carrierCost ?? shipment?.costPrice ?? shipment?.manualCost ?? 0);
    const grossMargin = salePrice - carrierCost;

    const normStatus = normalizeStatus(shipment?.status);
    const stepIdx = getStepIndex(normStatus);
    const visualStep = normStatus === 'delivered' ? 4 : normStatus === 'out_for_delivery' ? 3 : stepIdx >= 2 ? 2 : stepIdx >= 1 ? 1 : 0;
    const isTriageException = normStatus === 'exception' || isNegativeOrExceptionPhrase(shipment?.status);
    const customsObj = shipment?.customsInvoice || shipment?.customs || {};
    const receiverWaDigits = formatWhatsAppDigits(receiver.phone);

    return (
        <div
            dir={isRTL ? 'rtl' : 'ltr'}
            className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden"
        >
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
                {/* V1 <-> V2 Switcher Banner */}
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/80 dark:bg-sky-950/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="material-symbols-outlined text-base text-primary shrink-0" aria-hidden="true">package_2</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {isRTL ? 'ملف الشحنة المطور V2 (تكافؤ كامل للبيانات والتعديل)' : 'Shipment Operations Dossier V2 (Full Detail & Edit Parity)'}
                        </span>
                    </div>
                    <Link to={`/shipment/${trackingNumber}`} className="font-bold text-primary dark:text-sky-400 hover:underline shrink-0">
                        {isRTL ? 'العودة إلى V1' : 'Switch to V1'}
                    </Link>
                </div>

                {loading && !shipment ? (
                    <div className="space-y-4" aria-busy="true">
                        <div className="h-32 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
                            ))}
                        </div>
                    </div>
                ) : error || !shipment ? (
                    <div className="space-y-4">
                        <ErrorBannerV2
                            message={error || (isRTL ? 'لم يتم العثور على الشحنة المطلوبة.' : 'The requested consignment could not be retrieved.')}
                            onRetry={loadShipmentData}
                            isRetrying={loading}
                        />
                        <Link to="/shipments-v2" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold">
                            <span className="material-symbols-outlined text-base" aria-hidden="true">{isRTL ? 'arrow_forward' : 'arrow_back'}</span>
                            <span>{isRTL ? 'العودة إلى قائمة الشحنات' : 'Back to Shipments'}</span>
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* 1. Dossier Header & Actions */}
                        <header className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs space-y-4">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <Link to="/shipments-v2" className="font-bold text-slate-500 dark:text-slate-400 hover:text-primary inline-flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">{isRTL ? 'arrow_forward' : 'arrow_back'}</span>
                                            <span>{isRTL ? 'الشحنات' : 'Shipments'}</span>
                                        </Link>
                                        <span className="text-slate-300 dark:text-slate-700">/</span>
                                        <StatusBadge status={normStatus} size="xs" />
                                        {shipment.reference && (
                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                                REF: {shipment.reference}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="font-mono text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight break-all">
                                            {shipment.trackingNumber}
                                        </h1>
                                        <button
                                            type="button"
                                            onClick={handleCopyTracking}
                                            aria-label={isRTL ? 'نسخ رقم البوليصة' : 'Copy tracking number'}
                                            className="min-h-[34px] min-w-[34px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-primary cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-base" aria-hidden="true">content_copy</span>
                                        </button>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {carrierDisplayName} • {shipment.shipmentType === 'documents' ? (isRTL ? 'مستندات' : 'Document Express') : (isRTL ? 'طرد قياسي' : 'Standard Package')}
                                        {shipment.dhlTrackingNumber && ` • AWB: ${shipment.dhlTrackingNumber}`}
                                    </p>
                                </div>

                                {/* Action Toolbar */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handleCopyPublicLink}
                                        className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-sm" aria-hidden="true">link</span>
                                        <span>{isRTL ? 'نسخ الرابط' : 'Copy Link'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleGenerateInvoiceQR}
                                        className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-sm" aria-hidden="true">qr_code_2</span>
                                        <span>{isRTL ? 'بوليصة QR' : 'Waybill / QR'}</span>
                                    </button>

                                    {isPlatformOps && (
                                        <button
                                            type="button"
                                            onClick={() => { setChatwootDrawerTarget(null); setChatwootDrawerOpen(true); }}
                                            data-testid="header-chatwoot-btn"
                                            className="min-h-[38px] px-3 rounded-xl border border-primary/40 text-primary dark:text-sky-400 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">support_agent</span>
                                            <span>{isRTL ? 'الدعم' : 'Support'}</span>
                                        </button>
                                    )}

                                    {isPlatformOps && ['out_for_delivery', 'in_transit'].includes(normStatus) && (
                                        <button
                                            type="button"
                                            onClick={() => setIsPodModalOpen(true)}
                                            className="min-h-[38px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">draw</span>
                                            <span>{isRTL ? 'إثبات التسليم' : 'Capture POD'}</span>
                                        </button>
                                    )}

                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={handleOpenEdit}
                                            data-testid="edit-shipment-btn"
                                            className="min-h-[38px] px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">edit</span>
                                            <span>{isRTL ? 'تعديل الشحنة' : 'Edit Consignment'}</span>
                                        </button>
                                    )}

                                    {canDelete && (
                                        <button
                                            type="button"
                                            onClick={handleDelete}
                                            className="min-h-[38px] px-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">delete</span>
                                            <span>{isRTL ? 'حذف' : 'Delete'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Approval / Pickup / Exception Operational Banners */}
                            {normStatus === 'pending_approval' && isPlatformOps && !isManualShipment && (
                                <div className="rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="text-xs">
                                        <div className="font-extrabold text-purple-900 dark:text-purple-200">
                                            {isRTL ? 'بانتظار مراجعة واعتماد الموظف' : 'Awaiting Staff Customs & Dimension Approval'}
                                        </div>
                                        <p className="text-purple-800/80 dark:text-purple-300/80 mt-0.5">
                                            {isRTL ? 'يرجى مراجعة الأوزان والأبعاد ورموز HS قبل الحجز مع الناقل.' : 'Verify actual weight/dimensions and HS codes before approving carrier booking.'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button type="button" onClick={handleOpenEdit} className="min-h-[36px] px-3 rounded-xl border border-purple-300 dark:border-purple-700 text-xs font-bold cursor-pointer">
                                            {isRTL ? 'مراجعة وتعديل' : 'Review & Edit'}
                                        </button>
                                        {canBookCarriers && (
                                            <button type="button" disabled={isGeneratingDocs} onClick={() => handleGenerateCarrierDocs('awb')} className="min-h-[36px] px-3 rounded-xl bg-purple-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                                {isGeneratingDocs ? '...' : (isRTL ? 'اعتماد وحجز' : 'Approve & Book')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {isTriageException && (
                                <div role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 p-3.5 flex items-center gap-3 text-xs text-rose-900 dark:text-rose-200">
                                    <span className="material-symbols-outlined text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true">error</span>
                                    <div>
                                        <strong className="font-extrabold">{isRTL ? 'تنبيه استثناء تشغيلي' : 'Active Triage & Exception Flag'}</strong>
                                        <span className="ms-2 opacity-90">{shipment.exceptionReason || shipment.remarks || (isRTL ? 'يتطلب متابعة فريق العمليات.' : 'Requires operations intervention.')}</span>
                                    </div>
                                </div>
                            )}

                            {/* Responsive Route & 5-Step Progress */}
                            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <TradeRouteDisplay
                                        originCountry={sender.countryCode || sender.country || 'KW'}
                                        destCountry={receiver.countryCode || receiver.country || 'SA'}
                                        originCity={sender.city || 'Kuwait City'}
                                        destCity={receiver.city || 'Destination'}
                                    />
                                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                                        {isRTL ? 'الوزن الحجمي:' : 'Vol. Weight:'} <strong>{volumetricWeight.toFixed(2)} kg</strong>
                                    </span>
                                </div>

                                <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-[9.5px] sm:text-xs font-bold text-center">
                                    {[
                                        isRTL ? 'تم الإنشاء' : 'Created',
                                        isRTL ? 'تم الاستلام' : 'Picked Up',
                                        isRTL ? 'قيد النقل' : 'In Transit',
                                        isRTL ? 'مع المندوب' : 'Out Delivery',
                                        isRTL ? 'تم التسليم' : 'Delivered'
                                    ].map((label, i) => (
                                        <div key={i} className="min-w-0 space-y-1">
                                            <div className={`h-1.5 rounded-full ${visualStep >= i ? (i === 4 ? 'bg-emerald-500' : 'bg-primary') : 'bg-slate-200 dark:bg-slate-800'}`} />
                                            <span
                                                title={label}
                                                className={`block leading-tight break-words line-clamp-2 ${visualStep >= i ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}
                                            >
                                                {label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </header>

                        {/* 2. KPI Metrics Row */}
                        <div className={`grid grid-cols-2 ${canViewCost ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3 sm:gap-4`}>
                            <MetricCardV2
                                title={isRTL ? 'الوزن والطرود' : 'Weight & Pieces'}
                                value={`${totalWeight.toFixed(2)} kg`}
                                subtitle={`${totalPieces} ${isRTL ? 'قطعة' : 'pcs'} • Vol ${volumetricWeight.toFixed(2)} kg`}
                                icon="inventory_2"
                                tone="neutral"
                            />
                            <MetricCardV2
                                title={isRTL ? 'سعر البيع' : 'Sale Price'}
                                value={`${salePrice.toFixed(3)} ${shipment.currency || 'KWD'}`}
                                subtitle={isPaid ? (isRTL ? 'مدفوعة بالكامل' : 'Paid in full') : `${isRTL ? 'متبقي:' : 'Due:'} ${Number(accountingSummary.remainingBalance || 0).toFixed(3)}`}
                                icon="payments"
                                tone={isPaid ? 'success' : 'warning'}
                            />
                            <MetricCardV2
                                title={isRTL ? 'الدفع عند الاستلام' : 'COD Amount'}
                                value={`${Number(shipment.codAmount || 0).toFixed(3)} ${shipment.codCurrency || 'KWD'}`}
                                icon="local_atm"
                                tone="info"
                            />
                            {canViewCost && (
                                <MetricCardV2
                                    title={isRTL ? 'التكلفة والهامش (داخلي)' : 'Wholesale Cost & Margin'}
                                    value={`${carrierCost.toFixed(3)} ${shipment.currency || 'KWD'}`}
                                    subtitle={`${isRTL ? 'الهامش:' : 'Margin:'} ${grossMargin >= 0 ? '+' : ''}${grossMargin.toFixed(3)}`}
                                    icon="account_balance"
                                    tone={grossMargin >= 0 ? 'success' : 'error'}
                                />
                            )}
                        </div>

                        {/* 3. Main Content + Sidebar */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                            {/* Left 8 cols */}
                            <div className="lg:col-span-8 space-y-5 min-w-0">
                                {/* Origin & Consignee Detailed Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Shipper */}
                                    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-2.5 shadow-2xs">
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                            <h2 className="text-xs font-extrabold uppercase tracking-wider text-primary dark:text-sky-400 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-base" aria-hidden="true">flight_takeoff</span>
                                                <span>{isRTL ? 'بيانات الراسل (المنشأ)' : 'Shipper (Origin)'}</span>
                                            </h2>
                                            {canEdit && (
                                                <button type="button" onClick={handleOpenEdit} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                    {isRTL ? 'تعديل' : 'Edit'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-xs space-y-1">
                                            <div className="font-extrabold text-sm text-slate-900 dark:text-white">{sender.company || sender.contactPerson || sender.name || '—'}</div>
                                            {sender.contactPerson && sender.company && <div className="text-slate-600 dark:text-slate-300 font-semibold">{sender.contactPerson}</div>}
                                            <div dir="ltr" className="font-mono text-slate-700 dark:text-slate-300">{sender.phone || '—'}</div>
                                            {sender.email && <div className="text-slate-500 dark:text-slate-400 truncate">{sender.email}</div>}
                                            {(sender.taxId || sender.vatNumber || sender.crNumber) && (
                                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                                    ID/VAT: {sender.taxId || sender.vatNumber || sender.crNumber}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                                            <p className="break-words">{sender.formattedAddress || [sender.line1 || sender.address, sender.line2, sender.area].filter(Boolean).join(', ') || '—'}</p>
                                            <p className="font-bold text-slate-900 dark:text-white">{sender.city || '—'}, {sender.countryCode || 'KW'}</p>
                                        </div>
                                    </section>

                                    {/* Consignee */}
                                    <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-2.5 shadow-2xs">
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                            <h2 className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-base" aria-hidden="true">flight_land</span>
                                                <span>{isRTL ? 'بيانات المستلم (الوجهة)' : 'Consignee (Destination)'}</span>
                                            </h2>
                                            {canEdit && (
                                                <button type="button" onClick={handleOpenEdit} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                    {isRTL ? 'تعديل' : 'Edit'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-xs space-y-1">
                                            <div className="font-extrabold text-sm text-slate-900 dark:text-white">{receiver.company || receiver.contactPerson || receiver.name || '—'}</div>
                                            {receiver.contactPerson && receiver.company && <div className="text-slate-600 dark:text-slate-300 font-semibold">{receiver.contactPerson}</div>}
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300">{receiver.phone || '—'}</span>
                                                {receiver.phone && isPlatformOps && (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={handleStartWhatsAppEngagement}
                                                            disabled={startingEngagement}
                                                            className="px-2 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer"
                                                        >
                                                            {startingEngagement ? '...' : (isRTL ? 'واتساب قالب' : 'Template')}
                                                        </button>
                                                        {receiverWaDigits && (
                                                            <a
                                                                href={`https://wa.me/${receiverWaDigits}?text=${encodeURIComponent(`Hello regarding Target Logistics Shipment ${shipment.trackingNumber}`)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold"
                                                            >
                                                                Web
                                                            </a>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {receiver.email && <div className="text-slate-500 dark:text-slate-400 truncate">{receiver.email}</div>}
                                            {(receiver.taxId || receiver.vatNumber || receiver.civilId) && (
                                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                                    Civil/VAT: {receiver.taxId || receiver.vatNumber || receiver.civilId}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                                            <p className="break-words">{receiver.formattedAddress || [receiver.line1 || receiver.address, receiver.line2, receiver.area].filter(Boolean).join(', ') || '—'}</p>
                                            <p className="font-bold text-slate-900 dark:text-white">{receiver.city || '—'}, {receiver.countryCode || 'GCC'}</p>
                                            {(receiver.instructions || receiver.deliveryNotes || shipment.specialInstructions) && (
                                                <p className="text-[11px] text-amber-700 dark:text-amber-300 pt-1">
                                                    {receiver.instructions || receiver.deliveryNotes || shipment.specialInstructions}
                                                </p>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Cargo, Parcels, DGR & Customs Specs */}
                                <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xs">
                                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                                        <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-lg" aria-hidden="true">inventory_2</span>
                                            <span>{isRTL ? 'مواصفات الطرود والجمارك' : 'Cargo, Parcels & Customs Specifications'}</span>
                                        </h2>
                                        {canEdit && (
                                            <button type="button" onClick={handleOpenEdit} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                {isRTL ? 'تعديل الطرود' : 'Edit Parcels'}
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                                            <div className="text-[10px] font-bold uppercase text-slate-500">{isRTL ? 'التغليف' : 'Packaging'}</div>
                                            <div className="font-extrabold text-slate-900 dark:text-white mt-0.5">{shipment.packagingType || 'Box'}</div>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                                            <div className="text-[10px] font-bold uppercase text-slate-500">{isRTL ? 'شرط الشحن' : 'Incoterm'}</div>
                                            <div className="font-extrabold text-primary dark:text-sky-400 mt-0.5">{shipment.incoterm || 'DAP'}</div>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                                            <div className="text-[10px] font-bold uppercase text-slate-500">{isRTL ? 'القيمة المصرحة' : 'Declared Value'}</div>
                                            <div className="font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                                                {Number(customsObj.declaredValue || customsObj.invoiceVal || shipment.declaredValue || 0).toFixed(3)} {customsObj.currency || shipment.currency || 'KWD'}
                                            </div>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                                            <div className="text-[10px] font-bold uppercase text-slate-500">{isRTL ? 'رمز HS' : 'HS Code'}</div>
                                            <div className="font-mono font-extrabold text-slate-900 dark:text-white mt-0.5">{customsObj.hsCode || '—'}</div>
                                        </div>
                                    </div>

                                    {shipment.dangerousGoods?.contains && (
                                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
                                            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true">warning</span>
                                            <div>
                                                <strong className="font-extrabold">{isRTL ? 'مواد خطرة مصرح عنها (DGR)' : 'DGR Dangerous Goods Declared'}</strong>
                                                <div className="mt-0.5">
                                                    UN {shipment.dangerousGoods.unCode || shipment.dangerousGoods.unNumber || '1266'} • {shipment.dangerousGoods.properShippingName || 'Perfumery'} • Class {shipment.dangerousGoods.dgClass || shipment.dangerousGoods.hazardClass || '3'}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Per-parcel breakdown */}
                                    {parcels.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                {isRTL ? `تفاصيل الطرود (${parcels.length})` : `Parcels Breakdown (${parcels.length})`}
                                            </div>
                                            <div className="space-y-2 md:hidden">
                                                {parcels.map((p, idx) => (
                                                    <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex justify-between items-center gap-2">
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-slate-900 dark:text-white">Package {idx + 1} • {p.description || 'Cargo'}</div>
                                                            <div className="text-slate-500 dark:text-slate-400">
                                                                {p.dimensions ? `${p.dimensions.length || 0}×${p.dimensions.width || 0}×${p.dimensions.height || 0} cm` : '—'}
                                                            </div>
                                                        </div>
                                                        <div className="font-mono font-bold tabular-nums shrink-0">{Number(p.weight || 0).toFixed(2)} kg</div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                                                <table className="w-full text-start text-xs">
                                                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase font-bold">
                                                        <tr>
                                                            <th className="px-3 py-2 text-start">#</th>
                                                            <th className="px-3 py-2 text-start">{isRTL ? 'الوصف' : 'Description'}</th>
                                                            <th className="px-3 py-2 text-start">{isRTL ? 'الوزن' : 'Weight'}</th>
                                                            <th className="px-3 py-2 text-start">{isRTL ? 'الأبعاد (سم)' : 'Dimensions (L×W×H)'}</th>
                                                            <th className="px-3 py-2 text-start">{isRTL ? 'الكمية' : 'Qty'}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                        {parcels.map((p, idx) => (
                                                            <tr key={idx}>
                                                                <td className="px-3 py-2 font-bold">#{idx + 1}</td>
                                                                <td className="px-3 py-2">{p.description || 'General Cargo'}</td>
                                                                <td className="px-3 py-2 font-mono font-bold tabular-nums">{Number(p.weight || 0).toFixed(2)} kg</td>
                                                                <td className="px-3 py-2 font-mono tabular-nums">
                                                                    {p.dimensions ? `${p.dimensions.length || p.length || 0}×${p.dimensions.width || p.width || 0}×${p.dimensions.height || p.height || 0} cm` : '—'}
                                                                </td>
                                                                <td className="px-3 py-2 font-mono">{p.quantity || p.qty || 1}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Declared Commercial Items */}
                                    {items.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                {isRTL ? `البضائع المصرح عنها (${items.length})` : `Declared Commercial Items (${items.length})`}
                                            </div>
                                            <div className="space-y-1.5">
                                                {items.map((it, idx) => (
                                                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs flex flex-wrap justify-between gap-2">
                                                        <span className="font-bold text-slate-900 dark:text-white">{it.description} (×{it.quantity || 1})</span>
                                                        <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                                                            {it.hsCode ? `HS ${it.hsCode} • ` : ''}{it.declaredValue != null ? `${it.declaredValue} ${shipment.currency || 'KWD'}` : '—'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </section>

                                {/* Official Paperwork & AWB Hub */}
                                <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xs">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-lg" aria-hidden="true">description</span>
                                            <span>{isRTL ? 'وثائق الشحن والبوليصة (AWB)' : 'Official Carrier Paperwork & Customs Hub'}</span>
                                        </h2>
                                        {isPlatformOps && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button type="button" onClick={() => setIsUploadModalOpen(true)} className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm" aria-hidden="true">upload_file</span>
                                                    <span>{isRTL ? 'رفع PDF' : 'Upload PDF'}</span>
                                                </button>
                                                {canBookCarriers && !isManualShipment && (
                                                    <button type="button" disabled={isGeneratingDocs} onClick={() => handleGenerateCarrierDocs('awb')} className="min-h-[36px] px-3 rounded-xl bg-primary text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50">
                                                        <span className="material-symbols-outlined text-sm" aria-hidden="true">bolt</span>
                                                        <span>{isGeneratingDocs ? (isRTL ? 'جاري التوليد...' : 'Generating...') : (isRTL ? 'توليد وثائق الناقل' : 'Generate Carrier Docs')}</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-bold text-slate-900 dark:text-white">{carrierDisplayName} AWB</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">{resolvedCarrierAwb ? (isRTL ? 'جاهز للطباعة' : 'Ready') : (isRTL ? 'قيد الانتظار' : 'Pending')}</div>
                                            </div>
                                            {resolvedCarrierAwb ? (
                                                <button type="button" onClick={() => handleOpenPdf(resolvedCarrierAwb)} className="min-h-[36px] rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">
                                                    {isRTL ? 'طباعة البوليصة' : 'Print AWB'}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </div>

                                        {!['OTE', 'LOGESTECHS', 'SMSA', 'SMSAEXPRESS'].includes(rawCarrierCode) && (
                                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-bold text-slate-900 dark:text-white">{isRTL ? 'الفاتورة الجمركية / إيصال الشحنة' : (['DGR', 'DGR2', 'DHL', 'DHL2'].includes(rawCarrierCode) ? 'Customs Invoice/Shipment Receipt' : 'Customs Invoice')}</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">{resolvedCarrierInvoice ? (isRTL ? 'جاهز' : 'Ready') : (isRTL ? 'قيد الانتظار' : 'Pending')}</div>
                                            </div>
                                            {resolvedCarrierInvoice ? (
                                                <button type="button" onClick={() => handleOpenPdf(resolvedCarrierInvoice)} className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer">
                                                    {isRTL ? 'طباعة الفاتورة' : 'Print Invoice'}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </div>
                                        )}

                                        {!['DGR', 'DGR2', 'DHL', 'DHL2'].includes(rawCarrierCode) && (
                                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-bold text-slate-900 dark:text-white">{isRTL ? 'إيصال الشحنة (تارجت)' : 'Target Shipment Receipt'}</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">{resolvedCarrierReceipt ? (isRTL ? 'جاهز' : 'Ready') : (isRTL ? 'قيد الانتظار' : 'Pending')}</div>
                                            </div>
                                            {resolvedCarrierReceipt ? (
                                                <button type="button" onClick={() => handleOpenPdf(resolvedCarrierReceipt)} className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer">
                                                    {isRTL ? 'طباعة الإيصال' : 'Print Receipt'}
                                                </button>
                                            ) : (isPlatformOps && canBookCarriers && !isManualShipment) ? (
                                                <button type="button" onClick={() => handleGenerateCarrierDocs('receipt')} disabled={isGeneratingDocs} className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer disabled:opacity-50">
                                                    {isRTL ? 'توليد الإيصال' : 'Generate Receipt'}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-400">—</span>
                                            )}
                                        </div>
                                        )}

                                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
                                            <div>
                                                <div className="text-xs font-bold text-slate-900 dark:text-white">{isRTL ? 'بوليصة المستودع QR' : 'Target Hub QR'}</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">{isRTL ? 'مستند النظام' : 'System Waybill'}</div>
                                            </div>
                                            <button type="button" onClick={handleGenerateInvoiceQR} className="min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer">
                                                {isRTL ? 'طباعة QR' : 'Print Hub QR'}
                                            </button>
                                        </div>
                                    </div>
                                </section>

                                {/* Milestones, Telemetry & Comments Tabs */}
                                <ShipmentTimelineTabsV2
                                    shipment={shipment}
                                    isRTL={isRTL}
                                    lang={lang}
                                    isPlatformOps={isPlatformOps}
                                    canEdit={canEdit}
                                    isInternalShipment={isInternalShipment}
                                    isSyncingCarrier={isSyncingCarrier}
                                    onSyncCarrierTracking={handleSyncCarrierTracking}
                                    onOpenStatusEdit={handleOpenEdit}
                                    onAddComment={handleAddComment}
                                    isSubmittingComment={isSubmittingComment}
                                />
                            </div>

                            {/* Right 4 cols Sidebar */}
                            <div className="lg:col-span-4 min-w-0">
                                <ShipmentSidebarV2
                                    shipment={shipment}
                                    sender={sender}
                                    receiver={receiver}
                                    accountingSummary={accountingSummary}
                                    isPaid={isPaid}
                                    isRTL={isRTL}
                                    isPlatformOps={isPlatformOps}
                                    canViewCost={canViewCost}
                                    canBookCarriers={canBookCarriers}
                                    canManageCheckpoints={canManageCheckpoints}
                                    isInternalShipment={isInternalShipment}
                                    isManualShipment={isManualShipment}
                                    normStatus={normStatus}
                                    statusUpdating={statusUpdating}
                                    onStatusChange={handleStatusChange}
                                    onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
                                    onCopyPaymentLink={() => {
                                        navigator.clipboard.writeText(`${window.location.origin}/pay/${shipment.trackingNumber}`);
                                        enqueueSnackbar(isRTL ? 'تم نسخ رابط الدفع' : 'Payment link copied!', { variant: 'success' });
                                    }}
                                    onOpenChatwoot={(target = null) => {
                                        setChatwootDrawerTarget(target);
                                        setChatwootDrawerOpen(true);
                                    }}
                                    onSendWhatsAppRole={handleSendWhatsAppRole}
                                    sendingWhatsAppRole={sendingWhatsAppRole}
                                    onResendUpdate={handleResendUpdate}
                                    resendingUpdate={resendingUpdate}
                                    onRequestLocationPin={handleRequestLocationPin}
                                    sendingLocationReq={sendingLocationReq}
                                    onOpenConversion={handleOpenConversion}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Carrier Conversion Drawer */}
            {conversionDrawerOpen && (
                <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-xs">
                    <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl p-5 space-y-4 flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white">{isRTL ? 'تحويل وحجز الناقل الدولي' : 'Convert & Book Carrier'}</h3>
                            <button type="button" onClick={() => setConversionDrawerOpen(false)} className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center cursor-pointer">
                                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 text-xs">
                            <div>
                                <label className="block font-bold mb-1">{isRTL ? 'شركة الشحن' : 'Target Carrier'}</label>
                                <select
                                    value={conversionCarrierCode}
                                    onChange={(e) => {
                                        setConversionCarrierCode(e.target.value);
                                        const c = conversionTargetCarriers.find((tc) => tc.code === e.target.value);
                                        if (c?.serviceOptions?.[0]) setConversionServiceCode(c.serviceOptions[0].code);
                                    }}
                                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                                >
                                    {conversionTargetCarriers.length > 0 ? (
                                        conversionTargetCarriers.map((tc) => (
                                            <option key={tc.code} value={tc.code}>
                                                {tc.name || tc.label || tc.code} ({tc.code})
                                            </option>
                                        ))
                                    ) : (
                                        <>
                                            <option value="DGR">Target International Air (DGR)</option>
                                            <option value="DGR2">Target International Air (DHL)</option>
                                            <option value="SMSA">SMSA Express (SMSA)</option>
                                            <option value="OTE">Target Regional Road (LogesTechs / OTE)</option>
                                            <option value="ARAMEX">Aramex Priority Express (ARAMEX)</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="block font-bold mb-1">{isRTL ? 'مستوى الخدمة' : 'Service Level'}</label>
                                <select
                                    value={conversionServiceCode}
                                    onChange={(e) => setConversionServiceCode(e.target.value)}
                                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                                >
                                    {(() => {
                                        const activeTarget = conversionTargetCarriers.find((tc) => tc.code === conversionCarrierCode);
                                        const opts = Array.isArray(activeTarget?.serviceOptions) && activeTarget.serviceOptions.length > 0
                                            ? activeTarget.serviceOptions
                                            : [
                                                  { code: 'P', label: 'Express Worldwide (P)' },
                                                  { code: 'N', label: 'Domestic Express (N)' },
                                                  { code: 'D', label: 'Economy Select (D)' }
                                              ];
                                        return opts.map((opt) => (
                                            <option key={opt.code} value={opt.code}>
                                                {opt.label || opt.name || opt.code}
                                            </option>
                                        ));
                                    })()}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button type="button" onClick={() => setConversionDrawerOpen(false)} className="flex-1 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer">
                                {isRTL ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button type="button" disabled={isProcessing} onClick={handleConvertAndBook} className="flex-1 min-h-[42px] rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                {isProcessing ? (isRTL ? 'جاري الحجز...' : 'Booking...') : (isRTL ? 'تحويل وحجز' : 'Convert & Book')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Document Modal */}
            {isUploadModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
                    <div role="dialog" aria-modal="true" className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white">{isRTL ? 'رفع مستند للشحنة' : 'Upload Consignment Document'}</h3>
                            <button type="button" onClick={() => setIsUploadModalOpen(false)} className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center cursor-pointer">
                                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleUploadDocument} className="space-y-3">
                            <select
                                value={uploadDocType}
                                onChange={(e) => setUploadDocType(e.target.value)}
                                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                            >
                                <option value="awb">Air Waybill (AWB)</option>
                                <option value="invoice">Customs / Commercial Invoice</option>
                                <option value="pod">Proof of Delivery (POD)</option>
                                <option value="customs_declaration">Customs Declaration</option>
                                <option value="other">Other Document</option>
                            </select>
                            <input type="file" accept="application/pdf" required onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="w-full text-xs text-slate-600 dark:text-slate-300" />
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsUploadModalOpen(false)} className="min-h-[40px] px-4 rounded-xl text-xs font-bold cursor-pointer">{isRTL ? 'إلغاء' : 'Cancel'}</button>
                                <button type="submit" disabled={isUploadingDoc || !uploadFile} className="min-h-[40px] px-4 rounded-xl bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                                    {isUploadingDoc ? (isRTL ? 'جاري الرفع...' : 'Uploading...') : (isRTL ? 'رفع وحفظ' : 'Upload & Attach')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ProofOfDeliveryModal
                isOpen={isPodModalOpen}
                shipment={shipment}
                onClose={() => setIsPodModalOpen(false)}
                onDelivered={async () => {
                    setIsPodModalOpen(false);
                    enqueueSnackbar(isRTL ? 'تم تسجيل إثبات التسليم بنجاح' : 'Proof of delivery captured!', { variant: 'success' });
                    await loadShipmentData();
                }}
            />

            <ManualPaymentLinkModal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                shipment={shipment}
                onSuccess={loadShipmentData}
            />

            <NativeChatDrawer
                isOpen={chatwootDrawerOpen}
                onClose={() => { setChatwootDrawerOpen(false); setChatwootDrawerTarget(null); }}
                accountId={chatwootDrawerTarget?.accountId || shipment?.chatwootAccountId || '1'}
                chatwootConversationId={chatwootDrawerTarget?.conversationId || shipment?.chatwootConversationId || null}
                phone={chatwootDrawerTarget?.phone || sender?.phone || receiver?.phone || ''}
                recipientName={chatwootDrawerTarget?.recipientName || sender?.name || receiver?.name || 'Customer'}
                trackingNumber={shipment?.trackingNumber}
                shipment={shipment}
            />
        </div>
    );
};

export default ShipmentDetailsV2Page;
