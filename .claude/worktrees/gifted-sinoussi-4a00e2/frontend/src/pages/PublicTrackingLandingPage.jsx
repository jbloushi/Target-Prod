import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/env';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';
import {
  STATUS_HEADLINE,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_ALERT_CONFIG,
  PUBLIC_PROGRESS_LABELS,
  PUBLIC_PROGRESS_STEPS,
  getPublicStepIndex,
  getStepIndex,
  normalizeStatus,
} from '../constants/statusConfig';

const API = getApiBaseUrl();

const fmt = {
  date: (ts) => (
    ts
      ? new Date(ts).toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      : 'Not available'
  ),
  time: (ts) => (
    ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''
  ),
  dateTime: (ts) => (ts ? `${fmt.date(ts)} at ${fmt.time(ts)}` : 'Not available'),
};

// Semantic event colors — mirrors StatusPill.jsx + TrackingTimeline
const EVENT_STATUS_COLORS = {
  draft:            '#b36b00',
  pending:          '#b36b00',
  updated:          '#b36b00',
  on_hold:          '#b36b00',
  created:          '#006573',
  pickup_scheduled: '#006573',
  ready_for_pickup: '#006573',
  booked:           '#0050d4',
  picked_up:        '#0050d4',
  in_transit:       '#0050d4',
  out_for_delivery: '#0050d4',
  delivered:        '#2e7d32',
  exception:        '#b31b25',
  failed:           '#b31b25',
  cancelled:        '#b31b25',
  default:          '#575c60',
};

const getEventColor = (status) => {
  if (!status) return EVENT_STATUS_COLORS.default;
  const key = String(status).toLowerCase().replace(/\s+/g, '_');
  return EVENT_STATUS_COLORS[key] || EVENT_STATUS_COLORS.default;
};

// Active dot color for TimelineTab — matches StatusPill
const getActiveStepColor = (normalizedStatus) => {
  if (['exception', 'cancelled', 'failed'].includes(normalizedStatus)) return '#b31b25';
  if (normalizedStatus === 'delivered') return '#2e7d32';
  if (['draft', 'pending', 'on_hold', 'updated'].includes(normalizedStatus)) return '#b36b00';
  if (['created', 'pickup_scheduled', 'ready_for_pickup'].includes(normalizedStatus)) return '#006573';
  return '#0050d4'; // brand blue for booked / picked_up / in_transit / out_for_delivery
};

