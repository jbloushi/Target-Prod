const { createMockRes } = require('../testUtils');

describe('shipment flow currency + insurance + signature', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('keeps requested USD currency in quote response and filters fuel option', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', organization: {} }) }
    };

    const quoteData = [{
      serviceName: 'DHL Express',
      serviceCode: 'P',
      totalPrice: 10,
      currency: 'KWD',
      optionalServices: [
        { serviceCode: 'II', serviceName: 'Insurance', totalPrice: 1, currency: 'KWD' },
        { serviceCode: 'FUEL', serviceName: 'Fuel Surcharge', totalPrice: 0.5, currency: 'KWD' }
      ]
    }];

    jest.doMock('../src/config/database', () => ({ prisma }));
    jest.doMock('../src/services/CarrierFactory', () => ({
      getAvailableCarriers: () => [{ code: 'DGR' }],
      getAdapter: () => ({ getRates: jest.fn().mockResolvedValue(quoteData) })
    }));
    jest.doMock('../src/services/pricing.service', () => ({
      calculateFinalPrice: () => ({ finalPrice: 10, markupAmount: 0 })
    }));

    const controller = require('../src/controllers/shipment-booking.controller');
    const req = {
      user: { id: 'u1', role: 'client' },
      body: { currency: 'USD', sender: {}, receiver: {}, parcels: [], items: [] }
    };
    const res = createMockRes();

    await controller.getQuotes(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data[0].currency).toBe('USD');
    expect(payload.data[0].optionalServices.find((s) => /fuel/i.test(s.serviceName))).toBeUndefined();
  });

  it('validates insurance values (equal/less pass, greater fails)', () => {
    const service = require('../src/services/ShipmentDraftService');

    expect(() => service.validateInsuranceInput({
      insurance: { amount: 100, currency: 'USD' },
      invoiceValue: 100,
      currency: 'USD'
    })).not.toThrow();

    expect(() => service.validateInsuranceInput({
      insurance: { amount: 60, currency: 'USD' },
      invoiceValue: 100,
      currency: 'USD'
    })).not.toThrow();

    expect(() => service.validateInsuranceInput({
      insurance: { amount: 120, currency: 'USD' },
      invoiceValue: 100,
      currency: 'USD'
    })).toThrow('Validation Failed: Insurance amount must be equal to or less than invoice value.');
  });

  it('adds signature optional service cost and insurance optional code in secure pricing', async () => {
    jest.doMock('../src/services/CarrierFactory', () => ({
      getAdapter: () => ({
        getRates: jest.fn().mockResolvedValue([
          {
            serviceCode: 'P',
            totalPrice: 12,
            currency: 'USD',
            optionalServices: [
              { serviceCode: 'II', serviceName: 'Shipment Insurance', totalPrice: 1.5, currency: 'USD' }
            ]
          }
        ])
      })
    }));
    jest.doMock('../src/services/pricing.service', () => ({
      resolveMarkup: () => ({ markup: {}, source: 'test' }),
      createSnapshot: () => ({ totalPrice: 12, currency: 'USD', carrierRate: 12, markup: 0 }),
      normalizeAmount: (n) => ({ toFixed: () => Number(n).toFixed(3) })
    }));

    const service = require('../src/services/ShipmentDraftService');
    const snapshot = await service.getSecurePricing({
      serviceCode: 'P',
      carrierCode: 'DGR',
      optionalServiceCodes: [],
      insuredValue: 100,
      signatureRequired: true
    }, { organization: {} });

    expect(snapshot.optionalServices.find((s) => s.serviceCode === 'II')).toBeTruthy();
    expect(snapshot.optionalServices.find((s) => s.serviceCode === 'SIGNATURE_REQUIRED')).toBeFalsy();
    expect(snapshot.localSurcharges.find((s) => s.code === 'LOCAL_SIGNATURE_REQUIRED')).toBeTruthy();
    expect(snapshot.totalPrice).toBe(16);
  });

  it('rejects invalid optional-service combinations from rating dependency rules', () => {
    const service = require('../src/services/ShipmentDraftService');
    const available = [
      {
        serviceCode: 'AA',
        requiredServiceCodes: ['BB']
      },
      {
        serviceCode: 'BB',
        mutuallyExclusiveWith: ['CC']
      },
      {
        serviceCode: 'CC'
      }
    ];

    expect(() => service.assertOptionalServicesAreDhlValid(available, ['AA']))
      .toThrow('Validation Failed: Optional service AA requires BB.');
    expect(() => service.assertOptionalServicesAreDhlValid(available, ['BB', 'CC']))
      .toThrow('Validation Failed: Optional service BB cannot be combined with CC.');
  });

  it('never sends fuel (FF) as requested DHL VAS in shipment payload', () => {
    const { buildDgrShipmentPayload } = require('../src/services/dgr-payload-builder');
    const payload = buildDgrShipmentPayload({
      sender: {
        company: 'Sender Co',
        contactPerson: 'Sender',
        phone: '+96511111111',
        email: 'sender@example.com',
        streetLines: ['Street 1'],
        city: 'Kuwait',
        postalCode: '12345',
        countryCode: 'KW'
      },
      receiver: {
        company: 'Receiver Co',
        contactPerson: 'Receiver',
        phone: '+971500000000',
        email: 'receiver@example.com',
        streetLines: ['Street 2'],
        city: 'Dubai',
        postalCode: '54321',
        countryCode: 'AE'
      },
      serviceCode: 'P',
      shipmentType: 'package',
      currency: 'USD',
      items: [{ description: 'Item', quantity: 1, value: 100, hsCode: '123456', countryOfOrigin: 'KW' }],
      packages: [{ weight: { value: 1 }, dimensions: { length: 10, width: 10, height: 10 }, description: 'Box' }],
      optionalServices: ['FF', 'II'],
      insurance: { amount: 50, currency: 'USD' },
      insuredValue: 50,
      labelSettings: { format: 'pdf' }
    }, { accountNumber: '123456789' });

    const vasCodes = (payload.valueAddedServices || []).map((s) => s.serviceCode);
    expect(vasCodes).toContain('II');
    expect(vasCodes).not.toContain('FF');
  });
});
