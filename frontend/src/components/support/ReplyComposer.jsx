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
        <div data-testid="reply-composer-pane" className="border-t border-base-200 bg-base-100 p-3.5 space-y-2 shrink-0">
            {/* Missing Agent Token RBAC Guard Alert */}
            {!hasChatwootToken && (
                <div
                    data-testid="no-token-warning"
                    className="p-2.5 rounded-xl bg-error/10 border border-error/20 text-error flex items-center gap-2 text-xs font-semibold"
                >
                    <span className="material-symbols-outlined text-base">lock</span>
                    <span className="flex-1">
                        {isRTL
                            ? 'يلزم وجود رمز دخول شخصي (Chatwoot Access Token) لحسابك لإرسال الردود. يرجى التواصل مع مسؤول النظام لتفعيله في إدارة المستخدمين.'
                            : 'Personal Chatwoot token required to reply: Please contact an administrator to configure your Chatwoot credentials in User Management to send replies.'}
                    </span>
                </div>
            )}

            {/* Error banner if send failed */}
            {sendError && (
                <div className="p-2 rounded-lg bg-error/10 border border-error/20 text-error text-xs flex items-center justify-between">
                    <span>{sendError}</span>
                    <button type="button" onClick={() => setSendError(null)} className="btn btn-ghost btn-xs btn-circle">
                        <span className="material-symbols-outlined text-xs">close</span>
                    </button>
                </div>
            )}

            {/* Outside 24h Window Forced Template Banner */}
            {!windowStatus.inside24hWindow && (
                <div
                    data-testid="window-expired-composer-banner"
                    className="p-2.5 rounded-xl bg-warning/10 border border-warning/30 text-warning-content flex items-start gap-2 text-xs"
                >
                    <span className="material-symbols-outlined text-base text-warning shrink-0 mt-0.5">info</span>
                    <div>
                        <p className="font-bold text-base-content">
                            {isRTL ? 'انتهت نافذة الـ 24 ساعة للرد الحر' : '24-Hour Customer Service Window Expired'}
                        </p>
                        <p className="text-base-content/70 text-[11px] mt-0.5">
                            {isRTL
                                ? 'وفقاً لسياسات Meta Cloud API، لا يمكن إرسال نصوص حرة خارج الـ 24 ساعة. تم تفعيل اختيار قوالب ميتا المعتمدة تلقائياً.'
                                : 'Per Meta WhatsApp policies, free-form text is disabled outside 24h. Please select an approved utility template to re-engage the customer.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Mode Switcher Tabs (Only available if inside 24h window) */}
            {windowStatus.inside24hWindow && (
                <div className="flex items-center justify-between gap-2">
                    <div className="join join-horizontal bg-base-200/60 p-0.5 rounded-lg text-xs font-bold">
                        <button
                            type="button"
                            data-testid="composer-mode-free"
                            onClick={() => setComposerMode('free')}
                            className={`join-item btn btn-xs border-0 rounded-md ${
                                composerMode === 'free' ? 'btn-primary' : 'btn-ghost'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">edit_note</span>
                            <span>{isRTL ? 'رد حر (نص)' : 'Free Text'}</span>
                        </button>
                        <button
                            type="button"
                            data-testid="composer-mode-template"
                            onClick={() => setComposerMode('template')}
                            className={`join-item btn btn-xs border-0 rounded-md ${
                                composerMode === 'template' ? 'btn-primary' : 'btn-ghost'
                            }`}
                        >
                            <span className="material-symbols-outlined text-xs">verified</span>
                            <span>{isRTL ? 'قالب ميتا معتمد' : 'Meta Template'}</span>
                        </button>
                    </div>

                    {/* Private Staff Note toggle in free text mode */}
                    {composerMode === 'free' && (
                        <label className="cursor-pointer label py-0 gap-1.5 text-xs text-base-content/70">
                            <input
                                type="checkbox"
                                data-testid="private-note-toggle"
                                checked={isPrivate}
                                onChange={(e) => setIsPrivate(e.target.checked)}
                                className="checkbox checkbox-xs checkbox-warning rounded"
                            />
                            <span className="text-[11px] font-semibold flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs text-warning">lock</span>
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
                            className={`textarea textarea-bordered w-full text-xs rounded-xl focus:outline-primary resize-none leading-relaxed ${
                                isPrivate ? 'bg-amber-500/5 border-amber-500/40 text-amber-950 dark:text-amber-100' : 'bg-base-200/50'
                            }`}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-base-content/50 font-mono">
                            {user?.name ? `${isRTL ? 'المرسل' : 'Agent'}: ${user.name}` : ''}
                        </span>

                        <button
                            type="submit"
                            data-testid="send-free-text-btn"
                            disabled={!hasChatwootToken || sendingMessage || !freeText.trim()}
                            className={`btn btn-sm rounded-xl font-bold gap-1.5 ${
                                isPrivate ? 'btn-warning' : 'btn-primary'
                            }`}
                        >
                            {sendingMessage ? (
                                <span className="loading loading-spinner loading-xs" />
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
                <form onSubmit={handleSend} className="space-y-2.5">
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-base-content/70">
                            {isRTL ? 'اختر قالب ميتا المعتمد' : 'Select Approved Meta Template'}
                        </label>
                        <select
                            data-testid="template-selector"
                            value={selectedTemplateName}
                            onChange={(e) => setSelectedTemplateName(e.target.value)}
                            disabled={!hasChatwootToken || sendingMessage}
                            className="select select-bordered select-sm w-full text-xs rounded-xl bg-base-200/50 font-semibold"
                        >
                            {APPROVED_META_TEMPLATES.map(t => (
                                <option key={t.name} value={t.name}>
                                    {isRTL ? t.titleAr : t.titleEn} ({t.name})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Template Parameter Input if needed */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-base-content/60">
                            {isRTL ? 'تفاصيل إضافية / الملاحظات للمتغيرات' : 'Custom Variable Parameter'}
                        </label>
                        <input
                            type="text"
                            data-testid="template-custom-param-input"
                            value={customParam}
                            onChange={(e) => setCustomParam(e.target.value)}
                            placeholder={isRTL ? 'مثال: رابط الدفع، اسم المنطقة، أو ملاحظة...' : 'e.g. Payment URL, area name, or custom note...'}
                            className="input input-sm input-bordered w-full text-xs rounded-xl bg-base-200/50"
                        />
                    </div>

                    {/* Live Preview Card */}
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase font-mono">
                            <span className="material-symbols-outlined text-xs">preview</span>
                            <span>{isRTL ? 'معاينة نص القالب الفعلي' : 'Live WhatsApp Template Preview'}</span>
                        </div>
                        <p className="text-xs text-base-content leading-relaxed font-medium whitespace-pre-wrap">
                            {previewBody}
                        </p>
                    </div>

                    <div className="flex justify-end pt-1">
                        <button
                            type="submit"
                            data-testid="send-template-btn"
                            disabled={!hasChatwootToken || sendingMessage}
                            className="btn btn-sm btn-primary rounded-xl font-bold gap-1.5 shadow-sm"
                        >
                            {sendingMessage ? (
                                <span className="loading loading-spinner loading-xs" />
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