const ALERT_PALETTE = {
  error:   { bg: '#fff5f5', border: '#fca5a5', titleColor: '#b31b25', textColor: '#7f1d1d', btnBg: '#b31b25' },
  warning: { bg: '#fffbeb', border: '#fcd34d', titleColor: '#b36b00', textColor: '#78350f', btnBg: '#b36b00' },
  neutral: { bg: '#f8fafc', border: '#cbd5e1', titleColor: '#575c60', textColor: '#334155', btnBg: '#575c60' },
};

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f6f8fb',
    color: '#102033',
    fontFamily: '"Inter", "Manrope", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  topBar: {
    background: '#ffffff',
    borderBottom: '1px solid #e4ebf4',
  },
  topBarInner: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '22px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontWeight: 800,
    fontSize: 18,
    color: '#0b5bd3',
    letterSpacing: 0,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: '#0b5bd3',
    color: '#ffffff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    fontSize: 13,
  },
  supportText: {
    fontSize: 13,
    color: '#66758a',
  },
  hero: {
    background: '#ffffff',
    borderBottom: '1px solid #e4ebf4',
  },
  heroInner: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '36px 24px 30px',
  },
  searchBar: {
    display: 'flex',
    maxWidth: 640,
    marginBottom: 30,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 48,
    padding: '0 16px',
    border: '1px solid #ccd7e5',
    borderRight: 'none',
    borderRadius: '8px 0 0 8px',
    background: '#ffffff',
    color: '#102033',
    fontSize: 15,
    outline: 'none',
  },
  searchBtn: {
    height: 48,
    padding: '0 28px',
    border: '1px solid #0b5bd3',
    borderRadius: '0 8px 8px 0',
    background: '#0b5bd3',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 800,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 10,
    color: '#5e6f84',
    fontSize: 13,
  },
  trackingCode: {
    color: '#0b5bd3',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  statusHeadline: {
    margin: '0 0 6px',
    maxWidth: 760,
    fontSize: 36,
    lineHeight: 1.12,
    color: '#102033',
    fontWeight: 850,
  },
  lastUpdate: {
    color: '#66758a',
    fontSize: 14,
    marginBottom: 6,
  },
  carrierDetail: {
    color: '#4b5f76',
    fontSize: 15,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  routeBar: {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, 190px) 1fr minmax(120px, 190px)',
    alignItems: 'center',
    gap: 16,
    marginTop: 28,
  },
  routePlace: {
    fontWeight: 800,
    color: '#102033',
    fontSize: 14,
  },
  routeDest: {
    fontWeight: 800,
    color: '#102033',
    fontSize: 14,
    textAlign: 'right',
  },
  track: {
    position: 'relative',
    height: 34,
  },
  tabBar: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '0 24px',
    display: 'flex',
    gap: 26,
    overflowX: 'auto',
  },
  tabBtn: (active) => ({
    padding: '17px 0',
    border: 'none',
    borderBottom: active ? '3px solid #0b5bd3' : '3px solid transparent',
    background: 'transparent',
    color: active ? '#0b5bd3' : '#66758a',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: active ? 800 : 650,
    whiteSpace: 'nowrap',
  }),
  content: {
    maxWidth: 1120,
    margin: '0 auto',
    padding: '24px',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e4ebf4',
    borderRadius: 8,
    boxShadow: '0 14px 34px rgba(16, 32, 51, 0.06)',
    padding: '24px 28px',
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: '190px 1fr',
    gap: 18,
    padding: '14px 0',
    borderBottom: '1px solid #edf2f7',
    fontSize: 14,
  },
  detailLabel: {
    color: '#66758a',
  },
  detailValue: {
    color: '#102033',
    fontWeight: 800,
  },
  statePanel: {
    maxWidth: 620,
    marginTop: 10,
    padding: '18px 20px',
    borderRadius: 8,
    border: '1px solid #d8e2ef',
    background: '#f8fbff',
    color: '#4b5f76',
    fontSize: 14,
  },
  errorPanel: {
    maxWidth: 620,
    padding: '18px 20px',
    borderRadius: 8,
    border: '1px solid #f1b8b8',
    background: '#fff7f7',
    color: '#a72525',
    fontSize: 14,
  },
};

<<<<<<< HEAD
function AlertBanner({ config }) {
  const c = ALERT_PALETTE[config.severity] || ALERT_PALETTE.neutral;
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 8,
      padding: '16px 20px',
      marginBottom: 24,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 800, color: c.titleColor, fontSize: 14, marginBottom: 4 }}>
          {config.title}
        </div>
        <div style={{ color: c.textColor, fontSize: 13, lineHeight: 1.5 }}>
          {config.message}
        </div>
      </div>
      {config.cta && (
        <a
          href={config.ctaHref}
          style={{
            padding: '9px 20px',
            borderRadius: 6,
            background: c.btnBg,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            alignSelf: 'center',
          }}
        >
          {config.cta}
        </a>
      )}
    </div>
  );
}

