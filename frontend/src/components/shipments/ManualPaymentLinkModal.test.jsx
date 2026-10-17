import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ManualPaymentLinkModal from './ManualPaymentLinkModal';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
    default: {
        post: vi.fn()
    }
}));

const mockEnqueueSnackbar = vi.fn();
vi.mock('notistack', () => ({
    useSnackbar: () => ({
        enqueueSnackbar: mockEnqueueSnackbar
    })
}));

describe('ManualPaymentLinkModal Component', () => {
    const mockShipment = {
        trackingNumber: 'TRG-PL-2026-999',
        remainingBalance: 14.5,
        totalPrice: 20.0,
        currency: 'KWD',
        destination: {
            contactPerson: 'Ahmad Al-Consignee',
            phone: '+965 99112233'
        },
        origin: {
            contactPerson: 'Salem Al-Shipper',
            phone: '+965 66778899'
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders null when isOpen is false', () => {
        const { container } = render(
            <ManualPaymentLinkModal
                isOpen={false}
                onClose={vi.fn()}
                shipment={mockShipment}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('pre-fills amount from shipment remainingBalance and displays tracking number', () => {
        render(
            <ManualPaymentLinkModal
                isOpen={true}
                onClose={vi.fn()}
                shipment={mockShipment}
            />
        );

        expect(screen.getAllByText('TRG-PL-2026-999').length).toBeGreaterThanOrEqual(1);
        const amountInput = screen.getByTestId('amount-input');
        expect(amountInput.value).toBe('14.500');
    });

    it('switches recipient info and preview text when recipientRole is changed', () => {
        render(
            <ManualPaymentLinkModal
                isOpen={true}
                onClose={vi.fn()}
                shipment={mockShipment}
            />
        );

        // Initially consignee
        expect(screen.getAllByText('Ahmad Al-Consignee').length).toBeGreaterThanOrEqual(1);

        // Switch to shipper
        const roleSelect = screen.getByTestId('recipient-role-select');
        fireEvent.change(roleSelect, { target: { value: 'shipper' } });

        expect(screen.getAllByText('Salem Al-Shipper').length).toBeGreaterThanOrEqual(1);
    });

    it('validates URL field and rejects non-HTTP/HTTPS URLs', async () => {
        render(
            <ManualPaymentLinkModal
                isOpen={true}
                onClose={vi.fn()}
                shipment={mockShipment}
            />
        );

        const urlInput = screen.getByTestId('custom-payment-url-input');
        const submitBtn = screen.getByTestId('submit-payment-link-btn');

        // Submit while empty
        fireEvent.click(submitBtn);
        expect(
            screen.getByText('Custom Payment/Checkout URL is required')
        ).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();

        // Enter javascript: scheme or ftp
        fireEvent.change(urlInput, { target: { value: 'ftp://not-allowed.com' } });
        fireEvent.click(submitBtn);
        expect(
            screen.getByText('Payment URL must start with http:// or https://')
        ).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('fills standard public pay link when helper button is clicked', () => {
        render(
            <ManualPaymentLinkModal
                isOpen={true}
                onClose={vi.fn()}
                shipment={mockShipment}
            />
        );

        const helperBtn = screen.getByText('Use Public Pay Link');
        fireEvent.click(helperBtn);

        const urlInput = screen.getByTestId('custom-payment-url-input');
        expect(urlInput.value).toContain('/pay/TRG-PL-2026-999');
    });

    it('renders live template preview of payment_request_v1', () => {
        render(
            <ManualPaymentLinkModal
                isOpen={true}
                onClose={vi.fn()}
                shipment={mockShipment}
            />
        );

        expect(screen.getByText('payment_request_v1')).toBeInTheDocument();

        const urlInput = screen.getByTestId('custom-payment-url-input');
        fireEvent.change(urlInput, { target: { value: 'https://target.ottu.com/checkout/123' } });

        expect(
            screen.getByText('https://target.ottu.com/checkout/123')
        ).toBeInTheDocument();
        expect(screen.getByText('14.500 KWD')).toBeInTheDocument();
    });

    it('dispatches payment link notice on valid submit and invokes onSuccess and onClose', async () => {
        api.post.mockResolvedValueOnce({
            status: 200,
            data: {
                success: true,
                message: 'Payment link notification dispatched',
                data: { externalMessageId: 'wamid.12345' }
            }
        });

        const onSuccessMock = vi.fn();
        const onCloseMock = vi.fn();

        render(
            <ManualPaymentLinkModal
                isOpen={true}
                onClose={onCloseMock}
                onSuccess={onSuccessMock}
                shipment={mockShipment}
            />
        );

        const urlInput = screen.getByTestId('custom-payment-url-input');
        fireEvent.change(urlInput, {
            target: { value: 'https://target.ottu.com/checkout/tok_live_abc' }
        });

        const submitBtn = screen.getByTestId('submit-payment-link-btn');
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith(
                'shipments/TRG-PL-2026-999/whatsapp/payment-link',
                {
                    customPaymentUrl: 'https://target.ottu.com/checkout/tok_live_abc',
                    amount: '14.500',
                    recipientRole: 'consignee'
                }
            );
            expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
                expect.stringContaining('WhatsApp payment link successfully dispatched'),
                { variant: 'success' }
            );
            expect(onSuccessMock).toHaveBeenCalled();
            expect(onCloseMock).toHaveBeenCalled();
        });
    });

    it('handles backend error gracefully without crashing', async () => {
        api.post.mockRejectedValueOnce({
            response: {
                data: {
                    error: 'Quiet hours delivery suppression active'
                }
            }
        });

        const onCloseMock = vi.fn();

        render(
            <ManualPaymentLinkModal
                isOpen={true}
                onClose={onCloseMock}
                shipment={mockShipment}
            />
        );

        const urlInput = screen.getByTestId('custom-payment-url-input');
        fireEvent.change(urlInput, {
            target: { value: 'https://pay.example.com/checkout' }
        });

        const submitBtn = screen.getByTestId('submit-payment-link-btn');
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(
                screen.getByText('Quiet hours delivery suppression active')
            ).toBeInTheDocument();
            expect(onCloseMock).not.toHaveBeenCalled();
        });
    });
});
