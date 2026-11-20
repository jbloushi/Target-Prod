import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { downloadApiDocsPdf, downloadPostmanCollection } from '../utils/apiDocsExport';

const API_BASE_URL = 'https://api.target-kw.com/api/v1';

const METHOD_STYLES = {
    GET: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    POST: 'bg-primary/10 text-primary border border-primary/30',
    PUT: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30',
    DELETE: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
};

const MethodBadge = ({ method }) => (
    <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[11px] uppercase shrink-0 ${METHOD_STYLES[method] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
        {method}
    </span>
);

const CodeBlock = ({ code, title }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard?.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    };

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100 overflow-hidden my-2">
            {title && (
                <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-900/80">
                    <span className="text-[11px] font-mono text-slate-400">{title}</span>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-xs" aria-hidden="true">
                            {copied ? 'check' : 'content_copy'}
                        </span>
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                </div>
            )}
            <pre className="p-3.5 font-mono text-xs overflow-x-auto leading-relaxed" dir="ltr">
                <code>{code}</code>
            </pre>
        </div>
    );
};

const FieldTable = ({ fields, isRTL }) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 my-2">
        <table className="w-full text-start border-collapse text-xs">
            <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 px-3 text-start font-semibold">{isRTL ? 'الحقل' : 'Field'}</th>
                    <th className="py-2 px-3 text-start font-semibold">{isRTL ? 'النوع' : 'Type'}</th>
                    <th className="py-2 px-3 text-start font-semibold">{isRTL ? 'مطلوب' : 'Required'}</th>
                    <th className="py-2 px-3 text-start font-semibold">{isRTL ? 'الوصف' : 'Description'}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fields.map((f) => (
                    <tr key={f.field} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono font-bold text-primary whitespace-nowrap" dir="ltr">{f.field}</td>
                        <td className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap" dir="ltr">{f.type}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                            {f.required ? (
                                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[10px] font-bold uppercase">
                                    required
                                </span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold">
                                    optional
                                </span>
                            )}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{f.description}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const EndpointCard = ({ method, path, title, description, headers, fields, requestSample, responseSample, note, defaultOpen = false, isRTL }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer text-start"
            >
                <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                    <MethodBadge method={method} />
                    <code className="font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 break-all" dir="ltr">
                        {path}
                    </code>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">{title}</span>
                    <span className="material-symbols-outlined text-base text-slate-400" aria-hidden="true">
                        {open ? 'expand_less' : 'expand_more'}
                    </span>
                </div>
            </button>

            {open && (
                <div className="px-4 sm:px-5 py-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">{description}</p>

                    {note && (
                        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
                            <span className="material-symbols-outlined text-base text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true">info</span>
                            <span>{note}</span>
                        </div>
                    )}

                    {headers && headers.length > 0 && (
                        <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {isRTL ? 'الترويسات المطلوبة' : 'Headers'}
                            </div>
                            <FieldTable fields={headers} isRTL={isRTL} />
                        </div>
                    )}

                    {fields && fields.length > 0 && (
                        <div className="space-y-1">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {isRTL ? 'حقول الطلب' : 'Request Body Fields'}
                            </div>
                            <FieldTable fields={fields} isRTL={isRTL} />
                        </div>
                    )}

                    {requestSample && <CodeBlock title="Request JSON" code={requestSample} />}
                    {responseSample && <CodeBlock title="Response JSON" code={responseSample} />}
                </div>
            )}
        </div>
    );
};

