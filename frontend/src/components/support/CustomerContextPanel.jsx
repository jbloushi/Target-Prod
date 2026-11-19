import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportChat } from '../../context/SupportChatContext';
import ManualPaymentLinkModal from '../shipments/ManualPaymentLinkModal';

const STATUS_BADGE_CLASSES = {
    pending: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
    in_transit: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60',
    out_for_delivery: 'bg-primary/10 text-primary border-primary/20',
    customs_hold: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
    exception: 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
    delivered: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
    cancelled: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    returned: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
};

export const CustomerContextPanel = ({
    conversation,
    shipment: propShipment,
    onSelectQuickReply,
    className = ''
}) => {
    const { isRTL } = useLanguage();
    const location = useLocation();
    const isV2Route = location.pathname.includes('-v2') || location.pathname.includes('/v2');
    const {
        logisticsContext,
        loadingContext,
        sendLocationRequest
    } = useSupportChat();

    // Local modal and action states
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedPaymentShipment, setSelectedPaymentShipment] = useState(null);
    const [locationRequestLoading, setLocationRequestLoading] = useState(false);
    const [locationSuccessMsg, setLocationSuccessMsg] = useState('');
    const [phoneCopied, setPhoneCopied] = useState(false);

    // Merge conversation contact & context customer info
    const customer = logisticsContext?.customer || conversation?.contact || {};
    const customerName = customer.name || conversation?.contact?.name || 'Customer';
    const customerPhone = customer.phone || conversation?.contact?.phone || '';
    const customerRole = customer.role || conversation?.contact?.role || 'receiver';
    const organization = customer.organization || null;

    // Active shipments prioritize active, then past
    const activeShipments = logisticsContext?.activeShipments || (conversation?.activeShipment?.trackingNumber ? [{
        trackingNumber: conversation.activeShipment.trackingNumber,
        status: conversation.activeShipment.status || 'in_transit',
        carrierCode: conversation.activeShipment.carrierCode || 'TARGET',
        carrierName: conversation.activeShipment.carrierCode === 'DGR' ? 'DHL Express' : 'Target Logistics',
        codAmount: conversation.activeShipment.codAmount || null,
        isPaid: false
    }] : (propShipment ? [propShipment] : []));

    const pastShipments = logisticsContext?.pastShipments || [];
    const primaryActiveShipment = activeShipments[0] || propShipment || null;

    // Handle copying phone to clipboard
    const handleCopyPhone = () => {
        if (!customerPhone) return;
        navigator.clipboard.writeText(customerPhone).then(() => {
            setPhoneCopied(true);
            setTimeout(() => setPhoneCopied(false), 2000);
        }).catch(() => {});
    };

    // Clean phone number for WhatsApp wa.me link
    const cleanPhone = String(customerPhone).replace(/\D/g, '');

    // Handle 1-Click GPS Location Request
    const handleRequestLocation = async (shipmentItem) => {
        const shp = shipmentItem || primaryActiveShipment;
        if (!shp?.trackingNumber) return;

        setLocationRequestLoading(true);
        setLocationSuccessMsg('');
        try {
            await sendLocationRequest(shp.trackingNumber, customerPhone, customerName);
            setLocationSuccessMsg(
                isRTL
                    ? `تم إرسال طلب موقع GPS للشحنة ${shp.trackingNumber}`
                    : `GPS location request dispatched for ${shp.trackingNumber}`
            );
            setTimeout(() => setLocationSuccessMsg(''), 4000);
        } catch (err) {
            console.error('[CustomerContextPanel] Location request failed:', err);
        } finally {
            setLocationRequestLoading(false);
        }
    };

    // Handle opening manual payment modal
    const handleOpenPayment = (shp) => {
        setSelectedPaymentShipment(shp || primaryActiveShipment);
        setPaymentModalOpen(true);
    };

    // Quick replies with pre-filled logistics context
    const quickReplies = [
        {
            id: 'status_update',
            titleEn: 'Status Update',
            titleAr: 'تحديث الحالة',
            icon: 'local_shipping',
            text: isRTL
                ? `مرحباً ${customerName}، شحنتك رقم ${primaryActiveShipment?.trackingNumber || ''} بحالة: ${primaryActiveShipment?.status || 'قيد المعالجة'}. يمكنك متابعتها عبر الرابط: ${primaryActiveShipment?.links?.tracking || 'https://target-kw.com'}`
                : `Hello ${customerName}, your shipment ${primaryActiveShipment?.trackingNumber || ''} is currently ${primaryActiveShipment?.status || 'in progress'}. You can track it here: ${primaryActiveShipment?.links?.tracking || 'https://target-kw.com'}`
        },
        {
            id: 'courier_notice',
            titleEn: 'Courier Notice',
            titleAr: 'إشعار المندوب',
            icon: 'person_pin_circle',
            text: isRTL
                ? `مرحباً ${customerName}، مندوب التوصيل في طريقه إليك لتسليم الشحنة رقم ${primaryActiveShipment?.trackingNumber || ''}. يرجى التواجد لتسلم الطلب.`
                : `Hello ${customerName}, our courier is currently on the way to deliver your parcel ${primaryActiveShipment?.trackingNumber || ''}. Please ensure someone is available.`
        },
        {
            id: 'cod_reminder',
            titleEn: 'COD Reminder',
            titleAr: 'تذكير بالتحصيل',
            icon: 'payments',
            text: isRTL
                ? `تذكير: يرجى تحضير مبلغ التحصيل عند الاستلام (${primaryActiveShipment?.codAmount ? primaryActiveShipment.codAmount.toFixed(3) : '0.000'} د.ك) للشحنة ${primaryActiveShipment?.trackingNumber || ''}.`
                : `Reminder: COD amount of ${primaryActiveShipment?.codAmount ? primaryActiveShipment.codAmount.toFixed(3) : '0.000'} KWD is due upon delivery for shipment ${primaryActiveShipment?.trackingNumber || ''}.`
        },
        {
            id: 'customs_hold',
            titleEn: 'Customs Hold',
            titleAr: 'احتجاز جمركي',
            icon: 'gavel',
            text: isRTL
                ? `عزيزي ${customerName}، الشحنة رقم ${primaryActiveShipment?.trackingNumber || ''} تخضع حالياً لإجراءات التدقيق الجمركي. سنقوم بإبلاغك فور فسحها.`
                : `Dear ${customerName}, shipment ${primaryActiveShipment?.trackingNumber || ''} is currently undergoing customs inspection. We will update you immediately upon release.`
        }
    ];

    return (
        <aside
            data-testid="customer-context-panel"
            className={`w-full h-full bg-white dark:bg-slate-900 border-s border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto ${className}`}
        >
            {/* Loading Indicator */}
            {loadingContext && (
                <div className="w-full bg-primary/10 text-primary text-[10px] py-1.5 px-3 flex items-center justify-center gap-1.5 font-bold">
                    <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>{isRTL ? 'جاري تحديث بيانات الشحنات...' : 'Refreshing logistics context...'}</span>
                </div>
            )}

            {/* Header: Customer Profile */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary rounded-full w-12 h-12 flex items-center justify-center font-black text-lg border border-primary/20 shrink-0">
                        {customerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2
                                data-testid="context-customer-name"
                                className="font-black text-sm text-slate-900 dark:text-white truncate"
                            >
                                {customerName}
                            </h2>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {customerRole}
                            </span>
                        </div>

                        {customerPhone ? (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span
                                    data-testid="context-customer-phone"
                                    dir="ltr"
                                    className="font-mono text-xs text-slate-700 dark:text-slate-300 font-bold"
                                >
                                    {customerPhone}
                                </span>
                                <button
                                    type="button"
                                    data-testid="context-copy-phone-btn"
                                    onClick={handleCopyPhone}
                                    title={isRTL ? 'نسخ رقم الهاتف' : 'Copy phone number'}
                                    className="inline-flex items-center justify-center h-6 w-6 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-xs">
                                        {phoneCopied ? 'check' : 'content_copy'}
                                    </span>
                                </button>
                                {cleanPhone && (
                                    <a
                                        data-testid="context-whatsapp-btn"
                                        href={`https://wa.me/${cleanPhone}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={isRTL ? 'محادثة عبر واتساب' : 'Chat on WhatsApp'}
                                        className="inline-flex items-center justify-center h-6 w-6 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-xs">chat</span>
                                    </a>
                                )}
                            </div>
                        ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                                {isRTL ? 'لا يوجد رقم هاتف مسجل' : 'No phone registered'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Organization Details (B2B Accounts) */}
                {organization && (
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-xs">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-bold text-slate-600 dark:text-slate-400">
                                {isRTL ? 'الشركة / المنشأة:' : 'Organization:'}
                            </span>
                            <span className="font-black text-slate-900 dark:text-white truncate max-w-[140px]">
                                {organization.name}
                            </span>
                        </div>
                        {organization.creditLimit !== undefined && organization.creditLimit !== null && (
                            <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                                <span>{isRTL ? 'الحد الائتماني:' : 'Credit Limit:'}</span>
                                <span dir="ltr" className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                    {Number(organization.creditLimit).toFixed(3)} KWD
                                </span>
                            </div>
                        )}
                        {organization.balance !== undefined && organization.balance !== null && (
                            <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400 mt-0.5">
                                <span>{isRTL ? 'الرصيد المستحق:' : 'Balance Due:'}</span>
                                <span dir="ltr" className="font-mono font-bold text-amber-600 dark:text-amber-400">
                                    {Number(organization.balance).toFixed(3)} KWD
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Notification Toast for Location Request */}
            {locationSuccessMsg && (
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-2 text-xs font-bold">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    <span>{locationSuccessMsg}</span>
                </div>
            )}

            {/* Section 1: Pinned Active Shipments */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-base">local_shipping</span>
                        <h3 className="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                            {isRTL ? 'الشحنات النشطة' : 'Active Shipments'}
                        </h3>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
                        {activeShipments.length}
                    </span>
                </div>

                {activeShipments.length === 0 ? (
                    <div className="text-center py-4 px-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-2xl text-slate-400 dark:text-slate-500 mb-1">
                            inventory_2
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {isRTL ? 'لا توجد شحنات نشطة حالياً' : 'No active shipments currently'}
                        </p>
                    </div>
                ) : (
                    <div data-testid="context-active-shipments-list" className="space-y-3">
                        {activeShipments.map((shp) => (
                            <div
                                key={shp.id || shp.trackingNumber}
                                data-testid={`context-shipment-card-${shp.trackingNumber}`}
                                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 hover:border-primary/40 transition-colors"
                            >
                                {/* Tracking Number & Carrier */}
                                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                                    <a
                                        href={isV2Route ? `/shipment-v2/${shp.trackingNumber}` : `/shipments/${shp.trackingNumber}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        dir="ltr"
                                        className="font-mono text-xs font-black text-primary hover:underline flex items-center gap-1"
                                    >
                                        <span>{shp.trackingNumber}</span>
                                        <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                                    </a>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${STATUS_BADGE_CLASSES[shp.status] || STATUS_BADGE_CLASSES.cancelled}`}>
                                        {shp.status}
                                    </span>
                                </div>

                                {/* Carrier & Route Info */}
                                <div className="text-[11px] text-slate-600 dark:text-slate-300 mb-2 flex items-center justify-between gap-2">
                                    <span className="font-bold truncate">{shp.carrierName || shp.carrierCode || 'Target Logistics'}</span>
                                    {shp.origin && shp.destination && (
                                        <span className="text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                                            {shp.origin} → {shp.destination}
                                        </span>
                                    )}
                                </div>

                                {/* Financials & COD Details */}
                                <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-xs mb-2.5 flex items-center justify-between gap-2">
                                    <div>
                                        <span className="text-slate-500 dark:text-slate-400 text-[10px] block">
                                            {isRTL ? 'التحصيل عند الاستلام (COD)' : 'Cash on Delivery'}
                                        </span>
                                        <span dir="ltr" className="font-mono font-black text-sm text-slate-900 dark:text-white">
                                            {shp.codAmount !== null && shp.codAmount !== undefined
                                                ? `${Number(shp.codAmount).toFixed(3)} KWD`
                                                : '0.000 KWD'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                            shp.isPaid
                                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                                                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                                        }`}>
                                            {shp.isPaid
                                                ? (isRTL ? 'مدفوعة' : 'Paid')
                                                : (isRTL ? 'غير مدفوعة' : 'Unpaid')}
                                        </span>
                                    </div>
                                </div>

                                {/* 1-Click Action Buttons */}
                                <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                                    <button
                                        type="button"
                                        data-testid="context-request-location-btn"
                                        disabled={locationRequestLoading}
                                        onClick={() => handleRequestLocation(shp)}
                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-white text-[11px] font-bold disabled:opacity-50 transition-colors"
                                        title={isRTL ? 'طلب تحديد موقع التسليم عبر واتساب' : 'Dispatch WhatsApp GPS Pin request'}
                                    >
                                        <span className="material-symbols-outlined text-xs">location_on</span>
                                        <span className="truncate">{isRTL ? 'طلب الموقع' : 'Request Pin'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        data-testid="context-send-payment-btn"
                                        onClick={() => handleOpenPayment(shp)}
                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-[11px] font-bold transition-colors"
                                        title={isRTL ? 'إرسال رابط دفع إلكتروني' : 'Send online checkout payment link'}
                                    >
                                        <span className="material-symbols-outlined text-xs">credit_card</span>
                                        <span className="truncate">{isRTL ? 'رابط دفع' : 'Pay Link'}</span>
                                    </button>
                                </div>

                                {/* Document Quick Links */}
                                <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/70 text-[11px]">
                                    {shp.documents?.awbUrl && (
                                        <a
                                            data-testid="context-print-awb-btn"
                                            href={shp.documents.awbUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-slate-600 dark:text-slate-300 hover:text-primary flex items-center gap-1 font-bold transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-xs">print</span>
                                            <span>{isRTL ? 'طباعة البوليصة' : 'Print AWB'}</span>
                                        </a>
                                    )}
                                    {shp.links?.tracking && (
                                        <a
                                            href={shp.links.tracking}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-slate-600 dark:text-slate-300 hover:text-primary flex items-center gap-1 font-bold ms-auto transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-xs">visibility</span>
                                            <span>{isRTL ? 'تتبع مباشر' : 'Live Tracking'}</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Section 2: Logistics Quick Replies */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1.5 mb-2.5">
                    <span className="material-symbols-outlined text-amber-500 text-base">bolt</span>
                    <h3 className="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                        {isRTL ? 'ردود لوجستية سريعة' : 'Quick Replies'}
                    </h3>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {quickReplies.map((qr) => (
                        <button
                            key={qr.id}
                            type="button"
                            data-testid={`context-quick-reply-chip-${qr.id}`}
                            onClick={() => onSelectQuickReply?.(qr.text)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] text-start font-semibold transition-colors"
                            title={qr.text}
                        >
                            <span className="material-symbols-outlined text-xs text-slate-500 dark:text-slate-400">
                                {qr.icon}
                            </span>
                            <span>{isRTL ? qr.titleAr : qr.titleEn}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Section 3: Past Shipment History */}
            <div className="p-4 flex-1">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-base">history</span>
                        <h3 className="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                            {isRTL ? 'سجل الشحنات السابقة' : 'Past Shipments'}
                        </h3>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {pastShipments.length}
                    </span>
                </div>

                {pastShipments.length === 0 ? (
                    <div className="text-center py-4 px-2 text-xs text-slate-400 dark:text-slate-500 italic">
                        {isRTL ? 'لا يوجد سجل شحنات سابقة' : 'No past shipment history'}
                    </div>
                ) : (
                    <div data-testid="context-past-shipments-list" className="space-y-2">
                        {pastShipments.map((shp) => (
                            <div
                                key={shp.id || shp.trackingNumber}
                                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 text-xs"
                            >
                                <div className="min-w-0">
                                    <a
                                        href={isV2Route ? `/shipment-v2/${shp.trackingNumber}` : `/shipments/${shp.trackingNumber}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        dir="ltr"
                                        className="font-mono font-bold text-slate-900 dark:text-white hover:text-primary hover:underline block truncate"
                                    >
                                        {shp.trackingNumber}
                                    </a>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                        {shp.carrierName || shp.carrierCode || 'Carrier'}
                                    </div>
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${STATUS_BADGE_CLASSES[shp.status] || STATUS_BADGE_CLASSES.cancelled}`}>
                                    {shp.status}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Manual Payment Link Modal */}
            {paymentModalOpen && (
                <ManualPaymentLinkModal
                    isOpen={paymentModalOpen}
                    onClose={() => setPaymentModalOpen(false)}
                    shipment={selectedPaymentShipment}
                    trackingNumber={selectedPaymentShipment?.trackingNumber}
                    defaultAmount={selectedPaymentShipment?.codAmount || selectedPaymentShipment?.remainingBalance}
                    onSuccess={() => {
                        setPaymentModalOpen(false);
                    }}
                />
            )}
        </aside>
    );
};

CustomerContextPanel.propTypes = {
    conversation: PropTypes.object,
    shipment: PropTypes.object,
    onSelectQuickReply: PropTypes.func,
    className: PropTypes.string
};

export default CustomerContextPanel;
