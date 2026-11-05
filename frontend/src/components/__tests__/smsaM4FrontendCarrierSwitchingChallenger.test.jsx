import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { getCarrierDisplayName, getStatusBadgeInfo, normalizeCarrierDisplayText } from '../../utils/shipmentDisplay';
import {
  normalizeStatus,
  normalizeCarrierStatus,
  SMSA_CHECKPOINT_MAP,
  SMSA_STATUS_MAP,
  DHL_CHECKPOINT_MAP
} from '../../constants/statusConfig';
import CarrierNetworkHealth from '../CarrierNetworkHealth';
import { LanguageProvider } from '../../context/LanguageContext';

describe('Empirical Challenger M4: Frontend Multi-Carrier Switching & Badge Rendering Suite', () => {
  describe('Dimension 1: Multi-Carrier Switching & Display Name Resolution', () => {
    const switchingMatrix = [
      { input: 'SMSA', isTest: false, expected: 'SMSA Express' },
      { input: 'smsa', isTest: false, expected: 'SMSA Express' },
      { input: 'SMSAEXPRESS', isTest: false, expected: 'SMSA Express' },
      { input: 'smsaexpress', isTest: false, expected: 'SMSA Express' },
      { input: 'SMSA', isTest: true, expected: 'SMSA Express (Test Sandbox API)' },
      { input: 'SMSAEXPRESS', isTest: true, expected: 'SMSA Express (Test Sandbox API)' },
      { input: 'DGR', isTest: false, expected: 'Target International Air (DHL Express)' },
      { input: 'dhl', isTest: false, expected: 'Target International Air (DHL Express)' },
      { input: 'DGR', isTest: true, expected: 'Target International Air (DHL Express) (Test Sandbox API)' },
      { input: 'FEDEX', isTest: false, expected: 'Target Express (FedEx Express)' },
      { input: 'ARAMEX', isTest: false, expected: 'Target Express (Aramex)' },
      { input: 'INTERNAL', isTest: false, expected: 'Target Local Fleet' },
      { input: 'MAN', isTest: false, expected: 'Target Local Fleet' }
    ];

    it.each(switchingMatrix)(
      'Resolves carrier code "$input" (isTest: $isTest) -> "$expected"',
      ({ input, isTest, expected }) => {
        expect(getCarrierDisplayName(input, '', isTest)).toBe(expected);
      }
    );

    it('gracefully falls back when carrierCode is null, undefined, or empty', () => {
      expect(getCarrierDisplayName(null, 'Fallback Carrier')).toBe('Fallback Carrier');
      expect(getCarrierDisplayName(undefined, 'Fallback Carrier')).toBe('Fallback Carrier');
      expect(getCarrierDisplayName('', 'Fallback Carrier')).toBe('Fallback Carrier');
      expect(getCarrierDisplayName(null, 'Fallback Carrier', true)).toBe('Fallback Carrier (Test Sandbox API)');
    });
  });

  describe('Dimension 2: CarrierNetworkHealth Component Switching & Click Handling', () => {
    it('renders and dynamically switches between DGR and SMSA network cards with accurate badges', () => {
      const onCarrierClick = vi.fn();
      const mockCarriers = [
        { code: 'DGR', name: 'DHL Express', health: 99.4, activeShipments: 142 },
        { code: 'SMSA', name: 'SMSA Express', health: 100.0, activeShipments: 88 },
        { code: 'INTERNAL', name: 'Local Fleet', health: 97.2, activeShipments: 35 }
      ];

      const { container, rerender } = render(
        <LanguageProvider>
          <CarrierNetworkHealth carriers={mockCarriers} onCarrierClick={onCarrierClick} />
        </LanguageProvider>
      );

      // Verify text presence
      expect(container.textContent).toContain('SMSA');
      expect(container.textContent).toContain('Express');
      expect(container.textContent).toContain('DHL Express');

      // Verify orange styling for SMSA
      const smsaCard = container.querySelector('.bg-\\[\\#ea580c\\]');
      expect(smsaCard).not.toBeNull();

      // Test click handling
      const clickableCards = container.querySelectorAll('.cursor-pointer');
      if (clickableCards.length >= 2) {
        fireEvent.click(clickableCards[1]); // SMSA
        expect(onCarrierClick).toHaveBeenCalledWith('SMSA');
      }

      // Rerender with swapped priority / updated health metrics
      const updatedCarriers = [
        { code: 'SMSA', name: 'SMSA Express KSA', health: 94.5, count: 120, percentage: 60 },
        { code: 'DGR', name: 'DHL Air', health: 98.0, count: 95, percentage: 40 }
      ];

      rerender(
        <LanguageProvider>
          <CarrierNetworkHealth carriers={updatedCarriers} onCarrierClick={onCarrierClick} />
        </LanguageProvider>
      );

      expect(container.textContent).toContain('SMSA Express KSA');
      expect(container.textContent).toContain('120');
      expect(container.textContent).toContain('94.5% SLA');
    });

    it('renders safely with empty, null, or malformed carrier objects', () => {
      const { container } = render(
        <LanguageProvider>
          <CarrierNetworkHealth carriers={[]} />
        </LanguageProvider>
      );
      expect(container.firstChild).toBeNull();

      const edgeCarriers = [
        { code: 'EDGE_1', name: undefined, health: undefined },
        { code: 'EDGE_2', name: null, health: 0 },
        { code: 'UNKNOWN_XYZ', name: 'Third Party Express', health: 90 }
      ];

      const { container: edgeContainer } = render(
        <LanguageProvider>
          <CarrierNetworkHealth carriers={edgeCarriers} />
        </LanguageProvider>
      );
      expect(edgeContainer.textContent).toContain('Third Party Express');
    });
  });

  describe('Dimension 3: Status Badge & Checkpoint Parity', () => {
    const statuses = [
      { status: 'draft', expectedColor: 'default' },
      { status: 'booked', expectedColor: 'info' },
      { status: 'picked_up', expectedColor: 'info' },
      { status: 'received_at_hub', expectedColor: 'primary' },
      { status: 'verified', expectedColor: 'success' },
      { status: 'in_transit', expectedColor: 'primary' },
      { status: 'out_for_delivery', expectedColor: 'secondary' },
      { status: 'delivered', expectedColor: 'success' },
      { status: 'exception', expectedColor: 'error' },
      { status: 'cancelled', expectedColor: 'default' },
      { status: 'returned', expectedColor: 'error' }
    ];

    it.each(statuses)('getStatusBadgeInfo maps status "$status" to color "$expectedColor"', ({ status, expectedColor }) => {
      const info = getStatusBadgeInfo(status);
      expect(info.color).toBe(expectedColor);
      expect(info.label).toBeDefined();
    });

    it('verifies SMSA and DHL checkpoints normalize to identical platform statuses in frontend', () => {
      // Picked up
      expect(normalizeCarrierStatus('Picked up', 'SMSA', 'pu')).toBe('picked_up');
      expect(normalizeCarrierStatus('Picked up', 'DGR', 'PU')).toBe('picked_up');

      // Hub receipt
      expect(normalizeCarrierStatus('Arrived at Hub', 'SMSA', 'arr_fac')).toBe('received_at_hub');
      expect(normalizeCarrierStatus('Arrived at Hub', 'DGR', 'AF')).toBe('received_at_hub');

      // Delivery
      expect(normalizeCarrierStatus('Delivered to Consignee', 'SMSA', 'dlv')).toBe('delivered');
      expect(normalizeCarrierStatus('Delivered to Consignee', 'DGR', 'OK')).toBe('delivered');

      // Exception
      expect(normalizeCarrierStatus('Consignee premises closed', 'SMSA', 'premises closed')).toBe('exception');
      expect(normalizeCarrierStatus('Consignee premises closed', 'DGR', 'BA')).toBe('exception');
    });
  });
});
