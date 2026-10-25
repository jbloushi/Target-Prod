import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportChat } from '../../context/SupportChatContext';

export const MessageThread = ({ conversation, onToggleContext }) => {
    const { isRTL } = useLanguage();
    const {
        messages,
        windowStatus,
        loadingMessages,
        toggleConversationStatus
    } = useSupportChat();

    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom when messages update
    useEffect(() => {
        if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const activeConv = conversation;

    if (!activeConv) {
        return (
            <div
                data-testid="message-thread-empty"
                className="flex-1 flex flex-col items-center justify-center p-8 text-center text-base-content/50 bg-base-100"
            >
                <div className="w-16 h-16 rounded-2xl bg-base-200 flex items-center justify-center mb-3 text-primary">
                    <span className="material-symbols-outlined text-3xl">chat</span>
                </div>
                <h3 className="font-bold text-sm text-base-content">
                    {isRTL ? 'اختر محادثة لبدء المراسلة' : 'Select a conversation to start chatting'}
                </h3>
                <p className="text-xs text-base-content/60 max-w-xs mt-1">
                    {isRTL
                        ? 'يمكنك الرد بالنصوص الحرة خلال 24 ساعة من آخر رسالة للعميل أو باستخدام قوالب ميتا المعتمدة.'
                        : 'Reply with free text within 24 hours of customer message or using approved Meta utility templates.'}
                </p>
            </div>
        );
    }

    const formatRemainingTime = (seconds) => {
        if (!seconds || seconds <= 0) return '0m';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    const formatMessageTime = (dateVal) => {
        if (!dateVal) return '';
        try {
            const d = typeof dateVal === 'number'
                ? new Date(dateVal < 1e12 ? dateVal * 1000 : dateVal)
                : new Date(dateVal);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            return '';
        }
    };

    const handleCopyPhone = () => {
        if (activeConv.contact?.phone && navigator.clipboard) {
            navigator.clipboard.writeText(activeConv.contact.phone);
        }
    };

    const handleStatusToggle = () => {
        const nextStatus = activeConv.status === 'open' ? 'resolved' : 'open';
        toggleConversationStatus(activeConv.id, nextStatus);
    };

    return (
        <div data-testid="message-thread-pane" className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
            {/* Thread Header */}
            <div className="px-4 py-3 border-b border-base-200 bg-base-100/90 backdrop-blur-sm flex items-center justify-between gap-3 shrink-0">
                {/* Contact info & Active shipment */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                        {(activeConv.contact?.name || 'C').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="font-bold text-sm text-base-content truncate">
                                {activeConv.contact?.name || 'Customer'}
                            </h2>
                            {activeConv.contact?.role && (
                                <span className="badge badge-ghost badge-xs text-[10px] font-mono uppercase">
                                    {activeConv.contact.role}
                                </span>
                            )}
                            {activeConv.status === 'resolved' ? (
                                <span className="badge badge-neutral badge-xs font-bold text-[10px]">
                                    {isRTL ? 'مغلقة' : 'Resolved'}
                                </span>
                            ) : (
                                <span className="badge badge-success badge-xs font-bold text-[10px]">
                                    {isRTL ? 'مفتوحة' : 'Open'}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-base-content/70 mt-0.5 flex-wrap">
                            {activeConv.contact?.phone && (
                                <button
                                    type="button"
                                    onClick={handleCopyPhone}
                                    className="font-mono text-[11px] hover:text-primary transition-colors flex items-center gap-1"
                                    title="Copy phone"
                                    dir="ltr"
                                >
                                    <span>{activeConv.contact.phone}</span>
                                    <span className="material-symbols-outlined text-[13px] opacity-60">content_copy</span>
                                </button>
                            )}

                            {activeConv.activeShipment?.trackingNumber && (
                                <>
                                    <span>•</span>
                                    <a
                                        href={`/shipments`}
                                        className="font-mono text-[11px] text-primary font-bold hover:underline"
                                    >
                                        {activeConv.activeShipment.trackingNumber}
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right controls: 24h Window Badge + Status Action + Mobile Context toggle */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* 24-Hour Customer Service Window Indicator */}
                    {windowStatus.inside24hWindow ? (
                        <div
                            data-testid="window-active-badge"
                            className="badge badge-success badge-sm gap-1.5 font-bold text-[11px] py-2 px-2.5 shadow-xs"
                            title={isRTL ? 'النافذة نشطة: مسموح بالرد الحر' : 'Inside 24-hour window: Free text allowed'}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span>
                                {isRTL ? 'نافذة الـ 24 ساعة نشطة' : '24h Active'}: {formatRemainingTime(windowStatus.remainingSeconds)}
                            </span>
                        </div>
                    ) : (
                        <div
                            data-testid="window-expired-badge"
                            className="badge badge-warning badge-sm gap-1 font-bold text-[11px] py-2 px-2.5 shadow-xs"
                            title={isRTL ? 'انتهت النافذة: يلزم إرسال قالب ميتا معتمد' : '24h Window Expired: Approved Meta templates required'}
                        >
                            <span className="material-symbols-outlined text-xs">warning</span>
                            <span>{isRTL ? 'انتهت الـ 24 ساعة (قوالب فقط)' : '24h Expired (Templates Only)'}</span>
                        </div>
                    )}

                    {/* Resolve / Reopen button */}
                    <button
                        type="button"
                        data-testid="toggle-status-btn"
                        onClick={handleStatusToggle}
                        className="btn btn-xs btn-outline rounded-lg font-bold"
                    >
                        {activeConv.status === 'open' ? (isRTL ? 'إغلاق المحادثة' : 'Resolve') : (isRTL ? 'إعادة فتح' : 'Reopen')}
                    </button>

                    {/* Toggle Context Panel for tablet/mobile */}
                    {onToggleContext && (
                        <button
                            type="button"
                            onClick={onToggleContext}
                            className="btn btn-xs btn-ghost btn-square text-base-content/70 lg:hidden"
                            title="Toggle Logistics Context"
                        >
                            <span className="material-symbols-outlined text-lg">info</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Messages Scroll Area */}
            <div
                data-testid="messages-stream"
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-base-200/40"
            >
                {loadingMessages && messages.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                        <span className="loading loading-spinner loading-sm text-primary" />
                        <p className="text-xs text-base-content/60">{isRTL ? 'جارٍ تحميل الرسائل...' : 'Loading messages...'}</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="p-8 text-center text-base-content/50 space-y-1">
                        <p className="text-xs font-semibold">{isRTL ? 'لا توجد رسائل سابقة في هذه المحادثة' : 'No messages in this conversation yet'}</p>
                    </div>
                ) : (
                    messages.map((msg, index) => {
                        const isIncoming = msg.messageType === 'incoming';
                        const isPrivate = msg.private || msg.messageType === 'note';
                        const isTemplate = msg.isTemplate;

                        // 1. Private Staff Note
                        if (isPrivate) {
                            return (
                                <div
                                    key={msg.id || index}
                                    data-testid={`message-note-${msg.id || index}`}
                                    className="mx-auto max-w-lg p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1 shadow-xs"
                                >
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold">
                                        <span className="material-symbols-outlined text-sm">lock</span>
                                        <span>{isRTL ? 'ملاحظة داخلية خاصة بفريق العمل (لا تظهر للعميل)' : 'Internal Staff Note (Hidden from Customer)'}</span>
                                        <span className="ms-auto text-[10px] font-mono opacity-60">
                                            {formatMessageTime(msg.createdAt)}
                                        </span>
                                    </div>
                                    <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            );
                        }

                        // 2. Meta Approved Utility Template Card
                        if (isTemplate) {
                            return (
                                <div
                                    key={msg.id || index}
                                    data-testid={`message-template-${msg.id || index}`}
                                    data-message-type="template"
                                    className="flex justify-end"
                                >
                                    <div className="max-w-md w-full rounded-2xl p-4 bg-primary/10 border-2 border-primary/30 shadow-sm space-y-2.5">
                                        {/* Template Card Header */}
                                        <div className="flex items-center justify-between gap-2 border-b border-primary/20 pb-2">
                                            <div className="flex items-center gap-1.5 text-primary font-bold text-xs">
                                                <span className="material-symbols-outlined text-base">verified</span>
                                                <span className="font-mono text-[11px]">{msg.templateName || 'Meta Utility Template'}</span>
                                            </div>
                                            <span className="text-[10px] text-base-content/60 font-mono">
                                                {formatMessageTime(msg.createdAt)}
                                            </span>
                                        </div>

                                        {/* Template Content */}
                                        <p className="text-xs text-base-content whitespace-pre-wrap leading-relaxed font-medium">
                                            {msg.content}
                                        </p>

                                        {/* Interactive Quick Action Buttons if template parameters contain URLs */}
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {activeConv.activeShipment?.trackingNumber && (
                                                <a
                                                    href={`/track/${encodeURIComponent(activeConv.activeShipment.trackingNumber)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-xs btn-outline btn-primary rounded-lg text-[10px] font-bold gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-xs">location_searching</span>
                                                    <span>{isRTL ? 'تتبع الشحنة' : 'Track'}</span>
                                                </a>
                                            )}
                                            {activeConv.activeShipment?.locationToken && (
                                                <a
                                                    href={`/location/${activeConv.activeShipment.locationToken}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-xs btn-outline btn-success rounded-lg text-[10px] font-bold gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-xs">pin_drop</span>
                                                    <span>{isRTL ? 'تحديد الموقع' : 'Location Pin'}</span>
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // 3. Customer Incoming Message Bubble
                        if (isIncoming) {
                            return (
                                <div
                                    key={msg.id || index}
                                    data-testid={`message-incoming-${msg.id || index}`}
                                    className="flex items-start gap-2 max-w-lg"
                                >
                                    <div className="w-8 h-8 rounded-xl bg-base-300 text-base-content flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                                        {(msg.sender?.name || 'C').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="bg-base-100 dark:bg-slate-800 border border-base-300 rounded-2xl rounded-ss-xs p-3 shadow-xs">
                                            <p className="text-xs text-base-content whitespace-pre-wrap leading-relaxed">
                                                {msg.content}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-base-content/50 ps-2 font-mono">
                                            {formatMessageTime(msg.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            );
                        }

                        // 4. Agent Outbound Free-Text Message Bubble
                        return (
                            <div
                                key={msg.id || index}
                                data-testid={`message-outgoing-${msg.id || index}`}
                                className="flex justify-end"
                            >
                                <div className="max-w-lg space-y-1 items-end flex flex-col">
                                    <div className="bg-primary text-primary-content rounded-2xl rounded-se-xs p-3 shadow-sm">
                                        <p className="text-xs whitespace-pre-wrap leading-relaxed">
                                            {msg.content}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 pe-2 text-[10px] text-base-content/50 font-mono">
                                        <span>{formatMessageTime(msg.createdAt)}</span>
                                        <span className="material-symbols-outlined text-xs text-primary">done_all</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

MessageThread.propTypes = {
    conversation: PropTypes.object,
    onToggleContext: PropTypes.func
};

export default MessageThread;
