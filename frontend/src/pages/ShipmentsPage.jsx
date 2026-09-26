import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import ShipmentList from '../components/ShipmentList';
import BulkShipmentImportModal from '../components/BulkShipmentImportModal';
import PhenixSyncModal from '../components/PhenixSyncModal';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { getRoleLabel } from '../utils/roleLabels';
import { organizationService } from '../services/api';

/**
 * ShipmentsPage — Target Logistics Global Consignment Command
 * Revamped with 100% design and architectural continuity with DashboardPage.
 */
const ShipmentsPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const { t, lang } = useLanguage();
    const isRTL = lang === 'ar';

    const userRole = user?.role || 'staff';
    const isSuperadmin = userRole === 'admin';
    const isTargetOwner = userRole === 'manager';
    const isTargetAccounting = userRole === 'accounting';
    const isTargetManagement = ['admin', 'manager', 'accounting', 'staff'].includes(userRole);

    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isPhenixModalOpen, setIsPhenixModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // Organization Scope State (synchronized with URL params)
    const initialOrgId = searchParams.get('org') || 'all';
    const initialStatus = searchParams.get('status') || 'all';
    const [selectedOrgId, setSelectedOrgId] = useState(initialOrgId);

    const [organizations, setOrganizations] = useState([
        { id: 'all', name: isRTL ? 'جميع الحسابات (نظرة شاملة)' : 'All Network Organizations', balance: 0 },
    ]);

    // Fetch live organizations from backend
    useEffect(() => {
        let isMounted = true;
        organizationService.getOrganizations()
            .then(res => {
                const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                if (list.length > 0 && isMounted) {
                    const totalBal = list.reduce((acc, o) => acc + (Number(o.balance) || 0), 0);
                    const mapped = list.map(o => ({
                        id: o.id,
                        name: o.name,
                        balance: Number(o.balance) || 0,
                    }));
                    setOrganizations([
                        { id: 'all', name: isRTL ? 'جميع الحسابات (نظرة شاملة)' : 'All Network Organizations', balance: totalBal },
                        ...mapped
                    ]);
                }
            })
            .catch(() => {
                // Keep initial state
            });
        return () => { isMounted = false; };
    }, [isRTL]);

    // Keep state in sync with URL
    useEffect(() => {
        const orgFromUrl = searchParams.get('org');
        if (orgFromUrl && orgFromUrl !== selectedOrgId) {
            setSelectedOrgId(orgFromUrl);
        }
    }, [searchParams, selectedOrgId]);

    const handleOrgChange = (newOrgId) => {
        setSelectedOrgId(newOrgId);
        const newParams = new URLSearchParams(searchParams);
        if (newOrgId === 'all') {
            newParams.delete('org');
        } else {
            newParams.set('org', newOrgId);
        }
        setSearchParams(newParams);
    };

    const activeOrg = useMemo(() => {
        return organizations.find(o => o.id === selectedOrgId) || organizations[0];
    }, [organizations, selectedOrgId]);

    return (
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-4 py-3 space-y-5">
            
            {/* Command Header: Identity, Account Scope, and Actions */}
            <div className="bg-base-100 border border-base-200/90 shadow-sm rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                
                {/* Left: Icon, Title & Role Clearance */}
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <span className="material-symbols-outlined text-2xl">local_shipping</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-base-content">
                                {t('shipments_title', 'Consignment & Dispatch Center')}
                            </h1>
                            <span className="badge badge-primary text-[11px] font-black uppercase tracking-wider py-2">
                                {getRoleLabel(userRole)}
                            </span>
                            {isSuperadmin && <span className="badge badge-outline text-[10px] font-bold">Admin Clearance</span>}
                            {isTargetOwner && <span className="badge badge-warning text-[10px] font-bold">Executive Authority</span>}
                            {isTargetAccounting && <span className="badge badge-accent text-[10px] font-bold">Finance Controller</span>}
                        </div>
                        <p className="text-xs text-base-content/60 font-semibold mt-0.5">
                            {t('shipments_subtitle', 'Manage end-to-end consignment manifests, dual-carrier trade routes, and delivery triage.')}
                        </p>
                    </div>
                </div>

                {/* Right: Organization Scope Selector & Quick Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    
                    {/* Organization Dropdown (Matches Dashboard selector) */}
                    {isTargetManagement && (
                        <div className="form-control">
                            <label className="label py-0.5 px-1">
                                <span className="label-text text-[10.5px] font-black uppercase tracking-wider text-base-content/60">
                                    {isRTL ? 'نطاق الحساب المحدد' : 'Selected Account Scope'}
                                </span>
                            </label>
                            <select 
                                value={selectedOrgId} 
                                onChange={(e) => handleOrgChange(e.target.value)}
                                className="select select-bordered select-sm rounded-xl font-bold text-xs bg-base-100 text-base-content w-full sm:w-64"
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 sm:self-end">
                        {isTargetManagement && (
                            <button
                                type="button"
                                onClick={() => setIsPhenixModalOpen(true)}
                                className="btn btn-outline btn-accent btn-sm rounded-xl font-bold flex-1 sm:flex-initial gap-1.5"
                            >
                                <span className="material-symbols-outlined text-base">sync_alt</span>
                                {t('sync_phenix_erp', 'Sync Phenix')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setIsBulkModalOpen(true)}
                            className="btn btn-outline btn-sm rounded-xl font-bold flex-1 sm:flex-initial"
                        >
                            <span className="material-symbols-outlined text-base text-primary">upload_file</span>
                            {t('bulk_import_csv', 'Bulk Import')}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/shipment/new')}
                            className="btn btn-primary btn-sm rounded-xl font-extrabold shadow-sm flex-1 sm:flex-initial gap-1.5"
                        >
                            <span className="material-symbols-outlined text-base">add_circle</span>
                            {t('new_shipment', 'New Shipment')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Active Account Scope Alert Ribbon (Visible when filtering to a specific client organization) */}
            {selectedOrgId !== 'all' && (
                <div className="alert bg-primary/5 border border-primary/20 rounded-2xl py-2.5 px-4 flex items-center justify-between text-xs animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5 font-bold text-base-content flex-wrap">
                        <span className="material-symbols-outlined text-primary text-base">apartment</span>
                        <span>{isRTL ? 'تصفية الشحنات لحساب:' : 'Filtered to client:'} <strong className="text-primary">{activeOrg.name}</strong></span>
                        {activeOrg.balance !== undefined && (
                            <span className="badge badge-sm badge-outline font-mono">
                                {isRTL ? `الرصيد القائم: ${activeOrg.balance.toFixed(3)} د.ك` : `Ledger: ${activeOrg.balance.toFixed(3)} KWD`}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to={`/dashboard?org=${selectedOrgId}`} className="btn btn-ghost btn-xs text-primary font-bold">
                            {isRTL ? 'لوحة تحكم الحساب' : 'Account Cockpit'}
                        </Link>
                        <button 
                            onClick={() => handleOrgChange('all')}
                            className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content font-bold"
                        >
                            {isRTL ? 'إلغاء التصفية (عرض الكل)' : 'Clear Filter (Show All)'}
                        </button>
                    </div>
                </div>
            )}

            {/* Revamped Shipment List Component with Canonical Continuity */}
            <ShipmentList 
                key={`${refreshKey}-${selectedOrgId}-${initialStatus}`} 
                organizationId={selectedOrgId}
                initialFilter={initialStatus}
            />

            {/* Bulk Shipment Import Modal */}
            <BulkShipmentImportModal
                isOpen={isBulkModalOpen}
                onClose={() => setIsBulkModalOpen(false)}
                onImportSuccess={() => setRefreshKey(prev => prev + 1)}
            />

            {/* Phenix ERP Ingestion & Synchronization Modal */}
            <PhenixSyncModal
                isOpen={isPhenixModalOpen}
                onClose={() => setIsPhenixModalOpen(false)}
                onSyncSuccess={() => setRefreshKey(prev => prev + 1)}
            />
        </div>
    );
};

export default ShipmentsPage;
