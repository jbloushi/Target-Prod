import React from 'react';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';
import LocationLabel from './LocationLabel';
import { getEventDisplayMessage } from '../utils/shipmentDisplay';
import { useLanguage } from '../context/LanguageContext';

/**
 * TrackingProgress - Pure DaisyUI 5-Node Connected Stepper
 */
export const TrackingProgress = ({ status = 'in_transit' }) => {
    const { lang } = useLanguage();
    const steps = [
        { key: 'created', label: lang === 'ar' ? 'تم إنشاء\nالطلب' : 'Order\nCreated', icon: 'add_circle' },
        { key: 'picked_up', label: lang === 'ar' ? 'تم الاستلام\nمن الراسل' : 'Picked\nUp', icon: 'inventory' },
        { key: 'in_transit', label: lang === 'ar' ? 'قيد الشحن\nوالنقل الدولي' : 'In\nTransit', icon: 'flight' },
        { key: 'out_for_delivery', label: lang === 'ar' ? 'مع المندوب\nللتسليم' : 'Out for\nDelivery', icon: 'local_shipping' },
        { key: 'delivered', label: lang === 'ar' ? 'تم التسليم\nبنجاح' : 'Delivered', icon: 'check_circle' },
    ];

    const normalized = String(status || '').toLowerCase();
    const idx = normalized === 'delivered' || normalized === 'completed'
        ? 4
        : normalized === 'out_for_delivery'
            ? 3
            : normalized === 'in_transit'
                ? 2
                : normalized === 'picked_up'
                    ? 1
                    : 0;

    return (
        <div className="bg-base-100 border border-base-200 rounded-2xl p-4 sm:p-5 shadow-xs mb-6 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[500px] sm:min-w-0">
                {steps.map((s, i) => {
                    const done = i <= idx;
                    const current = i === idx;
                    const isLast = i === steps.length - 1;

                    return (
                        <React.Fragment key={s.key}>
                            <div className="flex flex-col items-center gap-1.5 flex-none min-w-[64px] sm:min-w-[76px]">
                                <div
                                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
                                        current
                                            ? 'bg-primary text-primary-content ring-4 ring-primary/20 shadow-md shadow-primary/30'
                                            : done
                                                ? 'bg-success text-success-content'
                                                : 'bg-base-200 text-base-content/40 border border-base-300'
                                    }`}
                                >
                                    <span className="material-symbols-outlined text-lg sm:text-xl">
                                        {s.icon}
                                    </span>
                                </div>
                                <span
                                    className={`text-[10px] sm:text-xs text-center font-bold whitespace-pre-line leading-tight ${
                                        current ? 'text-primary' : done ? 'text-success' : 'text-base-content/40'
                                    }`}
                                >
                                    {s.label}
                                </span>
                            </div>

                            {!isLast && (
                                <div className="flex-1 h-1 mx-2 -mt-4 bg-base-200 rounded-full overflow-hidden relative min-w-[20px]">
                                    <div
                                        className={`h-full transition-all duration-500 ${
                                            i < idx
                                                ? 'w-full bg-success'
                                                : i === idx - 1
                                                    ? 'w-full bg-gradient-to-r from-success to-primary'
                                                    : 'w-0'
                                        }`}
                                    />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

const statusConfig = {
    'created': { icon: 'inventory_2', label: 'Created' },
    'pickup_scheduled': { icon: 'schedule', label: 'Pickup Scheduled' },
    'ready_for_pickup': { icon: 'inventory', label: 'Ready for Pickup' },
    'picked_up': { icon: 'local_shipping', label: 'Picked Up' },
    'in_transit': { icon: 'flight', label: 'In Transit' },
    'out_for_delivery': { icon: 'local_shipping', label: 'Out for Delivery' },
    'delivered': { icon: 'check_circle', label: 'Delivered' },
    'exception': { icon: 'warning', label: 'Exception' },
    'pending': { icon: 'schedule', label: 'Pending' },
    'updated': { icon: 'update', label: 'Updated (Review)' },
    'default': { icon: 'update', label: 'Update' }
};

const getStatusConfig = (status) => {
    const normalized = status?.toLowerCase()?.replace(/\s+/g, '_') || 'default';
    return statusConfig[normalized] || statusConfig.default;
};

const toDisplayTimestamp = (eventOrTimestamp) => {
    if (eventOrTimestamp && typeof eventOrTimestamp === 'object') {
        return eventOrTimestamp.localTimestamp || eventOrTimestamp.timestamp;
    }
    return eventOrTimestamp;
};

const formatDate = (eventOrTimestamp) => {
    const timestamp = toDisplayTimestamp(eventOrTimestamp);
    if (!timestamp) {
        return { date: 'N/A', time: 'N/A', shortDate: 'N/A' };
    }
    const localMatch = String(timestamp || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (localMatch) {
        const [, year, month, day, hour, minute] = localMatch;
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        const hourNumber = Number(hour);
        const hour12 = hourNumber % 12 || 12;
        const suffix = hourNumber >= 12 ? 'PM' : 'AM';
        return {
            date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kuwait' }),
            time: `${String(hour12).padStart(2, '0')}:${minute} ${suffix} (AST)`,
            shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Kuwait' })
        };
    }
    const date = new Date(timestamp);
    return {
        date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kuwait' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuwait' }) + ' AST',
        shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Kuwait' })
    };
};

const toText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
};

const formatAddressObject = (address) => {
    if (!address || typeof address !== 'object') return '';

    const street = Array.isArray(address.streetLines)
        ? address.streetLines.filter(Boolean).join(', ')
        : toText(address.streetLines || address.line1 || address.addressLine1);
    const city = toText(address.city);
    const postalCode = toText(address.postalCode);
    const countryCode = toText(address.countryCode);

    return [street, [city, postalCode].filter(Boolean).join(' '), countryCode]
        .filter(Boolean)
        .join(', ');
};

const formatLocation = (location) => {
    if (!location) return '';
    if (typeof location === 'string' || typeof location === 'number') return String(location);
    if (Array.isArray(location)) return location.map(toText).filter(Boolean).join(', ');
    if (typeof location !== 'object') return '';

    return (
        toText(location.formattedAddress)
        || toText(location.address)
        || formatAddressObject(location.addressObject)
        || formatAddressObject(location.address)
        || formatAddressObject(location)
    );
};

const groupEventsByDate = (events) => {
    const groups = {};
    events?.forEach(event => {
        const { date } = formatDate(event);
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(event);
    });
    return groups;
};

const normalizeText = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const timelineDedupKey = (event) => {
    const desc = normalizeText(event?.description);
    const loc = normalizeText(formatLocation(event?.location));
    return `${desc}|${loc}`;
};

const TrackingTimeline = ({ history = [], currentStatus = 'in_transit' }) => {
    const { lang } = useLanguage();
    const dedupedHistory = dedupeTrackingEvents(history, timelineDedupKey);
    const sortedHistory = [...dedupedHistory].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    const groupedEvents = groupEventsByDate(sortedHistory);
    const dateKeys = Object.keys(groupedEvents);

    return (
        <div className="space-y-4">
            {/* Visual Connected Stepper */}
            <TrackingProgress status={currentStatus} />

            {(!history || history.length === 0) ? (
                <div className="p-8 rounded-2xl bg-base-100 border border-dashed border-base-300 text-center">
                    <p className="text-sm text-base-content/60">
                        {lang === 'ar'
                            ? 'لا توجد محطات تتبع مسجلة حتى الآن. سيتم التحديث تلقائياً فور تحرك الشحنة.'
                            : 'No tracking checkpoint events recorded yet. Check back soon for telemetry updates.'}
                    </p>
                </div>
            ) : (
                dateKeys.map((dateKey, dateIndex) => {
                    const events = groupedEvents[dateKey];
                    const isLatestDate = dateIndex === 0;

                    return (
                        <div key={dateKey} className="space-y-3">
                            {/* Date Header */}
                            <div className="flex items-center gap-3">
                                <span className={`text-xs font-black uppercase tracking-wider ${isLatestDate ? 'text-primary' : 'text-base-content/60'}`}>
                                    {dateKey}
                                </span>
                                <div className="flex-1 h-px bg-base-200" />
                            </div>

                            {/* Events for this date */}
                            <div className="relative ps-6 rtl:ps-0 rtl:pe-6 space-y-4">
                                {/* Vertical Timeline Line */}
                                <div className="absolute top-0 bottom-0 start-2.5 rtl:start-auto rtl:end-2.5 w-0.5 bg-base-200" />

                                {events.map((event, eventIndex) => {
                                    const statusStr = typeof event.status === 'object' ? (event.status?.status || event.status?.name || 'Update') : event.status;
                                    const config = getStatusConfig(statusStr);
                                    const { time } = formatDate(event);
                                    const isFirst = dateIndex === 0 && eventIndex === 0;
                                    const source = event.source === 'carrier' 
                                        ? (lang === 'ar' ? 'شبكة النقل الدولية' : 'Global Network') 
                                        : (lang === 'ar' ? 'مركز العمليات اللوجستية' : 'Logistics Center');
                                    const displayMessage = getEventDisplayMessage(event, statusStr || config.label);

                                    return (
                                        <div key={eventIndex} className="relative">
                                            {/* Node icon */}
                                            <div
                                                className={`absolute -start-6 rtl:-start-auto rtl:-end-6 top-1.5 w-7 h-7 rounded-full flex items-center justify-center transition-all z-10 ${
                                                    isFirst
                                                        ? 'bg-primary text-primary-content ring-4 ring-primary/20 shadow-sm'
                                                        : 'bg-base-100 text-base-content/60 border-2 border-base-300'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-sm">
                                                    {config.icon}
                                                </span>
                                            </div>

                                            <div className="bg-base-100 border border-base-200 rounded-xl p-3.5 shadow-xs space-y-1">
                                                <div className="flex justify-between items-baseline gap-2">
                                                    <div className="font-bold text-xs text-base-content">
                                                        {displayMessage}
                                                    </div>
                                                    <div className="text-[11px] font-mono text-base-content/50 shrink-0">
                                                        {time}
                                                    </div>
                                                </div>

                                                {event.location && (
                                                    <div className="text-xs text-base-content/70">
                                                        <LocationLabel location={event.location} />
                                                    </div>
                                                )}

                                                {event.pod && (
                                                    <div className="mt-2 p-2.5 bg-success/10 border border-success/20 rounded-lg space-y-1 text-xs text-success">
                                                        <div className="font-bold">
                                                            {lang === 'ar' ? '✓ تم تسجيل إثبات التسليم (POD)' : '✓ Proof of Delivery Recorded'}
                                                        </div>
                                                        <div className="text-base-content/80">
                                                            {lang === 'ar' ? 'المستلم:' : 'Received by:'} <strong>{event.pod.recipientName}</strong> ({event.pod.recipientRelationship || (lang === 'ar' ? 'المستلم شخصياً' : 'Self')})
                                                        </div>
                                                        {event.pod.driverName && (
                                                            <div className="text-base-content/60 text-[11px]">
                                                                {lang === 'ar' ? 'بواسطة المندوب:' : 'Delivered by:'} {event.pod.driverName}
                                                            </div>
                                                        )}
                                                        {event.pod.signatureDataUrl && (
                                                            <div className="mt-1 bg-white p-1 rounded border border-success/30 inline-block">
                                                                <img
                                                                    src={event.pod.signatureDataUrl}
                                                                    alt="Recipient Signature"
                                                                    className="h-9 max-w-[140px] object-contain block"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="text-[10px] uppercase font-bold tracking-wider text-base-content/40 pt-1">
                                                    {lang === 'ar' ? 'المصدر:' : 'Source:'} {source}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default TrackingTimeline;
