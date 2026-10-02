const axios = require('axios');
const DgrAdapter = require('../src/adapters/DgrAdapter');
const { buildDgrShipmentPayload } = require('../src/services/dgr-payload-builder');
const { generateCarrierAwbPdf, generateCarrierInvoicePdf } = require('../src/utils/carrierPdfMock');

jest.mock('axios');

describe('DHL Express (DGR) Official Documents & Templates', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    const mockShipmentData = {
        trackingNumber: 'TGR-TEST-001',
        serviceCode: 'P',
        currency: 'KWD',
        price: 25.0,
        sender: {
            company: 'Target Logistics KW',
            contactPerson: 'Jassim Shipper',
            phone: '+96597691271',
            city: 'Kuwait City',
            countryCode: 'KW',
            streetLines: ['Arabian Gulf St, Tower 1']
        },
        receiver: {
            company: 'Dubai Client LLC',
            contactPerson: 'Reciver Consignee',
            phone: '+971501234567',
            city: 'Dubai',
            countryCode: 'AE',
            postalCode: '00000',
            streetLines: ['Sheikh Zayed Rd, Tower 42']
        },
        packages: [
            {
                weight: { value: 2.5, unit: 'kg' },
                dimensions: { length: 20, width: 15, height: 10, unit: 'cm' },
                description: 'Electronics'
            }
        ],
        items: [
            {
                description: 'Wireless Headphones',
                quantity: 1,
                value: 200,
                weight: 2.5,
                hsCode: '851830',
                countryOfOrigin: 'KW'
            }
        ]
    };

    describe('buildDgrShipmentPayload outputImageProperties', () => {
        it('requests official DHL label, waybillDoc, and commercial invoice templates for international shipments', () => {
            const payload = buildDgrShipmentPayload(mockShipmentData, { accountNumber: '418002621' });

            expect(payload.outputImageProperties).toBeDefined();
            expect(payload.outputImageProperties.printerDPI).toBe(300);
            expect(payload.outputImageProperties.encodingFormat).toBe('pdf');

            const options = payload.outputImageProperties.imageOptions;
            expect(options).toHaveLength(3);

            const labelOpt = options.find(o => o.typeCode === 'label');
            expect(labelOpt).toBeDefined();
            expect(labelOpt.templateName).toBe('ECOM26_84_001');
            expect(labelOpt.isRequested).toBe(true);

            const waybillOpt = options.find(o => o.typeCode === 'waybillDoc');
            expect(waybillOpt).toBeDefined();
            expect(waybillOpt.templateName).toBe('ARCH_8X4');
            expect(waybillOpt.isRequested).toBe(true);

            const invoiceOpt = options.find(o => o.typeCode === 'invoice');
            expect(invoiceOpt).toBeDefined();
            expect(invoiceOpt.templateName).toBe('COMMERCIAL_INVOICE_P_10');
            expect(invoiceOpt.isRequested).toBe(true);
        });

        it('omits invoice template when shipment is non-declarable or document-only', () => {
            const docShipment = {
                ...mockShipmentData,
                isDocument: true,
                shipmentType: 'documents'
            };

            const payload = buildDgrShipmentPayload(docShipment, { accountNumber: '418002621' });
            const options = payload.outputImageProperties.imageOptions;
            const invoiceOpt = options.find(o => o.typeCode === 'invoice');
            expect(invoiceOpt).toBeUndefined();
        });
    });

    describe('DgrAdapter document extraction & parsing', () => {
        it('extracts official label and invoice from both root documents and package-level documents', async () => {
            const adapter = new DgrAdapter({
                apiKey: 'test-api-key',
                apiSecret: 'test-secret',
                accountNumber: '418002621',
                baseUrl: 'https://express.api.dhl.com/mydhlapi'
            });

            const fakeLabelBase64 = Buffer.from('FAKE-DHL-LABEL-PDF').toString('base64');
            const fakeInvoiceBase64 = Buffer.from('FAKE-DHL-INVOICE-PDF').toString('base64');

            axios.post.mockResolvedValueOnce({
                status: 201,
                data: {
                    shipmentTrackingNumber: '1234567890',
                    packages: [
                        {
                            referenceNumber: 1,
                            trackingNumber: 'JD014600003096000001',
                            documents: [
                                {
                                    typeCode: 'label',
                                    imageFormat: 'PDF',
                                    content: fakeLabelBase64
                                }
                            ]
                        }
                    ],
                    documents: [
                        {
                            typeCode: 'invoice',
                            imageFormat: 'PDF',
                            content: fakeInvoiceBase64
                        }
                    ]
                }
            });

            const result = await adapter.createShipment(mockShipmentData, 'P');

            expect(result.trackingNumber).toBe('1234567890');
            expect(result.labelUrl).toContain(fakeLabelBase64);
            expect(result.awbUrl).toContain(fakeLabelBase64);
            expect(result.invoiceUrl).toContain(fakeInvoiceBase64);
            expect(result.documents).toHaveLength(2);
        });

        it('fetches existing official DHL documents via getShipmentDocuments (get-image)', async () => {
            const adapter = new DgrAdapter({
                apiKey: 'test-api-key',
                apiSecret: 'test-secret',
                accountNumber: '418002621',
                baseUrl: 'https://express.api.dhl.com/mydhlapi'
            });

            const fakeDocBase64 = Buffer.from('OFFICIAL-DHL-GET-IMAGE-PDF').toString('base64');

            axios.get.mockImplementation((url, config) => {
                const typeCode = config?.params?.typeCode;
                return Promise.resolve({
                    status: 200,
                    data: {
                        documents: [
                            {
                                typeCode,
                                imageFormat: 'PDF',
                                content: `${fakeDocBase64}-${typeCode}`
                            }
                        ]
                    }
                });
            });

            const docs = await adapter.getShipmentDocuments('1234567890', { accountNumber: '418002621' });

            expect(docs.labelUrl).toContain(fakeDocBase64);
            expect(docs.invoiceUrl).toContain(fakeDocBase64);
            expect(docs.documents.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Carrier fallback PDF generators', () => {
        it('generateCarrierAwbPdf produces a valid PDF data URL with header and formatting', () => {
            const pdfData = generateCarrierAwbPdf(mockShipmentData, 'DHL Express');
            expect(typeof pdfData).toBe('string');
            expect(pdfData.startsWith('data:application/pdf;base64,')).toBe(true);

            const decoded = Buffer.from(pdfData.split(',')[1], 'base64').toString('utf8');
            expect(decoded).toContain('%PDF-1.4');
            expect(decoded).toContain('DHL EXPRESS');
            expect(decoded).toContain('AIR WAYBILL');
            expect(decoded).toContain('Kuwait City');
        });

        it('generateCarrierInvoicePdf produces a valid commercial customs invoice PDF with itemized rows', () => {
            const pdfData = generateCarrierInvoicePdf(mockShipmentData, 'DHL Express');
            expect(typeof pdfData).toBe('string');
            expect(pdfData.startsWith('data:application/pdf;base64,')).toBe(true);

            const decoded = Buffer.from(pdfData.split(',')[1], 'base64').toString('utf8');
            expect(decoded).toContain('%PDF-1.4');
            expect(decoded).toContain('COMMERCIAL CUSTOMS INVOICE');
            expect(decoded).toContain('Wireless Headphones');
            expect(decoded).toContain('TOTAL DECLARED CUSTOMS VALUE');
        });
    });
});
