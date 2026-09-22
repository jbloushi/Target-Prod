import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { shipmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useShipments } from '../utils/useShipments';
import { useShipmentStats } from '../utils/useShipmentStats';
import { TK } from '../tokens/kineticHorizon';
import { StatusPill, WInput } from '../ui';
import {
  buildShipmentDeleteBlockedMessage,
  canDeleteShipmentStatus,
  hasCarrierBooking,
  getShipmentDeleteErrorMessage
} from '../utils/shipmentDeletionPolicy';

// ── Action Menu Dropdown ─────────────────────────────
const ActionMenu = ({ onClose, shipment, onView, onEdit, onDelete, onDownloadLabel, onOpenInvoice }) => {
  const { t } = useLanguage();
  const actions = [
    { icon: 'visibility', label: t('action_view_details', 'View Details'), handler: onView && (() => onView(shipment)) },
    { icon: 'description', label: t('action_view_label', 'View Label'), handler: onDownloadLabel && (() => onDownloadLabel(shipment)) },
    { icon: 'local_shipping', label: t('action_awb_waybill', 'AWB / Waybill'), handler: onDownloadLabel && (() => onDownloadLabel(shipment)) },
    { icon: 'receipt', label: t('action_invoice_pdf', 'Invoice PDF'), handler: onOpenInvoice && (() => onOpenInvoice(shipment)) },
    { icon: 'edit', label: t('action_approve_edit', 'Approve / Edit'), divider: true, handler: onEdit && (() => onEdit(shipment)) },
    { icon: 'delete', label: t('action_delete', 'Delete'), divider: true, danger: true, handler: onDelete && (() => onDelete(shipment)) },
  ].filter(a => Boolean(a.handler));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-action-menu]')) onClose();
    };
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div
      data-action-menu
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 300,
        background: '#fff', border: `1px solid ${TK.border}`, borderRadius: 20,
        boxShadow: '0 12px 36px rgba(0,0,0,0.12)', minWidth: 172, overflow: 'hidden',
      }}
    >
      {actions.map((a, i) => (
        <React.Fragment key={i}>
          {a.divider && <div style={{ height: 1, background: TK.border }} />}
          <button
            type="button"
            style={{
              width: '100%', padding: '9px 15px', border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, color: a.danger ? TK.error : TK.text1,
              cursor: 'pointer', textAlign: 'start',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = a.danger ? TK.errorBg : '#f5f7fa'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => { onClose(); a.handler && a.handler(); }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17, color: a.danger ? TK.error : TK.text3 }}>{a.icon}</span>
            {a.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

// ── Desktop Table Row ────────────────────────────────
const SRow = ({ s, isLast, onView, onEdit, onDelete, onDownloadLabel, onOpenInvoice }) => {
  const [hov, setHov] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { lang, t } = useLanguage();

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onView && onView(s)}
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${TK.border}`,
        background: hov ? '#fafbfc' : 'transparent',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
    >
      <td style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: hov ? TK.primary : TK.text1, transition: 'color 0.12s' }}>
            {s.trackingNumber}
          </div>
          {s.isTest && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              fontWeight: 800,
              padding: '1px 6px',
              borderRadius: 4,
              background: '#fef3c7',
              color: '#b45309',
              border: '1px solid #fde68a',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>science</span>
              {lang === 'ar' ? 'تجريبي' : 'TEST'}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.service || t('service_express_air', 'Express Air')}</div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ fontWeight: 600, fontSize: 12.5, color: TK.primary }}>{s.org}</div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.createdBy}</div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <span style={{ fontWeight: 600, color: TK.text1 }}>{s.originCity}</span>
          <span style={{ color: TK.primary, fontWeight: 700 }}>{lang === 'ar' ? '←' : '→'}</span>
          <span style={{ fontWeight: 600, color: TK.text1 }}>{s.destCity}</span>
        </div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>
          {s.originCountry} {lang === 'ar' ? '←' : '→'} {s.destCountry}
        </div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <div style={{ fontSize: 12.5, color: TK.text1, fontWeight: 600 }}>{s.customer}</div>
        <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.phone}</div>
      </td>
      <td style={{ padding: '13px 16px' }}>
        <StatusPill status={s.status} />
      </td>
      <td style={{ padding: '13px 16px', fontSize: 12.5, color: TK.text2 }}>{s.created}</td>
      <td style={{ padding: '13px 16px' }}>
        <span style={{
          fontSize: 12.5, fontWeight: 700,
          color: s.eta === 'Today' || s.eta === 'اليوم' ? TK.success : s.eta === 'Hold' || s.eta === 'معلق' ? TK.error : s.eta === 'Delivered' || s.eta === 'تم التسليم' ? TK.success : TK.text2,
        }}>
          {s.eta === 'Today' ? t('eta_today', 'Today') : s.eta === 'Hold' ? t('eta_hold', 'On Hold') : s.eta === 'Delivered' ? t('eta_delivered', 'Delivered') : s.eta}
        </span>
      </td>
      <td style={{ padding: '13px 12px', textAlign: lang === 'ar' ? 'left' : 'right', position: 'relative' }}>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          style={{
            width: 30, height: 30, borderRadius: 8,
            border: `1px solid ${menuOpen ? TK.primary : TK.border}`,
            background: menuOpen ? TK.primaryBg : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: menuOpen ? TK.primary : TK.text3, transition: 'all 0.15s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_horiz</span>
        </button>
        {menuOpen && (
          <ActionMenu
            shipment={s}
            onClose={() => setMenuOpen(false)}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onDownloadLabel={onDownloadLabel}
            onOpenInvoice={onOpenInvoice}
          />
        )}
      </td>
    </tr>
  );
};

// ── Mobile Card ──────────────────────────────────────
const SMobileCard = ({ s, onView, onEdit, onDelete, onDownloadLabel, onOpenInvoice }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { lang, t } = useLanguage();

  return (
    <div
      onClick={() => onView && onView(s)}
      style={{
        background: '#fff', borderRadius: 20, border: `1px solid ${TK.border}`,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: TK.primary }}>{s.trackingNumber}</div>
            {s.isTest && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 9.5,
                fontWeight: 800,
                padding: '1px 5px',
                borderRadius: 4,
                background: '#fef3c7',
                color: '#b45309',
                border: '1px solid #fde68a',
                letterSpacing: '0.03em',
              }}>
                {lang === 'ar' ? 'تجريبي' : 'TEST'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: TK.text3, marginTop: 2 }}>{s.service || t('service_express_air', 'Express Air')} • {s.org}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusPill status={s.status} />
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              style={{
                width: 28, height: 28, borderRadius: 7,
                border: `1px solid ${TK.border}`, background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: TK.text3,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>more_horiz</span>
            </button>
            {menuOpen && (
              <ActionMenu
                shipment={s}
                onClose={() => setMenuOpen(false)}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                onDownloadLabel={onDownloadLabel}
                onOpenInvoice={onOpenInvoice}
              />
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.text3 }}>flight_takeoff</span>
        <span style={{ fontWeight: 600, color: TK.text1 }}>{s.originCity} ({s.originCountry})</span>
        <span style={{ color: TK.primary, fontWeight: 700 }}>{lang === 'ar' ? '←' : '→'}</span>
        <span style={{ fontWeight: 600, color: TK.text1 }}>{s.destCity} ({s.destCountry})</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px solid ${TK.border}` }}>
        <div>
          <div style={{ fontSize: 10.5, color: TK.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('recipient', 'Customer')}</div>
          <div style={{ fontSize: 12.5, color: TK.text1, fontWeight: 600, marginTop: 1 }}>{s.customer}</div>
        </div>
        <div style={{ textAlign: lang === 'ar' ? 'left' : 'right' }}>
          <div style={{ fontSize: 10.5, color: TK.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_eta', 'ETA')}</div>
          <div style={{
            fontSize: 12.5, fontWeight: 700, marginTop: 1,
            color: s.eta === 'Today' || s.eta === 'اليوم' ? TK.success : s.eta === 'Hold' || s.eta === 'معلق' ? TK.error : s.eta === 'Delivered' || s.eta === 'تم التسليم' ? TK.success : TK.text2,
          }}>{s.eta === 'Today' ? t('eta_today', 'Today') : s.eta === 'Hold' ? t('eta_hold', 'On Hold') : s.eta === 'Delivered' ? t('eta_delivered', 'Delivered') : s.eta}</div>
        </div>
      </div>
    </div>
  );
};

// ── Pagination Button ────────────────────────────────
const PagBtn = ({ onClick, disabled, active, label, icon }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      width: 34, height: 34, borderRadius: 9,
      border: `1.5px solid ${active ? TK.primary : TK.border}`,
      background: active ? TK.primary : 'transparent',
      color: active ? '#fff' : disabled ? TK.text3 : TK.text2,
      fontWeight: 700, fontSize: 12.5,
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: disabled ? 0.35 : 1, transition: 'all 0.12s',
    }}
  >
    {icon
      ? <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      : label
    }
  </button>
);

// ── Adapter: backend shipment shape → table row shape ─
const toRowShape = (s) => {
  const originCity = s.originCity || s.sender?.city || (typeof s.origin === 'string' ? s.origin.split(',')[0] : s.origin?.city) || 'Kuwait City';
  const originCountry = s.originCountry || s.sender?.countryCode || s.originCountryCode || (typeof s.origin === 'object' ? s.origin?.countryCode : null) || 'KW';
  const destCity = s.destCity || s.destinationCity || s.receiver?.city || (typeof s.destination === 'string' ? s.destination.split(',')[0] : s.destination?.city) || 'Dubai';
  const destCountry = s.destCountry || s.receiver?.countryCode || s.destinationCountryCode || (typeof s.destination === 'object' ? s.destination?.countryCode : null) || 'GCC';

  const isTest = Boolean(
    s.isTest === true ||
    s.environment === 'test' ||
    s.pricingSnapshot?.isTest === true ||
    s.pricingSnapshot?.environment === 'test'
  );

  return {
    raw: s,
    id: s.id || s._id || s.trackingNumber,
    trackingNumber: s.trackingNumber || '—',
    isTest,
    org: s.organization?.name || s.organizationName || s.org || 'Standard Org',
    createdBy: s.creator?.name || s.createdByName || s.createdBy || 'Staff User',
    originCity,
    originCountry,
    destCity,
    destCountry,
    status: s.status || 'draft',
    customer: s.receiver?.name || s.receiverName || (typeof s.destination === 'object' && typeof s.destination?.customer === 'string' ? s.destination.customer : null) || s.customer || '—',
    phone: s.receiver?.phone || s.receiverPhone || (typeof s.destination === 'object' && typeof s.destination?.phone === 'string' ? s.destination.phone : null) || s.phone || '—',
    created: s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    eta: s.status === 'delivered' ? 'Delivered' : (s.estimatedDelivery ? new Date(s.estimatedDelivery).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '~2 Days'),
    service: s.serviceType || s.service || 'Express Air',
  };
};

const FILTER_STATUSES = {
  all: undefined,
  drafts: 'draft',
  pending: 'pending,ready_for_pickup,updated',
  active: 'booked,created,picked_up,received_at_hub,verified,in_transit,out_for_delivery',
  delivered: 'delivered,completed',
};

export const ShipmentList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();

  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const { stats } = useShipmentStats();

  const filterTabs = useMemo(() => {
    return [
      { key: 'all', label: t('filter_all', 'All'), count: stats.total || 0, color: TK.primary },
      { key: 'drafts', label: t('filter_drafts', 'Drafts'), count: stats.drafts || 0, color: '#b45309' },
      { key: 'pending', label: t('filter_pending', 'Pending'), count: stats.pending || 0, color: '#d97706' },
      { key: 'active', label: t('filter_in_transit', 'In Transit'), count: (stats.inTransit || 0) + (stats.booked || 0), color: TK.info },
      { key: 'delivered', label: t('filter_delivered', 'Delivered'), count: stats.delivered || 0, color: TK.success },
    ];
  }, [stats, t]);

  // Hook for live shipments
  const { shipments: rawShipments, pagination, loading, mutate } = useShipments({
    page,
    limit: PER_PAGE,
    q: search || undefined,
    statusIn: FILTER_STATUSES[activeFilter],
  });

  const total = pagination?.total || 0;
  const totalPages = pagination?.pages || 1;

  const shipments = useMemo(() => {
    return (rawShipments || []).map(toRowShape);
  }, [rawShipments]);

  // Handlers
  const handleView = (s) => {
    navigate(`/shipment/${s.trackingNumber}`);
  };

  const handleEdit = (s) => {
    navigate(`/shipment/${s.trackingNumber}?action=approve`);
  };

  const handleDownloadLabel = async (s) => {
    try {
      const { generateWaybillPDF } = await import('../utils/pdfGenerator');
      await generateWaybillPDF(s.raw);
      enqueueSnackbar(`Label generated for ${s.trackingNumber}`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar('Failed to generate label', { variant: 'error' });
    }
  };

  const handleOpenInvoice = (s) => {
    navigate(`/shipment/${s.trackingNumber}#invoice`);
  };

  const handleDelete = async (s) => {
    const rawShipment = s.raw || s;
    if (!canDeleteShipmentStatus(s.status, rawShipment, user?.role)) {
      enqueueSnackbar(buildShipmentDeleteBlockedMessage(s.status, hasCarrierBooking(rawShipment)).short, { variant: 'warning' });
      return;
    }
    if (!window.confirm(`Are you sure you want to delete shipment ${s.trackingNumber}?`)) {
      return;
    }
    try {
      await shipmentService.deleteShipment(s.trackingNumber);
      enqueueSnackbar(`Shipment ${s.trackingNumber} deleted successfully`, { variant: 'success' });
      mutate();
    } catch (e) {
      enqueueSnackbar(getShipmentDeleteErrorMessage(e, s.status), { variant: 'warning' });
    }
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Filter tabs — stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {filterTabs.map(tab => {
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveFilter(tab.key); setPage(1); }}
              style={{
                padding: '14px 18px',
                borderRadius: 20, textAlign: 'start',
                border: `1.5px solid ${isActive ? tab.color : TK.border}`,
                background: isActive ? `${tab.color}0d` : '#fff',
                cursor: 'pointer', transition: 'all 0.18s',
                boxShadow: isActive ? `0 4px 16px ${tab.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 22, color: isActive ? tab.color : TK.text1, letterSpacing: '-0.04em' }}>
                {tab.count.toLocaleString()}
              </div>
              <div style={{ fontWeight: 600, fontSize: 11, color: isActive ? tab.color : TK.text3, textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 3 }}>
                {tab.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Table container */}
      <div style={{ background: '#fff', borderRadius: 20, border: `1px solid ${TK.border}`, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center', borderBottom: `1px solid ${TK.border}`, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 240px', maxWidth: 400 }}>
            <WInput
              icon="search"
              placeholder={t('search_shipments_placeholder', 'Search tracking #, customer, destination...')}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              trailing={
                search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: TK.text3, display: 'flex', padding: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                ) : null
              }
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: TK.text2, fontWeight: 600 }}>
              {t('showing_x_of_y', `Showing ${shipments.length} of ${total || 0} shipments`).replace('{count}', shipments.length).replace('{total}', total || 0)}
            </span>
          </div>
        </div>

        {/* Loading / Empty State */}
        {loading && shipments.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: TK.text3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: TK.primary, animation: 'spin 1s linear infinite' }}>progress_activity</span>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>{t('loading_manifest', 'Loading consignment manifest...')}</div>
          </div>
        ) : shipments.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: TK.text3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 44, color: TK.text3 }}>inventory_2</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: TK.text1, marginTop: 10 }}>{t('no_shipments_found', 'No shipments found')}</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 4 }}>{t('no_shipments_desc', 'Try clearing your search filter or create a new shipment.')}</div>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: lang === 'ar' ? 'right' : 'left' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${TK.border}`, background: '#f8fafc' }}>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_tracking_service', 'Tracking # / Service')}</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_org_sender', 'Organization / Sender')}</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_route', 'Route (Origin → Dest)')}</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_customer_recipient', 'Customer / Recipient')}</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_status', 'Status')}</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_created', 'Created')}</th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_eta', 'ETA')}</th>
                    <th style={{ padding: '12px 16px', textAlign: lang === 'ar' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('th_actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s, idx) => (
                    <SRow
                      key={s.id || idx}
                      s={s}
                      isLast={idx === shipments.length - 1}
                      onView={handleView}
                      onEdit={handleEdit}
                      onDelete={user?.role === 'admin' ? handleDelete : null}
                      onDownloadLabel={handleDownloadLabel}
                      onOpenInvoice={handleOpenInvoice}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: '14px 18px', borderTop: `1px solid ${TK.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafbfc' }}>
                <span style={{ fontSize: 12.5, color: TK.text2 }}>
                  {t('page_of', 'Page')} <strong>{page}</strong> {t('of', 'of')} <strong>{totalPages}</strong>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <PagBtn
                    icon={lang === 'ar' ? 'chevron_right' : 'chevron_left'}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  />
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <PagBtn
                        key={pageNum}
                        label={pageNum}
                        active={page === pageNum}
                        onClick={() => setPage(pageNum)}
                      />
                    );
                  })}
                  <PagBtn
                    icon={lang === 'ar' ? 'chevron_left' : 'chevron_right'}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ShipmentList;
