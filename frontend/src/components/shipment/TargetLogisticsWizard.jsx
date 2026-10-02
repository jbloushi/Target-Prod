import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSnackbar } from 'notistack';
import api, { shipmentService, userService } from '../../services/api';
import GoogleAddressInput from '../GoogleAddressInput';
import { countries } from '../../utils/countries';
import { getContainerTypes, getContainerTypeById } from '../../utils/containerTypesConfig';
import { DG_PRESET_OPTIONS } from './KineticShipmentWizard';
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
  const { user } = useAuth();
  const { isRTL, lang } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();
  const wizardContainerRef = useRef(null);

  const containerTypes = useMemo(() => getContainerTypes(), []);

  // ── Step State (1: Sender, 2: Receiver, 3: Package, 4: Carrier, 5: Customs, 6: Review) ──
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

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
    if (mode === 'edit' && shipment) {
      const activeAddons = (shipment.valueAddedServices || shipment.origin?.optionalServiceCodes || []).map(code => ({
        serviceCode: code,
        name: code === 'DDP' ? 'Delivered Duty Paid (DDP)' : (code === 'SIG' ? 'Direct Signature Required' : code),
        rate: code === 'DDP' ? 5.0 : (code === 'SIG' ? 1.5 : 3.0)
      }));
      return {
        carrierCode: shipment.carrierCode || 'DGR',
        carrierId: shipment.carrierCode || 'DGR',
        serviceCode: shipment.serviceCode || 'P',
        serviceName: shipment.carrierCode === 'INTERNAL' ? 'Target Dedicated Fleet' : 'DHL Express Global',
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
      carrierCode: 'DGR',
      carrierId: 'DGR',
      serviceCode: 'P',
      serviceName: 'DHL Express Global',
      quotedPrice: 18.5,
      currency: 'KWD',
      selectedAddons: [],
      pickupType: 'Schedule Driver Pickup',
      pickupDate: new Date().toISOString().slice(0, 10),
      pickupTime: '9:00 AM – 12:00 PM',
      instructions: ''
    };
  }, [mode, shipment]);

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

  // ── Address Book Fetching ──
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
    return () => { isMounted = false; };
  }, [user]);

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
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep(step)) {
      enqueueSnackbar(
        isRTL ? 'يرجى إكمال الحقول الإلزامية المطلوبة للمتابعة' : 'Please complete the required fields to proceed',
        { variant: 'warning' }
      );
      return;
    }
    setErrors({});
    setStep(s => Math.min(6, s + 1));
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

  const insurancePremium = useMemo(() => {
    if (!pkg.insurance) return 0;
    const val = parseFloat(customs.invoiceVal || totalDeclaredValue) || 0;
    return Math.max(2.5, val * 0.01);
  }, [pkg.insurance, customs.invoiceVal, totalDeclaredValue]);

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
    return Number((baseRate + addonsTotal + insurancePremium + fuelSurcharge).toFixed(3));
  }, [baseRate, addonsTotal, insurancePremium]);

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

      const finalItems = (pkg.packagesList || []).map(p => ({
        description: p.description || pkg.description || 'General Cargo',
        quantity: Number(p.qty) || 1,
        price: Number(p.value) || 0,
        value: Number(p.value) || 0,
        currency: p.currency || 'KWD',
        hsCode: p.hsCode || customs.hsCode || '',
        countryOfOrigin: customs.origin || 'KW'
      }));

      const payload = {
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
        carrierCode: service.carrierCode,
        serviceCode: service.serviceCode,
        currency: service.currency || 'KWD',
        price: finalCost,
        incoterm: customs.incoterms.split(' ')[0] || 'DAP',
        insurance: Boolean(pkg.insurance),
        dangerousGoods: {
          contains: Boolean(pkg.dangerousGoods),
          unCode: pkg.unCode,
          class: pkg.dgClass,
          properShippingName: pkg.properShippingName,
          packingGroup: pkg.packingGroup,
          serviceCode: pkg.dgServiceCode,
          contentId: pkg.dgContentId,
          customDescription: pkg.dgMarks
        },
        valueAddedServices: (service.selectedAddons || []).map(a => a.serviceCode),
        customsInvoice: {
          invoiceNumber: customs.invoiceNum || '',
          declaredValue: Number(customs.invoiceVal || totalDeclaredValue || 0),
          notes: customs.notes || ''
        },
        specialInstructions: receiver.instructions || service.instructions || ''
      };

      if (isDraft) {
        payload.status = 'DRAFT';
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
          isRTL ? 'تم إنشاء الشحنة الجديدة بنجاح' : 'Shipment created successfully',
          { variant: 'success' }
        );
      }

      const resultObject = res?.shipment || res?.data || (typeof res === 'object' && res ? res : { trackingNumber: createdTrackingNumber });
      if (resultObject && !resultObject.trackingNumber && createdTrackingNumber) {
        resultObject.trackingNumber = createdTrackingNumber;
      }

      if (saveSenderToBook) handleSaveAddressToBook(sender, 'Sender');
      if (saveReceiverToBook) handleSaveAddressToBook(receiver, 'Receiver');

      if (onComplete) onComplete(resultObject);
      if (onClose) onClose();
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
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-6">
            
            {/* ═══ STEP 1: ORIGIN (SHIPPER) ═══ */}
            {step === 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
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

                  {/* Quick Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-black text-[#8c9196] uppercase flex items-center gap-1">
                      <span>⚡</span> {isRTL ? 'عناوين سريعة:' : 'Quick Presets:'}
                    </span>
                    {senderPresets.map((preset, pIdx) => (
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
                          setErrors(prev => {
                            const next = { ...prev };
                            delete next.sender_addr1;
                            delete next.sender_city;
                            delete next.sender_country;
                            delete next.sender_zip;
                            return next;
                          });
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[#e9edf2] bg-[#f8fafc] text-[#575c60] hover:border-[#0050d4] hover:text-[#0050d4] hover:bg-[#ebf0fc] transition-all"
                      >
                        {preset.label}
                      </button>
                    ))}
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

                  {/* Section Divider */}
                  <div className="pt-2 border-t border-[#f0f4f8]">
                    <div className="text-[11px] font-black text-[#575c60] uppercase tracking-wider mb-2">
                      {isRTL ? 'العنوان التفصيلي للشاحن' : 'Structured Address Details'}
                    </div>
                  </div>

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

                {/* Right: Google Places & Map Coordinates Card */}
                <div className="lg:col-span-5 bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#1a1f23]">
                      <span className="material-symbols-outlined text-[17px] text-[#0050d4]">travel_explore</span>
                      <span>{isRTL ? 'تحديد الموقع بالخريطة والبحث الذكي' : 'Google Address Search & GPS Pin'}</span>
                    </div>
                  </div>

                  {/* Google Address Autocomplete connected properly with value and onChange */}
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

                  {/* Schematic Map Preview with Pin Drop */}
                  <div className="relative h-44 rounded-xl overflow-hidden border border-[#e9edf2] bg-[#e8eef3] flex items-center justify-center">
                    <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#0050d4_1px,transparent_1px)] [background-size:16px_16px]" />
                    <div className="absolute top-1/2 left-0 right-0 h-2 bg-white/80 shadow-xs" />
                    <div className="absolute left-1/2 top-0 bottom-0 w-2 bg-white/80 shadow-xs" />
                    {/* Pin Marker */}
                    <div className="relative flex flex-col items-center z-10 animate-bounce">
                      <span className="material-symbols-outlined text-4xl text-[#0050d4] drop-shadow-md">location_on</span>
                    </div>
                    {/* Coordinates Overlay */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 rounded-lg shadow-xs text-[10.5px] font-mono font-bold text-[#1a1f23]">
                      <span className="material-symbols-outlined text-xs text-[#0050d4]">my_location</span>
                      <span>{Number(sender.latitude || 29.3759).toFixed(4)}° N, {Number(sender.longitude || 47.9774).toFixed(4)}° E</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#8c9196] text-center">
                    {isRTL ? 'يتم حفظ الإحداثيات الجغرافية بدقة لتسهيل وصول المندوب' : 'Precise GPS coordinates captured for driver navigation'}
                  </p>
                </div>
              </div>
            )}

            {/* ═══ STEP 2: CONSIGNEE (RECEIVER) ═══ */}
            {step === 2 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
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

                  {/* Quick Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-black text-[#8c9196] uppercase flex items-center gap-1">
                      <span>⚡</span> {isRTL ? 'عناوين سريعة:' : 'Quick Presets:'}
                    </span>
                    {receiverPresets.map((preset, pIdx) => (
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
                          setErrors(prev => {
                            const next = { ...prev };
                            delete next.receiver_addr1;
                            delete next.receiver_city;
                            delete next.receiver_country;
                            delete next.receiver_zip;
                            return next;
                          });
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[#e9edf2] bg-[#f8fafc] text-[#575c60] hover:border-[#0050d4] hover:text-[#0050d4] hover:bg-[#ebf0fc] transition-all"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

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

                  {/* Section Divider */}
                  <div className="pt-2 border-t border-[#f0f4f8]">
                    <div className="text-[11px] font-black text-[#575c60] uppercase tracking-wider mb-2">
                      {isRTL ? 'العنوان التفصيلي للتسليم' : 'Structured Delivery Address Details'}
                    </div>
                  </div>

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

                {/* Right: Google Places & Map Coordinates Card */}
                <div className="lg:col-span-5 bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#1a1f23]">
                      <span className="material-symbols-outlined text-[17px] text-[#0050d4]">pin_drop</span>
                      <span>{isRTL ? 'تحديد عنوان التسليم بالخريطة' : 'Consignee Drop-off Location & GPS Pin'}</span>
                    </div>
                  </div>

                  {/* Google Address Autocomplete connected properly with value and onChange */}
                  <GoogleAddressInput
                    label={isRTL ? 'ابحث عبر خرائط جوجل (Google Places)' : 'Search Global Address (Google Places)'}
                    placeholder={isRTL ? 'ابحث عن وجهة التسليم...' : 'Search drop-off point with Google Maps...'}
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

                  {/* Schematic Map Preview with Pin Drop */}
                  <div className="relative h-44 rounded-xl overflow-hidden border border-[#e9edf2] bg-[#e8eef3] flex items-center justify-center">
                    <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#0050d4_1px,transparent_1px)] [background-size:16px_16px]" />
                    <div className="absolute top-1/2 left-0 right-0 h-2 bg-white/80 shadow-xs" />
                    <div className="absolute left-1/2 top-0 bottom-0 w-2 bg-white/80 shadow-xs" />
                    {/* Pin Marker */}
                    <div className="relative flex flex-col items-center z-10 animate-bounce">
                      <span className="material-symbols-outlined text-4xl text-[#0050d4] drop-shadow-md">flag</span>
                    </div>
                    {/* Coordinates Overlay */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 bg-white/95 rounded-lg shadow-xs text-[10.5px] font-mono font-bold text-[#1a1f23]">
                      <span className="material-symbols-outlined text-xs text-[#0050d4]">my_location</span>
                      <span>{Number(receiver.latitude || 25.1850).toFixed(4)}° N, {Number(receiver.longitude || 55.2650).toFixed(4)}° E</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#8c9196] text-center">
                    {isRTL ? 'يتم حفظ الإحداثيات الجغرافية بدقة لتسهيل وصول المندوب' : 'Precise GPS coordinates captured for driver navigation'}
                  </p>
                </div>
              </div>
            )}

            {/* ═══ STEP 3: PACKAGE & CARGO ═══ */}
            {step === 3 && (
              <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-5">
                {/* Container Types Selection Buttons */}
                <div>
                  <div className="text-[11px] font-black text-[#575c60] uppercase tracking-wider mb-2">
                    {isRTL ? 'نوع حاوية الشحن (اختر للتعبئة التلقائية للأبعاد)' : 'Container Type (Click to populate default dimensions)'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {containerTypes.map(c => {
                      const isSelected = pkg.pkgType === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectContainerType(c.id)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                            isSelected 
                              ? 'bg-[#0050d4] text-white border-[#0050d4] shadow-xs' 
                              : 'bg-white text-[#575c60] border-[#e9edf2] hover:bg-[#f8fafc]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[17px]">{c.icon || 'inventory_2'}</span>
                          <span>{isRTL ? (c.nameAr || c.name) : c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Multi-parcel Packages List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                      {isRTL ? 'طرود الشحنة ومواصفات البضاعة' : 'Cargo Parcels & Dimensions'}
                    </span>
                    <button
                      type="button"
                      onClick={handleAddParcel}
                      className="flex items-center gap-1 px-2.5 py-1 bg-[#ebf0fc] text-[#0050d4] rounded-lg text-xs font-bold hover:bg-[#dbe4fa] transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      {isRTL ? 'إضافة طرد إضافي' : 'Add Parcel'}
                    </button>
                  </div>

                  {(pkg.packagesList || []).map((parcel, idx) => (
                    <div key={parcel.id || idx} className="p-3.5 bg-[#f8fafc] border border-[#e9edf2] rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-[#0050d4]">
                          {isRTL ? `طرد #${idx + 1}` : `Parcel #${idx + 1}`} ({parcel.pkgType || 'Box'})
                        </span>
                        {pkg.packagesList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveParcel(idx)}
                            className="text-red-500 hover:text-red-700 text-xs flex items-center gap-0.5 font-bold"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                            {isRTL ? 'حذف' : 'Remove'}
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                        <div>
                          <label className="text-[10px] font-bold text-[#8c9196] block mb-1">{isRTL ? 'الوزن (كجم)' : 'Weight (kg)'} *</label>
                          <input
                            type="number"
                            step="0.1"
                            value={parcel.weight}
                            onChange={(e) => handleUpdateParcel(idx, 'weight', e.target.value)}
                            className="w-full p-1.5 border border-[#e9edf2] rounded-lg text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#8c9196] block mb-1">{isRTL ? 'الطول (سم)' : 'Length (cm)'} *</label>
                          <input
                            type="number"
                            value={parcel.length}
                            onChange={(e) => handleUpdateParcel(idx, 'length', e.target.value)}
                            className="w-full p-1.5 border border-[#e9edf2] rounded-lg text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#8c9196] block mb-1">{isRTL ? 'العرض (سم)' : 'Width (cm)'} *</label>
                          <input
                            type="number"
                            value={parcel.width}
                            onChange={(e) => handleUpdateParcel(idx, 'width', e.target.value)}
                            className="w-full p-1.5 border border-[#e9edf2] rounded-lg text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#8c9196] block mb-1">{isRTL ? 'الارتفاع (سم)' : 'Height (cm)'} *</label>
                          <input
                            type="number"
                            value={parcel.height}
                            onChange={(e) => handleUpdateParcel(idx, 'height', e.target.value)}
                            className="w-full p-1.5 border border-[#e9edf2] rounded-lg text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#8c9196] block mb-1">{isRTL ? 'القيمة المعلنة' : 'Value (KWD)'} *</label>
                          <input
                            type="number"
                            step="0.5"
                            value={parcel.value}
                            onChange={(e) => handleUpdateParcel(idx, 'value', e.target.value)}
                            className="w-full p-1.5 border border-[#e9edf2] rounded-lg text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[#8c9196] block mb-1">{isRTL ? 'وصف المحتوى' : 'Description'} *</label>
                          <input
                            type="text"
                            value={parcel.description}
                            onChange={(e) => handleUpdateParcel(idx, 'description', e.target.value)}
                            className="w-full p-1.5 border border-[#e9edf2] rounded-lg text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Insurance Card Toggle */}
                <div 
                  onClick={() => setPkg({ ...pkg, insurance: !pkg.insurance })}
                  className={`flex items-center justify-between p-3.5 border-[1.5px] rounded-xl cursor-pointer transition-all ${
                    pkg.insurance ? 'border-[#059669] bg-[#ecfdf5]' : 'border-[#e9edf2] bg-[#f8fafc]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                      pkg.insurance ? 'bg-[#059669] border-[#059669] text-white' : 'border-[#e9edf2] bg-white'
                    }`}>
                      {pkg.insurance && <span className="material-symbols-outlined text-sm">check</span>}
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#1a1f23]">
                        🛡️ {isRTL ? 'تأمين البضائع الشامل وحماية الشحن' : 'Full Cargo Insurance & Loss Protection'}
                      </div>
                      <div className="text-[11px] text-[#8c9196]">
                        {isRTL ? '1% من القيمة المعلنة (الحد الأدنى 2.500 د.ك)' : '1% of declared value, min KWD 2.500'}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-[#059669]">
                    +KWD {insurancePremium.toFixed(3)}
                  </span>
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
                  <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl space-y-3">
                    <div className="text-[11px] font-bold text-amber-900">
                      {isRTL ? 'اختر تصنيف البضاعة الخطرة الجاهز:' : 'Select IATA DGR Preset Category:'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DG_PRESET_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setPkg(prev => ({
                            ...prev,
                            unCode: opt.unCode,
                            dgClass: opt.dgClass,
                            properShippingName: opt.properShippingName,
                            packingGroup: opt.packingGroup,
                            dgServiceCode: opt.serviceCode,
                            dgContentId: opt.contentId,
                            dgMarks: opt.marks
                          }))}
                          className={`px-2 py-1 rounded-md text-[10.5px] font-bold border transition-colors ${
                            pkg.unCode === opt.unCode 
                              ? 'bg-amber-600 text-white border-amber-600' 
                              : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ STEP 4: CARRIER & SERVICES ═══ */}
            {step === 4 && (
              <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-5">
                <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                  {isRTL ? 'اختيار الناقل ومستوى الخدمة' : 'Select Carrier & Service Level'}
                </div>

                {/* Carrier Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { id: 'DGR', name: 'DHL Express Global', desc: 'Worldwide express air · door-to-door', price: '18.500', time: '2–3 business days', icon: 'flight_takeoff', color: '#D40511', bg: '#fef2f2' },
                    { id: 'FEDEX', name: 'FedEx Express Global', desc: 'Global priority air · automated customs', price: '21.750', time: '2–4 business days', icon: 'flight', color: '#4D148C', bg: '#f5f3ff' },
                    { id: 'INTERNAL', name: 'Target Dedicated Fleet', desc: 'Domestic same-day courier · Kuwait only', price: '4.500', time: 'Same day delivery', icon: 'electric_rickshaw', color: '#059669', bg: '#ecfdf5' }
                  ].map(c => {
                    const isSelected = service.carrierCode === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          if (isCarrierLocked) return;
                          setService({ ...service, carrierCode: c.id, carrierId: c.id, serviceName: c.name, quotedPrice: parseFloat(c.price) });
                        }}
                        className={`p-3.5 rounded-xl border-[1.5px] cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-[#0050d4] bg-[#f5f8ff] shadow-sm' 
                            : 'border-[#e9edf2] bg-white hover:border-[#c7d7fa]'
                        } ${isCarrierLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.bg }}>
                              <span className="material-symbols-outlined text-lg" style={{ color: c.color }}>{c.icon}</span>
                            </div>
                            <div>
                              <div className="text-xs font-black text-[#1a1f23]">{c.name}</div>
                              <div className="text-[10px] text-[#8c9196]">{c.desc}</div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 pt-2 border-t border-[#f0f4f8] flex items-center justify-between">
                          <span className="text-[10px] text-[#8c9196]">{c.time}</span>
                          <span className="text-xs font-black text-[#0050d4]">KWD {c.price}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Service Add-ons */}
                <div>
                  <div className="text-[11px] font-black text-[#575c60] uppercase tracking-wider mb-2">
                    {isRTL ? 'الخدمات اللوجستية الإضافية' : 'Service Add-ons'}
                  </div>
                  <div className="space-y-2">
                    {[
                      { serviceCode: 'SIG', name: 'Direct Signature Required', desc: 'Delivery only to designated consignee', rate: 1.5 },
                      { serviceCode: 'DDP', name: 'Delivered Duty Paid (DDP)', desc: 'Shipper covers all customs duties & clearance', rate: 5.0 },
                      { serviceCode: 'PRM', name: 'Priority Morning Delivery (10:30 AM)', desc: 'Earliest time-definite business delivery', rate: 3.0 }
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
                          className={`flex items-center justify-between p-2.5 rounded-xl border-[1.5px] cursor-pointer transition-all ${
                            isActive ? 'border-[#0050d4] bg-[#f5f8ff]' : 'border-[#e9edf2] bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                              isActive ? 'bg-[#0050d4] border-[#0050d4] text-white' : 'border-[#e9edf2] bg-white'
                            }`}>
                              {isActive && <span className="material-symbols-outlined text-[11px]">check</span>}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#1a1f23]">{addon.name}</div>
                              <div className="text-[10px] text-[#8c9196]">{addon.desc}</div>
                            </div>
                          </div>
                          <span className="text-xs font-mono font-bold text-[#0050d4]">+KWD {addon.rate.toFixed(3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ═══ STEP 5: CUSTOMS & LOGISTICS ("Shrinked into space") ═══ */}
            {step === 5 && (
              <div className="bg-white border border-[#e9edf2] rounded-2xl p-5 space-y-4">
                <div className="text-xs font-black text-[#1a1f23] uppercase tracking-wider">
                  {isRTL ? 'البيانات الجمركية والتجارة اللاورقية' : 'Customs Declarations & Paperless Trade (PLT)'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10.5px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'رمز البند الجمركي (HS Code)' : 'HS / Tariff Code'} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-1.5 p-2 border-[1.5px] border-[#e9edf2] rounded-xl focus-within:border-[#0050d4]">
                      <span className="material-symbols-outlined text-base text-[#8c9196]">tag</span>
                      <input
                        type="text"
                        value={customs.hsCode}
                        onChange={(e) => setCustoms({ ...customs, hsCode: e.target.value })}
                        placeholder="8517.12.00"
                        className="w-full text-xs font-semibold outline-none bg-transparent font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'شروط التجارة (Incoterms)' : 'Incoterms'}
                    </label>
                    <select
                      value={customs.incoterms}
                      onChange={(e) => setCustoms({ ...customs, incoterms: e.target.value })}
                      className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] cursor-pointer"
                    >
                      <option>DAP – Delivered at Place</option>
                      <option>DDP – Delivered Duty Paid</option>
                      <option>EXW – Ex Works</option>
                      <option>CIF – Cost, Insurance & Freight</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'الغرض من الشحن' : 'Shipment Purpose'}
                    </label>
                    <select
                      value={customs.shipmentType}
                      onChange={(e) => setCustoms({ ...customs, shipmentType: e.target.value })}
                      className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4] cursor-pointer"
                    >
                      <option>Commercial – General Merchandise</option>
                      <option>Commercial – Sample</option>
                      <option>Personal – Gift</option>
                      <option>Return / Repair</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-bold text-[#575c60] block mb-1">
                      {isRTL ? 'بلد المنشأ' : 'Country of Origin'}
                    </label>
                    <input
                      type="text"
                      value={customs.origin}
                      onChange={(e) => setCustoms({ ...customs, origin: e.target.value })}
                      className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold bg-white outline-none focus:border-[#0050d4]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-[#575c60] block mb-1">
                    {isRTL ? 'ملاحظات الفاتورة التجارية والبيان الجمركي' : 'Commercial Invoice Instructions & Declarations'}
                  </label>
                  <textarea
                    rows={2}
                    value={customs.notes}
                    onChange={(e) => setCustoms({ ...customs, notes: e.target.value })}
                    placeholder="Electronic customs invoice notes, commercial ref..."
                    className="w-full p-2 border-[1.5px] border-[#e9edf2] rounded-xl text-xs font-semibold outline-none focus:border-[#0050d4] resize-none"
                  />
                </div>

                {/* Paperless Trade Badge */}
                <div className="flex items-center gap-2.5 p-3 bg-[#f8fafc] border border-[#e9edf2] rounded-xl">
                  <span className="material-symbols-outlined text-lg text-[#0050d4]">receipt_long</span>
                  <div className="text-[11px] text-[#575c60]">
                    <strong>📋 {isRTL ? 'التجارة اللاورقية مفعلة (PLT):' : 'Paperless Trade (PLT) Active:'}</strong> {isRTL ? 'يتم إرسال الفاتورة والبيانات الجمركية إلكترونياً مباشرة إلى منافذ الجمارك دون الحاجة للمستندات الورقية.' : 'Electronic invoice transmitted directly to customs without physical paperwork requirement.'}
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
                      <span className="text-[#8c9196] font-semibold">{isRTL ? 'القيمة المعلنة' : 'Declared Value'}</span>
                      <span className="font-bold text-[#1a1f23]">KWD {totalDeclaredValue.toFixed(3)}</span>
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
                    {insurancePremium > 0 && (
                      <div className="flex justify-between text-[#575c60]">
                        <span>Cargo Insurance (1%)</span>
                        <span className="font-mono">KWD {insurancePremium.toFixed(3)}</span>
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
                  disabled={submitting}
                  onClick={() => handleSubmit(false)}
                  className="flex items-center gap-1.5 px-6 py-2 bg-[#0050d4] text-white rounded-xl text-xs font-bold shadow-lg shadow-[#0050d4]/25 hover:bg-[#0040b0] transition-colors"
                >
                  {submitting ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                  )}
                  <span>
                    {mode === 'edit' 
                      ? (isRTL ? 'حفظ التعديلات' : 'Save Changes') 
                      : (isRTL ? 'تأكيد وإصدار البوليصة' : 'Confirm & Dispatch')}
                  </span>
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default TargetLogisticsWizard;
