import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useSupportChat } from '../../context/SupportChatContext';

const APPROVED_META_TEMPLATES = [
    {
        name: 'customer_inquiry_start',
        titleEn: 'Customer Support Engagement (General)',
        titleAr: 'بدء استفسار دعم العملاء',
        bodyEn: 'Hello {{1}}, we are contacting you regarding your Target Logistics shipment {{2}}. How can we assist you today?',
        bodyAr: 'مرحباً {{1}}، نتواصل معك بخصوص شحنتك رقم {{2}} مع تارجت للخدمات اللوجستية. كيف يمكننا مساعدتك اليوم؟'
    },
    {
        name: 'location_request_v1',
        titleEn: 'Request GPS Location Pin (Delivery)',
        titleAr: 'طلب تحديد موقع التوصيل (GPS Pin)',
        bodyEn: 'Hello {{1}}, your shipment {{2}} is out for delivery. Please tap below to confirm your exact delivery map pin location.',
        bodyAr: 'مرحباً {{1}}، شحنتك رقم {{2}} خرجت للتوصيل. يرجى الضغط أدناه لتأكيد موقعك الدقيق على الخريطة.'
    },
    {
        name: 'payment_request_v1',
        titleEn: 'Payment Request & Checkout Link',
        titleAr: 'رابط دفع وتأكيد الفاتورة',
        bodyEn: 'Hello {{1}}, your invoice for shipment {{2}} is ready (Amount: {{3}}). Please complete payment via our secure portal.',
        bodyAr: 'مرحباً {{1}}، فاتورة شحنتك رقم {{2}} جاهزة بمبلغ {{3}}. يرجى إتمام الدفع عبر البوابة الآمنة.'
    },
    {
        name: 'target_documents_needed',
        titleEn: 'Customs Documents Required (Civil ID)',
        titleAr: 'طلب مستندات جمركية (البطاقة المدنية)',
        bodyEn: 'Dear {{1}}, customs clearance for shipment {{2}} requires a copy of your Civil ID. Please share a photo or scan.',
        bodyAr: 'عزيزي {{1}}، التخليص الجمركي للشحنة {{2}} يتطلب صورة من البطاقة المدنية. يرجى تزويدنا بها لمتابعة التخليص.'
    },
    {
        name: 'target_shipment_out_for_delivery',
        titleEn: 'Out for Delivery Notice',
        titleAr: 'إشعار الخروج للتوصيل',
        bodyEn: 'Hello {{1}}, parcel {{2}} is with your courier {{3}} and out for delivery today to {{4}}.',
        bodyAr: 'مرحباً {{1}}، طردك رقم {{2}} مع المندوب {{3}} وخرج للتوصيل اليوم إلى {{4}}.'
    },
    {
        name: 'target_delivery_attempt',
        titleEn: 'Delivery Reschedule Notice',
        titleAr: 'إشعار محاولة تسليم وإعادة جدولة',
        bodyEn: 'Hello {{1}}, we attempted delivery of {{2}} today but could not reach you. Please reply to reschedule delivery.',
        bodyAr: 'مرحباً {{1}}، حاولنا تسليم شحنتك {{2}} اليوم ولم نتمكن من الوصول إليك. يرجى الرد لتحديد موعد جديد.'
    },
    {
        name: 'target_customs_exception_hold',
        titleEn: 'Customs Hold Alert',
        titleAr: 'إشعار احتجاز جمركي',
        bodyEn: 'Notice: Shipment {{1}} is currently on hold at customs clearance in {{2}}. Reason: {{3}}.',
        bodyAr: 'تنبيه: الشحنة {{1}} محتجزة حالياً لدى الجمارك في {{2}}. السبب: {{3}}.'
    }
];

