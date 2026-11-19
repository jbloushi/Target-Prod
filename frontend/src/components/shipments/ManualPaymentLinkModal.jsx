import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useSnackbar } from 'notistack';
import api from '../../services/api';

/**
 * ManualPaymentLinkModal
 * 
 * Allows staff and administrators to input custom payment/checkout URLs
 * and dispatch payment notice notifications via WhatsApp using Meta template 'payment_request_v1'.
 */
export const ManualPaymentLinkModal = ({
    isOpen,
    onClose,
    onSuccess,
    shipment,
    trackingNumber: propTrackingNumber,
    defaultRole = 'consignee',
    defaultAmount
}) => {
    const { enqueueSnackbar } = useSnackbar();

    const effectiveTrackingNumber = shipment?.trackingNumber || propTrackingNumber || '';
    const currency = shipment?.currency || 'KWD';

    // Initial amount resolution
    const initialAmount = useMemo(() => {
        if (defaultAmount !== undefined && defaultAmount !== null && defaultAmount !== '') {
            return String(defaultAmount);
        }
        if (shipment?.remainingBalance !== undefined && shipment?.remainingBalance !== null) {
            return String(Number(shipment.remainingBalance).toFixed(3));
        }
        if (shipment?.totalPrice !== undefined && shipment?.totalPrice !== null) {
            return String(Number(shipment.totalPrice).toFixed(3));
        }
        if (shipment?.price !== undefined && shipment?.price !== null) {
            return String(Number(shipment.price).toFixed(3));
        }
        return '';
    }, [defaultAmount, shipment]);

    // Form states
    const [customPaymentUrl, setCustomPaymentUrl] = useState('');
    const [amount, setAmount] = useState(initialAmount);
    const [recipientRole, setRecipientRole] = useState(defaultRole);
    const [urlError, setUrlError] = useState('');
    const [amountError, setAmountError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Reset fields on modal open
    useEffect(() => {
        if (isOpen) {
            setAmount(initialAmount);
            setRecipientRole(defaultRole || 'consignee');
            setUrlError('');
            setAmountError('');
            setErrorMessage('');
            if (!customPaymentUrl && effectiveTrackingNumber) {
                // Keep default customPaymentUrl empty or let user fill it
            }
        }
    }, [isOpen, initialAmount, defaultRole, effectiveTrackingNumber]);

    // Handle Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && !isSubmitting) {
                onClose?.();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isSubmitting, onClose]);

    if (!isOpen) return null;

    // Contact info based on role
    const consigneeName = shipment?.destination?.contactPerson || 
        shipment?.destination?.name || 
        shipment?.receiver?.contactPerson || 
        shipment?.receiver?.name || 
        shipment?.customerName || 
        'Valued Customer';

    const consigneePhone = shipment?.destination?.phone || 
        shipment?.receiver?.phone || 
        shipment?.customerPhone || 
        '';

    const shipperName = shipment?.origin?.contactPerson || 
        shipment?.origin?.name || 
        shipment?.sender?.contactPerson || 
        shipment?.sender?.name || 
        shipment?.organization?.name || 
        'Target Shipper';

    const shipperPhone = shipment?.origin?.phone || 
        shipment?.sender?.phone || 
        '';

    const activeRecipientName = recipientRole === 'shipper' || recipientRole === 'sender'
        ? shipperName
        : consigneeName;

    const activeRecipientPhone = recipientRole === 'shipper' || recipientRole === 'sender'
        ? shipperPhone
        : consigneePhone;

    // Validate URL
    const validateUrl = (url) => {
        const trimmed = (url || '').trim();
        if (!trimmed) {
            return 'Custom Payment/Checkout URL is required';
        }
        if (trimmed.includes('\r') || trimmed.includes('\n')) {
            return 'Invalid URL format (contains line breaks)';
        }
        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                return 'Payment URL must start with http:// or https://';
            }
        } catch {
            return 'Please enter a valid HTTP/HTTPS URL';
        }
        return '';
    };

    // Validate Amount
    const validateAmount = (val) => {
        if (val === undefined || val === null || val === '') return '';
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0) {
            return 'Amount must be greater than zero';
        }
        return '';
    };

    const handleUrlChange = (e) => {
        const val = e.target.value;
        setCustomPaymentUrl(val);
        if (urlError) {
            setUrlError(validateUrl(val));
        }
    };

    const handleAmountChange = (e) => {
        const val = e.target.value;
        setAmount(val);
        if (amountError) {
            setAmountError(validateAmount(val));
        }
    };

    const handleFillStandardPayLink = () => {
        const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://target-kw.com';
        const link = `${originUrl}/pay/${effectiveTrackingNumber}`;
        setCustomPaymentUrl(link);
        setUrlError('');
    };

    const handleSubmit = async (e) => {
        e?.preventDefault();
        setErrorMessage('');

        const urlValidation = validateUrl(customPaymentUrl);
        const amountValidation = validateAmount(amount);

        if (urlValidation) {
            setUrlError(urlValidation);
            return;
        }
        if (amountValidation) {
            setAmountError(amountValidation);
            return;
        }

        if (!effectiveTrackingNumber) {
            setErrorMessage('No tracking number available for this shipment');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                customPaymentUrl: customPaymentUrl.trim(),
                amount: amount !== '' ? Number(amount).toFixed(3) : undefined,
                recipientRole
            };

            const response = await api.post(
                `shipments/${encodeURIComponent(effectiveTrackingNumber)}/whatsapp/payment-link`,
                payload
            );

            const data = response.data;
            if (data?.success || response.status === 200) {
                enqueueSnackbar(
                    `WhatsApp payment link successfully dispatched to ${recipientRole === 'shipper' ? 'Shipper' : 'Consignee'}!`,
                    { variant: 'success' }
                );
                onSuccess?.(data);
                onClose?.();
            } else {
                throw new Error(data?.error || 'Failed to dispatch payment link notice');
            }
        } catch (err) {
            console.error('Error dispatching manual payment link notice:', err);
            const msg = err.response?.data?.error || err.message || 'Failed to dispatch payment link notice';
            setErrorMessage(msg);
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Formatted date for preview
    const todayFormatted = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(new Date());

    const previewAmountStr = amount !== '' && !Number.isNaN(Number(amount))
        ? `${Number(amount).toFixed(3)} ${currency}`
        : `[Amount] ${currency}`;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
            data-testid="manual-payment-link-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-headline"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
                onClick={() => !isSubmitting && onClose?.()}
                data-testid="payment-modal-backdrop"
                aria-hidden="true"
            />

            {/* Modal Dialog */}
            <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl z-10 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xl">payments</span>
                        </div>
                        <div className="min-w-0">
                            <h3 id="modal-headline" className="font-extrabold text-base text-slate-900 dark:text-white truncate">
                                Send WhatsApp Payment Notice
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                                Shipment: <span className="font-bold text-primary">{effectiveTrackingNumber || '—'}</span>
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 transition-colors shrink-0"
                        aria-label="Close modal"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Form Body */}
                <form noValidate onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
                    {errorMessage && (
                        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs shadow-2xs flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm shrink-0">error</span>
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Recipient Role Selector */}
                    <div>
                        <label htmlFor="recipientRole" className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                            Recipient Role <span className="text-rose-500">*</span>
                        </label>
                        <select
                            id="recipientRole"
                            name="recipientRole"
                            value={recipientRole}
                            onChange={(e) => setRecipientRole(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                            data-testid="recipient-role-select"
                        >
                            <option value="consignee">Consignee (Customer / Receiver)</option>
                            <option value="shipper">Shipper (Sender / Merchant)</option>
                        </select>
                        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400 mt-1 px-1">
                            <span>Recipient: <strong className="text-slate-700 dark:text-slate-200">{activeRecipientName}</strong></span>
                            {activeRecipientPhone && (
                                <span className="font-mono" dir="ltr">{activeRecipientPhone}</span>
                            )}
                        </div>
                    </div>

                    {/* Custom Payment URL Input */}
                    <div>
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                            <label htmlFor="customPaymentUrl" className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                                Custom Payment/Checkout URL <span className="text-rose-500">*</span>
                            </label>
                            <button
                                type="button"
                                onClick={handleFillStandardPayLink}
                                className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-xs">link</span>
                                <span>Use Public Pay Link</span>
                            </button>
                        </div>
                        <input
                            type="url"
                            id="customPaymentUrl"
                            name="customPaymentUrl"
                            value={customPaymentUrl}
                            onChange={handleUrlChange}
                            onBlur={() => setUrlError(validateUrl(customPaymentUrl))}
                            placeholder="https://target.ottu.com/checkout/tok_live_..."
                            disabled={isSubmitting}
                            className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs focus:outline-none focus:ring-2 disabled:opacity-50 ${
                                urlError
                                    ? 'border-rose-500 focus:ring-rose-500/30'
                                    : 'border-slate-200 dark:border-slate-700 focus:ring-primary/30 focus:border-primary'
                            }`}
                            data-testid="custom-payment-url-input"
                        />
                        {urlError ? (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">{urlError}</p>
                        ) : (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                Enter a valid secure HTTP/HTTPS URL (Ottu, K-Net, MyFatoorah, or custom billing invoice).
                            </p>
                        )}
                    </div>

                    {/* Amount Input */}
                    <div>
                        <label htmlFor="amount" className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                            Amount ({currency}) <span className="text-slate-400 dark:text-slate-500 font-normal">(Optional / Prefilled)</span>
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.001"
                                min="0"
                                id="amount"
                                name="amount"
                                value={amount}
                                onChange={handleAmountChange}
                                onBlur={() => setAmountError(validateAmount(amount))}
                                placeholder="0.000"
                                disabled={isSubmitting}
                                className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs pe-14 focus:outline-none focus:ring-2 disabled:opacity-50 ${
                                    amountError
                                        ? 'border-rose-500 focus:ring-rose-500/30'
                                        : 'border-slate-200 dark:border-slate-700 focus:ring-primary/30 focus:border-primary'
                                }`}
                                data-testid="amount-input"
                            />
                            <div className="absolute inset-y-0 end-0 pe-3 flex items-center pointer-events-none text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                                {currency}
                            </div>
                        </div>
                        {amountError ? (
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1">{amountError}</p>
                        ) : (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                Prefilled from remaining balance or shipment total. Leave blank or adjust if sending partial settlement notice.
                            </p>
                        )}
                    </div>

                    {/* Template Preview Section */}
                    <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-200">
                                <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400">visibility</span>
                                <span>Template Preview</span>
                            </div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-200/80 dark:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                                payment_request_v1
                            </span>
                        </div>

                        {/* WhatsApp Message Bubble Simulation */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900/60 shadow-2xs space-y-2 text-xs text-slate-800 dark:text-slate-200 font-sans">
                            <div className="font-bold text-[11px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                                Target Logistics • Official Settlement
                            </div>
                            <p className="leading-relaxed whitespace-pre-wrap">
                                Hello <span className="font-bold text-slate-900 dark:text-white">{activeRecipientName}</span>, a payment of{' '}
                                <span className="font-extrabold text-emerald-700 dark:text-emerald-400">{previewAmountStr}</span> is requested for shipment{' '}
                                <span className="font-mono font-bold text-slate-900 dark:text-white">{effectiveTrackingNumber || 'TRG-XXXXXX'}</span>.
                                Please complete your settlement using the official secure link:{' '}
                                <span className="font-mono text-primary underline break-all">
                                    {customPaymentUrl.trim() || 'https://inbox.mawthook.io/pay/...'}
                                </span>.
                                Notice date: {todayFormatted}.
                            </p>
                            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400">
                                <span>12:00 PM</span>
                                <span className="material-symbols-outlined text-[13px] text-blue-500">done_all</span>
                            </div>
                        </div>
                    </div>

                    {/* Modal Actions */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white px-4 py-2 text-xs font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            data-testid="submit-payment-link-btn"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    <span>Dispatching...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-sm">send</span>
                                    <span>Dispatch Notice</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

ManualPaymentLinkModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onSuccess: PropTypes.func,
    shipment: PropTypes.object,
    trackingNumber: PropTypes.string,
    defaultRole: PropTypes.oneOf(['consignee', 'shipper', 'receiver', 'sender']),
    defaultAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

export default ManualPaymentLinkModal;
