import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { shipmentService } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import { getApiBaseUrl } from '../utils/env';

const API = getApiBaseUrl();

export const PublicReturnPortalPage = () => {
  const { trackingNumber: initialTracking } = useParams();
  const navigate = useNavigate();

  const [trackingInput, setTrackingInput] = useState(initialTracking || '');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [eligibilityData, setEligibilityData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Form fields
  const [selectedReason, setSelectedReason] = useState('');
  const [notes, setNotes] = useState('');
  const [pickupPreference, setPickupPreference] = useState('DROP_OFF'); // 'DROP_OFF' | 'COURIER_PICKUP'
  const [completedReturn, setCompletedReturn] = useState(null);

  const checkEligibility = async (tn) => {
    const queryTracking = (tn || trackingInput).trim();
    if (!queryTracking) return;

    try {
      setLoading(true);
      setErrorMsg('');
      setEligibilityData(null);
      setCompletedReturn(null);

      const res = await shipmentService.checkReturnEligibility(queryTracking);
      if (res.success && res.eligible) {
        setEligibilityData(res.data);
        setSelectedReason(res.data.allowedReasons?.[0] || 'Defective or Damaged');
      } else if (res.alreadyReturned) {
        setEligibilityData({ ...res, isAlreadyReturned: true });
      } else {
        setErrorMsg(res.error || 'This shipment is not eligible for return (must be delivered within 14 days).');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to verify return eligibility.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTracking) {
      checkEligibility(initialTracking);
    }
  }, [initialTracking]);

  const handleSubmitReturn = async () => {
    if (!selectedReason) {
      setErrorMsg('Please select a reason for the return.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');
      const payload = {
        returnReason: selectedReason,
        customerNotes: notes,
        pickupPreference,
      };

      const res = await shipmentService.createPublicReturn(eligibilityData.trackingNumber, payload);
      if (res.success && res.data) {
        setCompletedReturn(res.data);
      } else {
        setErrorMsg(res.error || 'Failed to create return waybill.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Failed to submit return request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-base-200/50 flex flex-col font-sans selection:bg-primary selection:text-white">
      {/* Top Header */}
      <header className="navbar bg-base-100 border-b border-base-200 px-4 sm:px-8 py-3 sticky top-0 z-40 shadow-sm">
        <div className="flex-1 flex items-center gap-3">
          <Link to="/track" className="flex items-center gap-2.5 text-primary font-black text-lg tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center font-black text-sm shadow-md shadow-primary/20">
              TL
            </div>
            <div className="flex flex-col">
              <span className="leading-tight font-extrabold text-base-content">Target Logistics</span>
              <span className="text-[10px] text-primary uppercase font-bold tracking-widest">Self-Service Returns</span>
            </div>
          </Link>
        </div>
        <div className="flex-none">
          <Link to="/track" className="btn btn-ghost btn-sm text-xs font-bold gap-1 text-base-content/70 hover:text-primary">
            <span className="material-symbols-outlined text-sm">search</span>
            <span>Track Parcel</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Brand Hero */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-bold border border-secondary/20">
            <span className="material-symbols-outlined text-sm">assignment_return</span>
            <span>Reverse Logistics Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-base-content tracking-tight">
            Customer Self-Service Returns
          </h1>
          <p className="text-xs sm:text-sm text-base-content/60 max-w-md mx-auto">
            Easily authorize and book reverse courier pickups or hub drop-offs within 14 days of confirmed package delivery.
          </p>
        </div>

        {/* Step 1: Waybill Lookup */}
        {!eligibilityData && !completedReturn && (
          <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
            <div className="card-body p-6 sm:p-8 space-y-5">
              <div>
                <h2 className="text-lg font-black text-base-content tracking-tight">
                  Enter Delivered Tracking Number
                </h2>
                <p className="text-xs text-base-content/60 mt-0.5">
                  Located on your receipt, delivery SMS, or package shipping label.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
                    barcode_scanner
                  </span>
                  <input
                    type="text"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && checkEligibility()}
                    placeholder="e.g. TRK-KW-DELIVERED-007"
                    className="input input-bordered w-full pl-10 pr-4 font-mono font-medium text-sm focus:input-primary"
                  />
                </div>
                <button
                  type="button"
                  disabled={!trackingInput.trim() || loading}
                  onClick={() => checkEligibility()}
                  className="btn btn-primary font-bold px-6 text-sm shadow-md shadow-primary/20"
                >
                  {loading ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <span>Verify Return</span>
                  )}
                </button>
              </div>

              {errorMsg && (
                <div className="alert alert-error text-xs py-3 px-4 shadow-sm">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* State: Already Returned */}
        {eligibilityData?.isAlreadyReturned && (
          <div className="card bg-base-100 border border-base-200 shadow-sm p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto text-2xl">
              <span className="material-symbols-outlined text-3xl">verified</span>
            </div>
            <div>
              <h2 className="text-xl font-black text-base-content">Return Already Authorized</h2>
              <p className="text-xs text-base-content/60 mt-1">
                A reverse waybill has already been created for this consignment.
              </p>
            </div>
            <div className="p-3 bg-base-200 rounded-xl font-mono font-black text-base text-primary inline-block">
              {eligibilityData.existingReturnTracking || eligibilityData.returnTrackingNumber || 'RET-AUTHORIZED'}
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setEligibilityData(null);
                  setTrackingInput('');
                }}
                className="btn btn-outline btn-sm font-bold text-xs"
              >
                Search Another Consignment
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Return Configuration Form */}
        {eligibilityData && !eligibilityData.isAlreadyReturned && !completedReturn && (
          <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden">
            <div className="card-body p-6 sm:p-8 space-y-6">
              {/* Consignment Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-base-200">
                <div>
                  <span className="text-[11px] font-bold text-base-content/50 uppercase tracking-wider">
                    Eligible Consignment
                  </span>
                  <div className="font-mono font-black text-lg text-base-content mt-0.5">
                    {eligibilityData.trackingNumber}
                  </div>
                  <div className="text-xs text-base-content/60 mt-0.5">
                    Merchant: <strong className="text-base-content">{eligibilityData.merchant || 'Target Logistics Client'}</strong> •{' '}
                    <span className="text-success font-bold">{eligibilityData.daysRemaining ?? 14} days remaining</span>
                  </div>
                </div>
                <StatusBadge status="delivered" size="sm" />
              </div>

              {/* Return Reason Select */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                  Reason for Return *
                </label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="select select-bordered w-full font-medium text-sm focus:select-primary"
                >
                  {(eligibilityData.allowedReasons || [
                    'Defective or Damaged',
                    'Incorrect Item Received',
                    'Size / Fit Issue',
                    'Changed Mind / Not as Described',
                    'Late Delivery'
                  ]).map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                  Defect Description & Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Provide any additional context or defect details for the merchant inspection team..."
                  rows={3}
                  className="textarea textarea-bordered w-full text-sm font-medium focus:textarea-primary"
                />
              </div>

              {/* Handover Preference (Hub Drop-off vs Courier Pickup) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-base-content/70 uppercase tracking-wider">
                  Return Handover Method *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setPickupPreference('DROP_OFF')}
                    className={`card p-4 border-2 cursor-pointer transition-all ${
                      pickupPreference === 'DROP_OFF'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-base-200 hover:border-base-300 bg-base-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        pickupPreference === 'DROP_OFF' ? 'bg-primary text-white' : 'bg-base-200 text-base-content/70'
                      }`}>
                        <span className="material-symbols-outlined">store</span>
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-base-content">Hub Drop-Off</div>
                        <div className="text-xs text-base-content/60">Drop at any Target Express branch</div>
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => setPickupPreference('COURIER_PICKUP')}
                    className={`card p-4 border-2 cursor-pointer transition-all ${
                      pickupPreference === 'COURIER_PICKUP'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-base-200 hover:border-base-300 bg-base-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        pickupPreference === 'COURIER_PICKUP' ? 'bg-primary text-white' : 'bg-base-200 text-base-content/70'
                      }`}>
                        <span className="material-symbols-outlined">local_shipping</span>
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-base-content">Courier Pickup</div>
                        <div className="text-xs text-base-content/60">Driver picks up from your address</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="alert alert-error text-xs py-3 px-4 shadow-sm">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEligibilityData(null);
                    setTrackingInput('');
                  }}
                  className="btn btn-ghost text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitReturn}
                  className="btn btn-primary font-bold px-6 text-sm shadow-md shadow-primary/20 gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      <span>Generating Label...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">check_circle</span>
                      <span>Authorize & Create Return</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Success Return Created */}
        {completedReturn && (
          <div className="card bg-base-100 border border-base-200 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto text-3xl">
                <span className="material-symbols-outlined text-4xl">check_circle</span>
              </div>
              <h2 className="text-2xl font-black text-base-content tracking-tight">
                Return Waybill Generated!
              </h2>
              <p className="text-xs sm:text-sm text-base-content/60 max-w-sm mx-auto">
                Please print and attach the return shipping label to your packaged parcel before handover.
              </p>
            </div>

            {/* Summary Details */}
            <div className="p-4 rounded-xl bg-base-200/50 border border-base-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-base-content/60">RETURN TRACKING #</span>
                <span className="font-mono font-black text-primary text-sm">
                  {completedReturn.trackingNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-base-content/60">MERCHANT DESTINATION</span>
                <span className="font-bold text-base-content">
                  {completedReturn.destination?.company || completedReturn.destination?.contactPerson || 'Merchant Receiving Center'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-base-content/60">HANDOVER METHOD</span>
                <span className="badge badge-sm badge-neutral font-bold">
                  {pickupPreference === 'COURIER_PICKUP' ? 'Driver Collection' : 'Hub Drop-Off'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-base-content/60">CURRENT STATUS</span>
                <StatusBadge status={completedReturn.status || 'return_initiated'} size="xs" />
              </div>
            </div>

            {/* Print & Track Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a
                href={`${API}/shipments/${completedReturn.trackingNumber}/label`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary flex-1 font-bold gap-2 text-sm shadow-md shadow-primary/20"
              >
                <span className="material-symbols-outlined text-lg">print</span>
                <span>Print Return Label</span>
              </a>
              <button
                type="button"
                onClick={() => navigate(`/track/${completedReturn.trackingNumber}`)}
                className="btn btn-outline border-base-300 hover:border-primary flex-1 font-bold gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-lg">radar</span>
                <span>Track Return</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer footer-center p-6 bg-base-100 text-base-content/60 text-xs border-t border-base-200 mt-12">
        <p>© 2026 Target Logistics Global Express W.L.L. Reverse Logistics Division.</p>
      </footer>
    </div>
  );
};

export default PublicReturnPortalPage;
