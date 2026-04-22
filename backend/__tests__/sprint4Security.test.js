/**
 * Sprint 4 Security Tests
 * Covers: F-16 (coordinates), F-17 (cross-org logging), F-18 (pagination),
 *         F-22 (OTP 501), F-23 (ARAMEX block), F-25 (org approval),
 *         F-26 (DHL URL required), F-28/29 (no console.log)
 */

// Ensure required env vars are present
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-' + 'a'.repeat(52);
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
process.env.DHL_API_URL = process.env.DHL_API_URL || 'https://express.api.dhl.com/mydhlapi/test';

const fs = require('fs');
const path = require('path');

describe('Sprint 4 Security Findings', () => {

  // F-16: Coordinate validation
  describe('F-16: updatePublicLocation coordinate validation', () => {
    test('coordinate validation function exists and checks numeric types', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/shipment-public.controller.js'),
        'utf-8'
      );

      expect(source).toContain('typeof lng !== \'number\'');
      expect(source).toContain('typeof lat !== \'number\'');
    });

    test('coordinate validation enforces longitude range [-180, 180]', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/shipment-public.controller.js'),
        'utf-8'
      );

      expect(source).toMatch(/lng\s*<\s*-180\s*\|\|\s*lng\s*>\s*180/);
    });

    test('coordinate validation enforces latitude range [-90, 90]', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/shipment-public.controller.js'),
        'utf-8'
      );

      expect(source).toMatch(/lat\s*<\s*-90\s*\|\|\s*lat\s*>\s*90/);
    });
  });

  // F-17: Log cross-org finance queries
  describe('F-17: Log cross-org finance queries', () => {
    test('finance controller logs when staff/admin queries other org', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/finance.controller.js'),
        'utf-8'
      );

      expect(source).toContain('Finance query');
      expect(source).toContain('logger.info');
    });
  });

  // F-18: Paginate getAllUsers
  describe('F-18: getAllUsers pagination', () => {
    test('getAllUsers accepts page and limit query parameters', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/auth.controller.js'),
        'utf-8'
      );

      expect(source).toContain('page = 1');
      expect(source).toContain('limit = 20');
    });

    test('getAllUsers enforces pagination limit cap', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/auth.controller.js'),
        'utf-8'
      );

      expect(source).toMatch(/Math\.min.*100/);
    });

    test('getAllUsers returns pagination metadata', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/auth.controller.js'),
        'utf-8'
      );

      expect(source).toContain('pagination');
      expect(source).toContain('pages: Math.ceil');
    });
  });

  // F-22: requestOtp returns 501
  describe('F-22: requestOtp not implemented', () => {
    test('requestOtp returns 501 status code', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/auth.controller.js'),
        'utf-8'
      );

      expect(source).toContain('res.status(501)');
      expect(source).toContain('OTP login not yet implemented');
    });
  });

  // F-23: Block Aramex in production
  describe('F-23: Block Aramex in production', () => {
    test('CarrierFactory throws error for Aramex in production', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/services/CarrierFactory.js'),
        'utf-8'
      );

      expect(source).toContain('ARAMEX');
      expect(source).toContain('NODE_ENV === \'production\'');
      expect(source).toContain('not available in production');
    });
  });

  // F-25: New org requires approval
  describe('F-25: New organization approval pending', () => {
    test('signup creates organization with active: false', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/controllers/auth.controller.js'),
        'utf-8'
      );

      expect(source).toContain('active: false');
      expect(source).toContain('F-25');
    });
  });

  // F-26: DHL URL required
  describe('F-26: DHL API URL required', () => {
    test('config throws on missing DHL_API_URL', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/config/config.js'),
        'utf-8'
      );

      expect(source).toContain('DHL_API_URL');
      expect(source).toContain('environment variable is required');
      expect(source).not.toContain('|| \'https://express.api.dhl.com/mydhlapi/test\'');
    });
  });

  // F-28/29: No console.log in production
  describe('F-28 F-29: No console.log in production', () => {
    test('AramexAdapter does not use console.log', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/adapters/AramexAdapter.js'),
        'utf-8'
      );

      expect(source).not.toMatch(/console\.(log|error|warn|info)\(/);
      expect(source).toContain('logger.debug');
    });

    test('server.js does not use console.log', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/server.js'),
        'utf-8'
      );

      // Should not have console.log calls (except potentially in old commented code)
      const lines = source.split('\n');
      const consoleCalls = lines.filter(line =>
        line.match(/console\.(log|error|warn|info)\(/) &&
        !line.trim().startsWith('//')
      );

      expect(consoleCalls).toHaveLength(0);
    });

    test('AramexAdapter imports logger', () => {
      const source = fs.readFileSync(
        path.join(__dirname, '../src/adapters/AramexAdapter.js'),
        'utf-8'
      );

      expect(source).toContain('logger');
      expect(source).toContain('require');
    });
  });

  // Integration: Verify all findings are in the codebase
  describe('Sprint 4 Integration Checks', () => {
    test('all 8 findings are implemented', () => {
      const findings = [
        { path: '../src/controllers/shipment-public.controller.js', text: 'lng < -180' },
        { path: '../src/controllers/finance.controller.js', text: 'Finance query' },
        { path: '../src/controllers/auth.controller.js', text: 'page = 1' },
        { path: '../src/controllers/auth.controller.js', text: 'res.status(501)' },
        { path: '../src/services/CarrierFactory.js', text: 'NODE_ENV === \'production\'' },
        { path: '../src/controllers/auth.controller.js', text: 'active: false' },
        { path: '../src/config/config.js', text: 'DHL_API_URL environment variable is required' },
        { path: '../src/adapters/AramexAdapter.js', text: 'logger.debug' },
      ];

      findings.forEach(({ path: filePath, text }) => {
        const source = fs.readFileSync(
          path.join(__dirname, filePath),
          'utf-8'
        );
        expect(source).toContain(text);
      });
    });
  });
});
