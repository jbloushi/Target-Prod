import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportChat } from '../../context/SupportChatContext';
import ManualPaymentLinkModal from '../shipments/ManualPaymentLinkModal';

const STATUS_BADGE_CLASSES = {
    pending: 'badge-warning',
    in_transit: 'badge-info',
    out_for_delivery: 'badge-primary',
    customs_hold: 'badge-error',
    exception: 'badge-error',
    delivered: 'badge-success',
    cancelled: 'badge-neutral',
    returned: 'badge-neutral'
};

export const CustomerContextPanel = ({
    conversation,
    shipment: propShipment,
    onSelectQuickReply,
    className = ''
}) => {
    const { isRTL } = useLanguage();
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
            await sendLocationRequest(shp.trackingNumber);
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
            className={`w-full h-full bg-base-100 border-s border-base-200 flex flex-col overflow-y-auto ${className}`}
        >
            {/* Loading Indicator */}
            {loadingContext && (
                <div className="w-full bg-primary/10 text-primary text-[10px] py-1 px-3 flex items-center justify-center gap-1.5 font-bold">
                    <span className="loading loading-spinner loading-xs" />
                    <span>{isRTL ? 'جاري تحديث بيانات الشحنات...' : 'Refreshing logistics context...'}</span>
                </div>
            )}

            {/* Header: Customer Profile */}
            <div className="p-4 border-b border-base-200 bg-base-100/50">
                <div className="flex items-center gap-3">
                    <div className="avatar placeholder">
                        <div className="bg-primary/10 text-primary rounded-full w-12 h-12 flex items-center justify-center font-black text-lg border border-primary/20">
                            {customerName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h2
                                data-testid="context-customer-name"
                                className="font-black text-sm text-base-content truncate"
                            >
                                {customerName}
                            </h2>
                            <span className="badge badge-xs badge-neutral font-mono uppercase">
                                {customerRole}
                            </span>
                        </div>

                        {customerPhone ? (
                            <div className="flex items-center gap-2 mt-1">
                                <span
                                    data-testid="context-customer-phone"
                                    dir="ltr"
                                    className="font-mono text-xs text-base-content/80 font-bold"
                                >
                                    {customerPhone}
                                </span>
                                <button
                                    type="button"
                                    data-testid="context-copy-phone-btn"
                                    onClick={handleCopyPhone}
                                    title={isRTL ? 'نسخ رقم الهاتف' : 'Copy phone number'}
                                    className="btn btn-ghost btn-xs btn-square h-5 w-5 text-base-content/60 hover:text-base-content"
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
                                        className="btn btn-ghost btn-xs btn-square h-5 w-5 text-success hover:bg-success/10"
                                    >
                                        <span className="material-symbols-outlined text-xs">chat</span>
                                    </a>
                                )}
                            </div>
                        ) : (
                            <span className="text-xs text-base-content/50 italic">
                                {isRTL ? 'لا يوجد رقم هاتف مسجل' : 'No phone registered'}
                            </span>
                        )}
                    </div>
                </div>

                {/* Organization Details (B2B Accounts) */}
                {organization && (
                    <div className="mt-3 p-2.5 rounded-xl bg-base-200/50 border border-base-200 text-xs">
                        <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-base-content/70">
                                {isRTL ? 'الشركة / المنشأة:' : 'Organization:'}
                            </span>
                            <span className="font-black text-base-content truncate max-w-[140px]">
                                {organization.name}
                            </span>
                        </div>
                        {organization.creditLimit !== undefined && organization.creditLimit !== null && (
                            <div className="flex items-center justify-between text-base-content/70">
                                <span>{isRTL ? 'الحد الائتماني:' : 'Credit Limit:'}</span>
                                <span dir="ltr" className="font-mono font-bold">
                                    {Number(organization.creditLimit).toFixed(3)} KWD
                                </span>
                            </div>
                        )}
                        {organization.balance !== undefined && organization.balance !== null && (
                            <div className="flex items-center justify-between text-base-content/70 mt-0.5">
                                <span>{isRTL ? 'الرصيد المستحق:' : 'Balance Due:'}</span>
                                <span dir="ltr" className="font-mono font-bold text-warning">
                                    {Number(organization.balance).toFixed(3)} KWD
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Notification Toast for Location Request */}
            {locationSuccessMsg && (
                <div className="p-2.5 bg-success/15 border-b border-success/30 text-success flex items-center gap-2 text-xs font-bold">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    <span>{locationSuccessMsg}</span>
                </div>
            )}

            {/* Section 1: Pinned Active Shipments */}
            <div className="p-4 border-b border-base-200">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-base">local_shipping</span>
                        <h3 className="font-black text-xs uppercase tracking-wider text-base-content">
                            {isRTL ? 'الشحنات النشطة' : 'Active Shipments'}
                        </h3>
                    </div>
                    <span className="badge badge-primary badge-xs font-mono font-bold">
                        {activeShipments.length}
                    </span>
                </div>

                {activeShipments.length === 0 ? (
                    <div className="text-center py-4 px-2 rounded-xl bg-base-200/30 border border-dashed border-base-200">
                        <span className="material-symbols-outlined text-2xl text-base-content/40 mb-1">
                            inventory_2
                        </span>
                        <p className="text-xs text-base-content/60">
                            {isRTL ? 'لا توجد شحنات نشطة حالياً' : 'No active shipments currently'}
                        </p>
                    </div>
                ) : (
                    <div data-testid="context-active-shipments-list" className="space-y-3">
                        {activeShipments.map((shp) => (
                            <div
                                key={shp.id || shp.trackingNumber}
                                data-testid={`context-shipment-card-${shp.trackingNumber}`}
                                className="p-3 rounded-xl bg-base-200/60 border border-base-200 hover:border-primary/40 transition-colors"
                            >
                                {/* Tracking Number & Carrier */}
                                <div className="flex items-center justify-between mb-1.5">
                                    <a
                                        href={`/shipments/${shp.trackingNumber}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        dir="ltr"
                                        className="font-mono text-xs font-black text-primary hover:underline flex items-center gap-1"
                                    >
                                        <span>{shp.trackingNumber}</span>
                                        <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                                    </a>
                                    <span className={`badge badge-xs font-bold uppercase ${STATUS_BADGE_CLASSES[shp.status] || 'badge-neutral'}`}>
                                        {shp.status}
                                    </span>
                                </div>

                                {/* Carrier & Route Info */}
                                <div className="text-[11px] text-base-content/70 mb-2 flex items-center justify-between">
                                    <span className="font-bold">{shp.carrierName || shp.carrierCode || 'Target Logistics'}</span>
                                    {shp.origin && shp.destination && (
                                        <span className="text-base-content/60 truncate max-w-[140px]">
                                            {shp.origin} → {shp.destination}
                                        </span>
                                    )}
                                </div>

                                {/* Financials & COD Details */}
                                <div className="p-2 rounded-lg bg-base-100/70 border border-base-200 text-xs mb-2.5 flex items-center justify-between">
                                    <div>
                                        <span className="text-base-content/60 text-[10px] block">
                                            {isRTL ? 'التحصيل عند الاستلام (COD)' : 'Cash on Delivery'}
                                        </span>
                                        <span dir="ltr" className="font-mono font-black text-sm">
                                            {shp.codAmount !== null && shp.codAmount !== undefined
                                                ? `${Number(shp.codAmount).toFixed(3)} KWD`
                                                : '0.000 KWD'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className={`badge badge-xs font-bold ${shp.isPaid ? 'badge-success' : 'badge-warning'}`}>
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
                                        className="btn btn-outline btn-primary btn-xs flex items-center justify-center gap-1 font-bold"
                                        title={isRTL ? 'طلب تحديد موقع التسليم عبر واتساب' : 'Dispatch WhatsApp GPS Pin request'}
                                    >
                                        <span className="material-symbols-outlined text-xs">location_on</span>
                                        <span className="truncate">{isRTL ? 'طلب الموقع' : 'Request Pin'}</span>
                                    </button>

                                    <button
                                        type="button"
                                        data-testid="context-send-payment-btn"
                                        onClick={() => handleOpenPayment(shp)}
                                        className="btn btn-outline btn-success btn-xs flex items-center justify-center gap-1 font-bold"
                                        title={isRTL ? 'إرسال رابط دفع إلكتروني' : 'Send online checkout payment link'}
                                    >
                                        <span className="material-symbols-outlined text-xs">credit_card</span>
                                        <span className="truncate">{isRTL ? 'رابط دفع' : 'Pay Link'}</span>
                                    </button>
                                </div>

                                {/* Document Quick Links */}
                                <div className="flex items-center gap-2 pt-1 border-t border-base-200/50 text-[11px]">
                                    {shp.documents?.awbUrl && (
                                        <a
                                            data-testid="context-print-awb-btn"
                                            href={shp.documents.awbUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-base-content/70 hover:text-primary flex items-center gap-1 font-bold"
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
                                            className="text-base-content/70 hover:text-primary flex items-center gap-1 font-bold ms-auto"
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
            <div className="p-4 border-b border-base-200">
                <div className="flex items-center gap-1.5 mb-2.5">
                    <span className="material-symbols-outlined text-secondary text-base">bolt</span>
                    <h3 className="font-black text-xs uppercase tracking-wider text-base-content">
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
                            className="btn btn-ghost btn-xs rounded-lg border border-base-200 bg-base-100 hover:bg-base-200 text-start flex items-center gap-1 font-medium"
                            title={qr.text}
                        >
                            <span className="material-symbols-outlined text-xs text-base-content/70">
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
                        <span className="material-symbols-outlined text-base-content/60 text-base">history</span>
                        <h3 className="font-black text-xs uppercase tracking-wider text-base-content">
                            {isRTL ? 'سجل الشحنات السابقة' : 'Past Shipments'}
                        </h3>
                    </div>
                    <span className="badge badge-ghost badge-xs font-mono font-bold">
                        {pastShipments.length}
                    </span>
                </div>

                {pastShipments.length === 0 ? (
                    <div className="text-center py-4 px-2 text-xs text-base-content/50 italic">
                        {isRTL ? 'لا يوجد سجل شحنات سابقة' : 'No past shipment history'}
                    </div>
                ) : (
                    <div data-testid="context-past-shipments-list" className="space-y-2">
                        {pastShipments.map((shp) => (
                            <div
                                key={shp.id || shp.trackingNumber}
                                className="p-2.5 rounded-xl bg-base-200/30 border border-base-200 flex items-center justify-between text-xs"
                            >
                                <div>
                                    <a
                                        href={`/shipments/${shp.trackingNumber}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        dir="ltr"
                                        className="font-mono font-bold text-base-content hover:text-primary hover:underline"
                                    >
                                        {shp.trackingNumber}
                                    </a>
                                    <div className="text-[10px] text-base-content/50">
                                        {shp.carrierName || shp.carrierCode || 'Carrier'}
                                    </div>
                                </div>
                                <span className={`badge badge-xs font-bold uppercase ${STATUS_BADGE_CLASSES[shp.status] || 'badge-neutral'}`}>
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
