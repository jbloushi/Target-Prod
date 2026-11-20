import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from './StatusBadge';
import TradeRouteDisplay from './TradeRouteDisplay';
import { normalizeStatus, isNegativeOrExceptionPhrase } from '../../constants/statusConfig';
import { dedupeTrackingEvents } from '../../utils/dedupeTrackingEvents';
import { canViewCarrier, sanitizeCarrierTextForRole } from '../../utils/carrierVisibility';
import NativeChatDrawer from '../support/NativeChatDrawer';

const CARRIER_INFO_MAP = {
    'DGR': { name: 'DHL Express', nameAr: 'دي إتش إل إكسبريس', badge: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30' },
    'DHL': { name: 'DHL Express', nameAr: 'دي إتش إل إكسبريس', badge: 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30' },
    'ARM': { name: 'Aramex', nameAr: 'أرامكس', badge: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/30' },
    'ARAMEX': { name: 'Aramex', nameAr: 'أرامكس', badge: 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/30' },
    'SMSA': { name: 'SMSA Express', nameAr: 'سمسا إكسبريس', badge: 'bg-orange-500/10 text-orange-800 dark:text-orange-300 border border-orange-500/30' },
    'SMSAEXPRESS': { name: 'SMSA Express', nameAr: 'سمسا إكسبريس', badge: 'bg-orange-500/10 text-orange-800 dark:text-orange-300 border border-orange-500/30' },
    'FDX': { name: 'FedEx Express', nameAr: 'فيديكس إكسبريس', badge: 'bg-purple-500/10 text-purple-800 dark:text-purple-300 border border-purple-500/30' },
    'FEDEX': { name: 'FedEx Express', nameAr: 'فيديكس إكسبريس', badge: 'bg-purple-500/10 text-purple-800 dark:text-purple-300 border border-purple-500/30' },
    'OTE': { name: 'Target GCC (OTE)', nameAr: 'تارجت الخليج (OTE)', badge: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border border-sky-500/30' },
    'LOGESTECHS': { name: 'Target GCC (OTE)', nameAr: 'تارجت الخليج (OTE)', badge: 'bg-sky-500/10 text-sky-800 dark:text-sky-300 border border-sky-500/30' },
    'POSTA_PLUS': { name: 'Posta Plus', nameAr: 'بوستا بلس', badge: 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border border-teal-500/30' },
    'POSTAPLUS': { name: 'Posta Plus', nameAr: 'بوستا بلس', badge: 'bg-teal-500/10 text-teal-800 dark:text-teal-300 border border-teal-500/30' },
    'IW_EXPRESS': { name: 'IW Express', nameAr: 'آي دبليو إكسبريس', badge: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30' },
    'IWEXPRESS': { name: 'IW Express', nameAr: 'آي دبليو إكسبريس', badge: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30' },
    'MAN': { name: 'Internal Fleet', nameAr: 'الأسطول الداخلي', badge: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30' },
    'INTERNAL': { name: 'Internal Fleet', nameAr: 'الأسطول الداخلي', badge: 'bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 border border-indigo-500/30' }
};

/**
 * V2 Slide-Over Shipment Inspector Drawer
 * Used across Dashboard, Shipments, Finance, and Operations views.
 */
export const ShipmentInspectorDrawer = ({
    shipment,
    onClose,
    onDownloadLabel
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isV2Route = location.pathname.includes('-v2') || location.pathname.includes('/v2');
    const { t, lang } = useLanguage();
    const { user } = useAuth();
    const canSeeCarrier = canViewCarrier(user?.role);
    const isRTL = lang === 'ar';
    const [copied, setCopied] = useState(false);
    const [isChatwootOpen, setIsChatwootOpen] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!shipment) return null;

    const trackingNumber = shipment.trackingNumber || '—';
    const rawStatus = shipment.status || 'draft';
    const status = normalizeStatus(rawStatus);
    const carrierCode = (() => {
        const raw = (shipment.carrierCode || shipment.carrier || '').toUpperCase().trim();
        if (raw) return raw;
        const trk = String(shipment.dhlTrackingNumber || shipment.trackingNumber || '').replace(/^(?:TRK|ARM|DHL|DGR|FED|FDX|OTE|SMSA)-/i, '').trim();
        if (/^29\d{10}$/.test(trk) || trk.startsWith('SMSA') || trk.startsWith('29')) return 'SMSA';
        if (/^[345]\d{9,11}$/.test(trk) || shipment.serviceType?.toLowerCase().includes('aramex') || shipment.service?.toLowerCase().includes('aramex')) return 'ARAMEX';
        if (/^\d{12}$/.test(trk) || shipment.serviceType?.toLowerCase().includes('fedex') || shipment.service?.toLowerCase().includes('fedex')) return 'FEDEX';
        if (/^\d{10}$/.test(trk) || shipment.serviceType?.toLowerCase().includes('dhl') || shipment.service?.toLowerCase().includes('dhl')) return 'DHL';
        if (/^PP/i.test(trk)) return 'POSTA_PLUS';
        if (/^IW/i.test(trk)) return 'IW_EXPRESS';
        if (/^TRG/i.test(trk) || /^OTE/i.test(trk)) return 'OTE';
        if (/^TKW/i.test(trk)) return 'INTERNAL';
        return null;
    })();

    const origin = shipment.origin || { city: shipment.originCity || 'Kuwait City', country: shipment.originCountry || 'KW' };
    const destination = shipment.destination || { city: shipment.destCity || 'Riyadh', country: shipment.destCountry || 'SA' };
    const originCityLabel = origin?.city || origin?.formattedAddress || (isRTL ? 'مركز الانطلاق' : 'Origin Hub');
    const destCityLabel = destination?.city || destination?.formattedAddress || (isRTL ? 'وجهة التسليم' : 'Destination Hub');
    const consigneeName = shipment.receiver?.contactPerson || shipment.receiver?.name || (typeof shipment.destination === 'object' ? (shipment.destination?.contactPerson || shipment.destination?.name) : null) || (typeof shipment.customer === 'object' ? (shipment.customer?.name || shipment.customer?.contactPerson) : (typeof shipment.customer === 'string' ? shipment.customer : null)) || (isRTL ? 'المستلم' : 'Consignee');
    const consigneePhone = shipment.receiver?.phone || (typeof shipment.destination === 'object' ? shipment.destination?.phone : null) || (typeof shipment.customer === 'object' ? shipment.customer?.phone : (typeof shipment.phone === 'string' ? shipment.phone : null)) || '+965 9988 7766';
    const orgName = shipment.organization?.name || shipment.org || 'Target Logistics';
    const serviceType = sanitizeCarrierTextForRole(shipment.serviceType || shipment.service || 'Express Air Cargo', user?.role);
    const weight = shipment.weight || shipment.package?.weight || (Array.isArray(shipment.parcels) && shipment.parcels.length > 0 ? shipment.parcels.reduce((s, p) => s + (Number(p.weight) || 0), 0) : 1);
    const pieces = shipment.pieces || shipment.package?.pieces || (Array.isArray(shipment.parcels) && shipment.parcels.length > 0 ? shipment.parcels.reduce((s, p) => s + (Number(p.quantity) || 1), 0) : 1);

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

    const resolveTrueDate = () => {
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
        if (phenixParsed && (!earliest || phenixParsed < earliest)) {
            return phenixParsed;
        }
        return earliest || phenixParsed;
    };

    const parsedDate = resolveTrueDate();
    const formattedDate = parsedDate
        ? parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' })
        : '—';
    const isImported = Boolean(shipment.documents?.phenixBillId || shipment.documents?.source === 'PHENIX_ERP');

    const rawHistory = Array.isArray(shipment.history) ? shipment.history : [];
    const dedupedHistory = dedupeTrackingEvents(
        rawHistory.filter(e => e && e.timestamp && e.type !== 'comment' && e.type !== 'note'),
        (e) => `${e?.status}|${e?.timestamp}|${e?.description}`
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);

    const copyTracking = () => {
        navigator.clipboard.writeText(trackingNumber);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const cleanPhone = consigneePhone.replace(/\D/g, '') || '96597691271';
    const waText = encodeURIComponent(
        isRTL
            ? `مرحباً ${consigneeName}، بخصوص شحنتك رقم ${trackingNumber}. يمكنك متابعة مسار الشحنة مباشرة عبر الرابط:\nhttps://target-kw.com/track/${trackingNumber}`
            : `Hello ${consigneeName}, regarding your shipment #${trackingNumber}. You can track its live status here:\nhttps://target-kw.com/track/${trackingNumber}`
    );

    const carrierMeta = carrierCode ? CARRIER_INFO_MAP[carrierCode.toUpperCase()] : null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-950/45 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            {/* Slide-over Panel */}
            <aside
                aria-label={isRTL ? 'تفاصيل الشحنة' : 'Shipment Inspector'}
                className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl z-10 flex flex-col border-s border-slate-200 dark:border-slate-800"
            >
                {/* Sticky Header */}
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0 bg-white dark:bg-slate-900">
                    <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-base font-bold text-primary tracking-tight" dir="ltr">
                                {trackingNumber}
                            </span>
                            <button
                                type="button"
                                onClick={copyTracking}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title={isRTL ? 'نسخ رقم التتبع' : 'Copy Tracking Number'}
                            >
                                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                    {copied ? 'check' : 'content_copy'}
                                </span>
                            </button>
                            {canSeeCarrier && carrierCode && (
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${carrierMeta?.badge || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'}`}>
                                    {isRTL ? carrierMeta?.nameAr || carrierCode : carrierMeta?.name || carrierCode}
                                </span>
                            )}
                            {shipment.isTest && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase">
                                    TEST
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{serviceType}</span>
                            <span aria-hidden="true">·</span>
                            <span>{orgName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formattedDate}</span>
                            {isImported && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-semibold text-primary">
                                    ERP
                                </span>
                            )}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={isRTL ? 'إغلاق' : 'Close drawer'}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                    >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* Status & Full Dossier Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <div className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                                {isRTL ? 'الحالة التشغيلية' : 'Consignment Status'}
                            </span>
                            <StatusBadge status={status} size="sm" />
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate(isV2Route ? `/shipment-v2/${trackingNumber}` : `/shipment/${trackingNumber}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                        >
                            <span>{isRTL ? 'فتح الملف الكامل' : 'Full Dossier'}</span>
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">open_in_new</span>
                        </button>
                    </div>

                    {/* Trade Route */}
                    <section className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {isRTL ? 'مسار الشحن الدولي' : 'Trade Route & Corridor'}
                        </h4>
                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <TradeRouteDisplay origin={origin} destination={destination} />
                        </div>
                    </section>

                    {/* Consignee & Cargo Summary */}
                    <section className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {isRTL ? 'بيانات المستلم والشحنة' : 'Consignee & Cargo Details'}
                        </h4>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'المستلم' : 'Consignee'}</span>
                                <span className="font-semibold text-slate-900 dark:text-slate-100 text-end">{consigneeName}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'الهاتف' : 'Phone'}</span>
                                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100" dir="ltr">
                                    {consigneePhone}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'المؤسسة / العميل' : 'Organization'}</span>
                                <span className="font-semibold text-primary text-end">{orgName}</span>
                            </div>
                            <div className="grid grid-cols-2 divide-x rtl:divide-x-reverse divide-slate-100 dark:divide-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
                                <div className="px-3.5 py-2.5">
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                        {isRTL ? 'الوزن الفعلي' : 'Actual Weight'}
                                    </span>
                                    <span className="font-bold tabular-nums text-sm text-slate-900 dark:text-slate-100">
                                        {weight} kg
                                    </span>
                                </div>
                                <div className="px-3.5 py-2.5">
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                                        {isRTL ? 'القطع' : 'Pieces'}
                                    </span>
                                    <span className="font-bold tabular-nums text-sm text-slate-900 dark:text-slate-100">
                                        {pieces} Pkg
                                    </span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Milestones & History */}
                    <section className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {isRTL ? 'مراحل التتبع' : 'Milestones & History'}
                            </h4>
                            {dedupedHistory.length > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono tabular-nums font-semibold text-slate-600 dark:text-slate-300">
                                    {dedupedHistory.length} {isRTL ? 'محطة' : 'events'}
                                </span>
                            )}
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
                            {dedupedHistory.length > 0 ? (
                                <ol className="relative space-y-3.5">
                                    {dedupedHistory.map((evt, idx) => {
                                        const isLatest = idx === 0;
                                        const rawEvtDesc = evt.description || (typeof evt.status === 'string' ? evt.status : 'Checkpoint update');
                                        const evtDesc = sanitizeCarrierTextForRole(rawEvtDesc, user?.role);
                                        const isExc = isNegativeOrExceptionPhrase(rawEvtDesc) || normalizeStatus(evt.statusCode || evt.status || rawEvtDesc) === 'exception';
                                        const isResolvedExc = isExc && (status !== 'exception' || idx > 0);
                                        const evtNorm = isExc ? 'exception' : normalizeStatus(evt.statusCode || rawEvtDesc || evt.status);
                                        const rawLocText = typeof evt.location === 'object' ? (evt.location?.formattedAddress || evt.location?.city || '') : (evt.location || '');
                                        const locText = sanitizeCarrierTextForRole(rawLocText, user?.role);
                                        const dt = parseDateRobust(evt.timestamp);
                                        const timeLabel = dt ? dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuwait' }) : '';
                                        const collapsed = Number(evt.collapsedCount || evt.occurrences || 1);

                                        const dotColor = evtNorm === 'delivered'
                                            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                                            : (isExc && !isResolvedExc)
                                            ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
                                            : isResolvedExc
                                            ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                                            : isLatest
                                            ? 'text-primary bg-primary/10'
                                            : 'text-slate-400 bg-slate-100 dark:bg-slate-800';

                                        return (
                                            <li key={`${evt.timestamp}-${idx}`} className="relative flex items-start gap-3">
                                                {idx < dedupedHistory.length - 1 && (
                                                    <span
                                                        aria-hidden="true"
                                                        className="absolute start-3 top-6 bottom-[-14px] w-px bg-slate-200 dark:bg-slate-800"
                                                    />
                                                )}
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${dotColor}`}>
                                                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                                        {evtNorm === 'delivered' ? 'task_alt' : isExc ? 'warning' : isLatest ? 'check_circle' : 'radio_button_unchecked'}
                                                    </span>
                                                </span>
                                                <div className="min-w-0 flex-1 pb-0.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                                                            {evtDesc}
                                                        </p>
                                                        {collapsed > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-600 dark:text-slate-300 shrink-0">
                                                                x{collapsed}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                        <span className="truncate">{locText || originCityLabel}</span>
                                                        <span className="font-mono tabular-nums shrink-0">{timeLabel}</span>
                                                    </div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            ) : (
                                <ol className="relative space-y-3.5 text-xs">
                                    <li className="relative flex items-start gap-3">
                                        <span aria-hidden="true" className="absolute start-3 top-6 bottom-[-14px] w-px bg-emerald-500/40" />
                                        <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">check_circle</span>
                                        </span>
                                        <div>
                                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                {isRTL ? 'استلام المنفذ' : 'Booked / Manifested'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{originCityLabel}</div>
                                        </div>
                                    </li>
                                    <li className="relative flex items-start gap-3">
                                        <span
                                            aria-hidden="true"
                                            className={`absolute start-3 top-6 bottom-[-14px] w-px ${
                                                ['out_for_delivery', 'delivered'].includes(status) ? 'bg-emerald-500/40' : 'bg-slate-200 dark:bg-slate-800'
                                            }`}
                                        />
                                        <span
                                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                                ['in_transit', 'out_for_delivery', 'delivered'].includes(status)
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">flight</span>
                                        </span>
                                        <div>
                                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                {isRTL ? 'نقل دولي' : 'In Transit Corridor'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{originCityLabel} → {destCityLabel}</div>
                                        </div>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <span
                                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                                status === 'delivered'
                                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">task_alt</span>
                                        </span>
                                        <div>
                                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                {isRTL ? 'تسليم المستلم' : 'Consignee Delivery'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                {status === 'delivered' ? `${destCityLabel} · Signed & Completed` : `${destCityLabel} · Pending dispatch`}
                                            </div>
                                        </div>
                                    </li>
                                </ol>
                            )}
                        </div>
                    </section>
                </div>

                {/* Sticky Footer Actions */}
                <div className="px-4 sm:px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center gap-2 shrink-0">
                    <a
                        href={`https://wa.me/${cleanPhone}?text=${waText}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 min-h-9 py-1.5 px-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold leading-tight text-center transition-colors"
                    >
                        <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">chat</span>
                        <span>{isRTL ? 'واتساب المستلم' : 'WhatsApp Client'}</span>
                    </a>
                    <button
                        type="button"
                        onClick={() => setIsChatwootOpen(true)}
                        className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 min-h-9 py-1.5 px-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold leading-tight text-center transition-colors cursor-pointer"
                        title={isRTL ? 'فتح محادثة صندوق الوارد المباشرة' : 'Open Inbox Live Support'}
                        data-testid="inspector-open-chatwoot-btn"
                    >
                        <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">support_agent</span>
                        <span>{isRTL ? 'صندوق الوارد' : 'Open Inbox'}</span>
                    </button>
                    {onDownloadLabel && (
                        <button
                            type="button"
                            onClick={() => onDownloadLabel(shipment)}
                            className="inline-flex items-center justify-center w-9 min-h-9 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shrink-0"
                            title={t('action_view_label', 'Print Waybill')}
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">print</span>
                        </button>
                    )}
                </div>
            </aside>

            {/* Native Shipment Chat Drawer */}
            <NativeChatDrawer
                isOpen={isChatwootOpen}
                onClose={() => setIsChatwootOpen(false)}
                accountId={
                    shipment.chatwootAccountId ||
                    shipment.notificationLogs?.find(l => l.chatwootAccountId)?.chatwootAccountId ||
                    '1'
                }
                chatwootConversationId={
                    shipment.chatwootConversationId ||
                    shipment.notificationLogs?.find(l => l.chatwootConversationId)?.chatwootConversationId ||
                    null
                }
                phone={consigneePhone}
                recipientName={consigneeName}
                trackingNumber={trackingNumber}
                shipment={shipment}
            />
        </div>
    );
};

export default ShipmentInspectorDrawer;
