import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MapFallbackCard from './MapFallbackCard';

describe('MapFallbackCard Component', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('renders gracefully without leaking any .env or technical configuration names', () => {
        const { container } = render(<MapFallbackCard />);
        
        // Assert title and user-friendly fallback text
        expect(screen.getByText('Interactive Map Offline')).toBeDefined();
        expect(screen.getByText(/interactive map view is currently offline/i)).toBeDefined();

        // Assert NO environment variables or technical names are leaked
        expect(container.textContent).not.toContain('VITE_GOOGLE_MAPS_API_KEY');
        expect(container.textContent).not.toContain('.env');
        expect(container.textContent).not.toContain('REACT_APP_');
    });

    it('displays regional GCC / Kuwait default coordinates when none provided', () => {
        render(<MapFallbackCard />);

        // Kuwait City defaults: 29.3759° N, 47.9774° E
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
    });

    it('renders custom coordinates badge and formats external navigation link', () => {
        render(
            <MapFallbackCard 
                coordinates={{ lat: 24.7136, lng: 46.6753 }} 
                title="Riyadh Hub"
            />
        );

        expect(screen.getByText('Riyadh Hub')).toBeDefined();
        expect(screen.getByText(/24\.7136° N, 46\.6753° E/)).toBeDefined();

        const mapLink = screen.getByRole('link', { name: /open in google maps/i });
        expect(mapLink.getAttribute('href')).toContain('query=24.7136,46.6753');
        expect(mapLink.getAttribute('target')).toBe('_blank');
    });

    it('renders shipment origin and destination when shipment prop is passed', () => {
        const mockShipment = {
            origin: { formattedAddress: 'Shuwaikh Industrial, Kuwait' },
            destination: { formattedAddress: 'Dubai Logistics City, UAE' },
            currentLocation: { coordinates: [47.9774, 29.3759] }
        };

        render(<MapFallbackCard shipment={mockShipment} />);

        expect(screen.getByText('Shuwaikh Industrial, Kuwait')).toBeDefined();
        expect(screen.getByText('Dubai Logistics City, UAE')).toBeDefined();
    });

    it('handles copy coordinates action and renders feedback', async () => {
        const writeTextMock = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: writeTextMock
            }
        });

        render(<MapFallbackCard coordinates={{ lat: 29.3759, lng: 47.9774 }} />);

        const copyBtn = screen.getByRole('button', { name: /copy coordinates/i });
        fireEvent.click(copyBtn);

        expect(writeTextMock).toHaveBeenCalledWith('29.375900, 47.977400');
        expect(await screen.findByText('Coordinates Copied')).toBeDefined();
    });

    it('calls onRetry callback when retry button is clicked', () => {
        const onRetryMock = vi.fn();
        render(<MapFallbackCard onRetry={onRetryMock} />);

        const retryBtn = screen.getByRole('button', { name: /retry/i });
        fireEvent.click(retryBtn);

        expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it('handles array coordinates with null, undefined, strings, and NaN gracefully without throwing TypeError', () => {
        // [null, null] should fall back safely to Kuwait City without throwing TypeError
        const { unmount: u1 } = render(<MapFallbackCard coordinates={[null, null]} />);
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
        u1();

        // [undefined, undefined]
        const { unmount: u2 } = render(<MapFallbackCard coordinates={[undefined, undefined]} />);
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
        u2();

        // String numbers ['29.3759', '47.9774'] are safely converted and rendered
        const { unmount: u3 } = render(<MapFallbackCard coordinates={['29.3759', '47.9774']} />);
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
        u3();

        // [NaN, NaN]
        const { unmount: u4 } = render(<MapFallbackCard coordinates={[NaN, NaN]} />);
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
        u4();

        // Malformed strings ['invalid', 'corrupted']
        const { unmount: u5 } = render(<MapFallbackCard coordinates={['invalid', 'corrupted']} />);
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
        u5();

        // Object with null/NaN
        const { unmount: u6 } = render(<MapFallbackCard coordinates={{ lat: null, lng: NaN }} />);
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
        u6();

        // Shipment with [null, null] coordinates
        const { unmount: u7 } = render(
            <MapFallbackCard shipment={{ currentLocation: { coordinates: [null, null] } }} />
        );
        expect(screen.getByText(/29\.3759° N, 47\.9774° E/)).toBeDefined();
        u7();
    });
});
