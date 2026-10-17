import React, { useState } from 'react';
import { shipmentService } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useSnackbar } from 'notistack';

const UndeliveredLogModal = ({ isOpen, onClose, organizations = [], selectedOrgId = 'all' }) => {
    const { t, lang } = useLanguage();
    const { enqueueSnackbar } = useSnackbar();
    const isRTL = lang === 'ar';

    const [carrier, setCarrier] = useState('ALL');
    const [tier, setTier] = useState('all');
    const [status, setStatus] = useState('all');
    const [orgId, setOrgId] = useState(selectedOrgId || 'all');
    const [isDownloading, setIsDownloading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState(null);

    if (!isOpen) return null;

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const blob = await shipmentService.downloadUndeliveredLog({
                carrier: carrier !== 'ALL' ? carrier : undefined,
                tier: tier !== 'all' ? tier : undefined,
                status: status !== 'all' ? status : undefined,
                organizationId: orgId !== 'all' ? orgId : undefined
            });

            // Trigger browser download
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv;charset=utf-8;' }));
            const link = document.createElement('a');
            const today = new Date().toISOString().slice(0, 10);
            link.href = url;
            link.setAttribute('download', `undelivered-shipments-log-${today}.csv`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);

            enqueueSnackbar(
                isRTL ? 'تم تنزيل سجل الشحنات غير المسلمة بنجاح' : 'Undelivered shipments log downloaded successfully',
                { variant: 'success' }
            );
        } catch (err) {
            enqueueSnackbar(
                (isRTL ? 'فشل تنزيل السجل: ' : 'Failed to download report: ') + (err.message || 'Error'),
                { variant: 'error' }
            );
        } finally {
            setIsDownloading(false);
        }
    };

    const handleTriggerSync = async () => {
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const res = await shipmentService.triggerCarrierSync({
                carrier: carrier !== 'ALL' ? carrier : undefined,
                limit: 40
            });
            const data = res?.data || res;
            setSyncResult(data);
            enqueueSnackbar(
                isRTL
                    ? `اكتمل الفحص: تم مسح ${data.scanned || 0} وتحديث ${data.updated || 0}`
                    : `Sync batch completed: scanned ${data.scanned || 0}, updated ${data.updated || 0}`,
                { variant: 'success' }
            );
        } catch (err) {
            enqueueSnackbar(
                (isRTL ? 'فشل بدء الفحص الدوري: ' : 'Failed to trigger sync: ') + (err.message || 'Error'),
                { variant: 'error' }
            );
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div 
                className="bg-base-100 border border-base-200/90 shadow-2xl rounded-3xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
                dir={isRTL ? 'rtl' : 'ltr'}
            >
                {/* Header */}
                <div className="p-5 sm:p-6 bg-base-100 border-b border-base-200/80 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined text-2xl">monitoring</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-lg sm:text-xl font-black text-base-content tracking-tight">
                                    {isRTL ? 'سجل تتبع الشحنات غير المسلمة' : 'Undelivered Shipments & Polling Log'}
                                </h3>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-950 border border-blue-300">
                                    {isRTL ? 'تصدير CSV' : 'CSV Export'}
                                </span>
                            </div>
                            <p className="text-xs text-base-content/60 font-semibold mt-0.5">
                                {isRTL 
                                    ? 'تصدير كامل للشحنات النشطة مع وتيرة الفحص التلقائي وسجل التحديثات الأخير.' 
                                    : 'Export active consignments with automated tiered polling frequencies and tracking checkpoints.'}
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="btn btn-ghost btn-circle btn-sm text-base-content/50 hover:text-base-content"
                    >
                        ✕
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs">
                    
                    {/* Polling Cadence Overview Ribbon */}
                    <div className="bg-base-200/50 border border-base-300/60 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-base">schedule</span>
                            <span className="font-black text-base-content uppercase tracking-wider text-[11px]">
                                {isRTL ? 'وتيرة الفحص والتحديث التلقائي للنواقل' : 'Automated Carrier Sync Cadence'}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                            <div className="bg-base-100 rounded-xl p-2 border border-warning/30 shadow-2xs">
                                <span className="block font-black text-warning text-xs">{isRTL ? 'عاجل (ساعة)' : 'Urgent (1h)'}</span>
                                <span className="text-[10px] text-base-content/60 font-medium">{isRTL ? 'خارج للتسليم' : 'Out for delivery'}</span>
                            </div>
                            <div className="bg-base-100 rounded-xl p-2 border border-info/30 shadow-2xs">
                                <span className="block font-black text-info text-xs">{isRTL ? 'المستوى 1 (ساعتان)' : 'Tier 1 (2h)'}</span>
                                <span className="text-[10px] text-base-content/60 font-medium">{isRTL ? '≤ 14 يوم' : '≤ 14 days old'}</span>
                            </div>
                            <div className="bg-base-100 rounded-xl p-2 border border-primary/30 shadow-2xs">
                                <span className="block font-black text-primary text-xs">{isRTL ? 'المستوى 2 (18 ساعة)' : 'Tier 2 (18h)'}</span>
                                <span className="text-[10px] text-base-content/60 font-medium">{isRTL ? '15 - 45 يوم' : '15 - 45 days old'}</span>
                            </div>
                            <div className="bg-base-100 rounded-xl p-2 border border-purple-300 shadow-2xs">
                                <span className="block font-black text-purple-700 text-xs">{isRTL ? 'المستوى 3 (15 يوم)' : 'Tier 3 (15d)'}</span>
                                <span className="text-[10px] text-base-content/60 font-medium">{isRTL ? '> 45 يوم باستمرار' : '> 45d indefinitely'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Filter Controls Form */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* Carrier Scope */}
                        <div className="form-control">
                            <label className="label py-1 px-0.5">
                                <span className="label-text font-black text-[11px] uppercase tracking-wider text-base-content/70">
                                    {isRTL ? 'شركة النقل / المسار' : 'Carrier Service'}
                                </span>
                            </label>
                            <select
                                value={carrier}
                                onChange={(e) => setCarrier(e.target.value)}
                                className="select select-bordered select-sm rounded-xl font-bold text-xs bg-base-100"
                            >
                                <option value="ALL">{isRTL ? 'جميع النواقل' : 'All Carriers'}</option>
                                <option value="DHL">{isRTL ? 'دي إتش إل إكسبريس (DHL / DGR)' : 'DHL Express (DHL / DGR)'}</option>
                                <option value="ARAMEX">{isRTL ? 'أرامكس (Aramex)' : 'Aramex (ARM)'}</option>
                                <option value="FEDEX">{isRTL ? 'فيديكس إكسبريس (FedEx)' : 'FedEx Express (FDX)'}</option>
                                <option value="INTERNAL">{isRTL ? 'الأسطول الداخلي (Target Fleet)' : 'Internal Fleet (Target Fleet)'}</option>
                            </select>
                        </div>

                        {/* Polling Tier */}
                        <div className="form-control">
                            <label className="label py-1 px-0.5">
                                <span className="label-text font-black text-[11px] uppercase tracking-wider text-base-content/70">
                                    {isRTL ? 'مستوى وتيرة الفحص' : 'Polling Tier'}
                                </span>
                            </label>
                            <select
                                value={tier}
                                onChange={(e) => setTier(e.target.value)}
                                className="select select-bordered select-sm rounded-xl font-bold text-xs bg-base-100"
                            >
                                <option value="all">{isRTL ? 'كافة المستويات' : 'All Tiers'}</option>
                                <option value="urgent">{isRTL ? 'عاجل (خارج للتسليم - كل ساعة)' : 'Urgent (Out for Delivery - 1h)'}</option>
                                <option value="Tier 1">{isRTL ? 'المستوى 1 (نشطة حديثاً - كل ساعتين)' : 'Tier 1 (Fresh Active - 2h)'}</option>
                                <option value="Tier 2">{isRTL ? 'المستوى 2 (متوسطة العمر - كل 18 ساعة)' : 'Tier 2 (Aging - 18h)'}</option>
                                <option value="Tier 3">{isRTL ? 'المستوى 3 (شحنات خاملة - كل 15 يوم)' : 'Tier 3 (Dormant - 15d indefinitely)'}</option>
                            </select>
                        </div>

                        {/* Status Filter */}
                        <div className="form-control">
                            <label className="label py-1 px-0.5">
                                <span className="label-text font-black text-[11px] uppercase tracking-wider text-base-content/70">
                                    {isRTL ? 'حالة الشحنة' : 'Consignment Status'}
                                </span>
                            </label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="select select-bordered select-sm rounded-xl font-bold text-xs bg-base-100"
                            >
                                <option value="all">{isRTL ? 'كافة الشحنات غير المسلمة' : 'All Undelivered'}</option>
                                <option value="in_transit">{isRTL ? 'في الطريق (In Transit)' : 'In Transit'}</option>
                                <option value="out_for_delivery">{isRTL ? 'خارج للتسليم (Out for Delivery)' : 'Out for Delivery'}</option>
                                <option value="exception">{isRTL ? 'استثناء / احتجاز جمركي (Exception / Hold)' : 'Exception / Hold'}</option>
                                <option value="picked_up">{isRTL ? 'تم الاستلام من العميل (Picked Up)' : 'Picked Up'}</option>
                                <option value="ready_for_pickup">{isRTL ? 'جاهز للشحن (Ready for Pickup)' : 'Ready for Pickup'}</option>
                                <option value="booked">{isRTL ? 'محجوز مع الناقل (Booked)' : 'Booked'}</option>
                            </select>
                        </div>

                        {/* Organization Filter */}
                        {organizations.length > 1 && (
                            <div className="form-control">
                                <label className="label py-1 px-0.5">
                                    <span className="label-text font-black text-[11px] uppercase tracking-wider text-base-content/70">
                                        {isRTL ? 'نطاق حساب المنظمة' : 'Account Scope'}
                                    </span>
                                </label>
                                <select
                                    value={orgId}
                                    onChange={(e) => setOrgId(e.target.value)}
                                    className="select select-bordered select-sm rounded-xl font-bold text-xs bg-base-100"
                                >
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Report Content Info Box */}
                    <div className="bg-blue-50/70 border border-blue-200/90 rounded-2xl p-3.5 text-blue-950 flex items-start gap-3">
                        <span className="material-symbols-outlined text-blue-600 text-lg shrink-0 mt-0.5">table_chart</span>
                        <div className="space-y-1">
                            <p className="font-bold">
                                {isRTL ? 'أعمدة التقرير الصادر:' : 'Exported Columns Include:'}
                            </p>
                            <p className="text-[11px] leading-relaxed text-blue-900/90">
                                {isRTL
                                    ? 'رقم التتبع، بوليصة الناقل (AWB)، الناقل، الحالة، تاريخ الإنشاء، أيام العبور، مستوى الفحص، موعد الفحص القادم، آخر فحص، أيام منذ الفحص، آخر حدث، تاريخ الحدث، المنشأ، الوجهة، المستلم، ورقم الهاتف.'
                                    : 'Tracking Number, Carrier AWB, Carrier Code, Status, Created Date, Days in Transit, Polling Tier, Next Check Due, Last Checked At, Days Since Check, Latest Event, Event Date, Origin, Destination, Consignee, Phone, Organization.'}
                            </p>
                        </div>
                    </div>

                    {/* Real-time Sync Result Notification */}
                    {syncResult && (
                        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 text-emerald-950 flex items-start gap-3">
                            <span className="material-symbols-outlined text-emerald-600 text-lg shrink-0 mt-0.5">check_circle</span>
                            <div className="text-xs">
                                <p className="font-black">
                                    {isRTL ? 'اكتملت دورة الفحص الحي بنجاح:' : 'Live Carrier Check Completed:'}
                                </p>
                                <p className="text-[11px] mt-0.5 font-medium">
                                    {isRTL 
                                        ? `تم مسح ${syncResult.scanned || 0} شحنة | تم التحديث: ${syncResult.updated || 0} | الأخطاء: ${syncResult.errors || 0}`
                                        : `Scanned: ${syncResult.scanned || 0} | Promoted/Updated: ${syncResult.updated || 0} | Errors: ${syncResult.errors || 0}`}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 sm:p-5 bg-base-100 border-t border-base-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleTriggerSync}
                        disabled={isSyncing || isDownloading}
                        className="btn btn-outline btn-info btn-sm rounded-xl font-bold w-full sm:w-auto gap-1.5"
                        title={isRTL ? 'بدء فحص فوري عبر واجهات النواقل' : 'Trigger immediate live polling pass across carriers'}
                    >
                        <span className={`material-symbols-outlined text-xs ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
                        {isSyncing 
                            ? (isRTL ? 'جاري الفحص...' : 'Polling Carriers...') 
                            : (isRTL ? 'فحص حي الآن' : 'Run Live Carrier Sync')}
                    </button>

                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-ghost btn-sm rounded-xl font-bold flex-1 sm:flex-initial"
                        >
                            {isRTL ? 'إلغاء' : 'Close'}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={isDownloading || isSyncing}
                            className="btn btn-primary btn-sm rounded-xl font-black shadow-sm flex-1 sm:flex-initial gap-1.5"
                        >
                            <span className={`material-symbols-outlined text-xs ${isDownloading ? 'animate-spin' : ''}`}>
                                {isDownloading ? 'progress_activity' : 'download'}
                            </span>
                            {isDownloading
                                ? (isRTL ? 'جاري التوليد...' : 'Generating CSV...')
                                : (isRTL ? 'تنزيل ملف CSV' : 'Download CSV Report')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UndeliveredLogModal;
