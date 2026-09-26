import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import StatusBadge from './StatusBadge';
import TradeRouteDisplay from './TradeRouteDisplay';

/**
 * Standardized Slide-Over Shipment Inspector Drawer
 * Used identically across Dashboard, Shipments, and Operations views for 100% design continuity.
 */
export const ShipmentInspectorDrawer = ({
    shipment,
    onClose,
    onDownloadLabel
}) => {
    const navigate = useNavigate();
    const { t, lang } = useLanguage();
    const isRTL = lang === 'ar';
    const [copied, setCopied] = useState(false);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!shipment) return null;

    const trackingNumber = shipment.trackingNumber || '—';
    const status = shipment.status || 'draft';
    const origin = shipment.origin || { city: shipment.originCity || 'Kuwait City', country: shipment.originCountry || 'KW' };
    const destination = shipment.destination || { city: shipment.destCity || 'Riyadh', country: shipment.destCountry || 'SA' };
    const consigneeName = shipment.receiver?.contactPerson || shipment.receiver?.name || (typeof shipment.destination === 'object' ? (shipment.destination?.contactPerson || shipment.destination?.name) : null) || (typeof shipment.customer === 'object' ? (shipment.customer?.name || shipment.customer?.contactPerson) : (typeof shipment.customer === 'string' ? shipment.customer : null)) || (isRTL ? 'المستلم' : 'Consignee');
    const consigneePhone = shipment.receiver?.phone || (typeof shipment.destination === 'object' ? shipment.destination?.phone : null) || (typeof shipment.customer === 'object' ? shipment.customer?.phone : (typeof shipment.phone === 'string' ? shipment.phone : null)) || '+965 9988 7766';
    const orgName = shipment.organization?.name || shipment.org || 'Target Logistics';
    const serviceType = shipment.serviceType || shipment.service || 'Express Air Cargo';
    const weight = shipment.weight || shipment.package?.weight || 3.5;
    const pieces = shipment.pieces || shipment.package?.pieces || 1;

    const copyTracking = () => {
        navigator.clipboard.writeText(trackingNumber);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const cleanPhone = consigneePhone.replace(/\D/g, '') || '96597691271';
    const waText = encodeURIComponent(`Hello ${consigneeName}, regarding your Target Logistics consignment #${trackingNumber}:`);

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            {/* Slide-over Panel */}
            <div className="relative w-full max-w-md bg-base-100 h-full shadow-2xl z-10 flex flex-col overflow-y-auto border-s border-base-200 p-5 space-y-5 animate-in slide-in-from-right duration-200">
                
                {/* Header: Tracking # & Close */}
                <div className="flex justify-between items-start border-b border-base-200 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-base font-black text-primary">
                                {trackingNumber}
                            </span>
                            <button 
                                onClick={copyTracking} 
                                className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                                title={isRTL ? 'نسخ رقم التتبع' : 'Copy Tracking Number'}
                            >
                                <span className="material-symbols-outlined text-sm">{copied ? 'done' : 'content_copy'}</span>
                            </button>
                            {shipment.isTest && (
                                <span className="badge badge-warning badge-xs font-black">TEST</span>
                            )}
                        </div>
                        <p className="text-xs text-base-content/60 font-semibold mt-0.5">
                            {serviceType} • {orgName}
                        </p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="btn btn-ghost btn-sm btn-square rounded-full"
                    >
                        ✕
                    </button>
                </div>

                {/* Status & Quick Dossier Banner */}
                <div className="flex justify-between items-center p-3.5 bg-base-200/50 rounded-2xl border border-base-200">
                    <div>
                        <span className="text-[10.5px] uppercase font-extrabold text-base-content/60 block">
                            {isRTL ? 'الحالة التشغيلية' : 'Consignment Status'}
                        </span>
                        <div className="mt-1">
                            <StatusBadge status={status} size="sm" />
                        </div>
                    </div>
                    <button 
                        onClick={() => navigate(`/shipment/${trackingNumber}`)} 
                        className="btn btn-primary btn-xs font-extrabold rounded-lg gap-1"
                    >
                        <span>{isRTL ? 'فتح الملف الكامل' : 'Full Dossier'}</span>
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </button>
                </div>

                {/* Route Information */}
                <div className="space-y-2">
                    <h4 className="font-extrabold text-base-content uppercase tracking-wider text-[11px]">
                        {isRTL ? 'مسار الشحن الدولي' : 'Trade Route & Corridor'}
                    </h4>
                    <div className="p-3 bg-base-100 border border-base-200 rounded-xl">
                        <TradeRouteDisplay origin={origin} destination={destination} />
                    </div>
                </div>

                {/* Consignee & Destination */}
                <div className="space-y-2 text-xs">
                    <h4 className="font-extrabold text-base-content uppercase tracking-wider text-[11px]">
                        {isRTL ? 'بيانات المستلم والتسليم' : 'Consignee & Destination'}
                    </h4>
                    <div className="p-3 bg-base-100 border border-base-200 rounded-xl space-y-1.5">
                        <div className="flex justify-between">
                            <span className="text-base-content/60">{isRTL ? 'المستلم:' : 'Consignee:'}</span>
                            <span className="font-bold text-base-content">{consigneeName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-base-content/60">{isRTL ? 'الهاتف:' : 'Phone:'}</span>
                            <span className="font-mono font-bold text-base-content">{consigneePhone}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-base-content/60">{isRTL ? 'المؤسسة / العميل:' : 'Organization:'}</span>
                            <span className="font-extrabold text-primary">{orgName}</span>
                        </div>
                    </div>
                </div>

                {/* Cargo Specifications */}
                <div className="space-y-2 text-xs">
                    <h4 className="font-extrabold text-base-content uppercase tracking-wider text-[11px]">
                        {isRTL ? 'مواصفات الطرد' : 'Cargo Specifications'}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="p-2.5 bg-base-200/50 rounded-xl border border-base-200">
                            <span className="text-[10px] text-base-content/60 uppercase font-bold block">{isRTL ? 'الوزن الفعلي' : 'Actual Weight'}</span>
                            <span className="font-extrabold text-sm text-base-content">{weight} kg</span>
                        </div>
                        <div className="p-2.5 bg-base-200/50 rounded-xl border border-base-200">
                            <span className="text-[10px] text-base-content/60 uppercase font-bold block">{isRTL ? 'القطع' : 'Pieces'}</span>
                            <span className="font-extrabold text-sm text-base-content">{pieces} Pkg</span>
                        </div>
                    </div>
                </div>

                {/* Live Milestone Progress Timeline */}
                <div className="space-y-2">
                    <h4 className="font-extrabold text-base-content uppercase tracking-wider text-[11px]">
                        {isRTL ? 'مراحل التتبع' : 'Milestones & History'}
                    </h4>
                    <div className="p-3 bg-base-100 border border-base-200 rounded-xl">
                        <ul className="timeline timeline-vertical timeline-compact text-xs">
                            <li>
                                <div className="timeline-middle text-success">
                                    <span className="material-symbols-outlined text-sm">check_circle</span>
                                </div>
                                <div className="timeline-end timeline-box py-1 px-2 border-base-200 text-xs">
                                    <span className="font-bold text-base-content block">{isRTL ? 'استلام المنفذ' : 'Gate In / Manifested'}</span>
                                    <span className="text-[10px] text-base-content/50">Kuwait Airport (KWI)</span>
                                </div>
                                <hr className="bg-success" />
                            </li>
                            <li>
                                <hr className={['in_transit', 'out_for_delivery', 'delivered'].includes(status) ? 'bg-success' : 'bg-base-300'} />
                                <div className={`timeline-middle ${['in_transit', 'out_for_delivery', 'delivered'].includes(status) ? 'text-primary' : 'text-base-300'}`}>
                                    <span className="material-symbols-outlined text-sm">flight</span>
                                </div>
                                <div className="timeline-end timeline-box py-1 px-2 border-base-200 text-xs">
                                    <span className="font-bold text-base-content block">{isRTL ? 'نقل جوي دولي' : 'In Global Flight'}</span>
                                    <span className="text-[10px] text-base-content/50">Kuwait ➔ Riyadh Hub</span>
                                </div>
                                <hr className={['out_for_delivery', 'delivered'].includes(status) ? 'bg-success' : 'bg-base-300'} />
                            </li>
                            <li>
                                <hr className={status === 'delivered' ? 'bg-success' : 'bg-base-300'} />
                                <div className={`timeline-middle ${status === 'delivered' ? 'text-success' : 'text-base-300'}`}>
                                    <span className="material-symbols-outlined text-sm">task_alt</span>
                                </div>
                                <div className="timeline-end timeline-box py-1 px-2 border-base-200 text-xs">
                                    <span className="font-bold text-base-content block">{isRTL ? 'تسليم المستلم' : 'Consignee Delivery'}</span>
                                    <span className="text-[10px] text-base-content/50">{status === 'delivered' ? 'Signed & Completed' : 'Pending dispatch'}</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-base-200">
                    <div className="flex gap-2">
                        <a 
                            href={`https://wa.me/${cleanPhone}?text=${waText}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-outline btn-success btn-sm flex-1 font-bold rounded-xl"
                        >
                            <span className="material-symbols-outlined text-base">chat</span>
                            {isRTL ? 'واتساب المستلم' : 'WhatsApp Client'}
                        </a>
                        {onDownloadLabel && (
                            <button 
                                onClick={() => onDownloadLabel(shipment)} 
                                className="btn btn-outline btn-sm font-bold rounded-xl"
                                title={t('action_view_label', 'Print Waybill')}
                            >
                                <span className="material-symbols-outlined text-base">print</span>
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ShipmentInspectorDrawer;
