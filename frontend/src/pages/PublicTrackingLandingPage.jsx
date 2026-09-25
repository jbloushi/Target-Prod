import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/env';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';
import LocationLabel from '../components/LocationLabel';
import StatusBadge from '../components/common/StatusBadge';
import TradeRouteDisplay from '../components/common/TradeRouteDisplay';
import { getEventDisplayMessage } from '../utils/shipmentDisplay';
import {
  STATUS_HEADLINE,
  STATUS_LABELS,
  PUBLIC_PROGRESS_LABELS,
  PUBLIC_PROGRESS_STEPS,
  getPublicStepIndex,
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

const getDisplayTimestamp = (eventOrTimestamp) => {
  if (eventOrTimestamp && typeof eventOrTimestamp === 'object') {
    return eventOrTimestamp.localTimestamp || eventOrTimestamp.timestamp;
  }
  return eventOrTimestamp;
};

const formatDisplayDateParts = (eventOrTimestamp) => {
  const timestamp = getDisplayTimestamp(eventOrTimestamp);
  const localMatch = String(timestamp || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (localMatch) {
    const [, year, month, day, hour, minute] = localMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const hourNumber = Number(hour);
    const hour12 = hourNumber % 12 || 12;
    const suffix = hourNumber >= 12 ? 'PM' : 'AM';
    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
      time: `${String(hour12).padStart(2, '0')}:${minute} ${suffix}`
    };
  }
  return {
    date: fmt.date(timestamp),
    time: fmt.time(timestamp)
  };
};

const normalizeEventText = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const publicEventKey = (event) => {
  const desc = normalizeEventText(event?.description || event?.status);
  const loc = normalizeEventText(
    typeof event?.location === 'string'
      ? event.location
      : (event?.location?.formattedAddress || event?.location?.city || '')
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

const DEMO_PRESETS = [
  { id: 'DGR-KW-DEMO-001', label: 'DGR Express to London', tag: 'Dangerous Goods' },
  { id: 'TRK-KW-TRANSIT-005', label: 'GCC Air Transit', tag: 'In Transit' },
  { id: 'TRK-KW-DELIVERED-007', label: 'Bader Trading Kuwait', tag: 'Delivered + POD' }
];

export const PublicTrackingLandingPage = () => {
  const { trackingNumber: paramTrackingNumber } = useParams();
  const navigate = useNavigate();
  const fetchedRef = useRef(null);

  const [searchInput, setSearchInput] = useState(paramTrackingNumber || '');
  const [trackingNumber, setTrackingNumber] = useState(paramTrackingNumber || '');
  const [shipment, setShipment] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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
        setError('Shipment not found. Please verify the tracking number.');
      }
    } catch (err) {
      setShipment(null);
      setError(err.response?.data?.error || 'Shipment not found. Please verify the tracking number.');
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

  const handleCopy = () => {
    if (!shipment?.trackingNumber) return;
    navigator.clipboard.writeText(shipment.trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!shipment?.trackingNumber) return;
    const url = window.location.origin ? `${window.location.origin}/track/${shipment.trackingNumber}` : `https://target-kw.com/track/${shipment.trackingNumber}`;
    const text = encodeURIComponent(`Track your shipment #${shipment.trackingNumber} with Target Logistics: ${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const nextTrackingNumber = searchInput.trim();
    if (!nextTrackingNumber) return;

    fetchedRef.current = nextTrackingNumber;
    setTrackingNumber(nextTrackingNumber);
    navigate(`/track/${nextTrackingNumber}`);
    fetchShipment(nextTrackingNumber);
  };

  const handlePresetClick = (id) => {
    setSearchInput(id);
    fetchedRef.current = id;
    setTrackingNumber(id);
    navigate(`/track/${id}`);
    fetchShipment(id);
  };

  return (
    <div className="min-h-screen bg-base-200/50 flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Top Navbar */}
      <header className="navbar bg-base-100 border-b border-base-200 px-4 sm:px-8 py-3 sticky top-0 z-40 shadow-sm backdrop-blur-md bg-base-100/90">
        <div className="flex-1 flex items-center gap-3">
          <Link to="/track" className="flex items-center gap-2.5 text-primary font-black text-lg tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center font-black text-sm shadow-md shadow-primary/20">
              TL
            </div>
            <div className="flex flex-col">
              <span className="leading-tight font-extrabold text-base-content">Target Logistics</span>
              <span className="text-[10px] text-primary uppercase font-bold tracking-widest">Global Express</span>
            </div>
          </Link>
        </div>
        <div className="flex-none flex items-center gap-2">
          <Link to="/returns" className="btn btn-ghost btn-sm text-xs font-bold gap-1 text-base-content/70 hover:text-primary">
            <span className="material-symbols-outlined text-sm">assignment_return</span>
            <span>Returns Portal</span>
          </Link>
          <a
            href="https://wa.me/96590000000"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-primary btn-sm text-xs font-bold gap-1"
          >
            <span className="material-symbols-outlined text-sm">support_agent</span>
            <span>Kuwait Support</span>
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Search Hero Section */}
        <section className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
          <div className="card-body p-6 sm:p-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3 border border-primary/20">
                <span className="material-symbols-outlined text-sm">radar</span>
                <span>Live Consignment Radar</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-base-content tracking-tight">
                Track Your Shipment in Real-Time
              </h1>
              <p className="text-sm text-base-content/60 mt-1">
                Enter your waybill or parcel reference number to view customs clearances, flight checkpoints, and delivery ETA.
              </p>
            </div>

            {/* Search Input Bar */}
            <form onSubmit={handleSearch} className="mt-5 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-xl pointer-events-none">
                  barcode_scanner
                </span>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter tracking number (e.g. TRK-KW-100234 or DGR-10029)..."
                  className="input input-bordered w-full pl-11 pr-4 font-mono font-medium text-sm focus:input-primary bg-base-100 transition-all"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="btn btn-ghost btn-circle btn-xs absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || !searchInput.trim()}
                className="btn btn-primary font-bold px-6 gap-2 text-sm shadow-md shadow-primary/20"
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">search</span>
                    <span>Track</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-base-200">
              <span className="text-xs font-bold text-base-content/40 uppercase tracking-wider">Example consignments:</span>
              {DEMO_PRESETS.map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  onClick={() => handlePresetClick(demo.id)}
                  className="btn btn-xs btn-outline border-base-300 hover:border-primary hover:bg-primary/5 text-base-content/70 hover:text-primary gap-1.5"
                >
                  <span className="font-mono">{demo.id}</span>
                  <span className="badge badge-xs badge-neutral">{demo.tag}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Loading State */}
        {loading && (
          <div className="card bg-base-100 border border-base-200 p-8 flex flex-col items-center justify-center gap-3">
            <span className="loading loading-ring loading-lg text-primary" />
            <p className="text-sm font-bold text-base-content/60 animate-pulse">
              Retrieving live telemetry and carrier checkpoints...
            </p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="alert alert-error shadow-sm text-sm">
            <span className="material-symbols-outlined text-lg">error</span>
            <div className="flex-1">
              <div className="font-bold">Shipment Lookup Notice</div>
              <div className="text-xs opacity-90">{error}</div>
            </div>
          </div>
        )}

        {/* Shipment Active Result View */}
        {!loading && shipment && (
          <div className="space-y-6">
            {/* Hero Waybill Card */}
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="p-6 sm:p-8 space-y-6">
                {/* Meta Row: Tracking Code, Actions, Status */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-base-200">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-mono font-black text-lg sm:text-xl text-base-content">
                      {shipment.trackingNumber}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="btn btn-xs btn-ghost border border-base-300 hover:border-primary gap-1"
                      title="Copy Tracking Number"
                    >
                      <span className="material-symbols-outlined text-xs">
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="btn btn-xs bg-[#25D366] text-white hover:bg-[#1ebc57] border-none gap-1 shadow-sm"
                      title="Share Tracking Link on WhatsApp"
                    >
                      <span className="material-symbols-outlined text-xs">chat</span>
                      <span>WhatsApp</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="badge badge-neutral font-bold text-xs gap-1 py-3 px-3">
                      <span className="material-symbols-outlined text-sm">local_shipping</span>
                      {shipment.carrierCode || shipment.carrier || 'Target Network'}
                    </span>
                    <StatusBadge status={shipment.status} size="md" />
                  </div>
                </div>

                {/* Status Headline & Relative Updated Time */}
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-base-content tracking-tight">
                    {STATUS_HEADLINE[normalizedStatus] || 'Consignment in motion'}
                  </h2>
                  <p className="text-sm text-base-content/60 mt-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-primary">schedule</span>
                    <span>
                      {lastEvent
                        ? `Last activity: ${fmt.dateTime(lastEvent.timestamp)}${lastEvent.location ? ` • ${lastEvent.location}` : ''}`
                        : 'Consignment booked. Awaiting initial collection scan.'}
                    </span>
                  </p>
                </div>

                {/* Trade Route Corridor Bar */}
                <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined">flight_takeoff</span>
                    </div>
                    <div>
                      <div className="text-xs text-base-content/50 font-bold uppercase tracking-wider">Trade Corridor</div>
                      <TradeRouteDisplay
                        origin={shipment.origin}
                        destination={shipment.destination}
                        size="md"
                      />
                    </div>
                  </div>

                  {shipment.estimatedDelivery && (
                    <div className="text-right sm:border-l sm:border-base-200 sm:pl-6">
                      <div className="text-xs text-base-content/50 font-bold uppercase tracking-wider">Estimated Delivery</div>
                      <div className="font-extrabold text-sm text-primary">
                        {fmt.date(shipment.estimatedDelivery)}
                      </div>
                    </div>
                  )}
                </div>

                {/* DaisyUI Horizontal Steps Progress Bar */}
                <div className="pt-4 overflow-x-auto">
                  <ul className="steps steps-horizontal w-full">
                    {PUBLIC_PROGRESS_STEPS.map((stepKey, idx) => {
                      const isComplete = idx <= stepIndex;
                      const isCurrent = idx === stepIndex;
                      return (
                        <li
                          key={stepKey}
                          data-content={isComplete ? '✓' : idx + 1}
                          className={`step text-xs font-bold transition-all ${
                            isComplete ? 'step-primary' : ''
                          } ${isCurrent ? 'font-black scale-105' : ''}`}
                        >
                          <span className={isCurrent ? 'text-primary font-black underline' : 'text-base-content/70'}>
                            {PUBLIC_PROGRESS_LABELS[stepKey] || stepKey}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>

            {/* Receiver Action Callout Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pin GPS Location CTA */}
              <div className="card bg-gradient-to-br from-primary to-primary-focus text-primary-content p-6 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shrink-0">
                      📍
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base leading-tight">Pin Delivery GPS Location</h3>
                      <p className="text-xs opacity-85 mt-0.5">Assist the courier driver with exact Kuwait address coordinates.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between">
                  <span className="text-[11px] opacity-75">Kuwait PACI / Map Pin</span>
                  <button
                    type="button"
                    onClick={() => navigate(`/track/${shipment.trackingNumber}/location`)}
                    className="btn btn-sm bg-white text-primary hover:bg-white/90 border-none font-bold text-xs shadow-sm"
                  >
                    Open Location Pin
                  </button>
                </div>
              </div>

              {/* Online Returns / Documents */}
              <div className="card bg-base-100 border border-base-200 p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center text-xl shrink-0">
                      🔄
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-base-content leading-tight">Customer Return & Paperwork</h3>
                      <p className="text-xs text-base-content/60 mt-0.5">Initiate 14-day hassle-free reverse parcel returns or print AWB.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-base-200 flex items-center justify-between gap-2">
                  <a
                    href={`${API}/shipments/${shipment.trackingNumber}/label`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-xs btn-ghost border border-base-300 text-xs font-bold gap-1"
                  >
                    <span className="material-symbols-outlined text-xs">print</span>
                    <span>Air Waybill</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => navigate(`/returns/${shipment.trackingNumber}`)}
                    className="btn btn-xs btn-outline btn-secondary text-xs font-bold gap-1"
                  >
                    <span className="material-symbols-outlined text-xs">assignment_return</span>
                    <span>Check Return</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Detailed Tabs: Dossier, Timeline, Event Log */}
            <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
              <div className="border-b border-base-200 px-6 pt-4 bg-base-100">
                <div role="tablist" className="tabs tabs-bordered">
                  <button
                    role="tab"
                    type="button"
                    onClick={() => setActiveTab('details')}
                    className={`tab tab-bordered font-bold text-sm gap-2 pb-3 ${
                      activeTab === 'details' ? 'tab-active text-primary border-primary' : 'text-base-content/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">inventory_2</span>
                    <span>Shipment Dossier</span>
                  </button>
                  <button
                    role="tab"
                    type="button"
                    onClick={() => setActiveTab('timeline')}
                    className={`tab tab-bordered font-bold text-sm gap-2 pb-3 ${
                      activeTab === 'timeline' ? 'tab-active text-primary border-primary' : 'text-base-content/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">timeline</span>
                    <span>Milestone Timeline ({timelineEvents.length})</span>
                  </button>
                  <button
                    role="tab"
                    type="button"
                    onClick={() => setActiveTab('events')}
                    className={`tab tab-bordered font-bold text-sm gap-2 pb-3 ${
                      activeTab === 'events' ? 'tab-active text-primary border-primary' : 'text-base-content/60'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">receipt_long</span>
                    <span>Carrier Telemetry</span>
                  </button>
                </div>
              </div>

              <div className="p-6">
                {/* Tab 1: Dossier Details */}
                {activeTab === 'details' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-xs text-base-content/50 font-bold uppercase">Total Pieces</div>
                      <div className="text-lg font-black text-base-content mt-1">{shipment.totalPieces ?? shipment.pieces?.length ?? 1} Units</div>
                    </div>
                    <div className="p-4 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-xs text-base-content/50 font-bold uppercase">Shipment Type</div>
                      <div className="text-lg font-black text-base-content mt-1">
                        {shipment.shipmentType === 'documents' ? 'Document Express' : 'Standard Air Parcel'}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-xs text-base-content/50 font-bold uppercase">Total Gross Weight</div>
                      <div className="text-lg font-black text-base-content mt-1">
                        {shipment.weight ? `${shipment.weight} kg` : (shipment.totalWeight ? `${shipment.totalWeight} kg` : 'N/A')}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-xs text-base-content/50 font-bold uppercase">Chargeable Volumetric</div>
                      <div className="text-lg font-black text-base-content mt-1">
                        {shipment.chargeableWeight ? `${shipment.chargeableWeight} kg` : 'Calculated at Hub'}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-xs text-base-content/50 font-bold uppercase">Booking Date</div>
                      <div className="text-sm font-black text-base-content mt-1">{fmt.date(shipment.createdAt)}</div>
                    </div>
                    <div className="p-4 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-xs text-base-content/50 font-bold uppercase">Payment Terms</div>
                      <div className="text-sm font-black text-base-content mt-1 uppercase">
                        {shipment.paymentMethod || 'Prepaid Airfreight'}
                      </div>
                    </div>

                    {/* Dangerous Goods Banner if applicable */}
                    {shipment.isDangerousGoods && (
                      <div className="sm:col-span-2 md:col-span-3 p-4 rounded-xl bg-warning/10 border border-warning/30 flex items-center gap-3">
                        <span className="material-symbols-outlined text-warning text-2xl">warning</span>
                        <div className="text-xs text-warning-content">
                          <strong className="block font-bold">IATA Dangerous Goods Declared</strong>
                          <span>
                            Class {shipment.dgClass || '9'} • UN {shipment.unNumber || 'UN3481'} ({shipment.properShippingName || 'Lithium Ion Batteries'}). Special handling rules in effect.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Milestone Timeline */}
                {activeTab === 'timeline' && (
                  <div className="space-y-6">
                    {timelineEvents.length === 0 ? (
                      <div className="text-center py-8 text-base-content/50">
                        <span className="material-symbols-outlined text-4xl mb-2">hourglass_empty</span>
                        <p className="text-sm font-medium">No milestone events recorded yet. Updates will appear once scanned at the intake hub.</p>
                      </div>
                    ) : (
                      <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-base-300">
                        {timelineEvents.map((evt, idx) => {
                          const dateParts = formatDisplayDateParts(evt);
                          const isLatest = idx === 0;
                          return (
                            <div key={`${evt.timestamp}-${idx}`} className="relative group">
                              <span
                                className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 transition-all ${
                                  isLatest
                                    ? 'bg-primary border-primary ring-4 ring-primary/20'
                                    : 'bg-base-100 border-base-300'
                                }`}
                              />
                              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                                <div className="text-sm font-extrabold text-base-content">
                                  {getEventDisplayMessage(evt, evt.status || 'Status update')}
                                </div>
                                <div className="text-xs text-base-content/50 font-mono">
                                  {dateParts.date} • {dateParts.time}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <LocationLabel location={evt.normalizedLocation || evt.location} className="text-xs text-base-content/60" />
                                {evt.source && (
                                  <span className="badge badge-xs badge-ghost text-[10px]">
                                    {evt.source === 'carrier' ? 'Carrier Network' : 'Target Hub'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Event Log / Raw Telemetry */}
                {activeTab === 'events' && (
                  <div className="space-y-3">
                    {timelineEvents.length === 0 ? (
                      <div className="text-center py-8 text-base-content/50">
                        No telemetry logs available.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="table table-zebra table-xs w-full">
                          <thead>
                            <tr className="text-base-content/60">
                              <th>Time</th>
                              <th>Event</th>
                              <th>Location</th>
                              <th>Originating Source</th>
                              <th>Occurrences</th>
                            </tr>
                          </thead>
                          <tbody>
                            {timelineEvents.map((evt, idx) => {
                              const dateParts = formatDisplayDateParts(evt);
                              return (
                                <tr key={`${evt.timestamp}-${idx}`} className="font-mono">
                                  <td className="whitespace-nowrap">{dateParts.date} {dateParts.time}</td>
                                  <td className="font-bold text-base-content">{getEventDisplayMessage(evt)}</td>
                                  <td>
                                    <LocationLabel location={evt.location} />
                                  </td>
                                  <td>
                                    <span className="badge badge-xs badge-neutral">
                                      {evt.source || 'target_ops'}
                                    </span>
                                  </td>
                                  <td>
                                    {evt.occurrences > 1 ? (
                                      <span className="badge badge-xs badge-primary">x{evt.occurrences}</span>
                                    ) : '1'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty Search Landing Explainer */}
        {!loading && !shipment && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="card bg-base-100 border border-base-200 p-5 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined">flight</span>
              </div>
              <h3 className="font-black text-sm text-base-content">Air Cargo Radar</h3>
              <p className="text-xs text-base-content/60 mt-1">Direct API integration with DHL, FedEx, and Middle East air cargo networks.</p>
            </div>

            <div className="card bg-base-100 border border-base-200 p-5 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center mb-3">
                <span className="material-symbols-outlined">verified</span>
              </div>
              <h3 className="font-black text-sm text-base-content">GCC Customs Gateways</h3>
              <p className="text-xs text-base-content/60 mt-1">Live tracking of import permits, duty payments, and customs clearance releases.</p>
            </div>

            <div className="card bg-base-100 border border-base-200 p-5 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center mb-3">
                <span className="material-symbols-outlined">chat</span>
              </div>
              <h3 className="font-black text-sm text-base-content">Meta WhatsApp Alerts</h3>
              <p className="text-xs text-base-content/60 mt-1">Subscribed recipients receive automated out-for-delivery and delivery alerts.</p>
            </div>

            <div className="card bg-base-100 border border-base-200 p-5 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center mb-3">
                <span className="material-symbols-outlined">draw</span>
              </div>
              <h3 className="font-black text-sm text-base-content">Digital POD Signatures</h3>
              <p className="text-xs text-base-content/60 mt-1">Instant touch-screen driver signature verification and photographic proof of delivery.</p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer footer-center p-6 bg-base-100 text-base-content/60 text-xs border-t border-base-200 mt-12">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link to="/track" className="link link-hover font-bold text-primary">Track Parcel</Link>
          <Link to="/returns" className="link link-hover">Self-Service Returns</Link>
          <Link to="/privacy" className="link link-hover">Privacy Policy</Link>
          <Link to="/terms" className="link link-hover">Terms of Service</Link>
        </div>
        <p>© 2026 Target Logistics Global Express W.L.L. All Rights Reserved. State of Kuwait.</p>
      </footer>
    </div>
  );
};

export default PublicTrackingLandingPage;