export const ReplyComposer = ({
    conversation,
    shipment,
    draftText,
    onDraftChange
}) => {
    const { isRTL } = useLanguage();
    const { user } = useAuth();
    const {
        windowStatus,
        sendMessage,
        sendingMessage
    } = useSupportChat();

    // Mode: 'free' vs 'template'
    const [composerMode, setComposerMode] = useState('free');
    const [freeText, setFreeText] = useState(draftText || '');
    const [isPrivate, setIsPrivate] = useState(false);
    const [selectedTemplateName, setSelectedTemplateName] = useState('customer_inquiry_start');
    const [customParam, setCustomParam] = useState('');
    const [sendError, setSendError] = useState(null);

    // Synchronize draftText changes
    useEffect(() => {
        if (typeof draftText === 'string') {
            setFreeText(draftText);
        }
    }, [draftText]);

    const activeConv = conversation;
    const activeShipment = shipment || activeConv?.activeShipment || {};
    const trackingNumber = activeShipment?.trackingNumber || 'TRG-KW-001';
    const customerName = activeConv?.contact?.name || 'Customer';

    // Per-Agent Chatwoot Personal Access Token Check
    // If user has no token configured (indicated by user.chatwootAccessToken null or user.hasChatwootToken false)
    const hasChatwootToken = Boolean(
        user?.chatwootAccessToken !== null &&
        user?.chatwootAccessToken !== undefined &&
        user?.chatwootAccessToken !== ''
    );

    // If 24h window expires, enforce template mode automatically
    useEffect(() => {
        if (!windowStatus.inside24hWindow) {
            setComposerMode('template');
        }
    }, [windowStatus.inside24hWindow]);

    if (!activeConv) return null;

    const handleSend = async (e) => {
        e?.preventDefault();
        setSendError(null);

        if (!hasChatwootToken) {
            setSendError(isRTL
                ? 'يلزم وجود رمز Chatwoot شخصي لحسابك لإرسال الردود. يرجى التواصل مع مسؤول النظام.'
                : 'Chatwoot Personal Access Token Required: Please ask an admin to configure your credentials in User Management to send replies.'
            );
            return;
        }

        try {
            if (composerMode === 'template' || !windowStatus.inside24hWindow) {
                const tmpl = APPROVED_META_TEMPLATES.find(t => t.name === selectedTemplateName) || APPROVED_META_TEMPLATES[0];
                const params = [
                    customerName,
                    trackingNumber,
                    customParam || activeShipment?.destination || 'Kuwait',
                    'Target Courier'
                ];

                await sendMessage({
                    content: isRTL ? tmpl.bodyAr : tmpl.bodyEn,
                    isTemplate: true,
                    templateName: tmpl.name,
                    templateParams: params,
                    language: isRTL ? 'ar' : 'en'
                });
            } else {
                if (!freeText.trim()) return;
                await sendMessage({
                    content: freeText.trim(),
                    isTemplate: false,
                    isPrivate
                });
                setFreeText('');
                onDraftChange?.('');
            }
        } catch (err) {
            console.error('[ReplyComposer] send error:', err);
            setSendError(err.response?.data?.error || err.message || 'Failed to send message');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const currentTemplate = APPROVED_META_TEMPLATES.find(t => t.name === selectedTemplateName) || APPROVED_META_TEMPLATES[0];
    const previewBody = (isRTL ? currentTemplate.bodyAr : currentTemplate.bodyEn)
        .replace('{{1}}', customerName)
        .replace('{{2}}', trackingNumber)
        .replace('{{3}}', customParam || 'Kuwait')
        .replace('{{4}}', 'Kuwait');

    return (
        <div data-testid="reply-composer-pane" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 shrink-0">
            {/* Missing Agent Token RBAC Guard Alert */}
            {!hasChatwootToken && (
                <div
                    data-testid="no-token-warning"
                    className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 flex items-center gap-2 text-xs font-semibold"
                >
                    <span className="material-symbols-outlined text-base shrink-0">lock</span>
                    <span className="flex-1">
                        {isRTL
                            ? 'يلزم وجود رمز دخول شخصي (Chatwoot Access Token) لحسابك لإرسال الردود. يرجى التواصل مع مسؤول النظام لتفعيله في إدارة المستخدمين.'
                            : 'Personal Chatwoot token required to reply: Please contact an administrator to configure your Chatwoot credentials in User Management to send replies.'}
                    </span>
                </div>
            )}

            {/* Error banner if send failed */}
            {sendError && (
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
                    <span>{sendError}</span>
                    <button
                        type="button"
                        onClick={() => setSendError(null)}
                        className="inline-flex items-center justify-center h-6 w-6 rounded-full hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors shrink-0"
                    >
                        <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                </div>
            )}

            {/* Outside 24h Window Forced Template Banner */}
            {!windowStatus.inside24hWindow && (
                <div
                    data-testid="window-expired-composer-banner"
                    className="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center gap-2 text-[11px]"
                >
                    <span className="material-symbols-outlined text-sm text-amber-600 dark:text-amber-400 shrink-0">info</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {isRTL ? 'انتهت نافذة الرد الحر. اختر قالباً معتمداً أدناه.' : 'Reply window expired. Choose an approved template below.'}
                    </span>
                </div>
            )}

            {/* Mode Switcher Tabs (Only available if inside 24h window) */}
            {windowStatus.inside24hWindow && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs font-bold">
                        <button
                            type="button"
                            data-testid="composer-mode-free"
                            onClick={() => setComposerMode('free')}
                            aria-pressed={composerMode === 'free'}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                composerMode === 'free'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">edit_note</span>
                            <span>{isRTL ? 'رد حر (نص)' : 'Free Text'}</span>
                        </button>
                        <button
                            type="button"
                            data-testid="composer-mode-template"
                            onClick={() => setComposerMode('template')}
                            aria-pressed={composerMode === 'template'}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                                composerMode === 'template'
                                    ? 'bg-primary text-white shadow-xs'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">verified</span>
                            <span>{isRTL ? 'قالب ميتا معتمد' : 'Meta Template'}</span>
                        </button>
                    </div>

                    {/* Private Staff Note toggle in free text mode */}
                    {composerMode === 'free' && (
                        <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 select-none">
                            <input
                                type="checkbox"
                                data-testid="private-note-toggle"
                                checked={isPrivate}
                                onChange={(e) => setIsPrivate(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 accent-amber-500 cursor-pointer"
                            />
                            <span className="text-[11px] font-semibold flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs text-amber-500">lock</span>
                                <span>{isRTL ? 'ملاحظة خاصة' : 'Internal Note'}</span>
                            </span>
                        </label>
                    )}
                </div>
            )}

            {/* Mode A: Free Text Composer */}
            {composerMode === 'free' && windowStatus.inside24hWindow ? (
                <form onSubmit={handleSend} className="space-y-2">
                    <div className="relative">
                        <textarea
                            data-testid="free-text-input"
                            value={freeText}
                            onChange={(e) => {
                                setFreeText(e.target.value);
                                onDraftChange?.(e.target.value);
                            }}
                            onKeyDown={handleKeyDown}
                            disabled={!hasChatwootToken || sendingMessage}
                            rows={3}
                            placeholder={
                                !hasChatwootToken
                                    ? (isRTL ? 'يتطلب إدخال رمز Chatwoot في إدارة المستخدمين...' : 'Personal Chatwoot token required to reply...')
                                    : (isPrivate
                                        ? (isRTL ? 'اكتب ملاحظة داخلية خاصة بفريق العمل...' : 'Write an internal note for staff...')
                                        : (isRTL ? 'اكتب رداً حراً للعميل (اضغط Enter للإرسال)...' : 'Type a reply to customer (Enter to send)...'))
                            }
                            className={`w-full px-3 py-2.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none leading-relaxed transition-colors disabled:opacity-50 ${
                                isPrivate
                                    ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/70 text-amber-950 dark:text-amber-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-300/50 focus:border-amber-500'
                                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-primary'
                            }`}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate">
                            {user?.name ? `${isRTL ? 'المرسل' : 'Agent'}: ${user.name}` : ''}
                        </span>

                        <button
                            type="submit"
                            data-testid="send-free-text-btn"
                            disabled={!hasChatwootToken || sendingMessage || !freeText.trim()}
                            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isPrivate
                                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                    : 'bg-primary hover:bg-primary/90 text-white'
                            }`}
                        >
                            {sendingMessage ? (
                                <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-base">send</span>
                                    <span>{isPrivate ? (isRTL ? 'حفظ الملاحظة' : 'Save Note') : (isRTL ? 'إرسال الرد' : 'Send')}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            ) : (
                /* Mode B: Approved Meta Template Selector & Dispatcher */
                <form onSubmit={handleSend} className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1 min-w-0">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                            {isRTL ? 'اختر قالب ميتا المعتمد' : 'Select Approved Meta Template'}
                        </label>
                        <select
                            data-testid="template-selector"
                            value={selectedTemplateName}
                            onChange={(e) => setSelectedTemplateName(e.target.value)}
                            disabled={!hasChatwootToken || sendingMessage}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                        >
                            {APPROVED_META_TEMPLATES.map(t => (
                                <option key={t.name} value={t.name}>
                                    {isRTL ? t.titleAr : t.titleEn} ({t.name})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Template Parameter Input if needed */}
                    <div className="space-y-1 min-w-0">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                            {isRTL ? 'تفاصيل إضافية (اختياري)' : 'Optional details'}
                        </label>
                        <input
                            type="text"
                            data-testid="template-custom-param-input"
                            value={customParam}
                            onChange={(e) => setCustomParam(e.target.value)}
                            placeholder={isRTL ? 'مثال: رابط الدفع، اسم المنطقة، أو ملاحظة...' : 'e.g. Payment URL, area name, or custom note...'}
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                    </div>
                    </div>

                    <details className="group">
                        <summary className="inline-flex items-center gap-1 min-h-8 cursor-pointer text-[11px] font-bold text-primary">
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">preview</span>
                            <span>{isRTL ? 'معاينة القالب' : 'Preview template'}</span>
                            <span className="material-symbols-outlined text-sm transition-transform group-open:rotate-180" aria-hidden="true">expand_more</span>
                        </summary>
                        <div className="p-2.5 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20 mt-1">
                            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
                                {previewBody}
                            </p>
                        </div>
                    </details>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            data-testid="send-template-btn"
                            disabled={!hasChatwootToken || sendingMessage}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sendingMessage ? (
                                <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-base">verified</span>
                                    <span>{isRTL ? 'إرسال القالب المعتمد' : 'Send Approved Template'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

ReplyComposer.propTypes = {
    conversation: PropTypes.object,
    shipment: PropTypes.object,
    draftText: PropTypes.string,
    onDraftChange: PropTypes.func
};

export default ReplyComposer;
