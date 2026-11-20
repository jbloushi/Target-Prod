import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportChat } from '../../context/SupportChatContext';
import { MessageThread } from './MessageThread';
import { ReplyComposer } from './ReplyComposer';
import { CustomerContextPanel } from './CustomerContextPanel';

export const NativeChatDrawer = ({
    isOpen,
    onClose,
    phone,
    recipientName,
    trackingNumber,
    chatwootConversationId,
    conversationId,
    shipment,
    title
}) => {
    const { isRTL } = useLanguage();
    const location = useLocation();
    const isV2Route = location.pathname.includes('-v2') || location.pathname.includes('/v2');
    const {
        activeConversation,
        selectConversation,
        loadConversationByTrackingNumber,
        loadConversationByPhone
    } = useSupportChat();

    const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'context'
    const [draftText, setDraftText] = useState('');
    const [localLoading, setLocalLoading] = useState(false);
    const dialogRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    const effectiveConversationId = chatwootConversationId || conversationId || null;
    const effectiveTrackingNumber = trackingNumber || shipment?.trackingNumber || null;
    const effectivePhone = phone || shipment?.origin?.phone || shipment?.destination?.phone || shipment?.customerPhone || '';
    const displayName = recipientName || shipment?.origin?.contactPerson || shipment?.destination?.contactPerson || shipment?.customerName || title || 'Customer';

    // Auto-bind / select conversation when drawer opens
    const initDrawerConversation = useCallback(async () => {
        if (!isOpen) return;
        setLocalLoading(true);
        try {
            if (effectiveConversationId) {
                await selectConversation(Number(effectiveConversationId));
            } else if (effectiveTrackingNumber) {
                await loadConversationByTrackingNumber(effectiveTrackingNumber);
            } else if (effectivePhone) {
                await loadConversationByPhone(effectivePhone, { trackingNumber: effectiveTrackingNumber });
            }
        } catch (err) {
            console.error('[NativeChatDrawer] init error:', err);
        } finally {
            setLocalLoading(false);
        }
    }, [
        isOpen,
        effectiveConversationId,
        effectiveTrackingNumber,
        effectivePhone,
        selectConversation,
        loadConversationByTrackingNumber,
        loadConversationByPhone
    ]);

    useEffect(() => {
        initDrawerConversation();
    }, [initDrawerConversation]);

    // Keep keyboard focus inside the drawer and return it to the opener on close.
    useEffect(() => {
        if (!isOpen) return;
        previousActiveElementRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusTimer = setTimeout(() => {
            dialogRef.current?.querySelector('[data-testid="native-chat-drawer-close-btn"]')?.focus();
        }, 0);

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
                return;
            }
            if (e.key === 'Tab' && dialogRef.current) {
                const focusables = Array.from(dialogRef.current.querySelectorAll(focusableSelector))
                    .filter((element) => element.getAttribute('aria-hidden') !== 'true');
                if (focusables.length === 0) {
                    e.preventDefault();
                    return;
                }
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previousActiveElementRef.current?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={dialogRef}
            data-testid="native-chat-drawer"
            className="fixed inset-0 z-50 flex justify-end"
            role="dialog"
            aria-modal="true"
            aria-labelledby="native-chat-drawer-title"
        >
            {/* Backdrop */}
            <div
                data-testid="native-chat-drawer-backdrop"
                className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Slide-over Container (Zero iframes) */}
            <div className="relative w-full max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl z-10 flex flex-col border-s border-slate-200 dark:border-slate-800">
                {/* Drawer Header */}
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                            <span className="material-symbols-outlined text-xl">support_agent</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2
                                    id="native-chat-drawer-title"
                                    className="font-black text-sm text-slate-900 dark:text-white truncate"
                                >
                                    {displayName}
                                </h2>
                                {effectiveTrackingNumber && (
                                    <span
                                        dir="ltr"
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-primary/10 text-primary border border-primary/20"
                                    >
                                        {effectiveTrackingNumber}
                                    </span>
                                )}
                            </div>
                            {effectivePhone && (
                                <p dir="ltr" className="font-mono text-xs text-slate-500 dark:text-slate-400 font-semibold truncate">
                                    {effectivePhone}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Open directly in external Inbox Inbox (inbox.mawthook.io) */}
                        <a
                            href={
                                activeConversation?.id && !String(activeConversation.id).startsWith('local:')
                                    ? `https://inbox.mawthook.io/app/accounts/1/conversations/${activeConversation.id}`
                                    : effectivePhone
                                        ? `https://inbox.mawthook.io/app/accounts/1/contacts?page=1&search=${encodeURIComponent(effectivePhone)}`
                                        : 'https://inbox.mawthook.io'
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="native-chat-drawer-external-chatwoot-btn"
                            className="inline-flex items-center justify-center h-8 px-2.5 gap-1 rounded-xl border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-white font-bold transition-colors"
                            title={isRTL ? 'فتح في منصة Inbox (inbox.mawthook.io)' : 'Open in Inbox (inbox.mawthook.io)'}
                        >
                            <span className="material-symbols-outlined text-sm">forum</span>
                            <span className="hidden sm:inline text-[11px]">Inbox</span>
                        </a>

                        {/* Open in full Support Center button */}
                        {activeConversation?.id && (
                            <Link
                                to={isV2Route ? `/support-v2/${activeConversation.id}` : `/support/${activeConversation.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="native-chat-drawer-open-full-btn"
                                className="inline-flex items-center justify-center h-8 w-8 rounded-xl text-primary hover:bg-primary/10 transition-colors"
                                title={isRTL ? 'فتح في مركز الدعم الكامل' : 'Open in full Support Center'}
                            >
                                <span className="material-symbols-outlined text-base">open_in_new</span>
                            </Link>
                        )}

                        {/* Close button */}
                        <button
                            type="button"
                            data-testid="native-chat-drawer-close-btn"
                            onClick={onClose}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                            aria-label="Close"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>
                </div>

                {/* Subheader: Tab Switcher (Chat vs Logistics Info) */}
                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2 flex-wrap shrink-0">
                    <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700">
                        <button
                            type="button"
                            data-testid="native-chat-drawer-tab-chat"
                            onClick={() => setActiveTab('chat')}
                            aria-pressed={activeTab === 'chat'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                activeTab === 'chat'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">chat</span>
                            <span>{isRTL ? 'المحادثة الحية' : 'Live Chat'}</span>
                        </button>

                        <button
                            type="button"
                            data-testid="native-chat-drawer-tab-context"
                            onClick={() => setActiveTab('context')}
                            aria-pressed={activeTab === 'context'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                activeTab === 'context'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">local_shipping</span>
                            <span>{isRTL ? 'بيانات الشحنة والعميل' : 'Logistics & Actions'}</span>
                        </button>
                    </div>

                    {activeConversation?.id && (
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            #{activeConversation.id}
                        </span>
                    )}
                </div>

                {/* Drawer Body */}
                <div className="flex-1 flex flex-col overflow-hidden relative bg-white dark:bg-slate-900">
                    {localLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                            <span className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                {isRTL ? 'جاري ربط واسترجاع محادثة الشحنة...' : 'Connecting live shipment chat thread...'}
                            </p>
                        </div>
                    ) : activeTab === 'chat' ? (
                        <div className="flex-1 flex flex-col h-full overflow-hidden">
                            {/* Message Thread */}
                            <div
                                data-testid="native-chat-drawer-thread"
                                className="flex-1 overflow-y-auto"
                            >
                                <MessageThread
                                    conversation={activeConversation || {
                                        id: effectiveConversationId || 0,
                                        contact: { name: displayName, phone: effectivePhone },
                                        activeShipment: { trackingNumber: effectiveTrackingNumber }
                                    }}
                                />
                            </div>

                            {/* Reply Composer */}
                            <div
                                data-testid="native-chat-drawer-composer"
                                className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0"
                            >
                                <ReplyComposer
                                    conversation={activeConversation || {
                                        id: effectiveConversationId || 0,
                                        contact: { name: displayName, phone: effectivePhone },
                                        activeShipment: { trackingNumber: effectiveTrackingNumber }
                                    }}
                                    shipment={shipment || activeConversation?.activeShipment || { trackingNumber: effectiveTrackingNumber }}
                                    draftText={draftText}
                                    onDraftChange={setDraftText}
                                />
                            </div>
                        </div>
                    ) : (
                        /* Logistics Context Tab */
                        <div className="flex-1 overflow-y-auto">
                            <CustomerContextPanel
                                conversation={activeConversation || {
                                    id: effectiveConversationId || 0,
                                    contact: { name: displayName, phone: effectivePhone },
                                    activeShipment: { trackingNumber: effectiveTrackingNumber }
                                }}
                                shipment={shipment || activeConversation?.activeShipment || { trackingNumber: effectiveTrackingNumber }}
                                onSelectQuickReply={(text) => {
                                    setDraftText(text);
                                    setActiveTab('chat');
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

NativeChatDrawer.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    phone: PropTypes.string,
    recipientName: PropTypes.string,
    trackingNumber: PropTypes.string,
    chatwootConversationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    conversationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    accountId: PropTypes.string,
    shipment: PropTypes.object,
    title: PropTypes.string
};

export default NativeChatDrawer;
