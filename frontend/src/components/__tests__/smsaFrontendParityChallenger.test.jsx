import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getCarrierDisplayName, normalizeCarrierDisplayText } from '../../utils/shipmentDisplay';
import {
  normalizeStatus,
  normalizeCarrierStatus,
  SMSA_CHECKPOINT_MAP,
  SMSA_STATUS_MAP
} from '../../constants/statusConfig';
import CarrierNetworkHealth from '../CarrierNetworkHealth';
import { LanguageProvider } from '../../context/LanguageContext';

describe('Empirical Challenger M3: Frontend Carrier Parity & Resilience Suite', () => {
  describe('Dimension 1: Carrier Display Name and Normalization', () => {
    it('correctly maps SMSA and SMSAEXPRESS with and without test suffix', () => {
      expect(getCarrierDisplayName('SMSA')).toBe('SMSA Express');
      expect(getCarrierDisplayName('SMSAEXPRESS')).toBe('SMSA Express');
      expect(getCarrierDisplayName('smsa')).toBe('SMSA Express');
      expect(getCarrierDisplayName('smsaexpress')).toBe('SMSA Express');
      expect(getCarrierDisplayName('SMSA', '', true)).toBe('SMSA Express (Test Sandbox API)');
      expect(getCarrierDisplayName('SMSAEXPRESS', '', true)).toBe('SMSA Express (Test Sandbox API)');
    });

    it('gracefully handles undefined, null, empty string, and arbitrary unknown carriers without crashing', () => {
      expect(getCarrierDisplayName(undefined)).toBe('');
      expect(getCarrierDisplayName(null)).toBe('');
      expect(getCarrierDisplayName('')).toBe('');
      expect(getCarrierDisplayName(undefined, 'FallbackCarrier')).toBe('FallbackCarrier');
      expect(getCarrierDisplayName(null, 'FallbackCarrier')).toBe('FallbackCarrier');
      expect(getCarrierDisplayName('CUSTOM_CARRIER')).toBe('CUSTOM_CARRIER');
    });

    it('normalizes carrier display text safely', () => {
      expect(normalizeCarrierDisplayText('SMSA Express')).toBe('SMSA Express');
      expect(normalizeCarrierDisplayText(undefined)).toBe('');
      expect(normalizeCarrierDisplayText(null)).toBe('');
    });
  });

  describe('Dimension 2: SMSA Checkpoints and Status Normalization', () => {
    it('exports complete SMSA_CHECKPOINT_MAP and SMSA_STATUS_MAP with operational checkpoints', () => {
      expect(SMSA_CHECKPOINT_MAP).toBeDefined();
      expect(SMSA_STATUS_MAP).toBeDefined();

      // Checkpoint mapping integrity
      expect(SMSA_CHECKPOINT_MAP['data_rcvd']).toBe('booked');
      expect(SMSA_CHECKPOINT_MAP['b2c_created']).toBe('booked');
      expect(SMSA_CHECKPOINT_MAP['c2b_created']).toBe('booked');
      expect(SMSA_CHECKPOINT_MAP['picked up']).toBe('picked_up');
      expect(SMSA_CHECKPOINT_MAP['pu']).toBe('picked_up');
      expect(SMSA_CHECKPOINT_MAP['arrived at facility']).toBe('received_at_hub');
      expect(SMSA_CHECKPOINT_MAP['in transit']).toBe('in_transit');
      expect(SMSA_CHECKPOINT_MAP['out for delivery']).toBe('out_for_delivery');
      expect(SMSA_CHECKPOINT_MAP['dlv']).toBe('delivered');
      expect(SMSA_CHECKPOINT_MAP['delivered']).toBe('delivered');
      expect(SMSA_CHECKPOINT_MAP['pod']).toBe('delivered');
      expect(SMSA_CHECKPOINT_MAP['failed_attempt']).toBe('exception');
      expect(SMSA_CHECKPOINT_MAP['undelivered']).toBe('exception');
      expect(SMSA_CHECKPOINT_MAP['cancelled']).toBe('cancelled');
    });

    it('normalizes carrier status cleanly with SMSA and SMSAEXPRESS carrierCode', () => {
      expect(normalizeCarrierStatus('Data Received', 'SMSA', 'data_rcvd')).toBe('booked');
      expect(normalizeCarrierStatus('Out for Delivery', 'SMSA', 'out_for_delivery')).toBe('out_for_delivery');
      expect(normalizeCarrierStatus('Delivered to Consignee', 'SMSAEXPRESS', 'dlv')).toBe('delivered');
      expect(normalizeCarrierStatus('Failed Delivery Attempt', 'SMSA', 'failed_attempt')).toBe('exception');
      expect(normalizeCarrierStatus('Cancelled by Shipper', 'SMSA', 'cancelled')).toBe('cancelled');
    });

    it('handles undefined, null, or unknown carrier codes in normalizeCarrierStatus without throwing', () => {
      expect(normalizeCarrierStatus('delivered', undefined)).toBe('delivered');
      expect(normalizeCarrierStatus('out for delivery', null)).toBe('out_for_delivery');
      expect(normalizeCarrierStatus(undefined, undefined, undefined)).toBe('draft');
      expect(normalizeCarrierStatus(null, null, null)).toBe('draft');
    });
  });

  describe('Dimension 3: Component Rendering Resilience (SMSA, SMSAEXPRESS, undefined)', () => {
    it('renders CarrierNetworkHealth with SMSA, SMSAEXPRESS, and edge-case carriers without throwing', () => {
      const mockCarriers = [
        { code: 'SMSA', name: 'SMSA Express', health: 100, activeShipments: 12 },
        { code: 'SMSAEXPRESS', name: 'SMSA Express GCC', health: 96, activeShipments: 5 },
        { code: 'DHL', name: 'DHL Express', health: 99, activeShipments: 30 },
        { code: undefined, name: undefined, health: 100 },
        { code: null, name: null, health: 0 },
        { code: 'UNKNOWN_99', name: 'Unknown Freight', health: 90 }
      ];

      const { container } = render(
        <LanguageProvider>
          <CarrierNetworkHealth carriers={mockCarriers} />
        </LanguageProvider>
      );

      // Verify that "SMSA" appears in the rendered output
      expect(container.textContent).toContain('SMSA');
      expect(container.textContent).toContain('Express');
    });

    it('renders CarrierNetworkHealth safely when carriers prop is empty, undefined, or malformed', () => {
      expect(() => {
        render(
          <LanguageProvider>
            <CarrierNetworkHealth carriers={[]} />
          </LanguageProvider>
        );
      }).not.toThrow();

      expect(() => {
        render(
          <LanguageProvider>
            <CarrierNetworkHealth carriers={undefined} />
          </LanguageProvider>
        );
      }).not.toThrow();
    });
  });
});
