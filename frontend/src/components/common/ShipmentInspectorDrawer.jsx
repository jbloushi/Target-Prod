import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import StatusBadge from './StatusBadge';

const CARRIER_LABEL = {
    DGR: 'DHL Express',
    DHL: 'DHL Express',
    ARM: 'Aramex',
    ARAMEX: 'Aramex',
    FDX: 'FedEx Express',
    FEDEX: 'FedEx Express',
    MAN: 'Internal Fleet',
    INTERNAL: 'Internal Fleet',
};

const STATUS_HEADLINE = {
    delivered:      { en: 'Delivered',                     ar: 'تم التسليم' },
    out_for_delivery:{ en: 'Out for delivery',             ar: 'قيد التوصيل' },
    in_transit:     { en: 'On its way',                    ar: 'في الطريق' },
    picked_up:      { en: 'Picked up',                     ar: 'تم الاستلام' },
    ready_for_pickup:{ en: 'Ready for pickup',             ar: 'جاهز للاستلام' },
    booked:         { en: 'Booked with carrier',           ar: 'تم الحجز' },
    pending_review: { en: 'Pending review',                ar: 'في انتظار المراجعة' },
    draft:          { en: 'Draft — not yet booked',        ar: 'مسودة — لم يتم الحجز' },
    exception:      { en: 'Needs attention',               ar: 'يتطلب انتباه' },
    on_hold:        { en: 'On hold',                       ar: 'موقوف' },
    cancelled:      { en: 'Cancelled',                     ar: 'ملغى' },
    failed:         { en: 'Delivery failed',               ar: 'فشل التسليم' },
};

const parseDate = (raw) => {
    if (!raw) return null;
    const s = String(raw).trim();
    const uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (uk) return new Date(Date.UTC(+uk[3], +uk[2] - 1, +uk[1]));
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
};

