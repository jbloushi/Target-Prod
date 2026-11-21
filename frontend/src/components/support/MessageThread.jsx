import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportChat } from '../../context/SupportChatContext';

export const MessageThread = ({ conversation, onToggleContext }) => {
    const { isRTL } = useLanguage();
    const location = useLocation();
    const isV2Route = location.pathname.includes('-v2') || location.pathname.includes('/v2');
    const {
        messages,
        windowStatus,
        loadingMessages,
        toggleConversationStatus
    } = useSupportChat();

    const messagesContainerRef = useRef(null);
    const shouldStickToBottomRef = useRef(true);

    useEffect(() => {
        shouldStickToBottomRef.current = true;
    }, [conversation?.id]);

    // Scroll only the message list. scrollIntoView can move the entire page and footer.
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (shouldStickToBottomRef.current && container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [messages]);

    const activeConv = conversation;

    if (!activeConv) {
        return (
            <div
                data-testid="message-thread-empty"
                className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900"
            >
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-3 text-primary">
                    <span className="material-symbols-outlined text-3xl">chat</span>
                </div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    {isRTL ? 'اختر محادثة لبدء المراسلة' : 'Select a conversation to start chatting'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mt-1">
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
        <div data-testid="message-thread-pane" className="flex-1 flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
            {/* Thread Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex items-center justify-between gap-2 flex-wrap shrink-0">
                {/* Contact info & Active shipment */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary border border-primary/20 flex items-center justify-center font-bold text-sm shrink-0">
                        {(activeConv.contact?.name || 'C').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                {activeConv.contact?.name || 'Customer'}
                            </h2>
                            {activeConv.contact?.role && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {activeConv.contact.role}
                                </span>
                            )}
                            {activeConv.status === 'resolved' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    {isRTL ? 'مغلقة' : 'Resolved'}
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                                    {isRTL ? 'مفتوحة' : 'Open'}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
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
                                        href={isV2Route ? '/shipments-v2' : '/shipments'}
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
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {/* 24-Hour Customer Service Window Indicator */}
                    {windowStatus.inside24hWindow ? (
                        <div
                            data-testid="window-active-badge"
                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] py-1 px-2.5 shadow-2xs"
                            title={isRTL ? 'النافذة نشطة: مسموح بالرد الحر' : 'Inside 24-hour window: Free text allowed'}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>
                                {isRTL ? 'نافذة الـ 24 ساعة نشطة' : '24h Active'}: {formatRemainingTime(windowStatus.remainingSeconds)}
                            </span>
                        </div>
                    ) : (
                        <div
                            data-testid="window-expired-badge"
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-bold text-[11px] py-1 px-2.5 shadow-2xs"
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
                        className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-bold transition-colors"
                    >
                        {activeConv.status === 'open' ? (isRTL ? 'إغلاق المحادثة' : 'Resolve') : (isRTL ? 'إعادة فتح' : 'Reopen')}
                    </button>

                    {/* Toggle Context Panel for tablet/mobile */}
                    {onToggleContext && (
                        <button
                            type="button"
                            onClick={onToggleContext}
                            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white lg:hidden transition-colors"
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
                ref={messagesContainerRef}
                onScroll={(event) => {
                    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
                    shouldStickToBottomRef.current = scrollHeight - scrollTop - clientHeight < 120;
                }}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/60"
            >
                {loadingMessages && messages.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                        <span className="inline-block w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">{isRTL ? 'جارٍ تحميل الرسائل...' : 'Loading messages...'}</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-1">
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
                                    className="mx-auto max-w-lg p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/70 dark:border-amber-700/50 text-amber-900 dark:text-amber-200 space-y-1 shadow-2xs"
                                >
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold flex-wrap">
                                        <span className="material-symbols-outlined text-sm">lock</span>
                                        <span>{isRTL ? 'ملاحظة داخلية خاصة بفريق العمل (لا تظهر للعميل)' : 'Internal Staff Note (Hidden from Customer)'}</span>
                                        <span className="ms-auto text-[10px] font-mono opacity-60">
                                            {formatMessageTime(msg.createdAt)}
                                        </span>
                                    </div>
                                    <p className="text-[11px] font-semibold">{msg.sender?.name || (isRTL ? 'فريق العمل' : 'Staff')}</p>
                                    <p className="text-xs whitespace-pre-wrap break-words">{msg.content}</p>
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
                                    <div className="max-w-md w-full rounded-2xl p-4 bg-primary/10 dark:bg-primary/15 border border-primary/30 shadow-sm space-y-2.5">
                                        {/* Template Card Header */}
                                        <div className="flex items-center justify-between gap-2 border-b border-primary/20 pb-2">
                                            <div className="flex items-center gap-1.5 text-primary font-bold text-xs min-w-0">
                                                <span className="material-symbols-outlined text-base shrink-0">verified</span>
                                                <span className="font-mono text-[11px] truncate">{msg.templateName || 'Meta Utility Template'}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
                                                {formatMessageTime(msg.createdAt)}
                                            </span>
                                        </div>

                                        {/* Template Content */}
                                        <p className="text-[13px] text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed font-medium">
                                            {msg.content}
                                        </p>

                                        {/* Interactive Quick Action Buttons if template parameters contain URLs */}
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {activeConv.activeShipment?.trackingNumber && (
                                                <a
                                                    href={`/track/${encodeURIComponent(activeConv.activeShipment.trackingNumber)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-primary/30 bg-white dark:bg-slate-900 text-primary hover:bg-primary hover:text-white text-[10px] font-bold transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-xs">location_searching</span>
                                                    <span>{isRTL ? 'تتبع الشحنة' : 'Track'}</span>
                                                </a>
                                            )}
                                            {activeConv.activeShipment?.locationToken && (
                                                <a
                                                    href={`/location#${encodeURIComponent(activeConv.activeShipment.locationToken)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-[10px] font-bold transition-colors"
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
                                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                                        {(msg.sender?.name || 'C').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="space-y-1 min-w-0">
                                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-ss-xs p-3 shadow-2xs">
                                            <p className="text-[13px] text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed break-words">
                                                {msg.content}
                                            </p>
                                        </div>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 ps-2 font-mono">
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
                                    <div className="bg-primary text-white rounded-2xl rounded-se-xs p-3 shadow-sm">
                                        <p className="text-[13px] whitespace-pre-wrap leading-relaxed break-words">
                                            {msg.content}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 pe-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                        <span>{formatMessageTime(msg.createdAt)}</span>
                                        <span className="material-symbols-outlined text-xs text-primary">done_all</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

MessageThread.propTypes = {
    conversation: PropTypes.object,
    onToggleContext: PropTypes.func
};

export default MessageThread;