const ApiDocsPage = () => {
    const { lang } = useLanguage();
    const { user } = useAuth();
    const isRTL = lang === 'ar';

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
            {/* Hero Header + Public Downloads (No Login Required) */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="space-y-1.5">
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                            {isRTL ? 'وثائق واجهة برمجة التطبيقات — تارجت لوجستكس (API v1)' : 'Target Logistics Partner API Documentation (v1)'}
                        </h1>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
                            {isRTL
                                ? 'دليل التكامل الكامل لإنشاء وحجز الشحنات، استخراج بوالص الشحن، التسعير الفوري، التتبع، والويب هوك — متاح للتحميل والمشاركة بدون تسجيل دخول.'
                                : 'Complete integration reference for shipment booking, live quotes, waybill labels, tracking, and signed webhooks. Publicly accessible and downloadable with no login required.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={downloadApiDocsPdf}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-semibold cursor-pointer transition-colors"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">picture_as_pdf</span>
                            <span>{isRTL ? 'تحميل دليل PDF' : 'Download PDF Guide'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={downloadPostmanCollection}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
                        >
                            <span className="material-symbols-outlined text-base" aria-hidden="true">download</span>
                            <span>{isRTL ? 'مجموعة Postman' : 'Postman Collection'}</span>
                        </button>
                        <Link
                            to={user ? '/settings-v2?tab=api' : '/login'}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                        >
                            <span className="material-symbols-outlined text-base text-primary" aria-hidden="true">vpn_key</span>
                            <span>{user ? (isRTL ? 'إدارة مفاتيح API' : 'Manage API Keys') : (isRTL ? 'تسجيل الدخول للمفاتيح' : 'Sign In for API Keys')}</span>
                        </Link>
                    </div>
                </div>

                {/* Base URL & Key Facts Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-3.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Base URL</div>
                        <code className="text-xs font-mono font-bold text-primary break-all mt-0.5 block" dir="ltr">
                            {API_BASE_URL}
                        </code>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-3.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {isRTL ? 'الاختبار والفوترة' : 'Testing & Billing'}
                        </div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                            {isRTL ? 'نقبل الشحنات التجريبية (isTest: true) دون أي رسوم' : 'Test shipments accepted ("isTest": true) — not charged'}
                        </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 p-3.5">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {isRTL ? 'التوجيه والتحديثات' : 'Routing & Updates'}
                        </div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                            {isRTL ? 'التوجيه مضبوط تلقائياً على حسابك · ويب هوك + تتبع API' : 'Auto-routed by account · Webhooks + Tracking API'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 1: Authentication, Idempotency & Testing */}
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isRTL ? '1. المصادقة والترويسات والاختبار' : '1. Authentication, Required Headers & Testing'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-300">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'مفتاح API والترويسات' : 'API Key & Idempotency-Key'}
                        </div>
                        <p>
                            {isRTL
                                ? 'قم بإنشاء مفتاح API من بوابة تارجت عبر الإعدادات ← واجهة API والويب هوك (/settings-v2?tab=api).'
                                : 'Generate your API key in the Target Portal under Settings → API & Webhooks (/settings-v2?tab=api). Send it via X-API-Key or Authorization: ApiKey <key>.'}
                        </p>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {isRTL
                                ? 'مهم: ترويسة Idempotency-Key مطلوبة في POST /api/v1/shipments لمنع تكرار الشحنات عند إعادة المحاولة.'
                                : 'Required on POST /api/v1/shipments: include a unique Idempotency-Key header (e.g. order-10001) to prevent duplicate bookings on network retries.'}
                        </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'الشحنات التجريبية (لا توجد بيئة منفصلة)' : 'Test Shipments (Single Endpoint, Zero Charges)'}
                        </div>
                        <p>
                            {isRTL
                                ? 'لا توجد بيئة اختبار منفصلة. يمكنك إرسال شحنات تجريبية مباشرة على نفس الرابط مع تمرير "isTest": true في جسم الطلب — لا يتم احتساب أي رسوم ولا يتم إرسال مندوب للاستلام.'
                                : 'Target does not require a separate sandbox server. Submit test shipments directly to the standard endpoint with "isTest": true in the JSON body. Test shipments are not charged and do not trigger live courier pickups.'}
                        </p>
                    </div>
                </div>

                <CodeBlock
                    title="Required Request Headers"
                    code={`X-API-Key: trg_live_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
Idempotency-Key: order-10001`}
                />
            </section>

            {/* Section 2: Credit Account, Simple Booking Lifecycle, Dimensions & COD */}
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isRTL ? '2. الحسابات الآجلة (Credit)، دورة الشحنة، الأبعاد، والدفع عند الاستلام' : '2. Credit Accounts, Booking Lifecycle, Dimensions & COD'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-300">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'التوجيه التلقائي والحجز (Credit Accounts)' : 'Pre-Configured Routing & Credit Booking'}
                        </div>
                        <ul className="list-disc ps-4 space-y-1.5">
                            <li>
                                <strong className="text-slate-900 dark:text-slate-100">Account-Managed Routing:</strong>{' '}
                                Delivery routing is configured directly on your Target account — simply send the minimum shipment details (sender, receiver, parcel) with no carrier selection required.
                            </li>
                            <li>
                                <strong className="text-slate-900 dark:text-slate-100">Manual vs Automatic Booking:</strong>{' '}
                                Omit <code className="font-mono text-primary">autoBook</code> for manual approval, or pass <code className="font-mono text-primary">"autoBook": true</code> to book immediately within your credit limit.
                            </li>
                            <li>
                                <strong className="text-slate-900 dark:text-slate-100">Billing & Checkout Fees:</strong>{' '}
                                Target bills your credit account directly per booked shipment. In checkout, you may keep your own area fees or fetch live Target rates via <code className="font-mono">POST /api/v1/quotes</code>.
                            </li>
                        </ul>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                            {isRTL ? 'الأبعاد والوزن والدفع عند الاستلام (COD)' : 'Parcel Dimensions, Weight & Optional COD'}
                        </div>
                        <ul className="list-disc ps-4 space-y-1.5">
                            <li>
                                <strong className="text-slate-900 dark:text-slate-100">Simple Parcel Defaults:</strong>{' '}
                                Standard default box dimensions (e.g. <code className="font-mono tabular-nums">20 × 20 × 10 cm</code>, <code className="font-mono tabular-nums">1.0 kg</code>) work cleanly for standard deliveries — per-SKU dimensions are not required unless shipping bulky international parcels.
                            </li>
                            <li>
                                <strong className="text-slate-900 dark:text-slate-100">Cash on Delivery (COD):</strong>{' '}
                                Optional. Pass <code className="font-mono text-primary">codAmount</code> (&gt; 0) and <code className="font-mono text-primary">codCurrency</code> (e.g. <code className="font-mono">"KWD"</code>). Omit or pass <code className="font-mono">0</code> for online-paid orders.
                            </li>
                            <li>
                                <strong className="text-slate-900 dark:text-slate-100">Lifecycle:</strong>{' '}
                                Created / Booked → Ready for Pickup → Picked Up → In Transit → Out for Delivery → Delivered.
                            </li>
                        </ul>
                    </div>
                </div>
            </section>

            {/* Section 3: Endpoints Reference */}
            <section className="space-y-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 px-1">
                    {isRTL ? '3. مرجع نقاط الاتصال (API Endpoints)' : '3. API Endpoints Reference'}
                </h2>

                <EndpointCard
                    method="POST"
                    path="/api/v1/shipments"
                    title={isRTL ? 'إنشاء وحجز شحنة' : 'Create & Book Shipment'}
                    description="Creates and books a Target Logistics shipment with minimal required fields. Delivery routing is automatically applied from your account configuration."
                    note="Idempotency-Key header is required. Pass isTest: true for test shipments (never charged)."
                    defaultOpen={true}
                    isRTL={isRTL}
                    headers={[
                        { field: 'X-API-Key', type: 'string', required: true, description: 'Your account API key from Settings → API & Webhooks' },
                        { field: 'Idempotency-Key', type: 'string', required: true, description: 'Unique key per order (e.g. order-10001) to prevent duplicate bookings' }
                    ]}
                    fields={[
                        { field: 'autoBook', type: 'boolean', required: false, description: 'Credit accounts: set true to book immediately without manual approval' },
                        { field: 'isTest', type: 'boolean', required: false, description: 'Set true for integration test shipments (not charged, no live pickup)' },
                        { field: 'reference', type: 'string', required: false, description: 'Your store order number or internal reference' },
                        { field: 'sender', type: 'object', required: true, description: 'Pickup details: name, company, phone, email, addressLine1, city, countryCode (KW)' },
                        { field: 'receiver', type: 'object', required: true, description: 'Consignee details: name, phone, email, addressLine1, city, countryCode' },
                        { field: 'parcels', type: 'array', required: true, description: 'Array of { weight (kg), dimensions: { length, width, height } (cm), description }' },
                        { field: 'codAmount', type: 'number', required: false, description: 'Optional Cash on Delivery amount (> 0). Omit or 0 for prepaid orders' },
                        { field: 'codCurrency', type: 'string', required: false, description: 'COD currency code (e.g. KWD). Defaults to KWD' }
                    ]}
                    requestSample={JSON.stringify(
                        {
                            autoBook: true,
                            isTest: true,
                            reference: 'ORDER-10001',
                            sender: {
                                name: 'My Store',
                                company: 'My Store W.L.L.',
                                phone: '+96590000000',
                                email: 'ops@mystore.com',
                                addressLine1: 'Block 1, Street 10, Shuwaikh',
                                city: 'Kuwait City',
                                countryCode: 'KW'
                            },
                            receiver: {
                                name: 'Customer Name',
                                phone: '+96599887766',
                                email: 'customer@example.com',
                                addressLine1: 'Block 4, Street 2, Salmiya',
                                city: 'Salmiya',
                                countryCode: 'KW'
                            },
                            parcels: [{ weight: 1.0, dimensions: { length: 20, width: 20, height: 10 }, description: 'Order #10001' }],
                            codAmount: 0,
                            codCurrency: 'KWD'
                        },
                        null,
                        2
                    )}
                    responseSample={JSON.stringify(
                        {
                            success: true,
                            data: {
                                trackingNumber: 'TKW-20261119-0042',
                                status: 'ready_for_pickup',
                                labelUrl: '/api/v1/shipments/TKW-20261119-0042/label',
                                price: 1.5,
                                currency: 'KWD',
                                codAmount: null,
                                codCurrency: null,
                                codStatus: null
                            }
                        },
                        null,
                        2
                    )}
                />

                <EndpointCard
                    method="POST"
                    path="/api/v1/quotes"
                    title={isRTL ? 'حساب أسعار الشحن' : 'Get Live Delivery Quote'}
                    description="Returns your account's live Target delivery rate in KWD for a given origin, destination, and parcel list."
                    isRTL={isRTL}
                    fields={[
                        { field: 'origin', type: 'object', required: true, description: '{ city, countryCode }' },
                        { field: 'destination', type: 'object', required: true, description: '{ city, countryCode }' },
                        { field: 'parcels', type: 'array', required: true, description: 'Array of { weight, dimensions: { length, width, height } }' }
                    ]}
                    responseSample={JSON.stringify(
                        {
                            success: true,
                            data: [
                                {
                                    serviceName: 'Target Delivery',
                                    totalPrice: 1.5,
                                    currency: 'KWD'
                                }
                            ]
                        },
                        null,
                        2
                    )}
                />

                <EndpointCard
                    method="GET"
                    path="/api/v1/shipments/:number/label"
                    title={isRTL ? 'تحميل بوليصة الشحن PDF' : 'Download Waybill Label (PDF)'}
                    description="Streams or returns the official Target Logistics waybill PDF for printing."
                    isRTL={isRTL}
                />

                <EndpointCard
                    method="PUT"
                    path="/api/v1/shipments/:number"
                    title={isRTL ? 'تحديث بيانات الشحنة' : 'Update Shipment'}
                    description="Updates receiver contact details, special instructions, or shipment metadata before courier pickup."
                    isRTL={isRTL}
                />

                <EndpointCard
                    method="GET"
                    path="/api/v1/tracking/:number"
                    title={isRTL ? 'تتبع حالة الشحنة' : 'Track Shipment & Checkpoint History'}
                    description="Returns current normalized shipment status and chronological tracking history. Can be used on-demand or as a polling fallback alongside webhooks."
                    isRTL={isRTL}
                    responseSample={JSON.stringify(
                        {
                            success: true,
                            data: {
                                trackingNumber: 'TKW-20261119-0042',
                                status: 'out_for_delivery',
                                history: [
                                    {
                                        status: 'out_for_delivery',
                                        timestamp: '2026-11-19T09:15:00.000Z',
                                        location: 'Kuwait City',
                                        description: 'Out for delivery with Target courier'
                                    }
                                ]
                            }
                        },
                        null,
                        2
                    )}
                />

                <EndpointCard
                    method="GET"
                    path="/api/v1/addresses"
                    title={isRTL ? 'سجل العناوين المحفوظة' : 'Saved Addresses (GET / POST / PUT)'}
                    description="Manage reusable pickup and receiver addresses via GET /api/v1/addresses, POST /api/v1/addresses, and PUT /api/v1/addresses/:id."
                    isRTL={isRTL}
                />
            </section>

            {/* Section 4: Webhooks & Real-Time Status Updates */}
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {isRTL ? '4. الويب هوك وتحديثات الحالة الفورية (Webhooks)' : '4. Webhooks & Real-Time Status Updates'}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                        HMAC-SHA256 Signed · 5 Retries
                    </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                    {isRTL
                        ? 'يدعم تارجت إرسال إشعارات فورية عبر HTTP Webhook عند إنشاء الشحنة أو حجزها أو تغير حالتها. قم بإضافة رابط HTTPS الخاص بك وتجربته من الإعدادات ← واجهة API والويب هوك.'
                        : 'Target pushes real-time JSON events to your HTTPS endpoint whenever a shipment is created, booked, or changes status. Configure your URL, choose events, and send a test ping in Settings → API & Webhooks (/settings-v2?tab=api).'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {[
                        ['shipment.created', 'Fired when a new shipment is created via API or portal'],
                        ['shipment.booked', 'Fired when a shipment is booked and waybill is ready'],
                        ['shipment.status_updated', 'Fired whenever pickup, transit, or delivery status updates']
                    ].map(([evt, desc]) => (
                        <div key={evt} className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5">
                            <code className="font-mono font-bold text-primary text-xs" dir="ltr">{evt}</code>
                            <p className="text-slate-600 dark:text-slate-400 mt-1">{desc}</p>
                        </div>
                    ))}
                </div>

                <CodeBlock
                    title="Sample Webhook Payload (POST to your HTTPS endpoint)"
                    code={JSON.stringify(
                        {
                            event: 'shipment.status_updated',
                            trackingNumber: 'TKW-20261119-0042',
                            status: 'delivered',
                            previousStatus: 'out_for_delivery',
                            updatedAt: '2026-11-19T12:30:00.000Z'
                        },
                        null,
                        2
                    )}
                />

                <CodeBlock
                    title="Verify X-Webhook-Signature-256 (Node.js)"
                    code={`const crypto = require('crypto');

function verifyTargetWebhook(rawBody, signatureHeader, webhookSecret) {
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(String(signatureHeader || '')),
    Buffer.from(expected)
  );
}`}
                />
            </section>

            {/* Section 5: Shipment Statuses */}
            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-3">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {isRTL ? '5. دورة حياة وحالات الشحنة القياسية' : '5. Standard Shipment Lifecycle & Statuses'}
                </h2>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-start border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                                <th className="py-2 px-3 text-start font-semibold">status</th>
                                <th className="py-2 px-3 text-start font-semibold">{isRTL ? 'المعنى' : 'Meaning'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {[
                                ['pending_approval', 'Created and awaiting approval (when autoBook is not true)'],
                                ['ready_for_pickup', 'Booked and scheduled for courier pickup'],
                                ['booked', 'Booked and waybill PDF generated'],
                                ['picked_up', 'Collected from sender location'],
                                ['in_transit', 'In transit at sorting hub or delivery corridor'],
                                ['out_for_delivery', 'With courier for final delivery'],
                                ['delivered', 'Delivered to consignee (ePOD completed)'],
                                ['exception', 'Delivery attempt failed or address issue'],
                                ['cancelled', 'Cancelled prior to pickup (no charge)']
                            ].map(([st, desc]) => (
                                <tr key={st} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                                    <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap" dir="ltr">{st}</td>
                                    <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{desc}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};

export default ApiDocsPage;
