import React, { useState, useEffect } from 'react';
import { phenixService, settingsService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from 'notistack';

const PhenixSyncModal = ({ isOpen, onClose, onSyncSuccess }) => {
    const { t, lang } = useLanguage();
    const { isAdmin, isStaff } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const isRTL = lang === 'ar';

    const [carrier, setCarrier] = useState('ALL');
    const [daysBack, setDaysBack] = useState(3);
    const [sendWhatsApp, setSendWhatsApp] = useState(true);
    const [onlyComplete, setOnlyComplete] = useState(true);

    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewData, setPreviewData] = useState(null);
    const [syncResult, setSyncResult] = useState(null);
    const [error, setError] = useState(null);

    // Superadmin Auto-Sync Background State
    const [systemSettings, setSystemSettings] = useState(null);
    const [togglingAutoSync, setTogglingAutoSync] = useState(false);

    useEffect(() => {
        if (isOpen && (isAdmin || isStaff)) {
            loadSystemSettings();
        }
    }, [isOpen, isAdmin, isStaff]);

    const loadSystemSettings = async () => {
        try {
            const res = await settingsService.getSystemSettings();
            setSystemSettings(res.data || res);
        } catch (err) {
            console.debug('Failed to load system settings:', err.message);
        }
    };

    const handleToggleAutoSync = async (enabled) => {
        setTogglingAutoSync(true);
        try {
            const currentPhenix = systemSettings?.phenixSync || {};
            const updated = {
                ...currentPhenix,
                autoSyncEnabled: enabled,
                carrier,
                daysBack,
                sendWhatsApp,
                onlyComplete
            };
            await settingsService.updateSystemSettings({ phenixSync: updated });
            setSystemSettings(prev => ({
                ...prev,
                phenixSync: updated
            }));
            enqueueSnackbar(
                enabled 
                    ? 'Phenix ERP Auto-Pull enabled! Background worker will pull consignments automatically.' 
                    : 'Phenix ERP Auto-Pull disabled.', 
                { variant: enabled ? 'success' : 'info' }
            );
        } catch (err) {
            enqueueSnackbar('Failed to update Auto-Sync setting: ' + err.message, { variant: 'error' });
        } finally {
            setTogglingAutoSync(false);
        }
    };

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

    const phenixConfig = systemSettings?.phenixSync || {};
    const autoSyncActive = Boolean(phenixConfig.autoSyncEnabled);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs"
            onClick={handleClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                dir={isRTL ? 'rtl' : 'ltr'}
                className="relative w-full max-w-6xl max-h-[90vh] flex flex-col p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined text-2xl">sync_alt</span>
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                <span>{t('phenix_sync_title', 'Phenix ERP Shipment Ingestion & Auto-Sync')}</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">API Gateway</span>
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                {t('phenix_sync_subtitle', 'Pull consignments from Phenix ERP, separate merchant sender vs consignee, sync live carrier API checkpoints, and issue branded tracking.')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                        type="button"
                        aria-label="Close"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Body Content */}
                <div className="py-4 space-y-4 overflow-y-auto flex-1 pe-1">
                    {error && (
                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs shadow-2xs flex items-start gap-2">
                            <span className="material-symbols-outlined text-base mt-0.5 shrink-0">error</span>
                            <div className="flex-1">
                                <span className="font-bold">Sync Error: </span>
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    {/* Superadmin Background Auto-Sync Banner */}
                    {(isAdmin || isStaff) && (
                        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                            autoSyncActive
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-950 dark:text-emerald-100'
                                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white'
                        }`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                    autoSyncActive
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                }`}>
                                    <span className="material-symbols-outlined text-xl">
                                        {autoSyncActive ? 'autorenew' : 'pause_circle'}
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <div className="font-black text-xs uppercase tracking-wider flex items-center gap-2 flex-wrap">
                                        <span>Automated Background Pull (Cron Worker)</span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                            autoSyncActive
                                                ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700'
                                                : 'bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                                        }`}>
                                            {autoSyncActive ? 'ACTIVE (Every 15m)' : 'DISABLED'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] opacity-75 mt-0.5">
                                        {autoSyncActive
                                            ? `Background worker is periodically pulling consignments, creating merchant organizations, and syncing carrier AWBs.`
                                            : `Toggle to allow server background process to automatically ingest new Phenix bills without manual clicks.`}
                                    </p>
                                    {phenixConfig.lastAutoSyncAt && (
                                        <div className="text-[10px] opacity-65 mt-0.5 font-mono">
                                            Last Auto-Run: {new Date(phenixConfig.lastAutoSyncAt).toLocaleString()} • Status: {phenixConfig.lastAutoSyncStatus || 'OK'}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                <label className="inline-flex items-center cursor-pointer gap-2.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Auto-Pull</span>
                                    <span className="relative inline-flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={autoSyncActive}
                                            disabled={togglingAutoSync}
                                            onChange={(e) => handleToggleAutoSync(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <span className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-emerald-500 peer-disabled:opacity-50 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full" />
                                    </span>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Filter Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        {/* Carrier Select */}
                        <div className="flex flex-col">
                            <label className="py-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                Carrier Target
                            </label>
                            <select
                                value={carrier}
                                onChange={(e) => { setCarrier(e.target.value); resetState(); }}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            >
                                <option value="ALL">All Carriers in Report</option>
                                <option value="DHL">DHL Express (DGR)</option>
                                <option value="SMSA">SMSA Express</option>
                                <option value="ARAMEX">Aramex</option>
                                <option value="FEDEX">FedEx</option>
                                <option value="OTE">LogesTechs (OTE)</option>
                                <option value="POSTA_PLUS">Posta Plus</option>
                                <option value="IW_EXPRESS">IW Express</option>
                            </select>
                        </div>

                        {/* Days Back */}
                        <div className="flex flex-col">
                            <label className="py-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                Rolling Date Window
                            </label>
                            <select
                                value={daysBack}
                                onChange={(e) => { setDaysBack(Number(e.target.value)); resetState(); }}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                            >
                                <option value={1}>Today Only (1 Day)</option>
                                <option value={3}>Last 3 Days (Rolling Window)</option>
                                <option value={7}>Last 7 Days (Weekly Backlog)</option>
                            </select>
                        </div>

                        {/* Strict Complete Data Filter */}
                        <div className="flex flex-col justify-end">
                            <label className="flex items-center justify-between gap-2 cursor-pointer py-2 px-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                        Full Data Only
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                        Require AWB + Recipient
                                    </span>
                                </div>
                                <span className="relative inline-flex items-center shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={onlyComplete}
                                        onChange={(e) => { setOnlyComplete(e.target.checked); resetState(); }}
                                        className="sr-only peer"
                                    />
                                    <span className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full" />
                                </span>
                            </label>
                        </div>

                        {/* WhatsApp Toggle */}
                        <div className="flex flex-col justify-end">
                            <label className="flex items-center justify-between gap-2 cursor-pointer py-2 px-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                        Auto WhatsApp
                                    </span>
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                        Today's Orders (≤24h)
                                    </span>
                                </div>
                                <span className="relative inline-flex items-center shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={sendWhatsApp}
                                        onChange={(e) => setSendWhatsApp(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <span className="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:bg-primary after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full" />
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Notice Banner */}
                    <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 rounded-xl text-xs text-slate-700 dark:text-slate-300 flex items-center gap-2.5">
                        <span className="material-symbols-outlined text-sky-600 dark:text-sky-400 text-lg shrink-0">verified</span>
                        <span>
                            <strong className="text-slate-900 dark:text-white">Merchant & Consignee Isolation:</strong> Stores are linked to Client Organization IDs. Sender contact person is mapped to Origin, Consignee is mapped to Destination with ISO country normalization.
                        </span>
                    </div>

                    {/* Success Summary Result View */}
                    {syncResult && (
                        <div className="space-y-4">
                            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4 text-xs">
                                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-black text-sm mb-2">
                                    <span className="material-symbols-outlined">check_circle</span>
                                    Synchronization Completed Successfully!
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-semibold">
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400">Full Data Matched</div>
                                        <div className="text-base font-black text-slate-900 dark:text-white">{syncResult.completeCount}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400">Created (New)</div>
                                        <div className="text-base font-black text-primary">{syncResult.createdCount}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400">Updated (Existing)</div>
                                        <div className="text-base font-black text-slate-900 dark:text-white">{syncResult.updatedCount}</div>
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <div className="text-[10px] text-slate-500 dark:text-slate-400">Carrier Synced</div>
                                        <div className="text-base font-black text-emerald-600 dark:text-emerald-400">{syncResult.carrierSyncedCount}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Details Table */}
                            {syncResult.results?.length > 0 && (
                                <div className="overflow-x-auto max-h-64 border border-slate-200 dark:border-slate-800 rounded-xl">
                                    <table className="w-full min-w-[820px] text-start text-xs border-collapse">
                                        <thead className="bg-slate-50 dark:bg-slate-800/90 sticky top-0 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                            <tr>
                                                <th className="px-3 py-2.5 font-bold text-start">Target Tracking #</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Merchant Org (ID)</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Sender (Origin)</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Carrier / AWB</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Recipient & Destination</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Weight & Financials</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Status</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Carrier Sync</th>
                                                <th className="px-3 py-2.5 font-bold text-start">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                                            {syncResult.results.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                    <td className="px-3 py-2 font-mono font-bold text-primary">
                                                        <a
                                                            href={row.publicTrackingUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-primary hover:underline flex items-center gap-1"
                                                        >
                                                            {row.trackingNumber}
                                                            <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                                        </a>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-bold text-slate-900 dark:text-white">{row.merchantName || 'Target Logistics'}</div>
                                                        {row.merchantId && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">ID: {row.merchantId}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">{row.senderName || row.merchantName}</div>
                                                        <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{row.senderPhone}</div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-1">
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200">{row.carrierCode}</span>
                                                            <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">{row.carrierTracking || '-'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-bold text-xs text-slate-900 dark:text-white">{row.receiverName}</div>
                                                        <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{row.destCountryCode || 'KW'}</span>
                                                            <span className="font-mono">{row.receiverPhone}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                                            {row.totalAmount > 0 ? `${Number(row.totalAmount).toFixed(3)} KWD` : '-'}
                                                            {row.weightKg > 0 && (
                                                                <span className="ms-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{row.weightKg} kg</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                                            {row.costPrice > 0 && <span>Cost: {Number(row.costPrice).toFixed(3)}</span>}
                                                            {row.paymentMethod && (
                                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                                    row.paymentMethod.includes('آجل')
                                                                        ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                                                                        : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                                                }`}>
                                                                    {row.paymentMethod}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">{row.status}</span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {row.carrierSynced ? (
                                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-xs">
                                                                <span className="material-symbols-outlined text-xs">done_all</span> Live API
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-400 dark:text-slate-500 text-[10px]">Pending</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                            row.action === 'CREATED'
                                                                ? 'bg-primary/10 text-primary border border-primary/20'
                                                                : 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                                                        }`}>
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
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                                    Preview: {previewData.matchedCount} Valid Consignments Found
                                </h4>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                                    (Total ERP Bills: {previewData.totalFetched} | Complete: {previewData.completeCount} | Incomplete Skipped: {previewData.incompleteCount})
                                </span>
                            </div>
                            <div className="overflow-x-auto max-h-72 border border-slate-200 dark:border-slate-800 rounded-xl">
                                <table className="w-full min-w-[900px] text-start text-xs border-collapse">
                                    <thead className="bg-slate-50 dark:bg-slate-800/90 sticky top-0 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="px-3 py-2.5 font-bold text-start">Bill / Invoice</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Merchant Org (Client ID)</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Sender Contact (Origin)</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Carrier / AWB</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Recipient (Consignee)</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Destination</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Weight</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Sell / Cost (KWD)</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Data Quality</th>
                                            <th className="px-3 py-2.5 font-bold text-start">Target DB</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                                        {previewData.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="px-3 py-2 font-bold text-slate-900 dark:text-white">#{item.receiptNo || item.billId}</td>
                                                <td className="px-3 py-2">
                                                    <div className="font-bold text-primary">{item.merchantName || 'Target Logistics'}</div>
                                                    {item.merchantId ? (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">ID: {item.merchantId}</span>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">No ERP ID</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="font-semibold text-xs text-slate-900 dark:text-white">{item.senderName || item.merchantName}</div>
                                                    <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{item.senderPhone}</div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200">{item.derivedCarrier}</span>
                                                        <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">{item.carrierTracking || '-'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="font-semibold text-xs text-slate-900 dark:text-white">{item.receiverName}</div>
                                                    <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{item.receiverPhone}</div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="font-bold flex items-center gap-1 text-slate-800 dark:text-slate-200">
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{item.destCountryCode || 'KW'}</span>
                                                        <span className="text-xs">{item.destCountryName || 'Kuwait'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200">
                                                        {item.weightKg > 0 ? `${item.weightKg} kg` : '-'}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                                                        {item.totalAmount > 0 ? `${item.totalAmount.toFixed(3)} KWD` : '-'}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                                        {item.costPrice > 0 && <span>Cost: {item.costPrice.toFixed(3)}</span>}
                                                        {item.paymentMethod && (
                                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                                item.paymentMethod.includes('آجل')
                                                                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                                                                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                                            }`}>
                                                                {item.paymentMethod}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    {item.isComplete ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">Full Data</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                                                            Missing: {item.missingFields.join(', ')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {item.existsInDb ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">Already Ingested</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">Ready to Pull</span>
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
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handlePreview}
                        disabled={previewLoading || loading}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        {previewLoading ? (
                            <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <span className="material-symbols-outlined text-base">visibility</span>
                        )}
                        Preview Shipments
                    </button>

                    <div className="flex flex-wrap items-center gap-2 ms-auto">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            {syncResult ? 'Done' : 'Cancel'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={loading || previewLoading}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 px-4 py-2 text-xs font-extrabold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? (
                                <>
                                    <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    Ingesting & Syncing Carriers...
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
