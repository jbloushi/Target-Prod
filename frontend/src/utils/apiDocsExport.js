import { jsPDF } from 'jspdf';

const API_BASE_URL = 'https://api.target-kw.com/api/v1';

export function downloadPostmanCollection() {
    const collection = {
        info: {
            name: 'Target Logistics API v1',
            description:
                'Official Target Logistics shipping, quotation, tracking, and address book integration collection. Configure {{apiKey}} from Portal -> Settings -> API & Webhooks.',
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        variable: [
            { key: 'baseUrl', value: API_BASE_URL },
            { key: 'apiKey', value: 'YOUR_TARGET_API_KEY' },
            { key: 'trackingNumber', value: 'TRK-EXAMPLE-001' }
        ],
        auth: {
            type: 'apikey',
            apikey: [
                { key: 'key', value: 'X-API-Key', type: 'string' },
                { key: 'value', value: '{{apiKey}}', type: 'string' },
                { key: 'in', value: 'header', type: 'string' }
            ]
        },
        item: [
            {
                name: 'Get Shipping Quote',
                request: {
                    method: 'POST',
                    header: [{ key: 'Content-Type', value: 'application/json' }],
                    url: { raw: '{{baseUrl}}/quotes', host: ['{{baseUrl}}'], path: ['quotes'] },
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify(
                            {
                                origin: { city: 'Kuwait City', countryCode: 'KW' },
                                destination: { city: 'Salmiya', countryCode: 'KW' },
                                parcels: [{ weight: 1.0, length: 20, width: 20, height: 10 }]
                            },
                            null,
                            2
                        )
                    }
                }
            },
            {
                name: 'Create & Book Shipment',
                request: {
                    method: 'POST',
                    header: [
                        { key: 'Content-Type', value: 'application/json' },
                        { key: 'Idempotency-Key', value: 'order-10001' }
                    ],
                    url: { raw: '{{baseUrl}}/shipments', host: ['{{baseUrl}}'], path: ['shipments'] },
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify(
                            {
                                isTest: true,
                                reference: 'ORDER-10001',
                                declaredValue: 10,
                                currency: 'KWD',
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
                                parcels: [
                                    {
                                        weight: 1.0,
                                        length: 20,
                                        width: 20,
                                        height: 10,
                                        description: 'Order #10001'
                                    }
                                ],
                                codAmount: 0,
                                codCurrency: 'KWD'
                            },
                            null,
                            2
                        )
                    }
                }
            },
            {
                name: 'Download Waybill / Label (PDF)',
                request: {
                    method: 'GET',
                    url: {
                        raw: '{{baseUrl}}/shipments/{{trackingNumber}}/label',
                        host: ['{{baseUrl}}'],
                        path: ['shipments', '{{trackingNumber}}', 'label']
                    }
                }
            },
            {
                name: 'Update Shipment',
                request: {
                    method: 'PUT',
                    header: [{ key: 'Content-Type', value: 'application/json' }],
                    url: {
                        raw: '{{baseUrl}}/shipments/{{trackingNumber}}',
                        host: ['{{baseUrl}}'],
                        path: ['shipments', '{{trackingNumber}}']
                    },
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify({ specialInstructions: 'Call customer 15 minutes before arrival' }, null, 2)
                    }
                }
            },
            {
                name: 'Track Shipment',
                request: {
                    method: 'GET',
                    url: {
                        raw: '{{baseUrl}}/tracking/{{trackingNumber}}',
                        host: ['{{baseUrl}}'],
                        path: ['tracking', '{{trackingNumber}}']
                    }
                }
            },
            {
                name: 'List Saved Addresses',
                request: {
                    method: 'GET',
                    url: { raw: '{{baseUrl}}/addresses', host: ['{{baseUrl}}'], path: ['addresses'] }
                }
            }
        ]
    };

    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Target_Logistics_API_v1.postman_collection.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function downloadApiDocsPdf() {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 44;
    const maxW = pageW - margin * 2;
    let y = 50;

    const ensureSpace = (needed = 40) => {
        if (y + needed > pageH - 50) {
            doc.addPage();
            y = 50;
        }
    };

    const addHeading = (text) => {
        ensureSpace(34);
        y += 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(text, margin, y);
        y += 6;
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y, pageW - margin, y);
        y += 14;
    };

    const addBody = (text, indent = 0) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(text, maxW - indent);
        for (const line of lines) {
            ensureSpace(15);
            doc.text(line, margin + indent, y);
            y += 13.5;
        }
        y += 4;
    };

    const addCode = (text) => {
        doc.setFont('courier', 'normal');
        doc.setFontSize(8.2);
        const lines = text.split('\n');
        const boxH = lines.length * 11 + 14;
        ensureSpace(boxH + 8);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y - 4, maxW, boxH, 4, 4, 'FD');
        doc.setTextColor(30, 41, 59);
        let cy = y + 9;
        for (const line of lines) {
            doc.text(line.slice(0, 96), margin + 10, cy);
            cy += 11;
        }
        y += boxH + 8;
    };

    // Cover Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 92, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('Target Logistics — Partner API Integration Guide', margin, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225);
    doc.text(`Base URL: ${API_BASE_URL}   |   Portal Docs: https://target-kw.com/api-docs`, margin, 64);
    y = 114;

    addHeading('1. Authentication & Required Headers');
    addBody('Generate your API key in the Target Portal under Settings -> API & Webhooks (/settings-v2?tab=api). Send it on every request using X-API-Key (or Authorization: ApiKey <key>).');
    addBody('IMPORTANT: POST /api/v1/shipments requires a unique Idempotency-Key header (e.g. order-10001) to prevent duplicate bookings on network retries.');
    addCode(
        'X-API-Key: trg_live_xxxxxxxxxxxxxxxx\nContent-Type: application/json\nIdempotency-Key: order-10001   # Required on POST /api/v1/shipments'
    );

    addHeading('2. Testing & Test Shipments');
    addBody('Target operates a single API endpoint (no separate sandbox server). During integration testing, submit test shipments with "isTest": true in the request body. Test shipments are NOT charged and do not initiate a live pickup.');

    addHeading('3. Credit Accounts, Routing & Shipment Lifecycle');
    addBody('- Pre-Configured Routing: Delivery routing is configured directly on your Target account. You do not need to select or pass a carrier in API requests.');
    addBody('- Simple Minimum Payload: Submit sender, receiver, declaredValue (> 0), and parcels[] with flat weight (kg), length, width, height (cm) — a standard default box (e.g. 20x20x10 cm, 1 kg) works cleanly for standard orders.');
    addBody('- Delivery Cycle: Create (POST /api/v1/shipments) -> Picked Up -> Target Hub Review & Verification -> Confirmed & Booked -> In Transit -> Out for Delivery -> Delivered.');
    addBody('- Rates & Billing: Target bills your credit account directly per shipment. Initial rates from POST /api/v1/quotes are estimates and may adjust once Target verifies actual parcel weight/dimensions at the hub. COD is optional via codAmount and codCurrency.');

    addHeading('4. Core Endpoints');
    addCode(
        'POST   /api/v1/quotes                     -> Calculate live Target delivery rates\n' +
        'POST   /api/v1/shipments                  -> Create & book a shipment (requires Idempotency-Key)\n' +
        'GET    /api/v1/shipments/:number/label    -> Download waybill PDF\n' +
        'PUT    /api/v1/shipments/:number          -> Update shipment details / instructions\n' +
        'GET    /api/v1/tracking/:number           -> Fetch live status & checkpoint history\n' +
        'GET    /api/v1/addresses                  -> List saved pickup/receiver addresses\n' +
        'POST   /api/v1/addresses                  -> Save a new address'
    );

    addHeading('5. Sample Create Shipment Request');
    addCode(
        'POST ' + API_BASE_URL + '/shipments\n' +
        '{\n' +
        '  "isTest": true,\n' +
        '  "reference": "ORDER-10001",\n' +
        '  "declaredValue": 10,\n' +
        '  "currency": "KWD",\n' +
        '  "sender": { "name": "My Store", "phone": "+96590000000", "addressLine1": "Shuwaikh", "city": "Kuwait City", "countryCode": "KW" },\n' +
        '  "receiver": { "name": "Customer", "phone": "+96599887766", "addressLine1": "Block 4, Salmiya", "city": "Salmiya", "countryCode": "KW" },\n' +
        '  "parcels": [{ "weight": 1.0, "length": 20, "width": 20, "height": 10, "description": "Order #10001" }],\n' +
        '  "codAmount": 0,\n' +
        '  "codCurrency": "KWD"\n' +
        '}'
    );

    addHeading('6. Webhooks & Status Updates');
    addBody('Configure your HTTPS webhook URL in Portal -> Settings -> API & Webhooks (/settings-v2?tab=api). Target pushes signed JSON events with automatic retries (up to 5 attempts with backoff):');
    addBody('- Events: shipment.created, shipment.booked, shipment.status_updated');
    addBody('- Signature Header: X-Webhook-Signature-256 (HMAC-SHA256 hex digest of raw JSON body using your webhook secret).');
    addBody('- Polling Fallback: You can also query GET /api/v1/tracking/:number at any time.');
    addCode(
        '// Node.js HMAC-SHA256 Verification\n' +
        'const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");\n' +
        'const valid = crypto.timingSafeEqual(Buffer.from(req.headers["x-webhook-signature-256"]), Buffer.from(expected));'
    );

    doc.save('Target_Logistics_API_Integration_Guide.pdf');
}
