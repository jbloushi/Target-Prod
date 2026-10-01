import React, { useState, useEffect, useRef } from 'react';
import { fleetService } from '../services/api';
import { useSnackbar } from 'notistack';

const DriverRunPage = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState(null);

  // Delivery Modal State
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [collectedCod, setCollectedCod] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [signatureData, setSignatureData] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);

  // Exception Modal State
  const [isExceptionModalOpen, setIsExceptionModalOpen] = useState(false);
  const [failureReason, setFailureReason] = useState('CUSTOMER_UNREACHABLE');
  const [failureNotes, setFailureNotes] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [isSubmittingException, setIsSubmittingException] = useState(false);

  // Canvas Signature Ref
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  const fetchActiveRun = async () => {
    try {
      setLoading(true);
      const res = await fleetService.getDriverActiveRun();
      if (res.success) {
        setActiveRun(res.data);
      }
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed loading active delivery run', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveRun();
  }, []);

  // Canvas Drawing Handlers
  const startDrawing = (e) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData('');
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPhotoData(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleOpenDeliverModal = (shipment) => {
    setSelectedShipment(shipment);
    const dest = shipment.destination || {};
    setRecipientName(dest.contactPerson || dest.name || '');
    setCollectedCod(shipment.codAmount ? String(shipment.codAmount) : '0');
    setSignatureData('');
    setPhotoData('');
    setIsDeliverModalOpen(true);
  };

  const handleOpenExceptionModal = (shipment) => {
    setSelectedShipment(shipment);
    setFailureReason('CUSTOMER_UNREACHABLE');
    setFailureNotes('');
    setRescheduleDate('');
    setIsExceptionModalOpen(true);
  };

  const handleSubmitDelivery = async () => {
    if (!recipientName) {
      enqueueSnackbar('Recipient name is required', { variant: 'warning' });
      return;
    }

    try {
      setIsSubmittingDelivery(true);
      await fleetService.completeStop({
        shipmentId: selectedShipment.id,
        trackingNumber: selectedShipment.trackingNumber,
        recipientName,
        signatureUrl: signatureData || null,
        photoUrl: photoData || null,
        collectedCodAmount: parseFloat(collectedCod || 0),
        paymentMethod
      });

      enqueueSnackbar(`Delivered ${selectedShipment.trackingNumber}! POD saved.`, { variant: 'success' });
      setIsDeliverModalOpen(false);
      fetchActiveRun();
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed saving delivery', { variant: 'error' });
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  const handleSubmitException = async () => {
    try {
      setIsSubmittingException(true);
      await fleetService.recordException({
        shipmentId: selectedShipment.id,
        trackingNumber: selectedShipment.trackingNumber,
        failureReason,
        failureNotes,
        rescheduleDate: rescheduleDate || null
      });

      enqueueSnackbar(`Delivery exception logged for ${selectedShipment.trackingNumber}`, { variant: 'info' });
      setIsExceptionModalOpen(false);
      fetchActiveRun();
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed recording exception', { variant: 'error' });
    } finally {
      setIsSubmittingException(false);
    }
  };

  const openWhatsApp = (phone, trackingNumber) => {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const finalPhone = cleanPhone.startsWith('965') ? cleanPhone : `965${cleanPhone}`;
    const text = encodeURIComponent(`Hello, your Target Logistics courier is on the way with package ${trackingNumber}. Please let us know if you are available.`);
    window.open(`https://wa.me/${finalPhone}?text=${text}`, '_blank');
  };

  const openMaps = (dest) => {
    const query = encodeURIComponent(`${dest.formattedAddress || `${dest.area || dest.city} Block ${dest.block} Street ${dest.street} Kuwait`}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-20 animate-fade-in">
      {/* Driver Cockpit Header */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 p-6 rounded-3xl text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl text-white">local_shipping</span>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">Driver Run Cockpit</span>
              <h1 className="text-xl font-bold font-mono">{activeRun ? activeRun.runNumber : 'No Active Run'}</h1>
            </div>
          </div>
          <button
            onClick={fetchActiveRun}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition text-white cursor-pointer"
            title="Refresh"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>sync</span>
          </button>
        </div>

        {activeRun && (
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/20 text-center">
            <div className="bg-white/10 rounded-2xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-blue-200 block">Stops</span>
              <strong className="text-base">{activeRun.completedStops} / {activeRun.totalStops}</strong>
            </div>
            <div className="bg-white/10 rounded-2xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-blue-200 block">Zone</span>
              <strong className="text-base truncate block">{activeRun.zone}</strong>
            </div>
            <div className="bg-white/10 rounded-2xl p-2.5">
              <span className="text-[10px] uppercase tracking-wider text-emerald-300 block">COD Collected</span>
              <strong className="text-base text-emerald-200">{Number(activeRun.totalCodCollected).toFixed(3)} KD</strong>
            </div>
          </div>
        )}
      </div>

      {/* Stop Sequence List */}
      {loading ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-slate-500">Loading delivery sequence...</p>
        </div>
      ) : !activeRun || !activeRun.shipments || activeRun.shipments.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6 space-y-3">
          <span className="material-symbols-outlined text-5xl text-emerald-500 mx-auto block">check_circle</span>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">No Active Runs Dispatched</h2>
          <p className="text-sm text-slate-500">You do not have any pending runs assigned by the dispatcher.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2">
            Delivery Sequence ({activeRun.shipments.length} Stops)
          </h2>

          {activeRun.shipments.map((s, idx) => {
            const dest = s.destination || {};
            const isDelivered = s.status === 'delivered';
            const isException = s.status === 'exception';

            return (
              <div 
                key={s.id}
                className={`p-4 rounded-3xl bg-white dark:bg-slate-800 border transition shadow-sm space-y-3 ${
                  isDelivered 
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10'
                    : isException
                    ? 'border-rose-200 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/10'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                      {s.trackingNumber}
                    </span>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    isDelivered 
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : isException
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  }`}>
                    {s.status.toUpperCase()}
                  </span>
                </div>

                {/* Recipient & Address */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {dest.contactPerson || dest.name || 'Recipient'}
                    </h3>
                    {s.codAmount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                        COD {Number(s.codAmount).toFixed(3)} KWD
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {dest.formattedAddress || `${dest.area || dest.city} Blk ${dest.block || ''} St ${dest.street || ''}`}
                  </p>
                </div>

                {/* Quick 1-Tap Action Buttons */}
                {!isDelivered && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                    <button
                      onClick={() => openWhatsApp(dest.phone, s.trackingNumber)}
                      className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">chat</span>
                      WhatsApp
                    </button>

                    <button
                      onClick={() => openMaps(dest)}
                      className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">location_on</span>
                      Maps & PACI
                    </button>
                  </div>
                )}

                {/* Stop Status Action Buttons */}
                {!isDelivered && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      onClick={() => handleOpenDeliverModal(s)}
                      className="col-span-2 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-lg">check_circle</span>
                      Complete POD
                    </button>

                    <button
                      onClick={() => handleOpenExceptionModal(s)}
                      className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold text-xs border border-rose-200 dark:border-rose-800 hover:bg-rose-100 transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">error</span>
                      Failed
                    </button>
                  </div>
                )}

                {isDelivered && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 pt-1">
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    Delivered • POD Signature Recorded
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DELIVER & POD MODAL */}
      {isDeliverModalOpen && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-2xl">check_circle</span>
                Proof of Delivery (POD)
              </h3>
              <button onClick={() => setIsDeliverModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Recipient Name *
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-semibold"
                />
              </div>

              {selectedShipment.codAmount > 0 && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    <span>Cash on Delivery (COD)</span>
                    <span className="text-sm">{Number(selectedShipment.codAmount).toFixed(3)} KWD</span>
                  </div>
                  <input
                    type="number"
                    step="0.001"
                    value={collectedCod}
                    onChange={(e) => setCollectedCod(e.target.value)}
                    placeholder="Amount Collected in KWD"
                    className="w-full px-4 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-sm font-bold text-emerald-700 dark:text-emerald-300"
                  />
                </div>
              )}

              {/* Digital Signature Canvas */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1">
                    <span className="material-symbols-outlined text-blue-600 text-base">draw</span>
                    Customer Signature
                  </label>
                  <button onClick={clearSignature} className="text-[11px] font-semibold text-rose-500 hover:underline cursor-pointer">
                    Clear Pad
                  </button>
                </div>
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-900">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={150}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-36 touch-none cursor-crosshair"
                  />
                </div>
              </div>

              {/* Photo POD Capture */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Doorstep / Parcel Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setIsDeliverModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isSubmittingDelivery}
                onClick={handleSubmitDelivery}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                {isSubmittingDelivery ? 'Recording...' : 'Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEPTION / FAILED MODAL */}
      {isExceptionModalOpen && selectedShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-600 text-2xl">error</span>
                Record Failed Delivery
              </h3>
              <button onClick={() => setIsExceptionModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Failure Reason *
                </label>
                <select
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                >
                  <option value="CUSTOMER_UNREACHABLE">Customer Unreachable / No Answer</option>
                  <option value="CUSTOMER_RESCHEDULED">Customer Requested Reschedule</option>
                  <option value="REFUSED_PACKAGE">Customer Refused Package</option>
                  <option value="WRONG_ADDRESS">Wrong Address / Incomplete PACI</option>
                  <option value="ACCESS_RESTRICTED">Location Access Restricted</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Reschedule Date (If applicable)
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Driver Notes
                </label>
                <textarea
                  value={failureNotes}
                  onChange={(e) => setFailureNotes(e.target.value)}
                  placeholder="e.g. Called 3 times, gate locked"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setIsExceptionModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isSubmittingException}
                onClick={handleSubmitException}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition cursor-pointer"
              >
                {isSubmittingException ? 'Saving...' : 'Log Failure'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverRunPage;
