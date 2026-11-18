const axios = require('axios');
const AramexAdapter = require('../src/adapters/AramexAdapter');

describe('AramexAdapter ShippingAPI.V2', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const creds = {
        username: 'api@target-kw.com',
        password: 'secret',
        accountNumber: '123456',
        accountPin: '654321',
        accountEntity: 'KWI',
        accountCountryCode: 'KW'
    };

    test('switches between UAT and Live base URLs', () => {
        const uat = new AramexAdapter({ ...creds, isTest: true });
        const live = new AramexAdapter({ ...creds, isTest: false });
        expect(uat.baseUrl).toBe('https://ws.uat.aramex.net/ShippingAPI.V2');
        expect(live.baseUrl).toBe('https://ws.aramex.net/ShippingAPI.V2');
        expect(uat.hasOfficialCredentials()).toBe(true);
    });

    test('requires accountPin for hasOfficialCredentials()', () => {
        const noPin = new AramexAdapter({ ...creds, accountPin: '' });
        expect(noPin.hasOfficialCredentials()).toBe(false);
    });

    test('calls RateCalculator CalculateRate when credentials are present', async () => {
        const postSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 200,
            data: { HasErrors: false, TotalAmount: { Value: 12.75, CurrencyCode: 'KWD' } }
        });

        const adapter = new AramexAdapter({ ...creds, isTest: true });
        const rates = await adapter.getRates({
            sender: { city: 'Kuwait City', countryCode: 'KW' },
            receiver: { city: 'Dubai', countryCode: 'AE' },
            packages: [{ weight: 2 }],
            currency: 'KWD'
        });

        expect(postSpy).toHaveBeenCalledWith(
            'https://ws.uat.aramex.net/ShippingAPI.V2/RateCalculator/Service_1_0.svc/json/CalculateRate',
            expect.objectContaining({
                ClientInfo: expect.objectContaining({ AccountPin: '654321', AccountNumber: '123456' })
            }),
            expect.any(Object)
        );
        expect(rates[0]).toEqual(expect.objectContaining({
            carrierCode: 'ARAMEX',
            serviceCode: 'PPX',
            totalPrice: 12.75,
            currency: 'KWD'
        }));
    });

    test('calls Shipping CreateShipments and extracts AWB and PDF label', async () => {
        const postSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 200,
            data: {
                HasErrors: false,
                Shipments: [{
                    ID: '38290311684',
                    HasErrors: false,
                    ShipmentLabel: { LabelFileContents: 'JVBERi0xLjQK' }
                }]
            }
        });

        const adapter = new AramexAdapter({ ...creds, isTest: true });
        const result = await adapter.createShipment({
            trackingNumber: 'ARM-TEST-1',
            sender: { name: 'Sender', phone: '+96512345678', city: 'Kuwait City', countryCode: 'KW', streetLines: ['Shuwaikh'] },
            receiver: { name: 'Receiver', phone: '+971501234567', city: 'Dubai', countryCode: 'AE', streetLines: ['Business Bay'] },
            parcels: [{ weight: 1.5, description: 'Electronics', declaredValue: 40 }],
            currency: 'KWD'
        });

        expect(postSpy).toHaveBeenCalledWith(
            'https://ws.uat.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/CreateShipments',
            expect.objectContaining({
                LabelInfo: { ReportID: 9201, ReportType: 'RPT' }
            }),
            expect.any(Object)
        );
        expect(result.trackingNumber).toBe('38290311684');
        expect(result.labelUrl).toBe('data:application/pdf;base64,JVBERi0xLjQK');
    });

    test('calls PrintLabel in getShipmentDocuments', async () => {
        const postSpy = jest.spyOn(axios, 'post').mockResolvedValueOnce({
            status: 200,
            data: {
                HasErrors: false,
                ShipmentLabel: { LabelFileContents: 'JVBERi0xLjQK' }
            }
        });

        const adapter = new AramexAdapter({ ...creds, isTest: false });
        const docs = await adapter.getShipmentDocuments('38290311684');

        expect(postSpy).toHaveBeenCalledWith(
            'https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/PrintLabel',
            expect.objectContaining({ ShipmentNumber: '38290311684' }),
            expect.any(Object)
        );
        expect(docs.awbUrl).toBe('data:application/pdf;base64,JVBERi0xLjQK');
    });
});
