import React, { useState, useRef } from 'react';
import { useSnackbar } from 'notistack';
import { shipmentService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

const SAMPLE_CSV = `recipientName,recipientPhone,phoneCountryCode,destinationCountry,destinationCity,formattedAddress,weightKg,itemDescription,codAmount,carrierCode
"Ahmed Al-Kandari","96599112233","965","KW","Kuwait City","Salmiya, Block 4, Street 12, Bldg 8","1.5","Electronics & Gadgets","","DGR"
"Sara Al-Otaibi","966501234567","966","SA","Riyadh","Olaya District, King Fahd Rd","2.0","Luxury Cosmetics","250","OTE"
"Mohammed Al-Nuaimi","971509876543","971","AE","Dubai","Downtown Dubai, Blvd Plaza Tower 1","0.8","Documents & Samples","","ARAMEX"`;

export default function BulkShipmentImportModal({ isOpen, onClose, onImportSuccess }) {
  const { enqueueSnackbar } = useSnackbar();
  const { t, lang } = useLanguage();
  const fileInputRef = useRef(null);


  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'results'
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [defaultCarrier, setDefaultCarrier] = useState('DGR');
  const [autoDispatch, setAutoDispatch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Helper: parse CSV text into row objects
  const parseCSV = (text) => {
    const lines = text.trim().split(/\r\n|\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    // Simple CSV parser supporting quotes
    const parseLine = (line) => {
      const result = [];
      let cur = '';
      let insideQuote = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          insideQuote = !insideQuote;
        } else if (char === ',' && !insideQuote) {
          result.push(cur.trim().replace(/^["']|["']$/g, ''));
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const headers = parseLine(lines[0]).map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
      
      const row = {};
      headers.forEach((h, index) => {
        row[h] = values[index] !== undefined ? values[index] : '';
      });

      // Basic row validation
      const errors = [];
      if (!row.recipientName) errors.push('Name is missing');
      if (!row.recipientPhone) errors.push('Phone is missing');
      if (!row.destinationCountry) errors.push('Country is missing');
      if (!row.destinationCity) errors.push('City is missing');

      const weight = parseFloat(row.weightKg);
      if (isNaN(weight) || weight <= 0) {
        row.weightKg = '1.0';
      }

      rows.push({
        ...row,
        __id: i,
        __errors: errors,
        __isValid: errors.length === 0
      });
    }

    return rows;
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      enqueueSnackbar('Please upload a standard CSV file (.csv)', { variant: 'warning' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setRawText(text);
      const rows = parseCSV(text);
      if (rows.length === 0) {
        enqueueSnackbar('No valid data rows found in the CSV', { variant: 'error' });
        return;
      }
      setParsedRows(rows);
      setStep('preview');
      enqueueSnackbar(`Parsed ${rows.length} shipment rows`, { variant: 'info' });
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'target_shipments_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    enqueueSnackbar('Template downloaded', { variant: 'success' });
  };

  const handleImportSubmit = async () => {
    const validRows = parsedRows.filter(r => r.__isValid);
    if (validRows.length === 0) {
      enqueueSnackbar('No valid rows available to import. Please resolve validation errors.', { variant: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        rows: validRows.map(({ __id, __errors, __isValid, ...cleanRow }) => cleanRow),
        defaultCarrierCode: defaultCarrier,
        autoDispatch
      };

      const res = await shipmentService.bulkImport(payload);
      setImportResults(res.data || res);
      setStep('results');
      enqueueSnackbar(res.message || 'Bulk import completed successfully', { variant: 'success' });
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Bulk import failed';
      enqueueSnackbar(msg, { variant: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setRawText('');
    setParsedRows([]);
    setImportResults(null);
    setIsSubmitting(false);
  };

  const validCount = parsedRows.filter(r => r.__isValid).length;
  const errorCount = parsedRows.filter(r => !r.__isValid).length;

  if (!isOpen) return null;

  const handleClose = () => {
    if (!isSubmitting) {
      handleReset();
      onClose();
    }
  };

  const renderFooter = () => (
    <div className="flex flex-wrap justify-between items-center gap-3 w-full pt-4 border-t border-slate-200 dark:border-slate-800">
      <button
        type="button"
        onClick={handleDownloadTemplate}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <span className="material-symbols-outlined text-base text-primary">download</span>
        {t('bulk_download_template', 'Download CSV Template')}
      </button>

      <div className="flex flex-wrap items-center gap-2 ms-auto">
        {step === 'preview' && (
          <button
            type="button"
            onClick={() => setStep('upload')}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {t('back', 'Back to Upload')}
          </button>
        )}

        {step === 'results' ? (
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center rounded-xl bg-primary hover:bg-primary/90 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
          >
            {t('close', 'Done')}
          </button>
        ) : step === 'preview' ? (
          <button
            type="button"
            onClick={handleImportSubmit}
            disabled={isSubmitting || validCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                {t('loading', 'Ingesting Consignments...')}
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">rocket_launch</span>
                {t('bulk_import_btn', 'Import')} ({validCount})
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs" onClick={handleClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
            <span className="material-symbols-outlined text-primary">upload_file</span>
            <span>{t('bulk_modal_title', 'Bulk Consignment Batch Ingestion')}</span>
          </h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 transition-colors shrink-0"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

      {step === 'upload' && (
        <div className="flex flex-col gap-5">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed px-5 py-9 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-primary/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <div className="w-13 h-13 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
            </div>
            <div className="font-extrabold text-base text-slate-900 dark:text-white">
              {t('bulk_drop_title', 'Drop your CSV file here, or')}{' '}
              <span className="text-primary underline">
                {t('bulk_browse', 'browse')}
              </span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('bulk_drop_hint', 'Supports up to 500 orders per batch with automatic address and pricing routing.')}
            </div>
          </div>

          {/* Quick Paste Alternative */}
          <div>
            <div className="flex justify-between items-center gap-2 mb-1.5 flex-wrap">
              <label className="font-bold text-xs text-slate-600 dark:text-slate-300">
                {t('bulk_paste_title', 'Or Paste CSV Data Directly')}
              </label>
              {rawText && (
                <button
                  type="button"
                  onClick={() => {
                    const rows = parseCSV(rawText);
                    if (rows.length === 0) {
                      enqueueSnackbar('Invalid CSV format. Please verify headers.', { variant: 'error' });
                      return;
                    }
                    setParsedRows(rows);
                    setStep('preview');
                  }}
                  className="text-xs font-bold text-primary hover:underline cursor-pointer"
                >
                  {t('bulk_parse_btn', 'Parse & Preview →')}
                </button>
              )}
            </div>
            <textarea
              rows={5}
              placeholder="recipientName,recipientPhone,destinationCountry,destinationCity,weightKg..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col gap-4">
          {/* Batch Configuration Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 items-end">
            <div>
              <label className="block font-bold text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                {t('bulk_fallback_carrier', 'Fallback Carrier')}
              </label>
              <select
                value={defaultCarrier}
                onChange={(e) => setDefaultCarrier(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="DGR">DHL Express (DGR)</option>
                <option value="FEDEX">FedEx Express (FDX)</option>
                <option value="ARAMEX">Aramex Express</option>
                <option value="SMSA">SMSA Express</option>
                <option value="INTERNAL">Target Local Fleet</option>
              </select>
            </div>

            <div className="flex items-center gap-2 py-1.5">
              <input
                type="checkbox"
                id="autoDispatchCheck"
                checked={autoDispatch}
                onChange={(e) => setAutoDispatch(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 accent-primary cursor-pointer"
              />
              <label htmlFor="autoDispatchCheck" className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                {t('bulk_auto_dispatch', 'Auto-dispatch waybills immediately')}
              </label>
            </div>

            <div className="flex items-center sm:justify-end gap-2 flex-wrap">
              <div className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold">
                ✓ {validCount} {lang === 'ar' ? 'صالح' : 'Valid'}
              </div>
              {errorCount > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 text-xs font-bold">
                  ⚠ {errorCount} {lang === 'ar' ? 'يوجد أخطاء' : 'Invalid'}
                </div>
              )}
            </div>
          </div>

          {/* Table Preview Grid */}
          <div className="overflow-x-auto overflow-y-auto max-h-80 border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full min-w-[680px] border-collapse text-start text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2.5 font-bold text-start">#</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('status', 'Status')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('recipient', 'Recipient')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('phone', 'Phone')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('destination', 'Destination')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('weight', 'Weight')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('cod_amount', 'COD')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('carrier', 'Carrier')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {parsedRows.map((r, i) => (
                  <tr
                    key={r.__id || i}
                    className={r.__isValid ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40' : 'bg-rose-50/70 dark:bg-rose-950/30'}
                  >
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-semibold">{i + 1}</td>
                    <td className="px-3 py-2">
                      {r.__isValid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">{t('bulk_ready', 'READY')}</span>
                      ) : (
                        <span title={r.__errors.join(', ')} className="text-rose-600 dark:text-rose-400 font-bold text-[11px] cursor-help">
                          {t('bulk_error', 'ERROR')}: {r.__errors[0]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{r.recipientName || '—'}</td>
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300" dir="ltr">{r.recipientPhone || '—'}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                      {r.destinationCity}, {r.destinationCountry}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{r.weightKg} kg</td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800 dark:text-slate-200">{r.codAmount ? `${r.codAmount}` : '—'}</td>
                    <td className="px-3 py-2 font-bold text-primary">{r.carrierCode || defaultCarrier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'results' && importResults && (
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[26px]">check_circle</span>
            </div>
            <div>
              <div className="font-extrabold text-base text-emerald-900 dark:text-emerald-200">
                {t('bulk_success_title', 'Batch Ingestion Completed')}
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                {lang === 'ar'
                  ? `تم إصدار ${importResults.created?.length || 0} بوليصة شحن بنجاح.`
                  : `Successfully generated ${importResults.created?.length || 0} waybills.`}
                {importResults.errors?.length > 0 && ` (${importResults.errors.length} ${lang === 'ar' ? 'أخطاء' : 'errors'})`}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-72 border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full min-w-[480px] border-collapse text-start text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2.5 font-bold text-start">{t('waybill_number', 'Tracking #')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('recipient', 'Recipient')}</th>
                  <th className="px-3 py-2.5 font-bold text-start">{t('carrier', 'Carrier')}</th>
                  <th className="px-3 py-2.5 font-bold text-end">{t('price', 'Calculated Price')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {(importResults.created || []).map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-2 font-mono font-bold text-primary">
                      {c.trackingNumber}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{c.recipientName}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{c.carrierCode}</td>
                    <td className="px-3 py-2 text-end font-mono font-bold text-slate-900 dark:text-white">
                      {c.price ? `${Number(c.price).toFixed(3)} ${lang === 'ar' ? 'د.ك' : 'KWD'}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        {renderFooter()}
      </div>
    </div>
  );
}
