import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';

/**
 * Per-feature module map: names what the feature will do, a target window,
 * who will see it, and two real destinations that already exist today so
 * the user isn't dead-ended on a "Return to Dashboard" button.
 */
const MODULE_INFO = {
  Analytics: {
    icon: 'insights',
    summary: 'Shipment volume, revenue trends, and carrier breakdown',
    detail: 'Aggregated view of the data currently in Finance and Shipments — with export and per-carrier splits.',
    eta: 'Q1 2026',
    access: 'All staff',
    meanwhile: [
      { icon: 'table_view', label: 'Open the shipment ledger for raw exports', to: '/shipments' },
      { icon: 'account_balance_wallet', label: 'See the finance revenue summary', to: '/finance' },
    ],
  },
  Calendar: {
    icon: 'event',
    summary: 'Pickup and delivery timeline across all shipments',
    detail: 'Day / week / month view of scheduled pickups and estimated delivery windows.',
    eta: 'Q1 2026',
    access: 'Operations, dispatch',
    meanwhile: [
      { icon: 'local_shipping', label: 'See today\'s driver pickup queue', to: '/driver/pickup' },
      { icon: 'list_alt', label: 'Filter shipments by pickup date', to: '/shipments' },
    ],
  },
  'Warehouse Management': {
    icon: 'inventory_2',
    summary: 'Inventory positions, storage locations, and cycle counts',
    detail: 'Track goods once they enter a hub — bin location, aging, and consolidation opportunities.',
    eta: 'Q2 2026',
    access: 'Warehouse team, operations',
    meanwhile: [
      { icon: 'qr_code_scanner', label: 'Scan a shipment into a warehouse bay', to: '/warehouse/scan' },
      { icon: 'list_alt', label: 'View shipments currently in transit', to: '/shipments' },
    ],
  },
  'Fleet Management': {
    icon: 'directions_car',
    summary: 'Vehicle roster, maintenance history, and utilisation',
    detail: 'Track owned and contracted vehicles, service intervals, and per-vehicle route history.',
    eta: 'Q2 2026',
    access: 'Operations, finance',
    meanwhile: [
      { icon: 'local_shipping', label: 'See today\'s driver pickup queue', to: '/driver/pickup' },
    ],
  },
  'Driver Management': {
    icon: 'person_pin_circle',
    summary: 'Driver roster, assignments, and delivery performance',
    detail: 'Manage driver profiles, license expiries, current assignments, and completion rates.',
    eta: 'Q2 2026',
    access: 'Operations',
    meanwhile: [
      { icon: 'local_shipping', label: 'Open today\'s pickup queue', to: '/driver/pickup' },
    ],
  },
  Messages: {
    icon: 'forum',
    summary: 'One inbox for customer replies across WhatsApp and email',
    detail: 'Currently, WhatsApp threads live per shipment. This will pull them all into a single triage view.',
    eta: 'Q1 2026',
    access: 'Customer service, operations',
    meanwhile: [
      { icon: 'list_alt', label: 'Open the shipment list to reach a specific thread', to: '/shipments' },
      { icon: 'history', label: 'Review sent WhatsApp messages in the audit log', to: '/admin/whatsapp-logs' },
    ],
  },
  Notifications: {
    icon: 'notifications_active',
    summary: 'System alerts, shipment holds, and carrier updates in one place',
    detail: 'Central feed of everything the app currently surfaces as banners across pages.',
    eta: 'Q1 2026',
    access: 'All staff',
    meanwhile: [
      { icon: 'settings', label: 'Adjust notification preferences in Settings', to: '/settings' },
    ],
  },
  'Password Reset': {
    icon: 'lock_reset',
    summary: 'Self-service password recovery by email',
    detail: 'Until this ships, an administrator can reset a password from the Users page.',
    eta: 'Q1 2026',
    access: 'All users',
    meanwhile: [
      { icon: 'support_agent', label: 'Ask an admin to reset your password', to: '/contact' },
    ],
  },
};

const DEFAULT_INFO = {
  icon: 'construction',
  summary: null,
  detail: 'This module is in staging and system testing.',
  eta: 'Not yet scheduled',
  access: 'To be confirmed',
  meanwhile: [
    { icon: 'dashboard', label: 'Back to the dashboard', to: '/dashboard' },
  ],
};

export const InConstructionPage = ({
  title = 'Under Construction',
  description,
}) => {
  const navigate = useNavigate();
  const info = MODULE_INFO[title] || DEFAULT_INFO;
  const summary = info.summary || description || DEFAULT_INFO.detail;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={title}
        subtitle="Not yet available — here's what's coming and where to go in the meantime."
      />

      <div className="bg-base-100 border border-base-200 rounded-2xl p-6 sm:p-8 space-y-6">
        {/* Header row: module + In-development pill */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-base-content/60">
              Coming to Target Logistics
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-base-content mt-1">
              {title}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/10 text-warning text-xs font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
            In development
          </span>
        </div>

        {/* Feature summary card */}
        <div className="bg-base-200/40 border border-base-200 rounded-xl p-5 flex gap-4 items-start">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-content flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-xl">{info.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm sm:text-base font-bold text-base-content">
              {summary}
            </div>
            {info.detail && (
              <p className="text-sm text-base-content/70 mt-1 leading-relaxed">{info.detail}</p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3 text-xs">
              <div>
                <span className="text-base-content/60">Target: </span>
                <span className="font-bold text-base-content">{info.eta}</span>
              </div>
              <div>
                <span className="text-base-content/60">Access: </span>
                <span className="font-bold text-base-content">{info.access}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Meanwhile actions */}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-base-content/60 mb-2.5">
            Meanwhile, you can
          </div>
          <div className="flex flex-col gap-1.5">
            {info.meanwhile.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-center gap-3 p-3 rounded-xl border border-base-200 bg-base-100 hover:border-primary/40 hover:bg-primary/5 transition-colors"
              >
                <span className="material-symbols-outlined text-lg text-primary">{item.icon}</span>
                <span className="flex-1 text-sm font-semibold text-base-content">{item.label}</span>
                <span className="material-symbols-outlined text-base text-base-content/40 group-hover:text-primary rtl:rotate-180">arrow_forward</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-base-200 flex justify-end">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn btn-ghost btn-sm text-base-content/60 gap-1"
          >
            <span className="material-symbols-outlined text-base rtl:rotate-180">arrow_back</span>
            <span>Go back</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default InConstructionPage;
