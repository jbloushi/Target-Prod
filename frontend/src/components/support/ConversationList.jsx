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
            className="w-full md:w-80 lg:w-96 shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full select-none"
        >
            {/* Header / Search Controls */}
            <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs">
                {/* Search Bar */}
                <div className="relative">
                    <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-base text-slate-400 dark:text-slate-500">
                        search
                    </span>
                    <input
                        type="text"
                        data-testid="support-search-input"
                        value={filters.search}
                        onChange={handleSearchChange}
                        placeholder={isRTL ? 'بحث بالاسم، الهاتف، البوليصة...' : 'Search name, phone, AWB...'}
                        className="w-full ps-9 pe-8 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                    {filters.search && (
                        <button
                            type="button"
                            onClick={() => setFilters(prev => ({ ...prev, search: '' }))}
                            className="absolute end-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    )}
                </div>

                {/* Status Tabs */}
                <div className="flex items-center justify-between gap-1">
                    <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-bold w-full border border-slate-200/70 dark:border-slate-700/70">
                        <button
                            type="button"
                            data-testid="status-tab-open"
                            onClick={() => handleStatusTab('open')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors ${
                                filters.status === 'open'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            {isRTL ? 'المفتوحة' : 'Open'}
                        </button>
                        <button
                            type="button"
                            data-testid="status-tab-resolved"
                            onClick={() => handleStatusTab('resolved')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors ${
                                filters.status === 'resolved'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            {isRTL ? 'المغلقة' : 'Resolved'}
                        </button>
                        <button
                            type="button"
                            data-testid="status-tab-all"
                            onClick={() => handleStatusTab('all')}
                            className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-colors ${
                                filters.status === 'all'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
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
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-colors ${
                            filters.unread
                                ? 'bg-primary text-white shadow-xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700'
                        }`}
                        title={isRTL ? 'المحادثات غير المقروءة فقط' : 'Unread messages only'}
                    >
                        <span className="material-symbols-outlined text-xs">mark_chat_unread</span>
                        <span>{isRTL ? 'غير مقروءة' : 'Unread'}</span>
                    </button>
                </div>
            </div>

            {/* Conversation Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-800">
                {loadingConversations && conversations.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                        <span className="inline-block w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs text-slate-500 dark:text-slate-400">{isRTL ? 'جارٍ تحميل المحادثات...' : 'Loading conversations...'}</p>
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="p-8 text-center space-y-2 text-slate-400 dark:text-slate-500">
                        <span className="material-symbols-outlined text-3xl opacity-50">chat_bubble_outline</span>
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
                                        ? 'bg-primary/10 before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-primary'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                            >
                                {/* Customer Avatar with WhatsApp Indicator */}
                                <div className="relative shrink-0 mt-0.5">
                                    <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-xs font-mono border border-primary/20">
                                        {initials}
                                    </div>
                                    <span
                                        className="absolute -bottom-1 -end-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center"
                                        title="WhatsApp"
                                    >
                                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                    </span>
                                </div>

                                {/* Content Details */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                            {contactName}
                                        </span>
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 font-mono">
                                            {formatTime(conv.updatedAt)}
                                        </span>
                                    </div>

                                    {/* Phone & Role */}
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-1 flex-wrap">
                                        {conv.contact?.phone && (
                                            <span className="font-mono" dir="ltr">
                                                {conv.contact.phone}
                                            </span>
                                        )}
                                        {conv.contact?.role && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] uppercase font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                {conv.contact.role}
                                            </span>
                                        )}
                                    </div>

                                    {/* Active Shipment Chip if present */}
                                    {conv.activeShipment?.trackingNumber && (
                                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border border-primary/30 text-primary bg-primary/5">
                                                {conv.activeShipment.trackingNumber}
                                            </span>
                                            {conv.activeShipment.status && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60">
                                                    {conv.activeShipment.status.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Last Message Snippet */}
                                    <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                        {conv.lastMessage?.isTemplate ? (
                                            <span className="text-primary font-semibold flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[13px]">verified</span>
                                                <span className="truncate">{conv.lastMessage.content || 'Template Message'}</span>
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
                                                    className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                                >
                                                    {lbl}
                                                </span>
                                            ))}
                                            {conv.labels.length > 3 && (
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
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
                                        className="inline-flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-mono font-bold px-1.5 min-w-[18px] h-4 self-center shrink-0"
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
