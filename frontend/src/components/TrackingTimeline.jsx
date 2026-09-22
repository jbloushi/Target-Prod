import React from 'react';
import {
    Box, Tooltip, Typography
} from '@mui/material';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';
import LocationLabel from './LocationLabel';
import { getEventDisplayMessage } from '../utils/shipmentDisplay';
import { TK } from '../tokens/kineticHorizon';
import { useLanguage } from '../context/LanguageContext';

/**
 * TrackingProgress - Kinetic Horizon 5-Node Connected Stepper
 */
export const TrackingProgress = ({ status = 'in_transit' }) => {
    const { t, lang } = useLanguage();
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
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            py: 2.5,
            px: { xs: 1, sm: 3 },
            mb: 4,
            borderRadius: '18px',
            bgcolor: '#ffffff',
            border: `1px solid ${TK.border}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            overflowX: 'auto'
        }}>
            {steps.map((s, i) => {
                const done = i <= idx;
                const current = i === idx;
                const isLast = i === steps.length - 1;

                return (
                    <React.Fragment key={s.key}>
                        <Box sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 1,
                            flex: '0 0 auto',
                            minWidth: { xs: 55, sm: 70 }
                        }}>
                            <Box 
                                className={current ? "live-beacon" : ""}
                                sx={{
                                    width: current ? 42 : 34,
                                    height: current ? 42 : 34,
                                    borderRadius: '50%',
                                    border: `2.5px solid ${done ? (current ? TK.primary : TK.success) : TK.border}`,
                                    bgcolor: done ? (current ? TK.primary : TK.success) : '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: done ? '#ffffff' : TK.text3,
                                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                    boxShadow: current ? `0 0 0 6px ${TK.primary}25, 0 8px 16px -4px ${TK.primary}40` : 'none',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: current ? 21 : 17 }}>
                                    {s.icon}
                                </span>
                            </Box>
                            <Typography sx={{
                                fontSize: { xs: '10px', sm: '11px' },
                                fontWeight: current ? 800 : 600,
                                color: current ? TK.primary : done ? TK.success : TK.text3,
                                textAlign: 'center',
                                whiteSpace: 'pre-line',
                                lineHeight: 1.25,
                            }}>
                                {s.label}
                            </Typography>
                        </Box>

                        {!isLast && (
                            <Box sx={{
                                flex: 1,
                                height: 3,
                                mx: { xs: 0.5, sm: 1 },
                                mb: 2.5,
                                bgcolor: i < idx ? TK.success : TK.border,
                                borderRadius: 99,
                                transition: 'background 0.3s',
                                position: 'relative',
                                minWidth: 15
                            }}>
                                {i === idx - 1 && (
                                    <Box sx={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: `linear-gradient(90deg, ${TK.success}, ${TK.primary})`,
                                        borderRadius: 99
                                    }} />
                                )}
                            </Box>
                        )}
                    </React.Fragment>
                );
            })}
        </Box>
    );
};

const statusConfig = {
    'created': { icon: 'inventory_2', color: '#0050d4', label: 'Created' },
    'pickup_scheduled': { icon: 'schedule', color: '#0284c7', label: 'Pickup Scheduled' },
    'ready_for_pickup': { icon: 'inventory', color: '#0284c7', label: 'Ready for Pickup' },
    'picked_up': { icon: 'local_shipping', color: '#0284c7', label: 'Picked Up' },
    'in_transit': { icon: 'flight', color: '#0050d4', label: 'In Transit' },
    'out_for_delivery': { icon: 'local_shipping', color: '#059669', label: 'Out for Delivery' },
    'delivered': { icon: 'check_circle', color: '#059669', label: 'Delivered' },
    'exception': { icon: 'warning', color: '#dc2626', label: 'Exception' },
    'pending': { icon: 'schedule', color: '#b45309', label: 'Pending' },
    'updated': { icon: 'update', color: '#0050d4', label: 'Updated (Review)' },
    'default': { icon: 'update', color: '#0050d4', label: 'Update' }
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
    const { t, lang } = useLanguage();
    const dedupedHistory = dedupeTrackingEvents(history, timelineDedupKey);
    const sortedHistory = [...dedupedHistory].sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
    );

    const groupedEvents = groupEventsByDate(sortedHistory);
    const dateKeys = Object.keys(groupedEvents);

    return (
        <Box sx={{ p: 1 }}>
            {/* Visual 5-Node Kinetic Horizon Progress Bar */}
            <TrackingProgress status={currentStatus} />

            {(!history || history.length === 0) ? (
                <Box sx={{
                    p: 4,
                    borderRadius: '16px',
                    background: '#f8fafc',
                    border: `1px dashed ${TK.border}`,
                    textAlign: 'center'
                }}>
                    <Typography sx={{ color: TK.text2, fontSize: '14px' }}>
                        {lang === 'ar' ? 'لا توجد محطات تتبع مسجلة حتى الآن. سيتم التحديث تلقائياً فور تحرك الشحنة.' : 'No tracking checkpoint events recorded yet. Check back soon for telemetry updates.'}
                    </Typography>
                </Box>
            ) : (
                dateKeys.map((dateKey, dateIndex) => {
                    const events = groupedEvents[dateKey];
                    const isLatestDate = dateIndex === 0;

                    return (
                        <Box key={dateKey} sx={{ mb: 4 }}>
                            {/* Date Header */}
                            <Typography
                                variant="subtitle2"
                                fontWeight="800"
                                sx={{
                                    color: isLatestDate ? TK.primary : TK.text2,
                                    mb: 3,
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2
                                }}
                            >
                                {dateKey}
                                <Box sx={{ flex: 1, height: '1px', background: TK.border }} />
                            </Typography>

                            {/* Events for this date */}
                            <Box sx={{ position: 'relative', pl: 4, '[dir="rtl"] &': { pl: 0, pr: 4 } }}>
                                {/* Vertical Timeline Line */}
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        left: 16,
                                        transform: 'translateX(-50%)',
                                        '[dir="rtl"] &': {
                                            left: 'auto',
                                            right: 16,
                                            transform: 'translateX(50%)'
                                        },
                                        top: 0,
                                        bottom: -20,
                                        width: '2px',
                                        background: TK.border,
                                        zIndex: 0
                                    }}
                                />

                                {events.map((event, eventIndex) => {
                                    const statusStr = typeof event.status === 'object' ? (event.status?.status || event.status?.name || 'Update') : event.status;
                                    const config = getStatusConfig(statusStr);
                                    const { time } = formatDate(event);
                                    const previousTime = eventIndex > 0 ? formatDate(events[eventIndex - 1]).time : null;
                                    const showTime = eventIndex === 0 || previousTime !== time;
                                    const startsTimeGroup = showTime && eventIndex > 0;
                                    const isFirst = dateIndex === 0 && eventIndex === 0;
                                    const source = event.source === 'carrier' 
                                        ? (lang === 'ar' ? 'شبكة النقل الدولية' : 'Global Network') 
                                        : (lang === 'ar' ? 'مركز العمليات اللوجستية' : 'Logistics Center');
                                    const displayMessage = getEventDisplayMessage(event, statusStr || config.label);

                                    return (
                                        <Box
                                            key={eventIndex}
                                            sx={{
                                                position: 'relative',
                                                mt: startsTimeGroup ? 2 : 0,
                                                pt: startsTimeGroup ? 2 : 0,
                                                mb: 3
                                            }}
                                        >
                                            {/* Node icon */}
                                            <Box
                                                sx={{
                                                    position: 'absolute',
                                                    left: -32,
                                                    '[dir="rtl"] &': {
                                                        left: 'auto',
                                                        right: -32
                                                    },
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: '50%',
                                                    bgcolor: isFirst ? TK.primary : '#ffffff',
                                                    border: `2px solid ${isFirst ? TK.primary : TK.border}`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: isFirst ? '#ffffff' : TK.text2,
                                                    boxShadow: isFirst ? `0 0 0 4px ${TK.primary}20` : 'none',
                                                    zIndex: 1
                                                }}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                                    {config.icon}
                                                </span>
                                            </Box>

                                            <Box sx={{
                                                bgcolor: '#ffffff',
                                                p: 2,
                                                borderRadius: '14px',
                                                border: `1px solid ${TK.border}`,
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                            }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                                                    <Typography sx={{ fontWeight: 800, fontSize: 13, color: TK.text1 }}>
                                                        {displayMessage}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: 11.5, color: TK.text3, fontWeight: 600 }}>
                                                        {time}
                                                    </Typography>
                                                </Box>

                                                {event.location && (
                                                    <Typography sx={{ fontSize: 12, color: TK.text2, mt: 0.5 }}>
                                                        <LocationLabel location={event.location} />
                                                    </Typography>
                                                )}

                                                {event.pod && (
                                                    <Box sx={{
                                                        mt: 1.5,
                                                        p: 1.5,
                                                        bgcolor: '#f0fdf4',
                                                        border: '1px solid #bbf7d0',
                                                        borderRadius: '10px'
                                                    }}>
                                                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#166534', mb: 0.5 }}>
                                                            {lang === 'ar' ? '✓ تم تسجيل إثبات التسليم (POD)' : '✓ Proof of Delivery Recorded'}
                                                        </Typography>
                                                        <Typography sx={{ fontSize: 11.5, color: '#15803d' }}>
                                                            {lang === 'ar' ? 'المستلم:' : 'Received by:'} <strong>{event.pod.recipientName}</strong> ({event.pod.recipientRelationship || (lang === 'ar' ? 'المستلم شخصياً' : 'Self')})
                                                        </Typography>
                                                        {event.pod.driverName && (
                                                            <Typography sx={{ fontSize: 11, color: '#15803d' }}>
                                                                {lang === 'ar' ? 'بواسطة المندوب:' : 'Delivered by:'} {event.pod.driverName}
                                                            </Typography>
                                                        )}
                                                        {event.pod.signatureDataUrl && (
                                                            <Box sx={{ mt: 1, bgcolor: '#ffffff', p: 0.5, borderRadius: '6px', border: '1px solid #dcfce7', display: 'inline-block' }}>
                                                                <img
                                                                    src={event.pod.signatureDataUrl}
                                                                    alt="Recipient Signature"
                                                                    style={{ height: '40px', maxWidth: '140px', objectFit: 'contain', display: 'block' }}
                                                                />
                                                            </Box>
                                                        )}
                                                    </Box>
                                                )}

                                                <Typography sx={{ fontSize: 10.5, color: TK.text3, mt: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {lang === 'ar' ? 'المصدر:' : 'Source:'} {source}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Box>
                    );
                })
            )}
        </Box>
    );
};

export default TrackingTimeline;
