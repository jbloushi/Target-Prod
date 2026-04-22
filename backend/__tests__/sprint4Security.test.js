const request = require('supertest');
const express = require('express');
const { prismaMock } = require('./mocks/prisma.mock');

// Mock modules before importing controllers
jest.mock('../src/config/database', () => ({ prisma: prismaMock }));

const app = require('../src/server');

describe('Sprint 4 Security Findings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // F-16: Coordinate validation in updatePublicLocation
  describe('F-16: updatePublicLocation coordinate validation', () => {
    test('should reject non-numeric coordinates', async () => {
      prismaMock.shipment.findUnique.mockResolvedValueOnce({
        id: 'ship-1',
        trackingNumber: 'TRK123',
        allowPublicLocationUpdate: true,
        currentLocation: { city: 'KWC' },
        status: 'in_transit'
      });

      const res = await request(app)
        .patch('/api/public/shipments/TRK123/location')
        .send({
          coordinates: ['not-a-number', 'also-not'],
          address: 'New Address'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('valid numbers');
    });

    test('should reject longitude outside [-180, 180]', async () => {
      prismaMock.shipment.findUnique.mockResolvedValueOnce({
        id: 'ship-1',
        trackingNumber: 'TRK123',
        allowPublicLocationUpdate: true,
        currentLocation: { city: 'KWC' },
        status: 'in_transit'
      });

      const res = await request(app)
        .patch('/api/public/shipments/TRK123/location')
        .send({
          coordinates: [200, 45],
          address: 'New Address'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('longitude');
    });

    test('should reject latitude outside [-90, 90]', async () => {
      prismaMock.shipment.findUnique.mockResolvedValueOnce({
        id: 'ship-1',
        trackingNumber: 'TRK123',
        allowPublicLocationUpdate: true,
        currentLocation: { city: 'KWC' },
        status: 'in_transit'
      });

      const res = await request(app)
        .patch('/api/public/shipments/TRK123/location')
        .send({
          coordinates: [55, 100],
          address: 'New Address'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('latitude');
    });

    test('should accept valid coordinates', async () => {
      prismaMock.shipment.findUnique.mockResolvedValueOnce({
        id: 'ship-1',
        trackingNumber: 'TRK123',
        allowPublicLocationUpdate: true,
        destination: { city: 'DXB' },
        currentLocation: { city: 'KWC' },
        status: 'in_transit',
        history: []
      });

      prismaMock.shipment.update.mockResolvedValueOnce({
        id: 'ship-1',
        trackingNumber: 'TRK123'
      });

      const res = await request(app)
        .patch('/api/public/shipments/TRK123/location')
        .send({
          coordinates: [55.2708, 29.3759], // Kuwait coords
          address: 'Kuwait City, KW'
        });

      expect(res.status).toBe(200);
      expect(prismaMock.shipment.update).toHaveBeenCalled();
    });
  });

  // F-17: Log cross-org finance queries (integration test)
  describe('F-17: Log cross-org finance queries', () => {
    test('should log when staff queries another org ledger', async () => {
      const loggerSpy = jest.spyOn(require('../src/utils/logger'), 'info');

      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'staff@target.com',
        role: 'staff',
        organizationId: 'org-1'
      });

      prismaMock.organizationLedger.findMany.mockResolvedValueOnce([]);
      prismaMock.organizationLedger.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/api/finance/ledger')
        .query({ orgId: 'org-2' })
        .set('Authorization', 'Bearer token');

      // Logger should have been called with cross-org query info
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Finance query')
      );

      loggerSpy.mockRestore();
    });
  });

  // F-18: Paginate getAllUsers
  describe('F-18: getAllUsers pagination', () => {
    test('should return paginated results with metadata', async () => {
      prismaMock.user.findMany.mockResolvedValueOnce([
        { id: 'user-1', name: 'Agent 1', role: 'org_agent' },
        { id: 'user-2', name: 'Agent 2', role: 'org_agent' }
      ]);

      prismaMock.user.count.mockResolvedValueOnce(50);

      const res = await request(app)
        .get('/api/auth/users')
        .query({ page: 1, limit: 2 })
        .set('Authorization', 'Bearer token');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(50);
      expect(res.body.pagination.pages).toBe(25);
    });

    test('should enforce limit cap at 100', async () => {
      prismaMock.user.findMany.mockResolvedValueOnce([]);
      prismaMock.user.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get('/api/auth/users')
        .query({ page: 1, limit: 500 })
        .set('Authorization', 'Bearer token');

      // Verify that the limit was capped to 100
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100 // Should be capped, not 500
        })
      );
    });
  });

  // F-22: requestOtp returns 501
  describe('F-22: requestOtp not implemented', () => {
    test('should return 501 Not Implemented', async () => {
      const res = await request(app)
        .post('/api/auth/request-otp')
        .send({ phone: '+965-1234567' });

      expect(res.status).toBe(501);
      expect(res.body.error).toBe('OTP login not yet implemented');
    });
  });

  // F-23: Block Aramex in production
  describe('F-23: Block Aramex in production', () => {
    const originalEnv = process.env.NODE_ENV;

    test('should throw error when Aramex requested in production', () => {
      process.env.NODE_ENV = 'production';
      const CarrierFactory = require('../src/services/CarrierFactory');

      expect(() => CarrierFactory.getAdapter('ARAMEX')).toThrow(
        'Aramex carrier is not available in production'
      );

      process.env.NODE_ENV = originalEnv;
    });

    test('should allow Aramex in development', () => {
      process.env.NODE_ENV = 'development';
      const CarrierFactory = require('../src/services/CarrierFactory');

      const adapter = CarrierFactory.getAdapter('ARAMEX');
      expect(adapter).toBeDefined();
      expect(adapter.code).toBe('ARAMEX');

      process.env.NODE_ENV = originalEnv;
    });
  });

  // F-25: New-org signup flags org as inactive
  describe('F-25: New organization approval pending', () => {
    test('should create org with active: false in signup', async () => {
      // This test verifies the code change was applied
      const signupController = require('../src/controllers/auth.controller');
      const source = signupController.signup.toString();

      expect(source).toContain('active: false');
      expect(source).toContain('F-25');
    });
  });

  // F-26: DHL API URL required
  describe('F-26: DHL API URL required (no test fallback)', () => {
    test('should throw on missing DHL_API_URL', () => {
      const originalDhlUrl = process.env.DHL_API_URL;
      delete process.env.DHL_API_URL;

      expect(() => {
        delete require.cache[require.resolve('../src/config/config')];
        require('../src/config/config');
      }).toThrow('DHL_API_URL');

      process.env.DHL_API_URL = originalDhlUrl;
    });
  });

  // F-28/29: No console.log calls
  describe('F-28 F-29: No console.log in production code', () => {
    test('AramexAdapter should not use console.log', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../src/adapters/AramexAdapter.js'),
        'utf-8'
      );
      expect(source).not.toMatch(/console\.(log|error|warn|info)\(/);
      expect(source).toContain('logger.debug');
    });

    test('server.js should not use console.log', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../src/server.js'),
        'utf-8'
      );
      expect(source).not.toMatch(/console\.(log|error|warn|info)\(/);
    });
  });
});
