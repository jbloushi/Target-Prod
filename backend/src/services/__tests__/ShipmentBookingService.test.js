const mockPendingDocs = [];
let mockShipmentInDb;
let mockShipmentOnFindOne;

jest.mock('../../models/shipment.model', () => ({
  findOne: jest.fn(async () => mockShipmentOnFindOne),
  findById: jest.fn(async () => mockShipmentInDb),
  updateOne: jest.fn(async () => ({ acknowledged: true })),
}));

jest.mock('../../models/user.model', () => ({
  findById: jest.fn(() => ({
    populate: jest.fn(async () => ({ _id: 'user-1', organization: { _id: 'org-1' } })),
  })),
}));

jest.mock('../../models/organization.model', () => ({
  findById: jest.fn(async () => ({ _id: 'org-1', creditLimit: 1000, allowedCarriers: ['DGR'] })),
}));

jest.mock('../CarrierFactory', () => ({
  getAdapter: jest.fn(() => ({
    createShipment: jest.fn(async () => ({
      trackingNumber: 'DHL-001',
      carrierShipmentId: 'CARRIER-001',
      labelUrl: 'data:label',
      awbUrl: 'data:awb',
      invoiceUrl: 'data:invoice',
    })),
  })),
}));

jest.mock('../pricing.service', () => ({
  validateSnapshot: jest.fn(() => true),
}));

jest.mock('../CarrierDocumentService', () => ({
  uploadDocument: jest.fn(async (type) => ({
    type,
    url: `stored://${type}`,
    uploadedAt: new Date(),
  })),
}));

jest.mock('../financeLedger.service', () => ({
  getOrganizationBalance: jest.fn(async () => 0),
  createLedgerEntry: jest.fn(async () => ({})),
}));

const ShipmentBookingService = require('../ShipmentBookingService');
const CarrierDocumentService = require('../CarrierDocumentService');

describe('ShipmentBookingService', () => {
  beforeEach(() => {
    mockPendingDocs.length = 0;

    mockShipmentInDb = {
      _id: 'shipment-1',
      trackingNumber: 'TRK-UNIT-1',
      user: 'user-1',
      organization: 'org-1',
      status: 'ready_for_pickup',
      carrierCode: 'DGR',
      serviceCode: 'P',
      pricingSnapshot: { totalPrice: 10 },
      bookingAttempts: [{ attemptId: 'attempt-1', status: 'pending', createdAt: new Date() }],
      documents: mockPendingDocs,
      save: jest.fn(async function save() { return this; }),
    };

    mockShipmentOnFindOne = {
      ...mockShipmentInDb,
      bookingAttempts: [],
      save: jest.fn(async function save() {
        this.bookingAttempts.push({ attemptId: 'attempt-1', status: 'pending', createdAt: new Date() });
        return this;
      }),
    };

    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('attempt-1');
    jest.spyOn(ShipmentBookingService, 'mapToCarrierPayload').mockReturnValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists label, awb and invoice URLs from carrier booking result', async () => {
    const result = await ShipmentBookingService.bookShipment('TRK-UNIT-1', 'DGR');

    expect(result.success).toBe(true);
    expect(mockShipmentInDb.labelUrl).toBe('stored://label');
    expect(mockShipmentInDb.awbUrl).toBe('stored://awb');
    expect(mockShipmentInDb.invoiceUrl).toBe('stored://invoice');

    expect(CarrierDocumentService.uploadDocument).toHaveBeenCalledWith('label', 'data:label', 'pdf', 'TRK-UNIT-1');
    expect(CarrierDocumentService.uploadDocument).toHaveBeenCalledWith('awb', 'data:awb', 'pdf', 'TRK-UNIT-1');
    expect(CarrierDocumentService.uploadDocument).toHaveBeenCalledWith('invoice', 'data:invoice', 'pdf', 'TRK-UNIT-1');
  });
});
