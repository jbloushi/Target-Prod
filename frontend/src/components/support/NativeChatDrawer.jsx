import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
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
    const {
        activeConversation,
        selectConversation,
        loadConversationByTrackingNumber,
        loadConversationByPhone
    } = useSupportChat();

    const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'context'
    const [draftText, setDraftText] = useState('');
    const [localLoading, setLocalLoading] = useState(false);

    const effectiveConversationId = chatwootConversationId || conversationId || null;
    const effectiveTrackingNumber = trackingNumber || shipment?.trackingNumber || null;
    const effectivePhone = phone || shipment?.destination?.phone || shipment?.customerPhone || '';
    const displayName = recipientName || shipment?.destination?.contactPerson || shipment?.customerName || title || 'Customer';

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

    // Handle Escape key
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

    return (
        <div
            data-testid="native-chat-drawer"
            className="fixed inset-0 z-50 flex justify-end"
            role="dialog"
            aria-modal="true"
            aria-labelledby="native-chat-drawer-title"
        >
            {/* Backdrop */}
            <div
                data-testid="native-chat-drawer-backdrop"
                className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Slide-over Container (Zero iframes) */}
            <div className="relative w-full max-w-xl lg:max-w-2xl bg-base-100 h-full shadow-2xl z-10 flex flex-col border-s border-base-200">
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-base-200 bg-base-100/90 backdrop-blur-sm shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                            <span className="material-symbols-outlined text-xl">support_agent</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2
                                    id="native-chat-drawer-title"
                                    className="font-black text-sm text-base-content truncate"
                                >
                                    {displayName}
                                </h2>
                                {effectiveTrackingNumber && (
                                    <span
                                        dir="ltr"
                                        className="badge badge-primary badge-xs font-mono font-bold"
                                    >
                                        {effectiveTrackingNumber}
                                    </span>
                                )}
                            </div>
                            {effectivePhone && (
                                <p dir="ltr" className="font-mono text-xs text-base-content/60 font-semibold">
                                    {effectivePhone}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* Open directly in external Chatwoot Inbox (inbox.mawthook.io) */}
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
                            className="btn btn-outline btn-primary btn-xs h-8 px-2.5 gap-1 font-bold"
                            title={isRTL ? 'فتح في منصة Chatwoot (inbox.mawthook.io)' : 'Open in Chatwoot (inbox.mawthook.io)'}
                        >
                            <span className="material-symbols-outlined text-sm">forum</span>
                            <span className="hidden sm:inline text-[11px]">Chatwoot</span>
                        </a>

                        {/* Open in full Support Center button */}
                        {activeConversation?.id && (
                            <Link
                                to={`/support/${activeConversation.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="native-chat-drawer-open-full-btn"
                                className="btn btn-ghost btn-xs btn-square h-8 w-8 text-primary hover:bg-primary/10"
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
                            className="btn btn-ghost btn-xs btn-square h-8 w-8 text-base-content/70 hover:text-base-content"
                            aria-label="Close"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>
                </div>

                {/* Subheader: Tab Switcher (Chat vs Logistics Info) */}
                <div className="px-4 py-2 border-b border-base-200 bg-base-200/40 flex items-center justify-between shrink-0">
                    <div className="join">
                        <button
                            type="button"
                            data-testid="native-chat-drawer-tab-chat"
                            onClick={() => setActiveTab('chat')}
                            className={`join-item btn btn-xs font-bold gap-1 ${
                                activeTab === 'chat' ? 'btn-primary' : 'btn-ghost'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">chat</span>
                            <span>{isRTL ? 'المحادثة الحية' : 'Live Chat'}</span>
                        </button>

                        <button
                            type="button"
                            data-testid="native-chat-drawer-tab-context"
                            onClick={() => setActiveTab('context')}
                            className={`join-item btn btn-xs font-bold gap-1 ${
                                activeTab === 'context' ? 'btn-primary' : 'btn-ghost'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">local_shipping</span>
                            <span>{isRTL ? 'بيانات الشحنة والعميل' : 'Logistics & Actions'}</span>
                        </button>
                    </div>

                    {activeConversation?.id && (
                        <span className="text-[11px] font-mono text-base-content/50">
                            #{activeConversation.id}
                        </span>
                    )}
                </div>

                {/* Drawer Body */}
                <div className="flex-1 flex flex-col overflow-hidden relative bg-base-100">
                    {localLoading ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                            <span className="loading loading-spinner loading-md text-primary mb-2" />
                            <p className="text-xs text-base-content/60 font-medium">
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
                                className="border-t border-base-200 bg-base-100 shrink-0"
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