function mergeEvents(shipment) {
  // Backend returns unified `events`; legacy fields kept as fallback
  const combined = [
    ...(shipment?.events || []),
    ...(shipment?.carrierEvents || []),
    ...(shipment?.internalEvents || []),
  ];
  // Deduplicate by timestamp + status in case sources overlap
  const seen = new Set();
  return combined
    .filter((event) => {
      if (!event?.timestamp) return false;
      const key = `${event.timestamp}-${event.status}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
=======
const normalizeEventText = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const publicEventKey = (event) => {
  const desc = normalizeEventText(event?.description || event?.status);
  const loc = normalizeEventText(
    typeof event?.location === 'string'
      ? event.location
      : (event?.location?.formattedAddress || event?.location?.city || placeLabel(event?.location))
  );
  return `${desc}|${loc}`;
};

function mergeEvents(shipment) {
  const merged = [...(shipment?.carrierEvents || []), ...(shipment?.internalEvents || [])]
    .filter((event) => event?.timestamp);
  return dedupeTrackingEvents(merged, publicEventKey)
>>>>>>> 587f502 (Deduplicate repeated carrier checkpoints in tracking history)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function placeLabel(place) {
  if (!place) return '';
  const country = place.countryCode || place.country || '';
  return [place.city, country].filter(Boolean).join(' - ');
}

function RouteProgressBar({ originCity, destCity, stepIndex }) {
  const total = Math.max(1, PUBLIC_PROGRESS_STEPS.length - 1);
  const pct = Math.max(0, Math.min(100, (stepIndex / total) * 100));

  return (
    <div className="tracking-route">
      <div style={styles.routeBar}>
        <div style={styles.routePlace}>{originCity || 'Origin'}</div>
        <div style={styles.track}>
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 16,
            height: 2,
            background: '#d8e1ed',
          }}
          />
          <div style={{
            position: 'absolute',
            left: 0,
            width: `${pct}%`,
            top: 16,
            height: 3,
            background: '#0b5bd3',
          }}
          />
          {PUBLIC_PROGRESS_STEPS.map((step, index) => {
            const pos = (index / total) * 100;
            const active = index <= stepIndex;
            return (
              <div
                key={step}
                title={PUBLIC_PROGRESS_LABELS[step]}
                style={{
                  position: 'absolute',
                  left: `${pos}%`,
                  top: 17,
                  width: active ? 14 : 12,
                  height: active ? 14 : 12,
                  borderRadius: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: active ? '#0b5bd3' : '#ffffff',
                  border: `2px solid ${active ? '#0b5bd3' : '#b4c1d2'}`,
                  boxShadow: active && index === stepIndex ? '0 0 0 6px rgba(11, 91, 211, 0.12)' : 'none',
                }}
              />
            );
          })}
        </div>
        <div style={styles.routeDest}>{destCity || 'Destination'}</div>
      </div>
      <div className="route-labels">
        {PUBLIC_PROGRESS_STEPS.map((step, index) => (
          <span
            key={step}
            style={{
              color: index <= stepIndex ? '#102033' : '#66758a',
              fontWeight: index === stepIndex ? 800 : 600,
              textAlign: index === 0 ? 'left' : index === PUBLIC_PROGRESS_STEPS.length - 1 ? 'right' : 'center',
            }}
          >
            {PUBLIC_PROGRESS_LABELS[step]}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShipmentDetailsTab({ shipment }) {
  const rows = [
    { label: 'Pieces', value: shipment.totalPieces ?? 1 },
    { label: 'Shipment Type', value: shipment.shipmentType === 'documents' ? 'Document Express' : 'Standard Package' },
    { label: 'Waybill Number', value: shipment.trackingNumber },
    { label: 'Created', value: fmt.date(shipment.createdAt) },
    shipment.estimatedDelivery ? { label: 'Estimated Delivery', value: fmt.date(shipment.estimatedDelivery) } : null,
  ].filter(Boolean);

  return (
    <div style={styles.card}>
      {rows.map(({ label, value }) => (
        <div key={label} style={styles.detailRow} className="detail-row">
          <span style={styles.detailLabel}>{label}</span>
          <span style={styles.detailValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineTab({ status, normalizedStatus, events, shipment }) {
  // DHL-style: group all actual events by date, show full detail per event
  const fmtFullDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };
  const fmtTimeWithTz = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hrs = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mins = String(Math.abs(offset) % 60).padStart(2, '0');
    return `${time} (LT, ${sign}${hrs}:${mins})`;
  };

  const groups = useMemo(() => {
    const map = {};
    events.forEach((event) => {
      const dateKey = fmtFullDate(event.timestamp);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
    return map;
  }, [events]);
  const dateKeys = Object.keys(groups);

  // Piece / tracking info
  const pieceCount = shipment?.totalPieces || 1;
  const carrierTrackingNo = shipment?.dhlTrackingNumber || shipment?.trackingNumber || '';

  if (events.length === 0) {
    return (
      <div style={styles.card}>
        <p style={{ color: '#66758a', textAlign: 'center', margin: '24px 0', fontSize: 14 }}>
          No tracking events recorded yet. Updates will appear here once the shipment is processed.
        </p>
      </div>
    );
  }

  let globalIdx = 0;

  return (
    <div style={styles.card}>
      {dateKeys.map((dateKey, dateIndex) => {
        const dayEvents = groups[dateKey];
        const isLatestDay = dateIndex === 0;

        return (
          <div key={dateKey} style={{ marginBottom: dateIndex < dateKeys.length - 1 ? 8 : 0 }}>
            {/* ── Date header (DHL-style) ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0 10px',
              borderBottom: '1px solid #edf2f7',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                background: isLatestDay ? getEventColor(dayEvents[0]?.status) : '#c6d2e2',
                boxShadow: isLatestDay ? `0 0 0 4px ${getEventColor(dayEvents[0]?.status)}20` : 'none',
              }} />
              <span style={{
                fontSize: 15, fontWeight: 800, color: '#102033',
                fontFamily: "'Manrope', sans-serif",
              }}>
                {dateKey}
              </span>
            </div>

            {/* ── Events for this day ── */}
            {dayEvents.map((event, dayIdx) => {
              const isFirst = globalIdx === 0;
              globalIdx++;
              const eventColor = getEventColor(event.status);
              const isCarrier = event.source === 'carrier';
              const location = event.location && event.location !== 'Unknown' ? event.location : null;
              const isLast = dayIdx === dayEvents.length - 1 && dateIndex === dateKeys.length - 1;

              return (
                <div
                  key={`${event.timestamp}-${dayIdx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '12px 1fr',
                    columnGap: 16,
                    position: 'relative',
                  }}
                >
                  {/* Vertical connector + dot */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Connector line above dot */}
                    <div style={{
                      width: 2, height: 16,
                      background: (dayIdx === 0 && dateIndex === 0) ? 'transparent' : '#d8e1ed',
                    }} />
                    {/* Dot */}
                    <div style={{
                      width: isFirst ? 10 : 8,
                      height: isFirst ? 10 : 8,
                      borderRadius: '50%',
                      background: eventColor,
                      flexShrink: 0,
                      boxShadow: isFirst ? `0 0 0 4px ${eventColor}20` : 'none',
                    }} />
                    {/* Connector line below dot */}
                    {!isLast && (
                      <div style={{ width: 2, flex: 1, minHeight: 20, background: '#d8e1ed' }} />
                    )}
                  </div>

                  {/* Event content */}
                  <div style={{
                    padding: '8px 0 16px',
                    borderBottom: isLast ? 'none' : '1px solid #f5f7fa',
                  }}>
                    {/* Time + Location row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                      fontSize: 13, color: '#5a6a7d', marginBottom: 4,
                    }}>
                      <span style={{ fontWeight: 600 }}>{fmtTimeWithTz(event.timestamp)}</span>
                      {location && (
                        <>
                          <span style={{ color: '#c6d2e2' }}>|</span>
                          <span style={{ fontWeight: 600, textTransform: 'uppercase' }}>{location}</span>
                        </>
                      )}
                    </div>

                    {/* Description */}
                    <div style={{
                      fontSize: 14, fontWeight: isFirst ? 800 : 700,
                      color: '#102033', lineHeight: 1.5, marginBottom: 4,
                    }}>
                      {event.description || STATUS_LABELS[event.status] || 'Tracking update'}
                    </div>

                    {/* Piece ID + source row */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                      fontSize: 12, color: '#8296a8',
                    }}>
                      <span>
                        {pieceCount} Piece{pieceCount > 1 ? 's' : ''} ID: ({carrierTrackingNo})
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                        color: isCarrier ? '#0b5bd3' : '#64748b',
                        background: isCarrier ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${isCarrier ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: 3, padding: '1px 6px',
                      }}>
                        {isCarrier ? 'Carrier' : 'Platform'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function EventLogTab({ events }) {
  if (events.length === 0) {
    return (
      <div style={styles.card}>
        <p style={{ color: '#66758a', textAlign: 'center', margin: '18px 0' }}>
          No tracking events recorded yet. Check back soon.
        </p>
      </div>
    );
  }

  // Group events by calendar date
  const groups = {};
  events.forEach((event) => {
    const dateKey = fmt.date(event.timestamp);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(event);
  });
  const dateKeys = Object.keys(groups);
  let globalIndex = 0;

  return (
    <div style={styles.card}>
<<<<<<< HEAD
      {dateKeys.map((dateKey, dateIndex) => {
        const dayEvents = groups[dateKey];
        const isLatestDay = dateIndex === 0;

        return (
          <div key={dateKey} style={{ marginBottom: dateIndex < dateKeys.length - 1 ? 24 : 0 }}>
            {/* Date divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: isLatestDay ? '#0b5bd3' : '#8296a8', whiteSpace: 'nowrap',
              }}>
                {dateKey}
              </span>
              <div style={{ flex: 1, height: 1, background: '#edf2f7' }} />
              <span style={{ fontSize: 11, color: '#9aabc0', whiteSpace: 'nowrap' }}>
                {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
              </span>
=======
      {events.map((event, index) => (
        <div
          key={`${event.timestamp}-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '18px 1fr minmax(120px, auto)',
            gap: 14,
            padding: '16px 0',
            borderBottom: index === events.length - 1 ? 'none' : '1px solid #edf2f7',
          }}
          className="event-row"
        >
          <span style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: index === 0 ? '#0b5bd3' : '#9aabc0',
            marginTop: 5,
            boxShadow: index === 0 ? '0 0 0 5px rgba(11, 91, 211, 0.12)' : 'none',
          }}
          />
          <div>
            <div style={{ color: '#102033', fontWeight: index === 0 ? 850 : 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{event.description || event.status || 'Tracking update'}</span>
              {event.occurrences > 1 && (
                <span
                  title={`Repeated ${event.occurrences} times — first at ${fmt.time(event.firstTimestamp)}`}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: 'rgba(11, 91, 211, 0.1)',
                    color: '#0b5bd3',
                  }}
                >
                  ×{event.occurrences}
                </span>
              )}
            </div>
            {event.location && (
              <div style={{ color: '#66758a', fontSize: 13, marginTop: 4 }}>{event.location}</div>
            )}
            <div style={{ color: '#7a899d', fontSize: 12, marginTop: 5 }}>
              {event.source === 'carrier' ? 'Carrier network' : 'Target Logistics'}
>>>>>>> 587f502 (Deduplicate repeated carrier checkpoints in tracking history)
            </div>

            {/* Events for this day */}
            {dayEvents.map((event, dayIdx) => {
              const isLatest = globalIndex === 0;
              globalIndex++;
              const eventColor = getEventColor(event.status);
              const isCarrier = event.source === 'carrier';
              const location = event.location && event.location !== 'Unknown' ? event.location : null;

              return (
                <div
                  key={`${event.timestamp}-${dayIdx}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '14px 1fr auto',
                    columnGap: 14,
                    paddingBottom: dayIdx < dayEvents.length - 1 ? 14 : 0,
                    marginBottom: dayIdx < dayEvents.length - 1 ? 14 : 0,
                    borderBottom: dayIdx < dayEvents.length - 1 ? '1px solid #f0f4f8' : 'none',
                  }}
                >
                  {/* Status dot */}
                  <div style={{ paddingTop: 4 }}>
                    <div style={{
                      width: isLatest ? 12 : 8,
                      height: isLatest ? 12 : 8,
                      borderRadius: '50%',
                      background: eventColor,
                      boxShadow: isLatest ? `0 0 0 4px ${eventColor}22` : 'none',
                    }} />
                  </div>

                  {/* Content */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        color: '#102033', fontWeight: isLatest ? 800 : 600, fontSize: 14, lineHeight: 1.4,
                      }}>
                        {event.description || event.status || 'Tracking update'}
                      </span>
                      {isLatest && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
                          color: '#fff', background: eventColor, borderRadius: 3, padding: '2px 6px',
                        }}>
                          LATEST
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {location && (
                        <span style={{ color: '#66758a', fontSize: 12 }}>
                          📍 {location}
                        </span>
                      )}
                      {location && <span style={{ color: '#d0d9e4', fontSize: 10 }}>•</span>}
                      <span style={{
                        fontSize: 11, fontWeight: 600,
                        color: isCarrier ? '#0b5bd3' : '#64748b',
                        background: isCarrier ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${isCarrier ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: 4, padding: '1px 7px',
                      }}>
                        {isCarrier ? 'Carrier' : 'Platform'}
                      </span>
                    </div>
                  </div>

                  {/* Time */}
                  <div style={{ textAlign: 'right', flexShrink: 0, color: isLatest ? eventColor : '#8296a8', fontSize: 12, fontWeight: isLatest ? 700 : 400, paddingTop: 2 }}>
                    {fmt.time(event.timestamp)}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const PublicTrackingPage = () => {
  const { trackingNumber: paramTrackingNumber } = useParams();
  const navigate = useNavigate();
  const fetchedRef = useRef(null);

  const [searchInput, setSearchInput] = useState(paramTrackingNumber || '');
  const [trackingNumber, setTrackingNumber] = useState(paramTrackingNumber || '');
  const [shipment, setShipment] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchShipment = useCallback(async (tn) => {
    if (!tn) return;

    setLoading(true);
    setError('');

    try {
      const res = await axios.get(`${API}/public/shipments/${tn}`);
      if (res.data.success) {
        setShipment(res.data.data);
      } else {
        setShipment(null);
        setError('Shipment not found.');
      }
    } catch (err) {
      setShipment(null);
      setError(err.response?.data?.error || 'Shipment not found.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paramTrackingNumber && paramTrackingNumber !== fetchedRef.current) {
      fetchedRef.current = paramTrackingNumber;
      setTrackingNumber(paramTrackingNumber);
      setSearchInput(paramTrackingNumber);
      fetchShipment(paramTrackingNumber);
    }
  }, [fetchShipment, paramTrackingNumber]);

  const events = useMemo(() => mergeEvents(shipment), [shipment]);
  const lastEvent = events[0];
  const stepIndex = shipment ? getPublicStepIndex(shipment.status) : 0;
  const normalizedStatus = normalizeStatus(shipment?.status);
  const alertConfig = STATUS_ALERT_CONFIG[normalizedStatus] || null;

  // Latest meaningful description from any event (carrier preferred, platform fallback)
  const latestDescription = useMemo(() => {
    if (!lastEvent?.description) return null;
    const statusLabel = String(normalizedStatus).replace(/_/g, ' ');
    if (lastEvent.description.toLowerCase() === statusLabel.toLowerCase()) return null;
    return lastEvent.description;
  }, [lastEvent, normalizedStatus]);

  const handleSearch = (event) => {
    event.preventDefault();
    const nextTrackingNumber = searchInput.trim();

    if (!nextTrackingNumber) return;

    fetchedRef.current = nextTrackingNumber;
    setTrackingNumber(nextTrackingNumber);
    navigate(`/track/${nextTrackingNumber}`);
    fetchShipment(nextTrackingNumber);
  };

  const tabs = [
    { id: 'details', label: 'Shipment Details' },
    { id: 'timeline', label: 'Shipment Timeline' },
    { id: 'events', label: 'Event Log' },
  ];

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <div style={styles.topBarInner}>
          <div style={styles.brand}>
            <span style={styles.brandMark}>TL</span>
            <span>Target Logistics</span>
          </div>
          <div style={styles.supportText}>Shipment tracking</div>
        </div>
      </header>

      <main>
        <section style={styles.hero}>
          <div style={styles.heroInner}>
            <form onSubmit={handleSearch} style={styles.searchBar} className="tracking-search">
              <input
                style={styles.searchInput}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Enter your tracking number"
                aria-label="Tracking number"
              />
              <button type="submit" style={styles.searchBtn}>Track</button>
            </form>

            {loading && <div style={styles.statePanel}>Loading tracking details...</div>}
            {!loading && error && <div style={styles.errorPanel}>{error}</div>}

            {!loading && shipment && (
              <>
                <div style={styles.meta}>
                  <span style={styles.trackingCode}>Tracking Code: {shipment.trackingNumber}</span>
                  <span>{shipment.carrierCode || shipment.carrier || 'Target Logistics'}</span>
                </div>

                <h1 style={styles.statusHeadline}>
                  {STATUS_HEADLINE[normalizedStatus] || 'Tracking update available'}
                </h1>

                {/* Date + location + description under status headline */}
                {lastEvent ? (
                  <div style={{ marginBottom: alertConfig ? 20 : 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ color: '#66758a', fontSize: 14 }}>
                        {fmt.dateTime(lastEvent.timestamp)}
                      </span>
                      {lastEvent.location && (
                        <>
                          <span style={{ color: '#c5d0dc', fontSize: 12 }}>·</span>
                          <span style={{ color: '#4b6278', fontSize: 14, fontWeight: 600 }}>
                            📍 {lastEvent.location}
                          </span>
                        </>
                      )}
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: lastEvent.source === 'carrier' ? '#0b5bd3' : '#64748b',
                        background: lastEvent.source === 'carrier' ? '#eff6ff' : '#f1f5f9',
                        border: `1px solid ${lastEvent.source === 'carrier' ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: 4,
                        padding: '2px 7px',
                      }}>
                        {lastEvent.source === 'carrier' ? 'Carrier' : 'Platform'}
                      </span>
                    </div>
                    {latestDescription && (
                      <div style={{ color: '#4b5f76', fontSize: 15, fontStyle: 'italic' }}>
                        "{latestDescription}"
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ ...styles.lastUpdate, marginBottom: 28 }}>
                    Tracking events will appear here once the shipment starts moving.
                  </div>
                )}

                {/* Alert banner for actionable statuses */}
                {alertConfig && <AlertBanner config={alertConfig} />}

                <RouteProgressBar
                  originCity={placeLabel(shipment.origin)}
                  destCity={placeLabel(shipment.destination)}
                  stepIndex={stepIndex}
                />
              </>
            )}

            {!loading && !shipment && !error && !trackingNumber && (
              <div style={styles.statePanel}>Enter a tracking number to view shipment status and events.</div>
            )}
          </div>

          {!loading && shipment && (
            <nav style={styles.tabBar} aria-label="Tracking details">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  style={styles.tabBtn(activeTab === tab.id)}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          )}
        </section>

        {!loading && shipment && (
          <section style={styles.content}>
            {activeTab === 'details' && <ShipmentDetailsTab shipment={shipment} />}
            {activeTab === 'timeline' && (
              <TimelineTab status={shipment.status} normalizedStatus={normalizedStatus} events={events} shipment={shipment} />
            )}
            {activeTab === 'events' && <EventLogTab events={events} />}
          </section>
        )}
      </main>

      <style>{`
        .route-labels {
          display: grid;
          grid-template-columns: repeat(${PUBLIC_PROGRESS_STEPS.length}, minmax(0, 1fr));
          gap: 12px;
          margin: 8px 206px 0;
          font-size: 12px;
        }

        @media (max-width: 720px) {
          .tracking-search {
            max-width: none;
          }

          .tracking-route > div:first-child {
            grid-template-columns: 1fr;
            gap: 8px;
          }

          .tracking-route > div:first-child > div:last-child {
            text-align: left !important;
          }

          .route-labels {
            display: none;
          }

          .detail-row {
            grid-template-columns: 1fr !important;
            gap: 5px !important;
          }

          .event-row {
            grid-template-columns: 18px 1fr !important;
          }

          .event-row > div:last-child {
            grid-column: 2;
            text-align: left !important;
          }
        }

        @media (max-width: 520px) {
          .tracking-search {
            display: grid !important;
            grid-template-columns: 1fr;
          }

          .tracking-search input {
            border-right: 1px solid #ccd7e5 !important;
            border-radius: 8px 8px 0 0 !important;
          }

          .tracking-search button {
            border-radius: 0 0 8px 8px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default PublicTrackingPage;
