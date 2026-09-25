import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';

const DEMO_QUICK_SEARCHES = [
  {
    tracking: 'DGR-KW-DEMO-001',
    label: 'DGR Perfume to London (Pending Review)',
    tag: 'DHL DGR',
    badgeClass: 'badge-warning',
  },
  {
    tracking: 'TRK-KW-TRANSIT-005',
    label: 'Air Express to Dubai (In Transit)',
    tag: '4 Checkpoints',
    badgeClass: 'badge-info',
  },
  {
    tracking: 'TRK-KW-DELIVERED-007',
    label: 'Bader Trading Kuwait (Delivered + POD)',
    tag: 'Signed',
    badgeClass: 'badge-success',
  },
  {
    tracking: 'TRK-KW-READY-002',
    label: 'Electronics to Riyadh (Ready for Pickup)',
    tag: 'Scheduled',
    badgeClass: 'badge-primary',
  },
];

export const TrackingLandingPage = () => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSearch = (tn) => {
    const trimmed = (tn || trackingNumber).trim();
    if (!trimmed) {
      setError('Please enter a valid tracking number.');
      return;
    }
    setError('');
    navigate(`/shipment/${trimmed}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Consignment Tracking Radar"
        subtitle="Monitor live air cargo flights, customs milestones, regional GCC handoffs, and digital Proof of Delivery."
      >
        <div className="badge badge-primary badge-outline font-bold text-xs gap-1.5 py-3 px-3">
          <span className="material-symbols-outlined text-sm">radar</span>
          <span>Live Network Telemetry</span>
        </div>
      </PageHeader>

      {/* Main Search Bar Card */}
      <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
        <div className="card-body p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-black text-base-content tracking-tight">
              Direct Consignment Lookup
            </h2>
            <p className="text-xs text-base-content/60 mt-1">
              Enter internal waybill, carrier master tracking number, or customer order reference.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-xl pointer-events-none">
                barcode_scanner
              </span>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => {
                  setTrackingNumber(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. TRK-KW-TRANSIT-005, DGR-KW-DEMO-001..."
                className={`input input-bordered w-full pl-11 pr-4 font-mono font-medium text-sm focus:input-primary ${
                  error ? 'input-error' : ''
                }`}
              />
              {trackingNumber && (
                <button
                  type="button"
                  onClick={() => setTrackingNumber('')}
                  className="btn btn-ghost btn-circle btn-xs absolute right-3 top-1/2 -translate-y-1/2 text-base-content/40"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary font-bold px-8 gap-2 shadow-md shadow-primary/20 text-sm"
            >
              <span className="material-symbols-outlined text-lg">search</span>
              <span>Inspect Shipment</span>
            </button>
          </form>

          {error && (
            <div className="alert alert-error text-xs py-2.5 px-3">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Quick Presets */}
          <div className="pt-4 border-t border-base-200 space-y-3">
            <div className="text-xs font-bold text-base-content/50 uppercase tracking-wider">
              Quick Live Test Consignments
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEMO_QUICK_SEARCHES.map((item) => (
                <button
                  key={item.tracking}
                  type="button"
                  onClick={() => handleSearch(item.tracking)}
                  className="btn btn-outline border-base-200 hover:border-primary hover:bg-primary/5 text-left justify-between h-auto py-2.5 px-3 text-xs normal-case group"
                >
                  <div className="flex flex-col">
                    <span className="font-mono font-bold text-base-content group-hover:text-primary transition-colors">
                      {item.tracking}
                    </span>
                    <span className="text-[11px] text-base-content/60">{item.label}</span>
                  </div>
                  <span className={`badge badge-xs ${item.badgeClass} font-bold shrink-0`}>
                    {item.tag}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Capabilities Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card bg-base-100 border border-base-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">hub</span>
            </div>
            <h3 className="font-bold text-sm text-base-content">Carrier Gateway Feeds</h3>
          </div>
          <p className="text-xs text-base-content/60 leading-relaxed">
            Consolidated telemetry across DHL Express, FedEx, SMSA Express, and OTE regional cargo corridors.
          </p>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">signature</span>
            </div>
            <h3 className="font-bold text-sm text-base-content">Proof of Delivery Vault</h3>
          </div>
          <p className="text-xs text-base-content/60 leading-relaxed">
            Instant optical access to recipient signatures, delivery GPS stamps, and driver inspection photos.
          </p>
        </div>

        <div className="card bg-base-100 border border-base-200 p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl">verified_user</span>
            </div>
            <h3 className="font-bold text-sm text-base-content">GCC Customs Pipeline</h3>
          </div>
          <p className="text-xs text-base-content/60 leading-relaxed">
            Real-time inspection of clearance hold codes, tariff duty assessments, and official release declarations.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TrackingLandingPage;
