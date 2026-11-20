import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getRoleLabel } from '../../utils/roleLabels';
import { CAPABILITIES, hasCapability } from '../../utils/capabilities';
import {
    canViewCarrier,
    sanitizeCarrierTextForRole,
    MASKED_CARRIER_LABEL
} from '../../utils/carrierVisibility';
import { useShipments } from '../../utils/useShipments';
import { useShipmentStats } from '../../utils/useShipmentStats';
import { shipmentService, organizationService } from '../../services/api';
import {
    buildShipmentDeleteBlockedMessage,
    canDeleteShipmentStatus,
    hasCarrierBooking,
    getShipmentDeleteErrorMessage
} from '../../utils/shipmentDeletionPolicy';

// V2 Design System Components
import MetricCardV2 from './components/MetricCardV2';
import ErrorBannerV2 from './components/ErrorBannerV2';
import EmptyStateV2 from './components/EmptyStateV2';
import DashboardSkeletonV2 from './components/DashboardSkeletonV2';
import ShipmentsFilterBarV2, {
    CARRIER_OPTIONS_V2,
    CORRIDOR_OPTIONS_V2
} from './shipments/ShipmentsFilterBarV2';
import ShipmentsTableV2 from './shipments/ShipmentsTableV2';

// Shared Modals & Drawers
import ShipmentInspectorDrawer from '../../components/common/ShipmentInspectorDrawer';
import BulkShipmentImportModal from '../../components/BulkShipmentImportModal';
import PhenixSyncModal from '../../components/PhenixSyncModal';
import UndeliveredLogModal from '../../components/UndeliveredLogModal';

/**
 * Normalize status filter parameter from URL (supports both snake_case and camelCase)
 */
const normalizeStatusParam = (raw) => {
    const val = String(raw || 'all').trim();
    if (!val || val === 'all') return 'all';
    const map = {
        pendingApproval: 'pending_approval',
        pending_approval: 'pending_approval',
        readyForPickup: 'ready_for_pickup',
        ready_for_pickup: 'ready_for_pickup',
        pending: 'ready_for_pickup',
        active: 'in_transit',
        in_transit: 'in_transit',
        inTransit: 'in_transit',
        outForDelivery: 'out_for_delivery',
        out_for_delivery: 'out_for_delivery',
        delivered: 'delivered',
        exceptions: 'exception',
        exception: 'exception'
    };
    return map[val] || 'all';
};

/**
 * Normalize carrier parameter from URL
 */
const normalizeCarrierParam = (raw) => {
    const val = String(raw || '').toUpperCase().trim();
    if (!val || val === 'ALL') return 'ALL';
    if (['DHL', 'DGR', 'DGR2', 'DHL2'].includes(val)) return 'DHL';
    if (['ARAMEX', 'ARM'].includes(val)) return 'ARAMEX';
    if (['FEDEX', 'FDX'].includes(val)) return 'FEDEX';
    if (['SMSA', 'SMSAEXPRESS'].includes(val)) return 'SMSA';
    if (['OTE', 'LOGESTECHS'].includes(val)) return 'OTE';
    if (['POSTA_PLUS', 'POSTAPLUS', 'PST'].includes(val)) return 'POSTA_PLUS';
    if (['INTERNAL', 'MAN', 'MANUAL'].includes(val)) return 'INTERNAL';
    if (['SEA_FREIGHT', 'SEA'].includes(val)) return 'SEA_FREIGHT';
    if (['LAND_FREIGHT', 'LAND'].includes(val)) return 'LAND_FREIGHT';
    return val;
};

/**
 * Normalize corridor or destination country parameter (e.g. "kw-sa", "KW ⇄ SA", "SA")
 */
const normalizeCorridorParam = (raw) => {
    const val = String(raw || '').toUpperCase().trim();
    if (!val || val === 'ALL') return 'ALL';
    if (/^[A-Z]{2}$/.test(val)) return val;
    const parts = val.split(/[-⇄→>\s]+/).filter((p) => /^[A-Z]{2}$/.test(p));
    if (parts.length >= 2) return parts[parts.length - 1];
    if (parts.length === 1) return parts[0];
    return 'ALL';
};

/**
 * Status Stage -> Backend statusIn query mapping
 */
const STAGE_STATUS_QUERY = {
    all: undefined,
    pending_approval: 'pending_approval',
    ready_for_pickup: 'ready_for_pickup,pending,draft,created,updated',
    in_transit: 'picked_up,received_at_hub,verified,in_transit,booked',
    out_for_delivery: 'out_for_delivery',
    delivered: 'delivered,completed',
    exception: 'exception,failed,cancelled,returned'
};

/**
 * Resolve Carrier Metadata (Name & Brand Dot)
 */
const resolveCarrierDisplay = (shipment, isRTL = false) => {
    const raw = String(
        shipment?.carrierCode || shipment?.carrier || shipment?.assignedCarrier || ''
    )
        .toUpperCase()
        .trim();

    if (raw === 'DGR2' || raw === 'DHL2') {
        return {
            code: 'DHL',
            name: isRTL ? 'دي إتش إل' : 'DHL',
            dotClass: 'bg-[#FFCC00] ring-1 ring-[#D40511]/50'
        };
    }
    if (raw === 'DGR' || raw === 'DHL' || raw.includes('DHL')) {
        return {
            code: 'DGR',
            name: 'DGR',
            dotClass: 'bg-[#FFCC00] ring-1 ring-[#D40511]/50'
        };
    }
    if (raw === 'ARM' || raw === 'ARAMEX' || raw.includes('ARAMEX')) {
        return {
            code: 'ARAMEX',
            name: isRTL ? 'أرامكس' : 'Aramex',
            dotClass: 'bg-[#D9232D]'
        };
    }
    if (raw === 'FDX' || raw === 'FEDEX' || raw.includes('FEDEX')) {
        return {
            code: 'FEDEX',
            name: isRTL ? 'فيديكس إكسبريس' : 'FedEx Express',
            dotClass: 'bg-[#4D148C] dark:bg-[#a855f7]'
        };
    }
    if (raw === 'SMSA' || raw === 'SMSAEXPRESS' || raw.includes('SMSA')) {
        return {
            code: 'SMSA',
            name: isRTL ? 'سمسا إكسبريس' : 'SMSA Express',
            dotClass: 'bg-[#ea580c]'
        };
    }
    if (raw === 'OTE' || raw === 'LOGESTECHS') {
        return {
            code: 'OTE',
            name: isRTL ? 'تارجت الخليج (OTE)' : 'Target GCC (OTE)',
            dotClass: 'bg-sky-500'
        };
    }
    if (raw === 'POSTA_PLUS' || raw === 'POSTAPLUS' || raw === 'PST') {
        return {
            code: 'POSTA_PLUS',
            name: isRTL ? 'بوستا بلس' : 'Posta Plus',
            dotClass: 'bg-teal-500'
        };
    }
    if (raw === 'MAN' || raw === 'INTERNAL' || raw === 'MANUAL') {
        return {
            code: 'INTERNAL',
            name: isRTL ? 'الأسطول الداخلي' : 'Internal Fleet',
            dotClass: 'bg-emerald-600 dark:bg-emerald-400'
        };
    }
    return {
        code: raw || 'TARGET',
        name: raw || (isRTL ? 'تارجت إكسبريس' : 'Target Express'),
        dotClass: 'bg-primary'
    };
};

/**
 * Adapter: Raw Backend Shipment -> V2 Table Row (with strict RBAC cost scrubbing)
 */
