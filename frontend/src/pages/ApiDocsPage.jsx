import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
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

const ApiKeyPanel = () => {
  const { lang } = useLanguage();
  return (
    <div className="card bg-primary/10 border border-primary/20 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">vpn_key</span>
          <span className="font-bold text-sm text-base-content">
            {lang === 'ar' ? 'مفتاح واجهة برمجة التطبيقات الخاص بك' : 'Your Client API Key'}
          </span>
        </div>
        <p className="text-xs text-base-content/70">
          {lang === 'ar'
            ? 'احصل على مفتاح API الخاص بحسابك أو قم بإعادة إنشائه من إعدادات الحساب.'
            : 'Access or regenerate your account API key from your profile settings.'}
        </p>
      </div>
      <Link
        to="/settings"
        className="btn btn-primary btn-sm font-bold text-xs gap-1.5 self-start sm:self-auto shrink-0"
      >
        <span className="material-symbols-outlined text-sm">settings</span>
        <span>{lang === 'ar' ? 'إدارة مفاتيح API' : 'Manage API Keys'}</span>
      </Link>
    </div>
  );
};

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

const SECTIONS = [
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
        title={lang === 'ar' ? 'توثيق واجهة برمجة التطبيقات' : 'API Documentation'}
        description="Developer reference for rates, shipment creation, tracking, pickups, and integrations."
        secondaryAction={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api-docs.html"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline border-base-300 btn-sm font-bold text-xs gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              <span>Interactive Guide</span>
            </a>
            <a
              href="/postman_collection.json"
              download="target-logistics-api.postman_collection.json"
              className="btn btn-outline border-base-300 btn-sm font-bold text-xs gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>Postman Collection</span>
            </a>
          </div>
        }
        action={
          <a
            href="/Target_Logistics_Client_API_Documentation.pdf"
            download="Target_Logistics_Client_API_Documentation.pdf"
            className="btn btn-primary btn-sm font-bold text-xs gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
            <span>Download PDF Guide</span>
          </a>
        }
      />

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
                <code className="text-primary font-mono text-[11px]">https://api.target-kw.com/api</code>
              </div>
              <div className="p-3 bg-base-200/50 rounded-lg">
                <span className="font-bold text-base-content block">Rate Limiting</span>
                <span className="text-base-content/70 text-[11px]">60 requests/minute per key (HTTP 429 upon excess)</span>
              </div>
            </div>
          </div>

          {/* Section: Shipments */}
          <SectionHeader id="shipments" title={lang === 'ar' ? 'إدارة الشحنات' : 'Shipment Operations'} />
          <EndpointCard
            method="POST"
            path="/v1/shipments"
            title="Create Consignment (Carrier, Domestic, or Manual)"
            description="Creates an authorized consignment. Supports carrier-backed routes (DGR, SMSA, ARAMEX, OTE, FEDEX), Target Express domestic delivery (INTERNAL/DOM), and Manual consignments (MAN-*)."
            note="Required header: Idempotency-Key: <UUIDv4>. Verified for GCC & worldwide export routes."
            fields={[
              { field: 'Idempotency-Key', type: 'header', required: true, description: 'Unique UUIDv4 per order to prevent duplicate bookings' },
              { field: 'sender', type: 'object', required: true, description: 'Origin contact, PACI, address (alias: origin)' },
              { field: 'receiver', type: 'object', required: true, description: 'Destination address (alias: destination)' },
              { field: 'parcels', type: 'object[]', required: true, description: 'weight(kg), length, width, height(cm)' },
              { field: 'items', type: 'object[]', required: true, description: 'Commercial customs line items with HS Codes' },
              { field: 'carrierCode', type: 'string', required: false, description: 'Carrier code (e.g. DGR, SMSA, OTE, INTERNAL)' },
              { field: 'serviceCode', type: 'string', required: false, description: 'Service tier returned from /v1/quotes (e.g. P, DOM)' },
              { field: 'currency', type: 'string', required: false, description: 'Default: KWD' },
              { field: 'autoBook', type: 'boolean', required: false, description: 'Credit accounts: immediately books live 3PL AWB' },
            ]}
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "2042595203",\n    "status": "booked",\n    "carrier": "DGR",\n    "serviceCode": "P",\n    "labelUrl": "/api/v1/shipments/2042595203/label"\n  }\n}`}
            errors={[
              { code: 400, msg: 'Missing required fields or invalid weight parameters / missing Idempotency-Key' },
              { code: 403, msg: 'Carrier service not authorized for this account' },
              { code: 409, msg: 'Another request with this Idempotency-Key is currently in flight' },
            ]}
          />

          <EndpointCard
            method="GET"
            path="/v1/shipments/:trackingNumber/label"
            title="Download Printable Waybill / Label PDF"
            description="Streams printable official carrier Air Waybill PDF or branded Target Express vector label directly to client."
            note="Authenticate via x-api-key header or ?api_key= query parameter for direct download links."
            response="Binary application/pdf stream (label-2042595203.pdf)"
            errors={[
              { code: 401, msg: 'Missing or invalid API key' },
              { code: 404, msg: 'Shipment not found' },
            ]}
          />

          <EndpointCard
            method="PUT"
            path="/v1/shipments/:trackingNumber"
            title="Update Consignment"
            description="Modify shipment addresses, parcels, remarks, or references before carrier physical collection."
            fields={[
              { field: 'origin', type: 'object', required: false, description: 'Updated shipper address (or sender)' },
              { field: 'destination', type: 'object', required: false, description: 'Updated recipient address (or receiver)' },
              { field: 'parcels', type: 'object[]', required: false, description: 'Updated weights and dimensions' },
              { field: 'remarks', type: 'string', required: false, description: 'Handling instructions' },
              { field: 'reference', type: 'string', required: false, description: 'Internal order reference' },
            ]}
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "2042595203",\n    "status": "booked",\n    "price": 18.576,\n    "updatedAt": "2026-04-10T12:00:00Z"\n  }\n}`}
            errors={[
              { code: 400, msg: 'Cannot edit shipment in current status' },
              { code: 404, msg: 'Shipment not found' },
            ]}
          />

          {/* Section: Quotes */}
          <SectionHeader
            id="quotes"
            title={lang === 'ar' ? 'عروض الأسعار الحية' : 'Live Carrier Rate Quotes'}
            subtitle="Compute live airfreight tariffs across carriers and domestic routes."
          />
          <EndpointCard
            method="POST"
            path="/v1/quotes"
            title="Get Multi-Carrier / Domestic Quote"
            description="Fetches live rate quotations filtered to your account shipping access mode (DGR, SMSA, ARAMEX, OTE, Target Express DOM, or Manual placeholder)."
            fields={[
              { field: 'sender', type: 'object', required: true, description: 'Origin city and countryCode' },
              { field: 'receiver', type: 'object', required: true, description: 'Destination city and countryCode' },
              { field: 'parcels', type: 'object[]', required: true, description: 'Weight and dimensions' },
              { field: 'items', type: 'object[]', required: false, description: 'Customs items with HS codes and values' },
            ]}
            response={`{\n  "success": true,\n  "data": [\n    {\n      "carrier": "DGR",\n      "serviceName": "EXPRESS WORLDWIDE",\n      "serviceCode": "P",\n      "totalPrice": 18.576,\n      "currency": "KWD"\n    }\n  ]\n}`}
          />

          {/* Section: Address Book */}
          <SectionHeader
            id="addresses"
            title={lang === 'ar' ? 'دفتر العناوين' : 'Saved Address Book'}
            subtitle="Manage reusable warehouse and origin addresses."
          />
          <EndpointCard
            method="GET"
            path="/v1/addresses"
            title="List Saved Addresses"
            description="Retrieves all saved warehouse and shipper profiles. Also serves as the recommended lightweight connectivity test."
            response={`{\n  "success": true,\n  "data": [\n    {\n      "id": "addr_91f03b",\n      "label": "Main Warehouse",\n      "company": "My Warehouse Co.",\n      "contactPerson": "Ahmed Al-Rashid",\n      "phone": "96512345678",\n      "city": "Kuwait City",\n      "countryCode": "KW"\n    }\n  ]\n}`}
          />
          <EndpointCard
            method="POST"
            path="/v1/addresses"
            title="Save New Address Profile"
            description="Adds a new address profile with a friendly label for rapid consignment generation."
            fields={[
              { field: 'label', type: 'string', required: true, description: 'Friendly profile name (e.g. Main Warehouse)' },
              { field: 'company', type: 'string', required: true, description: 'Company or branch name' },
              { field: 'contactPerson', type: 'string', required: true, description: 'Contact person' },
              { field: 'phone', type: 'string', required: true, description: 'Contact phone number' },
              { field: 'streetLines', type: 'string[]', required: true, description: 'Street address lines' },
              { field: 'city', type: 'string', required: true, description: 'City name' },
              { field: 'countryCode', type: 'string', required: true, description: 'ISO-2 country code (e.g. KW)' },
            ]}
            response={`{\n  "success": true,\n  "data": {\n    "id": "addr_91f03b",\n    "label": "Main Warehouse",\n    "city": "Kuwait City",\n    "countryCode": "KW"\n  }\n}`}
          />

          {/* Section: Pickups */}
          <SectionHeader
            id="pickups"
            title={lang === 'ar' ? 'طلبات الاستلام' : 'Courier Pickup Scheduling'}
            subtitle="Schedule driver dispatch to collect prepared consignments."
          />
          <EndpointCard
            method="POST"
            path="/client/pickups"
            title="Schedule Courier Pickup"
            description="Schedules a driver collection from your warehouse or store location."
            fields={[
              { field: 'sender', type: 'object', required: true, description: 'Pickup location and contact' },
              { field: 'receiver', type: 'object', required: true, description: 'Consignee destination details' },
              { field: 'parcels', type: 'object[]', required: true, description: 'Box counts, weights and dimensions' },
              { field: 'requestedPickupDate', type: 'string', required: true, description: 'ISO-8601 pickup timestamp' },
              { field: 'pickupInstructions', type: 'string', required: false, description: 'Driver gate or loading bay notes' },
            ]}
            response={`{\n  "success": true,\n  "data": {\n    "id": "pickup_9a23f10b",\n    "status": "REQUESTED",\n    "createdAt": "2026-04-14T09:15:00Z"\n  }\n}`}
          />
          <EndpointCard
            method="GET"
            path="/client/pickups/:id"
            title="Check Pickup Status"
            description="Checks courier pickup approval, driver assignment, and linked waybill numbers."
            response={`{\n  "success": true,\n  "data": {\n    "id": "pickup_9a23f10b",\n    "status": "APPROVED",\n    "shipment": {\n      "trackingNumber": "2042595203",\n      "status": "ready_for_pickup"\n    }\n  }\n}`}
          />

          {/* Section: Tracking */}
          <SectionHeader id="tracking" title={lang === 'ar' ? 'تتبع الشحنات' : 'Consignment Tracking Telemetry'} />
          <EndpointCard
            method="GET"
            path="/v1/tracking/:trackingNumber"
            title="Authenticated Telemetry Feed"
            description="Complete consolidated timeline of airline flight radar, optical scans, customs holds, and driver signatures."
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "2042595203",\n    "status": "in_transit",\n    "carrier": "DGR",\n    "serviceCode": "P",\n    "estimatedDelivery": "2026-04-17T00:00:00Z",\n    "history": []\n  }\n}`}
          />
          <EndpointCard
            method="GET"
            path="/client/shipments/:trackingNumber/tracking"
            title="Unified Multi-Carrier Scan History"
            description="Merges internal hub checkpoints with live 3PL carrier scans, deduplicates overlaps, and returns sorted newest-first."
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "2042595203",\n    "status": "in_transit",\n    "events": [\n      { "source": "carrier", "status": "in_transit", "description": "Processed at Kuwait City Hub", "timestamp": "2026-04-14T11:20:00Z" }\n    ]\n  }\n}`}
          />

          {/* Section: Public */}
          <SectionHeader id="public" title={lang === 'ar' ? 'واجهة التتبع العام' : 'Public Unauthenticated Endpoint'} />
          <EndpointCard
            method="GET"
            path="/public/shipments/:trackingNumber"
            title="Public Storefront Tracking Feed"
            description="Safe for customer-facing tracking apps and portals without requiring API key authorization."
            response={`{\n  "success": true,\n  "data": {\n    "trackingNumber": "2042595203",\n    "status": "in_transit",\n    "carrierCode": "DGR",\n    "destination": { "city": "Dubai", "countryCode": "AE" },\n    "events": []\n  }\n}`}
          />

          {/* Section: Status Reference */}
          <SectionHeader id="statuses" title={lang === 'ar' ? 'مرجع الحالات الموحد' : 'Unified Status Reference'} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card bg-base-100 border border-base-200 p-4 space-y-2">
              <span className="font-black text-xs text-base-content uppercase">Consignment Lifecycle (15 Statuses)</span>
              <div className="space-y-1.5 text-xs">
                {[
                  ['draft', 'Manual or saved consignment awaiting confirmation'],
                  ['pending', 'Awaiting operations review or pickup scheduling'],
                  ['pending_approval', 'Held for credit or dispatch approval'],
                  ['booked', 'Confirmed with carrier; AWB & waybill label assigned'],
                  ['ready_for_pickup', 'Scheduled for courier collection from origin'],
                  ['picked_up', 'Collected from sender by courier driver'],
                  ['received_at_hub', 'Checked in at Target or carrier sorting facility'],
                  ['verified', 'Weight, dimensions, and customs verified at hub'],
                  ['in_transit', 'Active linehaul, air freight, or customs clearance'],
                  ['out_for_delivery', 'On final-mile delivery courier vehicle'],
                  ['delivered', 'Successfully delivered to consignee (POD)'],
                  ['rto_in_transit', 'Return-to-origin transit in progress'],
                  ['returned', 'Returned and handed back to original shipper'],
                  ['exception', 'Customs hold, bad address, or failed attempt'],
                  ['cancelled', 'Voided consignment; no further status progression'],
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
