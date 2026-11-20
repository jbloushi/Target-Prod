import React from 'react';
import { Link } from 'react-router-dom';
import { INTERNAL_SHIPMENT_STATUSES } from '../../../constants/statusConfig';

export const ShipmentSidebarV2 = ({
    shipment,
    sender,
    receiver,
    accountingSummary,
    isPaid,
    isRTL,
    isPlatformOps,
    canViewCost,
    canBookCarriers,
    canManageCheckpoints,
    isInternalShipment,
    isManualShipment,
    normStatus,
    statusUpdating,
    onStatusChange,
    onOpenPaymentModal,
    onCopyPaymentLink,
    onOpenChatwoot,
    onSendWhatsAppRole,
    sendingWhatsAppRole,
    onResendUpdate,
    resendingUpdate,
    onRequestLocationPin,
    sendingLocationReq,
    onOpenConversion
}) => {
    const currency = shipment?.currency || 'KWD';
    const salePrice = Number(accountingSummary?.totalCharge || shipment?.price || 0);
    const carrierCost = Number(shipment?.carrierCost ?? shipment?.costPrice ?? shipment?.manualCost ?? 0);
    const grossMargin = salePrice - carrierCost;
    const marginPercentage = salePrice > 0 ? ((grossMargin / salePrice) * 100) : 0;

    return (
        <aside className="space-y-5 min-w-0">
            {/* Financial Ledger Card */}
            <section id="invoice" className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg" aria-hidden="true">account_balance_wallet</span>
                        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                            {isRTL ? 'البيان المالي والرسوم' : 'Financial Ledger'}
                        </h2>
                    </div>
                    <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider border ${
                            isPaid
                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-500/40'
                                : 'bg-rose-100 dark:bg-rose-500/20 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-500/40'
                        }`}
                    >
                        {isPaid ? (isRTL ? 'مدفوع' : 'PAID') : (isRTL ? 'مستحق' : 'DUE')}
                    </span>
                </div>

                <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'إجمالي الرسوم:' : 'Total Charge:'}</span>
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white tabular-nums">
                            {Number(accountingSummary.totalCharge || 0).toFixed(3)} {currency}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'المدفوع:' : 'Total Paid:'}</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {Number(accountingSummary.totalPaid || 0).toFixed(3)} {currency}
                        </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-slate-500 dark:text-slate-400">{isRTL ? 'الرصيد المتبقي:' : 'Balance Due:'}</span>
                        <span className={`font-extrabold text-sm tabular-nums ${accountingSummary.remainingBalance > 0.001 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                            {Number(accountingSummary.remainingBalance || 0).toFixed(3)} {currency}
                        </span>
                    </div>

                    {/* Wholesale Cost & Margin: strictly guarded by VIEW_COST_DATA (admin & accounting ONLY) */}
                    {canViewCost && (
                        <div className="mt-2 pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-700 space-y-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {isRTL ? 'التكلفة والهامش (داخلي)' : 'Internal Cost & Margin'}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-600 dark:text-slate-300">{isRTL ? 'تكلفة الناقل:' : 'Carrier Cost:'}</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                                    {carrierCost.toFixed(3)} {currency}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-600 dark:text-slate-300">{isRTL ? 'صافي الهامش:' : 'Gross Margin:'}</span>
                                <span className={`font-mono font-bold tabular-nums ${grossMargin >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {grossMargin >= 0 ? '+' : ''}{grossMargin.toFixed(3)} {currency} ({marginPercentage.toFixed(1)}%)
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {accountingSummary.remainingBalance > 0.001 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onOpenPaymentModal}
                            data-testid="send-payment-link-btn"
                            className="w-full min-h-[40px] rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">payments</span>
                            <span>{isRTL ? 'إرسال رابط الدفع واتساب' : 'Send WhatsApp Payment Link'}</span>
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={onCopyPaymentLink}
                                className="min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-xs" aria-hidden="true">content_copy</span>
                                <span>{isRTL ? 'نسخ الرابط' : 'Copy Link'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => window.open(`/pay/${shipment.trackingNumber}`, '_blank', 'noopener,noreferrer')}
                                className="min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-primary dark:text-sky-400 cursor-pointer"
                            >
                                {isRTL ? 'بوابة الدفع ↗' : 'Pay Online ↗'}
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* Operations Checkpoint Update */}
            {isPlatformOps && canManageCheckpoints && (
                <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xs">
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-primary text-lg" aria-hidden="true">fact_check</span>
                        <span>{isRTL ? 'تحديث الحالة التشغيلية' : 'Operations Checkpoint'}</span>
                    </h2>
                    <select
                        value={normStatus}
                        disabled={statusUpdating}
                        onChange={(e) => onStatusChange(e.target.value)}
                        className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                    >
                        {INTERNAL_SHIPMENT_STATUSES.map((st) => (
                            <option key={st.value || st} value={st.value || st}>
                                {st.label || st}
                            </option>
                        ))}
                    </select>
                </section>
            )}

            {/* WhatsApp Dispatch Tracker (Platform Ops Only) */}
            {isPlatformOps && (
                <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base shrink-0" aria-hidden="true">chat</span>
                            <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                                {isRTL ? 'متابعة إشعارات واتساب' : 'WhatsApp Dispatch Tracker'}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenChatwoot()}
                            data-testid="card-chatwoot-btn"
                            className="text-xs font-bold text-primary dark:text-sky-400 hover:underline shrink-0 cursor-pointer"
                        >
                            {isRTL ? 'صندوق الوارد' : 'Live Support'}
                        </button>
                    </div>

                    <div className="space-y-2.5">
                        {[
                            { key: 'sender', label: isRTL ? 'إشعار الراسل' : 'Sender Notification' },
                            { key: 'receiver', label: isRTL ? 'إشعار المستلم' : 'Receiver Notification' }
                        ].map((role) => {
                            const isSenderRole = role.key === 'sender';
                            const roleAliases = isSenderRole ? ['sender', 'shipper', 'merchant'] : ['receiver', 'consignee', 'customer'];
                            const roleLogs = (shipment?.notificationLogs || []).filter((l) =>
                                roleAliases.includes((l.recipientRole || '').toLowerCase())
                            );
                            const latestLog = roleLogs[0] || null;
                            const logStatus = (latestLog?.status || '').toUpperCase();
                            const isSent = ['SENT', 'DELIVERED', 'READ', 'SUBMITTED'].includes(logStatus);
                            const isFailed = logStatus === 'FAILED';
                            const phone = latestLog?.recipientPhone || (isSenderRole ? sender?.phone : receiver?.phone) || '';

                            return (
                                <div key={role.key} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-slate-900 dark:text-white">{role.label}</span>
                                        {!isSent ? (
                                            <button
                                                type="button"
                                                onClick={() => onSendWhatsAppRole(role.key, isFailed)}
                                                disabled={sendingWhatsAppRole === role.key}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer disabled:opacity-50 ${
                                                    isFailed
                                                        ? 'border-rose-300 text-rose-700 dark:text-rose-300'
                                                        : 'border-emerald-300 text-emerald-700 dark:text-emerald-300'
                                                }`}
                                            >
                                                {sendingWhatsAppRole === role.key ? '...' : isFailed ? (isRTL ? 'إعادة' : 'Retry') : (isRTL ? 'إرسال' : 'Send')}
                                            </button>
                                        ) : (
                                            <Link
                                                to={`/admin/whatsapp-logs-v2?search=${shipment.trackingNumber}`}
                                                className="text-[11px] font-bold text-primary dark:text-sky-400 hover:underline"
                                            >
                                                {isRTL ? 'السجلات' : 'Logs'}
                                            </Link>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                            isSent
                                                ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                                                : isFailed
                                                ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200'
                                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                        }`}>
                                            {latestLog ? logStatus : (isRTL ? 'لم يُرسل' : 'NOT SENT')}
                                        </span>
                                        <span dir="ltr" className="font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate">
                                            {phone || '—'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Quick WhatsApp Actions */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            disabled={resendingUpdate}
                            onClick={onResendUpdate}
                            className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                            {resendingUpdate ? '...' : (isRTL ? 'إعادة إرسال التتبع' : 'Resend Tracking')}
                        </button>
                        <button
                            type="button"
                            disabled={sendingLocationReq}
                            onClick={onRequestLocationPin}
                            className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                            {sendingLocationReq ? '...' : (isRTL ? 'طلب موقع GPS' : 'Request GPS Pin')}
                        </button>
                    </div>
                </section>
            )}

            {/* Carrier Conversion (Internal non-manual shipments, Platform Ops with BOOK_CARRIERS) */}
            {isPlatformOps && canBookCarriers && isInternalShipment && !isManualShipment && (
                <section className="rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-primary dark:text-sky-400 font-extrabold text-xs uppercase">
                        <span className="material-symbols-outlined text-base" aria-hidden="true">flight_takeoff</span>
                        <span>{isRTL ? 'تحويل للناقل الدولي' : 'Carrier Conversion'}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                        {isRTL
                            ? 'هذه الشحنة مدارة داخلياً. يمكنك تحويلها وحجزها عبر ناقل دولي (DHL / OTE).'
                            : 'Managed internally. Convert to DHL Express or OTE to issue a global air waybill.'}
                    </p>
                    <button
                        type="button"
                        onClick={onOpenConversion}
                        className="w-full min-h-[40px] rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer"
                    >
                        {isRTL ? 'تحويل وحجز الناقل' : 'Convert & Book Carrier'}
                    </button>
                </section>
            )}
        </aside>
    );
};

export default ShipmentSidebarV2;