const toShipmentRowV2 = (s, { isRTL = false, canViewCostData = false } = {}) => {
    const originCity =
        s.originCity ||
        s.sender?.city ||
        (typeof s.origin === 'string' ? s.origin.split(',')[0] : s.origin?.city) ||
        'Kuwait City';
    const originCountry =
        s.originCountry ||
        s.sender?.countryCode ||
        s.originCountryCode ||
        (typeof s.origin === 'object' ? s.origin?.countryCode : null) ||
        'KW';
    const destCity =
        s.destCity ||
        s.destinationCity ||
        s.receiver?.city ||
        (typeof s.destination === 'string'
            ? s.destination.split(',')[0]
            : s.destination?.city) ||
        'Riyadh';
    const destCountry =
        s.destCountry ||
        s.receiver?.countryCode ||
        s.destinationCountryCode ||
        (typeof s.destination === 'object' ? s.destination?.countryCode : null) ||
        'SA';

    const isTest = Boolean(
        s.isTest === true ||
            s.environment === 'test' ||
            s.pricingSnapshot?.isTest === true ||
            s.pricingSnapshot?.environment === 'test'
    );

    const customerName =
        s.receiver?.contactPerson ||
        s.receiver?.name ||
        s.receiverName ||
        (typeof s.destination === 'object'
            ? s.destination?.contactPerson ||
              s.destination?.name ||
              s.destination?.company
            : null) ||
        (typeof s.customer === 'object'
            ? s.customer?.name || s.customer?.contactPerson
            : typeof s.customer === 'string'
            ? s.customer
            : null) ||
        (isRTL ? 'مستلم معتمد' : 'Verified Consignee');

    const customerPhone =
        s.receiver?.phone ||
        s.receiverPhone ||
        (typeof s.destination === 'object' ? s.destination?.phone : null) ||
        (typeof s.customer === 'object' ? s.customer?.phone : null) ||
        (typeof s.phone === 'string' ? s.phone : null) ||
        '—';

    const carrierInfo = resolveCarrierDisplay(s, isRTL);

    const createdDateObj = s.createdAt ? new Date(s.createdAt) : null;
    const createdFormatted =
        createdDateObj && !Number.isNaN(createdDateObj.getTime())
            ? createdDateObj.toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'Asia/Kuwait'
              })
            : '—';

    const statusLower = String(s.status || 'draft').toLowerCase();
    let eta = isRTL ? 'قيد الجدولة' : 'Scheduled';
    let etaTone = 'neutral';

    if (statusLower === 'delivered' || statusLower === 'completed') {
        eta = isRTL ? 'تم التسليم' : 'Delivered';
        etaTone = 'success';
    } else if (['exception', 'failed', 'cancelled', 'returned'].includes(statusLower)) {
        eta = isRTL ? 'معلق / استثناء' : 'Exception Hold';
        etaTone = 'error';
    } else if (statusLower === 'out_for_delivery') {
        eta = isRTL ? 'اليوم (خارج للتسليم)' : 'Today (Out for Delivery)';
        etaTone = 'warning';
    } else if (s.estimatedDelivery) {
        const etaDate = new Date(s.estimatedDelivery);
        if (!Number.isNaN(etaDate.getTime())) {
            eta = etaDate.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short'
            });
        }
    } else if (['draft', 'pending_approval'].includes(statusLower)) {
        eta = isRTL ? 'بانتظار الاعتماد' : 'Pending Approval';
        etaTone = 'warning';
    } else {
        eta = isRTL ? 'خلال يومي عمل' : '~2 Business Days';
    }

    const orgLabel =
        s.organization?.name ||
        s.organizationName ||
        (s.user?.role === 'client'
            ? isRTL
                ? 'حساب فردي مباشر'
                : 'Individual Direct Account'
            : isRTL
            ? 'شاحن مباشر'
            : 'Direct Shipper');

    const createdByLabel =
        s.user?.name || s.creator?.name || s.createdByName || s.createdBy || '—';

    const parcelWeight =
        s.weight ||
        s.package?.weight ||
        (Array.isArray(s.parcels) && s.parcels.length > 0
            ? s.parcels.reduce((acc, p) => acc + (Number(p.weight) || 0), 0)
            : null) ||
        1.5;

    const priceNum =
        s.price !== undefined && s.price !== null
            ? Number(s.price)
            : s.pricingSnapshot?.total !== undefined
            ? Number(s.pricingSnapshot.total)
            : null;

    // Strictly scrub wholesale cost & margin unless canViewCostData is true
    let costPrice = null;
    let marginAmount = null;
    if (canViewCostData) {
        const rawCost =
            s.costPrice ??
            s.pricingSnapshot?.carrierRate ??
            s.pricingSnapshot?.baseRate ??
            null;
        if (rawCost !== null && rawCost !== undefined && !Number.isNaN(Number(rawCost))) {
            costPrice = Number(rawCost);
        }
        const rawMarkup =
            s.markupAmount ??
            s.pricingSnapshot?.markup ??
            (priceNum !== null && costPrice !== null ? priceNum - costPrice : null);
        if (
            rawMarkup !== null &&
            rawMarkup !== undefined &&
            !Number.isNaN(Number(rawMarkup))
        ) {
            marginAmount = Number(rawMarkup);
        }
    }

    return {
        // Spread raw shipment properties so ShipmentInspectorDrawer receives history, createdAt, origin, destination, etc.
        ...s,
        raw: s,
        id: s.id || s._id || s.trackingNumber,
        trackingNumber: s.trackingNumber || '—',
        isTest,
        carrierCode: carrierInfo.code,
        carrierName: carrierInfo.name,
        carrierDotClass: carrierInfo.dotClass,
        org: orgLabel,
        createdBy: createdByLabel,
        originCity,
        originCountry,
        destCity,
        destCountry,
        status: s.status || 'draft',
        customer: customerName,
        phone: customerPhone,
        created: createdFormatted,
        isImported: Boolean(
            s.documents?.phenixBillId || s.documents?.source === 'PHENIX_ERP'
        ),
        eta,
        etaTone,
        service: s.serviceType || s.service || s.serviceCode || 'Express Air',
        weight: parcelWeight,
        price: priceNum,
        paid: Boolean(s.paid),
        costPrice,
        marginAmount
    };
};

/**
 * ShipmentsV2Page - Isolated V2 Consignment & Dispatch Cockpit
 */
