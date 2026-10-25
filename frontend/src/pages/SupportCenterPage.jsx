import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useSupportChat } from '../context/SupportChatContext';
import { ConversationList } from '../components/support/ConversationList';
import { MessageThread } from '../components/support/MessageThread';
import { ReplyComposer } from '../components/support/ReplyComposer';
import { CustomerContextPanel } from '../components/support/CustomerContextPanel';

export const SupportCenterPage = () => {
    const { isRTL } = useLanguage();
    const navigate = useNavigate();
    const { conversationId: routeConversationId } = useParams();
    const [searchParams] = useSearchParams();

    const {
        conversations,
        activeConversation,
        selectConversation,
        loadConversationByTrackingNumber,
        loadConversationByPhone
    } = useSupportChat();

    // Draft message text passed between Quick Replies and ReplyComposer
    const [draftText, setDraftText] = useState('');

    // Mobile view state: 'list' | 'thread' | 'context'
    const [mobileView, setMobileView] = useState('list');

    // Desktop toggle to show/hide CustomerContextPanel
    const [showContextPanel, setShowContextPanel] = useState(true);

    // Ref to prevent redundant re-selection for the already selected route conversation
    const currentSelectedRouteIdRef = useRef(null);

    // Initial URL sync: load by route :conversationId, ?trackingNumber, or ?phone
    useEffect(() => {
        const tracking = searchParams.get('trackingNumber') || searchParams.get('tracking');
        const phone = searchParams.get('phone');

        if (routeConversationId) {
            const numId = Number(routeConversationId);
            if (currentSelectedRouteIdRef.current !== numId) {
                currentSelectedRouteIdRef.current = numId;
                selectConversation(numId);
            }
            setMobileView('thread');
        } else if (tracking) {
            currentSelectedRouteIdRef.current = null;
            loadConversationByTrackingNumber(tracking).then((conv) => {
                if (conv) setMobileView('thread');
            });
        } else if (phone) {
            currentSelectedRouteIdRef.current = null;
            loadConversationByPhone(phone, { trackingNumber: tracking }).then((conv) => {
                if (conv) setMobileView('thread');
            });
        } else {
            currentSelectedRouteIdRef.current = null;
        }
    }, [routeConversationId, searchParams, selectConversation, loadConversationByTrackingNumber, loadConversationByPhone]);

    // Handle user selecting a conversation card from the list
    const handleSelectConversation = (conv) => {
        if (!conv) return;
        navigate(`/support/${conv.id}`, { replace: true });
        setMobileView('thread');
    };

    // Handle mobile back to list
    const handleBackToList = () => {
        setMobileView('list');
    };

    // Quick reply handler from CustomerContextPanel
    const handleQuickReply = (text) => {
        setDraftText(text);
        if (mobileView === 'context') {
            setMobileView('thread');
        }
    };

    return (
        <div
            data-testid="support-center-page"
            className="flex-1 flex flex-col h-[calc(100vh-64px)] max-h-[calc(100vh-64px)] overflow-hidden bg-base-100"
        >
            {/* Mobile Navigation Header / Segmented Control (Visible on < lg screens) */}
            <div className="lg:hidden p-2 border-b border-base-200 bg-base-100 flex items-center justify-between gap-2">
                {mobileView !== 'list' && (
                    <button
                        type="button"
                        data-testid="mobile-back-to-list-btn"
                        onClick={handleBackToList}
                        className="btn btn-ghost btn-sm btn-circle"
                    >
                        <span className="material-symbols-outlined text-xl">
                            {isRTL ? 'arrow_forward' : 'arrow_back'}
                        </span>
                    </button>
                )}

                <div data-testid="mobile-view-tabs" className="join grid grid-cols-3 flex-1">
                    <button
                        type="button"
                        onClick={() => setMobileView('list')}
                        className={`join-item btn btn-xs font-bold ${
                            mobileView === 'list' ? 'btn-primary' : 'btn-ghost'
                        }`}
                    >
                        <span className="material-symbols-outlined text-xs">forum</span>
                        <span>{isRTL ? 'المحادثات' : 'Chats'}</span>
                    </button>
                    <button
                        type="button"
                        disabled={!activeConversation}
                        onClick={() => setMobileView('thread')}
                        className={`join-item btn btn-xs font-bold ${
                            mobileView === 'thread' ? 'btn-primary' : 'btn-ghost'
                        }`}
                    >
                        <span className="material-symbols-outlined text-xs">chat</span>
                        <span>{isRTL ? 'الرسائل' : 'Thread'}</span>
                    </button>
                    <button
                        type="button"
                        disabled={!activeConversation}
                        onClick={() => setMobileView('context')}
                        className={`join-item btn btn-xs font-bold ${
                            mobileView === 'context' ? 'btn-primary' : 'btn-ghost'
                        }`}
                    >
                        <span className="material-symbols-outlined text-xs">local_shipping</span>
                        <span>{isRTL ? 'الشحنات' : 'Logistics'}</span>
                    </button>
                </div>

                <div className="text-xs font-black text-primary px-2 font-mono">
                    {activeConversation?.activeShipment?.trackingNumber || ''}
                </div>
            </div>

            {/* Main 3-Pane Responsive Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Pane 1: Conversations List */}
                <div
                    data-testid="pane-conversations"
                    className={`w-full lg:w-80 xl:w-96 flex-shrink-0 h-full border-e border-base-200 ${
                        mobileView === 'list' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
                    }`}
                >
                    <ConversationList onSelectConversation={handleSelectConversation} />
                </div>

                {/* Pane 2: Message Thread & Reply Composer */}
                <div
                    data-testid="pane-thread"
                    className={`flex-1 flex-col h-full overflow-hidden bg-base-100 ${
                        mobileView === 'thread' ? 'flex' : 'hidden lg:flex'
                    }`}
                >
                    {activeConversation ? (
                        <>
                            {/* Thread Header Action Bar for Desktop */}
                            <div className="hidden lg:flex items-center justify-between px-4 py-2 border-b border-base-200 bg-base-100/60">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-base-content/70">
                                        {isRTL ? 'المحادثة النشطة:' : 'Active Conversation:'}
                                    </span>
                                    <span className="font-mono font-black text-xs text-primary">
                                        #{activeConversation.id}
                                    </span>
                                    {activeConversation.activeShipment?.trackingNumber && (
                                        <span className="badge badge-outline badge-xs font-mono font-bold">
                                            {activeConversation.activeShipment.trackingNumber}
                                        </span>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    data-testid="context-panel-toggle-btn"
                                    onClick={() => setShowContextPanel(prev => !prev)}
                                    className="btn btn-ghost btn-xs gap-1 font-bold"
                                    title={isRTL ? 'إظهار / إخفاء بيانات الشحنات' : 'Toggle customer logistics panel'}
                                >
                                    <span className="material-symbols-outlined text-sm">
                                        {showContextPanel ? 'side_navigation' : 'dock_to_right'}
                                    </span>
                                    <span>
                                        {showContextPanel
                                            ? (isRTL ? 'إخفاء التفاصيل' : 'Hide Context')
                                            : (isRTL ? 'إظهار التفاصيل' : 'Show Context')}
                                    </span>
                                </button>
                            </div>

                            {/* Message Stream */}
                            <div className="flex-1 overflow-y-auto">
                                <MessageThread conversation={activeConversation} />
                            </div>

                            {/* 24-Hour Reply Composer */}
                            <div className="border-t border-base-200 bg-base-100">
                                <ReplyComposer
                                    conversation={activeConversation}
                                    shipment={activeConversation.activeShipment}
                                    draftText={draftText}
                                    onDraftChange={setDraftText}
                                />
                            </div>
                        </>
                    ) : (
                        /* Empty State when no conversation selected */
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-base-200/20">
                            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4 border border-primary/20">
                                <span className="material-symbols-outlined text-3xl">support_agent</span>
                            </div>
                            <h3 className="font-black text-base text-base-content mb-1">
                                {isRTL ? 'مركز دعم العملاء الموحد' : 'Target Logistics Support Center'}
                            </h3>
                            <p className="text-xs text-base-content/60 max-w-sm mb-6">
                                {isRTL
                                    ? 'اختر محادثة من القائمة للرد على استفسارات العملاء، متابعة الشحنات، وإرسال روابط الدفع وتحديد المواقع.'
                                    : 'Select a customer conversation from the list to respond to inquiries, track active waybills, and trigger 1-click logistics actions.'}
                            </p>
                            {conversations.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => handleSelectConversation(conversations[0])}
                                    className="btn btn-primary btn-sm rounded-xl font-bold gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-sm">forum</span>
                                    <span>{isRTL ? 'فتح أول محادثة مفتوحة' : 'Open First Conversation'}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Pane 3: Customer Context Panel */}
                {activeConversation && showContextPanel && (
                    <div
                        data-testid="pane-context"
                        className={`w-full lg:w-80 xl:w-96 flex-shrink-0 h-full overflow-hidden ${
                            mobileView === 'context' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
                        }`}
                    >
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

export default SupportCenterPage;
