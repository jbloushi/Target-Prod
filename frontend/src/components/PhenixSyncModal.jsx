import React, { useState } from 'react';
import { phenixService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const PhenixSyncModal = ({ isOpen, onClose, onSyncSuccess }) => {
    const { t, lang } = useLanguage();
    const isRTL = lang === 'ar';

    const [carrier, setCarrier] = useState('DHL');
    const [daysBack, setDaysBack] = useState(3);
    const [sendWhatsApp, setSendWhatsApp] = useState(false);
    const [onlyComplete, setOnlyComplete] = useState(true);

    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [syncResult, setSyncResult] = useState(null);
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    const handlePreview = async () => {
        setPreviewLoading(true);
        setError(null);
        setSyncResult(null);
        try {
            const res = await phenixService.previewShipments({
                carrier,
                daysBack,
                onlyComplete
            });
            setPreviewData(res.data);
        } catch (err) {
            setError(err.message || 'Failed to fetch preview from Phenix ERP');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSync = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await phenixService.syncShipments({
                carrier,
                daysBack,
                sendWhatsApp,
                onlyComplete
            });
            setSyncResult(res.data);
            setPreviewData(null);
            if (onSyncSuccess) {
                onSyncSuccess(res.data);
            }
        } catch (err) {
            setError(err.message || 'Failed to synchronize shipments from Phenix ERP');
        } finally {
            setLoading(false);
        }
    };

    const resetState = () => {
        setPreviewData(null);
        setSyncResult(null);
        setError(null);
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    return (
        <div className="modal modal-open z-50">
            <div className="modal-box max-w-4xl max-h-[90vh] flex flex-col p-6 rounded-2xl bg-base-100 shadow-2xl border border-base-200">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-base-200 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-2xl">sync_alt</span>
                        </div>
                        <div>
                            <h3 className="font-black text-lg text-base-content flex items-center gap-2">
                                {t('phenix_sync_title', 'Phenix ERP Shipment Ingestion')}
                                <span className="badge badge-primary badge-sm font-bold">API Gateway</span>
                            </h3>
                            <p className="text-xs text-base-content/60 font-medium">
                                {t('phenix_sync_subtitle', 'Pull consignments from Phenix ERP, sync live carrier API checkpoints, and issue branded tracking.')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="btn btn-sm btn-ghost btn-circle"
                        type="button"
                    >
                        ✕
                    </button>
                </div>

                {/* Body Content */}
                <div className="py-4 space-y-5 overflow-y-auto flex-1 pr-1">
                    {error && (
                        <div className="alert alert-error text-xs rounded-xl shadow-sm flex items-start gap-2">
                            <span className="material-symbols-outlined text-base mt-0.5">error</span>
                            <div className="flex-1">
                                <span className="font-bold">Sync Error: </span>
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    {/* Filter Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-base-200/50 p-4 rounded-xl border border-base-300/40">
                        {/* Carrier Select */}
                        <div className="form-control">
                            <label className="label py-1">
                                <span className="label-text text-xs font-bold uppercase tracking-wider text-base-content/70">
                                    Carrier Target
                                </span>
                            </label>
                            <select
                                value={carrier}
                                onChange={(e) => { setCarrier(e.target.value); resetState(); }}
                                className="select select-bordered select-sm rounded-lg font-bold text-xs"
                            >
                                <option value="DHL">DHL Express (DGR)</option>
                                <option value="ARAMEX">Aramex</option>
                                <option value="FEDEX">FedEx</option>
                                <option value="ALL">All Carriers in Report</option>
                            </select>
                        </div>

                        {/* Days Back */}
                        <div className="form-control">
                            <label className="label py-1">
                                <span className="label-text text-xs font-bold uppercase tracking-wider text-base-content/70">
                                    Rolling Date Window
                                </span>
                            </label>
                            <select
                                value={daysBack}
                                onChange={(e) => { setDaysBack(Number(e.target.value)); resetState(); }}
                                className="select select-bordered select-sm rounded-lg font-bold text-xs"
                            >
                                <option value={1}>Today Only (1 Day)</option>
                                <option value={3}>Last 3 Days (Rolling Window)</option>
                                <option value={7}>Last 7 Days (Weekly Backlog)</option>
                            </select>
                        </div>

                        {/* Strict Complete Data Filter */}
                        <div className="form-control justify-end">
                            <label className="label cursor-pointer py-1.5 px-2 bg-base-100 rounded-lg border border-base-200">
                                <div className="flex flex-col">
                                    <span className="label-text text-xs font-bold text-base-content">
                                        Full Data Only
                                    </span>
                                    <span className="text-[10px] text-base-content/50">
                                        Require AWB + Phone
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={onlyComplete}
                                    onChange={(e) => { setOnlyComplete(e.target.checked); resetState(); }}
                                    className="toggle toggle-success toggle-sm"
                                />
                            </label>
                        </div>

                        {/* WhatsApp Toggle */}
                        <div className="form-control justify-end">
                            <label className="label cursor-pointer py-1.5 px-2 bg-base-100 rounded-lg border border-base-200">
                                <div className="flex flex-col">
                                    <span className="label-text text-xs font-bold text-base-content">
                                        Auto WhatsApp
                                    </span>
                                    <span className="text-[10px] text-base-content/50">
                                        target-kw.com URL
                                    </span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={sendWhatsApp}
                                    onChange={(e) => setSendWhatsApp(e.target.checked)}
                                    className="toggle toggle-primary toggle-sm"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Notice Banner */}
                    <div className="p-3 bg-info/10 border border-info/20 rounded-xl text-xs text-base-content/80 flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-info text-lg shrink-0">verified</span>
                        <span>
                            <strong>Branded Security:</strong> Customers only receive <code>https://target-kw.com/track/TRK-...</code> links. Incomplete rows missing carrier AWBs, recipient names, or phone numbers are filtered out automatically.
                        </span>
                    </div>

                    {/* Success Summary Result View */}
                    {syncResult && (
                        <div className="space-y-4">
                            <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-xs">
                                <div className="flex items-center gap-2 text-success font-black text-sm mb-2">
                                    <span className="material-symbols-outlined">check_circle</span>
                                    Synchronization Completed Successfully!
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-semibold">
                                    <div className="bg-base-100 p-2.5 rounded-lg border border-base-200">
                                        <div className="text-[10px] text-base-content/50">Full Data Matched</div>
                                        <div className="text-base font-black text-base-content">{syncResult.completeCount}</div>
                                    </div>
                                    <div className="bg-base-100 p-2.5 rounded-lg border border-base-200">
                                        <div className="text-[10px] text-base-content/50">Created (New)</div>
                                        <div className="text-base font-black text-primary">{syncResult.createdCount}</div>
                                    </div>
                                    <div className="bg-base-100 p-2.5 rounded-lg border border-base-200">
                                        <div className="text-[10px] text-base-content/50">Updated (Existing)</div>
                                        <div className="text-base font-black text-base-content">{syncResult.updatedCount}</div>
                                    </div>
                                    <div className="bg-base-100 p-2.5 rounded-lg border border-base-200">
                                        <div className="text-[10px] text-base-content/50">Carrier Synced</div>
                                        <div className="text-base font-black text-accent">{syncResult.carrierSyncedCount}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Details Table */}
                            {syncResult.results?.length > 0 && (
                                <div className="overflow-x-auto max-h-60 border border-base-200 rounded-xl">
                                    <table className="table table-xs w-full">
                                        <thead className="bg-base-200 sticky top-0">
                                            <tr>
                                                <th>Target Tracking #</th>
                                                <th>Invoice</th>
                                                <th>Carrier AWB</th>
                                                <th>Recipient</th>
                                                <th>Phone</th>
                                                <th>Status</th>
                                                <th>Carrier Checkpoints</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {syncResult.results.map((row, idx) => (
                                                <tr key={idx} className="hover">
                                                    <td className="font-mono font-bold text-primary">{row.trackingNumber}</td>
                                                    <td>#{row.receiptNo || row.billId}</td>
                                                    <td className="font-mono">{row.carrierTracking || '-'}</td>
                                                    <td className="font-bold">{row.receiverName}</td>
                                                    <td className="font-mono text-xs">{row.receiverPhone}</td>
                                                    <td>
                                                        <span className="badge badge-ghost badge-xs font-bold uppercase">{row.status}</span>
                                                    </td>
                                                    <td>
                                                        {row.carrierSynced ? (
                                                            <span className="text-success font-bold flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-xs">done_all</span> Live API
                                                            </span>
                                                        ) : (
                                                            <span className="text-base-content/40 text-[10px]">Pending</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span className={`badge badge-xs font-bold ${row.action === 'CREATED' ? 'badge-primary' : 'badge-outline'}`}>
                                                            {row.action}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Preview Table View */}
                    {previewData && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-xs text-base-content">
                                    Preview: {previewData.matchedCount} Valid Consignments Found
                                </h4>
                                <span className="text-[11px] text-base-content/60 font-medium">
                                    (Total ERP Bills: {previewData.totalFetched} | Complete: {previewData.completeCount} | Incomplete Skipped: {previewData.incompleteCount})
                                </span>
                            </div>
                            <div className="overflow-x-auto max-h-64 border border-base-200 rounded-xl">
                                <table className="table table-xs w-full">
                                    <thead className="bg-base-200 sticky top-0">
                                        <tr>
                                            <th>Bill / Invoice</th>
                                            <th>Carrier</th>
                                            <th>Carrier AWB</th>
                                            <th>Recipient</th>
                                            <th>Phone (E.164)</th>
                                            <th>Data Quality</th>
                                            <th>Target DB Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.items.map((item, idx) => (
                                            <tr key={idx} className="hover">
                                                <td className="font-bold">#{item.receiptNo || item.billId}</td>
                                                <td>
                                                    <span className="badge badge-outline badge-xs font-bold">{item.derivedCarrier}</span>
                                                </td>
                                                <td className="font-mono font-bold text-primary">{item.carrierTracking || '-'}</td>
                                                <td className="font-medium">{item.receiverName}</td>
                                                <td className="font-mono text-xs font-semibold">{item.receiverPhone}</td>
                                                <td>
                                                    {item.isComplete ? (
                                                        <span className="badge badge-success badge-xs font-bold">Full Data</span>
                                                    ) : (
                                                        <span className="badge badge-error badge-xs font-bold">
                                                            Missing: {item.missingFields.join(', ')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>
                                                    {item.existsInDb ? (
                                                        <span className="badge badge-warning badge-xs font-bold">Already Ingested</span>
                                                    ) : (
                                                        <span className="badge badge-primary badge-xs font-bold">Ready to Pull</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="pt-4 border-t border-base-200 flex items-center justify-between shrink-0">
                    <button
                        type="button"
                        onClick={handlePreview}
                        disabled={previewLoading || loading}
                        className="btn btn-outline btn-sm rounded-xl font-bold gap-1.5"
                    >
                        {previewLoading ? (
                            <span className="loading loading-spinner loading-xs"></span>
                        ) : (
                            <span className="material-symbols-outlined text-base">visibility</span>
                        )}
                        Preview Shipments
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="btn btn-ghost btn-sm rounded-xl font-bold"
                        >
                            {syncResult ? 'Done' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={loading || previewLoading}
                            className="btn btn-primary btn-sm rounded-xl font-extrabold shadow-sm gap-1.5"
                        >
                            {loading ? (
                                <>
                                    <span className="loading loading-spinner loading-xs"></span>
                                    Ingesting & Syncing DHL...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-base">cloud_download</span>
                                    Pull & Sync Shipments
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PhenixSyncModal;
