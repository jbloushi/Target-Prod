import React from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../context/LanguageContext';
import { useSupportChat } from '../../context/SupportChatContext';

const LABEL_OPTIONS = [
    { value: '', labelEn: 'All Labels', labelAr: 'جميع التصنيفات' },
    { value: 'role_both', labelEn: 'Role: Both', labelAr: 'الطرفين (مرسل ومستلم)' },
    { value: 'sender', labelEn: 'Role: Sender', labelAr: 'المرسل' },
    { value: 'receiver', labelEn: 'Role: Receiver', labelAr: 'المستلم' },
    { value: 'customs_hold', labelEn: 'Customs Hold', labelAr: 'احتجاز جمركي' },
    { value: 'cod_due', labelEn: 'COD Due', labelAr: 'تحصيل عند الاستلام' },
    { value: 'out_for_delivery', labelEn: 'Out for Delivery', labelAr: 'خرج للتوصيل' },
    { value: 'payment_pending', labelEn: 'Payment Pending', labelAr: 'في انتظار الدفع' }
];

export const ConversationList = ({ onSelectConversation }) => {
    const { isRTL } = useLanguage();
    const {
        conversations,
        activeConversation,
        selectConversation,
        filters,
        setFilters,
        loadingConversations
    } = useSupportChat();

    const handleSelect = (conv) => {
        selectConversation(conv);
        onSelectConversation?.(conv);
    };

    const handleStatusTab = (status) => {
        setFilters(prev => ({ ...prev, status }));
    };

    const handleLabelChange = (e) => {
        setFilters(prev => ({ ...prev, label: e.target.value }));
    };

    const handleSearchChange = (e) => {
        setFilters(prev => ({ ...prev, search: e.target.value }));
    };

    const handleUnreadToggle = () => {
        setFilters(prev => ({ ...prev, unread: !prev.unread }));
    };

    const formatTime = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            if (Number.isNaN(date.getTime())) return '';
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            return '';
        }
    };

    return (
        <aside
            data-testid="conversation-list-pane"
            className="w-full md:w-80 lg:w-96 shrink-0 border-e border-base-200 bg-base-100 flex flex-col h-full select-none"
        >
            {/* Header / Search Controls */}
            <div className="p-3.5 border-b border-base-200 space-y-2.5 bg-base-100/80 backdrop-blur-xs">
                {/* Search Bar */}
                <div className="relative">
                    <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-base text-base-content/50">
                        search
                    </span>
                    <input
                        type="text"
                        data-testid="support-search-input"
                        value={filters.search}
                        onChange={handleSearchChange}
                        placeholder={isRTL ? 'بحث بالاسم، الهاتف، البوليصة...' : 'Search name, phone, AWB...'}
                        className="input input-sm input-bordered w-full ps-9 pe-8 text-xs rounded-xl focus:outline-primary bg-base-200/50"
                    />
                    {filters.search && (
                        <button
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
                            className="absolute end-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-circle btn-xs text-base-content/50"
                        >
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    )}
                </div>

                {/* Status Tabs */}
                <div className="flex items-center justify-between gap-1">
                    <div className="join join-horizontal bg-base-200/70 p-0.5 rounded-xl text-xs font-bold w-full">
                        <button
                            type="button"
                            data-testid="status-tab-open"
                            onClick={() => handleStatusTab('open')}
                            className={`join-item flex-1 btn btn-xs border-0 rounded-lg ${
                                filters.status === 'open' ? 'btn-primary shadow-xs' : 'btn-ghost'
                            }`}
                        >
                            {isRTL ? 'المفتوحة' : 'Open'}
                        </button>
                        <button
                            type="button"
                            data-testid="status-tab-resolved"
                            onClick={() => handleStatusTab('resolved')}
                            className={`join-item flex-1 btn btn-xs border-0 rounded-lg ${
                                filters.status === 'resolved' ? 'btn-primary shadow-xs' : 'btn-ghost'
                            }`}
                        >
                            {isRTL ? 'المغلقة' : 'Resolved'}
                        </button>
                        <button
                            type="button"
                            data-testid="status-tab-all"
                            onClick={() => handleStatusTab('all')}
                            className={`join-item flex-1 btn btn-xs border-0 rounded-lg ${
                                filters.status === 'all' ? 'btn-primary shadow-xs' : 'btn-ghost'
                            }`}
                        >
                            {isRTL ? 'الكل' : 'All'}
                        </button>
                    </div>
                </div>

                {/* Filter Row: Label Dropdown + Unread Toggle */}
                <div className="flex items-center gap-2">
                    <select
                        data-testid="support-label-filter"
                        value={filters.label}
                        onChange={handleLabelChange}
                        className="select select-bordered select-xs flex-1 rounded-lg text-[11px] bg-base-200/50"
                    >
                        {LABEL_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {isRTL ? opt.labelAr : opt.labelEn}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        data-testid="support-unread-toggle"
                        onClick={handleUnreadToggle}
                        className={`btn btn-xs rounded-lg gap-1 font-bold ${
                            filters.unread
                                ? 'btn-primary text-primary-content'
                                : 'btn-ghost bg-base-200/60 text-base-content/70'
                        }`}
                        title={isRTL ? 'المحادثات غير المقروءة فقط' : 'Unread messages only'}
                    >
                        <span className="material-symbols-outlined text-xs">mark_chat_unread</span>
                        <span className="text-[11px]">{isRTL ? 'غير مقروءة' : 'Unread'}</span>
                    </button>
                </div>
            </div>

            {/* Conversation Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-base-200">
                {loadingConversations && conversations.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                        <span className="loading loading-spinner loading-sm text-primary" />
                        <p className="text-xs text-base-content/60">{isRTL ? 'جارٍ تحميل المحادثات...' : 'Loading conversations...'}</p>
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="p-8 text-center space-y-2 text-base-content/50">
                        <span className="material-symbols-outlined text-3xl opacity-40">chat_bubble_outline</span>
                        <p className="text-xs font-semibold">{isRTL ? 'لا توجد محادثات مطابقة' : 'No conversations found'}</p>
                    </div>
                ) : (
                    conversations.map(conv => {
                        const isSelected = activeConversation && String(activeConversation.id) === String(conv.id);
                        const contactName = conv.contact?.name || 'Customer';
                        const initials = contactName.slice(0, 2).toUpperCase();
                        const unread = conv.unreadCount || 0;

                        return (
                            <div
                                key={conv.id}
                                data-testid={`conversation-item-${conv.id}`}
                                onClick={() => handleSelect(conv)}
                                className={`p-3.5 cursor-pointer transition-all flex items-start gap-3 relative ${
                                    isSelected
                                        ? 'bg-primary/10 border-s-4 border-primary'
                                        : 'hover:bg-base-200/50'
                                }`}
                            >
                                {/* Customer Avatar with WhatsApp Indicator */}
                                <div className="relative shrink-0 mt-0.5">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold text-xs font-mono">
                                        {initials}
                                    </div>
                                    <span
                                        className="absolute -bottom-1 -end-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-base-100 flex items-center justify-center"
                                        title="WhatsApp"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                    </span>
                                </div>

                                {/* Content Details */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                        <span className="font-bold text-xs text-base-content truncate">
                                            {contactName}
                                        </span>
                                        <span className="text-[10px] text-base-content/50 shrink-0 font-mono">
                                            {formatTime(conv.updatedAt)}
                                        </span>
                                    </div>

                                    {/* Phone & Role */}
                                    <div className="flex items-center gap-1.5 text-[11px] text-base-content/60 mb-1">
                                        {conv.contact?.phone && (
                                            <span className="font-mono" dir="ltr">
                                                {conv.contact.phone}
                                            </span>
                                        )}
                                        {conv.contact?.role && (
                                            <span className="badge badge-ghost badge-xs text-[10px] uppercase font-mono">
                                                {conv.contact.role}
                                            </span>
                                        )}
                                    </div>

                                    {/* Active Shipment Chip if present */}
                                    {conv.activeShipment?.trackingNumber && (
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <span className="badge badge-primary badge-outline badge-xs font-mono font-bold">
                                                {conv.activeShipment.trackingNumber}
                                            </span>
                                            {conv.activeShipment.status && (
                                                <span className="badge badge-info badge-xs text-[10px] uppercase">
                                                    {conv.activeShipment.status.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Last Message Snippet */}
                                    <p className="text-xs text-base-content/70 truncate">
                                        {conv.lastMessage?.isTemplate ? (
                                            <span className="text-primary font-semibold flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[13px]">verified</span>
                                                <span>{conv.lastMessage.content || 'Template Message'}</span>
                                            </span>
                                        ) : (
                                            conv.lastMessage?.content || (isRTL ? 'لا توجد رسائل' : 'No messages yet')
                                        )}
                                    </p>

                                    {/* Operational Labels Tags */}
                                    {conv.labels?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {conv.labels.slice(0, 3).map(lbl => (
                                                <span
                                                    key={lbl}
                                                    className="badge badge-neutral badge-xs text-[9px] font-mono opacity-80"
                                                >
                                                    {lbl}
                                                </span>
                                            ))}
                                            {conv.labels.length > 3 && (
                                                <span className="text-[10px] text-base-content/40 font-mono">
                                                    +{conv.labels.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Unread Counter Badge */}
                                {unread > 0 && (
                                    <span
                                        data-testid={`unread-badge-${conv.id}`}
                                        className="badge badge-primary badge-xs font-mono font-bold px-1.5 min-w-[18px] h-4 self-center shrink-0"
                                    >
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
};

ConversationList.propTypes = {
    onSelectConversation: PropTypes.func
};

export default ConversationList;
