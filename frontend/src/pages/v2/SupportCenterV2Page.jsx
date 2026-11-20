import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportChat } from '../../context/SupportChatContext';
import { ConversationList } from '../../components/support/ConversationList';
import { MessageThread } from '../../components/support/MessageThread';
import { ReplyComposer } from '../../components/support/ReplyComposer';
import { CustomerContextPanel } from '../../components/support/CustomerContextPanel';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';

export const SupportCenterV2Page = () => {
    const { isRTL } = useLanguage();
    const navigate = useNavigate();
    const { conversationId: routeConversationId } = useParams();
    const [searchParams] = useSearchParams();

    const {
        conversations,
        activeConversation,
        selectConversation,
        loadConversations,
        loadConversationByTrackingNumber,
        loadConversationByPhone,
        loadingConversations
    } = useSupportChat();

    const [draftText, setDraftText] = useState('');
    const [mobileView, setMobileView] = useState('list');
    const [showContextPanel, setShowContextPanel] = useState(true);
    const [syncError, setSyncError] = useState(null);
    const currentSelectedRouteIdRef = useRef(null);

    useEffect(() => {
        const tracking = searchParams.get('trackingNumber') || searchParams.get('tracking');
        const phone = searchParams.get('phone');
        setSyncError(null);

        if (routeConversationId) {
            const numId = Number(routeConversationId);
            if (currentSelectedRouteIdRef.current !== numId) {
                currentSelectedRouteIdRef.current = numId;
                Promise.resolve(selectConversation(numId)).catch((err) => {
                    setSyncError(err?.message || (isRTL ? 'تعذر فتح المحادثة.' : 'Failed to open conversation.'));
                });
            }
            setMobileView('thread');
        } else if (tracking) {
            currentSelectedRouteIdRef.current = null;
            loadConversationByTrackingNumber(tracking)
                .then((conv) => {
                    if (conv) setMobileView('thread');
                })
                .catch((err) => {
                    setSyncError(err?.message || (isRTL ? 'تعذر ربط محادثة الشحنة.' : 'Failed to load shipment conversation.'));
                });
        } else if (phone) {
            currentSelectedRouteIdRef.current = null;
            loadConversationByPhone(phone, { trackingNumber: tracking })
                .then((conv) => {
                    if (conv) setMobileView('thread');
                })
                .catch((err) => {
                    setSyncError(err?.message || (isRTL ? 'تعذر تحميل محادثة الرقم.' : 'Failed to load conversation by phone.'));
                });
        } else {
            currentSelectedRouteIdRef.current = null;
        }
    }, [
        isRTL,
        loadConversationByPhone,
        loadConversationByTrackingNumber,
        routeConversationId,
        searchParams,
        selectConversation
    ]);

    const handleSelectConversation = (conv) => {
        if (!conv) return;
        navigate(`/support-v2/${conv.id}`, { replace: true });
        setMobileView('thread');
    };

    const handleQuickReply = (text) => {
        setDraftText(text);
        if (mobileView === 'context') {
            setMobileView('thread');
        }
    };

    const handleRefresh = async () => {
        setSyncError(null);
        try {
            await loadConversations?.();
        } catch (err) {
            setSyncError(err?.message || (isRTL ? 'فشل تحديث المحادثات.' : 'Failed to refresh conversations.'));
        }
    };

    return (
        <div
            data-testid="support-center-v2-page"
            className="w-full min-h-[calc(100dvh-64px)] lg:h-[calc(100dvh-64px)] flex flex-col bg-slate-50 dark:bg-slate-950 overflow-x-hidden"
        >
            {/* V1 <-> V2 Switcher Banner */}
            <div className="px-3 sm:px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5 shrink-0">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                        {isRTL ? 'مركز الدعم V2' : 'Support Center V2'}
                    </span>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                        {isRTL
                            ? 'المحادثات الموحدة وسياق الشحنات الفوري'
                            : 'Omnichannel support inbox with live shipment context'}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
                    <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <Link
                            to="/dashboard-v2"
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                        >
                            {isRTL ? 'لوحة القيادة V2' : 'Dashboard V2'}
                        </Link>
                        <Link
                            to="/shipments-v2"
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
                        >
                            {isRTL ? 'الشحنات V2' : 'Shipments V2'}
                        </Link>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={loadingConversations}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">refresh</span>
                            <span className="hidden sm:inline">{isRTL ? 'تحديث' : 'Refresh'}</span>
                        </button>
                        <Link
                            to={routeConversationId ? `/support/${routeConversationId}` : '/support'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{isRTL ? 'العودة إلى V1' : 'Switch to V1 Standard'}</span>
                        </Link>
                    </div>
                </div>
            </div>

            {syncError && (
                <div className="px-4 pt-3 shrink-0">
                    <ErrorBannerV2
                        message={syncError}
                        onRetry={handleRefresh}
                        isRetrying={loadingConversations}
                    />
                </div>
            )}

            {/* Compact navigation for phones; tablet keeps inbox and thread side by side. */}
            <div className="2xl:hidden px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 shrink-0">
                {mobileView !== 'list' && (
                    <button
                        type="button"
                        onClick={() => setMobileView('list')}
                        aria-pressed={mobileView === 'list'}
                        aria-label={isRTL ? 'العودة للقائمة' : 'Back to conversations'}
                        className="p-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">
                            {isRTL ? 'arrow_forward' : 'arrow_back'}
                        </span>
                    </button>
                )}
                <div className="grid grid-cols-3 gap-1 flex-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setMobileView('list')}
                        className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            mobileView === 'list'
                                ? 'bg-primary text-white'
                                : 'text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        <span className="material-symbols-outlined text-xs" aria-hidden="true">forum</span>
                        <span>{isRTL ? 'المحادثات' : 'Chats'}</span>
                    </button>
                    <button
                        type="button"
                        disabled={!activeConversation}
                        onClick={() => setMobileView('thread')}
                        aria-pressed={mobileView === 'thread'}
                        className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer ${
                            mobileView === 'thread'
                                ? 'bg-primary text-white'
                                : 'text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        <span className="material-symbols-outlined text-xs" aria-hidden="true">chat</span>
                        <span>{isRTL ? 'الرسائل' : 'Thread'}</span>
                    </button>
                    <button
                        type="button"
                        disabled={!activeConversation}
                        onClick={() => { setShowContextPanel(true); setMobileView('context'); }}
                        aria-pressed={mobileView === 'context'}
                        className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 cursor-pointer ${
                            mobileView === 'context'
                                ? 'bg-primary text-white'
                                : 'text-slate-600 dark:text-slate-300'
                        }`}
                    >
                        <span className="material-symbols-outlined text-xs" aria-hidden="true">local_shipping</span>
                        <span>{isRTL ? 'الشحنات' : 'Logistics'}</span>
                    </button>
                </div>
            </div>

            {/* Two panes on tablet/laptop; shipment context joins as a third pane on wide screens. */}
            <div className="relative flex-1 flex min-h-0 overflow-hidden">
                {/* Pane 1: Conversations */}
                <div
                    className={`w-full lg:w-72 xl:w-80 2xl:w-80 shrink-0 h-full border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${
                        mobileView === 'list' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
                    }`}
                >
                    <ConversationList onSelectConversation={handleSelectConversation} />
                </div>

                {/* Pane 2: Thread & Composer */}
                <div
                    className={`flex-1 min-w-0 flex-col h-full overflow-hidden bg-white dark:bg-slate-950 ${
                        mobileView === 'thread' ? 'flex' : 'hidden lg:flex'
                    }`}
                >
                    {activeConversation ? (
                        <>
                            <div className="flex items-center justify-end px-3 sm:px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 2xl:hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowContextPanel((prev) => !prev)}
                                    aria-pressed={showContextPanel}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                        {showContextPanel ? 'side_navigation' : 'dock_to_right'}
                                    </span>
                                    <span>
                                        {showContextPanel
                                            ? isRTL ? 'إخفاء التفاصيل' : 'Hide Context'
                                            : isRTL ? 'إظهار التفاصيل' : 'Show Context'}
                                    </span>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0">
                                <MessageThread conversation={activeConversation} />
                            </div>

                            <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                                <ReplyComposer
                                    conversation={activeConversation}
                                    shipment={activeConversation.activeShipment}
                                    draftText={draftText}
                                    onDraftChange={setDraftText}
                                />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center p-6">
                            <EmptyStateV2
                                icon="support_agent"
                                title={isRTL ? 'مركز دعم العملاء الموحد' : 'Target Logistics Support Center'}
                                description={
                                    isRTL
                                        ? 'اختر محادثة من القائمة للرد على استفسارات العملاء ومتابعة الشحنات.'
                                        : 'Select a conversation from the list to respond to inquiries and track active waybills.'
                                }
                                actionLabel={
                                    conversations.length > 0
                                        ? isRTL
                                            ? 'فتح أول محادثة'
                                            : 'Open First Conversation'
                                        : undefined
                                }
                                onAction={
                                    conversations.length > 0
                                        ? () => handleSelectConversation(conversations[0])
                                        : undefined
                                }
                            />
                        </div>
                    )}
                </div>

                {/* Pane 3: Customer Context */}
                {activeConversation && showContextPanel && (
                    <div
                        className={`w-full lg:w-[min(24rem,calc(100vw-18rem))] 2xl:w-80 shrink-0 h-full border-s border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto ${
                            mobileView === 'context' ? 'flex flex-col' : 'hidden 2xl:flex 2xl:flex-col'
                        } ${mobileView === 'context' ? 'lg:absolute lg:z-30 lg:inset-y-0 lg:end-0 lg:shadow-2xl 2xl:static 2xl:shadow-none' : ''}`}
                    >
                        <div className="hidden lg:flex 2xl:hidden absolute z-10 top-2 end-2">
                            <button
                                type="button"
                                onClick={() => { setShowContextPanel(false); setMobileView('thread'); }}
                                aria-label={isRTL ? 'إغلاق تفاصيل الشحنة' : 'Close shipment details'}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow"
                            >
                                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                            </button>
                        </div>
                        <CustomerContextPanel
                            conversation={activeConversation}
                            shipment={activeConversation.activeShipment}
                            onSelectQuickReply={handleQuickReply}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default SupportCenterV2Page;