const relativeAgo = (date, isRTL) => {
    if (!date) return null;
    const s = Math.round((Date.now() - date.getTime()) / 1000);
    if (s < 60) return isRTL ? 'الآن' : 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return isRTL ? `منذ ${m} د` : `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return isRTL ? `منذ ${h} س` : `${h} h ago`;
    const d = Math.round(h / 24);
    return isRTL ? `منذ ${d} ي` : `${d} d ago`;
};

/**
 * Read-only slide-over used from Dashboard, Shipments list, and Warehouse scan.
 *
 * Design intent (Visibility Redesign 3a):
 *  - Status headline leads — no more six equal-weight uppercase sections
 *  - One primary CTA (Open full dossier); WhatsApp / print / edit as icon buttons
 *  - Compact route strip + 3-item milestone list, no vertical daisyUI timeline
 *  - Copy tracking and Close move to icon buttons in the header
 */
export const ShipmentInspectorDrawer = ({
    shipment,
    onClose,
    onDownloadLabel,
    onEdit,
}) => {
    const navigate = useNavigate();
    const { lang } = useLanguage();
    const isRTL = lang === 'ar';
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Derived shipment facts. Mirrors previous fallback chain so behavior stays the same
    // when a partial shipment object is passed in from a list view.
    const facts = useMemo(() => {
        if (!shipment) return null;
        const tracking = shipment.trackingNumber || '—';
        const status = shipment.status || 'draft';
        const carrierRaw = shipment.carrierCode
            || shipment.carrier
            || (shipment.serviceType?.toLowerCase().includes('dhl') ? 'DHL'
              : shipment.serviceType?.toLowerCase().includes('fedex') ? 'FEDEX'
              : shipment.serviceType?.toLowerCase().includes('aramex') ? 'ARAMEX' : null);
        const carrier = carrierRaw ? (CARRIER_LABEL[carrierRaw.toUpperCase()] || carrierRaw) : null;
        const origin = shipment.origin || { city: shipment.originCity || 'Kuwait City', country: shipment.originCountry || 'KW' };
        const dest   = shipment.destination || { city: shipment.destCity || 'Riyadh', country: shipment.destCountry || 'SA' };
        const consigneeName = shipment.receiver?.contactPerson || shipment.receiver?.name
            || (typeof shipment.destination === 'object' ? (shipment.destination?.contactPerson || shipment.destination?.name) : null)
            || (typeof shipment.customer === 'object' ? (shipment.customer?.name || shipment.customer?.contactPerson) : (typeof shipment.customer === 'string' ? shipment.customer : null))
            || (isRTL ? 'المستلم' : 'Consignee');
        const consigneePhone = shipment.receiver?.phone
            || (typeof shipment.destination === 'object' ? shipment.destination?.phone : null)
            || (typeof shipment.customer === 'object' ? shipment.customer?.phone : (typeof shipment.phone === 'string' ? shipment.phone : null))
            || '';
        const consigneeAddress = shipment.receiver?.address
            || (typeof shipment.destination === 'object' ? shipment.destination?.address : null)
            || null;
        const orgName = shipment.organization?.name || shipment.org || 'Target Logistics';
        const serviceType = shipment.serviceType || shipment.service || null;
        const weight = shipment.weight ?? shipment.package?.weight ?? null;
        const pieces = shipment.pieces ?? shipment.package?.pieces ?? null;

        // History → last 3 milestones, newest first
        const history = Array.isArray(shipment.history) ? [...shipment.history] : [];
        history.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        const lastMilestones = history.slice(0, 3);

        const lastUpdate = history[0]?.timestamp ? new Date(history[0].timestamp) : parseDate(shipment.updatedAt);
        const lastLocation = history[0]?.location || null;

        return {
            tracking, status, carrier,
            origin, dest,
            consigneeName, consigneePhone, consigneeAddress,
            orgName, serviceType, weight, pieces,
            lastMilestones, lastUpdate, lastLocation,
        };
    }, [shipment, isRTL]);

    if (!shipment || !facts) return null;

    const {
        tracking, status, carrier, origin, dest,
        consigneeName, consigneePhone, consigneeAddress,
        orgName, serviceType, weight, pieces,
        lastMilestones, lastUpdate, lastLocation,
    } = facts;

    const headline = STATUS_HEADLINE[status] || STATUS_HEADLINE.in_transit;
    const destCity = dest.city || dest.country || (isRTL ? 'الوجهة' : 'destination');
    const originCity = origin.city || origin.country || 'Kuwait';
    const statusHeadline = status === 'delivered'
        ? `${headline[isRTL ? 'ar' : 'en']}${destCity ? ` · ${destCity}` : ''}`
        : (['in_transit', 'out_for_delivery', 'picked_up'].includes(status)
            ? (isRTL ? `${headline.ar} إلى ${destCity}` : `${headline.en} to ${destCity}`)
            : headline[isRTL ? 'ar' : 'en']);

    const updateLine = [
        lastUpdate ? relativeAgo(lastUpdate, isRTL) : null,
        lastLocation,
    ].filter(Boolean).join(' · ');

    const copyTracking = () => {
        navigator.clipboard.writeText(tracking);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const cleanPhone = consigneePhone.replace(/\D/g, '');
    const waText = encodeURIComponent(
        isRTL
            ? `مرحباً ${consigneeName}، بخصوص شحنتك رقم ${tracking}. تابع شحنتك: https://target-kw.com/track/${tracking}`
            : `Hello ${consigneeName}, regarding your shipment #${tracking}. Track it live: https://target-kw.com/track/${tracking}`
    );

    return (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
                aria-hidden
            />

            <div className="relative w-full max-w-md bg-base-100 h-full shadow-2xl z-10 flex flex-col border-s border-base-200 animate-in slide-in-from-right duration-200">

                {/* Sticky header: tracking + org, icon actions */}
                <div className="px-5 py-4 border-b border-base-200 flex justify-between items-start gap-2">
                    <div className="min-w-0">
                        <div className="font-mono text-sm font-bold text-base-content truncate">{tracking}</div>
                        <div className="text-[11px] text-base-content/60 truncate">
                            {[carrier, orgName].filter(Boolean).join(' · ')}
                            {shipment.isTest && <span className="ms-1 badge badge-warning badge-xs">TEST</span>}
                        </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button
                            onClick={copyTracking}
                            className="btn btn-ghost btn-xs btn-square text-base-content/60"
                            title={isRTL ? 'نسخ' : 'Copy'}
                            aria-label={isRTL ? 'نسخ رقم التتبع' : 'Copy tracking number'}
                        >
                            <span className="material-symbols-outlined text-[18px]">{copied ? 'done' : 'content_copy'}</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="btn btn-ghost btn-xs btn-square text-base-content/60"
                            aria-label={isRTL ? 'إغلاق' : 'Close'}
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                </div>

                {/* Scrolling body */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                    {/* Status hero — the headline is the whole point */}
                    <div>
                        <StatusBadge status={status} size="sm" />
                        <h3 className="text-lg font-black text-base-content leading-tight tracking-tight mt-2">
                            {statusHeadline}
                        </h3>
                        {updateLine && (
                            <div className="text-xs text-base-content/60 mt-1">
                                {isRTL ? `آخر تحديث ${updateLine}` : `Updated ${updateLine}`}
                            </div>
                        )}
                    </div>

                    {/* Route strip — from → to, one line */}
                    <div className="bg-base-200/50 border border-base-200 rounded-xl px-3.5 py-3 flex items-center gap-3">
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-base-content/60">
                                {isRTL ? 'من' : 'From'}
                            </div>
                            <div className="text-xs font-bold text-base-content truncate">{originCity}</div>
                        </div>
                        <div className="flex-1 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                            <div
                                className="flex-1 h-[2px] rounded"
                                style={{
                                    background: status === 'delivered'
                                        ? 'var(--fallback-su,oklch(var(--su)))'
                                        : 'linear-gradient(to right, var(--fallback-su,oklch(var(--su))) 60%, var(--fallback-b3,oklch(var(--b3))) 60%)',
                                }}
                            />
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status === 'delivered' ? 'bg-success' : 'bg-base-300'}`} />
                        </div>
                        <div className="min-w-0 text-end">
                            <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-base-content/60">
                                {isRTL ? 'إلى' : 'To'}
                            </div>
                            <div className="text-xs font-bold text-base-content truncate">{destCity}</div>
                        </div>
                    </div>

                    {/* Compact facts: consignee + a small pieces/weight/service row */}
                    <div className="space-y-1">
                        <div className="text-sm font-bold text-base-content">{consigneeName}</div>
                        {consigneePhone && (
                            <div className="text-xs text-base-content/70 font-mono">{consigneePhone}</div>
                        )}
                        {consigneeAddress && (
                            <div className="text-xs text-base-content/70 leading-relaxed">{consigneeAddress}</div>
                        )}
                        {(pieces != null || weight != null || serviceType) && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
                                {pieces != null && (
                                    <div><span className="text-base-content/60">{isRTL ? 'قطع' : 'Pieces'} </span><strong className="text-base-content">{pieces}</strong></div>
                                )}
                                {weight != null && (
                                    <div><span className="text-base-content/60">{isRTL ? 'الوزن' : 'Weight'} </span><strong className="text-base-content">{weight} kg</strong></div>
                                )}
                                {serviceType && (
                                    <div><span className="text-base-content/60">{isRTL ? 'الخدمة' : 'Service'} </span><strong className="text-base-content">{serviceType}</strong></div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Last 3 milestones — flat list, newest first */}
                    {lastMilestones.length > 0 && (
                        <div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-base-content/60 mb-2">
                                {isRTL ? 'آخر التحديثات' : 'Last 3 milestones'}
                            </div>
                            <div className="flex flex-col gap-2">
                                {lastMilestones.map((m, i) => {
                                    const t = m.timestamp ? new Date(m.timestamp) : null;
                                    const time = t ? t.toLocaleString(isRTL ? 'ar' : 'en-GB', {
                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                    }) : null;
                                    return (
                                        <div key={i} className="flex items-center gap-2.5">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? 'bg-primary' : 'bg-base-300'}`} />
                                            <div className={`flex-1 text-xs ${i === 0 ? 'text-base-content font-semibold' : 'text-base-content/70'}`}>
                                                {m.description || m.status || m.event}
                                                {m.location && <span className="text-base-content/50"> · {m.location}</span>}
                                            </div>
                                            {time && (
                                                <div className="text-[11px] text-base-content/60 whitespace-nowrap">{time}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky action bar: one primary CTA + icon-only secondaries */}
                <div className="border-t border-base-200 bg-base-100 px-5 py-3 flex gap-2">
                    <button
                        onClick={() => navigate(`/shipment/${tracking}`)}
                        className="btn btn-primary btn-sm flex-1 gap-1.5"
                    >
                        <span className="material-symbols-outlined text-base">open_in_new</span>
                        <span className="font-bold">{isRTL ? 'فتح الملف الكامل' : 'Open full dossier'}</span>
                    </button>
                    {cleanPhone && (
                        <a
                            href={`https://wa.me/${cleanPhone}?text=${waText}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-outline btn-sm btn-square"
                            title={isRTL ? 'واتساب المستلم' : 'WhatsApp receiver'}
                            aria-label={isRTL ? 'واتساب المستلم' : 'WhatsApp receiver'}
                        >
                            <span className="material-symbols-outlined text-base">chat</span>
                        </a>
                    )}
                    {onDownloadLabel && (
                        <button
                            onClick={() => onDownloadLabel(shipment)}
                            className="btn btn-outline btn-sm btn-square"
                            title={isRTL ? 'طباعة الملصق' : 'Print label'}
                            aria-label={isRTL ? 'طباعة الملصق' : 'Print label'}
                        >
                            <span className="material-symbols-outlined text-base">print</span>
                        </button>
                    )}
                    {onEdit && (
                        <button
                            onClick={() => onEdit(shipment)}
                            className="btn btn-outline btn-sm btn-square"
                            title={isRTL ? 'تعديل' : 'Edit'}
                            aria-label={isRTL ? 'تعديل' : 'Edit'}
                        >
                            <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShipmentInspectorDrawer;
