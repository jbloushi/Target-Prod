import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSnackbar } from 'notistack';
import api, { shipmentService, userService, organizationService } from '../../services/api';
import GoogleAddressInput from '../GoogleAddressInput';
import { GoogleMapPinDrop } from '../GoogleMapPinDrop';
import { countries } from '../../utils/countries';
import { getContainerTypes, getContainerTypeById } from '../../utils/containerTypesConfig';
import { DG_PRESET_OPTIONS, DEFAULT_PACKAGE_TEMPLATES } from './KineticShipmentWizard';
import { NON_POSTAL_COUNTRIES } from './shipmentValidation';

/**
 * TargetLogisticsWizard
 * 
 * Brand-aligned shipment creation & editing wizard implementing:
 * - Brand Guidelines (Manrope, Interface Blue #0050D4, Slate #6B7194, Surface #F5F6FB)
 * - Wizard Specifications (Left 296px vertical stepper with 30px circular connected nodes)
 * - Editing Wizard Specifications (Amber edit banner, pre-filled states, diff change tracking)
 * - Dynamic Container Types from .env / containerTypesConfig
 * - Visual Google Places + Schematic Coordinates Map Card
 * - Full RTL / Cairo Arabic language support
 * - Dynamic Surcharges & Financial Cost Recalculation
 */