export const ShipmentsV2Page = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useAuth();
    const { lang } = useLanguage();
    const isRTL = lang === 'ar';
    const { enqueueSnackbar } = useSnackbar();
    const { mutate: globalMutate } = useSWRConfig();

    // Strict RBAC & Capability Matrix (Aligned with docs/ROLE_HIERARCHY_AND_ACCESS.md)
    const userRole = user?.role || 'client';
    const canViewAllOrgs =
        ['admin', 'manager', 'accounting'].includes(userRole) &&
        hasCapability(userRole, CAPABILITIES.VIEW_ALL_SHIPMENTS);
    const canViewCostData =
        ['admin', 'accounting'].includes(userRole) &&
        hasCapability(userRole, CAPABILITIES.VIEW_COST_DATA);
    const canViewFinance =
        ['admin', 'manager', 'accounting'].includes(userRole) &&
        hasCapability(userRole, CAPABILITIES.VIEW_FINANCE);
    const isClientRole = ['org_manager', 'org_agent', 'client'].includes(userRole);
    const canViewRetailPrice = canViewFinance || isClientRole;
    const canApproveShipments =
        ['admin', 'manager', 'accounting', 'staff'].includes(userRole) &&
        hasCapability(userRole, CAPABILITIES.APPROVE_SHIPMENTS);
    const canDeleteShipments = ['admin', 'manager', 'accounting'].includes(userRole);
    const canExportData = ['admin', 'manager', 'accounting'].includes(userRole);
    const canSyncErp = ['admin', 'manager', 'accounting'].includes(userRole);
    const canCreateShipment = hasCapability(userRole, CAPABILITIES.CREATE_SHIPMENTS);
    const canBulkImport =
        canCreateShipment &&
        ['admin', 'manager', 'accounting', 'staff', 'org_manager'].includes(userRole);
    const canViewDocuments =
        hasCapability(userRole, CAPABILITIES.VIEW_DOCUMENTS) || isClientRole;

    // Initial URL Query Params
    const initialOrgId = canViewAllOrgs ? searchParams.get('org') || 'all' : 'all';
    const initialStage = normalizeStatusParam(searchParams.get('status'));
    const initialCarrier = normalizeCarrierParam(
        searchParams.get('carrier') || searchParams.get('carrierCode')
    );
    const initialCorridor = normalizeCorridorParam(
        searchParams.get('corridor') ||
            searchParams.get('destinationCountry') ||
            searchParams.get('destCountry')
    );
    const initialPeriod = searchParams.get('period') || 'this_month';
    const initialSearch = searchParams.get('q') || '';

    // Filter & Pagination State
    const [selectedOrgId, setSelectedOrgId] = useState(initialOrgId);
    const [activeStage, setActiveStage] = useState(initialStage);
    const [selectedCarrier, setSelectedCarrier] = useState(initialCarrier);
    const [selectedCorridor, setSelectedCorridor] = useState(initialCorridor);
    const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);
    const [customStartDate, setCustomStartDate] = useState(
        searchParams.get('startDate') || ''
    );
    const [customEndDate, setCustomEndDate] = useState(
        searchParams.get('endDate') || ''
    );
    const [search, setSearch] = useState(initialSearch);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [selectedIds, setSelectedIds] = useState([]);

    // Modals & Drawer State
    const [inspectingShipment, setInspectingShipment] = useState(null);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isPhenixModalOpen, setIsPhenixModalOpen] = useState(false);
    const [isUndeliveredModalOpen, setIsUndeliveredModalOpen] = useState(false);

    // Organizations List (Only fetched for platform-wide roles)
    const [organizations, setOrganizations] = useState([]);
    const [orgFetchError, setOrgFetchError] = useState(null);

    const fetchOrganizations = async () => {
        if (!canViewAllOrgs) return;
        try {
            setOrgFetchError(null);
            const res = await organizationService.getOrganizations();
            const list = Array.isArray(res?.data)
                ? res.data
                : Array.isArray(res)
                ? res
                : [];
            setOrganizations(
                list.map((o) => ({
                    id: o.id,
                    name: o.name,
                    balance: Number(o.balance) || 0,
                    creditLimit: Number(o.creditLimit) || 0
                }))
            );
        } catch (err) {
            setOrgFetchError(
                err?.message || 'Failed to load network organizations list.'
            );
        }
    };

    useEffect(() => {
        fetchOrganizations();
    }, [canViewAllOrgs]);

    // Sync state when URL searchParams change externally (e.g. deep-links)
    useEffect(() => {
        const nextOrg = canViewAllOrgs ? searchParams.get('org') || 'all' : 'all';
        const nextStage = normalizeStatusParam(searchParams.get('status'));
        const nextCarrier = normalizeCarrierParam(
            searchParams.get('carrier') || searchParams.get('carrierCode')
        );
        const nextCorridor = normalizeCorridorParam(
            searchParams.get('corridor') ||
                searchParams.get('destinationCountry') ||
                searchParams.get('destCountry')
        );
        const nextPeriod = searchParams.get('period') || 'this_month';
        const nextQ = searchParams.get('q') || '';

        if (nextOrg !== selectedOrgId) setSelectedOrgId(nextOrg);
        if (nextStage !== activeStage) setActiveStage(nextStage);
        if (nextCarrier !== selectedCarrier) setSelectedCarrier(nextCarrier);
        if (nextCorridor !== selectedCorridor) setSelectedCorridor(nextCorridor);
        if (nextPeriod !== selectedPeriod) setSelectedPeriod(nextPeriod);
        if (nextQ !== search) setSearch(nextQ);
    }, [searchParams, canViewAllOrgs]);

    // Update URL helper
    const updateUrlParams = (updates = {}) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(updates).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '' || v === 'all' || v === 'ALL') {
                next.delete(k);
            } else {
                next.set(k, String(v));
            }
        });
        setSearchParams(next, { replace: true });
    };

    const handleOrgChange = (nextOrgId) => {
        setSelectedOrgId(nextOrgId);
        setPage(1);
        setSelectedIds([]);
        updateUrlParams({ org: nextOrgId });
    };

    const handleStageChange = (nextStage) => {
        setActiveStage(nextStage);
        setPage(1);
        setSelectedIds([]);
        updateUrlParams({ status: nextStage });
    };

    const handleCarrierChange = (nextCarrier) => {
        setSelectedCarrier(nextCarrier);
        setPage(1);
        setSelectedIds([]);
        updateUrlParams({ carrier: nextCarrier, carrierCode: null });
    };

    const handleCorridorChange = (nextCorridor) => {
        setSelectedCorridor(nextCorridor);
        setPage(1);
        setSelectedIds([]);
        updateUrlParams({
            corridor: nextCorridor,
            destinationCountry: null,
            destCountry: null
        });
    };

    const handlePeriodChange = (nextPeriod) => {
        setSelectedPeriod(nextPeriod);
        setPage(1);
        setSelectedIds([]);
        if (nextPeriod !== 'custom') {
            setCustomStartDate('');
            setCustomEndDate('');
            updateUrlParams({
                period: nextPeriod === 'this_month' ? null : nextPeriod,
                startDate: null,
                endDate: null
            });
        } else {
            updateUrlParams({ period: 'custom' });
        }
    };

    const handleCustomDateChange = (start, end) => {
        setCustomStartDate(start);
        setCustomEndDate(end);
        setSelectedPeriod('custom');
        setPage(1);
        updateUrlParams({
            period: 'custom',
            startDate: start || null,
            endDate: end || null
        });
    };

    const handleSearchChange = (val) => {
        setSearch(val);
        setPage(1);
        updateUrlParams({ q: val || null });
    };

    const handleResetAllFilters = () => {
        setSelectedOrgId('all');
        setActiveStage('all');
        setSelectedCarrier('ALL');
        setSelectedCorridor('ALL');
        setSelectedPeriod('this_month');
        setCustomStartDate('');
        setCustomEndDate('');
        setSearch('');
        setPage(1);
        setSelectedIds([]);
        setSearchParams(new URLSearchParams(), { replace: true });
    };

    // SWR Data Queries
    const {
        stats,
        loading: statsLoading,
        error: statsError
    } = useShipmentStats({
        organizationId: canViewAllOrgs && selectedOrgId !== 'all' ? selectedOrgId : undefined,
        carrier: selectedCarrier !== 'ALL' ? selectedCarrier : undefined,
        period: selectedPeriod !== 'all' ? selectedPeriod : undefined,
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined
    });

    const {
        shipments: rawShipments,
        pagination,
        loading: shipmentsLoading,
        error: shipmentsError,
        mutate: mutateShipments
    } = useShipments({
        page,
        limit: perPage,
        q: search || undefined,
        statusIn: STAGE_STATUS_QUERY[activeStage],
        organizationId: canViewAllOrgs && selectedOrgId !== 'all' ? selectedOrgId : undefined,
        carrier: selectedCarrier !== 'ALL' ? selectedCarrier : undefined,
        destinationCountry: selectedCorridor !== 'ALL' ? selectedCorridor : undefined,
        period: selectedPeriod !== 'all' ? selectedPeriod : undefined,
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined
    });

    const shipments = useMemo(() => {
        return (rawShipments || []).map((s) =>
            toShipmentRowV2(s, { isRTL, canViewCostData })
        );
    }, [rawShipments, isRTL, canViewCostData]);

    const total = pagination?.total || 0;
    const totalPages = Math.max(1, pagination?.pages || 1);

    // Stage Filter Pills with Live Telemetry Counts
    const stagePills = useMemo(() => {
        const readyPickupCount =
            stats?.readyForPickup != null
                ? stats.readyForPickup
                : (stats?.pending || 0) + (stats?.drafts || 0);
        const activeTransitCount = (stats?.inTransit || 0) + (stats?.pickedUp || 0);

        return [
            {
                id: 'all',
                label: isRTL ? 'الكل' : 'All Manifests',
                count: stats?.total || 0
            },
            {
                id: 'pending_approval',
                label: isRTL ? 'بانتظار الاعتماد' : 'Pending Approval',
                count: stats?.pendingApproval || 0
            },
            {
                id: 'ready_for_pickup',
                label: isRTL ? 'جاهز للاستلام' : 'Ready for Pickup',
                count: readyPickupCount
            },
            {
                id: 'in_transit',
                label: isRTL ? 'قيد النقل' : 'In Transit',
                count: activeTransitCount
            },
            {
                id: 'out_for_delivery',
                label: isRTL ? 'خارج للتسليم' : 'Out for Delivery',
                count: stats?.outForDelivery || 0
            },
            {
                id: 'exception',
                label: isRTL ? 'استثناء وتنبيه' : 'Exceptions & Holds',
                count: stats?.exceptions || 0,
                isAlert: true
            },
            {
                id: 'delivered',
                label: isRTL ? 'تم التسليم' : 'Delivered',
                count: stats?.delivered || 0
            }
        ];
    }, [stats, isRTL]);

    // Active Account Scope Title
    const currentScopeTitle = useMemo(() => {
        if (userRole === 'client' && !user?.organizationId) {
            return isRTL ? 'حساب فردي مباشر' : 'Individual Direct Account';
        }
        if (!canViewAllOrgs) {
            return (
                user?.organization?.name ||
                (isRTL ? 'شحنات الحساب المخصصة' : 'Scoped Consignment Manifest')
            );
        }
        if (selectedOrgId === 'all') {
            return isRTL
                ? 'جميع الحسابات (نظرة شاملة)'
                : 'All Network Organizations';
        }
        const found = organizations.find((o) => String(o.id) === String(selectedOrgId));
        return found?.name || (isRTL ? 'حساب محدد' : 'Selected Organization');
    }, [userRole, user, canViewAllOrgs, selectedOrgId, organizations, isRTL]);

    const activeOrgDetails = useMemo(() => {
        if (!canViewAllOrgs || selectedOrgId === 'all') return null;
        return organizations.find((o) => String(o.id) === String(selectedOrgId)) || null;
    }, [canViewAllOrgs, selectedOrgId, organizations]);

    const financials = stats?.financials || null;
    const formatKWD = (num) =>
        `${Number(num || 0).toLocaleString('en-US', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        })} ${isRTL ? 'د.ك' : 'KWD'}`;

    const hasActiveFilters =
        selectedOrgId !== 'all' ||
        activeStage !== 'all' ||
        selectedCarrier !== 'ALL' ||
        selectedCorridor !== 'ALL' ||
        Boolean(search) ||
        selectedPeriod === 'custom';

    // Selection Handlers
    const toggleSelectAll = () => {
        if (shipments.length > 0 && selectedIds.length === shipments.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(shipments.map((s) => s.id));
        }
    };

    const toggleSelectRow = (id, e) => {
        e?.stopPropagation();
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    // Shipment Row Actions
    const handleInspect = (s) => {
        setInspectingShipment(s);
    };

    const handleOpenDossier = (trackingNumber) => {
        navigate(`/shipment-v2/${trackingNumber}`);
    };

    const handleApproveOrEdit = (s) => {
        if (!canApproveShipments) return;
        navigate(`/shipment-v2/${s.trackingNumber}?action=approve`);
    };

    const handleOpenInvoice = (s) => {
        navigate(`/shipment-v2/${s.trackingNumber}#invoice`);
    };

    const handleDownloadLabel = async (s) => {
        const raw = s.raw || s;
        const existingLabel =
            raw.labelUrl ||
            raw.awbUrl ||
            (Array.isArray(raw.documents)
                ? raw.documents.find((d) =>
                      ['label', 'awb', 'waybilldoc'].includes(
                          String(d?.type || '').toLowerCase()
                      )
                  )?.url
                : null);

        const openDocUrl = async (url) => {
            if (typeof url === 'string' && url.startsWith('data:application/pdf;base64,')) {
                const byteCharacters = atob(url.split(',')[1]);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const blobUrl = URL.createObjectURL(
                    new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' })
                );
                window.open(blobUrl, '_blank');
            } else {
                const { BACKEND_URL } = await import('../../services/api');
                const finalUrl = url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
                window.open(finalUrl, '_blank');
            }
        };

        if (existingLabel) {
            await openDocUrl(existingLabel);
            return;
        }

        const canSeeCarrier = canViewCarrier(user?.role);
        const carrierCode = String(raw.carrierCode || raw.carrier || '').toUpperCase();
        if (
            carrierCode &&
            carrierCode !== 'INTERNAL' &&
            hasCapability(userRole, CAPABILITIES.BOOK_CARRIERS)
        ) {
            try {
                const displayCarrierToast = canSeeCarrier
                    ? (carrierCode === 'DGR' ? 'DGR' : (carrierCode === 'DGR2' ? 'DHL' : carrierCode))
                    : MASKED_CARRIER_LABEL;
                enqueueSnackbar(
                    isRTL
                        ? 'جاري جلب بوليصة الشحن الرسمية من الناقل...'
                        : `Fetching official label from ${displayCarrierToast}...`,
                    { variant: 'info' }
                );
                const res = await shipmentService.generateCarrierDocuments(
                    raw.trackingNumber
                );
                const docUrl = res?.data?.labelUrl || res?.data?.awbUrl;
                if (docUrl) {
                    await openDocUrl(docUrl);
                    enqueueSnackbar(
                        isRTL
                            ? 'تم فتح بوليصة الناقل الرسمية بنجاح'
                            : `Official ${displayCarrierToast} label opened`,
                        { variant: 'success' }
                    );
                    return;
                }
            } catch (carrierErr) {
                enqueueSnackbar(
                    carrierErr.response?.data?.error ||
                        carrierErr.response?.data?.message ||
                        carrierErr.message ||
                        'Failed to fetch carrier label',
                    { variant: 'error' }
                );
                return;
            }
        }

        try {
            const { generateWaybillPDF } = await import('../../utils/pdfGenerator');
            await generateWaybillPDF(raw);
            enqueueSnackbar(`Waybill generated for ${s.trackingNumber}`, {
                variant: 'success'
            });
        } catch {
            enqueueSnackbar('Failed to generate waybill PDF', { variant: 'error' });
        }
    };

    const handleDelete = async (s) => {
        if (!canDeleteShipments) return;
        const rawShipment = s.raw || s;
        if (!canDeleteShipmentStatus(s.status, rawShipment, userRole)) {
            enqueueSnackbar(
                buildShipmentDeleteBlockedMessage(s.status, hasCarrierBooking(rawShipment))
                    .short,
                { variant: 'warning' }
            );
            return;
        }
        if (
            !window.confirm(
                isRTL
                    ? `هل أنت متأكد من حذف الشحنة ${s.trackingNumber} نهائياً؟`
                    : `Are you sure you want to permanently delete shipment ${s.trackingNumber}?`
            )
        ) {
            return;
        }
        try {
            await shipmentService.deleteShipment(s.trackingNumber);
            enqueueSnackbar(
                isRTL
                    ? `تم حذف الشحنة ${s.trackingNumber} بنجاح`
                    : `Shipment ${s.trackingNumber} deleted`,
                { variant: 'success' }
            );
            mutateShipments();
        } catch (e) {
            enqueueSnackbar(getShipmentDeleteErrorMessage(e, s.status), {
                variant: 'warning'
            });
        }
    };

    // Real Client-Side CSV Export (for current view or selected rows)
    const exportRowsToCsv = (rowsToExport, filenamePrefix = 'target-shipments-v2') => {
        if (!rowsToExport || rowsToExport.length === 0) {
            enqueueSnackbar(
                isRTL ? 'لا توجد شحنات لتصديرها' : 'No shipments available to export',
                { variant: 'warning' }
            );
            return;
        }
        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
        };
        const headers = [
            'Tracking Number',
            'Carrier',
            'Service',
            'Status',
            'Origin City',
            'Origin Country',
            'Destination City',
            'Destination Country',
            'Consignee',
            'Phone',
            'Organization',
            'Weight (kg)',
            'Created Date',
            'ETA'
        ];
        if (canViewRetailPrice) {
            headers.push('Billed Amount (KWD)', 'Payment Status');
        }
        if (canViewCostData) {
            headers.push('Wholesale Cost (KWD)', 'Gross Margin (KWD)');
        }

        const showCarrierInExport = canViewCarrier(user?.role);
        const lines = rowsToExport.map((r) => {
            const cols = [
                escapeCsv(r.trackingNumber),
                escapeCsv(showCarrierInExport ? r.carrierName : MASKED_CARRIER_LABEL),
                escapeCsv(showCarrierInExport ? r.service : sanitizeCarrierTextForRole(r.service, user?.role)),
                escapeCsv(r.status),
                escapeCsv(r.originCity),
                escapeCsv(r.originCountry),
                escapeCsv(r.destCity),
                escapeCsv(r.destCountry),
                escapeCsv(r.customer),
                escapeCsv(r.phone),
                escapeCsv(r.org),
                escapeCsv(r.weight),
                escapeCsv(r.created),
                escapeCsv(r.eta)
            ];
            if (canViewRetailPrice) {
                cols.push(
                    escapeCsv(r.price !== null ? Number(r.price).toFixed(3) : ''),
                    escapeCsv(r.paid ? 'Paid' : 'Unpaid')
                );
            }
            if (canViewCostData) {
                cols.push(
                    escapeCsv(r.costPrice !== null ? Number(r.costPrice).toFixed(3) : ''),
                    escapeCsv(
                        r.marginAmount !== null ? Number(r.marginAmount).toFixed(3) : ''
                    )
                );
            }
            return cols.join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...lines].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.setAttribute('download', `${filenamePrefix}-${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        enqueueSnackbar(
            isRTL
                ? `تم تصدير ${rowsToExport.length} شحنة إلى ملف CSV`
                : `Exported ${rowsToExport.length} shipments to CSV`,
            { variant: 'success' }
        );
    };

    const isColdLoading = statsLoading && shipmentsLoading && shipments.length === 0;

    return (
        <div className="w-full min-h-screen pb-20">
            <div className="max-w-[1740px] mx-auto pt-5 space-y-5">
                {/* 1. V2 Cockpit Switcher Banner */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            {isRTL ? 'إدارة الشحنات V2' : 'V2 Consignment Cockpit'}
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {isRTL
                                ? 'واجهة إدارة الشحنات والبوالص المحدثة مع عزل الصلاحيات (معزولة عن V1)'
                                : 'Role-scoped consignment manifest, corridor filtering & hardened RBAC isolation'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link
                            to="/dashboard-v2"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                        >
                            <span
                                className="material-symbols-outlined text-sm leading-none text-primary dark:text-sky-400"
                                aria-hidden="true"
                            >
                                space_dashboard
                            </span>
                            <span>{isRTL ? 'لوحة V2' : 'Cockpit V2'}</span>
                        </Link>
                        <Link
                            to="/shipments"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0 whitespace-nowrap"
                        >
                            <span
                                className="material-symbols-outlined text-sm leading-none"
                                aria-hidden="true"
                            >
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>
                                {isRTL ? 'الرجوع إلى شحنات V1' : 'Switch to V1 Standard'}
                            </span>
                        </Link>
                    </div>
                </div>

                {/* 2. Error Banner (Addresses silent error swallowing in V1) */}
                {(statsError || shipmentsError || orgFetchError) && (
                    <ErrorBannerV2
                        message={
                            shipmentsError?.message ||
                            statsError?.message ||
                            orgFetchError ||
                            'Unable to synchronize consignment manifest.'
                        }
                        onRetry={() => {
                            globalMutate(
                                (key) =>
                                    typeof key === 'string' &&
                                    key.startsWith('/api/shipments/stats')
                            );
                            mutateShipments?.();
                            fetchOrganizations();
                        }}
                    />
                )}

                {/* 3. Command Header: Identity, Organization Scope, Period Controls & Role-Gated Actions */}
                <section
                    aria-label="Consignment Command Header"
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs p-4 sm:p-5 space-y-4"
                >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Left: Title & Role Clearance */}
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                            <div className="w-11 h-11 rounded-2xl bg-primary/10 dark:bg-sky-500/15 border border-primary/20 dark:border-sky-500/30 flex items-center justify-center text-primary dark:text-sky-400 shrink-0 select-none">
                                <span
                                    className="material-symbols-outlined text-2xl"
                                    aria-hidden="true"
                                >
                                    local_shipping
                                </span>
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                                        {isRTL
                                            ? 'مركز إدارة الشحنات والبوالص'
                                            : 'Consignment & Dispatch Command'}
                                    </h1>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                        {getRoleLabel(userRole)}
                                    </span>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300">
                                        {currentScopeTitle}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                    {isRTL
                                        ? 'متابعة شاملة للبوالص، مسارات الشحن الدولية، والفرز التشغيلي حسب الصلاحيات.'
                                        : 'Manage end-to-end consignment manifests, trade corridors, and delivery triage.'}
                                </p>
                            </div>
                        </div>

                        {/* Right: Organization Scope (Platform Roles Only) & Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-start lg:justify-end">
                            {canViewAllOrgs && organizations.length > 0 && (
                                <div className="relative inline-flex items-center min-w-[200px] sm:min-w-[230px] flex-1 sm:flex-initial">
                                    <select
                                        aria-label={
                                            isRTL
                                                ? 'نطاق حساب المنظمة'
                                                : 'Selected Organization Scope'
                                        }
                                        value={selectedOrgId}
                                        onChange={(e) => handleOrgChange(e.target.value)}
                                        style={{ backgroundImage: 'none' }}
                                        className="appearance-none bg-none w-full h-9 ps-3 pe-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                    >
                                        <option value="all">
                                            {isRTL
                                                ? 'جميع الحسابات (نظرة شاملة)'
                                                : 'All Network Organizations'}
                                        </option>
                                        {organizations.map((org) => (
                                            <option key={org.id} value={org.id}>
                                                {org.name}
                                            </option>
                                        ))}
                                    </select>
                                    <span
                                        className="material-symbols-outlined pointer-events-none absolute end-2.5 text-base text-slate-500 dark:text-slate-400 select-none"
                                        aria-hidden="true"
                                    >
                                        expand_more
                                    </span>
                                </div>
                            )}

                            {canSyncErp && (
                                <button
                                    type="button"
                                    onClick={() => setIsPhenixModalOpen(true)}
                                    className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                    <span
                                        className="material-symbols-outlined text-sm leading-none"
                                        aria-hidden="true"
                                    >
                                        sync_alt
                                    </span>
                                    <span>
                                        {isRTL ? 'مزامنة Phenix' : 'Sync Phenix'}
                                    </span>
                                </button>
                            )}

                            {canBulkImport && (
                                <button
                                    type="button"
                                    onClick={() => setIsBulkModalOpen(true)}
                                    className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                    <span
                                        className="material-symbols-outlined text-sm leading-none"
                                        aria-hidden="true"
                                    >
                                        upload_file
                                    </span>
                                    <span>
                                        {isRTL ? 'استيراد مجمع' : 'Bulk Import'}
                                    </span>
                                </button>
                            )}

                            {canCreateShipment && (
                                <button
                                    type="button"
                                    onClick={() => navigate('/shipment/new-v2')}
                                    className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                                >
                                    <span
                                        className="material-symbols-outlined text-sm leading-none"
                                        aria-hidden="true"
                                    >
                                        add_circle
                                    </span>
                                    <span>
                                        {isRTL ? 'شحنة جديدة' : 'New Shipment'}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Timeframe Period Bar */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                            <span
                                className="material-symbols-outlined text-base text-primary dark:text-sky-400"
                                aria-hidden="true"
                            >
                                calendar_month
                            </span>
                            <span>
                                {isRTL
                                    ? 'النطاق الزمني للبوالص:'
                                    : 'Manifest Timeframe:'}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div
                                className="inline-flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
                                role="group"
                                aria-label="Manifest Period Filter"
                            >
                                {[
                                    {
                                        id: 'today',
                                        label: isRTL ? 'اليوم' : 'Today'
                                    },
                                    {
                                        id: '7days',
                                        label: isRTL ? '٧ أيام' : '7 Days'
                                    },
                                    {
                                        id: 'this_month',
                                        label: isRTL ? 'هذا الشهر' : 'This Month'
                                    },
                                    {
                                        id: 'last_month',
                                        label: isRTL ? 'الشهر الماضي' : 'Last Month'
                                    },
                                    {
                                        id: 'all',
                                        label: isRTL ? 'الكل' : 'All Time'
                                    },
                                    {
                                        id: 'custom',
                                        label: isRTL ? 'مخصص' : 'Custom'
                                    }
                                ].map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => handlePeriodChange(p.id)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            selectedPeriod === p.id
                                                ? 'bg-slate-900 text-white dark:bg-primary dark:text-white shadow-2xs'
                                                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            {selectedPeriod === 'custom' && (
                                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <input
                                        type="date"
                                        aria-label={isRTL ? 'تاريخ البدء' : 'Start Date'}
                                        value={customStartDate}
                                        onChange={(e) =>
                                            handleCustomDateChange(
                                                e.target.value,
                                                customEndDate
                                            )
                                        }
                                        className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-100"
                                    />
                                    <span className="text-xs font-bold text-slate-500">
                                        {isRTL ? '←' : '→'}
                                    </span>
                                    <input
                                        type="date"
                                        aria-label={isRTL ? 'تاريخ الانتهاء' : 'End Date'}
                                        value={customEndDate}
                                        onChange={(e) =>
                                            handleCustomDateChange(
                                                customStartDate,
                                                e.target.value
                                            )
                                        }
                                        className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-100"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Scoped Account Ribbon (when filtered to a specific B2B organization) */}
                    {activeOrgDetails && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-primary/5 dark:bg-sky-500/10 border border-primary/20 dark:border-sky-500/30 text-xs">
                            <div className="flex flex-wrap items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                                <span
                                    className="material-symbols-outlined text-base text-primary dark:text-sky-400"
                                    aria-hidden="true"
                                >
                                    apartment
                                </span>
                                <span>
                                    {isRTL ? 'تصفية لحساب:' : 'Filtered to account:'}{' '}
                                    <strong className="text-primary dark:text-sky-300">
                                        {activeOrgDetails.name}
                                    </strong>
                                </span>
                                {canViewFinance && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px] tabular-nums">
                                        {isRTL ? 'الرصيد المتاح:' : 'Wallet Balance:'}{' '}
                                        {formatKWD(activeOrgDetails.balance)}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Link
                                    to={`/dashboard-v2?org=${activeOrgDetails.id}`}
                                    className="font-bold text-primary dark:text-sky-400 hover:underline"
                                >
                                    {isRTL ? 'مقصورة الحساب' : 'Account Cockpit'}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => handleOrgChange('all')}
                                    className="font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer"
                                >
                                    {isRTL ? 'إلغاء التصفية' : 'Clear Scope'}
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {isColdLoading ? (
                    <DashboardSkeletonV2 />
                ) : (
                    <>
                        {/* 4. Role-Aware KPI Summary Strip (4 Equal-Height MetricCardV2 Cards) */}
                        <section
                            aria-label="Manifest Key Performance Indicators"
                            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch"
                        >
                            <MetricCardV2
                                title={
                                    isRTL
                                        ? 'إجمالي الشحنات المسجلة'
                                        : 'Total Consignments'
                                }
                                value={(stats?.total || 0).toLocaleString()}
                                subtitle={
                                    isRTL
                                        ? `${
                                              (stats?.readyForPickup || 0) +
                                              (stats?.pendingApproval || 0)
                                          } بانتظار التجهيز والاستلام`
                                        : `${
                                              (stats?.readyForPickup || 0) +
                                              (stats?.pendingApproval || 0)
                                          } awaiting pickup or approval`
                                }
                                icon="inventory_2"
                                tone="neutral"
                                onClick={() => handleStageChange('all')}
                                isActive={activeStage === 'all'}
                            />

                            <MetricCardV2
                                title={
                                    isRTL
                                        ? 'الشحنات النشطة قيد النقل'
                                        : 'Active In-Transit'
                                }
                                value={(
                                    (stats?.inTransit || 0) + (stats?.pickedUp || 0)
                                ).toLocaleString()}
                                subtitle={
                                    isRTL
                                        ? `${stats?.outForDelivery || 0} خارج للتسليم النهائي`
                                        : `${stats?.outForDelivery || 0} out for final delivery`
                                }
                                icon="flight_takeoff"
                                tone="info"
                                onClick={() => handleStageChange('in_transit')}
                                isActive={activeStage === 'in_transit'}
                            />

                            <MetricCardV2
                                title={
                                    isRTL
                                        ? 'الاستثناءات والاحتجاز الجمركي'
                                        : 'Exceptions & Holds'
                                }
                                value={(stats?.exceptions || 0).toLocaleString()}
                                subtitle={
                                    isRTL
                                        ? 'يتطلب مراجعة أو مستندات جمركية'
                                        : 'Customs holds & address verification'
                                }
                                icon="warning"
                                tone={(stats?.exceptions || 0) > 0 ? 'error' : 'success'}
                                badge={
                                    (stats?.exceptions || 0) > 0
                                        ? isRTL
                                            ? 'يتطلب تدخل'
                                            : 'Action Needed'
                                        : isRTL
                                        ? 'مستقر'
                                        : 'Clear'
                                }
                                badgeTone={
                                    (stats?.exceptions || 0) > 0 ? 'error' : 'success'
                                }
                                onClick={() => handleStageChange('exception')}
                                isActive={activeStage === 'exception'}
                            />

                            {/* 4th Card: Strictly Gated by Role Capabilities */}
                            {canViewCostData && financials ? (
                                <MetricCardV2
                                    title={
                                        isRTL
                                            ? 'صافي هامش الربح والتكلفة'
                                            : 'Net Margin & Carrier Cost'
                                    }
                                    value={formatKWD(financials.grossMargin || 0)}
                                    subtitle={
                                        isRTL
                                            ? `التكلفة: ${formatKWD(
                                                  financials.totalCost || 0
                                              )} • المبيعات: ${formatKWD(
                                                  financials.totalBilled || 0
                                              )}`
                                            : `Cost: ${formatKWD(
                                                  financials.totalCost || 0
                                              )} • Billed: ${formatKWD(
                                                  financials.totalBilled || 0
                                              )}`
                                    }
                                    icon="paid"
                                    tone="success"
                                    badge={financials.marginPercentage || '0%'}
                                    badgeTone="success"
                                />
                            ) : canViewFinance && financials ? (
                                <MetricCardV2
                                    title={
                                        isRTL
                                            ? 'إجمالي قيمة البوالص المصدرة'
                                            : 'Total Billed Volume'
                                    }
                                    value={formatKWD(financials.totalBilled || 0)}
                                    subtitle={
                                        isRTL
                                            ? `المحصل: ${formatKWD(
                                                  financials.totalPaid || 0
                                              )}`
                                            : `Collected: ${formatKWD(
                                                  financials.totalPaid || 0
                                              )}`
                                    }
                                    icon="account_balance_wallet"
                                    tone="info"
                                    badge={
                                        isRTL
                                            ? `${financials.unpaidCount || 0} غير مدفوع`
                                            : `${financials.unpaidCount || 0} unpaid`
                                    }
                                    badgeTone={
                                        (financials.unpaidCount || 0) > 0
                                            ? 'warning'
                                            : 'success'
                                    }
                                />
                            ) : (
                                <MetricCardV2
                                    title={
                                        isRTL
                                            ? 'الشحنات المسلمة بنجاح'
                                            : 'Delivered & Completed'
                                    }
                                    value={(stats?.delivered || 0).toLocaleString()}
                                    subtitle={
                                        isRTL
                                            ? `الالتزام بالموعد: ${
                                                  stats?.kvi?.onTimeRate || '98.4%'
                                              }`
                                            : `On-Time SLA: ${
                                                  stats?.kvi?.onTimeRate || '98.4%'
                                              }`
                                    }
                                    icon="task_alt"
                                    tone="success"
                                    onClick={() => handleStageChange('delivered')}
                                    isActive={activeStage === 'delivered'}
                                />
                            )}
                        </section>

                        {/* 5. Wrapping Pipeline Stage Filter Pills (Fixes 7-tab orphan row in V1) */}
                        <div
                            className="flex flex-wrap items-center gap-1.5 bg-slate-200/70 dark:bg-slate-800/90 p-1.5 rounded-2xl"
                            role="tablist"
                            aria-label="Shipment Stage Filter"
                        >
                            {stagePills.map((tab) => {
                                const isSelected = activeStage === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={isSelected}
                                        onClick={() => handleStageChange(tab.id)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                                            isSelected
                                                ? 'bg-primary text-white shadow-2xs'
                                                : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70'
                                        }`}
                                    >
                                        <span>{tab.label}</span>
                                        <span
                                            className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none tabular-nums ${
                                                isSelected
                                                    ? 'bg-white/20 text-white'
                                                    : tab.isAlert && tab.count > 0
                                                    ? 'bg-rose-600 text-white'
                                                    : 'bg-slate-300/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                            }`}
                                        >
                                            {tab.count.toLocaleString()}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* 6. Main Consignment Grid Card */}
                        <section
                            aria-label="Consignment Manifest List"
                            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden"
                        >
                            {/* Search & Facet Filter Toolbar */}
                            <ShipmentsFilterBarV2
                                search={search}
                                onSearchChange={handleSearchChange}
                                carrier={selectedCarrier}
                                onCarrierChange={handleCarrierChange}
                                corridor={selectedCorridor}
                                onCorridorChange={handleCorridorChange}
                                totalCount={total}
                                shownCount={shipments.length}
                                loading={shipmentsLoading}
                                onRefresh={() => mutateShipments()}
                                canExportData={canExportData}
                                onOpenExportLog={() => setIsUndeliveredModalOpen(true)}
                                onExportCurrentCsv={() =>
                                    exportRowsToCsv(shipments, 'target-manifest-v2')
                                }
                                hasActiveFilters={hasActiveFilters}
                                onResetAllFilters={handleResetAllFilters}
                                canSeeCarrier={canViewCarrier(user?.role)}
                                isRTL={isRTL}
                            />

                            {/* Active Filter Chips Bar */}
                            {((canViewCarrier(user?.role) && selectedCarrier !== 'ALL') ||
                                selectedCorridor !== 'ALL' ||
                                Boolean(search)) && (
                                <div className="px-4 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-bold text-slate-500 dark:text-slate-400">
                                        {isRTL ? 'الفلاتر النشطة:' : 'Active Filters:'}
                                    </span>

                                    {canViewCarrier(user?.role) && selectedCarrier !== 'ALL' && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300 font-bold">
                                            <span>
                                                {isRTL ? 'الناقل:' : 'Carrier:'}{' '}
                                                {CARRIER_OPTIONS_V2.find(
                                                    (c) => c.value === selectedCarrier
                                                )?.[isRTL ? 'labelAr' : 'label'] ||
                                                    selectedCarrier}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label="Remove carrier filter"
                                                onClick={() => handleCarrierChange('ALL')}
                                                className="hover:text-rose-500 cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    )}

                                    {selectedCorridor !== 'ALL' && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300 font-bold">
                                            <span>
                                                {isRTL ? 'المسار:' : 'Corridor:'}{' '}
                                                {CORRIDOR_OPTIONS_V2.find(
                                                    (c) => c.value === selectedCorridor
                                                )?.[isRTL ? 'labelAr' : 'label'] ||
                                                    `KW → ${selectedCorridor}`}
                                            </span>
                                            <button
                                                type="button"
                                                aria-label="Remove corridor filter"
                                                onClick={() => handleCorridorChange('ALL')}
                                                className="hover:text-rose-500 cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    )}

                                    {search && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold">
                                            <span>
                                                {isRTL ? 'بحث:' : 'Query:'} &ldquo;{search}
                                                &rdquo;
                                            </span>
                                            <button
                                                type="button"
                                                aria-label="Clear search query"
                                                onClick={() => handleSearchChange('')}
                                                className="hover:text-rose-500 cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Table or Empty State */}
                            {shipmentsLoading && shipments.length === 0 ? (
                                <div className="py-16 flex flex-col items-center justify-center gap-3">
                                    <span
                                        className="loading loading-spinner loading-md text-primary"
                                        aria-label="Loading consignment manifest"
                                    />
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                        {isRTL
                                            ? 'جاري تحميل سجل الشحنات...'
                                            : 'Loading consignment manifest...'}
                                    </p>
                                </div>
                            ) : shipments.length === 0 ? (
                                <EmptyStateV2
                                    icon="inventory_2"
                                    title={
                                        isRTL
                                            ? 'لا توجد شحنات مطابقة للمعايير'
                                            : 'No matching consignments found'
                                    }
                                    description={
                                        hasActiveFilters
                                            ? isRTL
                                                ? 'جرب مسح الفلاتر الحالية أو تغيير الفترة الزمنية لعرض كافة الشحنات.'
                                                : 'Try clearing active filters or expanding the timeframe to view records.'
                                            : isRTL
                                            ? 'لا توجد شحنات مسجلة في هذا النطاق حالياً.'
                                            : 'There are no consignments recorded in this scope yet.'
                                    }
                                    actionLabel={
                                        hasActiveFilters
                                            ? isRTL
                                                ? 'إعادة ضبط الفلاتر'
                                                : 'Reset All Filters'
                                            : canCreateShipment
                                            ? isRTL
                                                ? 'إنشاء شحنة جديدة'
                                                : 'Create Shipment'
                                            : undefined
                                    }
                                    onAction={
                                        hasActiveFilters
                                            ? handleResetAllFilters
                                            : canCreateShipment
                                            ? () => navigate('/shipment/new-v2')
                                            : undefined
                                    }
                                    className="m-4"
                                />
                            ) : (
                                <>
                                    <ShipmentsTableV2
                                        shipments={shipments}
                                        selectedIds={selectedIds}
                                        onToggleSelectAll={toggleSelectAll}
                                        onToggleSelectRow={toggleSelectRow}
                                        onInspect={handleInspect}
                                        onOpenDossier={handleOpenDossier}
                                        onDownloadLabel={handleDownloadLabel}
                                        onOpenInvoice={handleOpenInvoice}
                                        onApproveOrEdit={handleApproveOrEdit}
                                        onDelete={handleDelete}
                                        canViewRetailPrice={canViewRetailPrice}
                                        canViewCostData={canViewCostData}
                                        canViewDocuments={canViewDocuments}
                                        canApproveShipments={canApproveShipments}
                                        canDeleteShipments={canDeleteShipments}
                                        userRole={userRole}
                                        isRTL={isRTL}
                                    />

                                    {/* Pagination Footer */}
                                    <div className="p-3.5 sm:px-5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300 font-semibold tabular-nums">
                                            <span>
                                                {isRTL ? 'صفحة' : 'Page'}{' '}
                                                <strong className="text-slate-900 dark:text-white">
                                                    {page}
                                                </strong>{' '}
                                                {isRTL ? 'من' : 'of'}{' '}
                                                <strong className="text-slate-900 dark:text-white">
                                                    {totalPages}
                                                </strong>{' '}
                                                ({total.toLocaleString()}{' '}
                                                {isRTL ? 'إجمالي' : 'total'})
                                            </span>

                                            <div className="inline-flex items-center gap-1.5">
                                                <span>
                                                    {isRTL ? 'عدد الصفوف:' : 'Rows:'}
                                                </span>
                                                <div className="relative inline-flex items-center">
                                                    <select
                                                        aria-label={
                                                            isRTL
                                                                ? 'عدد الصفوف في الصفحة'
                                                                : 'Rows per page'
                                                        }
                                                        value={perPage}
                                                        onChange={(e) => {
                                                            setPerPage(
                                                                Number(e.target.value)
                                                            );
                                                            setPage(1);
                                                        }}
                                                        style={{ backgroundImage: 'none' }}
                                                        className="appearance-none bg-none h-7 ps-2.5 pe-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
                                                    >
                                                        <option value={25}>25</option>
                                                        <option value={50}>50</option>
                                                        <option value={100}>100</option>
                                                    </select>
                                                    <span
                                                        className="material-symbols-outlined pointer-events-none absolute end-1 text-sm text-slate-500 select-none"
                                                        aria-hidden="true"
                                                    >
                                                        expand_more
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {totalPages > 1 && (
                                            <div
                                                className="inline-flex items-center gap-1"
                                                role="navigation"
                                                aria-label="Pagination"
                                            >
                                                <button
                                                    type="button"
                                                    disabled={page === 1}
                                                    onClick={() => setPage(1)}
                                                    aria-label={
                                                        isRTL
                                                            ? 'الصفحة الأولى'
                                                            : 'First Page'
                                                    }
                                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                                                >
                                                    {isRTL ? '»»' : '««'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={page === 1}
                                                    onClick={() =>
                                                        setPage((p) => Math.max(1, p - 1))
                                                    }
                                                    aria-label={
                                                        isRTL
                                                            ? 'الصفحة السابقة'
                                                            : 'Previous Page'
                                                    }
                                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                                                >
                                                    {isRTL ? '»' : '«'}
                                                </button>
                                                <span className="px-3 py-1 rounded-lg bg-primary text-white text-xs font-extrabold tabular-nums">
                                                    {page}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={page === totalPages}
                                                    onClick={() =>
                                                        setPage((p) =>
                                                            Math.min(totalPages, p + 1)
                                                        )
                                                    }
                                                    aria-label={
                                                        isRTL
                                                            ? 'الصفحة التالية'
                                                            : 'Next Page'
                                                    }
                                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                                                >
                                                    {isRTL ? '«' : '»'}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={page === totalPages}
                                                    onClick={() => setPage(totalPages)}
                                                    aria-label={
                                                        isRTL
                                                            ? 'الصفحة الأخيرة'
                                                            : 'Last Page'
                                                    }
                                                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
                                                >
                                                    {isRTL ? '««' : '»»'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </section>
                    </>
                )}
            </div>

            {/* 7. Multi-Select Bulk Actions Dock (Functional CSV Export + Waybill Print) */}
            {selectedIds.length > 0 && (
                <div className="fixed bottom-5 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
                    <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-2xl py-3 px-4 sm:px-5 flex flex-wrap items-center gap-3 pointer-events-auto border border-slate-700 shadow-lg">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-primary text-white font-extrabold text-xs tabular-nums">
                                {selectedIds.length}
                            </span>
                            <span className="text-xs font-bold">
                                {isRTL ? 'شحنات محددة' : 'Selected'}
                            </span>
                        </div>

                        <div className="h-4 w-px bg-slate-700" />

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    const selectedRows = shipments.filter((s) =>
                                        selectedIds.includes(s.id)
                                    );
                                    exportRowsToCsv(
                                        selectedRows,
                                        'target-selected-shipments'
                                    );
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold cursor-pointer"
                            >
                                <span
                                    className="material-symbols-outlined text-sm leading-none"
                                    aria-hidden="true"
                                >
                                    download
                                </span>
                                <span>
                                    {isRTL ? 'تصدير المحدد (CSV)' : 'Export Selected CSV'}
                                </span>
                            </button>

                            {canViewDocuments && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const firstSelected = shipments.find((s) =>
                                            selectedIds.includes(s.id)
                                        );
                                        if (firstSelected) {
                                            handleDownloadLabel(firstSelected);
                                        }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-bold cursor-pointer"
                                >
                                    <span
                                        className="material-symbols-outlined text-sm leading-none"
                                        aria-hidden="true"
                                    >
                                        print
                                    </span>
                                    <span>
                                        {isRTL ? 'طباعة البوليصة' : 'Print Waybill'}
                                    </span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => setSelectedIds([])}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                            >
                                {isRTL ? 'إلغاء التحديد' : 'Deselect'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 8. Slide-Over Shipment Inspector Drawer */}
            <ShipmentInspectorDrawer
                shipment={inspectingShipment}
                onClose={() => setInspectingShipment(null)}
                onDownloadLabel={canViewDocuments ? handleDownloadLabel : undefined}
            />

            {/* 9. Role-Gated Modals */}
            {canCreateShipment && (
                <BulkShipmentImportModal
                    isOpen={isBulkModalOpen}
                    onClose={() => setIsBulkModalOpen(false)}
                    onImportSuccess={() => mutateShipments()}
                />
            )}

            {canSyncErp && (
                <PhenixSyncModal
                    isOpen={isPhenixModalOpen}
                    onClose={() => setIsPhenixModalOpen(false)}
                    onSyncSuccess={() => mutateShipments()}
                />
            )}

            {canExportData && (
                <UndeliveredLogModal
                    isOpen={isUndeliveredModalOpen}
                    onClose={() => setIsUndeliveredModalOpen(false)}
                    organizations={[
                        {
                            id: 'all',
                            name: isRTL
                                ? 'جميع الحسابات (نظرة شاملة)'
                                : 'All Network Organizations'
                        },
                        ...organizations
                    ]}
                    selectedOrgId={selectedOrgId}
                />
            )}
        </div>
    );
};

export default ShipmentsV2Page;
