import React, { useEffect, useState } from 'react';
import { settingsService } from '../services/api';

const AdminGeminiClassificationsPage = () => {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const load = () => settingsService.getGeminiClassifications().then((res) => setReport(res.data)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  const counts = Object.fromEntries((report?.byDecision || []).map((item) => [item.decision, item._count?._all || 0]));
  return <main className="p-6 space-y-6">
    <div><h1 className="text-2xl font-black">Gemini Carrier Classification</h1><p className="text-sm opacity-70">New ambiguous carrier events only. Shipment statuses are not changed automatically.</p></div>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[['Total', report?.total || 0], ['Classified', counts.classified || 0], ['Review', counts.manual_review || 0], ['Errors', counts.error || 0], ['Skipped', counts.skipped || 0]].map(([label, value]) => <div className="card bg-base-100 shadow p-4" key={label}><div className="text-xs uppercase opacity-60">{label}</div><div className="text-2xl font-black">{value}</div></div>)}
    </div>
    <div className="card bg-base-100 shadow overflow-x-auto"><table className="table table-sm"><thead><tr><th>Provider</th><th>Tracking</th><th>Raw event</th><th>Proposed internal status</th><th>Flags</th><th>Confidence</th><th>Decision</th><th>Actions</th></tr></thead><tbody>{(report?.recent || []).map((row) => <tr key={row.id}><td>{row.provider}</td><td>{row.trackingNumber || '—'}</td><td className="max-w-md whitespace-normal">{row.rawDescription}</td><td><select className="select select-bordered select-xs" value={row.normalizedStatus || ''} onChange={(e) => setReport((prev) => ({ ...prev, recent: prev.recent.map((item) => item.id === row.id ? { ...item, normalizedStatus: e.target.value } : item) }))}><option value="">No milestone change</option>{['booked','in_transit','out_for_delivery','delivered','returned','exception'].map((status) => <option key={status}>{status}</option>)}</select></td><td>{(row.operationalFlags || []).join(', ') || '—'}</td><td>{row.confidence == null ? '—' : `${Math.round(row.confidence * 100)}%`}</td><td><span className="badge badge-outline">{row.decision}</span></td><td className="flex gap-1"><button className="btn btn-success btn-xs" onClick={async () => { await settingsService.updateGeminiClassification(row.id, { action: 'approve', normalizedStatus: row.normalizedStatus, operationalFlags: row.operationalFlags }); load(); }}>Approve</button><button className="btn btn-error btn-xs" onClick={async () => { await settingsService.updateGeminiClassification(row.id, { action: 'decline', reviewNote: 'Declined by admin' }); load(); }}>Decline</button></td></tr>)}</tbody></table></div>
  </main>;
};
export default AdminGeminiClassificationsPage;