export const TargetLogisticsWizard = ({
  mode = 'create', // 'create' | 'edit'
  shipment = null,  // original shipment if mode === 'edit'
  onClose,
  onComplete,
  isModal = false
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isRTL, lang } = useLanguage();
  const wizardContainerRef = useRef(null);
  const formScrollRef = useRef(null);

  const containerTypes = useMemo(() => getContainerTypes(), []);

  // ── Step State (1: Sender, 2: Receiver, 3: Package, 4: Carrier, 5: Customs, 6: Review) ──
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Reset scroll to top of form container whenever step changes (Next/Previous)
  useEffect(() => {
    formScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // ── Staff Organization & Client Selection ("Acting On Behalf Of") ──
  const isStaffOrAdmin = useMemo(() => {
    const role = String(user?.role || '').toUpperCase();
    return ['ADMIN', 'SUPER_ADMIN', 'DISPATCHER', 'STAFF', 'OPERATOR'].includes(role);
  }, [user]);

  const [organizations, setOrganizations] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(shipment?.organizationId || '');
  const [selectedClientId, setSelectedClientId] = useState(shipment?.createdOnBehalfOfUserId || shipment?.userId || '');

  // ── Collapsible Section State (Steps 1 & 2 start collapsed, Step 4 Addons drawer) ──
  const [senderAddressExpanded, setSenderAddressExpanded] = useState(false);
  const [receiverAddressExpanded, setReceiverAddressExpanded] = useState(false);
  const [addonsDrawerOpen, setAddonsDrawerOpen] = useState(false);

  // ── Step 6 Policy Agreement Checkbox ──
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);

  // ── Package Templates State ──
  const [templates, setTemplates] = useState(() => {
    try {
      const stored = localStorage.getItem('tl_package_templates');
      return stored ? JSON.parse(stored) : DEFAULT_PACKAGE_TEMPLATES;
    } catch (e) {
      return DEFAULT_PACKAGE_TEMPLATES;
    }
  });
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  // ── Address Book & Client Data ──
  const [userAddresses, setUserAddresses] = useState([]);
  const [saveSenderToBook, setSaveSenderToBook] = useState(false);
  const [saveReceiverToBook, setSaveReceiverToBook] = useState(false);
  const [quoteRates, setQuoteRates] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  // ── Initial State Extraction for Edit vs Create ──
  const initialSender = useMemo(() => {
    if (mode === 'edit' && shipment) {
      const orig = shipment.origin || {};
      const cCode = orig.countryCode || 'KW';
      return {
        name: orig.contactPerson || orig.name || '',
        company: orig.company || '',
        phone: orig.phone || '',
        email: orig.email || '',
        taxId: orig.taxId || orig.vatNumber || '',
        addr1: orig.streetLines?.[0] || orig.line1 || orig.address || '',
        addr2: orig.streetLines?.[1] || orig.line2 || '',
        area: orig.area || '',
        city: orig.city || 'Kuwait City',
        state: orig.state || '',
        zip: orig.postalCode || orig.zip || (NON_POSTAL_COUNTRIES.includes(cCode) ? '00000' : '13001'),
        country: orig.country || 'Kuwait',
        countryCode: cCode,
        phoneCountryCode: orig.phoneCountryCode || (cCode === 'KW' ? '+965' : '+971'),
        formattedAddress: orig.formattedAddress || '',
        latitude: orig.latitude || 29.3759,
        longitude: orig.longitude || 47.9774
      };
    }
    return {
      name: user?.name || '',
      company: user?.organization?.name || '',
      phone: user?.phone || '',
      email: user?.email || '',
      taxId: user?.carrierConfig?.taxId || user?.carrierConfig?.vatNo || '',
      addr1: '', addr2: '', area: '', city: 'Kuwait City', state: '', zip: '00000',
      country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965',
      formattedAddress: '', latitude: 29.3759, longitude: 47.9774
    };
  }, [mode, shipment, user]);

  const initialReceiver = useMemo(() => {
    if (mode === 'edit' && shipment) {
      const dest = shipment.destination || {};
      const cCode = dest.countryCode || 'AE';
      return {
        name: dest.contactPerson || dest.name || '',
        company: dest.company || '',
        phone: dest.phone || '',
        email: dest.email || '',
        taxId: dest.taxId || dest.vatNumber || dest.civilId || '',
        addr1: dest.streetLines?.[0] || dest.line1 || dest.address || '',
        addr2: dest.streetLines?.[1] || dest.line2 || '',
        area: dest.area || '',
        city: dest.city || 'Dubai',
        state: dest.state || '',
        zip: dest.postalCode || dest.zip || (NON_POSTAL_COUNTRIES.includes(cCode) ? '00000' : '00000'),
        country: dest.country || 'United Arab Emirates',
        countryCode: cCode,
        phoneCountryCode: dest.phoneCountryCode || (cCode === 'AE' ? '+971' : '+965'),
        instructions: dest.instructions || shipment.specialInstructions || '',
        formattedAddress: dest.formattedAddress || '',
        latitude: dest.latitude || 25.1850,
        longitude: dest.longitude || 55.2650
      };
    }
    return {
      name: '', company: '', phone: '', email: '', taxId: '',
      addr1: '', addr2: '', area: '', city: 'Dubai', state: '', zip: '00000',
      country: 'United Arab Emirates', countryCode: 'AE', phoneCountryCode: '+971',
      instructions: '', formattedAddress: '', latitude: 25.1850, longitude: 55.2650
    };
  }, [mode, shipment]);

  const initialPkg = useMemo(() => {
    if (mode === 'edit' && shipment) {
      const rawParcels = shipment.parcels || shipment.packages || [];
      const primaryParcel = rawParcels[0] || {};
      const items = shipment.items || [];
      const primaryItem = items[0] || {};
      const defaultType = containerTypes[0]?.id || 'Box';
      const pType = primaryParcel.packageType || shipment.packagingType || defaultType;

      const packagesList = rawParcels.length > 0 ? rawParcels.map((p, idx) => ({
        id: idx + 1,
        pkgType: p.packageType || pType,
        description: p.description || items[idx]?.description || 'General Cargo',
        qty: String(items[idx]?.quantity || 1),
        weight: String(p.weight || '1.0'),
        length: String(p.length || '20'),
        width: String(p.width || '15'),
        height: String(p.height || '10'),
        value: String(p.declaredValue || items[idx]?.price || items[idx]?.value || '15.00'),
        currency: shipment.currency || 'KWD',
        hsCode: items[idx]?.hsCode || ''
      })) : [{
        id: 1, pkgType: pType, description: shipment.remarks || 'General Cargo', qty: '1',
        weight: String(primaryParcel.weight || '1.0'),
        length: String(primaryParcel.length || '20'),
        width: String(primaryParcel.width || '15'),
        height: String(primaryParcel.height || '10'),
        value: String(primaryParcel.declaredValue || primaryItem.value || '15.00'),
        currency: shipment.currency || 'KWD',
        hsCode: primaryItem.hsCode || ''
      }];

      const dg = shipment.dangerousGoods || shipment.origin?.dangerousGoods || {};
      return {
        pkgType: pType,
        description: packagesList[0]?.description || 'General Cargo',
        qty: packagesList[0]?.qty || '1',
        value: packagesList[0]?.value || '15.00',
        weight: packagesList[0]?.weight || '1.0',
        length: packagesList[0]?.length || '20',
        width: packagesList[0]?.width || '15',
        height: packagesList[0]?.height || '10',
        packagesList,
        insurance: Boolean(shipment.insurance || shipment.insuredValue || shipment.origin?.insuredValue),
        dangerousGoods: Boolean(dg.contains || dg.active || dg.class),
        unCode: dg.unCode || dg.code || '',
        dgClass: dg.class || '',
        properShippingName: dg.properShippingName || '',
        packingGroup: dg.packingGroup || 'II',
        dgServiceCode: dg.serviceCode || '',
        dgContentId: dg.contentId || '',
        dgMarks: dg.customDescription || dg.marks || ''
      };
    }
    const defaultType = containerTypes[0]?.id || 'Box';
    const defaultParams = containerTypes[0] || { length: 20, width: 15, height: 10, weight: 1.0 };
    return {
      pkgType: defaultType,
      description: 'General merchandise',
      qty: '1',
      value: '15.00',
      weight: String(defaultParams.weight || '1.0'),
      length: String(defaultParams.length || '20'),
      width: String(defaultParams.width || '15'),
      height: String(defaultParams.height || '10'),
      packagesList: [{
        id: 1, pkgType: defaultType, description: 'General merchandise', qty: '1',
        weight: String(defaultParams.weight || '1.0'),
        length: String(defaultParams.length || '20'),
        width: String(defaultParams.width || '15'),
        height: String(defaultParams.height || '10'),
        value: '15.00', currency: 'KWD', hsCode: ''
      }],
      insurance: false,
      dangerousGoods: false,
      unCode: '', dgClass: '', properShippingName: '', packingGroup: 'II',
      dgServiceCode: '', dgContentId: '', dgMarks: ''
    };
  }, [mode, shipment, containerTypes]);

  const initialService = useMemo(() => {
    const assignedCarrier = user?.agentPolicy?.shippingAccess?.carrierCode 
      || user?.carrierConfig?.preferredCarrier 
      || user?.organization?.allowedCarriers?.defaultCarrier 
      || 'DGR';
    const assignedService = user?.agentPolicy?.shippingAccess?.serviceCode 
      || user?.carrierConfig?.serviceCode 
      || user?.organization?.allowedCarriers?.defaultServiceCode 
      || 'P';

    if (mode === 'edit' && shipment) {
      const activeAddons = (shipment.valueAddedServices || shipment.origin?.optionalServiceCodes || []).map(code => ({
        serviceCode: code,
        name: code === 'DDP' ? 'Delivered Duty Paid (DDP)' : (code === 'SIG' ? 'Direct Signature Required' : code),
        rate: code === 'DDP' ? 5.0 : (code === 'SIG' ? 1.5 : 3.0)
      }));
      const carrier = shipment.carrierCode || assignedCarrier;
      const sCode = shipment.serviceCode || assignedService;
      return {
        carrierCode: carrier,
        carrierId: carrier,
        serviceCode: sCode,
        serviceName: sCode === 'Y' ? 'DHL Express 12:00' : (carrier === 'INTERNAL' ? 'Target Dedicated Fleet' : 'DHL Express Global'),
        quotedPrice: shipment.price || 18.5,
        currency: shipment.currency || 'KWD',
        selectedAddons: activeAddons,
        pickupType: shipment.pickupRequired ? 'Schedule Driver Pickup' : 'Drop-off at Station',
        pickupDate: shipment.pickupDate ? new Date(shipment.pickupDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        pickupTime: shipment.pickupTime || '9:00 AM – 12:00 PM',
        instructions: shipment.specialInstructions || ''
      };
    }
    return {
      carrierCode: assignedCarrier,
      carrierId: assignedCarrier,
      serviceCode: assignedService,
      serviceName: assignedService === 'Y' ? 'DHL Express 12:00' : (assignedCarrier === 'INTERNAL' ? 'Target Dedicated Fleet' : 'DHL Express Global'),
      quotedPrice: 18.5,
      currency: 'KWD',
      selectedAddons: [],
      pickupType: 'Schedule Driver Pickup',
      pickupDate: new Date().toISOString().slice(0, 10),
      pickupTime: '9:00 AM – 12:00 PM',
      instructions: ''
    };
  }, [mode, shipment, user]);

  const initialCustoms = useMemo(() => {
    if (mode === 'edit' && shipment) {
      const cinv = shipment.customsInvoice || {};
      const primaryItem = (shipment.items || [])[0] || {};
      return {
        shipmentType: shipment.shipmentType || 'Commercial',
        incoterms: shipment.incoterm || 'DAP – Delivered at Place',
        hsCode: primaryItem.hsCode || '8517.12.00',
        origin: primaryItem.countryOfOrigin || 'Kuwait',
        invoiceNum: cinv.invoiceNumber || cinv.number || '',
        invoiceVal: String(cinv.declaredValue || shipment.price || ''),
        currency: shipment.currency || cinv.currency || 'KWD',
        notes: cinv.notes || '',
        paperlessTrade: true
      };
    }
    return {
      shipmentType: 'Commercial',
      incoterms: 'DAP – Delivered at Place',
      hsCode: '8517.12.00',
      origin: 'Kuwait',
      invoiceNum: '',
      invoiceVal: '',
      currency: 'KWD',
      notes: '',
      paperlessTrade: true
    };
  }, [mode, shipment]);

  // ── Form State ──
  const [sender, setSender] = useState(initialSender);
  const [receiver, setReceiver] = useState(initialReceiver);
  const [pkg, setPkg] = useState(initialPkg);
  const [service, setService] = useState(initialService);
  const [customs, setCustoms] = useState(initialCustoms);

  // ── Address Book & Organization Fetching ──
  useEffect(() => {
    let isMounted = true;
    const fetchAddressBook = async () => {
      try {
        if (user?.addresses && Array.isArray(user.addresses) && user.addresses.length > 0) {
          if (isMounted) setUserAddresses(user.addresses);
        } else {
          const res = await userService.getMe();
          const addrs = res?.data?.addresses || res?.addresses || [];
          if (Array.isArray(addrs) && isMounted) {
            setUserAddresses(addrs);
          }
        }
      } catch (err) {
        console.debug('Failed to fetch address book:', err.message);
      }
    };
    fetchAddressBook();

    if (isStaffOrAdmin) {
      organizationService.getOrganizations()
        .then(res => {
          if (isMounted) {
            const orgs = res?.data || res || [];
            setOrganizations(Array.isArray(orgs) ? orgs : []);
          }
        })
        .catch(err => console.debug('Failed to fetch orgs:', err.message));

      userService.getAssignableClients()
        .then(res => {
          if (isMounted) {
            const clts = res?.data || res || [];
            setClients(Array.isArray(clts) ? clts : []);
          }
        })
        .catch(() => {
          userService.getUsers({ role: 'CLIENT', limit: 100 })
            .then(res => {
              if (isMounted) {
                const clts = res?.data || res?.users || res || [];
                setClients(Array.isArray(clts) ? clts : []);
              }
            })
            .catch(e => console.debug('Failed to fetch clients:', e.message));
        });
    }

    return () => { isMounted = false; };
  }, [user, isStaffOrAdmin]);

  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const cl = clients.find(c => String(c.id || c._id) === String(clientId));
    if (cl) {
      const defAddr = Array.isArray(cl.addresses) ? (cl.addresses.find(a => a.isDefault) || cl.addresses[0]) : null;
      const countryObj = defAddr ? (countries.find(c => c.code === defAddr.countryCode) || countries.find(c => c.name === defAddr.country)) : null;
      setSender(prev => ({
        ...prev,
        company: cl.organization?.name || cl.company || cl.name || prev.company,
        phone: cl.phone || prev.phone,
        email: cl.email || prev.email,
        taxId: cl.carrierConfig?.taxId || cl.carrierConfig?.vatNo || prev.taxId,
        addr1: defAddr?.addressLine1 || defAddr?.streetLines?.[0] || prev.addr1,
        city: defAddr?.city || prev.city,
        state: defAddr?.state || prev.state,
        country: countryObj?.name || defAddr?.country || prev.country,
        countryCode: countryObj?.code || defAddr?.countryCode || prev.countryCode
      }));
      if (cl.organizationId) {
        setSelectedOrgId(cl.organizationId);
      }
      const clientCarrier = cl.agentPolicy?.shippingAccess?.carrierCode || cl.carrierConfig?.preferredCarrier || cl.organization?.allowedCarriers?.defaultCarrier;
      const clientService = cl.agentPolicy?.shippingAccess?.serviceCode || cl.carrierConfig?.serviceCode || cl.organization?.allowedCarriers?.defaultServiceCode;
      if (clientCarrier || clientService) {
        setService(prev => ({
          ...prev,
          carrierCode: clientCarrier || prev.carrierCode,
          carrierId: clientCarrier || prev.carrierId,
          serviceCode: clientService || prev.serviceCode,
          serviceName: clientService === 'Y' ? 'DHL Express 12:00' : (clientCarrier === 'INTERNAL' ? 'Target Dedicated Fleet' : 'DHL Express Global')
        }));
      }
    }
  };

  const handleSelectOrganization = (orgId) => {
    setSelectedOrgId(orgId);
    if (!orgId) return;
    const org = organizations.find(o => String(o.id || o._id) === String(orgId));
    if (org) {
      const countryObj = countries.find(c => c.code === org.countryCode) || countries.find(c => c.name?.toLowerCase() === org.country?.toLowerCase());
      setSender(prev => ({
        ...prev,
        name: org.contactPerson || org.name || prev.name,
        company: org.name || prev.company,
        phone: org.phone || prev.phone,
        email: org.email || prev.email,
        addr1: org.address || org.addressLine1 || prev.addr1,
        city: org.city || prev.city,
        state: org.state || prev.state,
        country: countryObj?.name || org.country || prev.country,
        countryCode: countryObj?.code || org.countryCode || prev.countryCode,
        phoneCountryCode: countryObj?.dialCode || prev.phoneCountryCode,
        taxId: org.taxNumber || org.vatNumber || org.taxId || prev.taxId
      }));
      const orgCarrier = org.allowedCarriers?.defaultCarrier;
      const orgService = org.allowedCarriers?.defaultServiceCode;
      if (orgCarrier || orgService) {
        setService(prev => ({
          ...prev,
          carrierCode: orgCarrier || prev.carrierCode,
          carrierId: orgCarrier || prev.carrierId,
          serviceCode: orgService || prev.serviceCode,
          serviceName: orgService === 'Y' ? 'DHL Express 12:00' : (orgCarrier === 'INTERNAL' ? 'Target Dedicated Fleet' : 'DHL Express Global')
        }));
      }
    }
  };

  // ── Quick Location Presets ──
  const senderPresets = useMemo(() => [
    { label: '🏢 Shuwaikh Logistics Hub', city: 'Shuwaikh Industrial', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '70001', addr1: 'Block 1, Street 14, Target Logistics Hub', area: 'Shuwaikh Industrial', state: 'Al Asimah' },
    { label: '✈️ Airport Cargo Terminal', city: 'Farwaniya', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '80000', addr1: 'Cargo City, Kuwait International Airport', area: 'Farwaniya', state: 'Farwaniya' },
    { label: '🏙️ Kuwait City Financial Centre', city: 'Kuwait City', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '13001', addr1: 'Sharq, Block 3, Al-Hamra Tower Wing', area: 'Sharq', state: 'Al Asimah' }
  ], []);

  const receiverPresets = useMemo(() => [
    { label: '🇦🇪 Dubai Business Bay', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', phoneCountryCode: '+971', zip: '00000', addr1: 'Bay Square, Building 4', area: 'Business Bay', state: 'Dubai' },
    { label: '🇸🇦 Riyadh Olaya Hub', city: 'Riyadh', country: 'Saudi Arabia', countryCode: 'SA', phoneCountryCode: '+966', zip: '12211', addr1: 'King Fahd Road, Al Olaya District', area: 'Al Olaya', state: 'Riyadh Region' },
    { label: '🇦🇪 Abu Dhabi Hub', city: 'Abu Dhabi', country: 'United Arab Emirates', countryCode: 'AE', phoneCountryCode: '+971', zip: '00000', addr1: 'Al Reem Island, Marina Bay 1', area: 'Al Reem Island', state: 'Abu Dhabi' }
  ], []);

  const handleSelectSenderAddress = (addrId) => {
    if (!addrId) return;
    const a = userAddresses.find(item => (item.id || item._id || String(item)) === addrId);
    if (!a) return;
    const countryObj = countries.find(c => c.code === a.countryCode) || countries.find(c => c.name?.toLowerCase() === a.country?.toLowerCase());
    setSender(prev => ({
      ...prev,
      name: a.contactPerson || a.name || prev.name,
      company: a.company || prev.company,
      phone: a.phone || prev.phone,
      phoneCountryCode: countryObj?.dialCode || a.phoneCountryCode || prev.phoneCountryCode,
      email: a.email || prev.email,
      taxId: a.taxId || prev.taxId,
      addr1: a.addressLine1 || a.streetLines?.[0] || a.line1 || a.address || a.addr1 || prev.addr1,
      addr2: a.addressLine2 || a.streetLines?.[1] || a.line2 || a.addr2 || '',
      area: a.area || prev.area,
      city: a.city || prev.city,
      state: a.state || prev.state,
      zip: a.postalCode || a.zip || (NON_POSTAL_COUNTRIES.includes(a.countryCode) ? '00000' : prev.zip),
      country: countryObj?.name || a.country || prev.country,
      countryCode: countryObj?.code || a.countryCode || prev.countryCode,
      formattedAddress: a.formattedAddress || `${a.addressLine1 || a.addr1 || ''}, ${a.city || ''}`,
      latitude: a.latitude || prev.latitude,
      longitude: a.longitude || prev.longitude
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.sender_name;
      delete next.sender_phone;
      delete next.sender_addr1;
      delete next.sender_city;
      delete next.sender_country;
      delete next.sender_zip;
      return next;
    });
  };

  const handleSelectReceiverAddress = (addrId) => {
    if (!addrId) return;
    const a = userAddresses.find(item => (item.id || item._id || String(item)) === addrId);
    if (!a) return;
    const countryObj = countries.find(c => c.code === a.countryCode) || countries.find(c => c.name?.toLowerCase() === a.country?.toLowerCase());
    setReceiver(prev => ({
      ...prev,
      name: a.contactPerson || a.name || prev.name,
      company: a.company || prev.company,
      phone: a.phone || prev.phone,
      phoneCountryCode: countryObj?.dialCode || a.phoneCountryCode || prev.phoneCountryCode,
      email: a.email || prev.email,
      taxId: a.taxId || prev.taxId,
      addr1: a.addressLine1 || a.streetLines?.[0] || a.line1 || a.address || a.addr1 || prev.addr1,
      addr2: a.addressLine2 || a.streetLines?.[1] || a.line2 || a.addr2 || '',
      area: a.area || prev.area,
      city: a.city || prev.city,
      state: a.state || prev.state,
      zip: a.postalCode || a.zip || (NON_POSTAL_COUNTRIES.includes(a.countryCode) ? '00000' : prev.zip),
      country: countryObj?.name || a.country || prev.country,
      countryCode: countryObj?.code || a.countryCode || prev.countryCode,
      instructions: a.instructions || prev.instructions,
      formattedAddress: a.formattedAddress || `${a.addressLine1 || a.addr1 || ''}, ${a.city || ''}`,
      latitude: a.latitude || prev.latitude,
      longitude: a.longitude || prev.longitude
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.receiver_name;
      delete next.receiver_phone;
      delete next.receiver_addr1;
      delete next.receiver_city;
      delete next.receiver_country;
      delete next.receiver_zip;
      return next;
    });
  };

  const handleSaveAddressToBook = async (addrData, type = 'Location') => {
    if (!addrData.name || !addrData.addr1) return;
    try {
      const newAddr = {
        id: 'addr-' + Date.now(),
        label: `${addrData.company || addrData.name} (${addrData.city || 'GCC'})`,
        contactPerson: addrData.name,
        company: addrData.company || '',
        phone: addrData.phone || '',
        phoneCountryCode: addrData.phoneCountryCode || '+965',
        email: addrData.email || '',
        taxId: addrData.taxId || '',
        addressLine1: addrData.addr1,
        addressLine2: addrData.addr2 || '',
        city: addrData.city,
        state: addrData.state || '',
        postalCode: addrData.zip || '00000',
        country: addrData.country || 'Kuwait',
        countryCode: addrData.countryCode || 'KW',
        area: addrData.area || '',
        latitude: addrData.latitude,
        longitude: addrData.longitude,
        formattedAddress: addrData.formattedAddress || `${addrData.addr1}, ${addrData.city}`
      };
      const updatedUserAddrs = [...userAddresses, newAddr];
      setUserAddresses(updatedUserAddrs);
      await userService.updateMe({ addresses: updatedUserAddrs });
    } catch (e) {
      console.debug('Failed to save address to address book:', e.message);
    }
  };

  const validateStep = (currentStep) => {
    const errs = {};
    if (currentStep === 1) {
      if (!sender.name?.trim()) errs.sender_name = isRTL ? 'اسم الشاحن مطلوب' : 'Shipper full name is required';
      if (!sender.phone?.trim()) errs.sender_phone = isRTL ? 'رقم الهاتف مطلوب' : 'Shipper phone is required';
      if (!sender.addr1?.trim()) errs.sender_addr1 = isRTL ? 'عنوان الشارع مطلوب' : 'Street address is required';
      if (!sender.city?.trim()) errs.sender_city = isRTL ? 'المدينة مطلوبة' : 'City is required';
      if (!sender.countryCode?.trim()) errs.sender_country = isRTL ? 'الدولة مطلوبة' : 'Country is required';
      if (!NON_POSTAL_COUNTRIES.includes((sender.countryCode || '').toUpperCase()) && !sender.zip?.trim()) {
        errs.sender_zip = isRTL ? 'الرمز البريدي مطلوب' : 'Postal code is required';
      }
    } else if (currentStep === 2) {
      if (!receiver.name?.trim()) errs.receiver_name = isRTL ? 'اسم المستلم مطلوب' : 'Consignee full name is required';
      if (!receiver.phone?.trim()) errs.receiver_phone = isRTL ? 'هاتف المستلم مطلوب' : 'Consignee phone is required';
      if (!receiver.addr1?.trim()) errs.receiver_addr1 = isRTL ? 'عنوان التسليم مطلوب' : 'Delivery street address is required';
      if (!receiver.city?.trim()) errs.receiver_city = isRTL ? 'المدينة مطلوبة' : 'City is required';
      if (!receiver.countryCode?.trim()) errs.receiver_country = isRTL ? 'الدولة مطلوبة' : 'Country is required';
      if (!NON_POSTAL_COUNTRIES.includes((receiver.countryCode || '').toUpperCase()) && !receiver.zip?.trim()) {
        errs.receiver_zip = isRTL ? 'الرمز البريدي مطلوب' : 'Postal code is required';
      }
    } else if (currentStep === 3) {
      const packagesList = (pkg.packagesList && pkg.packagesList.length > 0) ? pkg.packagesList : [pkg];
      packagesList.forEach((p, idx) => {
        const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;
        if (!p.description || !String(p.description).trim()) {
          errs[`${pfx}_description`] = isRTL ? 'وصف محتوى الطرد مطلوب' : 'Package contents description is required';
        }
        const weight = Number(p.weight);
        if (isNaN(weight) || weight <= 0) {
          errs[`${pfx}_weight`] = isRTL ? 'الوزن يجب أن يكون أكبر من صفر' : 'Gross weight (> 0) is required';
        }
        const length = Number(p.length);
        if (isNaN(length) || length <= 0) {
          errs[`${pfx}_length`] = isRTL ? 'الطول يجب أن يكون أكبر من صفر' : 'Length (> 0) is required';
        }
        const width = Number(p.width);
        if (isNaN(width) || width <= 0) {
          errs[`${pfx}_width`] = isRTL ? 'العرض يجب أن يكون أكبر من صفر' : 'Width (> 0) is required';
        }
        const height = Number(p.height);
        if (isNaN(height) || height <= 0) {
          errs[`${pfx}_height`] = isRTL ? 'الارتفاع يجب أن يكون أكبر من صفر' : 'Height (> 0) is required';
        }
      });
      if (pkg.dangerousGoods) {
        if (!pkg.unCode?.trim()) errs.pkg_unCode = isRTL ? 'رمز الأمم المتحدة (UN Code) مطلوب' : 'UN Identification Code is required';
        if (!pkg.dgClass?.trim()) errs.pkg_dgClass = isRTL ? 'فئة الخطورة (Hazard Class) مطلوبة' : 'Hazard Class is required';
        if (!pkg.properShippingName?.trim()) errs.pkg_properShippingName = isRTL ? 'اسم الشحن المعتمد مطلوب' : 'Proper Shipping Name is required';
      }
    } else if (currentStep === 4) {
      if (!service.carrierCode) {
        errs.service_carrierCode = isRTL ? 'يرجى اختيار شركة الشحن' : 'Carrier selection is required';
      }
    } else if (currentStep === 5) {
      if (customs.shipmentType?.toLowerCase().includes('commercial') && !customs.invoiceNum?.trim()) {
        errs.customs_invoiceNum = isRTL ? 'رقم الفاتورة التجارية مطلوب للشحنات التجارية' : 'Commercial invoice number is required';
      }
      if (!customs.hsCode?.trim()) {
        errs.customs_hsCode = isRTL ? 'رمز البند الجمركي (HS Code) مطلوب' : 'HS Tariff Code is required';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep(step)) {
      enqueueSnackbar(
        isRTL ? 'يرجى إكمال الحقول الإلزامية المطلوبة والمميزة باللون الأحمر للمتابعة' : 'Please complete the highlighted required fields to proceed',
        { variant: 'warning' }
      );

      // Auto-expand address sections if error is inside structured address details
      if (step === 1) setSenderAddressExpanded(true);
      if (step === 2) setReceiverAddressExpanded(true);

      // Smooth scroll directly to the first element with an error and highlight/focus it
      setTimeout(() => {
        const errorEl = formScrollRef.current?.querySelector('[data-error="true"], .border-red-400, .border-red-500, input.border-red-400, [data-field-error]')
          || document.querySelector('[data-error="true"], .border-red-400, .border-red-500');
        if (errorEl) {
          errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const inputEl = (['INPUT', 'SELECT', 'TEXTAREA'].includes(errorEl.tagName))
            ? errorEl
            : errorEl.querySelector('input, select, textarea');
          if (inputEl && typeof inputEl.focus === 'function') {
            inputEl.focus();
          }
        }
      }, 100);
      return;
    }
    setErrors({});
    setStep(s => Math.min(6, s + 1));
  };

  // ── Package Templates Handlers ──
  const handleApplyTemplate = (tmpl) => {
    if (!tmpl) return;
    const defaultType = tmpl.pkgType || 'Box';
    const newParcel = {
      id: 1,
      pkgType: defaultType,
      description: tmpl.description || 'General Cargo',
      qty: '1',
      weight: String(tmpl.weight || '1.0'),
      length: String(tmpl.length || '20'),
      width: String(tmpl.width || '15'),
      height: String(tmpl.height || '10'),
      value: String(tmpl.value || '15.00'),
      currency: 'KWD',
      hsCode: ''
    };
    setPkg(prev => ({
      ...prev,
      pkgType: defaultType,
      weight: String(tmpl.weight || '1.0'),
      length: String(tmpl.length || '20'),
      width: String(tmpl.width || '15'),
      height: String(tmpl.height || '10'),
      description: tmpl.description || 'General Cargo',
      value: String(tmpl.value || '15.00'),
      dangerousGoods: Boolean(tmpl.dangerousGoods),
      unCode: tmpl.unCode || '',
      dgClass: tmpl.dgClass || '',
      properShippingName: tmpl.properShippingName || '',
      packagesList: [newParcel]
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.pkg_description;
      delete next.pkg_weight;
      delete next.pkg_length;
      delete next.pkg_width;
      delete next.pkg_height;
      return next;
    });
    enqueueSnackbar(
      isRTL ? `تم تطبيق قالب: ${tmpl.name}` : `Template applied: ${tmpl.name}`,
      { variant: 'info' }
    );
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    const firstParcel = pkg.packagesList?.[0] || pkg;
    const newTmpl = {
      id: 'custom_' + Date.now(),
      name: templateName.trim(),
      pkgType: firstParcel.pkgType || pkg.pkgType || 'Box',
      weight: firstParcel.weight || pkg.weight || '1.0',
      length: firstParcel.length || pkg.length || '20',
      width: firstParcel.width || pkg.width || '15',
      height: firstParcel.height || pkg.height || '10',
      description: firstParcel.description || pkg.description || 'General Cargo',
      value: firstParcel.value || pkg.value || '15.00',
      dangerousGoods: Boolean(pkg.dangerousGoods),
      unCode: pkg.unCode || '',
      dgClass: pkg.dgClass || '',
      properShippingName: pkg.properShippingName || ''
    };
    const updated = [...templates, newTmpl];
    setTemplates(updated);
    try {
      localStorage.setItem('tl_package_templates', JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save templates to localStorage:', e);
    }
    setTemplateName('');
    setShowSaveModal(false);
    enqueueSnackbar(
      isRTL ? 'تم حفظ القالب بنجاح' : 'Template saved successfully',
      { variant: 'success' }
    );
  };

  // ── Recalculate package fields when container type is selected ──
  const handleSelectContainerType = (typeId) => {
    const config = getContainerTypeById(typeId);
    setPkg(prev => {
      const updatedList = (prev.packagesList || []).map((p, i) => i === 0 ? {
        ...p,
        pkgType: typeId,
        length: String(config.length || p.length),
        width: String(config.width || p.width),
        height: String(config.height || p.height),
        weight: String(config.weight || p.weight)
      } : p);
      return {
        ...prev,
        pkgType: typeId,
        length: String(config.length || prev.length),
        width: String(config.width || prev.width),
        height: String(config.height || prev.height),
        weight: String(config.weight || prev.weight),
        packagesList: updatedList
      };
    });
  };

  // ── Multi-parcel package helpers ──
  const handleUpdateParcel = (idx, field, val) => {
    setPkg(prev => {
      const updatedList = [...(prev.packagesList || [])];
      if (updatedList[idx]) {
        updatedList[idx] = { ...updatedList[idx], [field]: val };
      }
      return {
        ...prev,
        packagesList: updatedList,
        ...(idx === 0 ? { [field]: val } : {})
      };
    });
    const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;
    const errKey = `${pfx}_${field}`;
    if (errors[errKey]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[errKey];
        return next;
      });
    }
  };

  const handleAddParcel = () => {
    const defaultParams = containerTypes[0] || { length: 20, width: 15, height: 10, weight: 1.0 };
    setPkg(prev => ({
      ...prev,
      packagesList: [
        ...(prev.packagesList || []),
        {
          id: (prev.packagesList?.length || 0) + 1,
          pkgType: prev.pkgType || 'Box',
          description: prev.description || 'General Cargo',
          qty: '1',
          weight: String(defaultParams.weight || '1.0'),
          length: String(defaultParams.length || '20'),
          width: String(defaultParams.width || '15'),
          height: String(defaultParams.height || '10'),
          value: '15.00',
          currency: 'KWD',
          hsCode: customs.hsCode || ''
        }
      ]
    }));
  };

  const handleRemoveParcel = (idx) => {
    if ((pkg.packagesList?.length || 0) <= 1) return;
    setPkg(prev => {
      const updated = prev.packagesList.filter((_, i) => i !== idx);
      return {
        ...prev,
        packagesList: updated,
        ...(idx === 0 && updated[0] ? {
          weight: updated[0].weight,
          length: updated[0].length,
          width: updated[0].width,
          height: updated[0].height,
          value: updated[0].value,
          description: updated[0].description
        } : {})
      };
    });
  };

  // ── Dynamic Totals & Cost Calculations ──
  const totalWeight = useMemo(() => {
    return (pkg.packagesList || []).reduce((sum, p) => sum + (parseFloat(p.weight) || 0), 0);
  }, [pkg.packagesList]);

  const totalDeclaredValue = useMemo(() => {
    return (pkg.packagesList || []).reduce((sum, p) => sum + ((parseFloat(p.value) || 0) * (parseInt(p.qty, 10) || 1)), 0);
  }, [pkg.packagesList]);

  // ── Auto-sync Customs Declared Valuation & Currency & Country of Origin from Package & Sender ──
  useEffect(() => {
    setCustoms(prev => ({
      ...prev,
      invoiceVal: totalDeclaredValue > 0 ? String(Number(totalDeclaredValue).toFixed(3)) : prev.invoiceVal,
      currency: prev.currency || service.currency || 'KWD',
      origin: prev.origin || sender.country || 'Kuwait'
    }));
  }, [totalDeclaredValue, service.currency, sender.country]);

  const insurancePremium = 0; // Removed per spec: insurance is not wired to carrier API or calculated

  const addonsTotal = useMemo(() => {
    return (service.selectedAddons || []).reduce((sum, a) => sum + (parseFloat(a.rate) || 0), 0);
  }, [service.selectedAddons]);

  const baseRate = useMemo(() => {
    if (service.carrierCode === 'INTERNAL') return 4.5;
    if (service.carrierCode === 'FEDEX') return 21.75;
    return 18.5; // DHL default
  }, [service.carrierCode]);

  const finalCost = useMemo(() => {
    const fuelSurcharge = Number((baseRate * 0.095).toFixed(3));
    return Number((baseRate + addonsTotal + fuelSurcharge).toFixed(3));
  }, [baseRate, addonsTotal]);

  // ── Change-diff Tracking for Edit Mode ──
  const changedFieldsList = useMemo(() => {
    if (mode !== 'edit' || !shipment) return [];
    const changed = [];
    if (sender.name !== initialSender.name) changed.push('Sender Name');
    if (sender.phone !== initialSender.phone) changed.push('Sender Phone');
    if (sender.addr1 !== initialSender.addr1 || sender.city !== initialSender.city) changed.push('Sender Address');
    if (receiver.name !== initialReceiver.name) changed.push('Receiver Name');
    if (receiver.phone !== initialReceiver.phone) changed.push('Receiver Phone');
    if (receiver.addr1 !== initialReceiver.addr1 || receiver.city !== initialReceiver.city) changed.push('Receiver Address');
    if (receiver.taxId !== initialReceiver.taxId) changed.push('Receiver Tax ID / Civil ID');
    if (pkg.pkgType !== initialPkg.pkgType) changed.push('Container Type');
    if (pkg.weight !== initialPkg.weight || totalWeight !== parseFloat(initialPkg.weight)) changed.push('Package Weight');
    if (pkg.value !== initialPkg.value || totalDeclaredValue !== parseFloat(initialPkg.value)) changed.push('Declared Value');
    if (pkg.description !== initialPkg.description) changed.push('Contents Description');
    if (pkg.insurance !== initialPkg.insurance) changed.push('Cargo Insurance');
    if (pkg.dangerousGoods !== initialPkg.dangerousGoods) changed.push('Dangerous Goods (DGR)');
    if (service.carrierCode !== initialService.carrierCode) changed.push('Carrier');
    if (service.selectedAddons.length !== initialService.selectedAddons.length) changed.push('Service Add-ons');
    if (customs.incoterms !== initialCustoms.incoterms) changed.push('Incoterms');
    if (customs.hsCode !== initialCustoms.hsCode) changed.push('HS Code');
    return changed;
  }, [mode, shipment, sender, receiver, pkg, service, customs, initialSender, initialReceiver, initialPkg, initialService, initialCustoms, totalWeight, totalDeclaredValue]);

  // ── Carrier Booking Safeguard Check ──
  const isCarrierLocked = useMemo(() => {
    if (mode !== 'edit' || !shipment) return false;
    const awb = shipment.carrierAwb || shipment.trackingNumber;
    const status = String(shipment.status || '').toUpperCase();
    return Boolean(shipment.carrierCode && ['BOOKED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status));
  }, [mode, shipment]);

  // ── Step Navigation ──
  const stepTitles = [
    { title: isRTL ? 'بيانات الشاحن' : 'Origin (Shipper)', sub: isRTL ? 'بيانات المرسل وعنوان الاستلام' : 'Shipper contact & address', icon: 'flight_takeoff' },
    { title: isRTL ? 'بيانات المستلم' : 'Consignee (Receiver)', sub: isRTL ? 'بيانات المرسل إليه وعنوان التسليم' : 'Receiver contact, address & ID', icon: 'flight_land' },
    { title: isRTL ? 'تفاصيل الطرد والشحنة' : 'Package & Cargo', sub: isRTL ? 'الأبعاد، الوزن، القيمة، والتأمين' : 'Dimensions, weight, value & DGR', icon: 'inventory_2' },
    { title: isRTL ? 'الناقل والخدمات' : 'Carrier & Services', sub: isRTL ? 'خيارات الشحن والخدمات المضافة' : 'Carrier rates & service add-ons', icon: 'local_shipping' },
    { title: isRTL ? 'الجمارك واللوجستيات' : 'Customs & Logistics', sub: isRTL ? 'الإقرار الجمركي ورسوم الاستيراد' : 'HS codes, Incoterms & PLT', icon: 'event_note' },
    { title: isRTL ? 'المراجعة والحفظ' : (mode === 'edit' ? 'Review & Save' : 'Review & Dispatch'), sub: isRTL ? 'تأكيد البيانات وتدقيق التكلفة' : 'Verify route, diff & breakdown', icon: 'fact_check' }
  ];

  // ── Save / Submit Handler ──
  const handleSubmit = async (isDraft = false) => {
    try {
      setSubmitting(true);
      const finalPackages = (pkg.packagesList || []).map(p => ({
        weight: Number(p.weight) || 1,
        length: Number(p.length) || 20,
        width: Number(p.width) || 15,
        height: Number(p.height) || 10,
        declaredValue: Number(p.value) || 0,
        packageType: p.pkgType || pkg.pkgType || 'Box',
        description: p.description || pkg.description || 'General Cargo'
      }));

      const originCountryCode = countries.find(c => c.name?.toLowerCase() === customs.origin?.toLowerCase() || c.code === customs.origin)?.code || sender.countryCode || 'KW';
      const finalItems = (pkg.packagesList || []).map(p => ({
        description: p.description || pkg.description || 'General Cargo',
        quantity: Number(p.qty) || 1,
        price: Number(p.value) || 0,
        value: Number(p.value) || 0,
        currency: customs.currency || p.currency || service.currency || 'KWD',
        hsCode: p.hsCode || customs.hsCode || '851712',
        countryOfOrigin: originCountryCode
      }));

      const isDgActive = Boolean(pkg.dangerousGoods && pkg.unCode && pkg.unCode.trim() !== '');
      const cleanUnCode = (pkg.unCode || '').trim();
      const cleanDgNum = cleanUnCode.replace(/^UN|^ID/i, '').trim();

      const payload = {
        organizationId: selectedOrgId || undefined,
        createdOnBehalfOfUserId: selectedClientId || undefined,
        userId: selectedClientId || undefined,
        origin: {
          name: sender.name,
          contactPerson: sender.name,
          company: sender.company,
          phone: sender.phone,
          phoneCountryCode: sender.phoneCountryCode,
          email: sender.email,
          taxId: sender.taxId,
          country: sender.country,
          countryCode: sender.countryCode,
          city: sender.city,
          state: sender.state,
          area: sender.area || '',
          postalCode: sender.zip,
          streetLines: [sender.addr1, sender.addr2].filter(Boolean),
          formattedAddress: sender.formattedAddress || `${sender.addr1}, ${sender.city}`,
          latitude: sender.latitude,
          longitude: sender.longitude
        },
        destination: {
          name: receiver.name,
          contactPerson: receiver.name,
          company: receiver.company,
          phone: receiver.phone,
          phoneCountryCode: receiver.phoneCountryCode,
          email: receiver.email,
          taxId: receiver.taxId,
          civilId: receiver.taxId,
          country: receiver.country,
          countryCode: receiver.countryCode,
          city: receiver.city,
          state: receiver.state,
          area: receiver.area || '',
          postalCode: receiver.zip,
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
        shipmentType: pkg.pkgType === 'Envelope' ? 'documents' : 'package',
        carrierCode: service.carrierCode || 'DGR',
        serviceCode: service.serviceCode || 'P',
        currency: service.currency || 'KWD',
        price: finalCost,
        incoterm: customs.incoterms.split(' ')[0] || 'DAP',
        insurance: false,
        dangerousGoods: {
          contains: isDgActive,
          code: cleanDgNum,
          unCode: cleanUnCode,
          class: isDgActive ? (pkg.dgClass || 'Class 9') : '',
          properShippingName: isDgActive ? (pkg.properShippingName || 'Dangerous Goods') : '',
          packingGroup: isDgActive ? (pkg.packingGroup || 'II') : '',
          serviceCode: isDgActive ? (pkg.dgServiceCode || (cleanDgNum === '1266' ? 'HE' : 'HV')) : '',
          contentId: isDgActive ? (pkg.dgContentId || (cleanDgNum === '1266' ? '910' : '967')) : '',
          customDescription: isDgActive ? (pkg.dgMarks || pkg.properShippingName || '') : ''
        },
        valueAddedServices: (service.selectedAddons || []).map(a => a.serviceCode),
        customsInvoice: {
          invoiceNumber: customs.invoiceNum || (mode === 'create' ? `INV-${Date.now().toString().slice(-6)}` : ''),
          declaredValue: Number(customs.invoiceVal || totalDeclaredValue || 0),
          currency: customs.currency || service.currency || 'KWD',
          countryOfOrigin: customs.origin || sender.country || 'Kuwait',
          notes: customs.notes || ''
        },
        specialInstructions: receiver.instructions || service.instructions || ''
      };

      if (isDraft) {
        payload.status = 'DRAFT';
        payload.isDraft = true;
      }

      let res;
      let createdTrackingNumber = null;
      if (mode === 'edit' && shipment?.trackingNumber) {
        res = await shipmentService.updateShipmentDetails(shipment.trackingNumber, payload);
        createdTrackingNumber = shipment.trackingNumber;
        enqueueSnackbar(
          isDraft 
            ? (isRTL ? 'تم حفظ التعديلات كمسودة بنجاح' : 'Changes saved as draft successfully') 
            : (isRTL ? 'تم تحديث بيانات الشحنة وحفظها بنجاح' : 'Shipment updated and saved successfully'),
          { variant: 'success' }
        );
      } else {
        res = await shipmentService.createShipment(payload);
        createdTrackingNumber = res?.trackingNumber || res?.shipment?.trackingNumber || res?.data?.trackingNumber || (typeof res === 'string' ? res : null);
        enqueueSnackbar(
          isDraft
            ? (isRTL ? 'تم حفظ المسودة بنجاح' : 'Draft shipment saved successfully')
            : (isRTL ? 'تم إنشاء الشحنة الجديدة بنجاح' : 'Shipment created successfully'),
          { variant: 'success' }
        );
      }

      const resultObject = res?.shipment || res?.data || (typeof res === 'object' && res ? res : { trackingNumber: createdTrackingNumber });
      const trackingNum = createdTrackingNumber || resultObject?.trackingNumber || shipment?.trackingNumber;
      if (trackingNum && resultObject && !resultObject.trackingNumber) {
        resultObject.trackingNumber = trackingNum;
      }

      if (saveSenderToBook) handleSaveAddressToBook(sender, 'Sender');
      if (saveReceiverToBook) handleSaveAddressToBook(receiver, 'Receiver');

      if (onComplete) {
        onComplete(resultObject);
      } else if (trackingNum) {
        navigate(`/shipment/${trackingNum}`);
      } else if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('[TargetLogisticsWizard] Submit failed:', err);
      enqueueSnackbar(err.response?.data?.message || err.message || 'Operation failed', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      ref={wizardContainerRef}
      className={`bg-[#f0f4f8] text-[#1a1f23] font-['Manrope',sans-serif] ${
        isModal ? 'w-full h-full flex flex-col overflow-hidden' : 'min-h-screen flex flex-col'
      }`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ══ SYSTEM HEADER (In Modal: Modal Header) ══ */}
      <header className="bg-white border-b border-[#e9edf2] px-6 h-16 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="7" fill="#0050d4" />
            <polygon points="8,8 24,16 8,24" fill="white" />
          </svg>
          <div>
            <div className="text-[15px] font-black text-[#1a1f23] tracking-tight leading-none">target</div>
            <div className="text-[9px] font-bold text-[#8c9196] tracking-wider uppercase">logistics</div>
          </div>
          <div className="h-5 w-px bg-[#e9edf2] mx-2 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase text-[#1a1f23]">
              {mode === 'edit' 
                ? (isRTL ? 'استوديو تعديل الشحنة' : 'Consignment Dossier Studio') 
                : (isRTL ? 'إنشاء بوليصة جديدة' : 'New Consignment Wizard')}
            </span>
            {mode === 'edit' && shipment?.trackingNumber && (
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#ebf0fc] text-[#0050d4] border border-[#c7d7fa]">
                #{shipment.trackingNumber}
              </span>
            )}
          </div>
        </div>

        {/* Right Badges & Close Button */}
        <div className="flex items-center gap-3">
          {/* WooCommerce / External Source Badge */}
          {(shipment?.source === 'WOOCOMMERCE' || shipment?.origin?.company?.includes('wordpress') || shipment?.sourceOrderNumber) && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#f5f8ff] border border-[#c7d7fa] text-[#0050d4] rounded-lg text-[11px] font-black">
              <span className="material-symbols-outlined text-sm">shopping_cart</span>
              WooCommerce {shipment.sourceOrderNumber ? `#${shipment.sourceOrderNumber}` : ''}
            </span>
          )}
          {/* DGR Badge */}
          {pkg.dangerousGoods && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-black">
              <span className="material-symbols-outlined text-sm text-amber-600">warning</span>
              IATA DGR
            </span>
          )}
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[#8c9196] hover:bg-[#f0f4f8] hover:text-[#1a1f23] transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* ══ CENTRAL WORKSPACE: Left Stepper Sidebar + Main Content ══ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        
        {/* ── LEFT STEPPER SIDEBAR (280px / 296px) ── */}
        <aside className="w-64 sm:w-72 lg:w-80 shrink-0 bg-white border-e border-[#e9edf2] p-5 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="text-[10px] font-black text-[#8c9196] uppercase tracking-wider mb-1">
              {mode === 'edit' ? (isRTL ? 'تعديل الشحنة' : 'Edit Consignment') : (isRTL ? 'معالج الشحن' : 'Consignment Steps')}
            </div>
            <div className="text-xs font-semibold text-[#8c9196] mb-6">
              {isRTL ? `الخطوة ${step} من 6` : `Step ${step} of 6`} · {mode === 'edit' ? 'Pre-filled' : 'Draft'}
            </div>

            {/* Stepper Vertical List */}
            <div className="space-y-4">
              {stepTitles.map((st, idx) => {
                const sNum = idx + 1;
                const isDone = step > sNum;
                const isActive = step === sNum;
                return (
                  <div key={sNum} className="flex gap-3 relative">
                    {/* Node circle & connector line */}
                    <div className="flex flex-col items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setStep(sNum)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          isDone 
                            ? 'bg-[#0050d4] text-white shadow-xs' 
                            : isActive 
                              ? 'bg-[#ebf0fc] text-[#0050d4] border-2 border-[#0050d4]' 
                              : 'bg-[#f0f4f8] text-[#8c9196] hover:bg-[#e9edf2]'
                        }`}
                      >
                        {isDone ? (
                          <span className="material-symbols-outlined text-[15px]">check</span>
                        ) : (
                          sNum
                        )}
                      </button>
                      {idx < stepTitles.length - 1 && (
                        <div className={`w-0.5 flex-1 min-h-[22px] my-1 ${isDone ? 'bg-[#0050d4]' : 'bg-[#e9edf2]'}`} />
                      )}
                    </div>

                    {/* Step Title & Subtitle */}
                    <div 
                      onClick={() => setStep(sNum)}
                      className="flex-1 cursor-pointer pt-0.5 select-none"
                    >
                      <div className={`text-[12.5px] font-black flex items-center gap-1.5 ${
                        isActive ? 'text-[#0050d4]' : (isDone ? 'text-[#1a1f23]' : 'text-[#8c9196]')
                      }`}>
                        <span className="material-symbols-outlined text-sm">{st.icon}</span>
                        <span className="truncate">{st.title}</span>
                      </div>
                      <div className="text-[10.5px] text-[#a0a6ad] truncate mt-0.5">
                        {st.sub}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar Footer Status Indicator */}
          <div className="pt-4 border-t border-[#e9edf2] mt-6">
            <div className="flex items-center gap-2 p-2.5 bg-[#f8fafc] border border-[#e9edf2] rounded-xl">
              <span className="material-symbols-outlined text-[17px] text-[#059669]">
                {mode === 'edit' ? 'history_toggle_off' : 'verified_user'}
              </span>
              <span className="text-[10.5px] font-bold text-[#575c60] leading-snug">
                {mode === 'edit' 
                  ? (isRTL ? 'سجل التدقيق مفعل للعمليات المالية' : 'Audit trail active for financial edits')
                  : (isRTL ? 'يتم حفظ التغييرات كمسودة تلقائياً' : 'Progress auto-saved as draft')}
              </span>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT CANVAS ── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
          
          {/* Top Progress & Banner Bar */}
          <div className="px-6 sm:px-8 pt-5 shrink-0">
            {/* Edit Mode Amber Notice Banner */}
            {mode === 'edit' && (
              <div className="flex items-center justify-between gap-3 p-3 sm:p-3.5 bg-[#fff8e6] border-[1.5px] border-[#fde68a] rounded-2xl mb-4 text-[#78350f]">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-xl text-[#d97706] shrink-0">edit_note</span>
                  <div>
                    <div className="text-xs sm:text-sm font-black">
                      {isRTL ? `تعديل الشحنة رقم #${shipment?.trackingNumber || ''}` : `Editing Shipment #${shipment?.trackingNumber || ''}`}
                    </div>
                    <div className="text-[11px] text-[#92400e]">
                      {isRTL 
                        ? 'كافة البيانات معبأة مسبقاً. قم بتعديل الحقول المطلوبة ثم احفظ التغييرات.' 
                        : 'All fields are pre-filled. Make changes and save, or save as draft to continue later.'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#fde68a] rounded-lg text-xs font-bold text-[#78350f] hover:bg-[#fffbeb] transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  {isRTL ? 'حفظ كمسودة' : 'Save as Draft'}
                </button>
              </div>
            )}

            {/* Step Header & Est Time */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-[#1a1f23] tracking-tight">
                  {stepTitles[step - 1].title}
                </h2>
                <p className="text-xs text-[#8c9196] mt-0.5">
                  {stepTitles[step - 1].sub}
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-[#ebf0fc] text-[#0050d4] rounded-lg text-xs font-black">
                <span className="material-symbols-outlined text-sm">schedule</span>
                <span>{step === 6 ? '< 1 min' : `${7 - step} min`}</span>
              </div>
            </div>

            {/* 4px Smooth Progress Bar */}
            <div className="h-1 bg-[#e9edf2] rounded-full overflow-hidden mb-4">
              <div 
                className="h-full bg-[#0050d4] transition-all duration-300 rounded-full"
                style={{ width: `${(step / 6) * 100}%` }}
              />
            </div>
          </div>

          {/* Scrollable Form Body */}
          <div ref={formScrollRef} className="flex-1 overflow-y-auto px-6 sm:px-8 pb-6">
            
            {/* ═══ STEP 1: ORIGIN (SHIPPER) ═══ */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Staff Acting On Behalf Of Delegation Card (Creation only, never in edit mode) */}
                {mode === 'create' && isStaffOrAdmin && (
                  <div className="p-4 bg-[#f5f8ff] border-[1.5px] border-[#c7d7fa] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#0050d4] text-white flex items-center justify-center shrink-0 shadow-xs">
                        <span className="material-symbols-outlined text-lg">corporate_fare</span>
                      </div>
                      <div>
                        <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                          {isRTL ? 'الإنشاء نيابة عن عميل أو منظمة (صلاحيات الموظفين)' : 'Acting On Behalf Of (Staff Delegation)'}
                        </div>
                        <div className="text-[11px] text-[#575c60]">
                          {isRTL ? 'حدد العميل أو المنظمة لربط الشحنة بحسابه وسجلاته وتعبئة بياناته' : 'Select client account or organization to bind consignment and pre-fill details'}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                      {/* Client / User Selection */}
                      <select
                        value={selectedClientId}
                        onChange={(e) => handleSelectClient(e.target.value)}
                        className="flex-1 sm:flex-initial text-xs font-bold text-[#0050d4] bg-white border border-[#c7d7fa] rounded-xl px-3 py-2 outline-none cursor-pointer min-w-[200px]"
                      >
                        <option value="">{isRTL ? '— حساب العميل / المستخدم —' : '— Client / User —'}</option>
                        {clients.map(cl => (
                          <option key={cl.id || cl._id} value={cl.id || cl._id}>
                            👤 {cl.name} {cl.company ? `(${cl.company})` : (cl.email ? `(${cl.email})` : '')}
                          </option>
                        ))}
                      </select>

                      {/* Organization Selection (Optional) */}
                      {organizations.length > 0 && (
                        <select
                          value={selectedOrgId}
                          onChange={(e) => handleSelectOrganization(e.target.value)}
                          className="flex-1 sm:flex-initial text-xs font-bold text-[#1a1f23] bg-white border border-[#e9edf2] rounded-xl px-3 py-2 outline-none cursor-pointer min-w-[170px]"
                        >
                          <option value="">{isRTL ? '— منظمة الشحن (اختياري) —' : '— Organization (Optional) —'}</option>
                          {organizations.map(org => (
                            <option key={org.id || org._id} value={org.id || org._id}>
                              🏢 {org.name || org.displayName || org.code}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}

                {/* Validation Error Banner */}
                {Object.keys(errors).filter(k => k.startsWith('sender_')).length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 animate-in fade-in">
                    <span className="material-symbols-outlined text-base text-red-600 shrink-0 mt-0.5">error</span>
                    <div>
                      <div className="font-bold">
                        {isRTL ? 'يرجى استكمال الحقول الإلزامية التالية للمتابعة:' : 'Please complete the following required fields:'}
                      </div>
                      <ul className="list-disc list-inside text-[11px] mt-1 space-y-0.5 opacity-90">
                        {Object.keys(errors).filter(k => k.startsWith('sender_')).map(k => (
                          <li key={k}>{errors[k]}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Contact Identity Details */}
                <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#f0f4f8]">
                    <div>
                      <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                        {isRTL ? 'معلومات جهة الاتصال للشاحن' : 'Shipper Contact & Identity'}
                      </div>
                      <div className="text-[11px] text-[#8c9196]">
                        {isRTL ? 'بيانات الشاحن وموقع استلام الشحنة' : 'Shipper entity and pickup location details'}
                      </div>
                    </div>
                    {/* Saved Address Book Selector */}
                    {userAddresses.length > 0 && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined text-sm text-[#0050d4]">menu_book</span>
                        <select
                          onChange={(e) => handleSelectSenderAddress(e.target.value)}
                          defaultValue=""
                          className="text-[11px] font-bold text-[#0050d4] bg-[#ebf0fc] border border-[#c7d7fa] rounded-lg px-2 py-1 outline-none cursor-pointer max-w-[190px] truncate"
                        >
                          <option value="">{isRTL ? '📖 اختر من دفتر العناوين...' : '📖 Address Book...'}</option>
                          {userAddresses.map((a, idx) => (
                            <option key={a.id || a._id || idx} value={a.id || a._id || idx}>
                              {a.label || a.contactPerson || a.name || `Address ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Primary Contact Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'اسم الشاحن / جهة الاتصال' : 'Contact Full Name'} <span className="text-red-500">*</span>
                      </label>
                      <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                        errors.sender_name ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                      }`}>
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">person</span>
                        <input
                          type="text"
                          value={sender.name}
                          onChange={(e) => {
                            setSender({ ...sender, name: e.target.value });
                            if (errors.sender_name) setErrors(prev => { const n = { ...prev }; delete n.sender_name; return n; });
                          }}
                          placeholder="Ahmed Al-Mutawa"
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                      {errors.sender_name && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.sender_name}</span>}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'اسم الشركة / المؤسسة' : 'Company / Entity'} <span className="text-[#8c9196] text-[10px] font-normal">(Optional)</span>
                      </label>
                      <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">business</span>
                        <input
                          type="text"
                          value={sender.company}
                          onChange={(e) => setSender({ ...sender, company: e.target.value })}
                          placeholder="Target Logistics Co."
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'رقم الهاتف المباشر' : 'Phone Number'} <span className="text-red-500">*</span>
                      </label>
                      <div className={`flex items-center gap-1.5 p-2 border-[1.5px] rounded-xl transition-all ${
                        errors.sender_phone ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                      }`}>
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">phone</span>
                        <select 
                          value={sender.phoneCountryCode}
                          onChange={(e) => setSender({ ...sender, phoneCountryCode: e.target.value })}
                          className="text-[11px] font-bold text-[#0050d4] bg-[#f0f4f8] rounded-md px-1.5 py-0.5 outline-none cursor-pointer max-w-[100px]"
                        >
                          {countries.map(c => (
                            <option key={c.code} value={c.dialCode}>
                              {c.flag} {c.dialCode} ({c.code})
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          value={sender.phone}
                          onChange={(e) => {
                            setSender({ ...sender, phone: e.target.value });
                            if (errors.sender_phone) setErrors(prev => { const n = { ...prev }; delete n.sender_phone; return n; });
                          }}
                          placeholder="69095959"
                          className="w-full text-xs font-semibold font-mono outline-none bg-transparent"
                        />
                      </div>
                      {errors.sender_phone && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.sender_phone}</span>}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'البريد الإلكتروني' : 'Email Address'} <span className="text-[#8c9196] text-[10px] font-normal">(Optional)</span>
                      </label>
                      <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">mail</span>
                        <input
                          type="email"
                          value={sender.email}
                          onChange={(e) => setSender({ ...sender, email: e.target.value })}
                          placeholder="ops@target-logistics.com"
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'الرقم الضريبي / السجل التجاري / البطاقة المدنية' : 'Tax ID / VAT / Customs CR / Civil ID'} <span className="text-[#8c9196] text-[10px] font-normal">(Optional)</span>
                      </label>
                      <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">badge</span>
                        <input
                          type="text"
                          value={sender.taxId}
                          onChange={(e) => setSender({ ...sender, taxId: e.target.value })}
                          placeholder={isRTL ? 'اختياري: الرقم المدني أو الضريبي للشاحن' : 'e.g. Civil ID, Tax ID or Commercial Registration'}
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Google Places Search & Interactive Pin Drop (BEFORE Structured Address Details) */}
                <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#f0f4f8]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[19px] text-[#0050d4]">travel_explore</span>
                      <div>
                        <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                          {isRTL ? 'البحث عن العنوان والخريطة التفاعلية' : 'Google Address Search & Map Pin Drop'}
                        </div>
                        <div className="text-[11px] text-[#8c9196]">
                          {isRTL ? 'ابحث عبر خرائط جوجل أو اسحب الدبوس لتحديد الموقع بدقة وتعبئة العنوان' : 'Search with Google Places or drag the pin on map to auto-fill address details'}
                        </div>
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10.5px] font-black text-[#8c9196] uppercase flex items-center gap-1">
                        <span>⚡</span> {isRTL ? 'سريع:' : 'Quick:'}
                      </span>
                      {senderPresets.slice(0, 2).map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            setSender(prev => ({
                              ...prev,
                              addr1: preset.addr1,
                              area: preset.area,
                              city: preset.city,
                              state: preset.state,
                              country: preset.country,
                              countryCode: preset.countryCode,
                              phoneCountryCode: preset.phoneCountryCode,
                              zip: preset.zip,
                              formattedAddress: `${preset.addr1}, ${preset.city}, ${preset.country}`
                            }));
                            setSenderAddressExpanded(true);
                            setErrors(prev => {
                              const next = { ...prev };
                              delete next.sender_addr1;
                              delete next.sender_city;
                              delete next.sender_country;
                              delete next.sender_zip;
                              return next;
                            });
                          }}
                          className="px-2 py-0.5 text-[10.5px] font-bold rounded-lg border border-[#e9edf2] bg-[#f8fafc] text-[#575c60] hover:border-[#0050d4] hover:text-[#0050d4] hover:bg-[#ebf0fc] transition-all"
                        >
                          {preset.label.split('Logistics')[0].split('Terminal')[0].trim()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Google Address Autocomplete */}
                  <GoogleAddressInput
                    label={isRTL ? 'ابحث عبر خرائط جوجل (Google Places)' : 'Search Global Address (Google Places)'}
                    placeholder={isRTL ? 'ابحث عن العنوان عبر خرائط جوجل...' : 'Search address with Google Maps...'}
                    value={{
                      formattedAddress: sender.formattedAddress || (sender.addr1 ? `${sender.addr1}, ${sender.city || ''}, ${sender.country || ''}` : ''),
                      addressLine1: sender.addr1,
                      addressLine2: sender.addr2,
                      city: sender.city,
                      state: sender.state,
                      postalCode: sender.zip,
                      country: sender.country,
                      countryCode: sender.countryCode,
                      area: sender.area,
                      latitude: sender.latitude,
                      longitude: sender.longitude
                    }}
                    onChange={(res) => {
                      const countryObj = countries.find(c => c.code === res.countryCode) || countries.find(c => c.name?.toLowerCase() === res.country?.toLowerCase());
                      const sanitizedCity = String(res.city || '').trim().substring(0, 45);
                      const sanitizedAddr1 = String(res.streetLines?.[0] || res.addressLine1 || res.formattedAddress || '').trim().substring(0, 45);
                      setSender(prev => ({
                        ...prev,
                        addr1: sanitizedAddr1 || prev.addr1,
                        addr2: res.addressLine2 ? String(res.addressLine2).substring(0, 45) : prev.addr2,
                        area: res.area ? String(res.area).substring(0, 45) : prev.area,
                        city: sanitizedCity || prev.city,
                        state: res.state ? String(res.state).substring(0, 45) : prev.state,
                        zip: res.postalCode || (NON_POSTAL_COUNTRIES.includes(res.countryCode) ? '00000' : prev.zip),
                        country: countryObj?.name || res.country || prev.country,
                        countryCode: countryObj?.code || res.countryCode || prev.countryCode,
                        phoneCountryCode: countryObj?.dialCode || prev.phoneCountryCode,
                        latitude: res.latitude !== undefined && res.latitude !== null ? Number(res.latitude) : prev.latitude,
                        longitude: res.longitude !== undefined && res.longitude !== null ? Number(res.longitude) : prev.longitude,
                        formattedAddress: res.formattedAddress || prev.formattedAddress
                      }));
                      setSenderAddressExpanded(true); // Automatically expand structured address details
                      setErrors(prev => {
                        const next = { ...prev };
                        delete next.sender_addr1;
                        delete next.sender_city;
                        delete next.sender_country;
                        delete next.sender_zip;
                        return next;
                      });
                    }}
                  />

                  {/* Real Interactive GoogleMapPinDrop Component */}
                  <div className="rounded-xl overflow-hidden border border-[#e9edf2]">
                    <GoogleMapPinDrop
                      latitude={sender.latitude}
                      longitude={sender.longitude}
                      addressLabel={sender.formattedAddress || sender.addr1}
                      height="230px"
                      onLocationChange={(loc) => {
                        if (!loc) return;
                        const countryObj = countries.find(c => c.code === loc.countryCode) || countries.find(c => c.name?.toLowerCase() === loc.country?.toLowerCase());
                        setSender(prev => ({
                          ...prev,
                          latitude: loc.latitude,
                          longitude: loc.longitude,
                          formattedAddress: loc.formattedAddress || prev.formattedAddress,
                          city: loc.city || prev.city,
                          country: countryObj?.name || loc.country || prev.country,
                          countryCode: countryObj?.code || loc.countryCode || prev.countryCode,
                          phoneCountryCode: countryObj?.dialCode || prev.phoneCountryCode,
                          state: loc.state || prev.state,
                          area: loc.area || prev.area,
                          zip: loc.postalCode || (NON_POSTAL_COUNTRIES.includes(loc.countryCode) ? '00000' : prev.zip),
                          addr1: loc.formattedAddress ? String(loc.formattedAddress).split(',')[0].trim().substring(0, 45) : prev.addr1
                        }));
                        setSenderAddressExpanded(true); // Automatically expand structured address details on pin drop/drag
                        setErrors(prev => {
                          const next = { ...prev };
                          delete next.sender_addr1;
                          delete next.sender_city;
                          delete next.sender_country;
                          delete next.sender_zip;
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] text-[#8c9196] px-1">
                    <span>{isRTL ? 'اسحب الدبوس أو انقر على الخريطة لتحديد الموقع الجغرافي بدقة' : 'Drag the marker or click map to reposition and reverse-geocode address'}</span>
                    <span className="font-mono font-bold text-[#0050d4]">
                      {Number(sender.latitude || 29.3759).toFixed(4)}° N, {Number(sender.longitude || 47.9774).toFixed(4)}° E
                    </span>
                  </div>
                </div>

                {/* Structured Address Details (Starts Collapsed, auto-expands on search/pin drop) */}
                <div className="bg-white border border-[#e9edf2] rounded-2xl overflow-hidden transition-all shadow-xs">
                  <div 
                    onClick={() => setSenderAddressExpanded(!senderAddressExpanded)}
                    className="p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] cursor-pointer flex items-center justify-between transition-colors border-b border-[#e9edf2]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[19px] text-[#0050d4]">location_city</span>
                      <div>
                        <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider flex items-center gap-2">
                          <span>{isRTL ? 'العنوان التفصيلي للشاحن (الشارع، المدينة، الرمز البريدي)' : 'Structured Address Details'}</span>
                          {sender.city && (
                            <span className="px-2 py-0.5 bg-[#ebf0fc] text-[#0050d4] rounded-md text-[10px] font-bold">
                              {sender.city}, {sender.countryCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#8c9196]">
                          {senderAddressExpanded 
                            ? (isRTL ? 'انقر للطي' : 'Click to collapse manual address fields') 
                            : (isRTL ? 'انقر لعرض وتعديل تفاصيل الشارع والمدينة يدوياً' : 'Click to view and edit street, block, postal code and district')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#0050d4]">
                        {senderAddressExpanded ? (isRTL ? 'طي' : 'Collapse') : (isRTL ? 'عرض وتعديل' : 'View / Edit')}
                      </span>
                      <span className="material-symbols-outlined text-[#0050d4] transition-transform duration-200">
                        {senderAddressExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>

                  {senderAddressExpanded && (
                    <div className="p-5 space-y-4 animate-in fade-in duration-200">
                      {/* Address Line 1 */}
                      <div>
                        <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                          {isRTL ? 'عنوان الشارع والمبنى (السطر 1)' : 'Street Address (Line 1)'} <span className="text-red-500">*</span>
                        </label>
                        <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                          errors.sender_addr1 ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                        }`}>
                          <span className="material-symbols-outlined text-[17px] text-[#8c9196]">home</span>
                          <input
                            type="text"
                            value={sender.addr1}
                            onChange={(e) => {
                              setSender({ ...sender, addr1: e.target.value });
                              if (errors.sender_addr1) setErrors(prev => { const n = { ...prev }; delete n.sender_addr1; return n; });
                            }}
                            placeholder="Block 1, Street 14, Shuwaikh Industrial"
                            className="w-full text-xs font-semibold outline-none bg-transparent"
                          />
                        </div>
                        {errors.sender_addr1 && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.sender_addr1}</span>}
                      </div>

                      {/* Address Line 2 & Area */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'الشقة / الطابق / المكتب (السطر 2)' : 'Apartment / Suite / Office / Unit (Line 2)'}
                          </label>
                          <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                            <span className="material-symbols-outlined text-[17px] text-[#8c9196]">apartment</span>
                            <input
                              type="text"
                              value={sender.addr2 || ''}
                              onChange={(e) => setSender({ ...sender, addr2: e.target.value })}
                              placeholder="Floor 2, Office 12"
                              className="w-full text-xs font-semibold outline-none bg-transparent"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'المنطقة / الحي / القطعة' : 'District / Area / Block'}
                          </label>
                          <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                            <span className="material-symbols-outlined text-[17px] text-[#8c9196]">map</span>
                            <input
                              type="text"
                              value={sender.area || ''}
                              onChange={(e) => setSender({ ...sender, area: e.target.value })}
                              placeholder="Block 4, Shuwaikh Industrial"
                              className="w-full text-xs font-semibold outline-none bg-transparent"
                            />
                          </div>
                        </div>
                      </div>

                      {/* City, State, Country, Postal Code */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'المدينة' : 'City / Municipality'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={sender.city}
                            onChange={(e) => {
                              setSender({ ...sender, city: e.target.value });
                              if (errors.sender_city) setErrors(prev => { const n = { ...prev }; delete n.sender_city; return n; });
                            }}
                            placeholder="Kuwait City"
                            className={`w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold outline-none transition-all ${
                              errors.sender_city ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus:border-[#0050d4]'
                            }`}
                          />
                          {errors.sender_city && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.sender_city}</span>}
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'المحافظة / الإمارة' : 'State / Governorate'}
                          </label>
                          <input
                            type="text"
                            value={sender.state || ''}
                            onChange={(e) => setSender({ ...sender, state: e.target.value })}
                            placeholder="Al Asimah"
                            className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold outline-none focus:border-[#0050d4]"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'الدولة / الإقليم' : 'Country / Territory'} <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={sender.countryCode}
                            onChange={(e) => {
                              const code = e.target.value;
                              const cObj = countries.find(c => c.code === code);
                              setSender(prev => ({
                                ...prev,
                                countryCode: code,
                                country: cObj?.name || prev.country,
                                phoneCountryCode: cObj?.dialCode || prev.phoneCountryCode,
                                zip: NON_POSTAL_COUNTRIES.includes(code) ? '00000' : (prev.zip === '00000' ? '' : prev.zip)
                              }));
                              if (errors.sender_country) setErrors(prev => { const n = { ...prev }; delete n.sender_country; return n; });
                            }}
                            className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold outline-none focus:border-[#0050d4] bg-white cursor-pointer"
                          >
                            {countries.map(c => (
                              <option key={c.code} value={c.code}>
                                {c.flag} {c.name} ({c.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'الرمز البريدي' : 'Postal / ZIP Code'} {!NON_POSTAL_COUNTRIES.includes((sender.countryCode || '').toUpperCase()) && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="text"
                            value={sender.zip}
                            onChange={(e) => {
                              setSender({ ...sender, zip: e.target.value });
                              if (errors.sender_zip) setErrors(prev => { const n = { ...prev }; delete n.sender_zip; return n; });
                            }}
                            placeholder={NON_POSTAL_COUNTRIES.includes((sender.countryCode || '').toUpperCase()) ? "00000 (Optional)" : "13001"}
                            className={`w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold outline-none transition-all ${
                              errors.sender_zip ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus:border-[#0050d4]'
                            }`}
                          />
                          {errors.sender_zip && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.sender_zip}</span>}
                        </div>
                      </div>

                      {/* Save to Address Book */}
                      <label className="flex items-center gap-2.5 p-2.5 bg-[#f8fafc] border border-[#e9edf2] rounded-xl cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={saveSenderToBook}
                          onChange={(e) => setSaveSenderToBook(e.target.checked)}
                          className="checkbox checkbox-primary checkbox-xs rounded"
                        />
                        <span className="text-[11px] font-semibold text-[#1a1f23]">
                          {isRTL ? 'حفظ عنوان الشاحن في دفتر العناوين للاستخدام المستقبلي' : 'Save shipper to Address Book for future consignments'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ STEP 2: CONSIGNEE (RECEIVER) ═══ */}
            {step === 2 && (
              <div className="space-y-5">
                {/* Consignee Contact & Import Details */}
                <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#f0f4f8]">
                    <div>
                      <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                        {isRTL ? 'معلومات المستلم وبيانات الاستيراد' : 'Consignee & Import Details'}
                      </div>
                      <div className="text-[11px] text-[#8c9196]">
                        {isRTL ? 'بيانات جهة الاستلام وعنوان التسليم النهائي' : 'Receiver contact, delivery address and customs clearance ID'}
                      </div>
                    </div>
                    {/* Saved Address Book Selector */}
                    {userAddresses.length > 0 && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="material-symbols-outlined text-sm text-[#0050d4]">menu_book</span>
                        <select
                          onChange={(e) => handleSelectReceiverAddress(e.target.value)}
                          defaultValue=""
                          className="text-[11px] font-bold text-[#0050d4] bg-[#ebf0fc] border border-[#c7d7fa] rounded-lg px-2 py-1 outline-none cursor-pointer max-w-[190px] truncate"
                        >
                          <option value="">{isRTL ? '📖 اختر من دفتر العناوين...' : '📖 Address Book...'}</option>
                          {userAddresses.map((a, idx) => (
                            <option key={a.id || a._id || idx} value={a.id || a._id || idx}>
                              {a.label || a.contactPerson || a.name || `Address ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Validation Error Banner */}
                  {Object.keys(errors).filter(k => k.startsWith('receiver_')).length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 animate-in fade-in">
                      <span className="material-symbols-outlined text-base text-red-600 shrink-0 mt-0.5">error</span>
                      <div>
                        <div className="font-bold">
                          {isRTL ? 'يرجى استكمال الحقول الإلزامية التالية للمتابعة:' : 'Please complete the following required fields:'}
                        </div>
                        <ul className="list-disc list-inside text-[11px] mt-1 space-y-0.5 opacity-90">
                          {Object.keys(errors).filter(k => k.startsWith('receiver_')).map(k => (
                            <li key={k}>{errors[k]}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Primary Contact Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'اسم المستلم / جهة الاتصال' : 'Contact Full Name'} <span className="text-red-500">*</span>
                      </label>
                      <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                        errors.receiver_name ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                      }`}>
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">person</span>
                        <input
                          type="text"
                          value={receiver.name}
                          onChange={(e) => {
                            setReceiver({ ...receiver, name: e.target.value });
                            if (errors.receiver_name) setErrors(prev => { const n = { ...prev }; delete n.receiver_name; return n; });
                          }}
                          placeholder="Sara Al-Rashidi"
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                      {errors.receiver_name && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.receiver_name}</span>}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'شركة المستلم / المؤسسة' : 'Company / Entity'} <span className="text-[#8c9196] text-[10px] font-normal">(Optional)</span>
                      </label>
                      <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">business</span>
                        <input
                          type="text"
                          value={receiver.company}
                          onChange={(e) => setReceiver({ ...receiver, company: e.target.value })}
                          placeholder="Dubai Imports LLC"
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'هاتف المستلم المباشر' : 'Phone Number'} <span className="text-red-500">*</span>
                      </label>
                      <div className={`flex items-center gap-1.5 p-2 border-[1.5px] rounded-xl transition-all ${
                        errors.receiver_phone ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                      }`}>
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">phone</span>
                        <select 
                          value={receiver.phoneCountryCode}
                          onChange={(e) => setReceiver({ ...receiver, phoneCountryCode: e.target.value })}
                          className="text-[11px] font-bold text-[#0050d4] bg-[#f0f4f8] rounded-md px-1.5 py-0.5 outline-none cursor-pointer max-w-[100px]"
                        >
                          {countries.map(c => (
                            <option key={c.code} value={c.dialCode}>
                              {c.flag} {c.dialCode} ({c.code})
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          value={receiver.phone}
                          onChange={(e) => {
                            setReceiver({ ...receiver, phone: e.target.value });
                            if (errors.receiver_phone) setErrors(prev => { const n = { ...prev }; delete n.receiver_phone; return n; });
                          }}
                          placeholder="501234567"
                          className="w-full text-xs font-semibold font-mono outline-none bg-transparent"
                        />
                      </div>
                      {errors.receiver_phone && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.receiver_phone}</span>}
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'البريد الإلكتروني' : 'Email Address'} <span className="text-[#8c9196] text-[10px] font-normal">(Optional)</span>
                      </label>
                      <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                        <span className="material-symbols-outlined text-[17px] text-[#8c9196]">mail</span>
                        <input
                          type="email"
                          value={receiver.email}
                          onChange={(e) => setReceiver({ ...receiver, email: e.target.value })}
                          placeholder="consignee@company.com"
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'الرقم المدني / السجل التجاري / الضريبي' : 'Civil ID / CR / Tax ID (Customs)'}
                      </label>
                      <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all bg-amber-50/40">
                        <span className="material-symbols-outlined text-[17px] text-amber-600">badge</span>
                        <input
                          type="text"
                          value={receiver.taxId}
                          onChange={(e) => setReceiver({ ...receiver, taxId: e.target.value })}
                          placeholder="784-1990-1234567-1 (Required for GCC / International clearance)"
                          className="w-full text-xs font-semibold outline-none bg-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Google Places Search & Interactive Pin Drop (BEFORE Structured Address Details) */}
                <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#f0f4f8]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[19px] text-[#0050d4]">travel_explore</span>
                      <div>
                        <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                          {isRTL ? 'البحث عن وجهة التسليم والخريطة التفاعلية' : 'Consignee Drop-off Search & Map Pin Drop'}
                        </div>
                        <div className="text-[11px] text-[#8c9196]">
                          {isRTL ? 'ابحث عبر خرائط جوجل أو اسحب الدبوس لتحديد وجهة التسليم بدقة وتعبئة العنوان تلقائياً' : 'Search with Google Places or drag the pin on map to auto-fill delivery address'}
                        </div>
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10.5px] font-black text-[#8c9196] uppercase flex items-center gap-1">
                        <span>⚡</span> {isRTL ? 'سريع:' : 'Quick:'}
                      </span>
                      {receiverPresets.slice(0, 3).map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            setReceiver(prev => ({
                              ...prev,
                              addr1: preset.addr1,
                              area: preset.area,
                              city: preset.city,
                              state: preset.state,
                              country: preset.country,
                              countryCode: preset.countryCode,
                              phoneCountryCode: preset.phoneCountryCode,
                              zip: preset.zip,
                              formattedAddress: `${preset.addr1}, ${preset.city}, ${preset.country}`
                            }));
                            setReceiverAddressExpanded(true);
                            setErrors(prev => {
                              const next = { ...prev };
                              delete next.receiver_addr1;
                              delete next.receiver_city;
                              delete next.receiver_country;
                              delete next.receiver_zip;
                              return next;
                            });
                          }}
                          className="px-2 py-0.5 text-[10.5px] font-bold rounded-lg border border-[#e9edf2] bg-[#f8fafc] text-[#575c60] hover:border-[#0050d4] hover:text-[#0050d4] hover:bg-[#ebf0fc] transition-all"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Google Address Autocomplete */}
                  <GoogleAddressInput
                    label={isRTL ? 'ابحث عن وجهة التسليم عبر خرائط جوجل (Google Places)' : 'Search Global Drop-off Point (Google Places)'}
                    placeholder={isRTL ? 'ابحث عن موقع التسليم...' : 'Search drop-off point with Google Maps...'}
                    value={{
                      formattedAddress: receiver.formattedAddress || (receiver.addr1 ? `${receiver.addr1}, ${receiver.city || ''}, ${receiver.country || ''}` : ''),
                      addressLine1: receiver.addr1,
                      addressLine2: receiver.addr2,
                      city: receiver.city,
                      state: receiver.state,
                      postalCode: receiver.zip,
                      country: receiver.country,
                      countryCode: receiver.countryCode,
                      area: receiver.area,
                      latitude: receiver.latitude,
                      longitude: receiver.longitude
                    }}
                    onChange={(res) => {
                      const countryObj = countries.find(c => c.code === res.countryCode) || countries.find(c => c.name?.toLowerCase() === res.country?.toLowerCase());
                      const sanitizedCity = String(res.city || '').trim().substring(0, 45);
                      const sanitizedAddr1 = String(res.streetLines?.[0] || res.addressLine1 || res.formattedAddress || '').trim().substring(0, 45);
                      setReceiver(prev => ({
                        ...prev,
                        addr1: sanitizedAddr1 || prev.addr1,
                        addr2: res.addressLine2 ? String(res.addressLine2).substring(0, 45) : prev.addr2,
                        area: res.area ? String(res.area).substring(0, 45) : prev.area,
                        city: sanitizedCity || prev.city,
                        state: res.state ? String(res.state).substring(0, 45) : prev.state,
                        zip: res.postalCode || (NON_POSTAL_COUNTRIES.includes(res.countryCode) ? '00000' : prev.zip),
                        country: countryObj?.name || res.country || prev.country,
                        countryCode: countryObj?.code || res.countryCode || prev.countryCode,
                        phoneCountryCode: countryObj?.dialCode || prev.phoneCountryCode,
                        latitude: res.latitude !== undefined && res.latitude !== null ? Number(res.latitude) : prev.latitude,
                        longitude: res.longitude !== undefined && res.longitude !== null ? Number(res.longitude) : prev.longitude,
                        formattedAddress: res.formattedAddress || prev.formattedAddress
                      }));
                      setReceiverAddressExpanded(true); // Automatically expand structured address details
                      setErrors(prev => {
                        const next = { ...prev };
                        delete next.receiver_addr1;
                        delete next.receiver_city;
                        delete next.receiver_country;
                        delete next.receiver_zip;
                        return next;
                      });
                    }}
                  />

                  {/* Real Interactive GoogleMapPinDrop Component */}
                  <div className="rounded-xl overflow-hidden border border-[#e9edf2]">
                    <GoogleMapPinDrop
                      latitude={receiver.latitude}
                      longitude={receiver.longitude}
                      addressLabel={receiver.formattedAddress || receiver.addr1}
                      height="230px"
                      onLocationChange={(loc) => {
                        if (!loc) return;
                        const countryObj = countries.find(c => c.code === loc.countryCode) || countries.find(c => c.name?.toLowerCase() === loc.country?.toLowerCase());
                        setReceiver(prev => ({
                          ...prev,
                          latitude: loc.latitude,
                          longitude: loc.longitude,
                          formattedAddress: loc.formattedAddress || prev.formattedAddress,
                          city: loc.city || prev.city,
                          country: countryObj?.name || loc.country || prev.country,
                          countryCode: countryObj?.code || loc.countryCode || prev.countryCode,
                          phoneCountryCode: countryObj?.dialCode || prev.phoneCountryCode,
                          state: loc.state || prev.state,
                          area: loc.area || prev.area,
                          zip: loc.postalCode || (NON_POSTAL_COUNTRIES.includes(loc.countryCode) ? '00000' : prev.zip),
                          addr1: loc.formattedAddress ? String(loc.formattedAddress).split(',')[0].trim().substring(0, 45) : prev.addr1
                        }));
                        setReceiverAddressExpanded(true); // Automatically expand structured address details on pin drop/drag
                        setErrors(prev => {
                          const next = { ...prev };
                          delete next.receiver_addr1;
                          delete next.receiver_city;
                          delete next.receiver_country;
                          delete next.receiver_zip;
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] text-[#8c9196] px-1">
                    <span>{isRTL ? 'اسحب الدبوس أو انقر على الخريطة لتحديد موقع التسليم وتحديث العنوان' : 'Drag the marker or click map to reposition and reverse-geocode address'}</span>
                    <span className="font-mono font-bold text-[#0050d4]">
                      {Number(receiver.latitude || 25.1850).toFixed(4)}° N, {Number(receiver.longitude || 55.2650).toFixed(4)}° E
                    </span>
                  </div>
                </div>

                {/* Structured Delivery Address Details (Starts Collapsed, auto-expands on search/pin drop) */}
                <div className="bg-white border border-[#e9edf2] rounded-2xl overflow-hidden transition-all shadow-xs">
                  <div 
                    onClick={() => setReceiverAddressExpanded(!receiverAddressExpanded)}
                    className="p-4 bg-[#f8fafc] hover:bg-[#f1f5f9] cursor-pointer flex items-center justify-between transition-colors border-b border-[#e9edf2]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[19px] text-[#0050d4]">location_city</span>
                      <div>
                        <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider flex items-center gap-2">
                          <span>{isRTL ? 'العنوان التفصيلي للتسليم (الشارع، المدينة، الرمز البريدي)' : 'Structured Delivery Address Details'}</span>
                          {receiver.city && (
                            <span className="px-2 py-0.5 bg-[#ebf0fc] text-[#0050d4] rounded-md text-[10px] font-bold">
                              {receiver.city}, {receiver.countryCode}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#8c9196]">
                          {receiverAddressExpanded 
                            ? (isRTL ? 'انقر للطي' : 'Click to collapse manual address fields') 
                            : (isRTL ? 'انقر لعرض وتعديل تفاصيل الشارع والمدينة يدوياً' : 'Click to view and edit street, block, postal code and district')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#0050d4]">
                        {receiverAddressExpanded ? (isRTL ? 'طي' : 'Collapse') : (isRTL ? 'عرض وتعديل' : 'View / Edit')}
                      </span>
                      <span className="material-symbols-outlined text-[#0050d4] transition-transform duration-200">
                        {receiverAddressExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>

                  {receiverAddressExpanded && (
                    <div className="p-5 space-y-4 animate-in fade-in duration-200">
                      {/* Address Line 1 */}
                      <div>
                        <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                          {isRTL ? 'عنوان التسليم والشارع (السطر 1)' : 'Street Address (Line 1)'} <span className="text-red-500">*</span>
                        </label>
                        <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                          errors.receiver_addr1 ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                        }`}>
                          <span className="material-symbols-outlined text-[17px] text-[#8c9196]">home</span>
                          <input
                            type="text"
                            value={receiver.addr1}
                            onChange={(e) => {
                              setReceiver({ ...receiver, addr1: e.target.value });
                              if (errors.receiver_addr1) setErrors(prev => { const n = { ...prev }; delete n.receiver_addr1; return n; });
                            }}
                            placeholder="Bay Square, Building 4, Business Bay"
                            className="w-full text-xs font-semibold outline-none bg-transparent"
                          />
                        </div>
                        {errors.receiver_addr1 && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.receiver_addr1}</span>}
                      </div>

                      {/* Address Line 2 & Area */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'الشقة / الطابق / المكتب (السطر 2)' : 'Apartment / Suite / Office / Unit (Line 2)'}
                          </label>
                          <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                            <span className="material-symbols-outlined text-[17px] text-[#8c9196]">apartment</span>
                            <input
                              type="text"
                              value={receiver.addr2 || ''}
                              onChange={(e) => setReceiver({ ...receiver, addr2: e.target.value })}
                              placeholder="Suite 302, 3rd Floor"
                              className="w-full text-xs font-semibold outline-none bg-transparent"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'المنطقة / الحي / القطعة' : 'District / Area / Block'}
                          </label>
                          <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                            <span className="material-symbols-outlined text-[17px] text-[#8c9196]">map</span>
                            <input
                              type="text"
                              value={receiver.area || ''}
                              onChange={(e) => setReceiver({ ...receiver, area: e.target.value })}
                              placeholder="Business Bay"
                              className="w-full text-xs font-semibold outline-none bg-transparent"
                            />
                          </div>
                        </div>
                      </div>

                      {/* City, State, Country, Postal Code */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'المدينة' : 'City / Municipality'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={receiver.city}
                            onChange={(e) => {
                              setReceiver({ ...receiver, city: e.target.value });
                              if (errors.receiver_city) setErrors(prev => { const n = { ...prev }; delete n.receiver_city; return n; });
                            }}
                            placeholder="Dubai"
                            className={`w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold outline-none transition-all ${
                              errors.receiver_city ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus:border-[#0050d4]'
                            }`}
                          />
                          {errors.receiver_city && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.receiver_city}</span>}
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'المحافظة / الإمارة' : 'State / Governorate'}
                          </label>
                          <input
                            type="text"
                            value={receiver.state || ''}
                            onChange={(e) => setReceiver({ ...receiver, state: e.target.value })}
                            placeholder="Dubai"
                            className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold outline-none focus:border-[#0050d4]"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'الدولة / الإقليم' : 'Country / Territory'} <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={receiver.countryCode}
                            onChange={(e) => {
                              const code = e.target.value;
                              const cObj = countries.find(c => c.code === code);
                              setReceiver(prev => ({
                                ...prev,
                                countryCode: code,
                                country: cObj?.name || prev.country,
                                phoneCountryCode: cObj?.dialCode || prev.phoneCountryCode,
                                zip: NON_POSTAL_COUNTRIES.includes(code) ? '00000' : (prev.zip === '00000' ? '' : prev.zip)
                              }));
                              if (errors.receiver_country) setErrors(prev => { const n = { ...prev }; delete n.receiver_country; return n; });
                            }}
                            className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold outline-none focus:border-[#0050d4] bg-white cursor-pointer"
                          >
                            {countries.map(c => (
                              <option key={c.code} value={c.code}>
                                {c.flag} {c.name} ({c.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                            {isRTL ? 'الرمز البريدي' : 'Postal / ZIP Code'} {!NON_POSTAL_COUNTRIES.includes((receiver.countryCode || '').toUpperCase()) && <span className="text-red-500">*</span>}
                          </label>
                          <input
                            type="text"
                            value={receiver.zip}
                            onChange={(e) => {
                              setReceiver({ ...receiver, zip: e.target.value });
                              if (errors.receiver_zip) setErrors(prev => { const n = { ...prev }; delete n.receiver_zip; return n; });
                            }}
                            placeholder={NON_POSTAL_COUNTRIES.includes((receiver.countryCode || '').toUpperCase()) ? "00000 (Optional)" : "00000"}
                            className={`w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold outline-none transition-all ${
                              errors.receiver_zip ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus:border-[#0050d4]'
                            }`}
                          />
                          {errors.receiver_zip && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.receiver_zip}</span>}
                        </div>
                      </div>

                      {/* Delivery Instructions */}
                      <div>
                        <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                          {isRTL ? 'تعليمات تسليم المستلم / رمز البوابة / معالم الموقع' : 'Consignee Delivery Instructions / Gate Code / Landmarks'}
                        </label>
                        <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                          <span className="material-symbols-outlined text-[17px] text-[#8c9196]">door_front</span>
                          <input
                            type="text"
                            value={receiver.instructions}
                            onChange={(e) => setReceiver({ ...receiver, instructions: e.target.value })}
                            placeholder="e.g. Gate 3, Ring intercom #12, leave at reception desk"
                            className="w-full text-xs font-semibold outline-none bg-transparent"
                          />
                        </div>
                      </div>

                      {/* Save to Address Book */}
                      <label className="flex items-center gap-2.5 p-2.5 bg-[#f8fafc] border border-[#e9edf2] rounded-xl cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={saveReceiverToBook}
                          onChange={(e) => setSaveReceiverToBook(e.target.checked)}
                          className="checkbox checkbox-primary checkbox-xs rounded"
                        />
                        <span className="text-[11px] font-semibold text-[#1a1f23]">
                          {isRTL ? 'حفظ عنوان المستلم في دفتر العناوين للاستخدام المستقبلي' : 'Save consignee to Address Book for future shipments'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ STEP 3: PACKAGE & CARGO ═══ */}
            {step === 3 && (
              <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-6">
                {/* Step Header */}
                <div className="flex items-center justify-between pb-4 border-b border-[#e9edf2] flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#ebf0fc] flex items-center justify-center shrink-0 text-[#0050d4]">
                      <span className="material-symbols-outlined text-2xl">inventory_2</span>
                    </div>
                    <div>
                      <h2 className="text-sm md:text-base font-extrabold text-[#1a1f23]">
                        {isRTL ? 'مواصفات الطرود والبضائع' : 'Package & Cargo'}
                      </h2>
                      <p className="text-xs text-[#8c9196]">
                        {isRTL ? 'إدارة الأبعاد والأوزان وتصنيف المواد الخطرة والتأمين' : 'Manage weight, volumetric dimensions, IATA DGR classification and insurance'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-bold text-[#575c60] hover:border-[#0050d4] hover:text-[#0050d4] transition-all"
                  >
                    <span className="material-symbols-outlined text-[15px]">bookmark_add</span>
                    <span>{isRTL ? 'حفظ كقالب مخصص' : 'Save as Template'}</span>
                  </button>
                </div>

                {/* Package Quick Templates */}
                <div>
                  <div className="text-[11px] font-bold text-[#575c60] mb-2 flex items-center gap-1.5">
                    <span>📦</span>
                    <span>{isRTL ? 'قوالب الشحنات الجاهزة:' : 'Package Templates:'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {templates.map(tmpl => (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tmpl)}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg border border-[#e9edf2] bg-white text-[#575c60] hover:border-[#0050d4] hover:bg-[#ebf0fc] hover:text-[#0050d4] transition-all"
                      >
                        {tmpl.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Package Container Types Selection */}
                <div>
                  <div className="text-[11px] font-bold text-[#575c60] mb-2">
                    {isRTL ? 'نوع حاوية الشحن (اختر للتعبئة التلقائية للأبعاد)' : 'Package Container Type'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {containerTypes.map(c => {
                      const isSelected = pkg.pkgType === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectContainerType(c.id)}
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                            isSelected 
                              ? 'bg-[#0050d4] text-white border-[#0050d4] shadow-xs' 
                              : 'bg-white text-[#575c60] border-[#e9edf2] hover:bg-[#f8fafc]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px]">{c.icon || 'inventory_2'}</span>
                          <span>{isRTL ? (c.nameAr || c.name) : c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Multi-parcel Packages List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#e9edf2]">
                    <span className="text-xs font-black text-[#1a1f23] flex items-center gap-1.5">
                      <span>📦</span>
                      <span>{isRTL ? 'قائمة الطرود والقطع' : 'Parcels & Packages List'}</span>
                      <span className="text-[#8c9196] font-normal">({(pkg.packagesList || []).length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleAddParcel}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#ebf0fc] text-[#0050d4] rounded-xl text-xs font-bold hover:bg-[#dbe4fa] transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      {isRTL ? 'إضافة طرد إضافي' : 'Add Another Package'}
                    </button>
                  </div>

                  {(pkg.packagesList || []).map((parcel, idx) => {
                    const l = parseFloat(parcel.length) || 1;
                    const w = parseFloat(parcel.width) || 1;
                    const h = parseFloat(parcel.height) || 1;
                    const volWeight = ((l * w * h) / 5000).toFixed(2);
                    const pfxKey = idx === 0 ? 'pkg' : `pkg_${idx}`;

                    return (
                      <div key={parcel.id || idx} className="p-4 bg-[#f8fafc] border border-[#e9edf2] rounded-2xl space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-[#1a1f23] text-white text-[11px] font-mono font-bold rounded-md">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-bold text-[#1a1f23]">
                              {parcel.description || (isRTL ? 'محتويات الطرد' : 'Cargo Item')} ({parcel.pkgType || pkg.pkgType || 'Box'})
                            </span>
                          </div>
                          {(pkg.packagesList || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveParcel(idx)}
                              className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">delete</span>
                              {isRTL ? 'حذف' : 'Remove'}
                            </button>
                          )}
                        </div>

                        {/* Row 1: Description & Quantity */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="md:col-span-2">
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'وصف المحتوى' : 'Contents Description'} <span className="text-red-500">*</span>
                            </label>
                            <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                              errors[`${pfxKey}_description`] ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] bg-white focus-within:border-[#0050d4]'
                            }`}>
                              <span className="material-symbols-outlined text-[17px] text-[#8c9196]">description</span>
                              <input
                                type="text"
                                value={parcel.description}
                                onChange={(e) => handleUpdateParcel(idx, 'description', e.target.value)}
                                placeholder="General merchandise & consumer goods"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                            </div>
                            {errors[`${pfxKey}_description`] && (
                              <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors[`${pfxKey}_description`]}</span>
                            )}
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'الكمية (قطع)' : 'Quantity (pieces)'} <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] bg-white rounded-xl focus-within:border-[#0050d4] transition-all">
                              <span className="material-symbols-outlined text-[17px] text-[#8c9196]">pin</span>
                              <input
                                type="number"
                                min="1"
                                value={parcel.qty || '1'}
                                onChange={(e) => handleUpdateParcel(idx, 'qty', e.target.value)}
                                placeholder="1"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                              <span className="text-[11px] font-bold text-[#575c60] bg-[#f0f4f8] px-2 py-0.5 rounded-md shrink-0">pcs</span>
                            </div>
                          </div>
                        </div>

                        {/* Row 2: Weight & Dimensions */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'الوزن الفعلي' : 'Weight'} <span className="text-red-500">*</span>
                            </label>
                            <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                              errors[`${pfxKey}_weight`] ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] bg-white focus-within:border-[#0050d4]'
                            }`}>
                              <span className="material-symbols-outlined text-[17px] text-[#8c9196]">scale</span>
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={parcel.weight}
                                onChange={(e) => handleUpdateParcel(idx, 'weight', e.target.value)}
                                placeholder="1.0"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                              <span className="text-[11px] font-bold text-[#575c60] bg-[#f0f4f8] px-2 py-0.5 rounded-md shrink-0">kg</span>
                            </div>
                            {errors[`${pfxKey}_weight`] && (
                              <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors[`${pfxKey}_weight`]}</span>
                            )}
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'الطول' : 'Length'} <span className="text-red-500">*</span>
                            </label>
                            <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                              errors[`${pfxKey}_length`] ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] bg-white focus-within:border-[#0050d4]'
                            }`}>
                              <input
                                type="number"
                                min="1"
                                value={parcel.length}
                                onChange={(e) => handleUpdateParcel(idx, 'length', e.target.value)}
                                placeholder="20"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                              <span className="text-[11px] font-bold text-[#575c60] bg-[#f0f4f8] px-2 py-0.5 rounded-md shrink-0">cm</span>
                            </div>
                            {errors[`${pfxKey}_length`] && (
                              <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors[`${pfxKey}_length`]}</span>
                            )}
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'العرض' : 'Width'} <span className="text-red-500">*</span>
                            </label>
                            <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                              errors[`${pfxKey}_width`] ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] bg-white focus-within:border-[#0050d4]'
                            }`}>
                              <input
                                type="number"
                                min="1"
                                value={parcel.width}
                                onChange={(e) => handleUpdateParcel(idx, 'width', e.target.value)}
                                placeholder="15"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                              <span className="text-[11px] font-bold text-[#575c60] bg-[#f0f4f8] px-2 py-0.5 rounded-md shrink-0">cm</span>
                            </div>
                            {errors[`${pfxKey}_width`] && (
                              <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors[`${pfxKey}_width`]}</span>
                            )}
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'الارتفاع' : 'Height'} <span className="text-red-500">*</span>
                            </label>
                            <div className={`flex items-center gap-2 p-2 border-[1.5px] rounded-xl transition-all ${
                              errors[`${pfxKey}_height`] ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] bg-white focus-within:border-[#0050d4]'
                            }`}>
                              <input
                                type="number"
                                min="1"
                                value={parcel.height}
                                onChange={(e) => handleUpdateParcel(idx, 'height', e.target.value)}
                                placeholder="10"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                              <span className="text-[11px] font-bold text-[#575c60] bg-[#f0f4f8] px-2 py-0.5 rounded-md shrink-0">cm</span>
                            </div>
                            {errors[`${pfxKey}_height`] && (
                              <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors[`${pfxKey}_height`]}</span>
                            )}
                          </div>
                        </div>

                        {/* Row 3: Declared Value, Currency, HS Code & Volumetric Weight */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'القيمة المعلنة' : 'Declared Value'} <span className="text-red-500">*</span>
                            </label>
                            <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] bg-white rounded-xl focus-within:border-[#0050d4] transition-all">
                              <span className="material-symbols-outlined text-[17px] text-[#8c9196]">payments</span>
                              <input
                                type="number"
                                step="0.5"
                                value={parcel.value}
                                onChange={(e) => handleUpdateParcel(idx, 'value', e.target.value)}
                                placeholder="15.000"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                              <span className="text-[11px] font-bold text-[#575c60] bg-[#f0f4f8] px-2 py-0.5 rounded-md shrink-0">
                                {parcel.currency || customs.currency || 'KWD'}
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'العملة' : 'Currency'}
                            </label>
                            <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] bg-white rounded-xl focus-within:border-[#0050d4] transition-all">
                              <span className="material-symbols-outlined text-[17px] text-[#8c9196]">paid</span>
                              <select
                                value={parcel.currency || customs.currency || 'KWD'}
                                onChange={(e) => handleUpdateParcel(idx, 'currency', e.target.value)}
                                className="w-full text-xs font-semibold outline-none bg-transparent cursor-pointer"
                              >
                                <option value="KWD">KWD - Kuwaiti Dinar</option>
                                <option value="USD">USD - US Dollar</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="GBP">GBP - British Pound</option>
                                <option value="AED">AED - UAE Dirham</option>
                                <option value="SAR">SAR - Saudi Riyal</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'رمز التعرفة الجمركية' : 'HS / Tariff Code'} <span className="text-[#8c9196] text-[10px] font-normal">(Optional)</span>
                            </label>
                            <div className="flex items-center gap-2 p-2 border-[1.5px] border-[#e9edf2] bg-white rounded-xl focus-within:border-[#0050d4] transition-all">
                              <span className="material-symbols-outlined text-[17px] text-[#8c9196]">qr_code</span>
                              <input
                                type="text"
                                value={parcel.hsCode || ''}
                                onChange={(e) => handleUpdateParcel(idx, 'hsCode', e.target.value)}
                                placeholder="8517.12.00"
                                className="w-full text-xs font-semibold outline-none bg-transparent"
                              />
                            </div>
                          </div>

                          <div className="flex items-end">
                            <div className="w-full p-2.5 rounded-xl border border-[#e9edf2] bg-white flex items-center justify-between text-xs">
                              <span className="text-[#575c60] font-medium flex items-center gap-1">
                                <span>📐</span>
                                <span>{isRTL ? 'الوزن الحجمي:' : 'Volumetric Wt:'}</span>
                              </span>
                              <span className="font-mono font-bold text-[#0050d4]">{volWeight} kg</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Dangerous Goods (DGR) Card Toggle */}
                <div 
                  onClick={() => setPkg({ ...pkg, dangerousGoods: !pkg.dangerousGoods })}
                  className={`flex items-center justify-between p-3.5 border-[1.5px] rounded-xl cursor-pointer transition-all ${
                    pkg.dangerousGoods ? 'border-[#d97706] bg-[#fffbeb]' : 'border-[#e9edf2] bg-[#f8fafc]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                      pkg.dangerousGoods ? 'bg-[#d97706] border-[#d97706] text-white' : 'border-[#e9edf2] bg-white'
                    }`}>
                      {pkg.dangerousGoods && <span className="material-symbols-outlined text-sm">check</span>}
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#1a1f23] flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-[#d97706]">warning</span>
                        {isRTL ? 'مواد خطرة خاضعة للوائح IATA DGR' : 'Contains Dangerous Goods (IATA DGR)'}
                      </div>
                      <div className="text-[11px] text-[#8c9196]">
                        {isRTL ? 'عطور، بطاريات ليثيوم، رذاذ ومواد قابلة للاشتعال' : 'Perfumes, lithium batteries, aerosols, flammable liquids'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* DGR Details Sub-panel */}
                {pkg.dangerousGoods && (
                  <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-4">
                    <div>
                      <label className="text-[11px] font-bold text-amber-900 block mb-1.5">
                        {isRTL ? 'اختر تصنيف البضاعة الخطرة الجاهز (IATA Presets):' : 'Select IATA Dangerous Goods Preset Category:'}
                      </label>
                      <select
                        value={DG_PRESET_OPTIONS.find(o => o.unCode === pkg.unCode && (!o.contentId || o.contentId === pkg.dgContentId))?.id || (pkg.unCode ? '' : 'none')}
                        onChange={(e) => {
                          const sel = DG_PRESET_OPTIONS.find(o => o.id === e.target.value);
                          if (sel) {
                            if (sel.id === 'none') {
                              setPkg(prev => ({
                                ...prev,
                                dangerousGoods: false,
                                unCode: '',
                                dgClass: '',
                                properShippingName: '',
                                packingGroup: '',
                                dgServiceCode: '',
                                dgContentId: '',
                                dgMarks: ''
                              }));
                            } else {
                              setPkg(prev => ({
                                ...prev,
                                dangerousGoods: true,
                                unCode: sel.unCode,
                                dgClass: sel.dgClass,
                                properShippingName: sel.properShippingName,
                                packingGroup: sel.packingGroup,
                                dgServiceCode: sel.serviceCode,
                                dgContentId: sel.contentId,
                                dgMarks: sel.marks
                              }));
                            }
                            setErrors(prev => {
                              const next = { ...prev };
                              delete next.pkg_unCode;
                              delete next.pkg_dgClass;
                              delete next.pkg_properShippingName;
                              return next;
                            });
                          }
                        }}
                        className="w-full p-2 border-[1.5px] border-amber-300 rounded-xl text-xs font-semibold bg-white text-amber-950 outline-none focus:border-amber-600 cursor-pointer"
                      >
                        {DG_PRESET_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {DG_PRESET_OPTIONS.filter(o => o.id !== 'none').slice(0, 4).map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setPkg(prev => ({
                              ...prev,
                              unCode: opt.unCode,
                              dgClass: opt.dgClass,
                              properShippingName: opt.properShippingName,
                              packingGroup: opt.packingGroup,
                              dgServiceCode: opt.serviceCode,
                              dgContentId: opt.contentId,
                              dgMarks: opt.marks
                            }));
                            setErrors(prev => {
                              const next = { ...prev };
                              delete next.pkg_unCode;
                              delete next.pkg_dgClass;
                              delete next.pkg_properShippingName;
                              return next;
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-colors ${
                            pkg.unCode === opt.unCode 
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs' 
                              : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100/70'
                          }`}
                        >
                          {opt.unCode ? `${opt.unCode} – ` : ''}{opt.name.split('—')[0].split('(')[0].trim()}
                        </button>
                      ))}
                    </div>

                    {/* All Editable IATA DGR Data Fields */}
                    <div className="pt-3 border-t border-amber-200/80 space-y-3">
                      <div className="text-[11px] font-black text-amber-900 uppercase tracking-wider">
                        {isRTL ? 'بيانات ومواصفات الشحن للمواد الخطرة (DGR Data Fields):' : 'IATA DGR Technical Compliance Fields:'}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* UN Code */}
                        <div>
                          <label className="text-[10.5px] font-bold text-amber-950 block mb-1">
                            {isRTL ? 'رمز الأمم المتحدة (UN Code)' : 'UN Identification Code'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={pkg.unCode}
                            onChange={(e) => {
                              setPkg({ ...pkg, unCode: e.target.value });
                              if (errors.pkg_unCode) setErrors(prev => { const n = { ...prev }; delete n.pkg_unCode; return n; });
                            }}
                            placeholder="e.g. UN1266"
                            className={`w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold font-mono bg-white outline-none ${
                              errors.pkg_unCode ? 'border-red-400 bg-red-50/20' : 'border-amber-200 focus:border-amber-600'
                            }`}
                          />
                          {errors.pkg_unCode && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.pkg_unCode}</span>}
                        </div>

                        {/* Hazard Class */}
                        <div>
                          <label className="text-[10.5px] font-bold text-amber-950 block mb-1">
                            {isRTL ? 'فئة الخطورة (Hazard Class)' : 'Hazard Class'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={pkg.dgClass}
                            onChange={(e) => {
                              setPkg({ ...pkg, dgClass: e.target.value });
                              if (errors.pkg_dgClass) setErrors(prev => { const n = { ...prev }; delete n.pkg_dgClass; return n; });
                            }}
                            placeholder="e.g. Class 3 — Flammable Liquid"
                            className={`w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold bg-white outline-none ${
                              errors.pkg_dgClass ? 'border-red-400 bg-red-50/20' : 'border-amber-200 focus:border-amber-600'
                            }`}
                          />
                          {errors.pkg_dgClass && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.pkg_dgClass}</span>}
                        </div>

                        {/* Packing Group */}
                        <div>
                          <label className="text-[10.5px] font-bold text-amber-950 block mb-1">
                            {isRTL ? 'مجموعة التعبئة (Packing Group)' : 'Packing Group'}
                          </label>
                          <input
                            type="text"
                            value={pkg.packingGroup}
                            onChange={(e) => setPkg({ ...pkg, packingGroup: e.target.value })}
                            placeholder="e.g. PG II / PG III"
                            className="w-full p-2 border-[1.5px] border-amber-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-amber-600 font-mono"
                          />
                        </div>

                        {/* Carrier DGR Service Code */}
                        <div>
                          <label className="text-[10.5px] font-bold text-amber-950 block mb-1">
                            {isRTL ? 'رمز خدمة الناقل (HE, HV, HK, HC)' : 'Carrier Service Code'}
                          </label>
                          <input
                            type="text"
                            value={pkg.dgServiceCode}
                            onChange={(e) => setPkg({ ...pkg, dgServiceCode: e.target.value })}
                            placeholder="e.g. HE / HV"
                            className="w-full p-2 border-[1.5px] border-amber-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-amber-600 font-mono"
                          />
                        </div>

                        {/* DGR Content ID */}
                        <div>
                          <label className="text-[10.5px] font-bold text-amber-950 block mb-1">
                            {isRTL ? 'معرف المحتوى (Content ID)' : 'DGR Content ID'}
                          </label>
                          <input
                            type="text"
                            value={pkg.dgContentId}
                            onChange={(e) => setPkg({ ...pkg, dgContentId: e.target.value })}
                            placeholder="e.g. 910 / 965"
                            className="w-full p-2 border-[1.5px] border-amber-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-amber-600 font-mono"
                          />
                        </div>

                        {/* Proper Shipping Name */}
                        <div className="sm:col-span-2 lg:col-span-1">
                          <label className="text-[10.5px] font-bold text-amber-950 block mb-1">
                            {isRTL ? 'اسم الشحن المعتمد' : 'Proper Shipping Name'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={pkg.properShippingName}
                            onChange={(e) => {
                              setPkg({ ...pkg, properShippingName: e.target.value });
                              if (errors.pkg_properShippingName) setErrors(prev => { const n = { ...prev }; delete n.pkg_properShippingName; return n; });
                            }}
                            placeholder="PERFUMERY PRODUCTS WITH FLAMMABLE SOLVENTS"
                            className={`w-full p-2 border-[1.5px] rounded-xl text-xs font-semibold bg-white outline-none ${
                              errors.pkg_properShippingName ? 'border-red-400 bg-red-50/20' : 'border-amber-200 focus:border-amber-600'
                            }`}
                          />
                          {errors.pkg_properShippingName && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.pkg_properShippingName}</span>}
                        </div>
                      </div>

                      {/* DGR Marks / Description */}
                      <div>
                        <label className="text-[10.5px] font-bold text-amber-950 block mb-1">
                          {isRTL ? 'بيان وعلامات المواد الخطرة (DGR Marks / Declaration)' : 'DGR Marks & Custom Declaration'}
                        </label>
                        <input
                          type="text"
                          value={pkg.dgMarks}
                          onChange={(e) => setPkg({ ...pkg, dgMarks: e.target.value })}
                          placeholder="DANGEROUS GOODS AS PER ASSOCIATED DGD"
                          className="w-full p-2 border-[1.5px] border-amber-200 rounded-xl text-xs font-semibold bg-white outline-none focus:border-amber-600"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ STEP 4: CARRIER & SERVICES ═══ */}
            {step === 4 && (
              <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-[#f0f4f8]">
                  <div>
                    <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                      {isRTL ? 'اختيار الناقل ومستوى الخدمة' : 'Select Carrier & Service Level'}
                    </div>
                    <div className="text-[11px] text-[#8c9196]">
                      {isRTL ? 'قارن الأسعار وأوقات العبور والخدمات المتاحة لكل شركة شحن' : 'Compare rates, transit times and carrier capabilities for your route'}
                    </div>
                  </div>
                  {isCarrierLocked && (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">lock</span>
                      {isRTL ? 'الناقل مقفل' : 'Carrier Locked'}
                    </span>
                  )}
                </div>

                {/* Carrier List: Each Service in its Own Row */}
                <div className="flex flex-col gap-2.5">
                  {[
                    { id: 'DGR', name: 'DHL Express Global', desc: 'Worldwide express air · door-to-door delivery · full IATA DGR dangerous goods handling', price: '18.500', time: '1–3 business days', icon: 'flight_takeoff', color: '#D40511', bg: '#fef2f2' },
                    { id: 'FEDEX', name: 'FedEx Express Global', desc: 'Global priority air · automated customs clearance · worldwide coverage', price: '21.750', time: '2–4 business days', icon: 'flight', color: '#4D148C', bg: '#f5f3ff' },
                    { id: 'ARAMEX', name: 'Aramex Priority', desc: 'Regional express & GCC ground network · reliable door-to-door delivery', price: '14.250', time: '2–4 business days', icon: 'local_shipping', color: '#E31837', bg: '#fff1f2' },
                    { id: 'INTERNAL', name: 'Target Dedicated Fleet', desc: 'Domestic same-day courier dispatch · Kuwait nationwide delivery network', price: '4.500', time: 'Same day delivery', icon: 'electric_rickshaw', color: '#059669', bg: '#ecfdf5' }
                  ].map(c => {
                    const isSelected = service.carrierCode === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          if (isCarrierLocked) return;
                          setService({ ...service, carrierCode: c.id, carrierId: c.id, serviceName: c.name, quotedPrice: parseFloat(c.price) });
                          if (errors.service_carrierCode) setErrors(prev => { const n = { ...prev }; delete n.service_carrierCode; return n; });
                        }}
                        className={`p-3.5 rounded-xl border-[1.5px] cursor-pointer transition-all flex items-center justify-between gap-4 ${
                          isSelected 
                            ? 'border-[#0050d4] bg-[#f5f8ff] shadow-xs ring-1 ring-[#0050d4]' 
                            : 'border-[#e9edf2] bg-white hover:border-[#c7d7fa] hover:bg-[#fafbfd]'
                        } ${isCarrierLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                            isSelected ? 'border-[#0050d4] bg-[#0050d4] text-white' : 'border-[#cbd5e1] bg-white'
                          }`}>
                            {isSelected && <span className="material-symbols-outlined text-[13px]">check</span>}
                          </div>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.bg }}>
                            <span className="material-symbols-outlined text-xl" style={{ color: c.color }}>{c.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-black text-[#1a1f23] truncate flex items-center gap-2">
                              <span>{c.name}</span>
                              {isSelected && (
                                <span className="px-2 py-0.5 bg-[#ebf0fc] text-[#0050d4] rounded text-[10px] font-bold">
                                  {isRTL ? 'الخيار المعتمد' : 'Selected'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#8c9196] truncate">{c.desc}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#e9edf2] rounded-lg text-[11px] font-semibold text-[#575c60]">
                            <span className="material-symbols-outlined text-xs text-[#8c9196]">schedule</span>
                            <span>{c.time}</span>
                          </div>
                          <div className="text-end">
                            <div className="text-xs sm:text-sm font-black text-[#0050d4]">KWD {c.price}</div>
                            <div className="text-[10px] text-[#8c9196] sm:hidden">{c.time}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Service Add-ons Collapsible Drawer with Count */}
                <div className="border border-[#e9edf2] rounded-2xl overflow-hidden bg-white">
                  <div
                    onClick={() => setAddonsDrawerOpen(!addonsDrawerOpen)}
                    className="p-3.5 bg-[#f8fafc] hover:bg-[#f1f5f9] cursor-pointer flex items-center justify-between transition-colors border-b border-[#e9edf2]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[18px] text-[#0050d4]">tune</span>
                      <span className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                        {isRTL ? 'الخدمات اللوجستية الإضافية وخيارات التسليم' : 'Value-Added Services & Delivery Options'}
                      </span>
                      <span className="px-2.5 py-0.5 bg-[#ebf0fc] text-[#0050d4] rounded-full text-[10.5px] font-bold">
                        {(service.selectedAddons || []).length} {isRTL ? 'محدد' : 'Selected'} (5 {isRTL ? 'متاح' : 'Available'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-[#0050d4]">
                        {addonsDrawerOpen ? (isRTL ? 'إغلاق الدرج' : 'Collapse Drawer') : (isRTL ? 'عرض وتخصيص' : 'Configure')}
                      </span>
                      <span className="material-symbols-outlined text-[#0050d4] transition-transform duration-200">
                        {addonsDrawerOpen ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>

                  {addonsDrawerOpen && (
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 animate-in fade-in duration-200">
                      {[
                        { serviceCode: 'SIG', name: 'Direct Signature Required', desc: 'Delivery only to designated consignee', rate: 1.5, icon: 'draw' },
                        { serviceCode: 'DDP', name: 'Delivered Duty Paid (DDP)', desc: 'Shipper covers all destination customs duties & clearance', rate: 5.0, icon: 'receipt_long' },
                        { serviceCode: 'PRM', name: 'Priority Morning Delivery (10:30 AM)', desc: 'Earliest time-definite business delivery commitment', rate: 3.0, icon: 'alarm_on' },
                        { serviceCode: 'SA', name: 'Adult (18+) ID Verified Signature', desc: 'Requires government physical ID check upon handover', rate: 2.5, icon: 'badge' },
                        { serviceCode: 'AA', name: 'Saturday / Weekend Priority Delivery', desc: 'Guaranteed weekend delivery schedule in GCC destinations', rate: 4.5, icon: 'event' }
                      ].map(addon => {
                        const isActive = (service.selectedAddons || []).some(a => a.serviceCode === addon.serviceCode);
                        return (
                          <div
                            key={addon.serviceCode}
                            onClick={() => {
                              const exists = (service.selectedAddons || []).some(a => a.serviceCode === addon.serviceCode);
                              const updated = exists 
                                ? service.selectedAddons.filter(a => a.serviceCode !== addon.serviceCode)
                                : [...service.selectedAddons, addon];
                              setService({ ...service, selectedAddons: updated });
                            }}
                            className={`flex items-center justify-between p-3 rounded-xl border-[1.5px] cursor-pointer transition-all ${
                              isActive ? 'border-[#0050d4] bg-[#f5f8ff]' : 'border-[#e9edf2] bg-white hover:border-[#c7d7fa]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                isActive ? 'bg-[#0050d4] border-[#0050d4] text-white' : 'border-[#e9edf2] bg-white'
                              }`}>
                                {isActive && <span className="material-symbols-outlined text-[11px]">check</span>}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-[#1a1f23] truncate">{addon.name}</div>
                                <div className="text-[10px] text-[#8c9196] truncate">{addon.desc}</div>
                              </div>
                            </div>
                            <span className="text-xs font-mono font-bold text-[#0050d4] shrink-0 ms-2">+KWD {addon.rate.toFixed(3)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pickup & Drop-off Logistics (Redistributed into compact columns) */}
                <div className="p-4 bg-[#f8fafc] border border-[#e9edf2] rounded-2xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#e9edf2]">
                    <div className="flex items-center gap-2 text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                      <span className="material-symbols-outlined text-base text-[#0050d4]">event_available</span>
                      <span>{isRTL ? 'جدولة استلام الطرد اللوجستي' : 'Pickup & Drop-off Logistics'}</span>
                    </div>
                    <span className="text-[10.5px] text-[#8c9196]">
                      {service.pickupType?.includes('Pickup') ? (isRTL ? 'خدمة استلام مجدولة' : 'Scheduled Pickup') : (isRTL ? 'تسليم بالفرع' : 'Hub Drop-off')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                    {/* Col 1: Method Selector */}
                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1.5">
                        {isRTL ? 'طريقة الاستلام / التسليم' : 'Logistics Method'}
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 p-2 bg-white border border-[#e9edf2] rounded-xl cursor-pointer text-xs font-bold text-[#1a1f23] hover:border-[#0050d4] transition-all">
                          <input
                            type="radio"
                            name="pickupType"
                            checked={service.pickupType?.includes('Pickup')}
                            onChange={() => setService({ ...service, pickupType: 'Schedule Driver Pickup' })}
                            className="radio radio-primary radio-xs"
                          />
                          <span>{isRTL ? 'طلب مندوب استلام من الموقع' : 'Schedule Driver Pickup'}</span>
                        </label>

                        <label className="flex items-center gap-2 p-2 bg-white border border-[#e9edf2] rounded-xl cursor-pointer text-xs font-bold text-[#1a1f23] hover:border-[#0050d4] transition-all">
                          <input
                            type="radio"
                            name="pickupType"
                            checked={service.pickupType?.includes('Drop-off')}
                            onChange={() => setService({ ...service, pickupType: 'Drop-off at Station / Hub' })}
                            className="radio radio-primary radio-xs"
                          />
                          <span>{isRTL ? 'تسليم مباشر في فرع تارجت' : 'Drop-off at Station / Hub'}</span>
                        </label>
                      </div>
                    </div>

                    {/* Col 2: Date & Window */}
                    <div>
                      {service.pickupType?.includes('Pickup') ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'تاريخ استلام المندوب' : 'Pickup Date'}
                            </label>
                            <input
                              type="date"
                              value={service.pickupDate}
                              onChange={(e) => setService({ ...service, pickupDate: e.target.value })}
                              className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                              {isRTL ? 'الفترة الزمنية للاستلام' : 'Pickup Time Slot'}
                            </label>
                            <select
                              value={service.pickupTime || '9:00 AM – 12:00 PM'}
                              onChange={(e) => setService({ ...service, pickupTime: e.target.value })}
                              className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] cursor-pointer"
                            >
                              <option value="9:00 AM – 12:00 PM">9:00 AM – 12:00 PM (Morning)</option>
                              <option value="12:00 PM – 4:00 PM">12:00 PM – 4:00 PM (Afternoon)</option>
                              <option value="4:00 PM – 8:00 PM">4:00 PM – 8:00 PM (Evening)</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-white border border-[#e9edf2] rounded-xl text-xs text-[#575c60] space-y-1">
                          <div className="font-bold text-[#1a1f23]">📍 {isRTL ? 'فرع تارجت الرئيسي - الشويخ' : 'Target Main Hub - Shuwaikh'}</div>
                          <div className="text-[11px] text-[#8c9196]">{isRTL ? 'ساعات العمل: السبت - الخميس 8 ص إلى 8 م' : 'Open: Sat–Thu 8:00 AM to 8:00 PM'}</div>
                        </div>
                      )}
                    </div>

                    {/* Col 3: Special Driver Notes */}
                    <div>
                      <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                        {isRTL ? 'تعليمات خاصة للسائق ومندوب الاستلام' : 'Driver Instructions & Notes'}
                      </label>
                      <textarea
                        rows={service.pickupType?.includes('Pickup') ? 3 : 2}
                        value={service.instructions || ''}
                        onChange={(e) => setService({ ...service, instructions: e.target.value })}
                        placeholder={isRTL ? 'مثال: رنين جرس المستودع، بوابة رقم 3...' : 'e.g. Ring warehouse bell, gate 4 loading dock, reception desk...'}
                        className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ STEP 5: CUSTOMS & LOGISTICS ═══ */}
            {step === 5 && (
              <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#f0f4f8]">
                  <div>
                    <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                      {isRTL ? 'البيانات الجمركية والفاتورة التجارية والتجارة اللاورقية' : 'Customs Declarations, Commercial Invoice & PLT'}
                    </div>
                    <div className="text-[11px] text-[#8c9196]">
                      {isRTL ? 'شروط التجارة الدولية (Incoterms) وبيانات الفاتورة التجارية للتخليص' : 'International trade terms, declared invoice valuation, tariff classification and PLT'}
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#ebf0fc] text-[#0050d4] rounded-lg text-[11px] font-black">
                    <span className="material-symbols-outlined text-xs">verified</span>
                    PLT Active
                  </span>
                </div>

                {/* Validation Error Banner */}
                {Object.keys(errors).filter(k => k.startsWith('customs_')).length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2 animate-in fade-in">
                    <span className="material-symbols-outlined text-base text-red-600 shrink-0 mt-0.5">error</span>
                    <div>
                      <div className="font-bold">
                        {isRTL ? 'يرجى استكمال الحقول الجمركية التالية للمتابعة:' : 'Please complete the following customs fields:'}
                      </div>
                      <ul className="list-disc list-inside text-[11px] mt-1 space-y-0.5 opacity-90">
                        {Object.keys(errors).filter(k => k.startsWith('customs_')).map(k => (
                          <li key={k}>{errors[k]}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Grid 1: Invoice Number, Declared Value, Currency, HS Code */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Commercial Invoice Number */}
                  <div>
                    <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'رقم الفاتورة التجارية' : 'Commercial Invoice No.'} {customs.shipmentType?.toLowerCase().includes('commercial') && <span className="text-red-500">*</span>}
                    </label>
                    <div className={`flex items-center gap-1.5 p-2 border-[1.5px] rounded-xl transition-all ${
                      errors.customs_invoiceNum ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                    }`}>
                      <span className="material-symbols-outlined text-base text-[#8c9196]">receipt</span>
                      <input
                        type="text"
                        value={customs.invoiceNum}
                        onChange={(e) => {
                          setCustoms({ ...customs, invoiceNum: e.target.value });
                          if (errors.customs_invoiceNum) setErrors(prev => { const n = { ...prev }; delete n.customs_invoiceNum; return n; });
                        }}
                        placeholder="e.g. INV-2026-9042"
                        className="w-full text-xs font-semibold font-mono outline-none bg-transparent"
                      />
                    </div>
                    {errors.customs_invoiceNum && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.customs_invoiceNum}</span>}
                  </div>

                  {/* Declared Customs Value */}
                  <div>
                    <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'القيمة الجمركية المصرحة' : 'Declared Customs Value'} <span className="text-[#8c9196] text-[10px] font-normal">(Valuation)</span>
                    </label>
                    <div className="flex items-center gap-1.5 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4] transition-all">
                      <span className="material-symbols-outlined text-base text-[#8c9196]">payments</span>
                      <input
                        type="number"
                        step="0.1"
                        value={customs.invoiceVal}
                        onChange={(e) => setCustoms({ ...customs, invoiceVal: e.target.value })}
                        placeholder={String(totalDeclaredValue.toFixed(3))}
                        className="w-full text-xs font-semibold font-mono outline-none bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Invoice Currency */}
                  <div>
                    <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'عملة الفاتورة' : 'Invoice Currency'}
                    </label>
                    <select
                      value={customs.currency || 'KWD'}
                      onChange={(e) => setCustoms({ ...customs, currency: e.target.value })}
                      className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] cursor-pointer"
                    >
                      <option value="KWD">KWD – Kuwaiti Dinar</option>
                      <option value="SAR">SAR – Saudi Riyal</option>
                      <option value="AED">AED – UAE Dirham</option>
                      <option value="USD">USD – US Dollar</option>
                      <option value="EUR">EUR – Euro</option>
                      <option value="GBP">GBP – British Pound</option>
                    </select>
                  </div>

                  {/* HS Tariff Code */}
                  <div>
                    <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'رمز البند الجمركي (HS Code)' : 'HS / Tariff Code'} <span className="text-red-500">*</span>
                    </label>
                    <div className={`flex items-center gap-1.5 p-2 border-[1.5px] rounded-xl transition-all ${
                      errors.customs_hsCode ? 'border-red-400 bg-red-50/20' : 'border-[#e9edf2] focus-within:border-[#0050d4]'
                    }`}>
                      <span className="material-symbols-outlined text-base text-[#8c9196]">tag</span>
                      <input
                        type="text"
                        value={customs.hsCode}
                        onChange={(e) => {
                          setCustoms({ ...customs, hsCode: e.target.value });
                          if (errors.customs_hsCode) setErrors(prev => { const n = { ...prev }; delete n.customs_hsCode; return n; });
                        }}
                        placeholder="8517.12.00 / 3303.00.00"
                        className="w-full text-xs font-semibold outline-none bg-transparent font-mono"
                      />
                    </div>
                    {errors.customs_hsCode && <span className="text-[10px] text-red-500 font-semibold mt-0.5 block">{errors.customs_hsCode}</span>}
                  </div>
                </div>

                {/* Grid 2: Incoterms, Shipment Category, Country of Origin */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'شروط التجارة الدولية (Incoterms)' : 'Incoterms (Terms of Sale)'}
                    </label>
                    <select
                      value={customs.incoterms}
                      onChange={(e) => setCustoms({ ...customs, incoterms: e.target.value })}
                      className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] cursor-pointer"
                    >
                      <option value="DAP – Delivered at Place">DAP – Delivered at Place (Standard)</option>
                      <option value="DDP – Delivered Duty Paid">DDP – Delivered Duty Paid (Duties Paid by Shipper)</option>
                      <option value="CIF – Cost, Insurance and Freight">CIF – Cost, Insurance and Freight</option>
                      <option value="EXW – Ex Works">EXW – Ex Works</option>
                      <option value="FOB – Free on Board">FOB – Free on Board</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'تصنيف وغرض الشحنة' : 'Shipment Category / Purpose'}
                    </label>
                    <select
                      value={customs.shipmentType}
                      onChange={(e) => setCustoms({ ...customs, shipmentType: e.target.value })}
                      className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] cursor-pointer"
                    >
                      <option value="Commercial">Commercial Cargo / Merchandise</option>
                      <option value="Personal">Personal Effects / Private Goods</option>
                      <option value="Sample">Commercial Sample / Prototype</option>
                      <option value="Return">Return for Repair / Warranty</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'بلد المنشأ (Country of Origin)' : 'Country of Origin'}
                    </label>
                    <select
                      value={customs.origin || 'Kuwait'}
                      onChange={(e) => setCustoms({ ...customs, origin: e.target.value })}
                      className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] cursor-pointer"
                    >
                      {countries.map(c => (
                        <option key={c.code} value={c.name}>
                          {c.flag} {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Customs Notes */}
                <div>
                  <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                    {isRTL ? 'ملاحظات الفاتورة التجارية وتصريحات التخليص الجمركي' : 'Commercial Invoice Declarations & Clearance Instructions'}
                  </label>
                  <textarea
                    rows={2}
                    value={customs.notes}
                    onChange={(e) => setCustoms({ ...customs, notes: e.target.value })}
                    placeholder="Electronic customs invoice declarations, duty payment account numbers, or COO details..."
                    className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold outline-none focus:border-[#0050d4] resize-none"
                  />
                </div>

                {/* Paperless Trade Badge */}
                <div className="flex items-center gap-3 p-3 bg-[#f8fafc] border border-[#e9edf2] rounded-xl">
                  <span className="material-symbols-outlined text-xl text-[#0050d4]">receipt_long</span>
                  <div className="text-[11px] text-[#575c60]">
                    <strong>📋 {isRTL ? 'التجارة اللاورقية مفعلة (Paperless Trade - PLT):' : 'Paperless Trade (PLT) Digital Submission:'}</strong>{' '}
                    {isRTL 
                      ? 'يتم إرسال الفاتورة والبيانات الجمركية إلكترونياً مباشرة إلى منافذ وهيئات الجمارك، مما يسرع التخليص الجمركي الفوري دون تأخير ورقي.'
                      : 'Commercial invoice and items data will be transmitted digitally directly to customs authorities for accelerated digital pre-clearance.'}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ STEP 6: REVIEW & SAVE / DISPATCH ═══ */}
            {step === 6 && (
              <div className="space-y-4">
                {/* Changes Diff Banner in Edit Mode */}
                {mode === 'edit' && (
                  <div className="flex items-center gap-2.5 p-3 bg-[#eff6ff] border-[1.5px] border-[#bfdbfe] rounded-xl text-xs font-semibold text-[#1e40af]">
                    <span className="material-symbols-outlined text-lg text-[#0050d4]">info</span>
                    <div>
                      {changedFieldsList.length > 0 ? (
                        <span>
                          {isRTL ? 'تم تعديل الحقول التالية:' : 'Fields modified in this session:'} <strong>{changedFieldsList.join(', ')}</strong>.
                        </span>
                      ) : (
                        <span>{isRTL ? 'لم يتم تعديل أي حقول حتى الآن.' : 'No modifications detected yet from original consignment.'}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Route Visual Display */}
                <div className="flex items-center justify-between p-4 bg-[#f5f8ff] border-[1.5px] border-[#c7d7fa] rounded-2xl">
                  <div>
                    <div className="text-[10px] font-bold text-[#8c9196] uppercase">{isRTL ? 'من (الشاحن)' : 'FROM (ORIGIN)'}</div>
                    <div className="text-sm font-black text-[#1a1f23]">{sender.city}, {sender.countryCode}</div>
                    <div className="text-xs text-[#575c60]">{sender.name || 'Shipper'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl text-[#0050d4]">flight_takeoff</span>
                    <div className="w-12 h-0.5 bg-gradient-to-r from-[#0050d4] to-[#7b9cff]" />
                    <span className="material-symbols-outlined text-xl text-[#0050d4]">flight_land</span>
                  </div>
                  <div className="text-end">
                    <div className="text-[10px] font-bold text-[#8c9196] uppercase">{isRTL ? 'إلى (المستلم)' : 'TO (CONSIGNEE)'}</div>
                    <div className="text-sm font-black text-[#1a1f23]">{receiver.city}, {receiver.countryCode}</div>
                    <div className="text-xs text-[#575c60]">{receiver.name || 'Consignee'}</div>
                  </div>
                </div>

                {/* Key-Value Summary & Cost Breakdown in 2 Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Summary Rows */}
                  <div className="p-4 bg-white border border-[#e9edf2] rounded-2xl space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-[#f0f4f8]">
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'نوع الحاوية' : 'Container & Cargo'}</span>
                      <span className="font-bold text-[#1a1f23]">{pkg.pkgType} ({totalWeight.toFixed(1)} kg)</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#f0f4f8]">
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'رقم الفاتورة التجارية' : 'Commercial Invoice'}</span>
                      <span className="font-mono font-bold text-[#1a1f23]">{customs.invoiceNum || (mode === 'create' ? 'AUTO-GEN' : 'None')}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#f0f4f8]">
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'القيمة الجمركية المعلنة' : 'Customs Valuation'}</span>
                      <span className="font-bold text-[#0050d4]">{customs.currency || 'KWD'} {Number(customs.invoiceVal || totalDeclaredValue).toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#f0f4f8]">
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'الناقل المختار' : 'Carrier'}</span>
                      <span className="font-bold text-[#1a1f23]">{service.serviceName}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-[#f0f4f8]">
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'الخدمات المضافة' : 'Add-ons'}</span>
                      <span className="font-bold text-[#1a1f23]">
                        {service.selectedAddons.length > 0 ? service.selectedAddons.map(a => a.serviceCode).join(', ') : 'None'}
                      </span>
                    </div>
                    {pkg.dangerousGoods && (
                      <div className="flex justify-between py-1 border-b border-[#f0f4f8]">
                        <span className="text-amber-800 font-semibold">{isRTL ? 'المواد الخطرة (DGR)' : 'IATA Dangerous Goods'}</span>
                        <span className="font-mono font-bold text-amber-800">{pkg.unCode || 'Active'} ({pkg.dgClass || 'DGR'})</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-b border-[#f0f4f8]">
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'شروط الشحن (Incoterms)' : 'Incoterms'}</span>
                      <span className="font-bold text-[#1a1f23]">{customs.incoterms?.split('–')[0]?.trim() || 'DAP'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'الرمز الجمركي' : 'HS Tariff Code'}</span>
                      <span className="font-mono font-bold text-[#1a1f23]">{customs.hsCode}</span>
                    </div>
                  </div>

                  {/* Financial Cost Breakdown Card */}
                  <div className="p-4 bg-[#f5f8ff] border-[1.5px] border-[#c7d7fa] rounded-2xl space-y-2 text-xs">
                    <div className="text-[10px] font-black text-[#8c9196] uppercase tracking-wider mb-1">
                      {isRTL ? 'تفاصيل التكلفة والرسوم' : 'Updated Financial Breakdown'}
                    </div>
                    <div className="flex justify-between text-[#575c60]">
                      <span>{service.serviceName} Base</span>
                      <span className="font-mono">KWD {baseRate.toFixed(3)}</span>
                    </div>
                    {addonsTotal > 0 && (
                      <div className="flex justify-between text-[#575c60]">
                        <span>Add-ons Surcharges</span>
                        <span className="font-mono">KWD {addonsTotal.toFixed(3)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#575c60]">
                      <span>Fuel Surcharge</span>
                      <span className="font-mono">KWD {(baseRate * 0.095).toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t-2 border-[#c7d7fa] text-sm font-black text-[#1a1f23]">
                      <span>{isRTL ? 'الإجمالي النهائي' : 'Total Consignment Cost'}</span>
                      <span className="text-[#0050d4] font-mono">KWD {finalCost.toFixed(3)}</span>
                    </div>
                  </div>
                </div>

                {/* Policy & Terms Agreement Card */}
                <div className={`p-4 rounded-2xl border-[1.5px] transition-all flex items-start gap-3 ${
                  agreedToPolicy ? 'bg-[#f5f8ff] border-[#0050d4]' : 'bg-[#f8fafc] border-[#e9edf2]'
                }`}>
                  <input
                    type="checkbox"
                    id="policyAgreement"
                    checked={agreedToPolicy}
                    onChange={(e) => setAgreedToPolicy(e.target.checked)}
                    className="checkbox checkbox-primary checkbox-sm rounded mt-0.5"
                  />
                  <label htmlFor="policyAgreement" className="text-xs font-semibold text-[#1a1f23] cursor-pointer leading-relaxed select-none">
                    {isRTL 
                      ? 'أقر بصحة البيانات الجمركية ومحتويات الشحنة، وخلوها من أي مواد ممنوعة أو غير مصرح بها نظاماً، وأوافق على شروط الخدمة وسياسة النقل لشركة تارجت للخدمات اللوجستية والناقل المعتمد.' 
                      : 'I confirm that the shipment details and customs declarations are accurate, that no prohibited or unregistered dangerous goods are enclosed, and I agree to the Target Logistics Terms of Service and Carrier Carriage Policy.'}
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* ══ BOTTOM NAVIGATION FOOTER ══ */}
          <footer className="px-6 sm:px-8 py-3.5 bg-white border-t border-[#e9edf2] flex items-center justify-between shrink-0">
            <button
              type="button"
              disabled={step === 1 || submitting}
              onClick={() => setStep(s => Math.max(1, s - 1))}
              className={`flex items-center gap-1.5 px-4 py-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-bold text-[#575c60] hover:bg-[#f8fafc] transition-colors ${
                step === 1 ? 'opacity-30 cursor-not-allowed' : ''
              }`}
            >
              <span className="material-symbols-outlined text-sm">{isRTL ? 'arrow_forward' : 'arrow_back'}</span>
              <span>{isRTL ? 'السابق' : 'Back'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
                className="flex items-center gap-1.5 px-4 py-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-bold text-[#575c60] hover:bg-[#f8fafc] transition-colors"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                <span>{isRTL ? 'حفظ مسودة' : 'Save Draft'}</span>
              </button>

              {step < 6 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#0050d4] text-white rounded-xl text-xs font-bold shadow-md shadow-[#0050d4]/20 hover:bg-[#0040b0] transition-colors"
                >
                  <span>{isRTL ? 'المتابعة' : 'Continue'}</span>
                  <span className="material-symbols-outlined text-sm">{isRTL ? 'arrow_back' : 'arrow_forward'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting || !agreedToPolicy}
                  onClick={() => handleSubmit(false)}
                  className={`flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-bold shadow-lg transition-all ${
                    !agreedToPolicy
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-[#0050d4] text-white shadow-[#0050d4]/25 hover:bg-[#0040b0]'
                  }`}
                >
                  {submitting ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                  )}
                  <span>
                    {mode === 'edit' 
                      ? (isRTL ? 'تأكيد وحفظ التعديلات' : 'Save Changes & Update') 
                      : (isRTL ? 'إتمام الحجز وإصدار الشحنة' : 'Complete Booking & Dispatch')}
                  </span>
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>

      {/* ── Save Template Modal ── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-[#e9edf2] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#e9edf2]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#ebf0fc] text-[#0050d4] flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">bookmark_add</span>
                </div>
                <h3 className="text-sm font-extrabold text-[#1a1f23]">
                  {isRTL ? 'حفظ مواصفات الطرد كقالب' : 'Save Package as Template'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="text-[#8c9196] hover:text-[#1a1f23] text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#575c60]">
              {isRTL 
                ? 'احفظ الأبعاد والوزن والنوع الحالي كقالب جاهز للاستخدام الفوري في الشحنات المستقبلية.'
                : 'Save current container type, weight, dimensions, and declared value for 1-click reuse.'}
            </p>

            <div>
              <label className="text-[11px] font-bold text-[#575c60] block mb-1">
                {isRTL ? 'اسم القالب المخصص' : 'Template Name'} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={isRTL ? 'مثال: صندوق العطور القياسي' : 'e.g. Standard Small Carton'}
                className="w-full p-2.5 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold outline-none focus:border-[#0050d4]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveTemplate();
                  }
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 border border-[#e9edf2] text-[#575c60] rounded-xl text-xs font-bold hover:bg-[#f8fafc]"
              >
                {isRTL ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="px-4 py-2 bg-[#0050d4] text-white rounded-xl text-xs font-bold hover:bg-[#0040b0]"
              >
                {isRTL ? 'حفظ القالب' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TargetLogisticsWizard;
