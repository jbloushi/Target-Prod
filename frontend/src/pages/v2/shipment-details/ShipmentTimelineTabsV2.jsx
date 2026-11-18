import React, { useMemo, useState } from 'react';
import { dedupeTrackingEvents } from '../../../utils/dedupeTrackingEvents';
import { getEventDisplayMessage } from '../../../utils/shipmentDisplay';
import { isNegativeOrExceptionPhrase, normalizeStatus } from '../../../constants/statusConfig';
import StatusBadge from '../../../components/common/StatusBadge';
import EmptyStateV2 from '../components/EmptyStateV2';

const formatTimestampKuwait = (timestamp) => {
    if (!timestamp) return { date: '—', time: '—', dayHeader: '—', dayKey: '' };
    try {
        const str = String(timestamp).trim();
        const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        const d = m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : new Date(str);
        if (Number.isNaN(d.getTime())) {
            return { date: str, time: '', dayHeader: str, dayKey: '' };
        }
        return {
            date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kuwait' }),
            time: `${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuwait' })} AST`,
            dayHeader: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kuwait' }),
            dayKey: d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' })
        };
    } catch {
        return { date: String(timestamp), time: '', dayHeader: String(timestamp), dayKey: '' };
    }
};

export const ShipmentTimelineTabsV2 = ({
    shipment,
    isRTL,
    lang,
    isPlatformOps,
    canEdit,
    isInternalShipment,
    isSyncingCarrier,
    onSyncCarrierTracking,
    onOpenStatusEdit,
    onAddComment,
    isSubmittingComment
}) => {
    const [historyTab, setHistoryTab] = useState('milestones');
    const [newCommentText, setNewCommentText] = useState('');

    const { milestoneEvents, telemetryEvents, commentEvents } = useMemo(() => {
        const rawHistory = Array.isArray(shipment?.history) ? shipment.history : [];
        const deduped = dedupeTrackingEvents(rawHistory, (e) => `${e?.status}|${e?.timestamp}|${e?.description}`);
        const sorted = [...deduped].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const milestones = [];
        const telemetry = [];
        const comments = [];

        sorted.forEach((evt, idx) => {
            const rawStatus = typeof evt.status === 'object' ? (evt.status?.status || evt.status?.name || 'in_transit') : (evt.status || 'in_transit');
            const desc = String(evt.description || evt.comment || '').trim();
            const isException = isNegativeOrExceptionPhrase(desc) || isNegativeOrExceptionPhrase(rawStatus);
            const norm = normalizeStatus(rawStatus);
            const dateParts = formatTimestampKuwait(evt.timestamp);

            const locationText = typeof evt.location === 'object'
                ? [evt.location?.city, evt.location?.country].filter(Boolean).join(', ')
                : (evt.location || '');

            if (evt.comment || evt.source === 'staff' || evt.author) {
                comments.push({
                    text: evt.comment || evt.description || '',
                    author: evt.author || (isRTL ? 'فريق العمليات' : 'Operations Staff'),
                    source: evt.source || 'staff',
                    timestamp: evt.timestamp,
                    dateParts
                });
            }

            telemetry.push({
                idx: sorted.length - idx,
                statusCode: evt.statusCode || evt.code || norm.toUpperCase(),
                description: desc || getEventDisplayMessage(evt, lang),
                location: locationText || '—',
                source: evt.source || (isInternalShipment ? 'TARGET' : 'CARRIER'),
                timezoneOffset: evt.timezoneOffset || '',
                collapsedCount: evt.collapsedCount || 1,
                dateParts
            });

            milestones.push({
                status: isException ? 'exception' : norm,
                rawDescription: desc || getEventDisplayMessage(evt, lang),
                locationText,
                carrierSource: evt.source || (isInternalShipment ? 'Target Hub' : (shipment?.carrierCode || 'Carrier')),
                timezoneOffset: evt.timezoneOffset || '',
                collapsedCount: evt.collapsedCount || 1,
                pod: evt.pod || null,
                dateParts
            });
        });

        return { milestoneEvents: milestones, telemetryEvents: telemetry, commentEvents: comments };
    }, [shipment, isInternalShipment, isRTL, lang]);

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        const note = newCommentText.trim();
        if (!note) return;
        const ok = await onAddComment(note);
        if (ok) setNewCommentText('');
    };

    return (
        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            {/* Tabs Header */}
            <div className="border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 pt-3.5 pb-2 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div role="tablist" className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
                    {[
                        { id: 'milestones', icon: 'timeline', label: isRTL ? 'المحطات والأحداث' : 'Milestones', count: milestoneEvents.length },
                        { id: 'telemetry', icon: 'receipt_long', label: isRTL ? 'سجل الناقل' : 'Telemetry', count: telemetryEvents.length },
                        { id: 'comments', icon: 'chat', label: isRTL ? 'الملاحظات' : 'Notes', count: commentEvents.length }
                    ].map((t) => {
                        const active = historyTab === t.id;
                        return (
                            <button
                                key={t.id}
                                role="tab"
                                type="button"
                                aria-selected={active}
                                onClick={() => setHistoryTab(t.id)}
                                className={`min-h-[38px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                                    active
                                        ? 'bg-white dark:bg-slate-900 text-primary dark:text-sky-400 border border-slate-200 dark:border-slate-700 shadow-2xs'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">{t.icon}</span>
                                <span>{t.label}</span>
                                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[10px] tabular-nums">
                                    {t.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {!isInternalShipment && (
                        <button
                            type="button"
                            onClick={onSyncCarrierTracking}
                            disabled={isSyncingCarrier}
                            className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                            <span className={`material-symbols-outlined text-sm text-primary ${isSyncingCarrier ? 'animate-spin' : ''}`} aria-hidden="true">sync</span>
                            <span>{isSyncingCarrier ? (isRTL ? 'جاري المزامنة...' : 'Syncing...') : (isRTL ? 'مزامنة الناقل' : 'Sync Carrier')}</span>
                        </button>
                    )}
                    {isPlatformOps && canEdit && (
                        <button
                            type="button"
                            onClick={onOpenStatusEdit}
                            className="min-h-[36px] px-3 rounded-xl border border-primary/40 text-primary dark:text-sky-400 text-xs font-bold inline-flex items-center gap-1 cursor-pointer hover:bg-primary/5"
                        >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">add_task</span>
                            <span>{isRTL ? 'تحديث الحالة' : 'Advance Milestone'}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Tab 1: Milestones Timeline */}
            {historyTab === 'milestones' && (
                <div className="p-4 sm:p-5">
                    {milestoneEvents.length === 0 ? (
                        <EmptyStateV2
                            icon="timeline"
                            title={isRTL ? 'لا توجد محطات تتبع مسجلة بعد' : 'No Checkpoint Milestones Yet'}
                            description={isRTL ? 'ستظهر مراحل التتبع هنا فور تحرك الشحنة.' : 'Tracking milestones will appear here once the consignment moves.'}
                        />
                    ) : (
                        <div className="space-y-4">
                            {milestoneEvents.map((event, idx) => {
                                const isLatest = idx === 0;
                                const prevEvent = idx > 0 ? milestoneEvents[idx - 1] : null;
                                const isNewDay = !prevEvent || prevEvent.dateParts?.dayKey !== event.dateParts?.dayKey;

                                return (
                                    <React.Fragment key={idx}>
                                        {isNewDay && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200">
                                                    <span className="material-symbols-outlined text-xs text-primary" aria-hidden="true">calendar_month</span>
                                                    <span>{event.dateParts.dayHeader}</span>
                                                </div>
                                                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                                            </div>
                                        )}

                                        <div className="relative ps-5 border-s-2 border-slate-200 dark:border-slate-800 ms-2">
                                            <span
                                                className={`absolute -start-[7px] top-2 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                                                    isLatest ? 'bg-primary' : 'bg-slate-400 dark:bg-slate-600'
                                                }`}
                                            />
                                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-1.5">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                                        <StatusBadge status={event.status} size="xs" />
                                                        <span className="font-bold text-xs text-slate-900 dark:text-white break-words">
                                                            {event.rawDescription}
                                                        </span>
                                                        {event.collapsedCount > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-[10px] font-bold">
                                                                x{event.collapsedCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                                                        {event.dateParts.time}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
                                                    {event.locationText && (
                                                        <span className="inline-flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-xs text-primary" aria-hidden="true">pin_drop</span>
                                                            <span>{event.locationText}</span>
                                                        </span>
                                                    )}
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700/70 font-mono text-[10px] uppercase">
                                                        {event.carrierSource}
                                                    </span>
                                                </div>

                                                {event.pod && (
                                                    <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1 mt-1">
                                                        <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">verified</span>
                                                            <span>{isRTL ? 'تم تسجيل إثبات التسليم (POD)' : 'Proof of Delivery Recorded'}</span>
                                                        </div>
                                                        <div className="text-slate-700 dark:text-slate-300">
                                                            {isRTL ? 'المستلم:' : 'Received by:'} <strong>{event.pod.recipientName}</strong>
                                                        </div>
                                                        {event.pod.signatureDataUrl && (
                                                            <img src={event.pod.signatureDataUrl} alt="POD Signature" className="h-8 max-w-[120px] object-contain bg-white rounded border border-emerald-200 p-0.5" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Tab 2: Carrier Telemetry */}
            {historyTab === 'telemetry' && (
                <div className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{isRTL ? 'بيانات المسح الخام من شبكة الناقل' : 'Live scan telemetry from carrier network'}</span>
                        <span className="font-mono">AWB: <strong className="text-slate-900 dark:text-white">{shipment?.dhlTrackingNumber || shipment?.carrierShipmentId || shipment?.trackingNumber}</strong></span>
                    </div>

                    {telemetryEvents.length === 0 ? (
                        <EmptyStateV2
                            icon="receipt_long"
                            title={isRTL ? 'لا توجد بيانات مسح خام' : 'No Raw Telemetry Events'}
                            description={isRTL ? 'لم يتم تسجيل أحداث مسح من الناقل حتى الآن.' : 'No carrier scan events have been recorded yet.'}
                        />
                    ) : (
                        <>
                            {/* Mobile stacked telemetry cards (0px overflow at 390px) */}
                            <div className="space-y-2 md:hidden">
                                {telemetryEvents.map((tEvt) => (
                                    <div key={tEvt.idx} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 space-y-1 text-xs">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono font-bold text-[10px]">{tEvt.statusCode}</span>
                                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{tEvt.dateParts.date} {tEvt.dateParts.time}</span>
                                        </div>
                                        <p className="font-semibold text-slate-900 dark:text-white break-words">{tEvt.description}</p>
                                        <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                                            <span>{tEvt.location}</span>
                                            <span className="uppercase font-mono">{tEvt.source}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop telemetry table */}
                            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                                <table className="w-full text-start text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase font-bold">
                                        <tr>
                                            <th className="px-3 py-2.5 text-start">#</th>
                                            <th className="px-3 py-2.5 text-start">{isRTL ? 'الوقت' : 'Time (AST)'}</th>
                                            <th className="px-3 py-2.5 text-start">{isRTL ? 'الكود' : 'Code'}</th>
                                            <th className="px-3 py-2.5 text-start">{isRTL ? 'الوصف' : 'Description'}</th>
                                            <th className="px-3 py-2.5 text-start">{isRTL ? 'الموقع' : 'Location'}</th>
                                            <th className="px-3 py-2.5 text-start">{isRTL ? 'المصدر' : 'Source'}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {telemetryEvents.map((tEvt) => (
                                            <tr key={tEvt.idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                                <td className="px-3 py-2 font-mono text-slate-400">{tEvt.idx}</td>
                                                <td className="px-3 py-2 font-mono whitespace-nowrap tabular-nums">{tEvt.dateParts.date} {tEvt.dateParts.time}</td>
                                                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px]">{tEvt.statusCode}</span></td>
                                                <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{tEvt.description}</td>
                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{tEvt.location}</td>
                                                <td className="px-3 py-2 font-mono uppercase text-[10px] text-slate-500">{tEvt.source}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Tab 3: Comments & Operational Notes */}
            {historyTab === 'comments' && (
                <div className="p-4 sm:p-5 space-y-4">
                    {isPlatformOps && canEdit && (
                        <form onSubmit={handleCommentSubmit} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2.5">
                            <label htmlFor="v2-op-note" className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                                <span className="material-symbols-outlined text-sm text-primary" aria-hidden="true">edit_note</span>
                                <span>{isRTL ? 'إضافة ملاحظة تشغيلية' : 'Add Operational Note'}</span>
                            </label>
                            <textarea
                                id="v2-op-note"
                                rows={2}
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                                placeholder={isRTL ? 'اكتب ملاحظة تشغيلية...' : 'Write an operational comment...'}
                                disabled={isSubmittingComment}
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                            />
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={isSubmittingComment || !newCommentText.trim()}
                                    className="min-h-[36px] px-4 rounded-xl bg-primary text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-xs" aria-hidden="true">send</span>
                                    <span>{isSubmittingComment ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'إضافة الملاحظة' : 'Post Note')}</span>
                                </button>
                            </div>
                        </form>
                    )}

                    {commentEvents.length === 0 ? (
                        <EmptyStateV2
                            icon="chat"
                            title={isRTL ? 'لا توجد ملاحظات مسجلة' : 'No Operational Notes'}
                            description={isRTL ? 'لم يتم تسجيل أي تعليقات على هذه الشحنة.' : 'No comments or operational notes recorded yet.'}
                        />
                    ) : (
                        <div className="space-y-2.5">
                            {commentEvents.map((cEvt, idx) => (
                                <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <span className="font-bold text-primary dark:text-sky-400">{cEvt.author}</span>
                                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                            {cEvt.dateParts.date} • {cEvt.dateParts.time}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{cEvt.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default ShipmentTimelineTabsV2;
