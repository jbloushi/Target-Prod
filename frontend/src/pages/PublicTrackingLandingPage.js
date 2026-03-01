import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  STATUS_ORDER, STATUS_LABELS, STATUS_HEADLINE,
  PUBLIC_PROGRESS_STEPS, PUBLIC_PROGRESS_LABELS,
  normalizeStatus, getStepIndex, getPublicStepIndex
} from '../constants/statusConfig';

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const API = process.env.REACT_APP_API_URL || '';

const fmt = {
  date: (ts) => ts ? new Date(ts).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—',
  time: (ts) => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
  dateTime: (ts) => ts ? `${fmt.date(ts)} at ${fmt.time(ts)}` : '—',
};

const CARRIER_LABELS = { DGR: 'DHL Express', FEDEX: 'FedEx', UPS: 'UPS', default: 'Carrier' };

function getCarrierLabel(code) {
  return CARRIER_LABELS[code] || code || CARRIER_LABELS.default;
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const styles = {
  page: {
    minHeight: '100vh',
    background: '#0a0e1a',
    fontFamily: '"Outfit", "Delivery", sans-serif',
    color: '#e8eaf0',
  },
  // Hero
  hero: {
    background: '#141929',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    padding: '0',
  },
  heroInner: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '32px 16px',
  },
  searchBar: {
    display: 'flex',
    gap: 0,
    marginBottom: 24,
    maxWidth: 520,
  },
  searchInput: {
    flex: 1,
    padding: '12px 18px',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRight: 'none',
    borderRadius: '12px 0 0 12px',
    fontSize: 14,
    outline: 'none',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
  },
  searchBtn: {
    padding: '12px 24px',
    background: '#00d9b8',
    color: '#0a0e1a',
    border: 'none',
    borderRadius: '0 12px 12px 0',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  trackingCode: {
    fontWeight: 700,
    fontSize: 13,
    color: '#00d9b8',
    marginBottom: 4,
    letterSpacing: '0.5px',
  },
  carrier: {
    fontSize: 13,
    color: 'rgba(232, 234, 240, 0.7)',
    marginBottom: 16,
  },
  statusHeadline: {
    fontWeight: 800,
    fontSize: 24,
    color: '#fff',
    marginBottom: 8,
  },
  lastUpdate: {
    fontSize: 13,
    color: 'rgba(232, 234, 240, 0.6)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  // Progress bar
  routeBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '24px 0 8px',
    fontSize: 13,
  },
  routeOrigin: { fontWeight: 700, color: '#fff', minWidth: 100 },
  routeDest: { fontWeight: 700, color: '#fff', minWidth: 100, textAlign: 'right' },
  routeTrack: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  // Tabs
  tabBar: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '0 16px',
    display: 'flex',
    gap: 16,
  },
  tabBtn: (active) => ({
    padding: '16px 4px',
    border: 'none',
    background: 'none',
    borderBottom: active ? '3px solid #00d9b8' : '3px solid transparent',
    fontWeight: active ? 700 : 500,
    fontSize: 14,
    color: active ? '#00d9b8' : 'rgba(232, 234, 240, 0.5)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease',
  }),
  // Content
  content: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '16px',
  },
  card: {
    background: '#141929',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: '24px 28px',
    marginBottom: 20,
    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
  },
  // Detail rows
  detailRow: {
    display: 'flex',
    padding: '12px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    fontSize: 14,
  },
  detailLabel: { width: 180, color: 'rgba(232, 234, 240, 0.5)', flexShrink: 0 },
  detailValue: { fontWeight: 600, color: '#fff' },
  // Timeline stepper
  stepper: { padding: '8px 0' },
  stepRow: (active, done) => ({
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
    paddingBottom: done ? 0 : 20,
    opacity: !done && !active ? 0.3 : 1,
  }),
  stepDot: (active, done) => ({
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: done ? '#00d9b8' : active ? '#00d9b8' : 'rgba(255,255,255,0.1)',
    border: active ? '4px solid #00d9b8' : done ? 'none' : '2px solid rgba(255,255,255,0.2)',
    flexShrink: 0,
    marginTop: 4,
    boxShadow: active ? '0 0 15px rgba(0,217,184,0.4)' : 'none',
  }),
  stepConnector: (done) => ({
    width: 2,
    minHeight: 32,
    background: done ? '#00d9b8' : 'rgba(255,255,255,0.1)',
    margin: '4px 0 4px 6px',
  }),
  // Event log
  eventRow: () => ({
    display: 'flex',
    gap: 16,
    padding: '16px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  }),
  eventDot: () => ({
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#00d9b8',
    flexShrink: 0,
    marginTop: 6,
    boxShadow: '0 0 8px rgba(0,217,184,0.2)',
  }),
  // States
  notFound: {
    maxWidth: 500,
    margin: '80px auto',
    textAlign: 'center',
    padding: 32,
    background: '#141929',
    borderRadius: 24,
    border: '1px solid rgba(255,255,255,0.08)',
  },
  loader: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 80,
  },
};

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function RouteProgressBar({ originCity, destCity, stepIndex }) {
  const total = STATUS_ORDER.length - 1;
  const pct = Math.max(2, Math.min(98, (stepIndex / total) * 100));
  const DOTS = 7;
  return (
    <div>
      <div style={styles.routeBar}>
        <span style={styles.routeOrigin}>{originCity || 'Origin'}</span>
        <div style={styles.routeTrack}>
          {/* Track line */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: '#e0e0e0', transform: 'translateY(-50%)' }} />
          <div style={{ position: 'absolute', left: 0, width: `${pct}%`, top: '50%', height: 2, background: '#00d9b8', transform: 'translateY(-50%)', boxShadow: '0 0 10px rgba(0,217,184,0.3)' }} />
          {/* Dots */}
          {Array.from({ length: DOTS }).map((_, i) => {
            const pos = (i / (DOTS - 1)) * 100;
            const filled = pos <= pct;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${pos}%`,
                  transform: 'translate(-50%, -50%)',
                  top: '50%',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: filled ? '#d40511' : '#d0d0d0',
                  border: '2px solid #fff',
                  zIndex: 1,
                }}
              />
            );
          })}
          {/* Plane marker */}
          <div style={{ position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)', top: -18, fontSize: 18, zIndex: 2 }}>✈️</div>
        </div>
        <span style={styles.routeDest}>{destCity || 'Destination'}</span>
      </div>
    </div>
  );
}

function ShipmentDetailsTab({ shipment }) {
  const rows = [
    { label: 'Pieces', value: shipment.totalPieces ?? 1 },
    { label: 'Shipment Type', value: shipment.shipmentType === 'documents' ? 'Document' : 'Package' },
    { label: 'Waybill Number', value: shipment.trackingNumber },
    { label: 'Created', value: fmt.date(shipment.createdAt) },
    shipment.estimatedDelivery
      ? { label: 'Est. Delivery', value: fmt.date(shipment.estimatedDelivery) }
      : null,
  ].filter(Boolean);

  return (
    <div style={styles.card}>
      {rows.map(({ label, value }) => (
        <div key={label} style={styles.detailRow}>
          <span style={styles.detailLabel}>{label}</span>
          <span style={styles.detailValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineTab({ status }) {
  const currentIdx = getStepIndex(status);
  return (
    <div style={styles.card}>
      <div style={styles.stepper}>
        {STATUS_ORDER.map((step, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          const isLast = i === STATUS_ORDER.length - 1;
          return (
            <div key={step}>
              <div style={styles.stepRow(active, done)}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={styles.stepDot(active, done)} />
                  {!isLast && <div style={styles.stepConnector(i < currentIdx)} />}
                </div>
                <div style={{ paddingTop: 0 }}>
                  <div style={{ fontWeight: done ? 700 : 400, fontSize: 14, color: active ? '#00d9b8' : done ? '#fff' : 'rgba(232, 234, 240, 0.4)' }}>
                    {STATUS_LABELS[step]}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventLogTab({ events }) {
  // Events come pre-sorted from the API (newest first)
  const all = (events || []).filter(e => e.timestamp);

  if (all.length === 0) {
    return (
      <div style={styles.card}>
        <p style={{ color: '#888', textAlign: 'center', margin: '24px 0' }}>
          No tracking events recorded yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      {all.map((e, i) => (
        <div key={i} style={styles.eventRow()}>
          <div style={styles.eventDot()} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: i === 0 ? 700 : 400, fontSize: 14, color: i === 0 ? '#fff' : 'rgba(232, 234, 240, 0.7)' }}>
              {e.description || e.status}
            </div>
            {e.location && (
              <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>{e.location}</div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#666' }}>{fmt.date(e.timestamp)}</div>
            <div style={{ fontSize: 11, color: '#999' }}>{fmt.time(e.timestamp)}</div>
            <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>
              {e.source === 'carrier' ? 'Global Network' : 'Logistics Center'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
const PublicTrackingPage = () => {
  const { trackingNumber: paramTN } = useParams();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState(paramTN || '');
  const [trackingNumber, setTrackingNumber] = useState(paramTN || '');
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('details');
  const fetchedRef = useRef(null);

  const fetchShipment = useCallback(async (tn) => {
    if (!tn) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API}/public/shipments/${tn}`);
      if (res.data.success) {
        setShipment(res.data.data);
      } else {
        setError('Shipment not found.');
        setShipment(null);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Shipment not found.';
      setError(msg);
      setShipment(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paramTN && paramTN !== fetchedRef.current) {
      fetchedRef.current = paramTN;
      setTrackingNumber(paramTN);
      setSearchInput(paramTN);
      fetchShipment(paramTN);
    }
  }, [paramTN, fetchShipment]);

  const handleSearch = (e) => {
    e.preventDefault();
    const tn = searchInput.trim();
    if (!tn) return;
    navigate(`/track/${tn}`);
    setTrackingNumber(tn);
    fetchShipment(tn);
  };

  const lastEvent = shipment
    ? [...(shipment.carrierEvents || []), ...(shipment.internalEvents || [])]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
    : null;

  const stepIndex = shipment ? getStepIndex(shipment.status) : 0;

  const TABS = [
    { id: 'details', label: 'Shipment Details', icon: '📄' },
    { id: 'timeline', label: 'Shipment Timeline', icon: '🕐' },
    { id: 'events', label: 'Event Log', icon: '☰' },
  ];

  return (
    <div style={styles.page}>
      {/* ── Hero ── */}
      <div style={styles.hero}>
        <div style={styles.heroInner}>
          {/* Search bar */}
          <form onSubmit={handleSearch} style={styles.searchBar}>
            <input
              style={styles.searchInput}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Enter your tracking number(s)"
            />
            <button type="submit" style={styles.searchBtn}>Track</button>
          </form>

          {loading && (
            <div style={styles.loader}>
              <div style={{ width: 36, height: 36, border: '3px solid #eee', borderTopColor: '#d40511', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: '20px', background: '#fff3f3', border: '1px solid #f5bcbc', borderRadius: 4, color: '#c00', fontSize: 14 }}>
              {error}
            </div>
          )}

          {!loading && shipment && (
            <>
              <div style={styles.trackingCode}>Tracking Code: <strong>{shipment.trackingNumber}</strong></div>

              <div style={styles.statusHeadline}>
                {STATUS_HEADLINE[normalizeStatus(shipment.status)] || 'Tracking update available'}
              </div>

              {lastEvent && (
                <div style={styles.lastUpdate}>
                  <span>🕐</span>
                  <span>
                    Last Update: {fmt.dateTime(lastEvent.timestamp)}
                    {lastEvent.location ? `, ${lastEvent.location}` : ''}
                  </span>
                </div>
              )}

              <RouteProgressBar
                originCity={shipment.origin?.city ? `${shipment.origin.city} - ${shipment.origin.countryCode || shipment.origin.country || ''}` : ''}
                destCity={shipment.destination?.city ? `${shipment.destination.city} - ${shipment.destination.countryCode || shipment.destination.country || ''}` : ''}
                stepIndex={stepIndex}
              />
            </>
          )}

          {!loading && !shipment && !error && !trackingNumber && (
            <p style={{ color: '#777', fontSize: 14 }}>Enter a tracking number above to view shipment status and events.</p>
          )}
        </div>

        {/* ── Tabs ── */}
        {!loading && shipment && (
          <div style={styles.tabBar}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                style={styles.tabBtn(activeTab === tab.id)}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab Content ── */}
      {!loading && shipment && (
        <div style={styles.content}>
          {activeTab === 'details' && <ShipmentDetailsTab shipment={shipment} />}
          {activeTab === 'timeline' && <TimelineTab status={shipment.status} />}
          {activeTab === 'events' && (
            <EventLogTab
              carrierEvents={shipment.carrierEvents || []}
              internalEvents={shipment.internalEvents || []}
            />
          )}
        </div>
      )}

      {/* ── Mobile responsive ── */}
      <style>{`
                @media (max-width: 600px) {
                    /* tabs scroll horizontally on mobile */
                    div[data-tabnav] {
                        overflow-x: auto;
                        -webkit-overflow-scrolling: touch;
                    }
                    /* details rows stack on mobile */
                }
            `}</style>
    </div>
  );
};

export default PublicTrackingPage;
