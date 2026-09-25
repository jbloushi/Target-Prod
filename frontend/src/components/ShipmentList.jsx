import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { shipmentService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useShipments } from '../utils/useShipments';
import { useShipmentStats } from '../utils/useShipmentStats';
import StatusBadge from './common/StatusBadge';
import TradeRouteDisplay from './common/TradeRouteDisplay';
import ShipmentInspectorDrawer from './common/ShipmentInspectorDrawer';
import {
  buildShipmentDeleteBlockedMessage,
  canDeleteShipmentStatus,
  hasCarrierBooking,
  getShipmentDeleteErrorMessage
} from '../utils/shipmentDeletionPolicy';

// Adapter: backend shipment shape → table row shape
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
    weight: s.weight || s.package?.weight || 3.5,
  };
};

const FILTER_STATUSES = {
  all: undefined,
  exceptions: 'exception,failed,cancelled,returned',
  active: 'booked,created,picked_up,received_at_hub,verified,in_transit,out_for_delivery',
  pending: 'pending,ready_for_pickup,updated',
  delivered: 'delivered,completed',
  drafts: 'draft',
};

export const ShipmentList = ({ organizationId = 'all', initialFilter = 'all' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const isRTL = lang === 'ar';
  const { enqueueSnackbar } = useSnackbar();

  // State
  const [activeFilter, setActiveFilter] = useState(initialFilter || 'all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [inspectingShipment, setInspectingShipment] = useState(null);
  const PER_PAGE = 10;

  // Sync initialFilter prop if changed by parent
  useEffect(() => {
    if (initialFilter) {
      setActiveFilter(initialFilter);
      setPage(1);
    }
  }, [initialFilter]);

  // Reset page when organization changes
  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [organizationId]);

  const { stats } = useShipmentStats(organizationId);

  const filterTabs = useMemo(() => {
    return [
      { key: 'all', label: t('filter_all', 'All'), count: stats.total || 0, badge: 'badge-primary', border: 'border-primary' },
      { key: 'exceptions', label: t('filter_exceptions', 'Triage / Holds'), count: stats.exceptions || 0, badge: 'badge-error', border: 'border-error', isTriage: true },
      { key: 'active', label: t('filter_in_transit', 'In Transit'), count: (stats.inTransit || 0) + (stats.pickedUp || 0), badge: 'badge-info', border: 'border-info' },
      { key: 'pending', label: t('filter_pending', 'Pending Gate'), count: stats.pending || 0, badge: 'badge-warning', border: 'border-warning' },
      { key: 'delivered', label: t('filter_delivered', 'Delivered'), count: stats.delivered || 0, badge: 'badge-success', border: 'border-success' },
      { key: 'drafts', label: t('filter_drafts', 'Drafts'), count: stats.drafts || 0, badge: 'badge-ghost', border: 'border-base-300' },
    ];
  }, [stats, t]);

  // SWR Hook for live shipments
  const { shipments: rawShipments, pagination, loading, mutate } = useShipments({
    page,
    limit: PER_PAGE,
    q: search || undefined,
    statusIn: FILTER_STATUSES[activeFilter],
    organizationId,
  });

  const total = pagination?.total || 0;
  const totalPages = pagination?.pages || 1;

  const shipments = useMemo(() => {
    return (rawShipments || []).map(toRowShape);
  }, [rawShipments]);

  // Bulk selection logic
  const isAllSelected = shipments.length > 0 && selectedIds.length === shipments.length;
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(shipments.map(s => s.id));
    }
  };

  const toggleSelectRow = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Actions
  const handleView = (s) => {
    setInspectingShipment(s);
  };

  const handleOpenFull = (trackingNumber) => {
    navigate(`/shipment/${trackingNumber}`);
  };

  const handleEdit = (s) => {
    navigate(`/shipment/${s.trackingNumber}?action=approve`);
  };

  const handleDownloadLabel = async (s) => {
    try {
      const { generateWaybillPDF } = await import('../utils/pdfGenerator');
      await generateWaybillPDF(s.raw);
      enqueueSnackbar(`Label generated for ${s.trackingNumber}`, { variant: 'success' });
    } catch {
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
    <div className="space-y-4">
      
      {/* 1. Filter Tabs Ribbon (DaisyUI Interactive Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setActiveFilter(tab.key); setPage(1); }}
              className={`card bg-base-100 p-3.5 sm:p-4 text-start transition-all cursor-pointer rounded-2xl border select-none ${
                isActive 
                  ? 'ring-2 ring-primary border-primary bg-primary/5 shadow-md -translate-y-0.5' 
                  : 'border-base-200/90 shadow-sm hover:border-base-300 hover:shadow-md'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-2xl font-black text-base-content tracking-tight">
                  {tab.count.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  {tab.isTriage && tab.count > 0 && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-error"></span>
                    </span>
                  )}
                  <span className={`badge ${tab.badge} badge-xs py-1.5 px-2 font-bold`}>
                    {tab.key.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-base-content/60 mt-1">
                {tab.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. Main Consignment Grid Container */}
      <div className="card bg-base-100 border border-base-200/90 shadow-sm rounded-2xl overflow-hidden">
        
        {/* Search & Actions Toolbar */}
        <div className="p-4 border-b border-base-200 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="relative w-full sm:max-w-md">
            <span className="material-symbols-outlined absolute inset-y-0 start-3 flex items-center text-base-content/40 text-lg pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder={t('search_shipments_placeholder', 'Search waybill, recipient, phone, destination...')}
              className="input input-bordered input-sm rounded-xl w-full ps-9 pe-8 font-medium text-xs text-base-content bg-base-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 end-2.5 flex items-center text-base-content/40 hover:text-base-content"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-base-content/70 font-semibold">
            <span>
              {t('showing_x_of_y', `Showing ${shipments.length} of ${total || 0} shipments`).replace('{count}', shipments.length).replace('{total}', total || 0)}
            </span>
            <button 
              onClick={() => mutate()} 
              className="btn btn-ghost btn-xs btn-square"
              title={t('refresh', 'Refresh')}
            >
              <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin text-primary' : ''}`}>
                refresh
              </span>
            </button>
          </div>
        </div>

        {/* Loading / Empty States */}
        {loading && shipments.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <p className="text-xs font-bold text-base-content/60">
              {t('loading_manifest', 'Loading consignment manifest...')}
            </p>
          </div>
        ) : shipments.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-base-200 text-base-content/50 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">inventory_2</span>
            </div>
            <h4 className="text-sm font-black text-base-content">
              {t('no_shipments_found', 'No shipments found')}
            </h4>
            <p className="text-xs text-base-content/60 max-w-sm mx-auto">
              {t('no_shipments_desc', 'Try clearing your search filter or create a new shipment.')}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="overflow-x-auto">
              <table className="table table-zebra table-hover w-full text-xs">
                <thead>
                  <tr className="text-xs uppercase text-base-content/60 border-b border-base-200 font-extrabold bg-base-200/30">
                    <th className="w-10 px-3">
                      <input 
                        type="checkbox" 
                        checked={isAllSelected} 
                        onChange={toggleSelectAll} 
                        className="checkbox checkbox-primary checkbox-xs rounded"
                      />
                    </th>
                    <th className="py-3 px-3">{t('th_tracking_service', 'Tracking # / Service')}</th>
                    <th>{t('th_org_sender', 'Organization')}</th>
                    <th>{t('th_route', 'Route (Origin → Dest)')}</th>
                    <th>{t('th_customer_recipient', 'Customer / Recipient')}</th>
                    <th>{t('th_status', 'Status')}</th>
                    <th>{t('th_created', 'Created')}</th>
                    <th>{t('th_eta', 'ETA')}</th>
                    <th className={isRTL ? 'text-left' : 'text-right'}>{t('th_actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => {
                    const isSelected = selectedIds.includes(s.id);
                    return (
                      <tr 
                        key={s.id}
                        onClick={() => handleView(s)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-primary/5'}`}
                      >
                        <td className="px-3" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={(e) => toggleSelectRow(s.id, e)} 
                            className="checkbox checkbox-primary checkbox-xs rounded"
                          />
                        </td>
                        <td className="py-3 px-3 font-bold text-base-content">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono hover:text-primary transition-colors">{s.trackingNumber}</span>
                            {s.isTest && (
                              <span className="badge badge-warning badge-xs font-black py-0.5 px-1.5">
                                TEST
                              </span>
                            )}
                          </div>
                          <span className="text-[10.5px] text-base-content/50 block font-normal mt-0.5">
                            {s.service}
                          </span>
                        </td>
                        <td>
                          <span className="font-extrabold text-primary block truncate max-w-[140px]">
                            {s.org}
                          </span>
                          <span className="text-[10px] text-base-content/50 block font-normal">
                            {s.createdBy}
                          </span>
                        </td>
                        <td>
                          <TradeRouteDisplay 
                            origin={{ city: s.originCity, country: s.originCountry }} 
                            destination={{ city: s.destCity, country: s.destCountry }} 
                          />
                        </td>
                        <td>
                          <span className="font-semibold text-base-content block truncate max-w-[140px]">
                            {s.customer}
                          </span>
                          <span className="text-[10px] text-base-content/50 block font-mono">
                            {s.phone}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={s.status} size="sm" />
                        </td>
                        <td className="text-base-content/70 font-medium">
                          {s.created}
                        </td>
                        <td>
                          <span className={`font-bold ${
                            s.eta === 'Today' || s.eta === 'Delivered' ? 'text-success' : s.eta === 'Hold' ? 'text-error' : 'text-base-content/80'
                          }`}>
                            {s.eta}
                          </span>
                        </td>
                        <td className={isRTL ? 'text-left' : 'text-right'} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => handleView(s)}
                              className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                              title={isRTL ? 'معاينة سريعة' : 'Quick Inspect'}
                            >
                              <span className="material-symbols-outlined text-base">visibility</span>
                            </button>
                            <div className="dropdown dropdown-end">
                              <label tabIndex={0} className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary">
                                <span className="material-symbols-outlined text-base">more_horiz</span>
                              </label>
                              <ul tabIndex={0} className="dropdown-content z-30 menu p-1.5 shadow-xl bg-base-100 rounded-xl border border-base-200 w-44 text-xs font-semibold">
                                <li>
                                  <button onClick={() => handleView(s)}>
                                    <span className="material-symbols-outlined text-base">visibility</span>
                                    {t('action_view_details', 'View Details')}
                                  </button>
                                </li>
                                <li>
                                  <button onClick={() => handleOpenFull(s.trackingNumber)}>
                                    <span className="material-symbols-outlined text-base">open_in_new</span>
                                    {isRTL ? 'الملف الكامل' : 'Full Dossier'}
                                  </button>
                                </li>
                                <li>
                                  <button onClick={() => handleDownloadLabel(s)}>
                                    <span className="material-symbols-outlined text-base">print</span>
                                    {t('action_view_label', 'Print Waybill')}
                                  </button>
                                </li>
                                <li>
                                  <button onClick={() => handleOpenInvoice(s)}>
                                    <span className="material-symbols-outlined text-base">receipt</span>
                                    {t('action_invoice_pdf', 'Invoice PDF')}
                                  </button>
                                </li>
                                <li>
                                  <button onClick={() => handleEdit(s)}>
                                    <span className="material-symbols-outlined text-base">edit</span>
                                    {t('action_approve_edit', 'Approve / Edit')}
                                  </button>
                                </li>
                                {user?.role === 'admin' && (
                                  <>
                                    <div className="divider my-1"></div>
                                    <li>
                                      <button onClick={() => handleDelete(s)} className="text-error">
                                        <span className="material-symbols-outlined text-base">delete</span>
                                        {t('action_delete', 'Delete')}
                                      </button>
                                    </li>
                                  </>
                                )}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3.5 border-t border-base-200 flex flex-col sm:flex-row justify-between items-center gap-3 bg-base-200/30">
                <span className="text-xs text-base-content/70">
                  {t('page_of', 'Page')} <strong className="text-base-content">{page}</strong> {t('of', 'of')} <strong className="text-base-content">{totalPages}</strong>
                </span>

                <div className="join">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="btn btn-xs join-item font-bold"
                  >
                    {isRTL ? '»' : '«'}
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pNum = i + 1;
                    return (
                      <button
                        key={pNum}
                        onClick={() => setPage(pNum)}
                        className={`btn btn-xs join-item font-bold ${page === pNum ? 'btn-primary' : 'btn-ghost'}`}
                      >
                        {pNum}
                      </button>
                    );
                  })}
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="btn btn-xs join-item font-bold"
                  >
                    {isRTL ? '«' : '»'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 3. Floating Multi-Select Bulk Actions Dock */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 animate-in slide-in-from-bottom duration-200 pointer-events-none">
          <div className="card bg-neutral text-neutral-content shadow-2xl rounded-2xl py-3 px-5 flex flex-row items-center gap-4 pointer-events-auto border border-white/10">
            <div className="flex items-center gap-2">
              <span className="badge badge-primary font-bold text-xs">
                {selectedIds.length}
              </span>
              <span className="text-xs font-extrabold">
                {isRTL ? 'شحنات محددة' : 'Shipments Selected'}
              </span>
            </div>

            <div className="h-4 w-px bg-white/20"></div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  enqueueSnackbar(`Preparing bulk waybills for ${selectedIds.length} packages...`, { variant: 'info' });
                }}
                className="btn btn-primary btn-xs font-bold rounded-lg"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                {isRTL ? 'طباعة مجمعة' : 'Bulk Print'}
              </button>
              <button 
                onClick={() => setSelectedIds([])}
                className="btn btn-ghost btn-xs text-white/70 hover:text-white"
              >
                {isRTL ? 'إلغاء التحديد' : 'Deselect All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Slide-Over Shipment Inspector Drawer (Shared Canonical Component) */}
      <ShipmentInspectorDrawer
        shipment={inspectingShipment}
        onClose={() => setInspectingShipment(null)}
        onDownloadLabel={handleDownloadLabel}
      />

    </div>
  );
};

export default ShipmentList;
