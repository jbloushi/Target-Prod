import React, { useState, useRef } from 'react';
import { useSnackbar } from 'notistack';
import { shipmentService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { TK } from '../tokens/kineticHorizon';
import { Modal } from '../ui';

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) {
          handleReset();
          onClose();
        }
      }}
      title={t('bulk_modal_title', 'Bulk Consignment Batch Ingestion')}
      width="920px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: `1px solid ${TK.border}`,
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 600,
              color: TK.text1,
              cursor: 'pointer'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.primary }}>download</span>
            {t('bulk_download_template', 'Download CSV Template')}
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            {step === 'preview' && (
              <button
                type="button"
                onClick={() => setStep('upload')}
                disabled={isSubmitting}
                style={{
                  padding: '9px 18px',
                  borderRadius: 10,
                  border: `1px solid ${TK.border}`,
                  background: '#ffffff',
                  color: TK.text2,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                {t('back', 'Back to Upload')}
              </button>
            )}

            {step === 'results' ? (
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  onClose();
                }}
                style={{
                  padding: '9px 22px',
                  borderRadius: 10,
                  border: 'none',
                  background: TK.primary,
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                {t('close', 'Done')}
              </button>
            ) : step === 'preview' ? (
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={isSubmitting || validCount === 0}
                style={{
                  padding: '9px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: validCount === 0 ? '#9ca3af' : TK.primary,
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: validCount === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: validCount > 0 ? '0 2px 10px rgba(0,80,212,0.25)' : 'none'
                }}
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                    {t('loading', 'Ingesting Consignments...')}
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
                    {t('bulk_import_btn', 'Import')} ({validCount})
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
            style={{
              border: `2px dashed ${isDragging ? TK.primary : TK.border}`,
              background: isDragging ? TK.primaryBg : '#fbfcfd',
              borderRadius: 16,
              padding: '36px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: TK.primaryBg,
              color: TK.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28 }}>cloud_upload</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: TK.text1 }}>
              {t('bulk_drop_title', 'Drop your CSV file here, or')}{' '}
              <span style={{ color: TK.primary, textDecoration: 'underline' }}>
                {t('bulk_browse', 'browse')}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 4 }}>
              {t('bulk_drop_hint', 'Supports up to 500 orders per batch with automatic address and pricing routing.')}
            </div>
          </div>

          {/* Quick Paste Alternative */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontWeight: 700, fontSize: 12, color: TK.text2 }}>
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
                  style={{
                    background: 'none',
                    border: 'none',
                    color: TK.primary,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
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
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 12,
                border: `1px solid ${TK.border}`,
                fontFamily: 'monospace',
                fontSize: 12,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Batch Configuration Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            background: '#f8fafc',
            padding: 14,
            borderRadius: 14,
            border: `1px solid ${TK.border}`
          }}>
            <div>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 11.5, color: TK.text2, marginBottom: 4 }}>
                {t('bulk_fallback_carrier', 'Fallback Carrier')}
              </label>
              <select
                value={defaultCarrier}
                onChange={(e) => setDefaultCarrier(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${TK.border}`,
                  fontSize: 12.5,
                  fontWeight: 600,
                  outline: 'none'
                }}
              >
                <option value="DGR">DHL Express (DGR)</option>
                <option value="OTE">LogesTechs (OTE Ground)</option>
                <option value="ARAMEX">Aramex Express</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
              <input
                type="checkbox"
                id="autoDispatchCheck"
                checked={autoDispatch}
                onChange={(e) => setAutoDispatch(e.target.checked)}
                style={{ cursor: 'pointer', width: 16, height: 16 }}
              />
              <label htmlFor="autoDispatchCheck" style={{ fontSize: 12.5, fontWeight: 600, color: TK.text1, cursor: 'pointer' }}>
                {t('bulk_auto_dispatch', 'Auto-dispatch waybills immediately')}
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <div style={{
                padding: '4px 10px',
                borderRadius: 8,
                background: '#ecfdf5',
                color: '#059669',
                fontSize: 12,
                fontWeight: 700
              }}>
                ✓ {validCount} {lang === 'ar' ? 'صالح' : 'Valid'}
              </div>
              {errorCount > 0 && (
                <div style={{
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: '#fef2f2',
                  color: '#dc2626',
                  fontSize: 12,
                  fontWeight: 700
                }}>
                  ⚠ {errorCount} {lang === 'ar' ? 'يوجد أخطاء' : 'Invalid'}
                </div>
              )}
            </div>
          </div>

          {/* Table Preview Grid */}
          <div style={{
            maxHeight: 340,
            overflowY: 'auto',
            border: `1px solid ${TK.border}`,
            borderRadius: 12
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: lang === 'ar' ? 'right' : 'left', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${TK.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>#</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('status', 'Status')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('recipient', 'Recipient')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('phone', 'Phone')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('destination', 'Destination')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('weight', 'Weight')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('cod_amount', 'COD')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('carrier', 'Carrier')}</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((r, i) => (
                  <tr
                    key={r.__id || i}
                    style={{
                      borderBottom: `1px solid ${TK.border}`,
                      background: r.__isValid ? 'transparent' : '#fff5f5'
                    }}
                  >
                    <td style={{ padding: '8px 12px', color: TK.text3, fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.__isValid ? (
                        <span style={{ color: '#059669', fontWeight: 700, fontSize: 11 }}>{t('bulk_ready', 'READY')}</span>
                      ) : (
                        <span title={r.__errors.join(', ')} style={{ color: '#dc2626', fontWeight: 700, fontSize: 11, cursor: 'help' }}>
                          {t('bulk_error', 'ERROR')}: {r.__errors[0]}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: TK.text1 }}>{r.recipientName || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.recipientPhone || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.destinationCity}, {r.destinationCountry}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{r.weightKg} kg</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{r.codAmount ? `${r.codAmount}` : '—'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: TK.primary }}>{r.carrierCode || defaultCarrier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'results' && importResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: 18,
            borderRadius: 14,
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            display: 'flex',
            alignItems: 'center',
            gap: 14
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#059669',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 26 }}>check_circle</span>
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#065f46' }}>
                {t('bulk_success_title', 'Batch Ingestion Completed')}
              </div>
              <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>
                {lang === 'ar'
                  ? `تم إصدار ${importResults.created?.length || 0} بوليصة شحن بنجاح.`
                  : `Successfully generated ${importResults.created?.length || 0} waybills.`}
                {importResults.errors?.length > 0 && ` (${importResults.errors.length} ${lang === 'ar' ? 'أخطاء' : 'errors'})`}
              </div>
            </div>
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${TK.border}`, borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: lang === 'ar' ? 'right' : 'left', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: `1px solid ${TK.border}` }}>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('waybill_number', 'Tracking #')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('recipient', 'Recipient')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3 }}>{t('carrier', 'Carrier')}</th>
                  <th style={{ padding: '10px 12px', fontWeight: 700, color: TK.text3, textAlign: 'right' }}>{t('price', 'Calculated Price')}</th>
                </tr>
              </thead>
              <tbody>
                {(importResults.created || []).map((c, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${TK.border}` }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: TK.primary }}>
                      {c.trackingNumber}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.recipientName}</td>
                    <td style={{ padding: '8px 12px' }}>{c.carrierCode}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>
                      {c.price ? `${Number(c.price).toFixed(3)} ${lang === 'ar' ? 'د.ك' : 'KWD'}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
