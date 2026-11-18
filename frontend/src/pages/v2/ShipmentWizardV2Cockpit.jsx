import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { shipmentService, userService, organizationService } from '../../services/api';
import { CAPABILITIES, hasCapability, isPlatformRole } from '../../utils/capabilities';
import { countries, extractPhonePrefix, formatE164Phone } from '../../utils/countries';
import { getContainerTypes, getContainerTypeById } from '../../utils/containerTypesConfig';
import { SearchableCountrySelect, SearchablePhoneDialSelector } from '../../components/common/SearchableCountrySelect';
import GoogleAddressInput from '../../components/GoogleAddressInput';
import { GoogleMapPinDrop } from '../../components/GoogleMapPinDrop';
import ErrorBannerV2 from './components/ErrorBannerV2';
import LiveQuoteSidebarV2 from './wizard/LiveQuoteSidebarV2';
import {
    VOLUMETRIC_DIVISOR,
    SANDBOX_DEFAULT_PHONE,
    SANDBOX_DEFAULT_DIAL_CODE,
    SANDBOX_DEFAULT_LOCAL_PHONE,
    NON_POSTAL_COUNTRIES,
    isPostalCodeRequired,
    DG_PRESET_OPTIONS,
    DEFAULT_PACKAGE_TEMPLATES,
    V2_CARRIER_CATALOG,
    V2_VALUE_ADDED_SERVICES,
    HS_CODE_PRESETS,
    ORIGIN_HUB_PRESETS,
    CONSIGNEE_HUB_PRESETS,
    calculateParcelMetrics,
    calculateShipmentWeightMetrics,
    validateCockpitStep,
    validateAllCockpitSteps,
    getStepForField,
    mapBackendFieldToWizardField,
    deduplicateAddresses
} from './wizard/wizardConstants';

/**
 * Custom Single-Caret Select Wrapper (Eliminates duplicate select carets across Light/Dark & RTL)
 */
const SelectWithCaret = ({ value, onChange, children, ariaLabel, disabled = false, error = false, className = '' }) => (
    <div className={`relative flex items-center w-full ${className}`}>
        <select
            aria-label={ariaLabel}
            value={value}
            onChange={onChange}
            disabled={disabled}
            style={{ backgroundImage: 'none' }}
            className={`appearance-none bg-none w-full ps-3 pe-8 py-2 rounded-xl border text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer disabled:opacity-50 ${
                error
                    ? 'border-rose-400 dark:border-rose-500 bg-rose-50/40 dark:bg-rose-950/30 text-slate-900 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
            }`}
        >
            {children}
        </select>
        <span
            className="material-symbols-outlined pointer-events-none absolute end-2.5 text-base text-slate-500 dark:text-slate-400 select-none"
            aria-hidden="true"
        >
            expand_more
        </span>
    </div>
);

/**
 * ShipmentWizardV2Cockpit — Isolated V2 Shipment Creation & Editing Cockpit
 * 100% Single-Column Vertical Flow across all viewports (390px - 1440px)
 * Full 6-Step & Field Parity with TargetLogisticsWizard.jsx + Hardened V2 RBAC
 * Route: /shipment/new-v2 (and /shipment/:trackingNumber/edit-v2)
 */
