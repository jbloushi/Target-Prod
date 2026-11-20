import React, { useState } from 'react';
import StatusBadge from '../../../components/common/StatusBadge';
import TradeRouteDisplay from '../../../components/common/TradeRouteDisplay';
import {
    canDeleteShipmentStatus,
    hasCarrierBooking
} from '../../../utils/shipmentDeletionPolicy';

/**
 * ShipmentsTableV2 - Responsive, RBAC-hardened consignment manifest table
 * Guarantees 0px horizontal overflow across 390px, 768px, 1024px, and 1440px.
 */
export const ShipmentsTableV2 = ({
    shipments = [],
    selectedIds = [],
    onToggleSelectAll,
    onToggleSelectRow,
    onInspect,
    onOpenDossier,
    onDownloadLabel,
    onOpenInvoice,
    onApproveOrEdit,
    onDelete,
    canViewRetailPrice = false,
    canViewCostData = false,
    canViewDocuments = false,
    canApproveShipments = false,
    canDeleteShipments = false,
    userRole = 'client',
    isRTL = false
}) => {
    const [openActionRowId, setOpenActionRowId] = useState(null);
    const showCarrier = ['admin', 'staff', 'warehouse', 'accounting', 'driver'].includes(String(userRole || '').toLowerCase());

    const isAllSelected =
        shipments.length > 0 && selectedIds.length === shipments.length;

    const formatKWD = (val) => {
        if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) {
            return '—';
        }
        return `${Number(val).toLocaleString('en-US', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        })} ${isRTL ? 'د.ك' : 'KWD'}`;
    };

    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-start border-collapse">
                <thead>
                    <tr className="bg-slate-50/90 dark:bg-slate-800/70 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                        <th className="w-8 py-2.5 px-1.5 sm:px-2.5 text-center">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={onToggleSelectAll}
                                aria-label={
                                    isRTL ? 'تحديد جميع الشحنات' : 'Select all shipments on page'
                                }
                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary cursor-pointer"
                            />
                        </th>
                        <th className="text-start py-2.5 px-1.5 sm:px-2.5">
                            <span className="sm:hidden">
                                {isRTL ? 'الشحنة والحالة' : 'Consignment & Status'}
                            </span>
                            <span className="hidden sm:inline">
                                {showCarrier
                                    ? (isRTL ? 'رقم البوليصة / الناقل' : 'Tracking # / Carrier')
                                    : (isRTL ? 'رقم البوليصة' : 'Tracking #')}
                            </span>
                        </th>
                        <th className="hidden sm:table-cell text-start py-2.5 px-2 lg:px-3">
                            {isRTL ? 'المسار' : 'Route'}
                        </th>
                        <th className="hidden lg:table-cell text-start py-2.5 px-2.5 lg:px-3">
                            {isRTL ? 'المستلم والحساب' : 'Consignee & Account'}
                        </th>
                        <th className="hidden sm:table-cell text-start py-2.5 px-2 sm:px-2.5">
                            {isRTL ? 'الحالة' : 'Status'}
                        </th>
                        {canViewRetailPrice && (
                            <th className="hidden xl:table-cell text-end py-2.5 px-2.5">
                                {canViewCostData
                                    ? isRTL
                                        ? 'المالية (البيع / التكلفة والربح)'
                                        : 'Financials (Retail / Cost & Margin)'
                                    : isRTL
                                    ? 'قيمة الشحنة'
                                    : 'Billed Amount'}
                            </th>
                        )}
                        <th className="hidden lg:table-cell text-start py-2.5 px-2.5">
                            {isRTL ? 'التاريخ / الوصول' : 'Created / ETA'}
                        </th>
                        <th className="hidden sm:table-cell text-end py-2.5 px-2 sm:px-2.5">
                            {isRTL ? 'إجراءات' : 'Actions'}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {shipments.map((s) => {
                        const isSelected = selectedIds.includes(s.id);
                        const isMenuOpen = openActionRowId === s.id;
                        const isBooked = hasCarrierBooking(s.raw);
                        const canDeleteThisRow =
                            canDeleteShipments &&
                            canDeleteShipmentStatus(s.status, s.raw, userRole);

                        return (
                            <tr
                                key={s.id}
                                tabIndex={0}
                                onClick={() => {
                                    setOpenActionRowId(null);
                                    onInspect(s);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onInspect(s);
                                    }
                                }}
                                className={`transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                                    isSelected
                                        ? 'bg-primary/8 dark:bg-sky-500/15'
                                        : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/60'
                                }`}
                            >
                                {/* 1. Checkbox */}
                                <td
                                    className="py-2.5 px-1.5 sm:px-2.5 align-middle text-center"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => onToggleSelectRow(s.id, e)}
                                        aria-label={
                                            isRTL
                                                ? `تحديد الشحنة ${s.trackingNumber}`
                                                : `Select shipment ${s.trackingNumber}`
                                        }
                                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary focus:ring-primary cursor-pointer"
                                    />
                                </td>

                                {/* 2. Tracking # + Carrier Pill + Mobile Progressive Disclosure */}
                                <td className="py-2.5 px-1.5 sm:px-2.5 align-middle min-w-0 max-w-[270px] sm:max-w-none">
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                            <span
                                                dir="ltr"
                                                className="font-mono text-xs font-extrabold text-primary dark:text-sky-400 tabular-nums truncate"
                                            >
                                                {s.trackingNumber}
                                            </span>
                                            {showCarrier && s.carrierName && (
                                                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.carrierDotClass}`}
                                                        aria-hidden="true"
                                                    />
                                                    <span>{s.carrierName}</span>
                                                </span>
                                            )}
                                            {s.isTest && (
                                                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                                    TEST
                                                </span>
                                            )}
                                        </div>
                                        {/* Mobile Status Badge (< 640px) */}
                                        <div className="sm:hidden shrink-0">
                                            <StatusBadge status={s.status} size="xs" />
                                        </div>
                                    </div>

                                    {/* Mobile Carrier + TEST + Service Row (< 640px) */}
                                    <div className="sm:hidden flex flex-wrap items-center gap-1.5 mt-1">
                                        {showCarrier && s.carrierName && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
                                                <span
                                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.carrierDotClass}`}
                                                    aria-hidden="true"
                                                />
                                                <span>{s.carrierName}</span>
                                            </span>
                                        )}
                                        {s.isTest && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold uppercase bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                                TEST
                                            </span>
                                        )}
                                        <span className="text-[10.5px] font-medium text-slate-600 dark:text-slate-300 truncate">
                                            {s.service} • {s.weight} kg
                                        </span>
                                    </div>

                                    <div className="hidden sm:block text-[11px] font-medium text-slate-600 dark:text-slate-300 mt-0.5 truncate max-w-[200px]">
                                        {s.service} • {s.weight} kg
                                    </div>

                                    {/* Mobile Compact Summary (< 640px) */}
                                    <div className="sm:hidden mt-1 space-y-0.5 min-w-0">
                                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                            <span className="truncate min-w-0">
                                                {s.originCity}{' '}
                                                <span className="text-primary dark:text-sky-400 font-black">
                                                    {isRTL ? '←' : '→'}
                                                </span>{' '}
                                                {s.destCity}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                                                {s.created}
                                            </span>
                                        </div>
                                        <div className="text-[10.5px] font-medium text-slate-600 dark:text-slate-300 truncate">
                                            {s.customer} • {s.org}
                                        </div>
                                    </div>
                                </td>

                                {/* 3. Route (Origin -> Destination) */}
                                <td className="hidden sm:table-cell py-2.5 px-2 lg:px-3 align-middle">
                                    <TradeRouteDisplay
                                        origin={{ city: s.originCity, country: s.originCountry }}
                                        destination={{ city: s.destCity, country: s.destCountry }}
                                    />
                                    {/* Tablet Consignee Fallback (< 1024px) */}
                                    <div className="lg:hidden text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate max-w-[155px] mt-0.5">
                                        {s.customer} • {s.org}
                                    </div>
                                </td>

                                {/* 4. Consignee & Organization Account */}
                                <td className="hidden lg:table-cell py-2.5 px-2.5 lg:px-3 align-middle">
                                    <div className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[165px]">
                                        {s.customer}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[165px] mt-0.5">
                                        <span className="font-semibold text-primary dark:text-sky-400 truncate">
                                            {s.org}
                                        </span>
                                        {s.phone && s.phone !== '—' && (
                                            <>
                                                <span aria-hidden="true">•</span>
                                                <span dir="ltr" className="font-mono tabular-nums">
                                                    {s.phone}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </td>

                                {/* 5. Status Badge */}
                                <td className="hidden sm:table-cell py-2.5 px-2 sm:px-2.5 align-middle text-start">
                                    <div className="inline-flex flex-col items-start gap-1">
                                        <StatusBadge status={s.status} size="xs" />
                                        {/* Tablet Date Summary (640px..1023px) */}
                                        <span className="lg:hidden text-[10px] font-bold text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                                            {s.created}
                                        </span>
                                    </div>
                                </td>

                                {/* 6. Financials (Strictly Gated: Retail vs Wholesale Cost & Margin) */}
                                {canViewRetailPrice && (
                                    <td className="hidden xl:table-cell py-2.5 px-2.5 align-middle text-end tabular-nums">
                                        <div className="font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                            {formatKWD(s.price)}
                                        </div>
                                        {canViewCostData && s.costPrice !== null ? (
                                            <div className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap mt-0.5">
                                                <span>
                                                    {isRTL ? 'التكلفة:' : 'Cost:'}{' '}
                                                    {formatKWD(s.costPrice)}
                                                </span>
                                                {s.marginAmount !== null && (
                                                    <span
                                                        className={`ms-1.5 font-extrabold ${
                                                            s.marginAmount >= 0
                                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                                : 'text-rose-600 dark:text-rose-400'
                                                        }`}
                                                    >
                                                        ({s.marginAmount >= 0 ? '+' : ''}
                                                        {Number(s.marginAmount).toFixed(3)})
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-0.5">
                                                <span
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        s.paid
                                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                    }`}
                                                >
                                                    {s.paid
                                                        ? isRTL
                                                            ? 'مدفوع'
                                                            : 'Paid'
                                                        : isRTL
                                                        ? 'غير مدفوع'
                                                        : 'Unpaid'}
                                                </span>
                                            </div>
                                        )}
                                    </td>
                                )}

                                {/* 7. Created Date & Accurate ETA */}
                                <td className="hidden lg:table-cell py-2.5 px-2.5 align-middle whitespace-nowrap tabular-nums">
                                    <div className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200">
                                        <span>{s.created}</span>
                                        {s.isImported && (
                                            <span
                                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-primary/10 text-primary dark:bg-sky-500/20 dark:text-sky-300"
                                                title="Phenix ERP Synchronized Consignment"
                                            >
                                                ERP
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        className={`text-[11px] font-bold mt-0.5 ${
                                            s.etaTone === 'success'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : s.etaTone === 'error'
                                                ? 'text-rose-600 dark:text-rose-400'
                                                : s.etaTone === 'warning'
                                                ? 'text-amber-600 dark:text-amber-400'
                                                : 'text-slate-600 dark:text-slate-300'
                                        }`}
                                    >
                                        {s.eta}
                                    </div>
                                </td>

                                {/* 8. Quick Actions */}
                                <td
                                    className="hidden sm:table-cell py-2.5 px-2 sm:px-2.5 align-middle text-end relative"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="inline-flex items-center justify-end gap-1">
                                        <button
                                            type="button"
                                            aria-label={
                                                isRTL
                                                    ? `معاينة الشحنة ${s.trackingNumber}`
                                                    : `Inspect shipment ${s.trackingNumber}`
                                            }
                                            onClick={() => onInspect(s)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-primary dark:text-sky-400 hover:bg-primary/10 dark:hover:bg-sky-400/15 transition-colors cursor-pointer"
                                            title={isRTL ? 'معاينة سريعة' : 'Quick Inspect'}
                                        >
                                            <span
                                                className="material-symbols-outlined text-sm leading-none"
                                                aria-hidden="true"
                                            >
                                                visibility
                                            </span>
                                            <span className="hidden xl:inline">
                                                {isRTL ? 'معاينة' : 'Inspect'}
                                            </span>
                                        </button>

                                        {/* Contextual Action Menu Trigger */}
                                        <div className="relative">
                                            <button
                                                type="button"
                                                aria-label={
                                                    isRTL
                                                        ? `خيارات إضافية للشحنة ${s.trackingNumber}`
                                                        : `More actions for ${s.trackingNumber}`
                                                }
                                                aria-expanded={isMenuOpen}
                                                onClick={() =>
                                                    setOpenActionRowId(
                                                        isMenuOpen ? null : s.id
                                                    )
                                                }
                                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                            >
                                                <span
                                                    className="material-symbols-outlined text-base leading-none"
                                                    aria-hidden="true"
                                                >
                                                    more_horiz
                                                </span>
                                            </button>

                                            {isMenuOpen && (
                                                <>
                                                    <div
                                                        className="fixed inset-0 z-20"
                                                        onClick={() => setOpenActionRowId(null)}
                                                    />
                                                    <div
                                                        role="menu"
                                                        className="absolute end-0 mt-1 z-30 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg p-1.5 text-start text-xs font-semibold space-y-0.5"
                                                    >
                                                        <button
                                                            type="button"
                                                            role="menuitem"
                                                            onClick={() => {
                                                                setOpenActionRowId(null);
                                                                onInspect(s);
                                                            }}
                                                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                                        >
                                                            <span
                                                                className="material-symbols-outlined text-sm text-primary dark:text-sky-400"
                                                                aria-hidden="true"
                                                            >
                                                                visibility
                                                            </span>
                                                            <span>
                                                                {isRTL
                                                                    ? 'معاينة سريعة'
                                                                    : 'Quick Inspect'}
                                                            </span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            role="menuitem"
                                                            onClick={() => {
                                                                setOpenActionRowId(null);
                                                                onOpenDossier(s.trackingNumber);
                                                            }}
                                                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                                        >
                                                            <span
                                                                className="material-symbols-outlined text-sm"
                                                                aria-hidden="true"
                                                            >
                                                                open_in_new
                                                            </span>
                                                            <span>
                                                                {isRTL
                                                                    ? 'الملف الكامل للشحنة'
                                                                    : 'Open Full Dossier'}
                                                            </span>
                                                        </button>

                                                        {canViewDocuments && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    onClick={() => {
                                                                        setOpenActionRowId(null);
                                                                        onDownloadLabel(s);
                                                                    }}
                                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                                                >
                                                                    <span
                                                                        className="material-symbols-outlined text-sm"
                                                                        aria-hidden="true"
                                                                    >
                                                                        print
                                                                    </span>
                                                                    <span>
                                                                        {isRTL
                                                                            ? 'طباعة البوليصة'
                                                                            : 'Print Waybill'}
                                                                    </span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    onClick={() => {
                                                                        setOpenActionRowId(null);
                                                                        onOpenInvoice(s);
                                                                    }}
                                                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                                                >
                                                                    <span
                                                                        className="material-symbols-outlined text-sm"
                                                                        aria-hidden="true"
                                                                    >
                                                                        receipt
                                                                    </span>
                                                                    <span>
                                                                        {isRTL
                                                                            ? 'الفاتورة الجمركية'
                                                                            : 'Commercial Invoice'}
                                                                    </span>
                                                                </button>
                                                            </>
                                                        )}

                                                        {canApproveShipments && (
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={() => {
                                                                    setOpenActionRowId(null);
                                                                    onApproveOrEdit(s);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                                            >
                                                                <span
                                                                    className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400"
                                                                    aria-hidden="true"
                                                                >
                                                                    fact_check
                                                                </span>
                                                                <span>
                                                                    {isRTL
                                                                        ? 'اعتماد / تعديل الشحنة'
                                                                        : 'Approve / Edit'}
                                                                </span>
                                                            </button>
                                                        )}

                                                        {canDeleteShipments && (
                                                            <>
                                                                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                                                <button
                                                                    type="button"
                                                                    role="menuitem"
                                                                    onClick={() => {
                                                                        setOpenActionRowId(null);
                                                                        onDelete(s);
                                                                    }}
                                                                    title={
                                                                        !canDeleteThisRow && isBooked
                                                                            ? isRTL
                                                                                ? 'محجوزة مع الناقل؛ استخدم الإلغاء'
                                                                                : 'Booked with carrier; cancel/void instead'
                                                                            : undefined
                                                                    }
                                                                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-bold cursor-pointer ${
                                                                        canDeleteThisRow
                                                                            ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                                                            : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                                    }`}
                                                                >
                                                                    <span
                                                                        className="material-symbols-outlined text-sm"
                                                                        aria-hidden="true"
                                                                    >
                                                                        delete
                                                                    </span>
                                                                    <span>
                                                                        {isRTL
                                                                            ? 'حذف الشحنة'
                                                                            : 'Delete Shipment'}
                                                                    </span>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default ShipmentsTableV2;
