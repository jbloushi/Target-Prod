import React, { useEffect, useState } from 'react';
import { settingsService } from '../services/api';

const AdminGeminiClassificationsPage = () => {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { settingsService.getGeminiClassifications().then((res) => setReport(res.data)).catch((err) => setError(err.message)); }, []);
  const counts = Object.fromEntries((report?.byDecision || []).map((item) => [item.decision, item._count?._all || 0]));
  return <main className="p-6 space-y-6">
    <div><h1 className="text-2xl font-black">Gemini Carrier Classification</h1><p className="text-sm opacity-70">New ambiguous carrier events only. Shipment statuses are not changed automatically.</p></div>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[['Total', report?.total || 0], ['Classified', counts.classified || 0], ['Review', counts.manual_review || 0], ['Errors', counts.error || 0], ['Skipped', counts.skipped || 0]].map(([label, value]) => <div className="card bg-base-100 shadow p-4" key={label}><div className="text-xs uppercase opacity-60">{label}</div><div className="text-2xl font-black">{value}</div></div>)}
    </div>
    <div className="card bg-base-100 shadow overflow-x-auto"><table className="table table-sm"><thead><tr><th>Provider</th><th>Tracking</th><th>Raw event</th><th>Normalized</th><th>Confidence</th><th>Decision</th><th>Created</th></tr></thead><tbody>{(report?.recent || []).map((row) => <tr key={row.id}><td>{row.provider}</td><td>{row.trackingNumber || '—'}</td><td className="max-w-md whitespace-normal">{row.rawDescription}</td><td>{row.normalizedStatus || '—'}</td><td>{row.confidence == null ? '—' : `${Math.round(row.confidence * 100)}%`}</td><td><span className="badge badge-outline">{row.decision}</span></td><td>{new Date(row.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>
  </main>;
};
export default AdminGeminiClassificationsPage;