export const ShipmentWizardV2Cockpit = () => {
    const navigate = useNavigate();
    const { trackingNumber } = useParams();
    const { user } = useAuth();
    const { lang } = useLanguage();
    const isRTL = lang === 'ar';
    const { enqueueSnackbar } = useSnackbar();
    const topAnchorRef = useRef(null);

    const mode = trackingNumber ? 'edit' : 'create';

    // Role & Capability Gates (Strict RBAC)
    const userRole = String(user?.role || 'client').toLowerCase();
    const isPlatformOperator = isPlatformRole(userRole);
    const canViewCostData = hasCapability(userRole, CAPABILITIES.VIEW_COST_DATA);

    // Client Assigned Carrier Policy Detection
    const assignedCarrierPolicy = useMemo(() => {
        if (isPlatformOperator) return null;
        const policyAccess = user?.agentPolicy?.shippingAccess;
        const prefCarrier =
            policyAccess?.carrierCode ||
            user?.carrierConfig?.preferredCarrier ||
            user?.organization?.allowedCarriers?.defaultCarrier ||
            null;
        const prefService =
            policyAccess?.serviceCode ||
            user?.carrierConfig?.serviceCode ||
            user?.organization?.allowedCarriers?.defaultServiceCode ||
            null;
        const allowedList =
            user?.agentPolicy?.allowedCarriers ||
            user?.organization?.allowedCarriers?.allowed ||
            [];

        if (prefCarrier && (!Array.isArray(allowedList) || allowedList.length <= 1)) {
            const normCode = String(prefCarrier).toUpperCase() === 'DHL' ? 'DGR' : String(prefCarrier).toUpperCase();
            return {
                locked: true,
                carrierCode: normCode,
                serviceCode: prefService || 'P'
            };
        }
        return null;
    }, [isPlatformOperator, user]);

    const containerTypes = useMemo(() => getContainerTypes(), []);

    // Wizard Step (1..6 Full Parity)
    const [step, setStep] = useState(1);
    const [maxUnlockedStep, setMaxUnlockedStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const [apiError, setApiError] = useState(null);
    const [loadingExisting, setLoadingExisting] = useState(Boolean(trackingNumber));
    const [loadedShipment, setLoadedShipment] = useState(null);
    const [bookedWaybill, setBookedWaybill] = useState(null);

    // Sandbox-Safe Mode (Default ON in local/test environment)
    const [sandboxSafeMode, setSandboxSafeMode] = useState(true);
    const [agreedToPolicy, setAgreedToPolicy] = useState(false);

    // Optional Google Map Assist Drawers (Progressive disclosure; structured fields always visible)
    const [showOriginMap, setShowOriginMap] = useState(false);
    const [showConsigneeMap, setShowConsigneeMap] = useState(false);

    // Staff Delegation ("Acting On Behalf Of")
    const [organizations, setOrganizations] = useState([]);
    const [clients, setClients] = useState([]);
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedClientId, setSelectedClientId] = useState('');

    // Address Book & Templates
    const [userAddresses, setUserAddresses] = useState([]);
    const [saveSenderToBook, setSaveSenderToBook] = useState(true);
    const [saveReceiverToBook, setSaveReceiverToBook] = useState(true);
    const [cloningLastShipment, setCloningLastShipment] = useState(false);
    const pendingFocusFieldRef = useRef(null);
    const [templates, setTemplates] = useState(() => {
        try {
            const stored = localStorage.getItem('tl_package_templates');
            return stored ? JSON.parse(stored) : DEFAULT_PACKAGE_TEMPLATES;
        } catch {
            return DEFAULT_PACKAGE_TEMPLATES;
        }
    });
    const [customTemplateName, setCustomTemplateName] = useState('');
    const [showTemplateInput, setShowTemplateInput] = useState(false);

    // Live Quotes State
    const [quoteRates, setQuoteRates] = useState([]);
    const [loadingQuotes, setLoadingQuotes] = useState(false);
    const [quoteFetchError, setQuoteFetchError] = useState(null);

    // Form State: 1. Origin (Shipper)
    const [sender, setSender] = useState(() => {
        const parsedPhone = extractPhonePrefix(user?.phone || SANDBOX_DEFAULT_PHONE, SANDBOX_DEFAULT_DIAL_CODE);
        return {
            name: user?.name || 'Target Dispatch Desk',
            company: user?.organization?.name || 'Target Logistics Hub',
            phone: parsedPhone.localPhone || SANDBOX_DEFAULT_LOCAL_PHONE,
            phoneCountryCode: parsedPhone.dialCode || SANDBOX_DEFAULT_DIAL_CODE,
            email: user?.email || 'ops@target-kw.com',
            taxId: user?.carrierConfig?.taxId || 'KW-CR-104920',
            addr1: 'Block 1, Street 14, Shuwaikh Industrial Hub',
            addr2: 'Gate 2, Logistics Wing',
            area: 'Shuwaikh Industrial',
            city: 'Kuwait City',
            state: 'Al Asimah',
            zip: '70001',
            country: 'Kuwait',
            countryCode: 'KW',
            formattedAddress: 'Block 1, Street 14, Shuwaikh Industrial, Kuwait City',
            latitude: 29.3422,
            longitude: 47.9347
        };
    });

    // Form State: 2. Consignee (Receiver)
    const [receiver, setReceiver] = useState({
        name: 'Salem Al-Rashidi',
        company: 'Emirates Horizon Distribution LLC',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        phoneCountryCode: SANDBOX_DEFAULT_DIAL_CODE,
        email: 'receiving@emirateshorizon.ae',
        taxId: 'AE-TRN-100492817200003',
        addr1: 'Bay Square, Building 4, Suite 302',
        addr2: 'Business Bay District',
        area: 'Business Bay',
        city: 'Dubai',
        state: 'Dubai',
        zip: '00000',
        country: 'United Arab Emirates',
        countryCode: 'AE',
        instructions: 'Deliver to Ground Floor Receiving Dock between 9 AM and 5 PM',
        formattedAddress: 'Bay Square, Building 4, Business Bay, Dubai, UAE',
        latitude: 25.1850,
        longitude: 55.2650
    });

    // Form State: 3. Packages & Cargo + DGR
    const [pkg, setPkg] = useState(() => {
        const defaultType = containerTypes[0]?.id || 'Box';
        const defaultCfg = containerTypes[0] || { length: 20, width: 15, height: 10, weight: 1.0 };
        return {
            shipmentType: 'package', // 'package' | 'documents' per PLATFORM_FEATURES.md
            pkgType: defaultType,
            packagesList: [
                {
                    id: 1,
                    pkgType: defaultType,
                    description: 'Commercial telecommunications hardware & accessories',
                    qty: '1',
                    weight: String(defaultCfg.weight || '1.5'),
                    length: String(defaultCfg.length || '30'),
                    width: String(defaultCfg.width || '20'),
                    height: String(defaultCfg.height || '15'),
                    value: '45.000',
                    currency: 'KWD',
                    hsCode: '8517.12.00'
                }
            ],
            dangerousGoods: false,
            unCode: '',
            dgClass: '',
            properShippingName: '',
            packingGroup: 'PG II',
            dgServiceCode: 'HE',
            dgContentId: '910',
            dgMarks: ''
        };
    });

    // Form State: 4. Carrier & Services
    const [service, setService] = useState(() => {
        const defaultCarrier = assignedCarrierPolicy?.carrierCode || 'DGR';
        const catalogEntry = V2_CARRIER_CATALOG.find((c) => c.code === defaultCarrier) || V2_CARRIER_CATALOG[0];
        return {
            carrierCode: catalogEntry.code,
            serviceCode: assignedCarrierPolicy?.serviceCode || catalogEntry.serviceCode || 'P',
            serviceName: catalogEntry.nameEn,
            currency: 'KWD',
            selectedAddons: [],
            pickupType: 'Schedule Driver Pickup',
            pickupDate: new Date().toISOString().slice(0, 10),
            pickupTime: '9:00 AM – 12:00 PM',
            instructions: ''
        };
    });

    // Form State: 5. Customs & Logistics
    const [customs, setCustoms] = useState({
        shipmentPurpose: 'Commercial',
        incoterms: 'DAP – Delivered at Place',
        hsCode: '8517.12.00',
        origin: 'Kuwait',
        invoiceNum: `INV-${new Date().getFullYear()}-8421`,
        invoiceVal: '45.000',
        currency: 'KWD',
        notes: 'Paperless Trade (PLT) digital commercial invoice attached.',
        paperlessTrade: true
    });

    // Carrier Lock Check in Edit Mode (Parity with TargetLogisticsWizard.jsx:1008)
    const isCarrierLocked = useMemo(() => {
        if (mode !== 'edit' || !loadedShipment) return false;
        const status = String(loadedShipment.status || '').toUpperCase();
        return Boolean(
            (loadedShipment.carrierCode || loadedShipment.carrier) &&
                ['BOOKED', 'PICKED_UP', 'RECEIVED_AT_HUB', 'VERIFIED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)
        );
    }, [mode, loadedShipment]);

    // Edit Mode Diff Tracking (Parity with TargetLogisticsWizard.jsx:984)
    const changedFieldsList = useMemo(() => {
        if (mode !== 'edit' || !loadedShipment) return [];
        const changed = [];
        const orig = loadedShipment.origin || {};
        const dest = loadedShipment.destination || {};
        if (sender.name !== (orig.contactPerson || orig.name || '')) changed.push(isRTL ? 'اسم المرسل' : 'Sender Name');
        if (sender.addr1 !== (orig.streetLines?.[0] || orig.line1 || orig.address || '')) changed.push(isRTL ? 'عنوان المرسل' : 'Sender Address');
        if (receiver.name !== (dest.contactPerson || dest.name || '')) changed.push(isRTL ? 'اسم المستلم' : 'Receiver Name');
        if (receiver.addr1 !== (dest.streetLines?.[0] || dest.line1 || dest.address || '')) changed.push(isRTL ? 'عنوان المستلم' : 'Receiver Address');
        if (receiver.taxId !== (dest.taxId || dest.civilId || '')) changed.push(isRTL ? 'الرقم الضريبي/المدني للمستلم' : 'Receiver Tax/Civil ID');
        if (service.carrierCode !== (loadedShipment.carrierCode || '')) changed.push(isRTL ? 'الناقل' : 'Carrier');
        if (customs.hsCode !== (loadedShipment.items?.[0]?.hsCode || '8517.12.00')) changed.push(isRTL ? 'البند الجمركي HS' : 'HS Code');
        return changed;
    }, [mode, loadedShipment, sender, receiver, service.carrierCode, customs.hsCode, isRTL]);

    // Hydrate existing shipment in Edit Mode
    useEffect(() => {
        if (!trackingNumber) return undefined;
        let isMounted = true;
        const loadExistingShipment = async () => {
            try {
                setLoadingExisting(true);
                setApiError(null);
                const res = await shipmentService.getShipment(trackingNumber);
                const s = res?.data || res?.shipment || res;
                if (!isMounted || !s) return;
                setLoadedShipment(s);

                const orig = s.origin || s.sender || {};
                const origDial = extractPhonePrefix(orig.phone || SANDBOX_DEFAULT_PHONE, orig.phoneCountryCode || SANDBOX_DEFAULT_DIAL_CODE);
                setSender((prev) => ({
                    ...prev,
                    name: orig.contactPerson || orig.name || prev.name,
                    company: orig.company || prev.company,
                    phone: origDial.localPhone || SANDBOX_DEFAULT_LOCAL_PHONE,
                    phoneCountryCode: origDial.dialCode || SANDBOX_DEFAULT_DIAL_CODE,
                    email: orig.email || prev.email,
                    taxId: orig.taxId || orig.vatNumber || prev.taxId,
                    addr1: orig.streetLines?.[0] || orig.line1 || orig.address || prev.addr1,
                    addr2: orig.streetLines?.[1] || orig.line2 || '',
                    area: orig.area || prev.area,
                    city: orig.city || prev.city,
                    state: orig.state || prev.state,
                    zip: orig.postalCode || orig.zip || '00000',
                    country: orig.country || prev.country,
                    countryCode: orig.countryCode || prev.countryCode,
                    formattedAddress: orig.formattedAddress || prev.formattedAddress
                }));

                const dest = s.destination || s.receiver || {};
                const destDial = extractPhonePrefix(dest.phone || SANDBOX_DEFAULT_PHONE, dest.phoneCountryCode || SANDBOX_DEFAULT_DIAL_CODE);
                setReceiver((prev) => ({
                    ...prev,
                    name: dest.contactPerson || dest.name || prev.name,
                    company: dest.company || prev.company,
                    phone: destDial.localPhone || SANDBOX_DEFAULT_LOCAL_PHONE,
                    phoneCountryCode: destDial.dialCode || SANDBOX_DEFAULT_DIAL_CODE,
                    email: dest.email || prev.email,
                    taxId: dest.taxId || dest.civilId || prev.taxId,
                    addr1: dest.streetLines?.[0] || dest.line1 || dest.address || prev.addr1,
                    addr2: dest.streetLines?.[1] || dest.line2 || '',
                    area: dest.area || prev.area,
                    city: dest.city || prev.city,
                    state: dest.state || prev.state,
                    zip: dest.postalCode || dest.zip || '00000',
                    country: dest.country || prev.country,
                    countryCode: dest.countryCode || prev.countryCode,
                    instructions: dest.instructions || s.specialInstructions || prev.instructions
                }));

                const rawParcels = Array.isArray(s.parcels) && s.parcels.length > 0 ? s.parcels : Array.isArray(s.packages) ? s.packages : [];
                const items = Array.isArray(s.items) ? s.items : [];
                if (rawParcels.length > 0) {
                    setPkg((prev) => ({
                        ...prev,
                        shipmentType: s.shipmentType === 'documents' ? 'documents' : 'package',
                        pkgType: rawParcels[0]?.packageType || s.packagingType || 'Box',
                        packagesList: rawParcels.map((p, idx) => ({
                            id: idx + 1,
                            pkgType: p.packageType || 'Box',
                            description: p.description || items[idx]?.description || 'Commercial Cargo',
                            qty: String(items[idx]?.quantity || 1),
                            weight: String(p.weight || 1.0),
                            length: String(p.length || 20),
                            width: String(p.width || 15),
                            height: String(p.height || 10),
                            value: String(p.declaredValue || items[idx]?.price || 15.0),
                            currency: s.currency || 'KWD',
                            hsCode: items[idx]?.hsCode || '8517.12.00'
                        })),
                        dangerousGoods: Boolean(s.dangerousGoods?.contains || s.dangerousGoods?.unCode),
                        unCode: s.dangerousGoods?.unCode || '',
                        dgClass: s.dangerousGoods?.class || '',
                        properShippingName: s.dangerousGoods?.properShippingName || '',
                        packingGroup: s.dangerousGoods?.packingGroup || 'PG II',
                        dgServiceCode: s.dangerousGoods?.serviceCode || 'HE',
                        dgContentId: s.dangerousGoods?.contentId || '910',
                        dgMarks: s.dangerousGoods?.customDescription || ''
                    }));
                }

                const rawCarrier = s.carrierCode || s.carrier;
                if (rawCarrier) {
                    const upper = String(rawCarrier).toUpperCase().trim();
                    const carrierAliasMap = {
                        DHL: 'DGR',
                        DHL2: 'DGR2',
                        LOGESTECHS: 'OTE',
                        MANUAL: 'INTERNAL',
                        MAN: 'INTERNAL'
                    };
                    const normCode = carrierAliasMap[upper] || upper;
                    const cat = V2_CARRIER_CATALOG.find((c) => c.code === normCode) || V2_CARRIER_CATALOG[0];
                    setService((prev) => ({
                        ...prev,
                        carrierCode: cat.code,
                        serviceCode: s.serviceCode || cat.serviceCode,
                        serviceName: cat.nameEn
                    }));
                }

                const customsObj = s.customsInvoice || s.customs || {};
                setCustoms((prev) => ({
                    ...prev,
                    incoterms: s.incoterm ? `${s.incoterm}` : prev.incoterms,
                    hsCode: customsObj.hsCode || items[0]?.hsCode || prev.hsCode,
                    origin: customsObj.countryOfOrigin || orig.country || prev.origin,
                    invoiceNum: customsObj.invoiceNumber || prev.invoiceNum,
                    invoiceVal: String(customsObj.declaredValue || customsObj.invoiceVal || s.declaredValue || prev.invoiceVal),
                    currency: customsObj.currency || s.currency || prev.currency,
                    notes: customsObj.notes || prev.notes,
                    paperlessTrade: customsObj.paperlessTrade !== undefined ? Boolean(customsObj.paperlessTrade) : prev.paperlessTrade
                }));
                setMaxUnlockedStep(6);
            } catch (err) {
                if (isMounted) {
                    setApiError(err?.message || 'Unable to load shipment for editing.');
                }
            } finally {
                if (isMounted) setLoadingExisting(false);
            }
        };
        loadExistingShipment();
        return () => {
            isMounted = false;
        };
    }, [trackingNumber]);

    // Fetch Address Book & Platform Organizations/Clients
    useEffect(() => {
        let isMounted = true;
        const loadContextData = async () => {
            try {
                if (Array.isArray(user?.addresses) && user.addresses.length > 0) {
                    setUserAddresses(user.addresses);
                } else {
                    const meRes = await userService.getMe();
                    const addrs = meRes?.data?.addresses || meRes?.addresses || [];
                    if (isMounted && Array.isArray(addrs)) setUserAddresses(addrs);
                }
            } catch {
                // Silent fallback if address book is empty
            }

            if (isPlatformOperator) {
                organizationService
                    .getOrganizations()
                    .then((res) => {
                        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                        if (isMounted) setOrganizations(list);
                    })
                    .catch((err) => {
                        if (isMounted) {
                            setApiError((prev) => prev || err?.message || 'Failed to load organizations list.');
                        }
                    });

                userService
                    .getAssignableClients()
                    .then((res) => {
                        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                        if (isMounted) setClients(list);
                    })
                    .catch((err) => {
                        if (isMounted) {
                            setApiError((prev) => prev || err?.message || 'Failed to load assignable clients.');
                        }
                    });
            }
        };
        loadContextData();
        return () => {
            isMounted = false;
        };
    }, [user, isPlatformOperator]);

    // Real-time Volumetric & Chargeable Weight Calculation (Divisor = 5000, Chargeable = max(actual, volumetric))
    const weightMetrics = useMemo(
        () => calculateShipmentWeightMetrics(pkg.packagesList),
        [pkg.packagesList]
    );

    // Sync Declared Customs Value from Parcel Totals
    useEffect(() => {
        if (weightMetrics.totalDeclaredValue > 0) {
            setCustoms((prev) => ({
                ...prev,
                invoiceVal: weightMetrics.totalDeclaredValue.toFixed(3),
                origin: prev.origin || sender.country || 'Kuwait'
            }));
        }
    }, [weightMetrics.totalDeclaredValue, sender.country]);

    // Live Quote Fetching using TRUE Chargeable Weight
    useEffect(() => {
        let isCancelled = false;
        if (!receiver.countryCode && !receiver.country) return undefined;

        const timer = setTimeout(async () => {
            try {
                setLoadingQuotes(true);
                setQuoteFetchError(null);
                const packagesPayload = (pkg.packagesList || []).map((p) => ({
                    weight: { value: Math.max(0.1, Number(p.weight) || 1.0), unit: 'kg' },
                    dimensions: {
                        length: Math.max(1, Number(p.length) || 20),
                        width: Math.max(1, Number(p.width) || 15),
                        height: Math.max(1, Number(p.height) || 10),
                        unit: 'cm'
                    }
                }));

                const quoteRes = await shipmentService.getQuotes({
                    userId: selectedClientId || undefined,
                    carrierCode: service.carrierCode || 'DGR',
                    serviceCode: service.serviceCode || 'P',
                    currency: service.currency || 'KWD',
                    weight: weightMetrics.chargeableWeight,
                    packages: packagesPayload,
                    isTest: sandboxSafeMode,
                    environment: sandboxSafeMode ? 'test' : 'production',
                    sender: {
                        city: sender.city || 'Kuwait City',
                        countryCode: sender.countryCode || 'KW',
                        postalCode: sender.zip || '70001'
                    },
                    receiver: {
                        city: receiver.city || 'Dubai',
                        countryCode: receiver.countryCode || 'AE',
                        country: receiver.country || 'United Arab Emirates',
                        postalCode: receiver.zip || '00000'
                    }
                });

                if (isCancelled) return;
                const list = Array.isArray(quoteRes?.data)
                    ? quoteRes.data
                    : Array.isArray(quoteRes)
                    ? quoteRes
                    : [];
                setQuoteRates(list);
            } catch (err) {
                if (!isCancelled) {
                    setQuoteFetchError(err?.message || null);
                }
            } finally {
                if (!isCancelled) setLoadingQuotes(false);
            }
        }, 280);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [
        selectedClientId,
        service.carrierCode,
        service.serviceCode,
        service.currency,
        sender.city,
        sender.countryCode,
        sender.zip,
        receiver.city,
        receiver.countryCode,
        receiver.country,
        receiver.zip,
        weightMetrics.chargeableWeight,
        pkg.packagesList,
        sandboxSafeMode
    ]);

    const selectedCarrier = useMemo(() => {
        return (
            V2_CARRIER_CATALOG.find((c) => c.code === service.carrierCode) ||
            V2_CARRIER_CATALOG[0]
        );
    }, [service.carrierCode]);

    const carrierRateMatrix = useMemo(() => {
        const chgWt = Math.max(0.5, weightMetrics.chargeableWeight || 1);
        const addonsTotal = (service.selectedAddons || []).reduce(
            (sum, a) => sum + (Number(a.rate) || 0),
            0
        );
        const dgrFee = pkg.dangerousGoods ? 8.5 : 0;

        return V2_CARRIER_CATALOG.map((c) => {
            const matchedLive = quoteRates.find(
                (q) => String(q.carrierCode || '').toUpperCase() === c.code
            );
            const liveTotal = Number(
                matchedLive?.totalPrice ?? matchedLive?.estimatedShipmentCost ?? 0
            );
            const requiresManualPricing = Boolean(matchedLive?.requiresManualPricing);

            let baseFreight = 0;
            let fuelSurcharge = 0;
            let isLive = false;

            if (matchedLive && liveTotal > 0) {
                isLive = true;
                const explicitFuel = Number(
                    matchedLive.fuelSurcharge ??
                        matchedLive.rateCardResult?.fuelSurcharge ??
                        0
                );
                if (explicitFuel > 0 && liveTotal > explicitFuel) {
                    baseFreight = liveTotal - explicitFuel;
                    fuelSurcharge = explicitFuel;
                } else {
                    baseFreight = Number((liveTotal / 1.095).toFixed(3));
                    fuelSurcharge = Number((liveTotal - baseFreight).toFixed(3));
                }
            } else {
                const rawBase = c.minBaseRate + Math.max(0, chgWt - 1) * c.baseRatePerKg;
                baseFreight = Number(rawBase.toFixed(3));
                fuelSurcharge =
                    c.code === 'INTERNAL'
                        ? 0
                        : Number((baseFreight * 0.095).toFixed(3));
            }

            const retailTotal = Number(
                (baseFreight + fuelSurcharge + addonsTotal + dgrFee).toFixed(3)
            );

            // STRICT RBAC: Wholesale cost & margin computed ONLY when canViewCostData is true (admin & accounting)
            const wholesaleCost = canViewCostData
                ? Number(
                      (
                          matchedLive?.basePrice ||
                          matchedLive?.costPrice ||
                          retailTotal * c.wholesaleRatio
                      ).toFixed(3)
                  )
                : null;
            const grossMargin = canViewCostData
                ? Number(Math.max(0, retailTotal - wholesaleCost).toFixed(3))
                : null;
            const marginPct =
                canViewCostData && retailTotal > 0
                    ? Math.round((grossMargin / retailTotal) * 100)
                    : null;

            const isPolicyLockedOut =
                Boolean(assignedCarrierPolicy?.locked) &&
                assignedCarrierPolicy.carrierCode !== c.code;

            return {
                ...c,
                isLive,
                requiresManualPricing,
                baseFreight,
                fuelSurcharge,
                addonsTotal: Number(addonsTotal.toFixed(3)),
                dgrFee: Number(dgrFee.toFixed(3)),
                finalCost: retailTotal,
                wholesaleCost,
                grossMargin,
                marginPct,
                isPolicyLockedOut
            };
        });
    }, [
        weightMetrics.chargeableWeight,
        service.selectedAddons,
        pkg.dangerousGoods,
        quoteRates,
        canViewCostData,
        assignedCarrierPolicy
    ]);

    const activeQuoteBreakdown = useMemo(() => {
        return (
            carrierRateMatrix.find((c) => c.code === service.carrierCode) ||
            carrierRateMatrix[0]
        );
    }, [carrierRateMatrix, service.carrierCode]);

    // Step Navigation & Validation
    const scrollToTop = () => {
        topAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const focusFieldElement = (fieldKey) => {
        if (!fieldKey) return;
        const targetStep = getStepForField(fieldKey);
        if (targetStep && targetStep !== step) {
            pendingFocusFieldRef.current = fieldKey;
            setStep(targetStep);
            return;
        }
        requestAnimationFrame(() => {
            const container =
                document.querySelector(`[data-field="${fieldKey}"]`) ||
                document.getElementById(`field-${fieldKey}`);
            if (!container) return;
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const focusable = container.matches('input, select, textarea, button')
                ? container
                : container.querySelector('input, select, textarea, button');
            if (focusable && typeof focusable.focus === 'function') {
                focusable.focus({ preventScroll: true });
            }
        });
    };

    useEffect(() => {
        if (!pendingFocusFieldRef.current) return;
        const key = pendingFocusFieldRef.current;
        pendingFocusFieldRef.current = null;
        const timer = setTimeout(() => {
            const container =
                document.querySelector(`[data-field="${key}"]`) ||
                document.getElementById(`field-${key}`);
            if (!container) return;
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const focusable = container.matches('input, select, textarea, button')
                ? container
                : container.querySelector('input, select, textarea, button');
            if (focusable && typeof focusable.focus === 'function') {
                focusable.focus({ preventScroll: true });
            }
        }, 80);
        return () => clearTimeout(timer);
    }, [step]);

    const handleNextStep = () => {
        const validation = validateCockpitStep(
            step,
            { sender, receiver, pkg, customs, service, agreedToPolicy },
            isRTL
        );
        if (!validation.isValid) {
            setErrors(validation.errors);
            focusFieldElement(validation.firstErrorField);
            enqueueSnackbar(
                validation.errors[validation.firstErrorField] ||
                    (isRTL
                        ? 'يرجى استكمال الحقول الإلزامية المميزة باللون الأحمر للمتابعة'
                        : 'Please complete the highlighted required fields to proceed'),
                { variant: 'warning' }
            );
            return;
        }
        setErrors({});
        const next = Math.min(6, step + 1);
        setStep(next);
        setMaxUnlockedStep((prev) => Math.max(prev, next));
        scrollToTop();
    };

    const handlePrevStep = () => {
        setErrors({});
        setStep((s) => Math.max(1, s - 1));
        scrollToTop();
    };

    const handleJumpToStep = (targetStep) => {
        if (targetStep === step) return;
        if (targetStep < step || targetStep <= maxUnlockedStep) {
            setErrors({});
            setStep(targetStep);
            scrollToTop();
            return;
        }
        const validation = validateCockpitStep(
            step,
            { sender, receiver, pkg, customs, service, agreedToPolicy },
            isRTL
        );
        if (!validation.isValid) {
            setErrors(validation.errors);
            focusFieldElement(validation.firstErrorField);
            enqueueSnackbar(
                validation.errors[validation.firstErrorField] ||
                    (isRTL
                        ? 'يرجى استكمال خطوات الإدخال الحالية أولاً'
                        : 'Please complete the current step required fields first'),
                { variant: 'warning' }
            );
            return;
        }
        setErrors({});
        setStep(targetStep);
        setMaxUnlockedStep((prev) => Math.max(prev, targetStep));
        scrollToTop();
    };

    // Staff Delegation Handlers
    const handleSelectOrganization = (orgId) => {
        setSelectedOrgId(orgId);
        if (!orgId) return;
        const org = organizations.find((o) => String(o.id || o._id) === String(orgId));
        if (!org) return;
        const dial = extractPhonePrefix(org.phone || SANDBOX_DEFAULT_PHONE, SANDBOX_DEFAULT_DIAL_CODE);
        setSender((prev) => ({
            ...prev,
            name: org.contactPerson || org.name || prev.name,
            company: org.name || prev.company,
            phone: dial.localPhone || SANDBOX_DEFAULT_LOCAL_PHONE,
            phoneCountryCode: dial.dialCode || SANDBOX_DEFAULT_DIAL_CODE,
            email: org.email || prev.email,
            addr1: org.address || org.addressLine1 || prev.addr1,
            city: org.city || prev.city,
            country: org.country || prev.country,
            countryCode: org.countryCode || prev.countryCode,
            taxId: org.taxNumber || org.vatNumber || prev.taxId
        }));
    };

    const handleSelectClient = (clientId) => {
        setSelectedClientId(clientId);
        if (!clientId) return;
        const cl = clients.find((c) => String(c.id || c._id) === String(clientId));
        if (!cl) return;
        const dial = extractPhonePrefix(cl.phone || SANDBOX_DEFAULT_PHONE, SANDBOX_DEFAULT_DIAL_CODE);
        setSender((prev) => ({
            ...prev,
            name: cl.name || prev.name,
            company: cl.organization?.name || cl.company || prev.company,
            phone: dial.localPhone || SANDBOX_DEFAULT_LOCAL_PHONE,
            phoneCountryCode: dial.dialCode || SANDBOX_DEFAULT_DIAL_CODE,
            email: cl.email || prev.email
        }));
        if (cl.organizationId) setSelectedOrgId(cl.organizationId);
    };

    // Address Book Quick-Pick
    const applySavedAddress = (target, addrId) => {
        if (!addrId) return;
        const found = userAddresses.find(
            (a, idx) => String(a.id || a._id || idx) === String(addrId)
        );
        if (!found) return;
        const cObj =
            countries.find((c) => c.code === found.countryCode) ||
            countries.find((c) => c.name?.toLowerCase() === found.country?.toLowerCase());
        const dial = extractPhonePrefix(
            found.phone || SANDBOX_DEFAULT_PHONE,
            found.phoneCountryCode || cObj?.dialCode || SANDBOX_DEFAULT_DIAL_CODE
        );
        const updater = (prev) => ({
            ...prev,
            name: found.contactPerson || found.name || prev.name,
            company: found.company || prev.company,
            phone: dial.localPhone || SANDBOX_DEFAULT_LOCAL_PHONE,
            phoneCountryCode: dial.dialCode || SANDBOX_DEFAULT_DIAL_CODE,
            email: found.email || prev.email,
            taxId: found.taxId || prev.taxId,
            addr1: found.addressLine1 || found.streetLines?.[0] || found.addr1 || prev.addr1,
            addr2: found.addressLine2 || found.streetLines?.[1] || '',
            area: found.area || prev.area,
            city: found.city || prev.city,
            state: found.state || prev.state,
            zip: found.postalCode || found.zip || '00000',
            country: cObj?.name || found.country || prev.country,
            countryCode: cObj?.code || found.countryCode || prev.countryCode
        });
        if (target === 'sender') {
            setSender(updater);
        } else {
            setReceiver(updater);
        }
    };

    // Parcel Manipulation Handlers
    const handleUpdateParcel = (idx, field, val) => {
        setPkg((prev) => {
            const list = [...(prev.packagesList || [])];
            if (list[idx]) {
                list[idx] = { ...list[idx], [field]: val };
            }
            return { ...prev, packagesList: list };
        });
        const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;
        const errKey = `${pfx}_${field}`;
        if (errors[errKey]) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[errKey];
                return next;
            });
        }
    };

    const handleAddParcel = () => {
        const defaultCfg = containerTypes[0] || { length: 20, width: 15, height: 10, weight: 1.0 };
        setPkg((prev) => ({
            ...prev,
            packagesList: [
                ...(prev.packagesList || []),
                {
                    id: Date.now(),
                    pkgType: prev.pkgType || 'Box',
                    description: prev.packagesList?.[0]?.description || 'Commercial Cargo',
                    qty: '1',
                    weight: String(defaultCfg.weight || '1.0'),
                    length: String(defaultCfg.length || '20'),
                    width: String(defaultCfg.width || '15'),
                    height: String(defaultCfg.height || '10'),
                    value: '25.000',
                    currency: customs.currency || 'KWD',
                    hsCode: customs.hsCode || '8517.12.00'
                }
            ]
        }));
    };

    const handleDuplicateParcel = (idx) => {
        setPkg((prev) => {
            const list = [...(prev.packagesList || [])];
            const source = list[idx];
            if (!source) return prev;
            list.splice(idx + 1, 0, {
                ...source,
                id: Date.now() + idx
            });
            return { ...prev, packagesList: list };
        });
    };

    const handleRemoveParcel = (idx) => {
        if ((pkg.packagesList?.length || 0) <= 1) return;
        setPkg((prev) => ({
            ...prev,
            packagesList: prev.packagesList.filter((_, i) => i !== idx)
        }));
    };

    const handleApplyTemplate = (tmpl) => {
        if (!tmpl) return;
        const isDoc = tmpl.pkgType === 'Envelope' || tmpl.shipmentType === 'documents';
        const valStr = String(tmpl.value || tmpl.declaredValue || (isDoc ? '5.000' : '15.000'));
        const listSource = Array.isArray(tmpl.packagesList) && tmpl.packagesList.length > 0
            ? tmpl.packagesList
            : [
                {
                    id: 1,
                    pkgType: tmpl.pkgType || 'Box',
                    description: tmpl.description || 'General Cargo',
                    qty: String(tmpl.qty || '1'),
                    weight: String(tmpl.weight || '1.0'),
                    length: String(tmpl.length || '20'),
                    width: String(tmpl.width || '15'),
                    height: String(tmpl.height || '10'),
                    value: valStr,
                    currency: tmpl.currency || customs.currency || 'KWD',
                    hsCode: isDoc ? '4901.99.00' : tmpl.hsCode || customs.hsCode || '8517.12.00'
                }
            ];

        setPkg((prev) => ({
            ...prev,
            shipmentType: isDoc ? 'documents' : 'package',
            pkgType: tmpl.pkgType || listSource[0]?.pkgType || 'Box',
            dangerousGoods: Boolean(tmpl.dangerousGoods),
            unCode: tmpl.unCode || '',
            dgClass: tmpl.dgClass || '',
            properShippingName: tmpl.properShippingName || '',
            packagesList: listSource.map((p, idx) => ({
                id: p.id || idx + 1,
                pkgType: p.pkgType || tmpl.pkgType || 'Box',
                description: p.description || tmpl.description || 'General Cargo',
                qty: String(p.qty || '1'),
                weight: String(p.weight || '1.0'),
                length: String(p.length || '20'),
                width: String(p.width || '15'),
                height: String(p.height || '10'),
                value: String(p.value || p.declaredValue || valStr),
                currency: p.currency || customs.currency || 'KWD',
                hsCode: p.hsCode || (isDoc ? '4901.99.00' : customs.hsCode || '8517.12.00')
            }))
        }));
        setCustoms((prev) => ({
            ...prev,
            hsCode: isDoc ? '4901.99.00' : tmpl.hsCode || prev.hsCode,
            invoiceVal: valStr || prev.invoiceVal
        }));
        enqueueSnackbar(
            isRTL ? `تم تطبيق القالب: ${tmpl.name}` : `Applied preset: ${tmpl.name}`,
            { variant: 'info' }
        );
    };

    const handleSaveCustomTemplate = () => {
        if (!customTemplateName.trim()) return;
        const first = pkg.packagesList?.[0] || {};
        const newTmpl = {
            id: `custom_${Date.now()}`,
            name: customTemplateName.trim(),
            shipmentType: pkg.shipmentType || 'package',
            pkgType: first.pkgType || pkg.pkgType || 'Box',
            weight: first.weight || '1.0',
            length: first.length || '20',
            width: first.width || '15',
            height: first.height || '10',
            description: first.description || 'General Cargo',
            value: first.value || '15.000',
            currency: first.currency || customs.currency || 'KWD',
            hsCode: first.hsCode || customs.hsCode || '',
            dangerousGoods: Boolean(pkg.dangerousGoods),
            unCode: pkg.unCode || '',
            dgClass: pkg.dgClass || '',
            properShippingName: pkg.properShippingName || ''
        };
        const nextList = [...templates, newTmpl];
        setTemplates(nextList);
        try {
            localStorage.setItem('tl_package_templates', JSON.stringify(nextList));
        } catch {
            // Ignore storage quota errors
        }
        setCustomTemplateName('');
        setShowTemplateInput(false);
        enqueueSnackbar(
            isRTL ? 'تم حفظ القالب المخصص بنجاح' : 'Custom cargo preset saved',
            { variant: 'success' }
        );
    };

    const handleDeleteCustomTemplate = (tmplId) => {
        const nextList = templates.filter((t) => t.id !== tmplId);
        setTemplates(nextList);
        try {
            localStorage.setItem('tl_package_templates', JSON.stringify(nextList));
        } catch {
            // Ignore storage quota errors
        }
    };

    const handleCloneLastShipment = async () => {
        try {
            setCloningLastShipment(true);
            let lastCargo = null;
            try {
                const cached = localStorage.getItem('tl_last_shipment_cargo');
                if (cached) lastCargo = JSON.parse(cached);
            } catch {
                // Ignore malformed cache
            }

            if (!lastCargo) {
                const res = await shipmentService.getAllShipments({ limit: 1, page: 1 });
                const list = res?.data || res?.shipments || (Array.isArray(res) ? res : []);
                const last = Array.isArray(list) ? list[0] : null;
                if (last) {
                    const rawParcels = Array.isArray(last.packages) && last.packages.length > 0
                        ? last.packages
                        : Array.isArray(last.parcels) && last.parcels.length > 0
                        ? last.parcels
                        : [last.packageDetails || last];
                    lastCargo = {
                        name: last.trackingNumber ? `#${last.trackingNumber}` : 'Last Shipment',
                        shipmentType: last.shipmentType || (last.isDocument ? 'documents' : 'package'),
                        pkgType: rawParcels[0]?.pkgType || last.pkgType || 'Box',
                        dangerousGoods: Boolean(last.dangerousGoods || last.isDangerousGoods),
                        unCode: last.unCode || '',
                        dgClass: last.dgClass || '',
                        properShippingName: last.properShippingName || '',
                        hsCode: last.hsCode || rawParcels[0]?.hsCode || '',
                        value: String(last.declaredValue || rawParcels[0]?.declaredValue || rawParcels[0]?.value || '15.000'),
                        packagesList: rawParcels.map((p, idx) => ({
                            id: idx + 1,
                            pkgType: p.pkgType || 'Box',
                            description: p.description || p.contents || last.description || 'General Cargo',
                            qty: String(p.qty || p.quantity || '1'),
                            weight: String(p.weight || '1.0'),
                            length: String(p.length || '20'),
                            width: String(p.width || '15'),
                            height: String(p.height || '10'),
                            value: String(p.declaredValue || p.value || last.declaredValue || '15.000'),
                            currency: p.currency || last.currency || customs.currency || 'KWD',
                            hsCode: p.hsCode || last.hsCode || '8517.12.00'
                        }))
                    };
                }
            }

            if (!lastCargo) {
                enqueueSnackbar(
                    isRTL ? 'لا توجد شحنة سابقة لاستنساخها' : 'No previous shipment found to clone',
                    { variant: 'info' }
                );
                return;
            }

            handleApplyTemplate(lastCargo);
        } catch (err) {
            enqueueSnackbar(
                err?.message || (isRTL ? 'تعذر تحميل بيانات الشحنة السابقة' : 'Unable to load last shipment'),
                { variant: 'warning' }
            );
        } finally {
            setCloningLastShipment(false);
        }
    };

    // Final Booking / Draft Submission (Sandbox-Safe)
    const handleSubmitConsignment = async (isDraft = false) => {
        if (!isDraft) {
            const validation = validateAllCockpitSteps(
                { sender, receiver, pkg, customs, service, agreedToPolicy },
                isRTL
            );
            if (!validation.isValid) {
                setErrors(validation.errors);
                if (validation.firstErrorStep && validation.firstErrorStep !== step) {
                    pendingFocusFieldRef.current = validation.firstErrorField;
                    setStep(validation.firstErrorStep);
                } else {
                    focusFieldElement(validation.firstErrorField);
                }
                enqueueSnackbar(
                    validation.errors[validation.firstErrorField] ||
                        (isRTL
                            ? 'يرجى استكمال الحقول الإلزامية قبل الإصدار'
                            : 'Please complete the highlighted required fields before booking'),
                    { variant: 'warning' }
                );
                return;
            }
        }

        try {
            setSubmitting(true);
            setApiError(null);

            const safeSenderPhone = sandboxSafeMode
                ? SANDBOX_DEFAULT_PHONE
                : formatE164Phone(sender.phone, sender.phoneCountryCode) || SANDBOX_DEFAULT_PHONE;
            const safeReceiverPhone = sandboxSafeMode
                ? SANDBOX_DEFAULT_PHONE
                : formatE164Phone(receiver.phone, receiver.phoneCountryCode) || SANDBOX_DEFAULT_PHONE;

            const finalPackages = (pkg.packagesList || []).map((p) => ({
                weight: Number(p.weight) || 1,
                length: Number(p.length) || 20,
                width: Number(p.width) || 15,
                height: Number(p.height) || 10,
                declaredValue: Number(p.value) || 0,
                packageType: p.pkgType || pkg.pkgType || 'Box',
                description: p.description || 'Commercial Cargo'
            }));

            const originCountryCode =
                countries.find(
                    (c) =>
                        c.name?.toLowerCase() === customs.origin?.toLowerCase() ||
                        c.code === customs.origin
                )?.code ||
                sender.countryCode ||
                'KW';

            const finalItems = (pkg.packagesList || []).map((p) => ({
                description: p.description || 'Commercial Cargo',
                quantity: Number(p.qty) || 1,
                price: Number(p.value) || 0,
                value: Number(p.value) || 0,
                currency: customs.currency || p.currency || 'KWD',
                hsCode: p.hsCode || customs.hsCode || '8517.12.00',
                countryOfOrigin: originCountryCode
            }));

            const isDgActive = Boolean(pkg.dangerousGoods && pkg.unCode?.trim());
            const cleanUnCode = (pkg.unCode || '').trim();
            const cleanDgNum = cleanUnCode.replace(/^UN|^ID/i, '').trim();

            const payload = {
                organizationId: selectedOrgId || undefined,
                createdOnBehalfOfUserId: selectedClientId || undefined,
                userId: selectedClientId || undefined,
                isTest: sandboxSafeMode,
                environment: sandboxSafeMode ? 'test' : 'production',
                notifyCustomer: !sandboxSafeMode,
                autoDispatch: false,
                origin: {
                    name: sender.name,
                    contactPerson: sender.name,
                    company: sender.company,
                    phone: safeSenderPhone,
                    phoneCountryCode: sandboxSafeMode ? SANDBOX_DEFAULT_DIAL_CODE : sender.phoneCountryCode || '+965',
                    email: sender.email,
                    taxId: sender.taxId,
                    country: sender.country,
                    countryCode: sender.countryCode,
                    city: sender.city,
                    state: sender.state,
                    area: sender.area || '',
                    postalCode: sender.zip || '00000',
                    streetLines: [sender.addr1, sender.addr2].filter(Boolean),
                    formattedAddress: sender.formattedAddress || `${sender.addr1}, ${sender.city}`,
                    latitude: sender.latitude,
                    longitude: sender.longitude
                },
                destination: {
                    name: receiver.name,
                    contactPerson: receiver.name,
                    company: receiver.company,
                    phone: safeReceiverPhone,
                    phoneCountryCode: sandboxSafeMode ? SANDBOX_DEFAULT_DIAL_CODE : receiver.phoneCountryCode || '+971',
                    email: receiver.email,
                    taxId: receiver.taxId,
                    civilId: receiver.taxId,
                    country: receiver.country,
                    countryCode: receiver.countryCode,
                    city: receiver.city,
                    state: receiver.state,
                    area: receiver.area || '',
                    postalCode: receiver.zip || '00000',
                    streetLines: [receiver.addr1, receiver.addr2].filter(Boolean),
                    instructions: receiver.instructions,
                    formattedAddress: receiver.formattedAddress || `${receiver.addr1}, ${receiver.city}`,
                    latitude: receiver.latitude,
                    longitude: receiver.longitude
                },
                parcels: finalPackages,
                packages: finalPackages,
                items: finalItems,
                packagingType: pkg.pkgType || 'Box',
                shipmentType: pkg.shipmentType === 'documents' ? 'documents' : 'package',
                carrierCode: service.carrierCode || 'DGR',
                serviceCode: service.serviceCode || 'P',
                currency: service.currency || 'KWD',
                price: activeQuoteBreakdown.finalCost,
                incoterm: customs.incoterms.split(' ')[0] || 'DAP',
                insurance: false,
                dangerousGoods: {
                    contains: isDgActive,
                    code: cleanDgNum,
                    unCode: cleanUnCode,
                    class: isDgActive ? pkg.dgClass || 'Class 3' : '',
                    properShippingName: isDgActive ? pkg.properShippingName || 'Dangerous Goods' : '',
                    packingGroup: isDgActive ? pkg.packingGroup || 'PG II' : '',
                    serviceCode: isDgActive ? pkg.dgServiceCode || 'HE' : '',
                    contentId: isDgActive ? pkg.dgContentId || '910' : '',
                    customDescription: isDgActive ? pkg.dgMarks || pkg.properShippingName || '' : ''
                },
                valueAddedServices: (service.selectedAddons || []).map((a) => a.serviceCode),
                customsInvoice: {
                    invoiceNumber: customs.invoiceNum || `INV-${Date.now().toString().slice(-6)}`,
                    declaredValue: Number(customs.invoiceVal || weightMetrics.totalDeclaredValue || 0),
                    currency: customs.currency || 'KWD',
                    countryOfOrigin: customs.origin || sender.country || 'Kuwait',
                    notes: customs.notes || '',
                    paperlessTrade: Boolean(customs.paperlessTrade)
                },
                specialInstructions: receiver.instructions || service.instructions || '',
                ...(isDraft ? { status: 'draft', isDraft: true } : {})
            };

            let res;
            if (mode === 'edit' && trackingNumber) {
                res = await shipmentService.updateShipmentDetails(trackingNumber, payload);
            } else {
                res = await shipmentService.createShipment(payload);
            }

            const createdObj = res?.data || res?.shipment || res || {};
            const finalTracking =
                createdObj.trackingNumber ||
                trackingNumber ||
                `TGR-${Date.now().toString().slice(-8)}`;

            if (saveSenderToBook || saveReceiverToBook) {
                try {
                    const nextAddrs = [...userAddresses];
                    if (saveSenderToBook) {
                        nextAddrs.push({
                            id: `addr_${Date.now()}_orig`,
                            label: `${sender.company || sender.name} (${sender.city})`,
                            contactPerson: sender.name,
                            company: sender.company,
                            phone: safeSenderPhone,
                            phoneCountryCode: sender.phoneCountryCode,
                            addressLine1: sender.addr1,
                            addressLine2: sender.addr2,
                            area: sender.area,
                            city: sender.city,
                            state: sender.state,
                            country: sender.country,
                            countryCode: sender.countryCode,
                            postalCode: sender.zip
                        });
                    }
                    if (saveReceiverToBook) {
                        nextAddrs.push({
                            id: `addr_${Date.now()}_dest`,
                            label: `${receiver.company || receiver.name} (${receiver.city})`,
                            contactPerson: receiver.name,
                            company: receiver.company,
                            phone: safeReceiverPhone,
                            phoneCountryCode: receiver.phoneCountryCode,
                            addressLine1: receiver.addr1,
                            addressLine2: receiver.addr2,
                            area: receiver.area,
                            city: receiver.city,
                            state: receiver.state,
                            country: receiver.country,
                            countryCode: receiver.countryCode,
                            postalCode: receiver.zip
                        });
                    }
                    const dedupedAddrs = deduplicateAddresses(nextAddrs);
                    setUserAddresses(dedupedAddrs);
                    userService.updateMe({ addresses: dedupedAddrs }).catch((addrErr) => {
                        enqueueSnackbar(
                            addrErr?.message || (isRTL ? 'تعذر حفظ العنوان في دفتر العناوين' : 'Could not save address to Address Book'),
                            { variant: 'warning' }
                        );
                    });
                } catch {
                    // Ignore address book persistence error
                }
            }

            try {
                localStorage.setItem(
                    'tl_last_shipment_cargo',
                    JSON.stringify({
                        name: `#${finalTracking}`,
                        shipmentType: pkg.shipmentType || 'package',
                        pkgType: pkg.pkgType || 'Box',
                        dangerousGoods: Boolean(pkg.dangerousGoods),
                        unCode: pkg.unCode || '',
                        dgClass: pkg.dgClass || '',
                        properShippingName: pkg.properShippingName || '',
                        hsCode: customs.hsCode || '',
                        value: String(pkg.packagesList?.[0]?.value || customs.invoiceVal || '15.000'),
                        packagesList: pkg.packagesList || []
                    })
                );
            } catch {
                // Ignore storage quota errors
            }

            setBookedWaybill({
                trackingNumber: finalTracking,
                status: isDraft ? 'draft' : createdObj.status || 'pending',
                carrierName: isRTL ? selectedCarrier.nameAr : selectedCarrier.nameEn,
                carrierEmblem: selectedCarrier.emblem,
                originCity: sender.city,
                originCountry: sender.countryCode,
                destCity: receiver.city,
                destCountry: receiver.countryCode,
                chargeableWeight: weightMetrics.chargeableWeight,
                finalCost: activeQuoteBreakdown.finalCost,
                wholesaleCost: canViewCostData ? activeQuoteBreakdown.wholesaleCost : null,
                grossMargin: canViewCostData ? activeQuoteBreakdown.grossMargin : null,
                isDraft,
                sandboxSafeMode
            });

            enqueueSnackbar(
                isDraft
                    ? isRTL
                        ? 'تم حفظ المسودة بنجاح'
                        : 'Consignment draft saved successfully'
                    : isRTL
                    ? `تم إصدار البوليصة بنجاح #${finalTracking}`
                    : `Waybill booked successfully #${finalTracking}`,
                { variant: 'success' }
            );
            scrollToTop();
        } catch (err) {
            const respData = err?.response?.data;
            const errMsg =
                respData?.error ||
                respData?.message ||
                err?.message ||
                'Unable to complete shipment booking. Please check your inputs and try again.';
            setApiError(errMsg);

            const backendErrList = Array.isArray(respData?.errors)
                ? respData.errors
                : respData?.errors && typeof respData.errors === 'object'
                ? Object.entries(respData.errors).map(([field, message]) => ({ field, message }))
                : [];
            const rawFirstField = backendErrList[0]?.field || respData?.field;
            if (backendErrList.length > 0 || rawFirstField) {
                const mappedErrors = {};
                backendErrList.forEach((item) => {
                    const key = mapBackendFieldToWizardField(item?.field);
                    if (key) {
                        mappedErrors[key] = item?.message || errMsg;
                    }
                });
                const firstKey = mapBackendFieldToWizardField(rawFirstField);
                if (firstKey && !mappedErrors[firstKey]) {
                    mappedErrors[firstKey] = errMsg;
                }
                if (Object.keys(mappedErrors).length > 0) {
                    setErrors((prev) => ({ ...prev, ...mappedErrors }));
                    focusFieldElement(firstKey || Object.keys(mappedErrors)[0]);
                }
            }
        } finally {
            setSubmitting(false);
        }
    };

    const stepsList = [
        { num: 1, title: isRTL ? '١. المرسل' : '1. Origin (Shipper)', sub: isRTL ? 'العنوان والاتصال' : 'Shipper & pickup', icon: 'flight_takeoff' },
        { num: 2, title: isRTL ? '٢. المستلم' : '2. Consignee (Receiver)', sub: isRTL ? 'وجهة التسليم' : 'Delivery & Tax ID', icon: 'flight_land' },
        { num: 3, title: isRTL ? '٣. الطرود والوزن' : '3. Package & Cargo', sub: isRTL ? 'الحجمي ÷5000 و DGR' : 'Volumetric & DGR', icon: 'inventory_2' },
        { num: 4, title: isRTL ? '٤. الناقل والأسعار' : '4. Carrier & Rates', sub: isRTL ? 'المقارنة والجدولة' : 'Quotes & pickup', icon: 'local_shipping' },
        { num: 5, title: isRTL ? '٥. الجمارك و HS' : '5. Customs & PLT', sub: isRTL ? 'الفاتورة و Incoterms' : 'HS code & invoice', icon: 'receipt_long' },
        { num: 6, title: isRTL ? '٦. المراجعة والإصدار' : '6. Review & Dispatch', sub: isRTL ? 'التدقيق والتأكيد' : 'Verify & book', icon: 'verified' }
    ];

    return (
        <div
            ref={topAnchorRef}
            dir={isRTL ? 'rtl' : 'ltr'}
            className="w-full min-h-screen pb-8 overflow-x-hidden"
        >
            {/* Full-Screen Device-Adaptive Fluid Workspace */}
            <div className="w-full px-3 sm:px-6 lg:px-8 pt-4 sm:pt-5 space-y-5">
                {/* ── TOP V2 COCKPIT SWITCHER BANNER (Links back to /shipment/new V1 Standard) ── */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-primary text-white whitespace-nowrap shrink-0">
                            {isRTL ? 'معالج الشحن V2' : 'V2 Shipment Cockpit'}
                        </span>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {isRTL
                                ? 'تدفق عمودي متكامل بـ 6 خطوات مع حاسبة الوزن الحجمي وعزل التكلفة (RBAC)'
                                : 'Vertical 6-step dispatch studio with volumetric calculator & strict RBAC cost isolation'}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Link
                            to="/dashboard-v2"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                dashboard
                            </span>
                            <span>{isRTL ? 'لوحة V2' : 'Dashboard V2'}</span>
                        </Link>
                        <Link
                            to="/shipment/new"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                        >
                            <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">
                                {isRTL ? 'arrow_forward' : 'arrow_back'}
                            </span>
                            <span>{isRTL ? 'الرجوع إلى معالج V1 القياسي' : 'Switch to V1 Standard'}</span>
                        </Link>
                    </div>
                </div>

                {/* Edit Mode Amber Banner */}
                {mode === 'edit' && (
                    <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <span className="material-symbols-outlined text-xl text-amber-600 dark:text-amber-400" aria-hidden="true">
                                edit_note
                            </span>
                            <div>
                                <div className="text-xs sm:text-sm font-black text-amber-950 dark:text-amber-100">
                                    {isRTL ? `تعديل الشحنة رقم #${trackingNumber}` : `Editing Consignment #${trackingNumber}`}
                                </div>
                                <div className="text-[11px] text-amber-800 dark:text-amber-200">
                                    {isRTL
                                        ? 'تم تحميل كافة البيانات الحالية. يمكنك تعديل الحقول المطلوبة وحفظ التعديلات.'
                                        : 'Pre-filled from live shipment dossier. Modify fields and save changes.'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* API Error Banner */}
                {apiError && <ErrorBannerV2 message={apiError} onRetry={() => setApiError(null)} />}

                {/* ── POST-BOOKING WAYBILL CONFIRMATION SCREEN ── */}
                {bookedWaybill ? (
                    <section
                        aria-label="Waybill Confirmation Summary"
                        className="rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/70 p-6 sm:p-8 shadow-2xs space-y-6"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-3xl" aria-hidden="true">
                                        task_alt
                                    </span>
                                </div>
                                <div>
                                    <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                        {bookedWaybill.isDraft
                                            ? isRTL
                                                ? 'تم حفظ مسودة الشحنة بنجاح'
                                                : 'Consignment Saved as Draft'
                                            : isRTL
                                            ? 'تم إصدار وحجز البوليصة بنجاح'
                                            : 'Consignment Booked & Waybill Issued'}
                                    </h1>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {isRTL
                                            ? 'تم تسجيل الشحنة في النظام مع تفعيل حماية البيئة التجريبية (Sandbox).'
                                            : 'Registered in Target Logistics with sandbox-safe carrier protection active.'}
                                    </p>
                                </div>
                            </div>
                            <span
                                dir="ltr"
                                className="px-3.5 py-1.5 rounded-xl bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300 font-mono text-sm font-black border border-primary/20 self-start sm:self-center"
                            >
                                #{bookedWaybill.trackingNumber}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    {isRTL ? 'مسار الشحنة' : 'Trade Corridor'}
                                </div>
                                <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                                    {bookedWaybill.originCity} ({bookedWaybill.originCountry}) → {bookedWaybill.destCity} ({bookedWaybill.destCountry})
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    {isRTL ? 'الناقل والوزن الخاضع للتسعير' : 'Carrier & Chargeable Weight'}
                                </div>
                                <div className="text-sm font-black text-slate-900 dark:text-white mt-1">
                                    {bookedWaybill.carrierName} •{' '}
                                    <span dir="ltr" className="font-mono">
                                        {Number(bookedWaybill.chargeableWeight || 1).toFixed(2)} kg
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                {isRTL ? 'إجمالي التسعيرة المعتمدة' : 'Total Retail Rate'}
                            </div>
                            <div dir="ltr" className="text-base font-black font-mono text-primary dark:text-sky-400 mt-1">
                                {Number(bookedWaybill.finalCost || 0).toFixed(3)} KWD
                            </div>
                            {canViewCostData && bookedWaybill.wholesaleCost !== null && (
                                <div dir="ltr" className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    Cost: {Number(bookedWaybill.wholesaleCost).toFixed(3)} KWD • Margin: +
                                    {Number(bookedWaybill.grossMargin).toFixed(3)} KWD
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => navigate(`/shipment-v2/${bookedWaybill.trackingNumber}`)}
                                className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">
                                    visibility
                                </span>
                                <span>{isRTL ? 'معاينة تفاصيل البوليصة' : 'View Shipment Dossier'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setBookedWaybill(null);
                                    setStep(1);
                                    setAgreedToPolicy(false);
                                }}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">
                                    add_circle
                                </span>
                                <span>{isRTL ? 'إنشاء شحنة أخرى' : 'Create Another Shipment'}</span>
                            </button>
                            <Link
                                to="/shipments-v2"
                                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5"
                            >
                                <span className="material-symbols-outlined text-base" aria-hidden="true">
                                    list_alt
                                </span>
                                <span>{isRTL ? 'قائمة الشحنات V2' : 'Shipments V2'}</span>
                            </Link>
                        </div>
                    </section>
                ) : (
                    <>
                        {/* ── MOBILE & TABLET COMPACT TOP STEP STRIP (<1024px) ── */}
                        <nav
                            aria-label={isRTL ? 'مراحل إنشاء الشحنة' : 'Shipment Creation Steps'}
                            className="lg:hidden p-3 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-3"
                        >
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {stepsList.map((st) => {
                                    const isActive = step === st.num;
                                    const isDone = step > st.num;
                                    return (
                                        <button
                                            key={st.num}
                                            type="button"
                                            aria-current={isActive ? 'step' : undefined}
                                            onClick={() => handleJumpToStep(st.num)}
                                            className={`flex items-center gap-2 p-2 rounded-xl border text-start transition-all cursor-pointer min-w-0 ${
                                                isActive
                                                    ? 'border-primary bg-primary/5 dark:border-sky-400 dark:bg-sky-500/10 ring-1 ring-primary/30'
                                                    : isDone
                                                    ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                                                    : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            <span
                                                className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${
                                                    isActive
                                                        ? 'bg-primary text-white'
                                                        : isDone
                                                        ? 'bg-emerald-600 text-white'
                                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                                }`}
                                            >
                                                {isDone ? (
                                                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                                        check
                                                    </span>
                                                ) : (
                                                    st.num
                                                )}
                                            </span>
                                            <span
                                                className={`text-[11px] font-extrabold truncate ${
                                                    isActive
                                                        ? 'text-primary dark:text-sky-400'
                                                        : 'text-slate-800 dark:text-slate-200'
                                                }`}
                                            >
                                                {st.title.replace(/^\d+\.\s*/, '')}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-300 rounded-full"
                                    style={{ width: `${(step / 6) * 100}%` }}
                                />
                            </div>
                        </nav>

                        {/* ── DESKTOP FULL-SCREEN WORKSPACE: Left Vertical Step Rail + Full-Width Form Canvas ── */}
                        <div className="flex flex-col lg:flex-row gap-5 items-start w-full">
                            {/* LEFT VERTICAL STEP RAIL (Desktop lg+) */}
                            <aside
                                aria-label={isRTL ? 'مراحل الشحن' : 'Wizard Step Rail'}
                                className="hidden lg:flex flex-col w-64 xl:w-72 shrink-0 sticky top-20 space-y-4"
                            >
                                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
                                        <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                                            {isRTL ? `الخطوة ${step} من 6` : `Step ${step} of 6`}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300">
                                            {Math.round((step / 6) * 100)}%
                                        </span>
                                    </div>

                                    <nav className="space-y-2">
                                        {stepsList.map((st) => {
                                            const isActive = step === st.num;
                                            const isDone = step > st.num;
                                            return (
                                                <button
                                                    key={st.num}
                                                    type="button"
                                                    aria-current={isActive ? 'step' : undefined}
                                                    onClick={() => handleJumpToStep(st.num)}
                                                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-start transition-all cursor-pointer ${
                                                        isActive
                                                            ? 'border-primary bg-primary/5 dark:border-sky-400 dark:bg-sky-500/10 ring-1 ring-primary/30'
                                                            : isDone
                                                            ? 'border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20 hover:bg-emerald-50'
                                                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                                    }`}
                                                >
                                                    <span
                                                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                                            isActive
                                                                ? 'bg-primary text-white'
                                                                : isDone
                                                                ? 'bg-emerald-600 text-white'
                                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                                        }`}
                                                    >
                                                        {isDone ? (
                                                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                                                check
                                                            </span>
                                                        ) : (
                                                            st.num
                                                        )}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div
                                                            className={`text-xs font-extrabold truncate ${
                                                                isActive
                                                                    ? 'text-primary dark:text-sky-400'
                                                                    : 'text-slate-900 dark:text-slate-100'
                                                            }`}
                                                        >
                                                            {st.title.replace(/^\d+\.\s*/, '')}
                                                        </div>
                                                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                                                            {st.sub}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </nav>
                                </div>

                                {/* Live Route, Weight & Price Snapshot Card inside Left Rail */}
                                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-2.5 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-extrabold text-slate-700 dark:text-slate-300">
                                            {isRTL ? 'المسار والوزن' : 'Live Snapshot'}
                                        </span>
                                        <span
                                            dir="ltr"
                                            className="px-2 py-0.5 rounded-md bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300 font-mono text-[10.5px] font-black"
                                        >
                                            {sender.countryCode || 'KW'} → {receiver.countryCode || 'AE'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                        <span>{isRTL ? 'الوزن المعتمد:' : 'Chargeable Wt:'}</span>
                                        <span dir="ltr" className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                            {Number(weightMetrics.chargeableWeight || 1).toFixed(2)} kg
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                        <span>{isRTL ? 'الناقل:' : 'Carrier:'}</span>
                                        <span dir="ltr" className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                            {selectedCarrier.emblem || 'DHL'} ({selectedCarrier.slaPct || 97}%)
                                        </span>
                                    </div>
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <span className="font-bold text-slate-700 dark:text-slate-300">
                                            {isRTL ? 'الإجمالي:' : 'Retail Total:'}
                                        </span>
                                        <span dir="ltr" className="text-sm font-black font-mono text-primary dark:text-sky-400">
                                            {Number(activeQuoteBreakdown.finalCost || 0).toFixed(3)} KWD
                                        </span>
                                    </div>
                                    {canViewCostData && activeQuoteBreakdown.wholesaleCost !== null && (
                                        <div
                                            dir="ltr"
                                            className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/50 text-[10.5px] font-mono font-bold text-indigo-800 dark:text-indigo-200 flex justify-between"
                                        >
                                            <span>Cost: {Number(activeQuoteBreakdown.wholesaleCost).toFixed(3)}</span>
                                            <span className="text-emerald-700 dark:text-emerald-300">
                                                +{activeQuoteBreakdown.marginPct}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </aside>

                            {/* RIGHT FULL-WIDTH FORM CANVAS (flex-1 min-w-0 covers remaining screen) */}
                            <div className="flex-1 w-full min-w-0 space-y-5">

                        {/* Validation Error Summary Alert */}
                        {Object.keys(errors).length > 0 && (
                            <div
                                role="alert"
                                className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-100 text-xs flex items-start gap-2.5"
                            >
                                <span
                                    className="material-symbols-outlined text-lg text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                                    aria-hidden="true"
                                >
                                    error
                                </span>
                                <div className="min-w-0">
                                    <div className="font-extrabold">
                                        {isRTL
                                            ? 'يرجى مراجعة واستكمال الحقول الإلزامية التالية:'
                                            : 'Please resolve the following required fields to continue:'}
                                    </div>
                                    <ul className="list-disc list-inside text-[11px] mt-1 space-y-0.5 text-rose-800 dark:text-rose-200">
                                        {Object.entries(errors).map(([k, msg]) => (
                                            <li key={k}>{msg}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* ── SINGLE-COLUMN VERTICAL FORM STACK ── */}
                        <main className="space-y-5 min-w-0">
                            {loadingExisting ? (
                                <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                                    <span className="loading loading-spinner loading-md text-primary" aria-hidden="true" />
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                        {isRTL ? 'جاري تحميل بيانات البوليصة...' : 'Loading consignment dossier...'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* ══════════════════════════════════════════════════════════════
                                        STEP 1: ORIGIN (SHIPPER) — 100% Vertical Stacked Card
                                       ══════════════════════════════════════════════════════════════ */}
                                    {step === 1 && (
                                        <div className="space-y-5">
                                            {mode === 'create' && isPlatformOperator && (
                                                <section
                                                    aria-label={isRTL ? 'الإنشاء نيابة عن عميل أو منظمة' : 'Staff Client & Organization Delegation'}
                                                    className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-3"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                                                            <span className="material-symbols-outlined text-lg" aria-hidden="true">
                                                                domain
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                                                                {isRTL ? 'الإنشاء نيابة عن عميل أو منظمة (صلاحيات الموظفين)' : 'Acting On Behalf Of (Staff Delegation)'}
                                                            </h2>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                                {isRTL
                                                                    ? 'اختر المنظمة أو العميل لربط الشحنة بحسابه وتطبيق تسعيرة العقد'
                                                                    : 'Bind consignment to a B2B organization or client account for contract rating'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <SelectWithCaret
                                                            ariaLabel={isRTL ? 'اختيار المنظمة' : 'Select Organization'}
                                                            value={selectedOrgId}
                                                            onChange={(e) => handleSelectOrganization(e.target.value)}
                                                        >
                                                            <option value="">{isRTL ? '— المنظمة (اختياري) —' : '— Organization (Optional) —'}</option>
                                                            {organizations.map((org) => (
                                                                <option key={org.id || org._id} value={org.id || org._id}>
                                                                    {org.name}
                                                                </option>
                                                            ))}
                                                        </SelectWithCaret>

                                                        <SelectWithCaret
                                                            ariaLabel={isRTL ? 'اختيار حساب العميل' : 'Select Client Account'}
                                                            value={selectedClientId}
                                                            onChange={(e) => handleSelectClient(e.target.value)}
                                                        >
                                                            <option value="">{isRTL ? '— حساب العميل (اختياري) —' : '— Client User (Optional) —'}</option>
                                                            {clients.map((cl) => (
                                                                <option key={cl.id || cl._id} value={cl.id || cl._id}>
                                                                    {cl.name} {cl.email ? `(${cl.email})` : ''}
                                                                </option>
                                                            ))}
                                                        </SelectWithCaret>
                                                    </div>
                                                </section>
                                            )}

                                            <section
                                                aria-label={isRTL ? 'بيانات المرسل (الأصل)' : 'Origin Shipper Details'}
                                                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="w-8 h-8 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-400 flex items-center justify-center shrink-0">
                                                            <span className="material-symbols-outlined text-lg" aria-hidden="true">
                                                                flight_takeoff
                                                            </span>
                                                        </span>
                                                        <div>
                                                            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                                                                {isRTL ? 'المرسل (نقطة الانطلاق)' : 'Origin (Shipper) Contact & Address'}
                                                            </h2>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                                {isRTL ? 'بيانات الشاحن وعنوان استلام الشحنة' : 'Shipper contact identity, Tax/Civil ID, and pickup address'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {userAddresses.length > 0 && (
                                                        <div className="w-52">
                                                            <SelectWithCaret
                                                                ariaLabel={isRTL ? 'دفتر عناوين المرسل' : 'Origin Address Book'}
                                                                value=""
                                                                onChange={(e) => applySavedAddress('sender', e.target.value)}
                                                            >
                                                                <option value="">{isRTL ? 'اختر من دفتر العناوين...' : 'Address Book Quick-Pick...'}</option>
                                                                {userAddresses.map((a, idx) => (
                                                                    <option key={a.id || a._id || idx} value={a.id || a._id || idx}>
                                                                        {a.label || a.contactPerson || a.name || `Address ${idx + 1}`}
                                                                    </option>
                                                                ))}
                                                            </SelectWithCaret>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Quick Presets & Test Phone Reset */}
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 me-1">
                                                        {isRTL ? 'مراكز سريعة:' : 'Quick Hubs:'}
                                                    </span>
                                                    {ORIGIN_HUB_PRESETS.map((preset) => (
                                                        <button
                                                            key={preset.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSender((prev) => ({
                                                                    ...prev,
                                                                    company: preset.company,
                                                                    city: preset.city,
                                                                    area: preset.area,
                                                                    state: preset.state,
                                                                    country: preset.country,
                                                                    countryCode: preset.countryCode,
                                                                    zip: preset.zip,
                                                                    addr1: preset.addr1,
                                                                    latitude: preset.latitude,
                                                                    longitude: preset.longitude
                                                                }));
                                                            }}
                                                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-primary/10 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                                        >
                                                            {isRTL ? preset.labelAr : preset.labelEn}
                                                        </button>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSender((p) => ({
                                                                ...p,
                                                                phoneCountryCode: SANDBOX_DEFAULT_DIAL_CODE,
                                                                phone: SANDBOX_DEFAULT_LOCAL_PHONE
                                                            }))
                                                        }
                                                        className="px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 cursor-pointer"
                                                    >
                                                        <span dir="ltr">Use {SANDBOX_DEFAULT_PHONE}</span>
                                                    </button>
                                                </div>

                                                {/* Origin Contact Fields */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div data-field="sender_name" id="field-sender_name">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'اسم الشاحن / جهة الاتصال' : 'Contact Full Name'} <span className="text-rose-500">*</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={sender.name}
                                                            onChange={(e) => setSender({ ...sender, name: e.target.value })}
                                                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                                errors.sender_name ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                            }`}
                                                        />
                                                        {errors.sender_name && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.sender_name}</p>}
                                                    </div>

                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'الشركة / المؤسسة' : 'Company / Entity'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={sender.company}
                                                            onChange={(e) => setSender({ ...sender, company: e.target.value })}
                                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                        />
                                                    </div>

                                                    <div data-field="sender_phone" id="field-sender_phone">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'رقم الهاتف (E.164)' : 'Phone Number (E.164)'} <span className="text-rose-500">*</span>
                                                        </label>
                                                        <div
                                                            dir="ltr"
                                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border bg-slate-50 dark:bg-slate-800 ${
                                                                errors.sender_phone ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                            }`}
                                                        >
                                                            <SearchablePhoneDialSelector
                                                                value={sender.phoneCountryCode}
                                                                countryCode={sender.countryCode}
                                                                isRTL={isRTL}
                                                                onChange={(dialCode) => setSender((p) => ({ ...p, phoneCountryCode: dialCode }))}
                                                            />
                                                            <input
                                                                dir="ltr"
                                                                type="tel"
                                                                value={sender.phone}
                                                                onChange={(e) => setSender({ ...sender, phone: e.target.value })}
                                                                className="w-full text-xs font-bold font-mono bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
                                                            />
                                                        </div>
                                                        {errors.sender_phone && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.sender_phone}</p>}
                                                    </div>

                                                    <div data-field="sender_email" id="field-sender_email">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'البريد الإلكتروني' : 'Email Address'} <span className="text-rose-500">*</span>
                                                        </label>
                                                        <input
                                                            dir="ltr"
                                                            type="email"
                                                            value={sender.email}
                                                            onChange={(e) => setSender({ ...sender, email: e.target.value })}
                                                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                                errors.sender_email ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                            }`}
                                                        />
                                                        {errors.sender_email && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.sender_email}</p>}
                                                    </div>

                                                    <div className="sm:col-span-2">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'الرقم الضريبي / السجل التجاري / البطاقة المدنية (اختياري)' : 'Tax ID / VAT / Customs CR / Civil ID (Optional)'}
                                                        </label>
                                                        <input
                                                            dir="ltr"
                                                            type="text"
                                                            value={sender.taxId}
                                                            onChange={(e) => setSender({ ...sender, taxId: e.target.value })}
                                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Structured Address Fields (Always Visible) */}
                                                <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                                                    <div data-field="sender_addr1" id="field-sender_addr1">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'عنوان الشارع والمبنى (السطر 1)' : 'Street Address (Line 1)'} <span className="text-rose-500">*</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={sender.addr1}
                                                            onChange={(e) => setSender({ ...sender, addr1: e.target.value })}
                                                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                                errors.sender_addr1 ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                            }`}
                                                        />
                                                        {errors.sender_addr1 && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.sender_addr1}</p>}
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                {isRTL ? 'الشقة / الطابق / المكتب (السطر 2)' : 'Apartment / Suite / Office (Line 2)'}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={sender.addr2}
                                                                onChange={(e) => setSender({ ...sender, addr2: e.target.value })}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                {isRTL ? 'المنطقة / الحي / القطعة' : 'District / Area / Block'}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={sender.area}
                                                                onChange={(e) => setSender({ ...sender, area: e.target.value })}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                                        <div data-field="sender_city" id="field-sender_city">
                                                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                {isRTL ? 'المدينة' : 'City'} <span className="text-rose-500">*</span>
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={sender.city}
                                                                onChange={(e) => setSender({ ...sender, city: e.target.value })}
                                                                className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                                    errors.sender_city ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                }`}
                                                            />
                                                            {errors.sender_city && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.sender_city}</p>}
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                {isRTL ? 'المحافظة / الإمارة' : 'State / Governorate'}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={sender.state}
                                                                onChange={(e) => setSender({ ...sender, state: e.target.value })}
                                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                            />
                                                        </div>
                                                        <div data-field="sender_country" id="field-sender_country">
                                                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                {isRTL ? 'الدولة' : 'Country'} <span className="text-rose-500">*</span>
                                                            </label>
                                                            <SearchableCountrySelect
                                                                value={sender.countryCode}
                                                                valueMode="code"
                                                                isRTL={isRTL}
                                                                error={Boolean(errors.sender_country)}
                                                                onChange={(code, cObj) =>
                                                                    setSender((prev) => ({
                                                                        ...prev,
                                                                        countryCode: code,
                                                                        country: cObj?.name || prev.country,
                                                                        zip: NON_POSTAL_COUNTRIES.includes(code) ? '00000' : prev.zip
                                                                    }))
                                                                }
                                                            />
                                                            {errors.sender_country && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.sender_country}</p>}
                                                        </div>
                                                        <div data-field="sender_zip" id="field-sender_zip">
                                                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                {isRTL ? 'الرمز البريدي' : 'Postal Code'}{' '}
                                                                {isPostalCodeRequired(sender.countryCode, sender.country) && <span className="text-rose-500">*</span>}
                                                            </label>
                                                            <input
                                                                dir="ltr"
                                                                type="text"
                                                                value={sender.zip}
                                                                onChange={(e) => setSender({ ...sender, zip: e.target.value })}
                                                                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                                    errors.sender_zip ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                }`}
                                                            />
                                                            {errors.sender_zip && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.sender_zip}</p>}
                                                        </div>
                                                    </div>

                                                    {/* Google Places & Map Pin Assist + Save to Address Book */}
                                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowOriginMap((v) => !v)}
                                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-base" aria-hidden="true">
                                                                travel_explore
                                                            </span>
                                                            <span>
                                                                {showOriginMap
                                                                    ? isRTL ? 'إخفاء خريطة جوجل' : 'Hide Google Maps & Pin Drop'
                                                                    : isRTL ? 'تحديد الموقع عبر خرائط جوجل و GPS' : 'Search Google Places & Map Pin Drop'}
                                                            </span>
                                                        </button>

                                                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                                                            <input
                                                                type="checkbox"
                                                                checked={saveSenderToBook}
                                                                onChange={(e) => setSaveSenderToBook(e.target.checked)}
                                                                className="checkbox checkbox-primary checkbox-xs rounded"
                                                            />
                                                            <span>{isRTL ? 'حفظ الشاحن في دفتر العناوين' : 'Save shipper to Address Book'}</span>
                                                        </label>
                                                    </div>

                                                    {showOriginMap && (
                                                        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                                                            <GoogleAddressInput
                                                                label={isRTL ? 'بحث العنوان (Google Places)' : 'Search Global Address (Google Places)'}
                                                                value={{
                                                                    formattedAddress: sender.formattedAddress,
                                                                    addressLine1: sender.addr1,
                                                                    city: sender.city,
                                                                    country: sender.country,
                                                                    countryCode: sender.countryCode
                                                                }}
                                                                onChange={(res) => {
                                                                    if (!res) return;
                                                                    setSender((prev) => ({
                                                                        ...prev,
                                                                        addr1: res.addressLine1 || res.formattedAddress || prev.addr1,
                                                                        city: res.city || prev.city,
                                                                        country: res.country || prev.country,
                                                                        countryCode: res.countryCode || prev.countryCode,
                                                                        latitude: res.latitude ?? prev.latitude,
                                                                        longitude: res.longitude ?? prev.longitude
                                                                    }));
                                                                }}
                                                            />
                                                            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                                                <GoogleMapPinDrop
                                                                    latitude={sender.latitude}
                                                                    longitude={sender.longitude}
                                                                    height="210px"
                                                                    onLocationChange={(loc) => {
                                                                        if (!loc) return;
                                                                        setSender((prev) => ({
                                                                            ...prev,
                                                                            latitude: loc.latitude,
                                                                            longitude: loc.longitude,
                                                                            city: loc.city || prev.city,
                                                                            addr1: loc.formattedAddress ? String(loc.formattedAddress).split(',')[0] : prev.addr1
                                                                        }));
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </section>
                                        </div>
                                    )}

                                    {/* ══════════════════════════════════════════════════════════════
                                        STEP 2: CONSIGNEE (RECEIVER) — 100% Vertical Stacked Card
                                       ══════════════════════════════════════════════════════════════ */}
                                    {step === 2 && (
                                        <section
                                            aria-label={isRTL ? 'بيانات المستلم (الوجهة)' : 'Consignee Receiver Details'}
                                            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-lg" aria-hidden="true">
                                                            flight_land
                                                        </span>
                                                    </span>
                                                    <div>
                                                        <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                                                            {isRTL ? 'المستلم (وجهة التسليم)' : 'Consignee (Receiver) & Import Details'}
                                                        </h2>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                            {isRTL ? 'عنوان التسليم النهائي، الهوية الضريبية/المدنية وتعليمات التوصيل' : 'Delivery destination, customs Tax/Civil ID, and gate instructions'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {userAddresses.length > 0 && (
                                                    <div className="w-52">
                                                        <SelectWithCaret
                                                            ariaLabel={isRTL ? 'دفتر عناوين المستلم' : 'Consignee Address Book'}
                                                            value=""
                                                            onChange={(e) => applySavedAddress('receiver', e.target.value)}
                                                        >
                                                            <option value="">{isRTL ? 'اختر من دفتر العناوين...' : 'Address Book Quick-Pick...'}</option>
                                                            {userAddresses.map((a, idx) => (
                                                                <option key={a.id || a._id || idx} value={a.id || a._id || idx}>
                                                                    {a.label || a.contactPerson || a.name || `Address ${idx + 1}`}
                                                                </option>
                                                            ))}
                                                        </SelectWithCaret>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 me-1">
                                                    {isRTL ? 'وجهات سريعة:' : 'Quick Hubs:'}
                                                </span>
                                                {CONSIGNEE_HUB_PRESETS.map((preset) => (
                                                    <button
                                                        key={preset.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setReceiver((prev) => ({
                                                                ...prev,
                                                                name: preset.name,
                                                                company: preset.company,
                                                                city: preset.city,
                                                                area: preset.area,
                                                                state: preset.state,
                                                                country: preset.country,
                                                                countryCode: preset.countryCode,
                                                                zip: preset.zip,
                                                                addr1: preset.addr1,
                                                                taxId: preset.taxId,
                                                                latitude: preset.latitude,
                                                                longitude: preset.longitude
                                                            }));
                                                        }}
                                                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-primary/10 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                                    >
                                                        {isRTL ? preset.labelAr : preset.labelEn}
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setReceiver((p) => ({
                                                            ...p,
                                                            phoneCountryCode: SANDBOX_DEFAULT_DIAL_CODE,
                                                            phone: SANDBOX_DEFAULT_LOCAL_PHONE
                                                        }))
                                                    }
                                                    className="px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 cursor-pointer"
                                                >
                                                    <span dir="ltr">Use {SANDBOX_DEFAULT_PHONE}</span>
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div data-field="receiver_name" id="field-receiver_name">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'اسم المستلم' : 'Consignee Full Name'} <span className="text-rose-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={receiver.name}
                                                        onChange={(e) => setReceiver({ ...receiver, name: e.target.value })}
                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                            errors.receiver_name ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    />
                                                    {errors.receiver_name && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.receiver_name}</p>}
                                                </div>

                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'شركة المستلم' : 'Company / Entity'}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={receiver.company}
                                                        onChange={(e) => setReceiver({ ...receiver, company: e.target.value })}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                    />
                                                </div>

                                                <div data-field="receiver_phone" id="field-receiver_phone">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'هاتف المستلم (E.164)' : 'Consignee Phone (E.164)'} <span className="text-rose-500">*</span>
                                                    </label>
                                                    <div
                                                        dir="ltr"
                                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border bg-slate-50 dark:bg-slate-800 ${
                                                            errors.receiver_phone ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    >
                                                        <SearchablePhoneDialSelector
                                                            value={receiver.phoneCountryCode}
                                                            countryCode={receiver.countryCode}
                                                            isRTL={isRTL}
                                                            onChange={(dialCode) => setReceiver((p) => ({ ...p, phoneCountryCode: dialCode }))}
                                                        />
                                                        <input
                                                            dir="ltr"
                                                            type="tel"
                                                            value={receiver.phone}
                                                            onChange={(e) => setReceiver({ ...receiver, phone: e.target.value })}
                                                            className="w-full text-xs font-bold font-mono bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
                                                        />
                                                    </div>
                                                    {errors.receiver_phone && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.receiver_phone}</p>}
                                                </div>

                                                <div data-field="receiver_email" id="field-receiver_email">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'البريد الإلكتروني' : 'Email Address'} <span className="text-rose-500">*</span>
                                                    </label>
                                                    <input
                                                        dir="ltr"
                                                        type="email"
                                                        value={receiver.email}
                                                        onChange={(e) => setReceiver({ ...receiver, email: e.target.value })}
                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                            errors.receiver_email ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    />
                                                    {errors.receiver_email && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.receiver_email}</p>}
                                                </div>

                                                <div className="sm:col-span-2">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'الرقم المدني / السجل التجاري / الضريبي (للتخليص الجمركي)' : 'Civil ID / CR / Tax ID (Customs Clearance)'}
                                                    </label>
                                                    <input
                                                        dir="ltr"
                                                        type="text"
                                                        value={receiver.taxId}
                                                        onChange={(e) => setReceiver({ ...receiver, taxId: e.target.value })}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                                                <div data-field="receiver_addr1" id="field-receiver_addr1">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'عنوان التسليم (الشارع والمبنى - السطر 1)' : 'Delivery Street Address (Line 1)'} <span className="text-rose-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={receiver.addr1}
                                                        onChange={(e) => setReceiver({ ...receiver, addr1: e.target.value })}
                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                            errors.receiver_addr1 ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    />
                                                    {errors.receiver_addr1 && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.receiver_addr1}</p>}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'الشقة / الطابق / المكتب (السطر 2)' : 'Apartment / Suite / Office (Line 2)'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={receiver.addr2}
                                                            onChange={(e) => setReceiver({ ...receiver, addr2: e.target.value })}
                                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'المنطقة / الحي / القطعة' : 'District / Area / Block'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={receiver.area}
                                                            onChange={(e) => setReceiver({ ...receiver, area: e.target.value })}
                                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                                    <div data-field="receiver_city" id="field-receiver_city">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'المدينة' : 'City'} <span className="text-rose-500">*</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={receiver.city}
                                                            onChange={(e) => setReceiver({ ...receiver, city: e.target.value })}
                                                            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                                errors.receiver_city ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                            }`}
                                                        />
                                                        {errors.receiver_city && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.receiver_city}</p>}
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'المحافظة / الإمارة' : 'State / Governorate'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={receiver.state}
                                                            onChange={(e) => setReceiver({ ...receiver, state: e.target.value })}
                                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                        />
                                                    </div>
                                                    <div data-field="receiver_country" id="field-receiver_country">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'الدولة' : 'Country'} <span className="text-rose-500">*</span>
                                                        </label>
                                                        <SearchableCountrySelect
                                                            value={receiver.countryCode}
                                                            valueMode="code"
                                                            isRTL={isRTL}
                                                            error={Boolean(errors.receiver_country)}
                                                            onChange={(code, cObj) =>
                                                                setReceiver((prev) => ({
                                                                    ...prev,
                                                                    countryCode: code,
                                                                    country: cObj?.name || prev.country,
                                                                    zip: NON_POSTAL_COUNTRIES.includes(code)
                                                                        ? '00000'
                                                                        : prev.zip === '00000'
                                                                        ? '12211'
                                                                        : prev.zip
                                                                }))
                                                            }
                                                        />
                                                        {errors.receiver_country && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.receiver_country}</p>}
                                                    </div>
                                                    <div data-field="receiver_zip" id="field-receiver_zip">
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'الرمز البريدي' : 'Postal Code'}{' '}
                                                            {isPostalCodeRequired(receiver.countryCode, receiver.country) && <span className="text-rose-500">*</span>}
                                                        </label>
                                                        <input
                                                            dir="ltr"
                                                            type="text"
                                                            value={receiver.zip}
                                                            onChange={(e) => setReceiver({ ...receiver, zip: e.target.value })}
                                                            className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                                errors.receiver_zip ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                            }`}
                                                        />
                                                        {errors.receiver_zip && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.receiver_zip}</p>}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'تعليمات تسليم المستلم / رمز البوابة / معالم الموقع' : 'Consignee Delivery Instructions / Gate Code / Landmarks'}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={receiver.instructions}
                                                        onChange={(e) => setReceiver({ ...receiver, instructions: e.target.value })}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                    />
                                                </div>

                                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConsigneeMap((v) => !v)}
                                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                                                            travel_explore
                                                        </span>
                                                        <span>
                                                            {showConsigneeMap
                                                                ? isRTL ? 'إخفاء خريطة الوجهة' : 'Hide Google Maps & Pin Drop'
                                                                : isRTL ? 'تحديد الوجهة عبر خرائط جوجل و GPS' : 'Search Google Places & Map Pin Drop'}
                                                        </span>
                                                    </button>

                                                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={saveReceiverToBook}
                                                            onChange={(e) => setSaveReceiverToBook(e.target.checked)}
                                                            className="checkbox checkbox-primary checkbox-xs rounded"
                                                        />
                                                        <span>{isRTL ? 'حفظ المستلم في دفتر العناوين' : 'Save consignee to Address Book'}</span>
                                                    </label>
                                                </div>

                                                {showConsigneeMap && (
                                                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                                                        <GoogleAddressInput
                                                            label={isRTL ? 'بحث عنوان المستلم (Google Places)' : 'Search Drop-off Point (Google Places)'}
                                                            value={{
                                                                formattedAddress: receiver.formattedAddress,
                                                                addressLine1: receiver.addr1,
                                                                city: receiver.city,
                                                                country: receiver.country,
                                                                countryCode: receiver.countryCode
                                                            }}
                                                            onChange={(res) => {
                                                                if (!res) return;
                                                                setReceiver((prev) => ({
                                                                    ...prev,
                                                                    addr1: res.addressLine1 || res.formattedAddress || prev.addr1,
                                                                    city: res.city || prev.city,
                                                                    country: res.country || prev.country,
                                                                    countryCode: res.countryCode || prev.countryCode,
                                                                    latitude: res.latitude ?? prev.latitude,
                                                                    longitude: res.longitude ?? prev.longitude
                                                                }));
                                                            }}
                                                        />
                                                        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                                            <GoogleMapPinDrop
                                                                latitude={receiver.latitude}
                                                                longitude={receiver.longitude}
                                                                height="210px"
                                                                onLocationChange={(loc) => {
                                                                    if (!loc) return;
                                                                    setReceiver((prev) => ({
                                                                        ...prev,
                                                                        latitude: loc.latitude,
                                                                        longitude: loc.longitude,
                                                                        city: loc.city || prev.city,
                                                                        addr1: loc.formattedAddress ? String(loc.formattedAddress).split(',')[0] : prev.addr1
                                                                    }));
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )}

                                    {/* ══════════════════════════════════════════════════════════════
                                        STEP 3: PACKAGE & CARGO (Volumetric ÷ 5000 + Multi-Parcel + DGR)
                                       ══════════════════════════════════════════════════════════════ */}
                                    {step === 3 && (
                                        <div className="space-y-5">
                                            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                                                    <div>
                                                        <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                                                            {isRTL ? 'نوع الشحنة وحاوية التغليف' : 'Consignment Type & Container Profile'}
                                                        </h2>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                            {isRTL ? 'Standard Package أو Document Express' : 'Select Standard Package or Document Express'}
                                                        </p>
                                                    </div>
                                                    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPkg((p) => ({ ...p, shipmentType: 'package', pkgType: p.pkgType === 'Envelope' ? 'Box' : p.pkgType }))}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                                                                pkg.shipmentType !== 'documents' ? 'bg-primary text-white' : 'text-slate-600 dark:text-slate-300'
                                                            }`}
                                                        >
                                                            Standard Package
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleApplyTemplate(
                                                                    DEFAULT_PACKAGE_TEMPLATES.find((t) => t.id === 'doc_env') || {
                                                                        name: 'Document Express',
                                                                        pkgType: 'Envelope',
                                                                        weight: '0.2',
                                                                        length: '32',
                                                                        width: '24',
                                                                        height: '2',
                                                                        description: 'Legal documents & contracts',
                                                                        value: '5.000',
                                                                        dangerousGoods: false
                                                                    }
                                                                )
                                                            }
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                                                                pkg.shipmentType === 'documents' ? 'bg-primary text-white' : 'text-slate-600 dark:text-slate-300'
                                                            }`}
                                                        >
                                                            Document Express
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {containerTypes.map((c) => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => {
                                                                const cfg = getContainerTypeById(c.id);
                                                                setPkg((prev) => ({
                                                                    ...prev,
                                                                    shipmentType: c.id === 'Envelope' ? 'documents' : 'package',
                                                                    pkgType: c.id,
                                                                    packagesList: (prev.packagesList || []).map((item, i) =>
                                                                        i === 0
                                                                            ? {
                                                                                  ...item,
                                                                                  pkgType: c.id,
                                                                                  length: String(cfg.length || item.length),
                                                                                  width: String(cfg.width || item.width),
                                                                                  height: String(cfg.height || item.height),
                                                                                  weight: String(cfg.weight || item.weight)
                                                                              }
                                                                            : item
                                                                    )
                                                                }));
                                                            }}
                                                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                                                                pkg.pkgType === c.id
                                                                    ? 'border-primary bg-primary text-white'
                                                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-base" aria-hidden="true">
                                                                {c.icon || 'inventory_2'}
                                                            </span>
                                                            <span>{isRTL ? c.nameAr || c.name : c.name}</span>
                                                        </button>
                                                    ))}
                                                </div>

                                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                                                            {isRTL ? 'قوالب الطرود الجاهزة:' : 'Cargo Presets & Quick Templates:'}
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={handleCloneLastShipment}
                                                                disabled={cloningLastShipment}
                                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50"
                                                            >
                                                                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                                                    content_copy
                                                                </span>
                                                                <span>
                                                                    {cloningLastShipment
                                                                        ? isRTL ? 'جاري التحميل...' : 'Cloning...'
                                                                        : isRTL ? 'استنساخ آخر شحنة' : 'Clone Last Shipment'}
                                                                </span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowTemplateInput((v) => !v)}
                                                                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer"
                                                            >
                                                                <span className="material-symbols-outlined text-sm" aria-hidden="true">
                                                                    bookmark_add
                                                                </span>
                                                                <span>{isRTL ? 'حفظ كقالب مخصص' : 'Save as Preset'}</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {showTemplateInput && (
                                                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                                            <input
                                                                type="text"
                                                                value={customTemplateName}
                                                                onChange={(e) => setCustomTemplateName(e.target.value)}
                                                                placeholder={isRTL ? 'اسم القالب المخصص...' : 'Preset name...'}
                                                                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={handleSaveCustomTemplate}
                                                                className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer"
                                                            >
                                                                {isRTL ? 'حفظ' : 'Save'}
                                                            </button>
                                                        </div>
                                                    )}

                                                    <div className="flex flex-wrap gap-1.5">
                                                        {templates.map((tmpl) => (
                                                            <div key={tmpl.id} className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleApplyTemplate(tmpl)}
                                                                    className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                                                >
                                                                    {tmpl.name}
                                                                </button>
                                                                {String(tmpl.id).startsWith('custom_') && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteCustomTemplate(tmpl.id)}
                                                                        aria-label={`Delete preset ${tmpl.name}`}
                                                                        className="px-1.5 py-1 text-[11px] font-bold text-slate-400 hover:text-rose-500 cursor-pointer"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </section>

                                            {/* Parcels & Volumetric Calculator */}
                                            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                                                    <div>
                                                        <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                                                            {isRTL
                                                                ? `الطرود وحاسبة الوزن الحجمي (÷ ${VOLUMETRIC_DIVISOR})`
                                                                : `Parcels & Volumetric Weight Calculator (÷ ${VOLUMETRIC_DIVISOR})`}
                                                        </h2>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                            {isRTL
                                                                ? 'الوزن المعتمد = الأكبر بين الفعلي والحجمي (الطول × العرض × الارتفاع ÷ 5000)'
                                                                : 'Chargeable weight = max(Actual Weight, Volumetric L×W×H ÷ 5000)'}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleAddParcel}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 dark:bg-sky-500/15 text-primary dark:text-sky-300 text-xs font-extrabold cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-base" aria-hidden="true">
                                                            add
                                                        </span>
                                                        <span>{isRTL ? 'إضافة طرد' : 'Add Another Package'}</span>
                                                    </button>
                                                </div>

                                                {(pkg.packagesList || []).map((parcel, idx) => {
                                                    const m = calculateParcelMetrics(parcel);
                                                    const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;
                                                    return (
                                                        <div
                                                            key={parcel.id || idx}
                                                            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3"
                                                        >
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span dir="ltr" className="px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-700 text-white font-mono text-[11px] font-black">
                                                                        #{idx + 1}
                                                                    </span>
                                                                    <span dir="ltr" className="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300">
                                                                        Chargeable: {m.chargeableWeight.toFixed(2)} kg ({m.isVolumetricGoverning ? 'Volumetric' : 'Actual'})
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDuplicateParcel(idx)}
                                                                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                                                                    >
                                                                        {isRTL ? 'تكرار' : 'Duplicate'}
                                                                    </button>
                                                                    {(pkg.packagesList || []).length > 1 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveParcel(idx)}
                                                                            className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-bold text-rose-600 dark:text-rose-300 cursor-pointer"
                                                                        >
                                                                            {isRTL ? 'حذف' : 'Remove'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                                <div className="sm:col-span-2" data-field={`${pfx}_description`} id={`field-${pfx}_description`}>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'وصف المحتوى' : 'Contents Description'} <span className="text-rose-500">*</span>
                                                                    </label>
                                                                    <input
                                                                        type="text"
                                                                        value={parcel.description}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'description', e.target.value)}
                                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                                                                            errors[`${pfx}_description`] ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                        }`}
                                                                    />
                                                                    {errors[`${pfx}_description`] && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors[`${pfx}_description`]}</p>}
                                                                </div>
                                                                <div>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'الكمية (قطعة)' : 'Quantity (pcs)'}
                                                                    </label>
                                                                    <input
                                                                        dir="ltr"
                                                                        type="number"
                                                                        min="1"
                                                                        value={parcel.qty}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'qty', e.target.value)}
                                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                                <div data-field={`${pfx}_weight`} id={`field-${pfx}_weight`}>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'الوزن (kg)' : 'Weight (kg)'} <span className="text-rose-500">*</span>
                                                                    </label>
                                                                    <input
                                                                        dir="ltr"
                                                                        type="number"
                                                                        step="0.1"
                                                                        min="0.1"
                                                                        value={parcel.weight}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'weight', e.target.value)}
                                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                                                                            errors[`${pfx}_weight`] ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                        }`}
                                                                    />
                                                                    {errors[`${pfx}_weight`] && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors[`${pfx}_weight`]}</p>}
                                                                </div>
                                                                <div data-field={`${pfx}_length`} id={`field-${pfx}_length`}>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'الطول (cm)' : 'Length (cm)'} <span className="text-rose-500">*</span>
                                                                    </label>
                                                                    <input
                                                                        dir="ltr"
                                                                        type="number"
                                                                        min="1"
                                                                        value={parcel.length}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'length', e.target.value)}
                                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                                                                            errors[`${pfx}_length`] ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                        }`}
                                                                    />
                                                                    {errors[`${pfx}_length`] && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors[`${pfx}_length`]}</p>}
                                                                </div>
                                                                <div data-field={`${pfx}_width`} id={`field-${pfx}_width`}>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'العرض (cm)' : 'Width (cm)'} <span className="text-rose-500">*</span>
                                                                    </label>
                                                                    <input
                                                                        dir="ltr"
                                                                        type="number"
                                                                        min="1"
                                                                        value={parcel.width}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'width', e.target.value)}
                                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                                                                            errors[`${pfx}_width`] ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                        }`}
                                                                    />
                                                                    {errors[`${pfx}_width`] && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors[`${pfx}_width`]}</p>}
                                                                </div>
                                                                <div data-field={`${pfx}_height`} id={`field-${pfx}_height`}>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'الارتفاع (cm)' : 'Height (cm)'} <span className="text-rose-500">*</span>
                                                                    </label>
                                                                    <input
                                                                        dir="ltr"
                                                                        type="number"
                                                                        min="1"
                                                                        value={parcel.height}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'height', e.target.value)}
                                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                                                                            errors[`${pfx}_height`] ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                        }`}
                                                                    />
                                                                    {errors[`${pfx}_height`] && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors[`${pfx}_height`]}</p>}
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                                                                <div data-field={`${pfx}_value`} id={`field-${pfx}_value`}>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'القيمة المعلنة' : 'Declared Value'}{' '}
                                                                        {pkg.shipmentType !== 'documents' && <span className="text-rose-500">*</span>}
                                                                    </label>
                                                                    <input
                                                                        dir="ltr"
                                                                        type="number"
                                                                        step="0.5"
                                                                        value={parcel.value}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'value', e.target.value)}
                                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                                                                            errors[`${pfx}_value`] ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                                        }`}
                                                                    />
                                                                    {errors[`${pfx}_value`] && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors[`${pfx}_value`]}</p>}
                                                                </div>
                                                                <div>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'العملة' : 'Currency'}
                                                                    </label>
                                                                    <SelectWithCaret
                                                                        ariaLabel="Parcel Currency"
                                                                        value={parcel.currency || 'KWD'}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'currency', e.target.value)}
                                                                    >
                                                                        <option value="KWD">KWD</option>
                                                                        <option value="USD">USD</option>
                                                                        <option value="EUR">EUR</option>
                                                                        <option value="GBP">GBP</option>
                                                                        <option value="AED">AED</option>
                                                                        <option value="SAR">SAR</option>
                                                                    </SelectWithCaret>
                                                                </div>
                                                                <div>
                                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                                        {isRTL ? 'الرمز الجمركي للقطعة (HS)' : 'Parcel HS Code'}
                                                                    </label>
                                                                    <input
                                                                        dir="ltr"
                                                                        type="text"
                                                                        value={parcel.hsCode || ''}
                                                                        onChange={(e) => handleUpdateParcel(idx, 'hsCode', e.target.value)}
                                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </section>

                                            {/* IATA Dangerous Goods (DGR) Full Parity Section */}
                                            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                                                pkg.dangerousGoods ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-lg" aria-hidden="true">
                                                                warning
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">
                                                                {isRTL ? 'مواد خطرة خاضعة للوائح IATA DGR' : 'Contains Dangerous Goods (IATA DGR)'}
                                                            </h2>
                                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                                {isRTL ? 'عطور، بطاريات ليثيوم، رذاذ ومواد قابلة للاشتعال' : 'Perfumes, lithium batteries, aerosols, flammable liquids'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                                        <input
                                                            type="checkbox"
                                                            checked={pkg.dangerousGoods}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setPkg((prev) => ({
                                                                    ...prev,
                                                                    dangerousGoods: checked,
                                                                    unCode: checked ? prev.unCode || 'UN1266' : '',
                                                                    dgClass: checked ? prev.dgClass || 'Class 3 — Flammable Liquid' : '',
                                                                    properShippingName: checked
                                                                        ? prev.properShippingName || 'PERFUMERY PRODUCTS WITH FLAMMABLE SOLVENTS'
                                                                        : ''
                                                                }));
                                                            }}
                                                            className="toggle toggle-warning toggle-sm"
                                                        />
                                                        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                                                            {pkg.dangerousGoods ? (isRTL ? 'مفعل (DGR)' : 'DGR Active') : (isRTL ? 'بضاعة عادية' : 'Standard')}
                                                        </span>
                                                    </label>
                                                </div>

                                                {pkg.dangerousGoods && (
                                                    <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 space-y-3">
                                                        <SelectWithCaret
                                                            ariaLabel="IATA DGR Preset"
                                                            value={DG_PRESET_OPTIONS.find((o) => o.unCode === pkg.unCode)?.id || 'un1266_pax'}
                                                            onChange={(e) => {
                                                                const sel = DG_PRESET_OPTIONS.find((o) => o.id === e.target.value);
                                                                if (!sel || sel.id === 'none') return;
                                                                setPkg((p) => ({
                                                                    ...p,
                                                                    dangerousGoods: true,
                                                                    unCode: sel.unCode,
                                                                    dgClass: sel.dgClass,
                                                                    properShippingName: sel.properShippingName,
                                                                    packingGroup: sel.packingGroup,
                                                                    dgServiceCode: sel.serviceCode,
                                                                    dgContentId: sel.contentId,
                                                                    dgMarks: sel.marks
                                                                }));
                                                            }}
                                                        >
                                                            {DG_PRESET_OPTIONS.filter((o) => o.id !== 'none').map((opt) => (
                                                                <option key={opt.id} value={opt.id}>
                                                                    {opt.name}
                                                                </option>
                                                            ))}
                                                        </SelectWithCaret>

                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                            <div>
                                                                <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                                                    UN Code <span className="text-rose-500">*</span>
                                                                </label>
                                                                <input
                                                                    dir="ltr"
                                                                    type="text"
                                                                    value={pkg.unCode}
                                                                    onChange={(e) => setPkg({ ...pkg, unCode: e.target.value })}
                                                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                                                    Hazard Class <span className="text-rose-500">*</span>
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    value={pkg.dgClass}
                                                                    onChange={(e) => setPkg({ ...pkg, dgClass: e.target.value })}
                                                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                                                    Packing Group
                                                                </label>
                                                                <input
                                                                    dir="ltr"
                                                                    type="text"
                                                                    value={pkg.packingGroup}
                                                                    onChange={(e) => setPkg({ ...pkg, packingGroup: e.target.value })}
                                                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                                                    Carrier Service Code (HE/HV)
                                                                </label>
                                                                <input
                                                                    dir="ltr"
                                                                    type="text"
                                                                    value={pkg.dgServiceCode}
                                                                    onChange={(e) => setPkg({ ...pkg, dgServiceCode: e.target.value })}
                                                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                                                    DGR Content ID
                                                                </label>
                                                                <input
                                                                    dir="ltr"
                                                                    type="text"
                                                                    value={pkg.dgContentId}
                                                                    onChange={(e) => setPkg({ ...pkg, dgContentId: e.target.value })}
                                                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                                                    Proper Shipping Name <span className="text-rose-500">*</span>
                                                                </label>
                                                                <input
                                                                    type="text"
                                                                    value={pkg.properShippingName}
                                                                    onChange={(e) => setPkg({ ...pkg, properShippingName: e.target.value })}
                                                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 block mb-1">
                                                                {isRTL ? 'بيان وعلامات المواد الخطرة (DGR Marks)' : 'DGR Marks & Custom Declaration'}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={pkg.dgMarks}
                                                                onChange={(e) => setPkg({ ...pkg, dgMarks: e.target.value })}
                                                                placeholder="DANGEROUS GOODS AS PER ASSOCIATED DGD"
                                                                className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </section>
                                        </div>
                                    )}

                                    {/* ══════════════════════════════════════════════════════════════
                                        STEP 4: CARRIER & SERVICES (Quotes + SLA + Add-ons + Pickup)
                                       ══════════════════════════════════════════════════════════════ */}
                                    {step === 4 && (
                                        <div className="space-y-5">
                                            {(assignedCarrierPolicy?.locked || isCarrierLocked) && (
                                                <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 flex items-center gap-3">
                                                    <span className="material-symbols-outlined text-xl text-primary dark:text-sky-400" aria-hidden="true">
                                                        lock
                                                    </span>
                                                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                                        {isCarrierLocked
                                                            ? isRTL ? 'الناقل مقفل بعد الحجز الفعلي' : 'Carrier is locked after active booking'
                                                            : isRTL
                                                            ? `حسابك مخصص للناقل المعتمد (${assignedCarrierPolicy.carrierCode})`
                                                            : `Assigned Carrier Policy Active (${assignedCarrierPolicy.carrierCode})`}
                                                    </div>
                                                </div>
                                            )}

                                            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                                                    <div>
                                                        <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                                                            {isRTL ? 'مقارنة عروض الناقلين ومؤشر الالتزام (SLA)' : 'Select Carrier & Compare Live Quotes'}
                                                        </h2>
                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                            {isRTL
                                                                ? `محسوبة للوزن المعتمد (${weightMetrics.chargeableWeight.toFixed(2)} كجم)`
                                                                : `Rated for ${weightMetrics.chargeableWeight.toFixed(2)} kg chargeable weight (${sender.countryCode} → ${receiver.countryCode})`}
                                                        </p>
                                                    </div>
                                                    {quoteFetchError && (
                                                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                                            {isRTL ? 'تعرفة قياسية (Sandbox)' : 'Sandbox Contract Tariff'}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    {carrierRateMatrix.map((c) => {
                                                        const isSelected = service.carrierCode === c.code;
                                                        const dgrBlocked = pkg.dangerousGoods && !c.supportsDgr;
                                                        const isDisabled = isCarrierLocked || c.isPolicyLockedOut || dgrBlocked;

                                                        return (
                                                            <div
                                                                key={c.code}
                                                                role="radio"
                                                                aria-checked={isSelected}
                                                                tabIndex={isDisabled ? -1 : 0}
                                                                onClick={() => {
                                                                    if (isDisabled) return;
                                                                    setService((prev) => ({
                                                                        ...prev,
                                                                        carrierCode: c.code,
                                                                        serviceCode: c.serviceCode,
                                                                        serviceName: c.nameEn
                                                                    }));
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (isDisabled) return;
                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                        e.preventDefault();
                                                                        setService((prev) => ({
                                                                            ...prev,
                                                                            carrierCode: c.code,
                                                                            serviceCode: c.serviceCode,
                                                                            serviceName: c.nameEn
                                                                        }));
                                                                    }
                                                                }}
                                                                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                                                                    isSelected
                                                                        ? 'border-primary bg-primary/5 dark:border-sky-400 dark:bg-sky-500/10 ring-1 ring-primary/30'
                                                                        : isDisabled
                                                                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/30 opacity-60 cursor-not-allowed'
                                                                        : 'border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/50 hover:border-primary/40 cursor-pointer'
                                                                }`}
                                                            >
                                                                <div className="flex items-start sm:items-center gap-3 min-w-0">
                                                                    <div
                                                                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                                                                            isSelected
                                                                                ? 'border-primary bg-primary text-white'
                                                                                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                                                                        }`}
                                                                    >
                                                                        {isSelected && <span className="material-symbols-outlined text-xs">check</span>}
                                                                    </div>

                                                                    <span dir="ltr" className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-tight shrink-0 ${c.accentClass}`}>
                                                                        {c.emblem}
                                                                    </span>

                                                                    <div className="min-w-0">
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                                                                                {isRTL ? c.nameAr : c.nameEn}
                                                                            </span>
                                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 whitespace-nowrap">
                                                                                {c.slaPct}% SLA
                                                                            </span>
                                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                                                                {isRTL ? c.transitAr : c.transitEn}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                                            {isRTL ? c.descAr : c.descEn}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/70 dark:border-slate-700/70">
                                                                    <div dir="ltr" className="text-sm sm:text-base font-black font-mono tabular-nums text-primary dark:text-sky-400 whitespace-nowrap">
                                                                        {c.finalCost.toFixed(3)} KWD
                                                                    </div>
                                                                    {canViewCostData && c.wholesaleCost !== null ? (
                                                                        <div dir="ltr" className="text-[10.5px] font-mono font-bold text-indigo-600 dark:text-indigo-300 whitespace-nowrap">
                                                                            Cost: {c.wholesaleCost.toFixed(3)} • Margin: +{c.grossMargin.toFixed(3)} ({c.marginPct}%)
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                                            {isRTL ? 'شامل رسوم الوقود' : 'Incl. fuel & surcharges'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </section>

                                            {/* Value-Added Services & Pickup Scheduling */}
                                            <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
                                                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                                                    {isRTL ? 'الخدمات اللوجستية المضافة وجدولة الاستلام' : 'Value-Added Services & Pickup Logistics'}
                                                </h3>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                    {V2_VALUE_ADDED_SERVICES.map((addon) => {
                                                        const isActive = (service.selectedAddons || []).some((a) => a.serviceCode === addon.serviceCode);
                                                        return (
                                                            <button
                                                                key={addon.serviceCode}
                                                                type="button"
                                                                onClick={() => {
                                                                    setService((prev) => {
                                                                        const exists = (prev.selectedAddons || []).some((a) => a.serviceCode === addon.serviceCode);
                                                                        return {
                                                                            ...prev,
                                                                            selectedAddons: exists
                                                                                ? prev.selectedAddons.filter((a) => a.serviceCode !== addon.serviceCode)
                                                                                : [...(prev.selectedAddons || []), addon]
                                                                        };
                                                                    });
                                                                }}
                                                                className={`p-3 rounded-xl border text-start flex items-center justify-between gap-2 cursor-pointer ${
                                                                    isActive
                                                                        ? 'border-primary bg-primary/5 dark:border-sky-400 dark:bg-sky-500/10'
                                                                        : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50'
                                                                }`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">
                                                                        {isRTL ? addon.nameAr : addon.nameEn}
                                                                    </div>
                                                                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                                                                        {isRTL ? addon.descAr : addon.descEn}
                                                                    </div>
                                                                </div>
                                                                <span dir="ltr" className="text-xs font-mono font-black text-primary dark:text-sky-400 shrink-0">
                                                                    +{addon.rate.toFixed(3)} KWD
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'طريقة الاستلام' : 'Collection Method'}
                                                        </label>
                                                        <SelectWithCaret
                                                            ariaLabel="Collection Method"
                                                            value={service.pickupType}
                                                            onChange={(e) => setService({ ...service, pickupType: e.target.value })}
                                                        >
                                                            <option value="Schedule Driver Pickup">{isRTL ? 'جدولة مندوب استلام' : 'Schedule Driver Pickup'}</option>
                                                            <option value="Drop-off at Station">{isRTL ? 'تسليم في فرع الشويخ' : 'Drop-off at Station / Hub'}</option>
                                                        </SelectWithCaret>
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'تاريخ الاستلام' : 'Pickup Date'}
                                                        </label>
                                                        <input
                                                            dir="ltr"
                                                            type="date"
                                                            value={service.pickupDate}
                                                            onChange={(e) => setService({ ...service, pickupDate: e.target.value })}
                                                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                            {isRTL ? 'الفترة الزمنية' : 'Pickup Window'}
                                                        </label>
                                                        <SelectWithCaret
                                                            ariaLabel="Pickup Window"
                                                            value={service.pickupTime}
                                                            onChange={(e) => setService({ ...service, pickupTime: e.target.value })}
                                                        >
                                                            <option value="9:00 AM – 12:00 PM">9:00 AM – 12:00 PM</option>
                                                            <option value="12:00 PM – 4:00 PM">12:00 PM – 4:00 PM</option>
                                                            <option value="4:00 PM – 8:00 PM">4:00 PM – 8:00 PM</option>
                                                        </SelectWithCaret>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'تعليمات خاصة للسائق ومندوب الاستلام' : 'Driver Instructions & Notes'}
                                                    </label>
                                                    <textarea
                                                        rows={2}
                                                        value={service.instructions}
                                                        onChange={(e) => setService({ ...service, instructions: e.target.value })}
                                                        placeholder={isRTL ? 'مثال: رنين جرس المستودع، بوابة رقم 3...' : 'e.g. Ring warehouse bell, gate 4 loading dock...'}
                                                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-none"
                                                    />
                                                </div>
                                            </section>
                                        </div>
                                    )}

                                    {/* ══════════════════════════════════════════════════════════════
                                        STEP 5: CUSTOMS & LOGISTICS (Full Parity with V1 Step 5)
                                       ══════════════════════════════════════════════════════════════ */}
                                    {step === 5 && (
                                        <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-2xs space-y-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                                                <div>
                                                    <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                                                        {isRTL ? 'البيانات الجمركية والفاتورة التجارية والتجارة اللاورقية' : 'Customs Declarations, Commercial Invoice & PLT'}
                                                    </h2>
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                        {isRTL ? 'شروط التجارة الدولية (Incoterms) وبيانات الفاتورة والتخليص الجمركي' : 'Incoterms, declared valuation, HS tariff code, and Paperless Trade'}
                                                    </p>
                                                </div>
                                                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={customs.paperlessTrade}
                                                        onChange={(e) => setCustoms({ ...customs, paperlessTrade: e.target.checked })}
                                                        className="toggle toggle-primary toggle-xs"
                                                    />
                                                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-primary/10 dark:bg-sky-500/20 text-primary dark:text-sky-300">
                                                        PLT Active
                                                    </span>
                                                </label>
                                            </div>

                                            {/* Quick-Pick HS Tariff Codes */}
                                            <div>
                                                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                                                    {isRTL ? 'اختيار سريع لرمز البند الجمركي (HS Code):' : 'Quick-Pick Standard HS Tariff Code:'}
                                                </label>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {HS_CODE_PRESETS.map((hs) => (
                                                        <button
                                                            key={hs.code}
                                                            type="button"
                                                            onClick={() => setCustoms((prev) => ({ ...prev, hsCode: hs.code }))}
                                                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                                                                customs.hsCode === hs.code
                                                                    ? 'border-primary bg-primary text-white'
                                                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                                            }`}
                                                        >
                                                            {isRTL ? hs.labelAr : hs.labelEn}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                <div data-field="customs_invoiceNum" id="field-customs_invoiceNum">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'رقم الفاتورة التجارية' : 'Commercial Invoice No.'} <span className="text-rose-500">*</span>
                                                    </label>
                                                    <input
                                                        dir="ltr"
                                                        type="text"
                                                        value={customs.invoiceNum}
                                                        onChange={(e) => setCustoms({ ...customs, invoiceNum: e.target.value })}
                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                            errors.customs_invoiceNum ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    />
                                                    {errors.customs_invoiceNum && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.customs_invoiceNum}</p>}
                                                </div>
                                                <div data-field="customs_invoiceVal" id="field-customs_invoiceVal">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'القيمة الجمركية المصرحة' : 'Declared Customs Value'}
                                                    </label>
                                                    <input
                                                        dir="ltr"
                                                        type="number"
                                                        step="0.1"
                                                        value={customs.invoiceVal}
                                                        onChange={(e) => setCustoms({ ...customs, invoiceVal: e.target.value })}
                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                            errors.customs_invoiceVal ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    />
                                                    {errors.customs_invoiceVal && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.customs_invoiceVal}</p>}
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'عملة الفاتورة' : 'Invoice Currency'}
                                                    </label>
                                                    <SelectWithCaret
                                                        ariaLabel="Invoice Currency"
                                                        value={customs.currency}
                                                        onChange={(e) => setCustoms({ ...customs, currency: e.target.value })}
                                                    >
                                                        <option value="KWD">KWD – Kuwaiti Dinar</option>
                                                        <option value="SAR">SAR – Saudi Riyal</option>
                                                        <option value="AED">AED – UAE Dirham</option>
                                                        <option value="USD">USD – US Dollar</option>
                                                        <option value="EUR">EUR – Euro</option>
                                                        <option value="GBP">GBP – British Pound</option>
                                                    </SelectWithCaret>
                                                </div>
                                                <div data-field="customs_hsCode" id="field-customs_hsCode">
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'رمز البند الجمركي (HS Code)' : 'HS / Tariff Code'} <span className="text-rose-500">*</span>
                                                    </label>
                                                    <input
                                                        dir="ltr"
                                                        type="text"
                                                        value={customs.hsCode}
                                                        onChange={(e) => setCustoms({ ...customs, hsCode: e.target.value })}
                                                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ${
                                                            errors.customs_hsCode ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:bg-rose-950/20' : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                    />
                                                    {errors.customs_hsCode && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{errors.customs_hsCode}</p>}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'شروط التجارة الدولية (Incoterms)' : 'Incoterms (Terms of Sale)'}
                                                    </label>
                                                    <SelectWithCaret
                                                        ariaLabel="Incoterms"
                                                        value={customs.incoterms}
                                                        onChange={(e) => setCustoms({ ...customs, incoterms: e.target.value })}
                                                    >
                                                        <option value="DAP – Delivered at Place">DAP – Delivered at Place</option>
                                                        <option value="DDP – Delivered Duty Paid">DDP – Delivered Duty Paid</option>
                                                        <option value="CIF – Cost, Insurance and Freight">CIF – Cost, Insurance and Freight</option>
                                                        <option value="EXW – Ex Works">EXW – Ex Works</option>
                                                        <option value="FOB – Free on Board">FOB – Free on Board</option>
                                                    </SelectWithCaret>
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'تصنيف وغرض الشحنة' : 'Shipment Purpose / Category'}
                                                    </label>
                                                    <SelectWithCaret
                                                        ariaLabel="Shipment Purpose"
                                                        value={customs.shipmentPurpose}
                                                        onChange={(e) => setCustoms({ ...customs, shipmentPurpose: e.target.value })}
                                                    >
                                                        <option value="Commercial">Commercial Cargo / Merchandise</option>
                                                        <option value="Personal">Personal Effects / Private Goods</option>
                                                        <option value="Sample">Commercial Sample / Prototype</option>
                                                        <option value="Return">Return for Repair / Warranty</option>
                                                    </SelectWithCaret>
                                                </div>
                                                <div>
                                                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                        {isRTL ? 'بلد المنشأ' : 'Country of Origin'}
                                                    </label>
                                                    <SearchableCountrySelect
                                                        value={customs.origin || 'Kuwait'}
                                                        valueMode="name"
                                                        isRTL={isRTL}
                                                        onChange={(countryName) => setCustoms((p) => ({ ...p, origin: countryName }))}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                                    {isRTL ? 'ملاحظات الفاتورة التجارية وتصريحات التخليص' : 'Commercial Invoice Declarations & Clearance Instructions'}
                                                </label>
                                                <textarea
                                                    rows={2}
                                                    value={customs.notes}
                                                    onChange={(e) => setCustoms({ ...customs, notes: e.target.value })}
                                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-none"
                                                />
                                            </div>
                                        </section>
                                    )}

                                    {/* ══════════════════════════════════════════════════════════════
                                        STEP 6: REVIEW, SANDBOX-SAFE BOOKING & WAYBILL SUMMARY
                                       ══════════════════════════════════════════════════════════════ */}
                                    {step === 6 && (
                                        <div className="space-y-5">
                                            {mode === 'edit' && (
                                                <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 text-xs font-semibold text-sky-900 dark:text-sky-200">
                                                    {changedFieldsList.length > 0
                                                        ? `${isRTL ? 'الحقول المعدلة:' : 'Modified fields:'} ${changedFieldsList.join(', ')}`
                                                        : isRTL ? 'لم يتم تعديل أي حقول حتى الآن.' : 'No modifications detected yet from original consignment.'}
                                                </div>
                                            )}

                                            {/* Sandbox-Safe Booking Control */}
                                            <section className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="material-symbols-outlined text-2xl text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true">
                                                        shield_lock
                                                    </span>
                                                    <div>
                                                        <h2 className="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-100">
                                                            {isRTL ? 'وضع الحماية التجريبية مفعل (Sandbox-Safe Booking)' : 'Sandbox-Safe Booking Mode Active'}
                                                        </h2>
                                                        <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                                                            {isRTL
                                                                ? `يتم توجيه أرقام الهواتف تلقائياً إلى ${SANDBOX_DEFAULT_PHONE} وحفظ البوليصة محلياً.`
                                                                : `Enforces test phone (${SANDBOX_DEFAULT_PHONE}) and creates a local sandbox waybill without firing live 3PL charges.`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <label className="inline-flex items-center gap-2 cursor-pointer shrink-0 select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={sandboxSafeMode}
                                                        onChange={(e) => setSandboxSafeMode(e.target.checked)}
                                                        className="toggle toggle-success toggle-sm"
                                                    />
                                                    <span className="text-xs font-extrabold text-emerald-950 dark:text-emerald-200">
                                                        {sandboxSafeMode ? 'Sandbox Safe' : 'Standard'}
                                                    </span>
                                                </label>
                                            </section>

                                            {/* Vertical Stacked Review Dossier */}
                                            <div className="space-y-4">
                                                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-3">
                                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                                                        <h3 className="text-xs font-black text-slate-900 dark:text-slate-100">
                                                            {isRTL ? '١-٢. مسار الشحنة (المرسل والمستلم)' : '1–2. Origin & Consignee Route'}
                                                        </h3>
                                                        <div className="flex items-center gap-3">
                                                            <button type="button" onClick={() => setStep(1)} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                                {isRTL ? 'تعديل المرسل' : 'Edit Origin'}
                                                            </button>
                                                            <button type="button" onClick={() => setStep(2)} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                                {isRTL ? 'تعديل المستلم' : 'Edit Consignee'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                                        <div>
                                                            <span className="text-[10.5px] font-bold text-slate-400 block">{isRTL ? 'من (المرسل):' : 'Origin (Shipper):'}</span>
                                                            <div className="font-bold text-slate-900 dark:text-slate-100">{sender.name} {sender.company ? `• ${sender.company}` : ''}</div>
                                                            <div className="text-slate-600 dark:text-slate-300">{sender.addr1}, {sender.city}, {sender.countryCode}</div>
                                                            <div dir="ltr" className="font-mono text-[11px] text-slate-500">
                                                                {sandboxSafeMode ? SANDBOX_DEFAULT_PHONE : `${sender.phoneCountryCode}${sender.phone}`}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10.5px] font-bold text-slate-400 block">{isRTL ? 'إلى (المستلم):' : 'Consignee (Receiver):'}</span>
                                                            <div className="font-bold text-slate-900 dark:text-slate-100">{receiver.name} {receiver.company ? `• ${receiver.company}` : ''}</div>
                                                            <div className="text-slate-600 dark:text-slate-300">{receiver.addr1}, {receiver.city}, {receiver.countryCode}</div>
                                                            <div dir="ltr" className="font-mono text-[11px] text-slate-500">
                                                                {sandboxSafeMode ? SANDBOX_DEFAULT_PHONE : `${receiver.phoneCountryCode}${receiver.phone}`}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 space-y-2 text-xs">
                                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                                                        <h3 className="font-black text-slate-900 dark:text-slate-100">
                                                            {isRTL ? '٣-٥. الطرود، الناقل والجمارك' : '3–5. Cargo, Carrier & Customs Summary'}
                                                        </h3>
                                                        <div className="flex items-center gap-3">
                                                            <button type="button" onClick={() => setStep(3)} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                                {isRTL ? 'الطرود' : 'Edit Cargo'}
                                                            </button>
                                                            <button type="button" onClick={() => setStep(4)} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                                {isRTL ? 'الناقل' : 'Edit Carrier'}
                                                            </button>
                                                            <button type="button" onClick={() => setStep(5)} className="text-xs font-bold text-primary dark:text-sky-400 hover:underline cursor-pointer">
                                                                {isRTL ? 'الجمارك' : 'Edit Customs'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">{isRTL ? 'نوع الشحنة:' : 'Shipment Type:'}</span>
                                                        <span className="font-bold text-slate-900 dark:text-slate-100">
                                                            {pkg.shipmentType === 'documents' ? 'Document Express' : `Standard Package (${pkg.pkgType})`}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">{isRTL ? 'الوزن الخاضع للتسعير:' : 'Chargeable Weight:'}</span>
                                                        <span dir="ltr" className="font-mono font-black text-primary dark:text-sky-400">
                                                            {weightMetrics.chargeableWeight.toFixed(2)} kg (Actual: {weightMetrics.actualWeight.toFixed(2)} kg / Vol: {weightMetrics.volumetricWeight.toFixed(2)} kg)
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">{isRTL ? 'الناقل المختار:' : 'Carrier & SLA:'}</span>
                                                        <span className="font-bold text-slate-900 dark:text-slate-100">
                                                            {isRTL ? selectedCarrier.nameAr : selectedCarrier.nameEn} ({selectedCarrier.slaPct}% SLA)
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">{isRTL ? 'البند الجمركي و Incoterms:' : 'HS Code & Incoterms:'}</span>
                                                        <span dir="ltr" className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                                            {customs.hsCode} • {customs.incoterms?.split('–')[0]?.trim() || 'DAP'}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">{isRTL ? 'الجمارك والضرائب:' : 'Duties & Taxes:'}</span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-200">
                                                            {customs.incoterms?.toUpperCase().includes('DDP')
                                                                ? isRTL ? 'مدفوعة مسبقاً (DDP)' : 'Prepaid by Sender (DDP)'
                                                                : receiver.countryCode === 'KW' || service.carrierCode === 'INTERNAL'
                                                                ? isRTL ? 'معفى (شحن محلي)' : '0.000 (Domestic Exempt)'
                                                                : isRTL ? 'على المستلم (DAP)' : 'Payable by Consignee (DAP)'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div
                                                data-field="review_policy"
                                                id="field-review_policy"
                                                className={`p-4 rounded-2xl border transition-all flex items-start gap-3 ${
                                                    agreedToPolicy
                                                        ? 'border-primary bg-primary/5 dark:border-sky-400 dark:bg-sky-500/10'
                                                        : errors.review_policy
                                                        ? 'border-rose-400 ring-1 ring-rose-400/30 bg-rose-50/40 dark:border-rose-500 dark:bg-rose-950/30'
                                                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    id="v2PolicyAgreement"
                                                    checked={agreedToPolicy}
                                                    onChange={(e) => {
                                                        setAgreedToPolicy(e.target.checked);
                                                        if (errors.review_policy) {
                                                            setErrors((p) => {
                                                                const n = { ...p };
                                                                delete n.review_policy;
                                                                return n;
                                                            });
                                                        }
                                                    }}
                                                    className="checkbox checkbox-primary checkbox-sm rounded mt-0.5"
                                                />
                                                <label
                                                    htmlFor="v2PolicyAgreement"
                                                    className="text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer leading-relaxed select-none"
                                                >
                                                    {isRTL
                                                        ? 'أقر بصحة البيانات الجمركية والأوزان ومحتويات الشحنة، والتأكد من التصريح الكامل عن أي مواد خطرة وفق لوائح (IATA DGR)، وأوافق على شروط النقل لشركة تارجت للخدمات اللوجستية.'
                                                        : 'I confirm that the origin/consignee details, package dimensions, HS codes, and IATA DGR declarations are accurate, and I authorize booking under Target Logistics Terms of Carriage.'}
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── VERTICAL INLINE LIVE QUOTE & ACTION FOOTER (All Viewports) ── */}
                            <LiveQuoteSidebarV2
                                step={step}
                                mode={mode}
                                isRTL={isRTL}
                                sender={sender}
                                receiver={receiver}
                                pkg={pkg}
                                customs={customs}
                                weightMetrics={weightMetrics}
                                selectedCarrier={selectedCarrier}
                                quoteBreakdown={activeQuoteBreakdown}
                                loadingQuotes={loadingQuotes}
                                canViewCostData={canViewCostData}
                                submitting={submitting}
                                agreedToPolicy={agreedToPolicy}
                                onNextStep={handleNextStep}
                                onPrevStep={handlePrevStep}
                                onSaveDraft={() => handleSubmitConsignment(true)}
                                onSubmitBooking={() => handleSubmitConsignment(false)}
                            />
                        </main>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ShipmentWizardV2Cockpit;
