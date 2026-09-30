import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useLanguage } from '../context/LanguageContext';
import { getApiBaseUrl } from '../utils/env';
import { dedupeTrackingEvents } from '../utils/dedupeTrackingEvents';
import LocationLabel from '../components/LocationLabel';
import StatusBadge from '../components/common/StatusBadge';
import { getEventDisplayMessage } from '../utils/shipmentDisplay';
import {
  STATUS_HEADLINE,
  PUBLIC_PROGRESS_STEPS,
  getPublicStepIndex,
  normalizeStatus,
  isStatusAhead,
} from '../constants/statusConfig';

const API = getApiBaseUrl();

const fmt = {
  date: (ts, lang = 'en') => {
    if (!ts) return lang === 'ar' ? 'غير متوفر' : 'Not available';
    return new Date(ts).toLocaleDateString(lang === 'ar' ? 'ar-KW' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  },
  shortDate: (ts, lang = 'en') => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString(lang === 'ar' ? 'ar-KW' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
  },
  time: (ts, lang = 'en') => {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString(lang === 'ar' ? 'ar-KW' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  },
  dateTime: (ts, lang = 'en') => {
    if (!ts) return lang === 'ar' ? 'غير متوفر' : 'Not available';
    return `${fmt.date(ts, lang)} · ${fmt.time(ts, lang)}`;
  },
};

const getDisplayTimestamp = (eventOrTimestamp) => {
  if (eventOrTimestamp && typeof eventOrTimestamp === 'object') {
    return eventOrTimestamp.localTimestamp || eventOrTimestamp.timestamp;
  }
  return eventOrTimestamp;
};

const formatDisplayDateParts = (eventOrTimestamp, lang = 'en') => {
  const timestamp = getDisplayTimestamp(eventOrTimestamp);
  const localMatch = String(timestamp || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (localMatch) {
    const [, year, month, day, hour, minute] = localMatch;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const hourNumber = Number(hour);
    const hour12 = hourNumber % 12 || 12;
    const suffix = hourNumber >= 12 ? 'PM' : 'AM';
    return {
      date: date.toLocaleDateString(lang === 'ar' ? 'ar-KW' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      time: `${String(hour12).padStart(2, '0')}:${minute} ${suffix}`,
    };
  }
  return {
    date: fmt.date(timestamp, lang),
    time: fmt.time(timestamp, lang),
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
    shipment?.events ||
    [...(shipment?.carrierEvents || []), ...(shipment?.internalEvents || [])]
  ).filter((event) => event?.timestamp);
  return dedupeTrackingEvents(merged, publicEventKey).sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

function rawEventsForLog(shipment) {
  const raw = shipment?.rawEvents || shipment?.events || [];
  return [...raw]
    .filter((event) => event?.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

const DEMO_PRESETS = [
  { id: 'DGR-KW-DEMO-001', label: 'DGR Express to London', tag: 'Dangerous Goods' },
  { id: 'TRK-KW-TRANSIT-005', label: 'GCC Air Transit', tag: 'In Transit' },
  { id: 'TRK-KW-DELIVERED-007', label: 'Bader Trading Kuwait', tag: 'Delivered' },
];

export const PublicTrackingLandingPage = () => {
  const { trackingNumber: paramTrackingNumber } = useParams();
  const { lang, toggleLanguage } = useLanguage();
  const isRTL = lang === 'ar';
  const navigate = useNavigate();
  const fetchedRef = useRef(null);

  const [searchInput, setSearchInput] = useState(paramTrackingNumber || '');
  const [trackingNumber, setTrackingNumber] = useState(paramTrackingNumber || '');
  const [shipment, setShipment] = useState(null);
  const [activeTab, setActiveTab] = useState('timeline'); // 'timeline' | 'info' | 'help'
  const [showRawTelemetry, setShowRawTelemetry] = useState(false);
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
        setError(
          lang === 'ar'
            ? 'لم يتم العثور على الشحنة. يرجى التأكد من رقم التتبع المدخل.'
            : 'Shipment not found. Please verify the tracking number.'
        );
      }
    } catch (err) {
      setShipment(null);
      setError(
        err.response?.data?.error ||
          (lang === 'ar'
            ? 'لم يتم العثور على الشحنة. يرجى التأكد من رقم التتبع المدخل.'
            : 'Shipment not found. Please verify the tracking number.')
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

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
  const lastEvent = events[0] || timelineEvents[0];

  const effectiveStatus = useMemo(() => {
    if (!shipment) return 'draft';
    const rawNorm = normalizeStatus(shipment.status);
    if (rawNorm === 'cancelled') return 'cancelled';
    const hasDelivered = timelineEvents.some((e) => {
      const s = normalizeStatus(e.status || e.description);
      return s === 'delivered';
    });
    if (rawNorm === 'delivered' || hasDelivered) return 'delivered';
    if (lastEvent) {
      const lastNorm = normalizeStatus(lastEvent.status || lastEvent.description);
      if (lastNorm === 'exception') return 'exception';
      if (['picked_up', 'received_at_hub', 'in_transit', 'out_for_delivery'].includes(lastNorm)) {
        return lastNorm;
      }
      if (isStatusAhead(rawNorm, lastNorm)) return lastNorm;
    }
    return rawNorm;
  }, [shipment, timelineEvents, lastEvent]);

  const stepIndex = shipment ? getPublicStepIndex(effectiveStatus) : 0;
  const normalizedStatus = effectiveStatus;

  const handleCopy = () => {
    if (!shipment?.trackingNumber) return;
    navigator.clipboard.writeText(shipment.trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareWhatsApp = () => {
    if (!shipment?.trackingNumber) return;
    const url = window.location.origin
      ? `${window.location.origin}/track/${shipment.trackingNumber}`
      : `https://target-kw.com/track/${shipment.trackingNumber}`;
    const text = encodeURIComponent(
      isRTL
        ? `تتبع شحنتك رقم #${shipment.trackingNumber} مع تارغت لوجستكس:\n${url}`
        : `Track your shipment #${shipment.trackingNumber} with Target Logistics:\n${url}`
    );
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

  // Helper for origin & destination display
  const originInfo = useMemo(() => {
    if (!shipment) return { city: 'Kuwait City', country: 'Kuwait', code: 'KW', flag: '🇰🇼' };
    const o = shipment.origin || shipment.sender || {};
    const city = o.city || 'Kuwait City';
    const country = o.country || 'Kuwait';
    const code = o.countryCode || 'KW';
    const flag = code === 'KW' ? '🇰🇼' : code === 'AE' ? '🇦🇪' : code === 'SA' ? '🇸🇦' : code === 'US' ? '🇺🇸' : code === 'GB' ? '🇬🇧' : '🌐';
    return { city, country, code, flag };
  }, [shipment]);

  const destInfo = useMemo(() => {
    if (!shipment) return { city: 'London', country: 'United Kingdom', code: 'GB', flag: '🇬🇧' };
    const d = shipment.destination || shipment.receiver || {};
    const city = d.city || 'Destination';
    const country = d.country || '';
    const code = d.countryCode || '';
    const flag = code === 'GB' ? '🇬🇧' : code === 'US' ? '🇺🇸' : code === 'SA' ? '🇸🇦' : code === 'AE' ? '🇦🇪' : code === 'KW' ? '🇰🇼' : '📍';
    return { city, country, code, flag };
  }, [shipment]);

  // Dynamic Turn 2b Hero H1: Answers "What is it doing right now"
  const heroHeadline = useMemo(() => {
    if (!shipment) return '';
    const targetCity = destInfo.city || destInfo.country || (isRTL ? 'الوجهة' : 'Destination');
    switch (normalizedStatus) {
      case 'delivered':
        return isRTL ? `تم التسليم في ${targetCity}` : `Delivered to ${targetCity}`;
      case 'out_for_delivery':
        return isRTL ? `مع مندوب التوصيل في ${targetCity}` : `Out for delivery in ${targetCity}`;
      case 'exception':
        return isRTL ? `تنبيه: تأخر وصول الشحنة إلى ${targetCity}` : `Delivery delayed on route to ${targetCity}`;
      case 'picked_up':
      case 'received_at_hub':
      case 'in_transit':
        return isRTL ? `في طريقها إلى ${targetCity}` : `On its way to ${targetCity}`;
      default:
        return isRTL ? `تم تسجيل الشحنة إلى ${targetCity}` : `Consignment booked for ${targetCity}`;
    }
  }, [shipment, normalizedStatus, destInfo, isRTL]);

  // Subtitle with ETA and last scan info
  const heroSubtitle = useMemo(() => {
    if (!shipment) return '';
    const etaText = shipment.estimatedDelivery
      ? fmt.date(shipment.estimatedDelivery, lang)
      : (isRTL ? 'قريباً' : 'soon');
    
    let lastScanText = '';
    if (lastEvent) {
      const loc = typeof lastEvent.location === 'object'
        ? (lastEvent.location?.city || lastEvent.location?.formattedAddress || '')
        : (lastEvent.location || '');
      const timeStr = fmt.time(lastEvent.timestamp, lang);
      lastScanText = loc ? (isRTL ? ` · آخر مسح في ${loc} (${timeStr})` : ` · Last scanned at ${loc} (${timeStr})`) : '';
    }

    if (normalizedStatus === 'delivered') {
      return isRTL
        ? `اكتمل التسليم بنجاح${lastScanText}. شكراً لاختيارك تارغت لوجستكس.`
        : `Consignment successfully delivered${lastScanText}. Thank you for choosing Target Logistics.`;
    }

    return isRTL
      ? `موعد الوصول المتوقع: ${etaText}${lastScanText}.`
      : `Arriving ${etaText}${lastScanText}.`;
  }, [shipment, normalizedStatus, lastEvent, lang, isRTL]);

  // Step milestone labels and date indicators for Turn 2b Progress Bar
  const stepDates = useMemo(() => {
    if (!shipment) return {};
    return {
      booked: shipment.createdAt ? fmt.shortDate(shipment.createdAt, lang) : '—',
      picked_up: shipment.pickupDate ? fmt.shortDate(shipment.pickupDate, lang) : (stepIndex >= 1 ? (isRTL ? 'مكتمل' : 'Done') : '—'),
      in_transit: lastEvent?.timestamp ? fmt.shortDate(lastEvent.timestamp, lang) : (stepIndex >= 2 ? (isRTL ? 'نشط' : 'Active') : '—'),
      out_for_delivery: shipment.estimatedDelivery ? fmt.shortDate(shipment.estimatedDelivery, lang) : (isRTL ? 'قريباً' : 'Pending'),
      delivered: normalizedStatus === 'delivered' ? fmt.shortDate(lastEvent?.timestamp || shipment.updatedAt, lang) : (shipment.estimatedDelivery ? fmt.shortDate(shipment.estimatedDelivery, lang) : '—'),
    };
  }, [shipment, lastEvent, normalizedStatus, stepIndex, lang, isRTL]);

  const stepLabels = {
    booked: isRTL ? 'تم الحجز' : 'Booked',
    picked_up: isRTL ? 'تم الاستلام' : 'Picked up',
    in_transit: isRTL ? 'قيد النقل' : 'In transit',
    out_for_delivery: isRTL ? 'مع المندوب' : 'Out for delivery',
    delivered: isRTL ? 'تم التسليم' : 'Delivered',
  };

  return (
    <div className="min-h-screen bg-base-200/40 flex flex-col font-sans selection:bg-primary selection:text-white" dir={isRTL ? 'rtl' : 'ltr'}>
      
      {/* Turn 2b Top Navigation Header */}
      <header className="bg-base-100 border-b border-base-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 text-base-content hover:opacity-90 transition-opacity">
            <div className="w-7 h-7 bg-primary text-primary-content rounded-lg flex items-center justify-center font-black text-sm shadow-sm">
              T
            </div>
            <span className="font-extrabold text-sm sm:text-base tracking-tight">
              Target <span className="text-primary font-black">Logistics</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 text-xs font-semibold">
            <Link to="/track" className="hidden sm:inline-block text-base-content/80 hover:text-primary transition-colors">
              {isRTL ? 'تتبع' : 'Track'}
            </Link>
            <Link to="/returns" className="hidden sm:inline-block text-base-content/80 hover:text-primary transition-colors">
              {isRTL ? 'المرتجعات' : 'Returns'}
            </Link>
            <a
              href="https://wa.me/96522204111"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-block text-base-content/80 hover:text-primary transition-colors"
            >
              {isRTL ? 'المساعدة' : 'Help'}
            </a>
            
            <button
              type="button"
              onClick={toggleLanguage}
              className="btn btn-ghost btn-xs rounded-lg gap-1 border border-base-200 font-bold"
              title="Toggle Arabic / English"
            >
              <span className="material-symbols-outlined text-sm">language</span>
              <span>{lang === 'ar' ? 'English' : 'عربي'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Compact Search Bar & Presets */}
        <section className="card bg-base-100 border border-base-200 shadow-xs p-4 sm:p-5">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={isRTL ? 'أدخل رقم الشحنة (مثال: TRK-KW-100234 أو DGR-10029)...' : 'Enter tracking number (e.g. TRK-KW-100234 or DGR-10029)...'}
                className="input input-sm input-bordered w-full pl-10 pr-8 font-mono font-medium text-xs sm:text-sm focus:input-primary bg-base-100"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="btn btn-ghost btn-circle btn-xs absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !searchInput.trim()}
              className="btn btn-primary btn-sm font-bold px-5 gap-1.5 text-xs shadow-xs"
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-xs" />
                  <span>{isRTL ? 'جاري البحث...' : 'Searching...'}</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">radar</span>
                  <span>{isRTL ? 'تتبع الآن' : 'Track'}</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Preset Demonstrations */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-base-200">
            <span className="text-[11px] font-bold text-base-content/50 uppercase tracking-wider">
              {isRTL ? 'شحنات تجريبية:' : 'Presets:'}
            </span>
            {DEMO_PRESETS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                onClick={() => handlePresetClick(demo.id)}
                className="btn btn-xs btn-ghost border border-base-200 hover:border-primary text-base-content/75 gap-1"
              >
                <span className="font-mono text-[11px]">{demo.id}</span>
                <span className="badge badge-xs badge-neutral text-[9px]">{demo.tag}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Loading Ring */}
        {loading && (
          <div className="card bg-base-100 border border-base-200 p-8 flex flex-col items-center justify-center gap-3">
            <span className="loading loading-ring loading-lg text-primary" />
            <p className="text-xs font-bold text-base-content/60 animate-pulse">
              {isRTL ? 'جاري جلب أحدث تحديثات التتبع ومحطات الفحص...' : 'Retrieving live consignment telemetry and carrier checkpoints...'}
            </p>
          </div>
        )}

        {/* Error Notice */}
        {!loading && error && (
          <div className="alert alert-error shadow-xs text-xs sm:text-sm rounded-xl">
            <span className="material-symbols-outlined text-lg">error</span>
            <div className="flex-1">
              <div className="font-bold">{isRTL ? 'تنبيه استعلام الشحنة' : 'Shipment Lookup Notice'}</div>
              <div className="text-xs opacity-90">{error}</div>
            </div>
          </div>
        )}

        {/* Turn 2b Active Tracking Cockpit View */}
        {!loading && shipment && (
          <div className="space-y-6">

            {/* Turn 2b Hero Card: Answer First + Actions + Route Strip */}
            <div className="card bg-base-100 border border-base-200 shadow-xs p-6 sm:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left (Hero headline & Quick Action buttons) - 7 cols */}
                <div className="lg:col-span-7 space-y-4">
                  <div>
                    {/* Live Status Pill */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>{STATUS_HEADLINE[normalizedStatus] || normalizedStatus.toUpperCase()}</span>
                    </div>

                    {/* Turn 2b H1: Leads with the Answer */}
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-base-content tracking-tight mt-2.5 leading-tight">
                      {heroHeadline}
                    </h1>

                    {/* Subtitle: ETA and last scan */}
                    <p className="text-xs sm:text-sm text-base-content/70 mt-1.5 leading-relaxed font-medium">
                      {heroSubtitle}
                    </p>
                  </div>

                  {/* Two Prominent Action Buttons (Primary + Secondary) */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/track/${shipment.trackingNumber}/location`)}
                      className="btn btn-primary btn-sm sm:btn-md rounded-xl font-bold gap-2 text-xs sm:text-sm shadow-sm"
                    >
                      <span className="material-symbols-outlined text-base sm:text-lg">location_on</span>
                      <span>{isRTL ? 'تثبيت موقع التوصيل على الخريطة' : 'Pin my delivery location'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShareWhatsApp}
                      className="btn btn-outline btn-sm sm:btn-md rounded-xl font-bold gap-2 text-xs sm:text-sm"
                    >
                      <span className="material-symbols-outlined text-base sm:text-lg">notifications</span>
                      <span>{isRTL ? 'تنبيهات الواتساب' : 'Get updates'}</span>
                    </button>
                  </div>
                </div>

                {/* Right (Compact Turn 2b Route Card) - 5 cols */}
                <div className="lg:col-span-5 bg-base-200/50 border border-base-200 rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-base-content/50 block">
                        {isRTL ? 'من' : 'From'}
                      </span>
                      <div className="font-bold text-sm text-base-content flex items-center gap-1.5 mt-0.5">
                        <span>{originInfo.flag}</span>
                        <span>{originInfo.city}</span>
                      </div>
                    </div>

                    <div className="text-end">
                      <span className="text-[10px] font-black uppercase tracking-wider text-base-content/50 block">
                        {isRTL ? 'إلى' : 'To'}
                      </span>
                      <div className="font-bold text-sm text-base-content flex items-center gap-1.5 mt-0.5 justify-end">
                        <span>{destInfo.city}</span>
                        <span>{destInfo.flag}</span>
                      </div>
                    </div>
                  </div>

                  {/* Route Visual Connector */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                    <div className="flex-1 h-0.5 bg-gradient-to-r from-emerald-500 via-primary to-base-300 relative">
                      <span className="material-symbols-outlined absolute left-1/2 -top-2.5 -translate-x-1/2 text-primary text-base">
                        flight_takeoff
                      </span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-base-300 shrink-0"></span>
                  </div>

                  {/* Tracking Code & Copy Bar */}
                  <div className="pt-3 border-t border-base-300/60 flex items-center justify-between text-xs">
                    <span className="text-base-content/60 font-semibold">{isRTL ? 'رقم البوليصة:' : 'Tracking #'}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-base-content">{shipment.trackingNumber}</span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                        title={isRTL ? 'نسخ رقم التتبع' : 'Copy tracking number'}
                      >
                        <span className="material-symbols-outlined text-xs">
                          {copied ? 'check' : 'content_copy'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Turn 2b Progress Bar with Real Step Dates */}
              <div className="mt-8 pt-6 border-t border-base-200">
                <div className="grid grid-cols-5 gap-2 text-center">
                  {PUBLIC_PROGRESS_STEPS.map((stepKey, idx) => {
                    const isCompleted = idx < stepIndex;
                    const isCurrent = idx === stepIndex;
                    const isUpcoming = idx > stepIndex;

                    return (
                      <div key={stepKey} className="flex flex-col items-center">
                        {/* Circle Indicator */}
                        <div className="relative w-full flex items-center justify-center mb-2">
                          {/* Left Connector Line */}
                          {idx > 0 && (
                            <div
                              className={`absolute right-1/2 w-full h-0.5 ${
                                idx <= stepIndex ? 'bg-primary' : 'bg-base-200'
                              }`}
                              style={{ zIndex: 0 }}
                            />
                          )}
                          {/* Right Connector Line */}
                          {idx < 4 && (
                            <div
                              className={`absolute left-1/2 w-full h-0.5 ${
                                idx < stepIndex ? 'bg-primary' : 'bg-base-200'
                              }`}
                              style={{ zIndex: 0 }}
                            />
                          )}
                          {/* Node Icon */}
                          <div
                            className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold relative z-10 transition-all ${
                              isCompleted
                                ? 'bg-primary text-primary-content shadow-xs'
                                : isCurrent
                                ? 'bg-primary text-primary-content ring-4 ring-primary/20 shadow-sm font-black'
                                : 'bg-base-200 text-base-content/40'
                            }`}
                          >
                            {isCompleted ? (
                              <span className="material-symbols-outlined text-xs sm:text-sm">check</span>
                            ) : (
                              <span>{idx + 1}</span>
                            )}
                          </div>
                        </div>

                        {/* Label */}
                        <div
                          className={`text-[10px] sm:text-xs tracking-tight ${
                            isCurrent
                              ? 'font-black text-primary'
                              : isCompleted
                              ? 'font-bold text-base-content'
                              : 'font-medium text-base-content/50'
                          }`}
                        >
                          {stepLabels[stepKey] || stepKey}
                        </div>

                        {/* Date or Status underneath */}
                        <div className="text-[9px] sm:text-[11px] text-base-content/50 font-mono mt-0.5">
                          {stepDates[stepKey] || '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Turn 2b Clean Section Toggles / Secondary Tabs */}
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 border-b border-base-200 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('timeline')}
                  className={`btn btn-sm rounded-xl font-bold text-xs gap-1.5 transition-all ${
                    activeTab === 'timeline'
                      ? 'btn-primary text-primary-content shadow-xs'
                      : 'btn-ghost text-base-content/70 hover:text-base-content'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">timeline</span>
                  <span>{isRTL ? 'الخط الزمني للمراحل' : 'Timeline'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={`btn btn-sm rounded-xl font-bold text-xs gap-1.5 transition-all ${
                    activeTab === 'info'
                      ? 'btn-primary text-primary-content shadow-xs'
                      : 'btn-ghost text-base-content/70 hover:text-base-content'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">info</span>
                  <span>{isRTL ? 'تفاصيل الشحنة' : 'Shipment info'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('help')}
                  className={`btn btn-sm rounded-xl font-bold text-xs gap-1.5 transition-all ${
                    activeTab === 'help'
                      ? 'btn-primary text-primary-content shadow-xs'
                      : 'btn-ghost text-base-content/70 hover:text-base-content'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">assignment_return</span>
                  <span>{isRTL ? 'المرتجعات والمساعدة' : 'Return / help'}</span>
                </button>
              </div>

              {/* Tab 1 Content: Turn 2b Milestone Timeline */}
              {activeTab === 'timeline' && (
                <div className="card bg-base-100 border border-base-200 shadow-xs p-5 sm:p-6 space-y-6">
                  {/* Latest Milestone Highlight Card */}
                  {lastEvent && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-black text-primary uppercase tracking-wider">
                          {isRTL ? 'أحدث تحديث' : 'Latest update'}
                        </div>
                        <div className="font-extrabold text-sm sm:text-base text-base-content mt-1">
                          {getEventDisplayMessage(lastEvent, lastEvent.status || 'Active Scan')}
                        </div>
                        <div className="text-xs text-base-content/60 mt-1 flex items-center gap-2 flex-wrap">
                          <span>{fmt.dateTime(lastEvent.timestamp, lang)}</span>
                          {lastEvent.location && (
                            <>
                              <span>•</span>
                              <LocationLabel location={lastEvent.location} />
                            </>
                          )}
                        </div>
                      </div>
                      <span className="badge badge-primary font-bold text-xs shrink-0">
                        {isRTL ? 'نشط' : 'Current'}
                      </span>
                    </div>
                  )}

                  {/* Chronological Milestone List */}
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-base-content/50 mb-4">
                      {isRTL ? 'سجل المحطات المكتملة' : 'Milestone History'}
                    </h3>

                    {timelineEvents.length === 0 ? (
                      <div className="text-center py-8 text-base-content/50">
                        <span className="material-symbols-outlined text-3xl mb-1">hourglass_empty</span>
                        <p className="text-xs font-medium">
                          {isRTL ? 'بانتظار مسح الاستلام الأول في مركز الفرز.' : 'Awaiting initial collection scan at the sorting facility.'}
                        </p>
                      </div>
                    ) : (
                      <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-base-200">
                        {timelineEvents.map((evt, idx) => {
                          const dateParts = formatDisplayDateParts(evt, lang);
                          const isLatest = idx === 0;

                          return (
                            <div key={`${evt.timestamp}-${idx}`} className="relative">
                              <span
                                className={`absolute -left-6 sm:-left-8 top-1 w-3.5 h-3.5 rounded-full border-2 transition-all ${
                                  isLatest
                                    ? 'bg-primary border-primary ring-4 ring-primary/20'
                                    : 'bg-base-100 border-base-300'
                                }`}
                              />
                              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                                <div className="text-xs sm:text-sm font-bold text-base-content">
                                  {getEventDisplayMessage(evt, evt.status || 'Status update')}
                                </div>
                                <div className="text-[11px] text-base-content/50 font-mono">
                                  {dateParts.date} • {dateParts.time}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <LocationLabel location={evt.normalizedLocation || evt.location} className="text-xs text-base-content/60" />
                                {evt.source && (
                                  <span className="badge badge-xs badge-ghost text-[9px]">
                                    {evt.source === 'carrier' ? (isRTL ? 'شبكة الناقل الدولي' : 'Carrier Network') : (isRTL ? 'مركز تارغت' : 'Target Hub')}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Carrier Telemetry Log disclosure link */}
                  <div className="pt-4 border-t border-base-200 flex justify-between items-center text-xs">
                    <button
                      type="button"
                      onClick={() => setShowRawTelemetry(!showRawTelemetry)}
                      className="link link-hover text-base-content/60 hover:text-primary font-semibold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">
                        {showRawTelemetry ? 'expand_less' : 'tune'}
                      </span>
                      <span>
                        {showRawTelemetry
                          ? (isRTL ? 'إخفاء سجلات التيليميتري الفنية' : 'Hide carrier telemetry log')
                          : (isRTL ? 'عرض سجلات التيليميتري الفنية (للدعم الفني)' : 'View full carrier telemetry log')}
                      </span>
                    </button>
                    <span className="text-base-content/40 text-[11px] font-mono">
                      {timelineEvents.length} {isRTL ? 'أحداث مسجلة' : 'events'}
                    </span>
                  </div>

                  {showRawTelemetry && (
                    <div className="overflow-x-auto rounded-xl border border-base-200 mt-2">
                      <table className="table table-zebra table-xs w-full font-mono text-[11px]">
                        <thead>
                          <tr className="text-base-content/60">
                            <th>{isRTL ? 'الوقت' : 'Time'}</th>
                            <th>{isRTL ? 'الحدث' : 'Event'}</th>
                            <th>{isRTL ? 'الموقع' : 'Location'}</th>
                            <th>{isRTL ? 'المصدر' : 'Source'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {timelineEvents.map((evt, idx) => {
                            const dp = formatDisplayDateParts(evt, lang);
                            return (
                              <tr key={`raw-${idx}`}>
                                <td className="whitespace-nowrap">{dp.date} {dp.time}</td>
                                <td className="font-bold text-base-content">{getEventDisplayMessage(evt)}</td>
                                <td><LocationLabel location={evt.location} /></td>
                                <td>
                                  <span className="badge badge-xs badge-neutral text-[9px]">
                                    {evt.source || 'target_ops'}
                                  </span>
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

              {/* Tab 2 Content: Turn 2b Shipment Info */}
              {activeTab === 'info' && (
                <div className="card bg-base-100 border border-base-200 shadow-xs p-5 sm:p-6 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-base-content/50">
                    {isRTL ? 'المواصفات الفنية للطرود' : 'Package & Waybill Specifications'}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-[11px] text-base-content/50 font-bold uppercase">{isRTL ? 'عدد الطرود' : 'Total Pieces'}</div>
                      <div className="text-base font-black text-base-content mt-1">
                        {shipment.totalPieces ?? shipment.pieces?.length ?? 1} {isRTL ? 'قطعة' : 'Units'}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-[11px] text-base-content/50 font-bold uppercase">{isRTL ? 'نوع الخدمة' : 'Service Type'}</div>
                      <div className="text-base font-black text-base-content mt-1">
                        {shipment.shipmentType === 'documents' ? (isRTL ? 'مستندات سريعة' : 'Document Express') : (isRTL ? 'طرد شحن قياسي' : 'Standard Air Parcel')}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-[11px] text-base-content/50 font-bold uppercase">{isRTL ? 'الوزن الإجمالي' : 'Gross Weight'}</div>
                      <div className="text-base font-black text-base-content mt-1">
                        {shipment.weight ? `${shipment.weight} kg` : (shipment.totalWeight ? `${shipment.totalWeight} kg` : '—')}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-[11px] text-base-content/50 font-bold uppercase">{isRTL ? 'الوزن الحجمي' : 'Chargeable Weight'}</div>
                      <div className="text-base font-black text-base-content mt-1">
                        {shipment.chargeableWeight ? `${shipment.chargeableWeight} kg` : (isRTL ? 'يُحسب في المركز' : 'Calculated at Hub')}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-[11px] text-base-content/50 font-bold uppercase">{isRTL ? 'تاريخ الحجز' : 'Booking Date'}</div>
                      <div className="text-sm font-black text-base-content mt-1">
                        {fmt.date(shipment.createdAt, lang)}
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-base-200/40 border border-base-200">
                      <div className="text-[11px] text-base-content/50 font-bold uppercase">{isRTL ? 'شروط الدفع' : 'Payment Terms'}</div>
                      <div className="text-sm font-black text-base-content mt-1 uppercase">
                        {shipment.paymentMethod || (isRTL ? 'مدفوع مسبقاً' : 'Prepaid')}
                      </div>
                    </div>
                  </div>

                  {/* Dangerous Goods Banner if applicable */}
                  {shipment.isDangerousGoods && (
                    <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 flex items-start gap-3 mt-3">
                      <span className="material-symbols-outlined text-warning text-xl shrink-0 mt-0.5">warning</span>
                      <div className="text-xs text-warning-content">
                        <strong className="block font-bold">
                          {isRTL ? 'شحنة مواد خطرة معلنة (IATA Dangerous Goods)' : 'IATA Dangerous Goods Declared'}
                        </strong>
                        <span className="opacity-90">
                          Class {shipment.dgClass || '9'} • UN {shipment.unNumber || 'UN3481'} ({shipment.properShippingName || 'Lithium Ion Batteries'}).
                          {isRTL ? ' تطبق إجراءات المناولة الخاصة.' : ' Special handling rules in effect.'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3 Content: Turn 2b Return & Help */}
              {activeTab === 'help' && (
                <div className="card bg-base-100 border border-base-200 shadow-xs p-5 sm:p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Return portal */}
                    <div className="p-4 rounded-xl border border-base-200 bg-base-200/30 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center font-bold mb-2">
                          🔄
                        </div>
                        <h4 className="font-extrabold text-sm text-base-content">
                          {isRTL ? 'بوابة المرتجعات الذاتية' : 'Self-Service Parcel Returns'}
                        </h4>
                        <p className="text-xs text-base-content/60 mt-1">
                          {isRTL
                            ? 'يمكنك إنشاء طلب إرجاع أو تبديل خلال 14 يوماً من استلام الشحنة بكل سهولة.'
                            : 'Initiate a 14-day hassle-free reverse parcel return or check your return status.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/returns/${shipment.trackingNumber}`)}
                        className="btn btn-secondary btn-outline btn-xs font-bold gap-1 self-start"
                      >
                        <span className="material-symbols-outlined text-xs">assignment_return</span>
                        <span>{isRTL ? 'فحص الإرجاع' : 'Check Return Status'}</span>
                      </button>
                    </div>

                    {/* Air Waybill PDF Download */}
                    <div className="p-4 rounded-xl border border-base-200 bg-base-200/30 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold mb-2">
                          📄
                        </div>
                        <h4 className="font-extrabold text-sm text-base-content">
                          {isRTL ? 'تحميل بوليصة الشحن (AWB)' : 'Air Waybill & Documents'}
                        </h4>
                        <p className="text-xs text-base-content/60 mt-1">
                          {isRTL
                            ? 'عرض وطباعة بوليصة الشحن الرسمية ورمز الاستجابة السريعة (QR).'
                            : 'View or print official Air Waybill documentation and consignment QR code.'}
                        </p>
                      </div>
                      <a
                        href={`${API}/shipments/${shipment.trackingNumber}/label`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary btn-outline btn-xs font-bold gap-1 self-start"
                      >
                        <span className="material-symbols-outlined text-xs">print</span>
                        <span>{isRTL ? 'طباعة البوليصة' : 'Print Waybill'}</span>
                      </a>
                    </div>
                  </div>

                  {/* Customer Support WhatsApp */}
                  <div className="pt-4 border-t border-base-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-base-content">
                        {isRTL ? 'هل تحتاج إلى مساعدة إضافية بخصوص هذه الشحنة؟' : 'Need assistance with this shipment?'}
                      </div>
                      <div className="text-[11px] text-base-content/60">
                        {isRTL ? 'فريق خدمة العملاء متواجد على مدار الساعة لمتابعة شحنتك.' : 'Customer care operations are available 24/7 on WhatsApp.'}
                      </div>
                    </div>
                    <a
                      href="https://wa.me/96522204111"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-xs bg-[#25D366] text-white hover:bg-[#1ebc57] border-none font-bold gap-1 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-xs">chat</span>
                      <span>{isRTL ? 'محادثة الدعم الفني' : 'WhatsApp Support'}</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Empty State / Initial Landing Informative Features */}
        {!loading && !shipment && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            <div className="card bg-base-100 border border-base-200 p-5 shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2.5">
                <span className="material-symbols-outlined text-lg">flight</span>
              </div>
              <h3 className="font-extrabold text-xs sm:text-sm text-base-content">Air Cargo Radar</h3>
              <p className="text-[11px] text-base-content/60 mt-1 leading-relaxed">Direct API sync with DHL, FedEx, and Middle East air cargo networks.</p>
            </div>

            <div className="card bg-base-100 border border-base-200 p-5 shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-success/10 text-success flex items-center justify-center mb-2.5">
                <span className="material-symbols-outlined text-lg">verified</span>
              </div>
              <h3 className="font-extrabold text-xs sm:text-sm text-base-content">GCC Customs Gateways</h3>
              <p className="text-[11px] text-base-content/60 mt-1 leading-relaxed">Live tracking of import permits, duty payments, and customs clearance.</p>
            </div>

            <div className="card bg-base-100 border border-base-200 p-5 shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-info/10 text-info flex items-center justify-center mb-2.5">
                <span className="material-symbols-outlined text-lg">chat</span>
              </div>
              <h3 className="font-extrabold text-xs sm:text-sm text-base-content">WhatsApp Alerts</h3>
              <p className="text-[11px] text-base-content/60 mt-1 leading-relaxed">Automated out-for-delivery alerts and address confirmation directly to phones.</p>
            </div>

            <div className="card bg-base-100 border border-base-200 p-5 shadow-xs">
              <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center mb-2.5">
                <span className="material-symbols-outlined text-lg">draw</span>
              </div>
              <h3 className="font-extrabold text-xs sm:text-sm text-base-content">Digital POD Signatures</h3>
              <p className="text-[11px] text-base-content/60 mt-1 leading-relaxed">Real-time driver signatures and photographic proof of delivery verification.</p>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="footer footer-center p-6 bg-base-100 text-base-content/60 text-xs border-t border-base-200 mt-12">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link to="/track" className="link link-hover font-bold text-primary">{isRTL ? 'تتبع شحنة' : 'Track Parcel'}</Link>
          <Link to="/returns" className="link link-hover">{isRTL ? 'المرتجعات' : 'Self-Service Returns'}</Link>
          <Link to="/privacy" className="link link-hover">{isRTL ? 'الخصوصية' : 'Privacy Policy'}</Link>
          <Link to="/terms" className="link link-hover">{isRTL ? 'الشروط والأحكام' : 'Terms of Service'}</Link>
        </div>
        <p className="opacity-75">© 2026 Target Logistics Global Express W.L.L. All Rights Reserved. State of Kuwait.</p>
      </footer>
    </div>
  );
};

export default PublicTrackingLandingPage;
