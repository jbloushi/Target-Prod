import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/env';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';
import {
  STATUS_HEADLINE,
  STATUS_LABELS,
  STATUS_ORDER,
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
    margin: '0 0 10px',
    maxWidth: 760,
    fontSize: 36,
    lineHeight: 1.12,
    color: '#102033',
    fontWeight: 850,
  },
  lastUpdate: {
    color: '#66758a',
    fontSize: 14,
    marginBottom: 28,
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
  const merged = (
    shipment?.events
    || [...(shipment?.carrierEvents || []), ...(shipment?.internalEvents || [])]
  ).filter((event) => event?.timestamp);
  return dedupeTrackingEvents(merged, publicEventKey)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function rawEventsForLog(shipment) {
  const raw = shipment?.rawEvents || shipment?.events || [];
  return [...raw].filter((event) => event?.timestamp).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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

const EVENT_LABELS = {
  created: 'Shipment created',
  pickup: 'Shipment picked up',
  arrived_facility: 'Arrived at facility',
  processed: 'Processed at facility',
  departed_facility: 'Departed facility',
  customs_update: 'Customs clearance updated',
  hold: 'Shipment on hold'
};

function TimelineTab({ events = [] }) {
  if (!events.length) {
    return <div style={styles.card}><p style={{ color: '#66758a', margin: 0 }}>No timeline events available yet.</p></div>;
  }

  const grouped = events.reduce((acc, event) => {
    const key = fmt.date(event.timestamp);
    acc[key] = acc[key] || [];
    acc[key].push(event);
    return acc;
  }, {});

  return (
    <div style={styles.card}>
      {Object.entries(grouped).map(([date, dayEvents]) => (
        <div key={date} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#0b5bd3', marginBottom: 8 }}>{date}</div>
          {dayEvents.map((event, index) => (
            <div key={`${event.timestamp}-${index}`} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 220px', gap: 10, padding: '8px 0', borderBottom: '1px solid #eef3fa' }}>
              <div style={{ color: '#66758a', fontSize: 12 }}>{fmt.time(event.timestamp)}</div>
              <div style={{ fontSize: 13, color: '#102033', fontWeight: 700 }}>{EVENT_LABELS[event.canonicalStatus] || event.description || event.status}</div>
              <div style={{ color: '#66758a', fontSize: 12 }}>{event.normalizedLocation || event.location}</div>
            </div>
          ))}
        </div>
      ))}
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

  return (
    <div style={styles.card}>
      {events.map((event, index) => (
        <div
          key={`${event.timestamp}-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '18px 1fr minmax(120px, auto)',
            gap: 14,
            padding: '16px 0',
            borderBottom: index === events.length - 1 ? 'none' : '1px solid #dfe8f5',
          }}
          className="event-row"
        >
          <span style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: index === 0 ? '#0b5bd3' : '#7f93ad',
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
                    background: 'rgba(11, 91, 211, 0.12)',
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
            </div>
          </div>
          <div style={{ textAlign: 'right', color: '#66758a', fontSize: 12 }}>
            <div>{fmt.date(event.timestamp)}</div>
            <div>{fmt.time(event.timestamp)}</div>
          </div>
        </div>
      ))}
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
  const rawEvents = useMemo(() => rawEventsForLog(shipment), [shipment]);
  const timelineEvents = events.length > 0 ? events : rawEvents;
  const lastEvent = events[0];
  const stepIndex = shipment ? getPublicStepIndex(shipment.status) : 0;
  const normalizedStatus = normalizeStatus(shipment?.status);

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

                <div style={styles.lastUpdate}>
                  {lastEvent
                    ? `Last update: ${fmt.dateTime(lastEvent.timestamp)}${lastEvent.location ? `, ${lastEvent.location}` : ''}`
                    : 'Tracking events will appear here once the shipment starts moving.'}
                </div>

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
            {activeTab === 'timeline' && <TimelineTab events={timelineEvents} />}
            {activeTab === 'events' && <EventLogTab events={rawEvents} />}
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
