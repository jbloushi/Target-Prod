import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * ChatwootConversationDrawer
 * 
 * Reusable slide-over drawer embedding the Chatwoot live support inbox for a shipment.
 * Embeds the direct conversation thread if `chatwootConversationId` is present,
 * or displays a fallback card with a 1-click contact search button if absent.
 */
export const ChatwootConversationDrawer = ({
    isOpen,
    onClose,
    accountId = '1',
    chatwootConversationId,
    phone,
    recipientName,
    trackingNumber,
    // Optional aliases for flexible caller integration
    conversationId,
    title
}) => {
    const [iframeLoading, setIframeLoading] = useState(true);

    const effectiveConversationId = chatwootConversationId || conversationId || null;
    const effectiveAccountId = accountId || '1';
    const cleanPhone = (phone || '').trim();

    // Reset iframe loading state when conversation ID changes or drawer opens
    useEffect(() => {
        if (isOpen && effectiveConversationId) {
            setIframeLoading(true);
        }
    }, [isOpen, effectiveConversationId]);

    // Handle Escape key to close drawer
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const conversationUrl = effectiveConversationId
        ? `https://inbox.mawthook.io/app/accounts/${effectiveAccountId}/conversations/${effectiveConversationId}`
        : null;

    const fallbackUrl = `https://inbox.mawthook.io/app/accounts/${effectiveAccountId}/contacts?q=${encodeURIComponent(cleanPhone)}`;

    const activeExternalUrl = conversationUrl || fallbackUrl;

    return (
        <div 
            className="fixed inset-0 z-50 flex justify-end"
            data-testid="chatwoot-conversation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chatwoot-drawer-title"
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                data-testid="chatwoot-drawer-backdrop"
                aria-hidden="true"
            />

            {/* Slide-over Container */}
            <div className="relative w-full max-w-2xl lg:max-w-3xl bg-base-100 h-full shadow-2xl z-10 flex flex-col border-s border-base-200 animate-in slide-in-from-right duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-base-200 bg-base-100/90 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xl">support_agent</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 
                                    id="chatwoot-drawer-title"
                                    className="font-mono text-sm sm:text-base font-black text-primary truncate"
                                >
                                    {trackingNumber || title || 'Chatwoot Support'}
                                </h2>
                                {effectiveConversationId ? (
                                    <span className="badge badge-primary badge-xs font-mono font-bold">
                                        Thread #{effectiveConversationId}
                                    </span>
                                ) : (
                                    <span className="badge badge-warning badge-xs font-bold">
                                        No Thread
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-base-content/70 truncate mt-0.5">
                                {recipientName && (
                                    <span className="font-semibold truncate">{recipientName}</span>
                                )}
                                {recipientName && cleanPhone && <span>•</span>}
                                {cleanPhone && (
                                    <span className="font-mono text-[11px]" dir="ltr">{cleanPhone}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Header Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        <a
                            href={activeExternalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-ghost btn-square text-base-content/70 hover:text-primary hover:bg-primary/10"
                            title="Open in new tab"
                            aria-label="Open Chatwoot in new tab"
                            data-testid="chatwoot-open-new-tab-btn"
                        >
                            <span className="material-symbols-outlined text-lg">open_in_new</span>
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-sm btn-ghost btn-square text-base-content/70 hover:text-error hover:bg-error/10"
                            aria-label="Close drawer"
                            data-testid="chatwoot-drawer-close-btn"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 relative bg-base-200/40 overflow-hidden flex flex-col">
                    {effectiveConversationId ? (
                        <div className="relative w-full h-full flex flex-col">
                            {/* Loading Indicator */}
                            {iframeLoading && (
                                <div 
                                    className="absolute inset-0 flex flex-col items-center justify-center bg-base-100 z-10 space-y-3"
                                    data-testid="chatwoot-iframe-loading"
                                >
                                    <span className="loading loading-spinner loading-lg text-primary" />
                                    <p className="text-xs font-semibold text-base-content/60">
                                        Connecting to Chatwoot Conversation #{effectiveConversationId}...
                                    </p>
                                </div>
                            )}

                            {/* Embedded Iframe */}
                            <iframe
                                src={conversationUrl}
                                title={`Chatwoot Conversation ${effectiveConversationId}`}
                                className="w-full h-full border-0 flex-1"
                                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                                allow="camera; microphone; clipboard-read; clipboard-write; fullscreen"
                                onLoad={() => setIframeLoading(false)}
                                data-testid="chatwoot-iframe"
                            />

                            {/* Safety Fallback Footer */}
                            <div className="px-4 py-2 border-t border-base-200 bg-base-100/90 text-[11px] text-base-content/60 flex items-center justify-between">
                                <span>Powered by Chatwoot Live Support</span>
                                <a 
                                    href={conversationUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="link link-primary font-bold inline-flex items-center gap-1"
                                >
                                    <span>Direct View</span>
                                    <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                </a>
                            </div>
                        </div>
                    ) : (
                        /* Fallback Card when no chatwootConversationId is present */
                        <div 
                            className="flex-1 flex items-center justify-center p-6"
                            data-testid="chatwoot-fallback-card"
                        >
                            <div className="max-w-md w-full bg-base-100 rounded-2xl border border-base-200 shadow-lg p-6 sm:p-8 text-center space-y-5">
                                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 mx-auto flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl">forum</span>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-base sm:text-lg font-black text-base-content">
                                        No existing conversation thread found for this shipment
                                    </h3>
                                    <p className="text-xs text-base-content/60 leading-relaxed">
                                        An active live chat conversation thread has not yet been linked to shipment{' '}
                                        <span className="font-mono font-bold text-primary">{trackingNumber || 'record'}</span>.
                                        You can locate the customer directly in Chatwoot Contacts by phone number.
                                    </p>
                                </div>

                                {cleanPhone && (
                                    <div className="p-3 bg-base-200/50 rounded-xl border border-base-200 text-xs flex items-center justify-between">
                                        <span className="text-base-content/60 font-semibold">Contact Phone:</span>
                                        <span className="font-mono font-bold text-base-content" dir="ltr">{cleanPhone}</span>
                                    </div>
                                )}

                                <div className="pt-2 space-y-2">
                                    <a
                                        href={fallbackUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-primary w-full rounded-xl font-bold gap-2 shadow-sm"
                                        data-testid="chatwoot-fallback-search-btn"
                                    >
                                        <span className="material-symbols-outlined text-lg">search</span>
                                        <span>Search Contact in Chatwoot</span>
                                    </a>

                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="btn btn-ghost btn-sm w-full text-base-content/60"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

ChatwootConversationDrawer.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    accountId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    chatwootConversationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    phone: PropTypes.string,
    recipientName: PropTypes.string,
    trackingNumber: PropTypes.string,
    conversationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string
};

export default ChatwootConversationDrawer;
