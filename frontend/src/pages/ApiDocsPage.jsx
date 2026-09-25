import React, { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import PageHeader from '../components/common/PageHeader';

const METHOD_BADGES = {
  GET: 'badge-success text-white',
  POST: 'badge-primary text-white',
  PUT: 'badge-warning text-neutral',
  DELETE: 'badge-error text-white',
};

const MethodBadge = ({ method }) => {
  const badgeClass = METHOD_BADGES[method] || 'badge-neutral';
  return (
    <span className={`badge badge-sm font-mono font-black text-[11px] px-2 py-0.5 ${badgeClass}`}>
      {method}
    </span>
  );
};

const CodeBlock = ({ children }) => (
  <pre className="p-3 rounded-lg bg-neutral text-neutral-content font-mono text-xs overflow-x-auto leading-relaxed my-2">
    <code>{children}</code>
  </pre>
);

const FieldTable = ({ fields }) => {
  const { lang } = useLanguage();
  return (
    <div className="overflow-x-auto my-2">
      <table className="table table-xs table-zebra w-full font-mono">
        <thead>
          <tr className="text-base-content/60 font-sans">
            <th>{lang === 'ar' ? 'الحقل' : 'Field'}</th>
            <th>{lang === 'ar' ? 'النوع' : 'Type'}</th>
            <th>{lang === 'ar' ? 'مطلوب' : 'Required'}</th>
            <th className="font-sans">{lang === 'ar' ? 'الوصف' : 'Description'}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.field}>
              <td className="text-primary font-bold">{f.field}</td>
              <td className="text-base-content/70">{f.type}</td>
              <td>
                {f.required ? (
                  <span className="badge badge-error badge-xs font-bold text-white">required</span>
                ) : (
                  <span className="badge badge-ghost badge-xs">optional</span>
                )}
              </td>
              <td className="font-sans text-xs text-base-content/80">{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const EndpointCard = ({ method, path, title, description, fields, response, errors, note }) => {
  const [open, setOpen] = useState(false);
  const { lang } = useLanguage();

  return (
    <div className="card bg-base-100 border border-base-200 shadow-sm overflow-hidden mb-3">
      <div
        onClick={() => setOpen(!open)}
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-base-200/50 transition-colors gap-3"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <MethodBadge method={method} />
          <code className="font-mono text-xs sm:text-sm font-bold text-base-content">{path}</code>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-base-content/60 hidden sm:inline">{title}</span>
          <span className="material-symbols-outlined text-sm text-base-content/40 transition-transform duration-200">
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </div>

      {open && (
        <div className="p-4 sm:p-5 border-t border-base-200 space-y-4 bg-base-100">
          {note && (
            <div className="alert alert-info text-xs py-2 px-3 shadow-none">
              <span className="material-symbols-outlined text-base">info</span>
              <span>{note}</span>
            </div>
          )}

          {description && <p className="text-xs text-base-content/70 leading-relaxed">{description}</p>}

          {fields && fields.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-base-content/60 uppercase tracking-wider mb-1">
                {lang === 'ar' ? 'حقول الطلب' : 'Request Payload Parameters'}
              </div>
              <FieldTable fields={fields} />
            </div>
          )}

          {response && (
            <div>
              <div className="text-[11px] font-bold text-base-content/60 uppercase tracking-wider mb-1">
                {lang === 'ar' ? 'نموذج الاستجابة' : 'Response Example (JSON)'}
              </div>
              <CodeBlock>{response}</CodeBlock>
            </div>
          )}

          {errors && errors.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-base-content/60 uppercase tracking-wider mb-1.5">
                {lang === 'ar' ? 'استجابات الأخطاء' : 'HTTP Error Responses'}
              </div>
              <div className="space-y-1">
                {errors.map((e) => (
                  <div key={e.code} className="flex items-center gap-2 text-xs">
                    <span className="badge badge-error badge-xs font-mono font-bold text-white">{e.code}</span>
                    <span className="text-base-content/70">{e.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SectionHeader = ({ id, title, subtitle }) => (
  <div id={id} className="pt-6 pb-2 scroll-mt-24 space-y-1">
    <h3 className="text-xl font-black text-base-content tracking-tight">{title}</h3>
    {subtitle && <p className="text-xs text-base-content/60">{subtitle}</p>}
  </div>
);

const ApiKeyPanel = () => {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { lang } = useLanguage();
  const [apiKey, setApiKey] = useState(user?.apiKey || '');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setApiKey(user?.apiKey || '');
  }, [user?.apiKey]);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await api.post('/auth/api-key');
      setApiKey(res.data.apiKey);
      enqueueSnackbar(lang === 'ar' ? 'تم إنشاء مفتاح API جديد!' : 'New API key generated!', { variant: 'success' });
    } catch {
      enqueueSnackbar(lang === 'ar' ? 'فشل إنشاء المفتاح' : 'Failed to generate key', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!apiKey) return;
    navigator.clipboard.writeText(apiKey);
    enqueueSnackbar(lang === 'ar' ? 'تم نسخ مفتاح API!' : 'API key copied!', { variant: 'success' });
  };

  const masked = apiKey
    ? show ? apiKey : `${apiKey.substring(0, 8)}...`
    : (user?.apiKeyLast4
        ? `Stored key ending with ....${user.apiKeyLast4}`
        : 'No key generated yet - click Roll Key');

  return (
    <div className="card bg-base-100 border border-base-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-xl">key</span>
        <h4 className="font-black text-sm text-base-content uppercase tracking-wider">
          {lang === 'ar' ? 'مفتاح API الخاص بحسابك' : 'Your Live API Secret Key'}
        </h4>
      </div>

      <div className="alert alert-warning text-xs py-2.5 px-3">
        <span className="material-symbols-outlined text-base">warning</span>
        <span>Never expose this key in client-side JavaScript. Store strictly in backend environment variables.</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            readOnly
            value={masked}
            className="input input-bordered w-full font-mono text-xs pr-10 bg-base-200/50"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            disabled={!apiKey}
            className="btn btn-ghost btn-circle btn-xs absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50"
          >
            <span className="material-symbols-outlined text-sm">{show ? 'visibility_off' : 'visibility'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={copy}
          disabled={!apiKey}
          className="btn btn-outline border-base-300 btn-sm font-bold text-xs gap-1"
        >
          <span className="material-symbols-outlined text-sm">content_copy</span>
          <span>Copy</span>
        </button>

        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="btn btn-primary btn-sm font-bold text-xs gap-1 shadow-md shadow-primary/20"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          <span>{loading ? 'Rolling...' : 'Roll Key'}</span>
        </button>
      </div>

      <p className="text-[11px] text-base-content/50">
        Transmit as <code className="bg-base-200 px-1 py-0.5 rounded font-mono font-bold">x-api-key: [YOUR_KEY]</code> header in every HTTP request.
      </p>
    </div>
  );
};

const SECTIONS = [
  { id: 'auth', label: 'Authentication', labelAr: 'المصادقة' },
  { id: 'shipments', label: 'Shipments', labelAr: 'الشحنات' },
  { id: 'quotes', label: 'Quotes', labelAr: 'عروض الأسعار' },
  { id: 'addresses', label: 'Address Book', labelAr: 'دفتر العناوين' },
  { id: 'pickups', label: 'Pickups', labelAr: 'الاستلام' },
  { id: 'tracking', label: 'Tracking', labelAr: 'التتبع' },
  { id: 'public', label: 'Public Tracking', labelAr: 'التتبع العام' },
  { id: 'statuses', label: 'Status Reference', labelAr: 'مرجع الحالات' },
];

export const ApiDocsPage = () => {
  const { lang } = useLanguage();

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      <PageHeader
        title={lang === 'ar' ? 'واجهة برمجة التطبيقات للمطورين' : 'Developer REST API & Integrations'}
        subtitle="Complete technical reference for programmatic consignment dispatch, live carrier telemetry, and customs manifests."
      >
        <a
          href="/postman_collection.json"
          download="target-logistics-api.postman_collection.json"
          className="btn btn-outline border-base-300 btn-sm font-bold text-xs gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          <span>Postman Collection</span>
        </a>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sticky Left Nav */}
        <div className="hidden lg:block lg:col-span-3 sticky top-24">
          <div className="card bg-base-100 border border-base-200 shadow-sm p-3">
            <div className="text-[11px] font-black text-base-content/50 uppercase tracking-widest px-3 py-2">
              API Topics
            </div>
            <ul className="menu menu-xs w-full gap-0.5 p-0">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(s.id)}
                    className="font-bold text-xs text-base-content/70 hover:text-primary py-2 px-3 rounded-lg"
                  >
                    {lang === 'ar' && s.labelAr ? s.labelAr : s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Content */}
        <div className="lg:col-span-9 space-y-6">
          <ApiKeyPanel />

          {/* Section: Authentication */}
          <SectionHeader
            id="auth"
            title={lang === 'ar' ? 'المصادقة وحدود الطلبات' : 'Authentication & Rate Limits'}
            subtitle="Secure x-api-key HTTP header authorization."
          />
          <div className="card bg-base-100 border border-base-200 shadow-sm p-5 space-y-3 text-xs leading-relaxed">
            <p className="text-base-content/70">
              All REST endpoints require an active API key transmitted as an HTTP header:
            </p>
            <CodeBlock>x-api-key: usr_9a823f...live_8834</CodeBlock>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-base-200/50 rounded-lg">
                <span className="font-bold text-base-content block">Production Base URL</span>
                <code className="text-primary font-mono text-[11px]">https://3pl-api.mawthook.io/api</code>
              </div>
              <div className="p-3 bg-base-200/50 rounded-lg">
                <span className="font-bold text-base-content block">Rate Limiting</span>
                <span className="text-base-content/70 text-[11px]">30 requests/minute per key (HTTP 429 upon excess)</span>
              </div>
            </div>
          </div>

          {/* Section: Shipments */}
          <SectionHeader id="shipments" title={lang === 'ar' ? 'إدارة الشحنات' : 'Shipment Operations'} />
          <EndpointCard
            method="POST"
            path="/v1/shipments"
            title="Create Carrier Shipment"
            description="Creates an authorized carrier shipment (DHL, LogesTechs, OTE). Automatically books airway bill, generates commercial invoices, and reserves carrier barcode."
            note="Verified for GCC & worldwide export routes. Returns live waybill tracking number."
            fields={[
              { field: 'sender', type: 'object', required: true, description: 'Origin contact, PACI, address' },
              { field: 'receiver', type: 'object', required: true, description: 'Destination address' },
              { field: 'parcels', type: 'object[]', required: true, description: 'weight(kg), length, width, height(cm)' },
              { field: 'items', type: 'object[]', required: true, description: 'Commercial customs line items with HS Codes' },
              { field: 'carrierCode', type: 'string', required: false, description: 'Carrier code (e.g. DHL, DGR, OTE)' },
              { field: 'serviceCode', type: 'string', required: false, description: 'Service tier returned from /v1/quotes' },
              { field: 'currency', type: 'string', required: false, description: 'Default: KWD' },
            ]}
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "2042595203",\n    "status": "booked",\n    "carrier": "DHL",\n    "serviceCode": "P",\n    "labelUrl": "https://api.target-kw.com/labels/2042595203.pdf"\n  }\n}`}
            errors={[
              { code: 400, msg: 'Missing required fields or invalid weight parameters' },
              { code: 403, msg: 'Carrier service not authorized for this account' },
            ]}
          />

          <EndpointCard
            method="PUT"
            path="/v1/shipments/:trackingNumber"
            title="Update Consignment"
            description="Modify shipment addresses or parcels before carrier physical collection."
            fields={[
              { field: 'receiver', type: 'object', required: false, description: 'Updated recipient address' },
              { field: 'parcels', type: 'object[]', required: false, description: 'Updated weights and dimensions' },
            ]}
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "TRK-KW-100234",\n    "status": "booked",\n    "updatedAt": "2026-04-10T12:00:00Z"\n  }\n}`}
            errors={[
              { code: 400, msg: 'Cannot edit shipment after driver pickup' },
              { code: 404, msg: 'Shipment not found' },
            ]}
          />

          {/* Section: Quotes */}
          <SectionHeader
            id="quotes"
            title={lang === 'ar' ? 'عروض الأسعار الحية' : 'Live Carrier Rate Quotes'}
            subtitle="Compute live airfreight tariffs across carriers."
          />
          <EndpointCard
            method="POST"
            path="/v1/quotes"
            title="Get Multi-Carrier Quote"
            description="Fetches live rate comparisons between DHL Express, LogesTechs GCC, and OTE Overland."
            fields={[
              { field: 'sender', type: 'object', required: true, description: 'Origin city and countryCode' },
              { field: 'receiver', type: 'object', required: true, description: 'Destination city and countryCode' },
              { field: 'parcels', type: 'object[]', required: true, description: 'Weight and dimensions' },
            ]}
            response={`{\n  "success": true,\n  "data": [\n    {\n      "carrier": "DHL",\n      "serviceName": "EXPRESS WORLDWIDE",\n      "serviceCode": "P",\n      "totalPrice": 18.500,\n      "currency": "KWD"\n    }\n  ]\n}`}
          />

          {/* Section: Tracking */}
          <SectionHeader id="tracking" title={lang === 'ar' ? 'تتبع الشحنات' : 'Consignment Tracking Telemetry'} />
          <EndpointCard
            method="GET"
            path="/v1/tracking/:trackingNumber"
            title="Authenticated Telemetry Feed"
            description="Complete consolidated timeline of airline flight radar, optical scans, customs holds, and driver signatures."
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "TRK-KW-TRANSIT-005",\n    "status": "in_transit",\n    "carrier": "DHL",\n    "events": [\n      { "status": "picked_up", "location": "Kuwait City", "timestamp": "2026-04-10T09:00:00Z" }\n    ]\n  }\n}`}
          />

          {/* Section: Public */}
          <SectionHeader id="public" title={lang === 'ar' ? 'واجهة التتبع العام' : 'Public Unauthenticated Endpoint'} />
          <EndpointCard
            method="GET"
            path="/public/shipments/:trackingNumber"
            title="Public Order Tracking"
            description="Safe for customer-facing tracking apps and portals without requiring API key authorization."
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "TRK-KW-TRANSIT-005",\n    "status": "in_transit",\n    "currentLocation": "Kuwait Airport Cargo Terminal"\n  }\n}`}
          />

          {/* Section: Status Reference */}
          <SectionHeader id="statuses" title={lang === 'ar' ? 'مرجع الحالات الموحد' : 'Unified Status Reference'} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card bg-base-100 border border-base-200 p-4 space-y-2">
              <span className="font-black text-xs text-base-content uppercase">Consignment Lifecycle</span>
              <div className="space-y-1.5 text-xs">
                {[
                  ['draft', 'Booked draft, awaiting label release'],
                  ['pending', 'Awaiting courier collection'],
                  ['picked_up', 'Collected from consignor hub'],
                  ['in_transit', 'Active linehaul / flight underway'],
                  ['out_for_delivery', 'Assigned to driver route'],
                  ['delivered', 'Signed Proof of Delivery confirmed'],
                  ['exception', 'Customs or address exception hold'],
                ].map(([st, desc]) => (
                  <div key={st} className="flex items-center gap-2">
                    <code className="badge badge-xs badge-neutral font-bold">{st}</code>
                    <span className="text-base-content/70 text-[11px]">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card bg-base-100 border border-base-200 p-4 space-y-2">
              <span className="font-black text-xs text-base-content uppercase">Driver Pickup Requests</span>
              <div className="space-y-1.5 text-xs">
                {[
                  ['REQUESTED', 'Customer submitted pickup order'],
                  ['APPROVED', 'Dispatcher assigned driver vehicle'],
                  ['COLLECTED', 'Driver loaded parcel into van'],
                  ['REJECTED', 'Address unserviceable or cancelled'],
                ].map(([st, desc]) => (
                  <div key={st} className="flex items-center gap-2">
                    <code className="badge badge-xs badge-primary font-bold">{st}</code>
                    <span className="text-base-content/70 text-[11px]">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiDocsPage;
