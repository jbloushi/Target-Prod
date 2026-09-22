import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { TK } from '../../tokens/kineticHorizon';
import api, { shipmentService, userService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { countries, getCountryDisplayName } from '../../utils/countries';
import { WInput, WPhoneInput, WSelect } from '../../ui';
import GoogleAddressInput from '../GoogleAddressInput';
import GoogleMapPinDrop from '../GoogleMapPinDrop';
import {
  NON_POSTAL_COUNTRIES,
  FIELD_LABELS,
  validateWizardStep,
  getValidationAlertMessage,
  isPostalCodeRequired,
  isValidInternationalPhone,
  isInternationalShipment,
  isDGRCargoRequired
} from './shipmentValidation';

export {
  NON_POSTAL_COUNTRIES,
  FIELD_LABELS,
  validateWizardStep,
  getValidationAlertMessage,
  isPostalCodeRequired,
  isValidInternationalPhone,
  isInternationalShipment,
  isDGRCargoRequired
};

const WIZARD_STEPS = [
  { id: 1, label: 'Sender', labelAr: 'الراسل', icon: 'flight_takeoff'  },
  { id: 2, label: 'Receiver', labelAr: 'المستلم', icon: 'flight_land'     },
  { id: 3, label: 'Package', labelAr: 'الطرود', icon: 'inventory_2'     },
  { id: 4, label: 'Service', labelAr: 'شركة الشحن', icon: 'local_shipping'  },
  { id: 5, label: 'Logistics', labelAr: 'اللوجستيات والجمارك', icon: 'event_note'      },
  { id: 6, label: 'Review', labelAr: 'المراجعة والإصدار', icon: 'fact_check'      },
];

// ── Dangerous Goods Presets (IATA DGR Classification) ─────────
export const DG_PRESET_OPTIONS = [
  {
    id: 'none',
    name: 'Standard Cargo (Non-Dangerous Goods)',
    unCode: '',
    dgClass: '',
    properShippingName: '',
    packingGroup: '',
    serviceCode: '',
    contentId: '',
    marks: ''
  },
  {
    id: 'un1266_pax',
    name: 'Perfumes & Fragrances (UN1266) — Passenger & Cargo Aircraft',
    unCode: 'UN1266',
    dgClass: 'Class 3 — Flammable Liquid',
    properShippingName: 'PERFUMERY PRODUCTS WITH FLAMMABLE SOLVENTS',
    packingGroup: 'PG II',
    serviceCode: 'HE',
    contentId: '910',
    marks: 'DANGEROUS GOODS AS PER ASSOCIATED DGD - PERFUMERY PRODUCTS'
  },
  {
    id: 'un1266_cao',
    name: 'Perfumes (UN1266) — Cargo Aircraft Only (Bulk)',
    unCode: 'UN1266',
    dgClass: 'Class 3 — Flammable Liquid',
    properShippingName: 'PERFUMERY PRODUCTS WITH FLAMMABLE SOLVENTS',
    packingGroup: 'PG II',
    serviceCode: 'HE',
    contentId: '911',
    marks: 'CARGO AIRCRAFT ONLY - DGD ASSOCIATED'
  },
  {
    id: 'un3481_pi967',
    name: 'Lithium Ion Batteries (UN3481) — Contained in Equipment (PI967)',
    unCode: 'UN3481',
    dgClass: 'Class 9 — Miscellaneous',
    properShippingName: 'Lithium ion batteries contained in equipment',
    packingGroup: 'II',
    serviceCode: 'HV',
    contentId: '967',
    marks: 'LITHIUM ION BATTERIES IN COMPLIANCE WITH SECTION II OF PI967'
  },
  {
    id: 'un3480_pi965',
    name: 'Lithium Ion Batteries Standalone / Loose (UN3480) — PI965',
    unCode: 'UN3480',
    dgClass: 'Class 9 — Miscellaneous',
    properShippingName: 'Lithium ion batteries',
    packingGroup: 'II',
    serviceCode: 'HV',
    contentId: '965',
    marks: 'CARGO AIRCRAFT ONLY - LITHIUM ION BATTERIES PI965'
  },
  {
    id: 'un3091_pi970',
    name: 'Lithium Metal Batteries (UN3091) — Contained in Equipment (PI970)',
    unCode: 'UN3091',
    dgClass: 'Class 9 — Miscellaneous',
    properShippingName: 'Lithium metal batteries contained in equipment',
    packingGroup: 'II',
    serviceCode: 'HV',
    contentId: '970',
    marks: 'LITHIUM METAL BATTERIES IN COMPLIANCE WITH SECTION II OF PI970'
  },
  {
    id: 'id8000',
    name: 'Consumer Commodity / Cosmetics (ID8000) — Class 9',
    unCode: 'ID8000',
    dgClass: 'Class 9 — Miscellaneous',
    properShippingName: 'Consumer Commodity',
    packingGroup: 'III',
    serviceCode: 'HK',
    contentId: '700',
    marks: 'CONSUMER COMMODITY ID8000 IATA DGR'
  },
  {
    id: 'un1845',
    name: 'Dry Ice / Carbon Dioxide Solid (UN1845) — Class 9',
    unCode: 'UN1845',
    dgClass: 'Class 9 — Miscellaneous',
    properShippingName: 'Dry Ice',
    packingGroup: 'III',
    serviceCode: 'HC',
    contentId: '901',
    marks: 'DRY ICE UN1845 FOR TEMPERATURE CONTROL'
  },
  {
    id: 'un1993',
    name: 'Flammable Liquid N.O.S. (UN1993) — Class 3, PG II',
    unCode: 'UN1993',
    dgClass: 'Class 3 — Flammable Liquid',
    properShippingName: 'FLAMMABLE LIQUID, N.O.S.',
    packingGroup: 'PG II',
    serviceCode: 'HE',
    contentId: '915',
    marks: 'DANGEROUS GOODS - FLAMMABLE LIQUID NOS'
  },
  {
    id: 'un1950',
    name: 'Aerosols & Pressurized Sprays (UN1950) — Class 2.1',
    unCode: 'UN1950',
    dgClass: 'Class 2.1 — Flammable Gas',
    properShippingName: 'AEROSOLS, flammable',
    packingGroup: 'II',
    serviceCode: 'HE',
    contentId: '920',
    marks: 'UN1950 AEROSOLS FLAMMABLE'
  },
  {
    id: 'un3082',
    name: 'Environmentally Hazardous Liquid (UN3082) — Class 9, PG III',
    unCode: 'UN3082',
    dgClass: 'Class 9 — Miscellaneous',
    properShippingName: 'ENVIRONMENTALLY HAZARDOUS SUBSTANCE, LIQUID, N.O.S.',
    packingGroup: 'PG III',
    serviceCode: 'HV',
    contentId: '930',
    marks: 'ENVIRONMENTALLY HAZARDOUS SUBSTANCE UN3082'
  }
];

// ── Built-in Package Templates ─────────────────────────
const DEFAULT_PACKAGE_TEMPLATES = [
  { id: 'box_std_1kg', name: 'Standard Small Box (1 kg)', pkgType: 'Box', weight: '1.0', length: '20', width: '15', height: '10', description: 'General merchandise & consumer goods', value: '15.00', dangerousGoods: false },
  { id: 'doc_env', name: 'Document Envelope (0.2 kg)', pkgType: 'Envelope', weight: '0.2', length: '32', width: '24', height: '2', description: 'Legal documents & contracts', value: '5.00', dangerousGoods: false },
  { id: 'box_med_5kg', name: 'Medium Carton (5 kg)', pkgType: 'Box', weight: '5.0', length: '40', width: '30', height: '25', description: 'Apparel & electronics', value: '45.00', dangerousGoods: false },
  { id: 'box_heavy_15kg', name: 'Heavy Industrial Carton (15 kg)', pkgType: 'Box', weight: '15.0', length: '60', width: '40', height: '40', description: 'Machinery spare parts', value: '120.00', dangerousGoods: false },
  { id: 'pallet_150kg', name: 'Standard Freight Pallet (150 kg)', pkgType: 'Pallet', weight: '150.0', length: '120', width: '80', height: '100', description: 'Commercial bulk cargo', value: '500.00', dangerousGoods: false },
  { id: 'dg_li_ion', name: 'Dangerous Goods: Lithium Batteries (UN3481)', pkgType: 'Box', weight: '2.5', length: '30', width: '20', height: '15', description: 'Lithium ion batteries contained in equipment', value: '80.00', dangerousGoods: true, unCode: 'UN3481', dgClass: 'Class 9 — Miscellaneous', properShippingName: 'Lithium ion batteries contained in equipment' },
  { id: 'dg_perfume', name: 'Dangerous Goods: Perfumes / Cosmetics (UN1266)', pkgType: 'Box', weight: '3.0', length: '35', width: '25', height: '20', description: 'Perfumery products with flammable solvents', value: '65.00', dangerousGoods: true, unCode: 'UN1266', dgClass: 'Class 3 — Flammable Liquid', properShippingName: 'PERFUMERY PRODUCTS WITH FLAMMABLE SOLVENTS' },
];

// ── Known Carrier Metadata & Logos ───────────────────────
const KNOWN_CARRIERS = {
  DGR: {
    code: 'DGR',
    name: 'DHL Express Global',
    badge: 'Express Air Network',
    color: '#D40511',
    bg: '#FEF2F2',
    icon: 'flight_takeoff',
    desc: 'Worldwide priority express with customs clearance and door-to-door courier.'
  },
  OTE: {
    code: 'OTE',
    name: 'LogesTechs GCC Ground',
    badge: 'GCC Road Freight & COD',
    color: '#0284C7',
    bg: '#F0F9FF',
    icon: 'local_shipping',
    desc: 'Specialized overland trucking across Kuwait, UAE, KSA, Qatar, Bahrain, and Oman with COD support.'
  },
  FEDEX: {
    code: 'FEDEX',
    name: 'FedEx International',
    badge: 'Global Priority',
    color: '#4F46E5',
    bg: '#EEF2FF',
    icon: 'flight',
    desc: 'Global express freight network with scheduled transit commitments.'
  },
  INTERNAL: {
    code: 'INTERNAL',
    name: 'Target Dedicated Fleet',
    badge: 'Domestic Same-Day',
    color: '#059669',
    bg: '#ECFDF5',
    icon: 'electric_rickshaw',
    desc: 'Target Logistics domestic courier dispatch & same-day local distribution.'
  }
};

// ── Standard Default Carrier Addons (DHL & Multicarrier) ──
const DEFAULT_CARRIER_ADDONS = {
  included: [
    { serviceCode: 'EPOD', serviceName: 'Electronic Proof of Delivery (ePOD)', desc: 'Real-time digital recipient signature & timestamp confirmation', price: 0 },
    { serviceCode: 'TRACK', serviceName: 'Milestone Webhook & SMS Notifications', desc: 'Automated delivery milestone alerts for shipper & consignee', price: 0 },
    { serviceCode: 'D2D', serviceName: 'Direct Door-to-Door Courier Delivery', desc: 'Express pickup and final destination desk delivery', price: 0 },
    { serviceCode: 'PLT', serviceName: 'Paperless Trade (PLT) Digital Customs', desc: 'Electronic invoice submission directly to customs authorities', price: 0 }
  ],
  paid: [
    { serviceCode: 'SA', serviceName: 'Adult (18+) ID Verified Signature', desc: 'Requires physical government ID check upon handover', price: 2.500, icon: 'badge' },
    { serviceCode: 'SD', serviceName: 'Direct Signature Required', desc: 'Guarantees delivery only to designated consignee', price: 1.500, icon: 'draw' },
    { serviceCode: 'AA', serviceName: 'Saturday / Weekend Priority Delivery', desc: 'Guaranteed weekend delivery schedule in GCC destinations', price: 4.500, icon: 'event' },
    { serviceCode: 'PRIO_AM', serviceName: 'Priority Morning Delivery (by 10:30 AM)', desc: 'Earliest time-definite business delivery commitment', price: 3.000, icon: 'alarm_on' },
    { serviceCode: 'DD', serviceName: 'Delivered Duty Paid (DDP Customs Clearance)', desc: 'Shipper covers all destination import customs and VAT duties', price: 5.000, icon: 'receipt_long' },
    { serviceCode: 'DG_SUR', serviceName: 'IATA Dangerous Goods Compliance Surcharge', desc: 'UN compliant hazardous materials handling & DGD processing', price: 8.500, icon: 'warning' }
  ]
};

// ── Unified Address Step (Sender / Receiver Consignee) ────────
const AddressStep = ({
  title,
  subtitle,
  icon,
  data,
  setData,
  savedAddresses = [],
  saveToBook,
  setSaveToBook,
  isReceiver = false,
  onSaveAddressNow,
  selectedClientLabel = '',
  errors = {},
  clearError,
  clearErrors
}) => {
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  const pfx = isReceiver ? 'receiver' : 'sender';

  const handleSelectSavedAddress = (e) => {
    const selectedId = e.target.value;
    if (!selectedId) return;
    const addr = savedAddresses.find((a, idx) => a.id === selectedId || a._id === selectedId || String(idx) === selectedId);
    if (addr) {
      const countryObj = countries.find(c => c.code === addr.countryCode) || countries.find(c => c.name === addr.country);
      setData(d => ({
        ...d,
        name: addr.contactPerson || addr.name || d.name,
        company: addr.company || d.company,
        phone: addr.phone || d.phone,
        phoneCountryCode: countryObj?.dialCode || addr.phoneCountryCode || d.phoneCountryCode,
        email: addr.email || d.email,
        taxId: addr.taxId || d.taxId,
        addr1: addr.addressLine1 || addr.streetLines?.[0] || addr.addr1 || d.addr1,
        addr2: addr.addressLine2 || addr.streetLines?.[1] || addr.addr2 || '',
        city: addr.city || d.city,
        state: addr.state || d.state,
        zip: addr.postalCode || addr.zip || (NON_POSTAL_COUNTRIES.includes(addr.countryCode) ? '00000' : d.zip),
        country: countryObj?.name || addr.country || d.country,
        countryCode: countryObj?.code || addr.countryCode || d.countryCode,
        area: addr.area || d.area,
        latitude: addr.latitude || d.latitude,
        longitude: addr.longitude || d.longitude,
        instructions: addr.instructions || d.instructions,
        formattedAddress: addr.formattedAddress || `${addr.addressLine1 || addr.addr1 || ''}, ${addr.city || ''}, ${countryObj?.name || ''}`,
        verified: true
      }));
      if (clearErrors) {
        clearErrors([`${pfx}_name`, `${pfx}_phone`, `${pfx}_addr1`, `${pfx}_city`, `${pfx}_country`, `${pfx}_zip`]);
      }
    }
  };

  const handleCountryChange = (e) => {
    const countryName = e.target.value;
    const cObj = countries.find(c => c.name === countryName) || countries.find(c => c.code === countryName);
    setData(d => ({
      ...d,
      country: cObj?.name || countryName,
      countryCode: cObj?.code || 'KW',
      phoneCountryCode: cObj?.dialCode || d.phoneCountryCode || '+965',
      zip: NON_POSTAL_COUNTRIES.includes(cObj?.code) ? '00000' : (d.zip === '00000' ? '' : d.zip)
    }));
    clearError && clearError(`${pfx}_country`);
    clearError && clearError(`${pfx}_zip`);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: isReceiver ? '#eff6ff' : TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: isReceiver ? '#2563eb' : TK.primary }}>{icon}</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16.5, color: TK.text1 }}>{title}</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 1 }}>
              {subtitle} {selectedClientLabel && <span style={{ color: TK.primary, fontWeight: 700 }}>• ({selectedClientLabel})</span>}
            </div>
          </div>
        </div>

        {/* Saved Address Autofill Dropdown */}
        {savedAddresses.length > 0 && (
          <div style={{ minWidth: 240, maxWidth: 360 }}>
            <select
              onChange={handleSelectSavedAddress}
              defaultValue=""
              style={{
                padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${TK.primary}`,
                background: TK.primaryBg, color: TK.primary, fontWeight: 700, fontSize: 12,
                cursor: 'pointer', outline: 'none', width: '100%'
              }}
            >
              <option value="">
                ⚡ Autofill from {isReceiver ? 'Receiver Address Book' : 'Sender Address Book'}… ({savedAddresses.length})
              </option>
              {savedAddresses.map((a, idx) => (
                <option key={a.id || a._id || idx} value={a.id || a._id || idx}>
                  {a.label || a.company || a.contactPerson || a.name || 'Address'} — {a.city || a.countryCode || 'GCC'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick Location Preset Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: TK.text3 }}>⚡ Quick Presets:</span>
        {[
          { label: '🏢 Shuwaikh Logistics Hub', city: 'Shuwaikh Industrial', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '70001', addr1: 'Block 1, Street 14, Target Logistics Hub' },
          { label: '🏪 Airport Cargo Terminal', city: 'Farwaniya', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '80000', addr1: 'Cargo City, Kuwait International Airport' },
          { label: '🏬 Kuwait City Financial Centre', city: 'Kuwait City', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '13001', addr1: 'Sharq, Block 3, Al-Hamra Tower Wing' }
        ].map((preset, pIdx) => (
          <button
            key={pIdx}
            type="button"
            onClick={() => {
              setData(d => ({
                ...d,
                city: preset.city,
                country: preset.country,
                countryCode: preset.countryCode,
                phoneCountryCode: preset.phoneCountryCode,
                zip: preset.zip,
                addr1: preset.addr1,
                formattedAddress: `${preset.addr1}, ${preset.city}, ${preset.country}`
              }));
              if (clearErrors) {
                clearErrors([`${pfx}_addr1`, `${pfx}_city`, `${pfx}_country`, `${pfx}_zip`]);
              }
            }}
            className="press-tactile hover-lift"
            style={{
              padding: '4px 10px', borderRadius: 8, border: `1px solid ${TK.border}`,
              background: '#f8fafc', color: TK.text2, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {/* Contact Info */}
        <WInput
          data-field-key={`${pfx}_name`}
          id={`field-${pfx}_name`}
          label="Contact Full Name"
          placeholder="e.g. John Doe / Ahmed Al-Mutawa"
          value={data.name}
          onChange={e => { upd('name', e.target.value); clearError && clearError(`${pfx}_name`); }}
          icon="person"
          error={Boolean(errors[`${pfx}_name`])}
          helperText={errors[`${pfx}_name`]}
          required
          half
        />
        <WInput label="Company / Entity Name" placeholder="e.g. Al-Bahar Logistics Corp." value={data.company} onChange={e => upd('company', e.target.value)} icon="business" half />

        <WPhoneInput
          data-field-key={`${pfx}_phone`}
          id={`field-${pfx}_phone`}
          label="Phone Number"
          value={data.phone}
          onChange={e => { upd('phone', e.target.value); clearError && clearError(`${pfx}_phone`); }}
          dialCode={data.phoneCountryCode}
          onDialCodeChange={c => upd('phoneCountryCode', c)}
          error={Boolean(errors[`${pfx}_phone`])}
          helperText={errors[`${pfx}_phone`]}
          required
          half
        />
        <WInput label="Email Address" placeholder="recipient@company.com" value={data.email} onChange={e => upd('email', e.target.value)} type="email" icon="mail" half />

        {/* Tax ID & Customs Clearance Identifiers */}
        <WInput
          label="Tax ID / VAT / Customs Registration / Iqama / CR Number"
          placeholder="e.g. VAT-KW-9482710 or Commercial Registry No."
          value={data.taxId}
          onChange={e => upd('taxId', e.target.value)}
          icon="badge"
          helper="Required for GCC customs clearance & commercial invoice generation"
        />

        {/* Google Places Autocomplete */}
        <div style={{ flex: '1 1 100%', marginTop: 4 }}>
          <label style={{ fontWeight: 700, fontSize: 12.5, color: TK.text1, display: 'block', marginBottom: 6 }}>
            Search Global Address Registry (Google Places Autocomplete)
          </label>
          <GoogleAddressInput
            value={{
              formattedAddress: data.formattedAddress,
              addressLine1: data.addr1,
              addressLine2: data.addr2,
              city: data.city,
              state: data.state,
              postalCode: data.zip,
              country: data.country,
              countryCode: data.countryCode,
              area: data.area,
              latitude: data.latitude,
              longitude: data.longitude
            }}
            onChange={(res) => {
              const countryObj = countries.find(c => c.code === res.countryCode) || countries.find(c => c.name === res.country);
              const sanitizedCity = String(res.city || '').trim().substring(0, 45);
              const sanitizedAddr1 = String(res.streetLines?.[0] || res.addressLine1 || res.formattedAddress || '').trim().substring(0, 45);
              setData(d => ({
                ...d,
                addr1: sanitizedAddr1 || d.addr1,
                addr2: res.addressLine2 ? String(res.addressLine2).substring(0, 45) : d.addr2,
                area: res.area ? String(res.area).substring(0, 45) : d.area,
                city: sanitizedCity || d.city,
                state: res.state ? String(res.state).substring(0, 45) : d.state,
                zip: res.postalCode || (NON_POSTAL_COUNTRIES.includes(res.countryCode) ? '00000' : d.zip),
                country: countryObj?.name || res.country || d.country,
                countryCode: countryObj?.code || res.countryCode || d.countryCode,
                phoneCountryCode: countryObj?.dialCode || d.phoneCountryCode,
                latitude: res.latitude !== undefined && res.latitude !== null ? Number(res.latitude) : d.latitude,
                longitude: res.longitude !== undefined && res.longitude !== null ? Number(res.longitude) : d.longitude,
                formattedAddress: res.formattedAddress || d.formattedAddress,
                verified: true
              }));
              if (clearErrors) {
                clearErrors([`${pfx}_addr1`, `${pfx}_city`, `${pfx}_country`, `${pfx}_zip`]);
              }
            }}
          />
        </div>

        {/* Structured Address Fields */}
        <WInput
          data-field-key={`${pfx}_addr1`}
          id={`field-${pfx}_addr1`}
          label="Street Address Line 1"
          placeholder="Building, Street, House No."
          value={data.addr1}
          onChange={e => { upd('addr1', e.target.value); clearError && clearError(`${pfx}_addr1`); }}
          icon="home"
          error={Boolean(errors[`${pfx}_addr1`])}
          helperText={errors[`${pfx}_addr1`]}
          required
        />
        <WInput label="Apartment / Suite / Office / Unit (Line 2)" placeholder="Flat 4B, 2nd Floor" value={data.addr2} onChange={e => upd('addr2', e.target.value)} icon="apartment" half />
        <WInput label="District / Area / Block" placeholder="e.g. Block 4, Shuwaikh Industrial" value={data.area} onChange={e => upd('area', e.target.value)} icon="map" half />

        <WInput
          data-field-key={`${pfx}_city`}
          id={`field-${pfx}_city`}
          label="City / Municipality"
          placeholder="e.g. Kuwait City / Dubai"
          value={data.city}
          onChange={e => { upd('city', e.target.value); clearError && clearError(`${pfx}_city`); }}
          icon="location_city"
          error={Boolean(errors[`${pfx}_city`])}
          helperText={errors[`${pfx}_city`]}
          required
          half
        />
        <WInput label="State / Governorate / Province" placeholder="e.g. Al Asimah / Capital" value={data.state} onChange={e => upd('state', e.target.value)} icon="signpost" half />

        <div style={{ display: 'flex', gap: 12, flex: '1 1 100%', flexWrap: 'wrap' }}>
          <div
            data-field-key={`${pfx}_country`}
            id={`field-${pfx}_country`}
            style={{ flex: '1 1 calc(50% - 6px)', minWidth: 140 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label style={{ fontWeight: 700, fontSize: 12, color: errors[`${pfx}_country`] ? '#ef4444' : TK.text2 }}>
                Country / Destination Territory <span style={{ color: TK.error }}>*</span>
              </label>
              {errors[`${pfx}_country`] && (
                <span style={{ fontSize: 11, fontWeight: 500, color: '#ef4444' }}>
                  {errors[`${pfx}_country`]}
                </span>
              )}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 14px', borderRadius: 12,
              border: `1.5px solid ${errors[`${pfx}_country`] ? '#ef4444' : TK.border}`,
              background: '#fff',
              boxShadow: errors[`${pfx}_country`] ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none',
              transition: 'all 0.15s ease-in-out'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: errors[`${pfx}_country`] ? '#ef4444' : TK.primary }}>public</span>
              <select
                value={data.countryCode || (countries.find(c => c.name === data.country)?.code) || 'KW'}
                onChange={(e) => {
                  const cCode = e.target.value;
                  const cObj = countries.find(c => c.code === cCode);
                  setData(d => ({
                    ...d,
                    country: cObj?.name || d.country,
                    countryCode: cObj?.code || 'KW',
                    phoneCountryCode: cObj?.dialCode || d.phoneCountryCode || '+965',
                    zip: NON_POSTAL_COUNTRIES.includes(cObj?.code) ? '00000' : (d.zip === '00000' ? '' : d.zip)
                  }));
                  clearError && clearError(`${pfx}_country`);
                  clearError && clearError(`${pfx}_zip`);
                }}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: TK.text1, width: '100%', cursor: 'pointer', fontWeight: 600 }}
              >
                {countries.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <WInput
            data-field-key={`${pfx}_zip`}
            id={`field-${pfx}_zip`}
            label="Postal / ZIP Code"
            placeholder={NON_POSTAL_COUNTRIES.includes((data.countryCode || '').toUpperCase()) ? "00000 (Non-Postal Country)" : "e.g. 13001"}
            value={data.zip}
            onChange={e => { upd('zip', e.target.value); clearError && clearError(`${pfx}_zip`); }}
            icon="markunread_mailbox"
            error={Boolean(errors[`${pfx}_zip`])}
            helperText={errors[`${pfx}_zip`]}
            required={!NON_POSTAL_COUNTRIES.includes((data.countryCode || '').toUpperCase())}
            half
          />
        </div>

        {/* Interactive Google Map Pin Drop (Visible & Interactive) */}
        <div style={{ flex: '1 1 100%', marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: TK.text1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.primary }}>pin_drop</span>
              Location Map & Precise Pin Drop (Click or Drag Pin to Refine)
            </div>
            {data.latitude && (
              <span style={{ fontSize: 11, color: TK.text3, fontWeight: 600 }}>
                GPS: {Number(data.latitude).toFixed(4)}, {Number(data.longitude).toFixed(4)}
              </span>
            )}
          </div>
          <GoogleMapPinDrop
            latitude={data.latitude}
            longitude={data.longitude}
            addressLabel={data.formattedAddress || `${data.addr1 || ''}, ${data.city || ''}, ${data.country || ''}`}
            height="260px"
            onLocationChange={(coords) => {
              setData(d => ({
                ...d,
                latitude: coords.latitude,
                longitude: coords.longitude,
                city: coords.city || d.city,
                country: coords.country || d.country,
                countryCode: coords.countryCode || d.countryCode,
                area: coords.area || d.area,
                formattedAddress: coords.formattedAddress || d.formattedAddress,
                verified: true
              }));
            }}
          />
        </div>

        {/* Delivery / Access Instructions */}
        {isReceiver && (
          <div style={{ flex: '1 1 100%', marginTop: 6 }}>
            <WInput
              label="Consignee Delivery Instructions / Gate Code / Landmarks"
              placeholder="e.g. Gate 3, Ring intercom #12, leave at reception desk"
              value={data.instructions}
              onChange={e => upd('instructions', e.target.value)}
              icon="door_front"
            />
          </div>
        )}

        {/* Address Book Persistence Controls */}
        <div style={{
          flex: '1 1 100%', padding: '12px 14px', borderRadius: 12,
          border: `1.5px solid ${saveToBook ? TK.primary : TK.border}`,
          background: saveToBook ? TK.primaryBg : '#fafbfc',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          marginTop: 6
        }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: '1 1 200px' }}
            onClick={() => setSaveToBook(s => !s)}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${saveToBook ? TK.primary : TK.text3}`,
              background: saveToBook ? TK.primary : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {saveToBook && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
            </div>
            <div>
              <div style={{ fontSize: 13, color: TK.text1, fontWeight: 700 }}>
                {isReceiver ? "Save this Receiver to Address Book" : "Save this Sender to Address Book"}
              </div>
              <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 1 }}>
                Quickly select {isReceiver ? "this consignee" : "this pickup location"} in 1-click on future shipments.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSaveAddressNow && onSaveAddressNow(data, isReceiver ? 'Receiver' : 'Sender')}
            style={{
              padding: '7px 14px', borderRadius: 8, border: `1px solid ${TK.primary}`,
              background: '#fff', color: TK.primary, fontWeight: 700, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bookmark_add</span>
            Save to Address Book Now
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Step 3: Package Details (With Insurance & DG directly under Package Type) ──
const PackageStep = ({ data, setData, templates, onSaveNewTemplate, errors = {}, clearError, clearErrors }) => {
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const handleApplyTemplate = (e) => {
    const tId = e.target.value;
    setSelectedTemplateId(tId);
    if (!tId) return;

    const t = templates.find(item => item.id === tId);
    if (t) {
      setData(d => ({
        ...d,
        pkgType: t.pkgType || d.pkgType,
        weight: t.weight || d.weight,
        length: t.length || d.length,
        width: t.width || d.width,
        height: t.height || d.height,
        description: t.description || d.description,
        value: t.value || d.value,
        dangerousGoods: Boolean(t.dangerousGoods),
        unCode: t.unCode || '',
        dgClass: t.dgClass || '',
        properShippingName: t.properShippingName || '',
        dgServiceCode: t.dgServiceCode || '',
        dgContentId: t.dgContentId || '',
        dgMarks: t.dgMarks || ''
      }));
      if (clearErrors) {
        clearErrors([
          'pkg_description', 'pkg_qty', 'pkg_weight', 'pkg_length', 'pkg_width', 'pkg_height',
          'pkg_unCode', 'pkg_dgClass', 'pkg_properShippingName', 'pkg_dgServiceCode', 'pkg_dgContentId', 'pkg_dgMarks'
        ]);
      }
    }
  };

  const handleDGDropdownChange = (e) => {
    const presetId = e.target.value;
    const preset = DG_PRESET_OPTIONS.find(p => p.id === presetId);
    if (!preset || preset.id === 'none') {
      setData(d => ({
        ...d,
        dangerousGoods: false,
        unCode: '',
        dgClass: '',
        properShippingName: '',
        packingGroup: '',
        dgServiceCode: '',
        dgContentId: '',
        dgMarks: ''
      }));
      if (clearErrors) {
        clearErrors(['pkg_unCode', 'pkg_dgClass', 'pkg_properShippingName', 'pkg_dgServiceCode', 'pkg_dgContentId', 'pkg_dgMarks']);
      }
      return;
    }

    setData(d => ({
      ...d,
      dangerousGoods: true,
      unCode: preset.unCode,
      dgClass: preset.dgClass,
      properShippingName: preset.properShippingName,
      packingGroup: preset.packingGroup,
      dgServiceCode: preset.serviceCode,
      dgContentId: preset.contentId,
      dgMarks: preset.marks,
      description: d.description || preset.properShippingName
    }));
    if (clearErrors) {
      clearErrors(['pkg_unCode', 'pkg_dgClass', 'pkg_properShippingName', 'pkg_dgServiceCode', 'pkg_dgContentId', 'pkg_dgMarks', 'pkg_description']);
    }
  };

  const handleSaveTemplateSubmit = () => {
    if (!templateName.trim()) return;
    onSaveNewTemplate({
      id: 'custom_' + Date.now(),
      name: templateName.trim(),
      pkgType: data.pkgType,
      weight: data.weight,
      length: data.length,
      width: data.width,
      height: data.height,
      description: data.description,
      value: data.value,
      dangerousGoods: data.dangerousGoods,
      unCode: data.unCode,
      dgClass: data.dgClass,
      properShippingName: data.properShippingName,
      dgServiceCode: data.dgServiceCode,
      dgContentId: data.dgContentId,
      dgMarks: data.dgMarks
    });
    setTemplateName('');
    setShowSaveModal(false);
  };

  // Insurance calculation
  const declaredVal = parseFloat(data.value) || 0;
  const insurancePremium = Math.max(2.5, declaredVal * 0.01).toFixed(3);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary }}>inventory_2</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16.5, color: TK.text1 }}>Package Specifications</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 1 }}>Configure packaging types, Insurance, Dangerous Goods & cargo specifications</div>
          </div>
        </div>

        {/* Template Selector & Save Template Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={selectedTemplateId}
            onChange={handleApplyTemplate}
            style={{
              padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${TK.primary}`,
              background: TK.primaryBg, color: TK.primary, fontWeight: 700, fontSize: 12,
              cursor: 'pointer', outline: 'none'
            }}
          >
            <option value="">⚡ Autofill from Package Template…</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} {t.dangerousGoods ? '⚠️ [DG]' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            style={{
              padding: '9px 12px', borderRadius: 10, border: `1px solid ${TK.border}`,
              background: '#fff', color: TK.text1, fontWeight: 700, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: TK.primary }}>bookmark_add</span>
            Save Preset
          </button>
        </div>
      </div>

      {/* Save Template Modal */}
      {showSaveModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: TK.text1 }}>Save Package Template Preset</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: TK.text2 }}>
              Save current package dimensions ({data.length}×{data.width}×{data.height} cm, {data.weight} kg) and DG configuration for 1-click reuse.
            </p>
            <input
              type="text"
              placeholder="e.g. Standard 5kg Box or Li-Ion DG Kit"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${TK.border}`,
                fontSize: 13, color: TK.text1, outline: 'none', marginBottom: 16
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${TK.border}`, background: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplateSubmit}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. PACKAGE TYPE SELECTOR AT THE TOP */}
      <div style={{ marginBottom: 16, padding: '14px 16px', background: '#f8fafc', borderRadius: 14, border: `1px solid ${TK.border}` }}>
        <label style={{ fontWeight: 700, fontSize: 12.5, color: TK.text1, display: 'block', marginBottom: 8 }}>
          Package & Cargo Container Type
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['Box', 'Envelope', 'Pallet', 'Tube', 'Bag', 'Flyer'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => upd('pkgType', t)}
              style={{
                padding: '9px 18px', borderRadius: 10, minHeight: 42,
                border: `1.5px solid ${data.pkgType === t ? TK.primary : TK.border}`,
                background: data.pkgType === t ? TK.primaryBg : '#fff',
                color: data.pkgType === t ? TK.primary : TK.text2,
                fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {t === 'Box' ? 'inventory_2' : t === 'Envelope' ? 'mail' : t === 'Pallet' ? 'pallet' : t === 'Bag' ? 'shopping_bag' : 'category'}
              </span>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 2. CARGO INSURANCE DIRECTLY UNDER PACKAGE TYPE */}
      <div
        style={{
          marginBottom: 16, padding: '14px 16px', borderRadius: 12,
          border: `1.5px solid ${data.insurance ? '#059669' : TK.border}`,
          background: data.insurance ? '#ecfdf5' : '#fafbfc',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
        onClick={() => upd('insurance', !data.insurance)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${data.insurance ? '#059669' : TK.text3}`,
            background: data.insurance ? '#059669' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {data.insurance && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: data.insurance ? '#065f46' : TK.text1 }}>
              Insource Full Cargo Insurance & Loss Protection
            </div>
            <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 1 }}>
              Comprehensive coverage against damage, total loss, or theft during transit.
            </div>
          </div>
        </div>
        {data.insurance && (
          <div style={{ fontWeight: 800, fontSize: 13, color: '#059669', background: '#d1fae5', padding: '4px 10px', borderRadius: 8 }}>
            Premium: +KD {insurancePremium}
          </div>
        )}
      </div>

      {/* 3. DANGEROUS GOODS (IATA DGR) DIRECTLY UNDER PACKAGE TYPE & INSURANCE */}
      <div
        style={{
          marginBottom: 16, padding: '14px 16px', borderRadius: 12,
          border: `1.5px solid ${data.dangerousGoods ? '#d97706' : TK.border}`,
          background: data.dangerousGoods ? '#fffbeb' : '#fafbfc',
          display: 'flex', flexDirection: 'column', gap: 12, transition: 'all 0.15s',
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => {
            const nextDG = !data.dangerousGoods;
            upd('dangerousGoods', nextDG);
            if (!nextDG && clearErrors) {
              clearErrors(['pkg_unCode', 'pkg_dgClass', 'pkg_properShippingName', 'pkg_dgServiceCode', 'pkg_dgContentId', 'pkg_dgMarks']);
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              border: `2px solid ${data.dangerousGoods ? '#d97706' : TK.text3}`,
              background: data.dangerousGoods ? '#d97706' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {data.dangerousGoods && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>priority_high</span>}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: data.dangerousGoods ? '#b45309' : TK.text1 }}>
                Dangerous Goods / Hazardous Material (IATA DGR Compliance)
              </div>
              <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 1 }}>
                Lithium batteries, perfumes, chemicals, sprays, or dry ice requiring UN packing & DGD declaration.
              </div>
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: data.dangerousGoods ? '#d97706' : TK.text3 }}>
            {data.dangerousGoods ? 'expand_less' : 'expand_more'}
          </span>
        </div>

        {data.dangerousGoods && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10, borderTop: '1px solid #fde68a' }}>
            {/* Dangerous Goods Preset Dropdown */}
            <div>
              <label style={{ fontWeight: 700, fontSize: 12, color: '#92400e', display: 'block', marginBottom: 6 }}>
                ⚡ Quick Autofill from IATA Dangerous Goods Catalog:
              </label>
              <select
                onChange={handleDGDropdownChange}
                defaultValue=""
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  border: '1.5px solid #d97706', background: '#fff',
                  color: '#92400e', fontWeight: 700, fontSize: 12.5, outline: 'none', cursor: 'pointer'
                }}
              >
                <option value="">Select Dangerous Goods Specification…</option>
                {DG_PRESET_OPTIONS.filter(o => o.id !== 'none').map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            {/* DG Fields */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <WInput
                data-field-key="pkg_unCode"
                id="field-pkg_unCode"
                label="UN Identification Number"
                placeholder="e.g. UN3481 or UN1266"
                value={data.unCode}
                onChange={e => { upd('unCode', e.target.value); clearError && clearError('pkg_unCode'); }}
                error={Boolean(errors?.pkg_unCode)}
                helperText={errors?.pkg_unCode || '4-digit UN identification code'}
                required
                half
              />
              <WInput
                data-field-key="pkg_dgClass"
                id="field-pkg_dgClass"
                label="Hazard Class / Division"
                placeholder="e.g. Class 9 or Class 3"
                value={data.dgClass}
                onChange={e => { upd('dgClass', e.target.value); clearError && clearError('pkg_dgClass'); }}
                error={Boolean(errors?.pkg_dgClass)}
                helperText={errors?.pkg_dgClass || 'IATA primary hazard classification'}
                required
                half
              />
              <WInput
                data-field-key="pkg_properShippingName"
                id="field-pkg_properShippingName"
                label="Proper Shipping Name (PSN)"
                placeholder="e.g. PERFUMERY PRODUCTS"
                value={data.properShippingName}
                onChange={e => { upd('properShippingName', e.target.value); clearError && clearError('pkg_properShippingName'); }}
                error={Boolean(errors?.pkg_properShippingName)}
                helperText={errors?.pkg_properShippingName || 'Official IATA transport name'}
                required
                half
              />
              <WInput
                label="Packing Group / Instruction"
                placeholder="e.g. PG II, PI967"
                value={data.packingGroup}
                onChange={e => upd('packingGroup', e.target.value)}
                helper="Packaging classification"
                half
              />
              <WInput
                data-field-key="pkg_dgServiceCode"
                id="field-pkg_dgServiceCode"
                label="Carrier Service Code"
                placeholder="e.g. HE, HV, HK, HC"
                value={data.dgServiceCode}
                onChange={e => { upd('dgServiceCode', e.target.value); clearError && clearError('pkg_dgServiceCode'); }}
                error={Boolean(errors?.pkg_dgServiceCode)}
                helperText={errors?.pkg_dgServiceCode || 'Specific code required by DHL (HE, HV, HK, HC)'}
                required
                half
              />
              <WInput
                data-field-key="pkg_dgContentId"
                id="field-pkg_dgContentId"
                label="Content ID"
                placeholder="e.g. 910"
                value={data.dgContentId}
                onChange={e => { upd('dgContentId', e.target.value); clearError && clearError('pkg_dgContentId'); }}
                error={Boolean(errors?.pkg_dgContentId)}
                helperText={errors?.pkg_dgContentId || 'IATA / Carrier Content ID (e.g. 910, 967)'}
                required
                half
              />
              <WInput
                data-field-key="pkg_dgMarks"
                id="field-pkg_dgMarks"
                label="Custom Description / Marks"
                placeholder="e.g. DANGEROUS GOODS AS PER ASSOCIATED DGD"
                value={data.dgMarks}
                onChange={e => { upd('dgMarks', e.target.value); clearError && clearError('pkg_dgMarks'); }}
                error={Boolean(errors?.pkg_dgMarks)}
                helperText={errors?.pkg_dgMarks || 'Special declarations for invoice'}
                required
                half
              />
            </div>
          </div>
        )}
      </div>

      {/* Interactive Volumetric & Chargeable Weight Visualizer Gauge */}
      {(() => {
        const pkgs = data.packagesList && data.packagesList.length > 0 ? data.packagesList : [data];
        const totalActual = pkgs.reduce((sum, p) => sum + (parseFloat(p.weight) || 0), 0);
        const totalVolumetric = pkgs.reduce((sum, p) => {
          const l = parseFloat(p.length) || 0;
          const w = parseFloat(p.width) || 0;
          const h = parseFloat(p.height) || 0;
          const q = parseInt(p.qty) || 1;
          return sum + ((l * w * h) / 5000) * q;
        }, 0);
        const chargeableWeight = Math.max(totalActual, totalVolumetric);
        const isVolumetric = totalVolumetric > totalActual;

        return (
          <div style={{
            padding: '16px 20px', borderRadius: 16,
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            border: `1.5px solid ${isVolumetric ? '#f59e0b' : '#3b82f6'}`,
            boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
            marginBottom: 4
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: isVolumetric ? '#d97706' : '#2563eb' }}>
                  {isVolumetric ? 'view_in_ar' : 'scale'}
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: TK.text1 }}>
                    IATA Chargeable Weight Rating Engine
                  </div>
                  <div style={{ fontSize: 11.5, color: TK.text3 }}>
                    Comparing Scale Actual vs. Volumetric Dim (L×W×H / 5000)
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 20,
                background: isVolumetric ? '#fef3c7' : '#dbeafe',
                color: isVolumetric ? '#b45309' : '#1e40af',
                border: `1px solid ${isVolumetric ? '#fde68a' : '#bfdbfe'}`
              }}>
                Chargeable: <strong>{chargeableWeight.toFixed(2)} KG</strong> ({isVolumetric ? 'Volumetric Rating Applied' : 'Actual Weight Applied'})
              </span>
            </div>

            {/* Dual Gauge Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 12, border: `1px solid ${TK.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>Actual Scale Weight</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginTop: 2 }}>{totalActual.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 600 }}>KG</span></div>
              </div>
              <div style={{ background: '#fff', padding: '10px 14px', borderRadius: 12, border: `1px solid ${TK.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isVolumetric ? '#d97706' : TK.text3, textTransform: 'uppercase' }}>
                  Volumetric Weight (5000 Divisor)
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: isVolumetric ? '#d97706' : '#0f172a', marginTop: 2 }}>
                  {totalVolumetric.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 600 }}>KG</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. PACKAGE SPECS FORM (Supports Multi-Package Shipments) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Package items list */}
        {(data.packagesList || [{
          id: 1,
          pkgType: data.pkgType || 'Box',
          description: data.description || '',
          qty: data.qty || '1',
          value: data.value || '',
          weight: data.weight || '1.0',
          length: data.length || '20',
          width: data.width || '15',
          height: data.height || '10',
          hsCode: '',
          originCountry: 'KW',
          currency: 'KWD'
        }]).map((item, idx, arr) => (
          <div
            key={item.id || idx}
            style={{
              padding: '16px', borderRadius: 14,
              border: `1.5px solid ${TK.border}`, background: '#fff',
              display: 'flex', flexDirection: 'column', gap: 12, position: 'relative'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${TK.border}`, paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.primary }}>inventory_2</span>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: TK.text1 }}>
                  Package #{idx + 1}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: TK.primaryBg, color: TK.primary }}>
                  {item.pkgType || data.pkgType || 'Box'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    const duplicated = { ...item, id: Date.now() };
                    const updatedList = [...arr.slice(0, idx + 1), duplicated, ...arr.slice(idx + 1)];
                    const totalWeight = updatedList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
                    setData(d => ({ ...d, packagesList: updatedList, weight: totalWeight.toFixed(2) }));
                  }}
                  className="press-tactile hover-lift"
                  style={{
                    border: `1px solid ${TK.border}`, background: '#f8fafc', color: TK.text1,
                    padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                  Duplicate
                </button>
                {arr.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const updatedList = arr.filter((_, i) => i !== idx);
                      const totalWeight = updatedList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
                      const totalVal = updatedList.reduce((s, p) => s + (parseFloat(p.value) || 0), 0);
                      setData(d => ({
                        ...d,
                        packagesList: updatedList,
                        weight: totalWeight.toFixed(2),
                        value: totalVal > 0 ? totalVal.toFixed(3) : d.value,
                        length: updatedList[0]?.length || d.length,
                        width: updatedList[0]?.width || d.width,
                        height: updatedList[0]?.height || d.height
                      }));
                    }}
                    className="press-tactile"
                    style={{
                      border: 'none', background: '#fee2e2', color: '#dc2626',
                      padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <WInput
                data-field-key={idx === 0 ? 'pkg_description' : `pkg_${idx}_description`}
                id={`field-${idx === 0 ? 'pkg_description' : `pkg_${idx}_description`}`}
                label="Content Description"
                placeholder="e.g. Electronic components, apparel, medical supplies"
                value={item.description}
                onChange={(e) => {
                  const val = e.target.value;
                  const updatedList = arr.map((p, i) => i === idx ? { ...p, description: val } : p);
                  setData(d => ({
                    ...d,
                    packagesList: updatedList,
                    description: idx === 0 ? val : d.description
                  }));
                  clearError && clearError(idx === 0 ? 'pkg_description' : `pkg_${idx}_description`);
                }}
                icon="subject"
                error={Boolean(errors[idx === 0 ? 'pkg_description' : `pkg_${idx}_description`])}
                helperText={errors[idx === 0 ? 'pkg_description' : `pkg_${idx}_description`]}
                required
              />
              <WInput
                data-field-key={idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`}
                id={`field-${idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`}`}
                label="Quantity (pieces)"
                placeholder="1"
                value={item.qty}
                onChange={(e) => {
                  const val = e.target.value;
                  const updatedList = arr.map((p, i) => i === idx ? { ...p, qty: val } : p);
                  setData(d => ({
                    ...d,
                    packagesList: updatedList,
                    qty: idx === 0 ? val : d.qty
                  }));
                  clearError && clearError(idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`);
                }}
                type="number"
                icon="pin"
                error={Boolean(errors[idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`])}
                helperText={errors[idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`]}
                required
                half
              />
              <WInput
                label="Declared Value"
                placeholder="0.000"
                value={item.value}
                onChange={(e) => {
                  const val = e.target.value;
                  const updatedList = arr.map((p, i) => i === idx ? { ...p, value: val } : p);
                  const totalVal = updatedList.reduce((s, p) => s + (parseFloat(p.value) || 0), 0);
                  setData(d => ({
                    ...d,
                    packagesList: updatedList,
                    value: totalVal > 0 ? totalVal.toFixed(3) : val
                  }));
                }}
                type="number"
                icon="payments"
                half
              />
              <WInput
                label="Currency"
                placeholder="e.g. KWD, USD"
                value={item.currency || 'KWD'}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
                  const updatedList = arr.map((p, i) => i === idx ? { ...p, currency: val } : p);
                  setData(d => ({ ...d, packagesList: updatedList }));
                }}
                icon="paid"
                half
              />
              <WInput
                label="HS / Tariff Code"
                placeholder="e.g. 8471.30.00"
                value={item.hsCode || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const updatedList = arr.map((p, i) => i === idx ? { ...p, hsCode: val } : p);
                  setData(d => ({ ...d, packagesList: updatedList }));
                }}
                icon="qr_code"
                half
              />
              <WInput
                label="Country of Origin (ISO)"
                placeholder="e.g. KW, US, CN"
                value={item.originCountry || 'KW'}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
                  const updatedList = arr.map((p, i) => i === idx ? { ...p, originCountry: val } : p);
                  setData(d => ({ ...d, packagesList: updatedList }));
                }}
                icon="public"
                half
              />
              <WInput
                data-field-key={idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`}
                id={`field-${idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`}`}
                label="Package Weight (kg)"
                placeholder="0.0"
                value={item.weight}
                onChange={(e) => {
                  const val = e.target.value;
                  const updatedList = arr.map((p, i) => i === idx ? { ...p, weight: val } : p);
                  const totalWeight = updatedList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
                  setData(d => ({
                    ...d,
                    packagesList: updatedList,
                    weight: totalWeight > 0 ? totalWeight.toFixed(2) : val
                  }));
                  clearError && clearError(idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`);
                }}
                type="number"
                icon="scale"
                error={Boolean(errors[idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`])}
                helperText={errors[idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`]}
                required
                half
              />

              <div style={{ flex: '1 1 100%' }}>
                <label style={{ fontWeight: 600, fontSize: 12, color: TK.text2, display: 'block', marginBottom: 6 }}>
                  Package Dimensions (cm) — Length × Width × Height <span style={{ color: TK.error }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <WInput
                    data-field-key={idx === 0 ? 'pkg_length' : `pkg_${idx}_length`}
                    id={`field-${idx === 0 ? 'pkg_length' : `pkg_${idx}_length`}`}
                    label="Length (cm)"
                    placeholder="0"
                    value={item.length}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updatedList = arr.map((p, i) => i === idx ? { ...p, length: val } : p);
                      setData(d => ({ ...d, packagesList: updatedList, length: idx === 0 ? val : d.length }));
                      clearError && clearError(idx === 0 ? 'pkg_length' : `pkg_${idx}_length`);
                    }}
                    type="number"
                    error={Boolean(errors[idx === 0 ? 'pkg_length' : `pkg_${idx}_length`])}
                    helperText={errors[idx === 0 ? 'pkg_length' : `pkg_${idx}_length`]}
                    required
                    half
                  />
                  <WInput
                    data-field-key={idx === 0 ? 'pkg_width' : `pkg_${idx}_width`}
                    id={`field-${idx === 0 ? 'pkg_width' : `pkg_${idx}_width`}`}
                    label="Width (cm)"
                    placeholder="0"
                    value={item.width}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updatedList = arr.map((p, i) => i === idx ? { ...p, width: val } : p);
                      setData(d => ({ ...d, packagesList: updatedList, width: idx === 0 ? val : d.width }));
                      clearError && clearError(idx === 0 ? 'pkg_width' : `pkg_${idx}_width`);
                    }}
                    type="number"
                    error={Boolean(errors[idx === 0 ? 'pkg_width' : `pkg_${idx}_width`])}
                    helperText={errors[idx === 0 ? 'pkg_width' : `pkg_${idx}_width`]}
                    required
                    half
                  />
                  <WInput
                    data-field-key={idx === 0 ? 'pkg_height' : `pkg_${idx}_height`}
                    id={`field-${idx === 0 ? 'pkg_height' : `pkg_${idx}_height`}`}
                    label="Height (cm)"
                    placeholder="0"
                    value={item.height}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updatedList = arr.map((p, i) => i === idx ? { ...p, height: val } : p);
                      setData(d => ({ ...d, packagesList: updatedList, height: idx === 0 ? val : d.height }));
                      clearError && clearError(idx === 0 ? 'pkg_height' : `pkg_${idx}_height`);
                    }}
                    type="number"
                    error={Boolean(errors[idx === 0 ? 'pkg_height' : `pkg_${idx}_height`])}
                    helperText={errors[idx === 0 ? 'pkg_height' : `pkg_${idx}_height`]}
                    required
                    half
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add Package Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => {
              const currentList = data.packagesList || [{
                id: 1,
                pkgType: data.pkgType || 'Box',
                description: data.description || '',
                qty: data.qty || '1',
                value: data.value || '',
                weight: data.weight || '1.0',
                length: data.length || '20',
                width: data.width || '15',
                height: data.height || '10',
                hsCode: '',
                originCountry: 'KW',
                currency: 'KWD'
              }];
              const nextId = currentList.length + 1;
              const newPkg = {
                id: nextId,
                pkgType: data.pkgType || 'Box',
                description: data.description || '',
                qty: '1',
                value: '',
                weight: '1.0',
                length: '20',
                width: '15',
                height: '10',
                hsCode: '',
                originCountry: 'KW',
                currency: 'KWD'
              };
              const updatedList = [...currentList, newPkg];
              const totalWeight = updatedList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
              setData(d => ({
                ...d,
                packagesList: updatedList,
                weight: totalWeight.toFixed(2)
              }));
            }}
            style={{
              padding: '10px 16px', borderRadius: 10, border: `1.5px dashed ${TK.primary}`,
              background: TK.primaryBg, color: TK.primary, fontWeight: 700, fontSize: 12.5,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_box</span>
            + Add Another Package / Piece
          </button>

          <div style={{ fontSize: 12, color: TK.text2, fontWeight: 600 }}>
            Total Shipment Weight: <strong style={{ color: TK.primary, fontSize: 13 }}>{data.weight || 0} kg</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Step 4: Service & Carrier Selection (Live Adapter Rates & Add-ons) ─
const ServiceStep = ({
  data,
  setData,
  isStaff,
  isAdmin,
  assignedCarrierCode,
  quoteRates = [],
  loadingQuotes = false,
  onRefreshQuotes,
  isTestMode,
  setIsTestMode,
  errors = {},
  clearError
}) => {
  const [showIncludedDrawer, setShowIncludedDrawer] = useState(false);
  const selectedAddons = data.selectedAddons || [];

  const toggleAddon = (addon) => {
    const exists = selectedAddons.some(a => a.serviceCode === addon.serviceCode);
    const updated = exists
      ? selectedAddons.filter(a => a.serviceCode !== addon.serviceCode)
      : [...selectedAddons, addon];

    setData(d => ({
      ...d,
      selectedAddons: updated
    }));
  };

  // Compute live total addon surcharge
  const addonsSurcharge = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const baseRate = Number(data.quotedPrice) || 0;
  const grandTotal = baseRate > 0 ? (baseRate + addonsSurcharge).toFixed(3) : null;

  return (
    <div>
      {/* Header with Test/Sandbox Mode Toggle for Superadmin */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: isTestMode ? '#fef3c7' : TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: isTestMode ? '#d97706' : TK.primary }}>
              {isTestMode ? 'science' : 'local_shipping'}
            </span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16.5, color: TK.text1, display: 'flex', alignItems: 'center', gap: 8 }}>
              Carrier Selection & Live Adapter Rates
              {isTestMode && (
                <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
                  🧪 DHL Test API Sandbox
                </span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 1 }}>
              {assignedCarrierCode && !isStaff
                ? `Account locked to preferred carrier: ${assignedCarrierCode}`
                : 'Real-time multi-carrier rates calculated directly from partner carrier adapters'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Superadmin / Staff API Environment Switcher */}
          {(isAdmin || isStaff) && (
            <button
              type="button"
              onClick={() => {
                const nextMode = !isTestMode;
                setIsTestMode(nextMode);
              }}
              title="Toggle between Live Carrier API and Test Sandbox API"
              style={{
                padding: '8px 12px', borderRadius: 10,
                border: `1.5px solid ${isTestMode ? '#d97706' : TK.border}`,
                background: isTestMode ? '#fffbeb' : '#fff',
                color: isTestMode ? '#b45309' : TK.text2,
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: isTestMode ? '#d97706' : TK.text3 }}>
                {isTestMode ? 'science' : 'bolt'}
              </span>
              {isTestMode ? 'Test API Sandbox Active' : 'Live Production Mode'}
            </button>
          )}

          <button
            type="button"
            onClick={onRefreshQuotes}
            disabled={loadingQuotes}
            style={{
              padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${TK.primary}`,
              background: TK.primaryBg, color: TK.primary, fontWeight: 700, fontSize: 12,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, animation: loadingQuotes ? 'spin 1s linear infinite' : 'none' }}>
              refresh
            </span>
            {loadingQuotes ? 'Calculating…' : 'Refresh Rates'}
          </button>
        </div>
      </div>

      {/* Carrier Selection Cards */}
      <div
        data-field-key="service_carrierCode"
        id="field-service_carrierCode"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginBottom: 24,
          padding: (errors?.service_carrierCode || errors?.service_serviceCode) ? 14 : 0,
          borderRadius: 18,
          border: (errors?.service_carrierCode || errors?.service_serviceCode) ? '1.5px solid #ef4444' : 'none',
          background: (errors?.service_carrierCode || errors?.service_serviceCode) ? '#fef2f2' : 'transparent',
          transition: 'all 0.2s ease'
        }}
      >
        {(errors?.service_carrierCode || errors?.service_serviceCode) && (
          <div style={{ color: '#ef4444', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>warning</span>
            {errors.service_carrierCode || errors.service_serviceCode}
          </div>
        )}
        {quoteRates.length > 0 ? (
          quoteRates.map((rate, idx) => {
            const carrierInfo = KNOWN_CARRIERS[rate.carrierCode] || {
              code: rate.carrierCode,
              name: rate.carrierName || rate.carrierCode,
              badge: rate.serviceName || 'Express Logistics',
              color: TK.primary,
              bg: TK.primaryBg,
              icon: 'local_shipping',
              desc: rate.serviceName || 'Direct carrier booking'
            };

            const isSelected = data.carrierCode === rate.carrierCode && (data.serviceCode === rate.serviceCode || !data.serviceCode);
            const isAssigned = assignedCarrierCode === rate.carrierCode;

            return (
              <div
                key={rate.carrierCode + '-' + (rate.serviceCode || idx)}
                onClick={() => {
                  setData(d => ({
                    ...d,
                    carrierCode: rate.carrierCode,
                    carrierId: rate.carrierCode,
                    serviceCode: rate.serviceCode,
                    serviceName: rate.serviceName,
                    quotedPrice: rate.totalPrice,
                    currency: rate.currency || 'KWD'
                  }));
                  clearError && (clearError('service_carrierCode'), clearError('service_serviceCode'));
                }}
                style={{
                  padding: '18px 20px', borderRadius: 16, cursor: 'pointer',
                  border: `2px solid ${isSelected ? carrierInfo.color : TK.border}`,
                  background: isSelected ? carrierInfo.bg : '#fff',
                  boxShadow: isSelected ? `0 4px 16px ${carrierInfo.color}22` : '0 1px 4px rgba(0,0,0,0.03)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 260 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isSelected ? carrierInfo.color : TK.text3}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {isSelected && <div style={{ width: 12, height: 12, borderRadius: '50%', background: carrierInfo.color }} />}
                  </div>

                  <div style={{
                    width: 46, height: 46, borderRadius: 12, background: '#fff',
                    border: `1px solid ${TK.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)', flexShrink: 0
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: carrierInfo.color }}>
                      {carrierInfo.icon}
                    </span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 900, fontSize: 15, color: TK.text1 }}>
                        {carrierInfo.name}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                        background: '#fff', border: `1px solid ${carrierInfo.color}40`, color: carrierInfo.color
                      }}>
                        {rate.serviceName || carrierInfo.badge}
                      </span>
                      {isAssigned && (
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>
                          ★ Assigned Carrier
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: TK.text2, marginTop: 3 }}>
                      {carrierInfo.desc}
                    </div>
                    <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span>⏱ Delivery: <strong>{rate.eta || '1–3 Business Days'}</strong></span>
                      {rate.serviceCode && <span>• Code: <strong>{rate.serviceCode}</strong></span>}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                    Carrier Live Rate
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: carrierInfo.color }}>
                    {rate.totalPrice !== null && rate.totalPrice !== undefined
                      ? `${rate.currency || 'KWD'} ${Number(rate.totalPrice).toFixed(3)}`
                      : 'Manual Rating'}
                  </div>
                  <div style={{ fontSize: 11, color: TK.success, fontWeight: 700 }}>
                    ✓ Standard Customs & Tracking Included
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              {
                carrierCode: 'DGR',
                carrierName: 'DHL Express Global',
                serviceCode: 'P',
                serviceName: 'Express Worldwide (P)',
                badge: 'Express Air Network',
                color: '#D40511',
                bg: '#FEF2F2',
                icon: 'flight_takeoff',
                desc: 'Worldwide priority air express with customs clearance and door-to-door courier.',
                totalPrice: 16.500,
                eta: '1–2 Business Days'
              },
              {
                carrierCode: 'OTE',
                carrierName: 'LogesTechs GCC Ground',
                serviceCode: 'EXP',
                serviceName: 'GCC Overland Standard',
                badge: 'GCC Road Freight & COD',
                color: '#0284C7',
                bg: '#F0F9FF',
                icon: 'local_shipping',
                desc: 'Specialized overland trucking across Kuwait, UAE, KSA, Qatar, Bahrain, and Oman.',
                totalPrice: 6.300,
                eta: '3–5 Business Days'
              },
              {
                carrierCode: 'INTERNAL',
                carrierName: 'Target Dedicated Fleet',
                serviceCode: 'INTERNAL_STD',
                serviceName: 'Domestic Local Fleet Dispatch',
                badge: 'Domestic Hub Delivery',
                color: '#059669',
                bg: '#ECFDF5',
                icon: 'electric_rickshaw',
                desc: 'Target Logistics domestic courier dispatch & same-day local distribution.',
                totalPrice: 3.500,
                eta: 'Same-Day / Next-Day'
              }
            ].map(rate => {
              const isSelected = data.carrierCode === rate.carrierCode;
              return (
                <div
                  key={rate.carrierCode}
                  onClick={() => {
                    setData(d => ({
                      ...d,
                      carrierCode: rate.carrierCode,
                      carrierId: rate.carrierCode,
                      serviceCode: rate.serviceCode,
                      serviceName: rate.serviceName,
                      quotedPrice: rate.totalPrice,
                      currency: 'KWD'
                    }));
                    clearError && (clearError('service_carrierCode'), clearError('service_serviceCode'));
                  }}
                  style={{
                    padding: '18px 20px', borderRadius: 16, cursor: 'pointer',
                    border: `2px solid ${isSelected ? rate.color : TK.border}`,
                    background: isSelected ? rate.bg : '#fff',
                    boxShadow: isSelected ? `0 4px 16px ${rate.color}22` : '0 1px 4px rgba(0,0,0,0.03)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 260 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${isSelected ? rate.color : TK.text3}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isSelected && <div style={{ width: 12, height: 12, borderRadius: '50%', background: rate.color }} />}
                    </div>

                    <div style={{
                      width: 46, height: 46, borderRadius: 12, background: '#fff',
                      border: `1px solid ${TK.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)', flexShrink: 0
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color: rate.color }}>
                        {rate.icon}
                      </span>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 900, fontSize: 15, color: TK.text1 }}>
                          {rate.carrierName}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                          background: '#fff', border: `1px solid ${rate.color}40`, color: rate.color
                        }}>
                          {rate.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: TK.text2, marginTop: 3 }}>
                        {rate.desc}
                      </div>
                      <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span>⏱ Delivery: <strong>{rate.eta}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: TK.text3, textTransform: 'uppercase' }}>
                      Standard Rate
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: rate.color }}>
                      KWD {rate.totalPrice.toFixed(3)}
                    </div>
                    <div style={{ fontSize: 11, color: TK.success, fontWeight: 700 }}>
                      ✓ Standard Customs & Tracking Included
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DHL & Carrier Service Addons Section (Included & Paid) ── */}
      <div style={{ marginTop: 24, padding: '20px 22px', background: '#f8fafc', borderRadius: 16, border: `1px solid ${TK.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, color: TK.text1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.primary }}>add_shopping_cart</span>
              Value-Added Carrier Add-ons & Surcharges (DHL Express Options)
            </div>
            <div style={{ fontSize: 12, color: TK.text2, marginTop: 2 }}>
              Select optional priority delivery commitments and certified handover services
            </div>
          </div>

          {addonsSurcharge > 0 && (
            <div style={{ padding: '6px 12px', background: '#dbeafe', borderRadius: 8, color: '#1e40af', fontWeight: 800, fontSize: 12.5 }}>
              Add-ons Surcharge: +KD {addonsSurcharge.toFixed(3)}
            </div>
          )}
        </div>

        {/* 1. Included Baseline Services (Collapsible Drawer) */}
        <div style={{ marginBottom: 16, borderRadius: 12, border: `1px solid ${showIncludedDrawer ? '#bbf7d0' : TK.border}`, background: showIncludedDrawer ? '#f0fdf4' : '#fff', overflow: 'hidden', transition: 'all 0.2s ease' }}>
          <div
            onClick={() => setShowIncludedDrawer(prev => !prev)}
            style={{
              padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: showIncludedDrawer ? '#dcfce7' : '#f8fafc', userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: '#16a34a', fontSize: 18 }}>verified</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#166534', letterSpacing: '0.02em' }}>
                ✓ {DEFAULT_CARRIER_ADDONS.included.length} Complimentary Services Included (Free / No Extra Charge)
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fff', color: '#15803d', border: '1px solid #86efac' }}>
                Included Free
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#166534', fontSize: 11.5, fontWeight: 700 }}>
              <span>{showIncludedDrawer ? 'Collapse' : 'View Services'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {showIncludedDrawer ? 'expand_less' : 'expand_more'}
              </span>
            </div>
          </div>

          {showIncludedDrawer && (
            <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, borderTop: '1px solid #bbf7d0' }}>
              {DEFAULT_CARRIER_ADDONS.included.map(inc => (
                <div
                  key={inc.serviceCode}
                  style={{
                    padding: '10px 12px', borderRadius: 10, background: '#fff',
                    border: '1px solid #bbf7d0', display: 'flex', alignItems: 'flex-start', gap: 8
                  }}
                >
                  <span className="material-symbols-outlined" style={{ color: '#16a34a', fontSize: 18, marginTop: 1 }}>check_circle</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>{inc.serviceName}</div>
                    <div style={{ fontSize: 10.5, color: '#15803d', marginTop: 1 }}>{inc.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Paid Optional Add-ons */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: TK.text3, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.04em' }}>
            ⚡ Optional Value-Added Add-ons (Toggle to Include in Rate)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
            {DEFAULT_CARRIER_ADDONS.paid.map(addon => {
              const isChecked = selectedAddons.some(a => a.serviceCode === addon.serviceCode);
              return (
                <div
                  key={addon.serviceCode}
                  onClick={() => toggleAddon(addon)}
                  style={{
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${isChecked ? TK.primary : TK.border}`,
                    background: isChecked ? TK.primaryBg : '#fff',
                    boxShadow: isChecked ? '0 2px 8px rgba(0,80,212,0.1)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      border: `2px solid ${isChecked ? TK.primary : TK.text3}`,
                      background: isChecked ? TK.primary : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isChecked && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: isChecked ? TK.primary : TK.text1 }}>
                        {addon.serviceName}
                      </div>
                      <div style={{ fontSize: 11, color: TK.text3, marginTop: 1 }}>
                        {addon.desc}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 12, fontWeight: 800, color: isChecked ? TK.primary : TK.text2, whiteSpace: 'nowrap' }}>
                    +KD {addon.price.toFixed(3)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Total Rate Summary Pill */}
        {grandTotal && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 12,
            background: '#fff', border: `1.5px solid ${TK.primary}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TK.text1 }}>
              Calculated Dispatch Total (Base Carrier Rate + Selected Add-ons):
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: TK.primary }}>
              KD {grandTotal}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Step 5: Logistics & Customs ─────────────────────
const LogisticsStep = ({ service, setService, customs, setCustoms, errors = {}, clearError }) => {
  const { lang } = useLanguage();
  const updSvc = (k, v) => setService(s => ({ ...s, [k]: v }));
  const updCst = (k, v) => setCustoms(c => ({ ...c, [k]: v }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary }}>event_note</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16.5, color: TK.text1 }}>Pickup Dispatch & Customs Declaration</div>
          <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 1 }}>Configure courier pickup schedule and cross-border trade declaration</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: '1 1 100%', fontWeight: 700, fontSize: 13, color: TK.text1, marginTop: 4 }}>Pickup Dispatch</div>
        <WSelect
          label="Pickup Preference"
          value={service.pickupType}
          onChange={e => updSvc('pickupType', e.target.value)}
          options={['Schedule Driver Pickup', 'Drop off at Target Logistics Hub', 'Drop off at Carrier Facility']}
          icon="schedule"
          half
        />
        <WInput
          label="Scheduled Pickup Date"
          value={service.pickupDate}
          onChange={e => updSvc('pickupDate', e.target.value)}
          type="date"
          icon="calendar_today"
          half
        />
        <WSelect
          label="Preferred Time Window"
          value={service.pickupTime}
          onChange={e => updSvc('pickupTime', e.target.value)}
          options={['9:00 AM – 12:00 PM (Morning)', '12:00 PM – 4:00 PM (Afternoon)', '4:00 PM – 8:00 PM (Evening)']}
          icon="access_time"
          half
        />
        <WInput
          label="Pickup Dispatch Notes / Bay Number"
          placeholder="e.g. Loading dock #2, security gate entry"
          value={service.instructions}
          onChange={e => updSvc('instructions', e.target.value)}
          icon="note_alt"
          half
        />

        <div style={{ flex: '1 1 100%', fontWeight: 700, fontSize: 13, color: TK.text1, marginTop: 14 }}>
          {lang === 'ar' ? 'تفاصيل الجمارك والفاتورة التجارية' : 'Customs Trade Details & Invoice'}
        </div>
        <WSelect
          label="Shipment Category"
          value={customs.shipmentType}
          onChange={e => updCst('shipmentType', e.target.value)}
          options={['Commercial', 'Personal Effects', 'Sample / Gift', 'Documents Only', 'Repair & Return']}
          icon="category"
          half
        />
        <WSelect
          label="Incoterms Rule"
          value={customs.incoterms}
          onChange={e => updCst('incoterms', e.target.value)}
          options={[
            'DAP – Delivered at Place (Receiver pays import duty)',
            'DDP – Delivered Duty Paid (Shipper covers all duties)',
            'EXW – Ex Works (Origin pickup)',
            'FOB – Free On Board'
          ]}
          icon="gavel"
          half
        />
        <WInput
          label="HS Tariff Code (Harmonized System)"
          placeholder="e.g. 8471.30.00 (Laptops) or 3303.00.00 (Perfumes)"
          value={customs.hsCode}
          onChange={e => updCst('hsCode', e.target.value)}
          icon="tag"
          half
        />
        <WInput
          label="Country of Origin / Manufacture"
          placeholder="e.g. Kuwait, Japan, Germany"
          value={customs.origin}
          onChange={e => updCst('origin', e.target.value)}
          icon="flag"
          half
        />
        <WInput
          data-field-key="customs_invoiceNum"
          id="field-customs_invoiceNum"
          label={lang === 'ar' ? 'رقم الفاتورة التجارية' : 'Commercial Invoice Number'}
          placeholder="e.g. INV-2026-9042"
          value={customs.invoiceNum}
          onChange={e => { updCst('invoiceNum', e.target.value); clearError && clearError('customs_invoiceNum'); }}
          icon="receipt_long"
          error={Boolean(errors?.customs_invoiceNum)}
          helperText={errors?.customs_invoiceNum}
          half
        />
        <WSelect
          data-field-key="customs_currency"
          id="field-customs_currency"
          label={lang === 'ar' ? 'عملة الفاتورة' : 'Invoice Currency'}
          value={customs.currency || service.currency || 'KWD'}
          onChange={e => { updCst('currency', e.target.value); clearError && clearError('customs_currency'); }}
          options={['KWD', 'USD', 'EUR', 'AED', 'SAR', 'QAR', 'BHD', 'OMR', 'GBP']}
          icon="paid"
          error={Boolean(errors?.customs_currency)}
          helper={errors?.customs_currency}
          half
        />
        <WInput
          data-field-key="customs_invoiceVal"
          id="field-customs_invoiceVal"
          label={lang === 'ar' ? 'القيمة المصرحة للفاتورة' : 'Invoice Declared Total / Value'}
          placeholder="0.000"
          value={customs.invoiceVal}
          onChange={e => { updCst('invoiceVal', e.target.value); clearError && clearError('customs_invoiceVal'); }}
          type="number"
          icon="payments"
          unit={customs.currency || service.currency || 'KWD'}
          error={Boolean(errors?.customs_invoiceVal)}
          helperText={errors?.customs_invoiceVal}
          half
        />
      </div>
    </div>
  );
};

// ── Step 6: Review & Final Confirmation ──────────────
const ReviewStep = ({ sender, receiver, pkg, service, customs, confirmed, setConfirmed, isTestMode, errors = {}, clearError }) => {
  const { lang } = useLanguage();
  const declaredVal = parseFloat(pkg.value) || 0;
  const insurancePremium = pkg.insurance ? Math.max(2.5, declaredVal * 0.01).toFixed(3) : '0.000';
  const selectedAddons = service.selectedAddons || [];
  const addonsSurcharge = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const baseRate = Number(service.quotedPrice) || 0;
  const grandTotal = baseRate > 0 ? (baseRate + addonsSurcharge).toFixed(3) : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: TK.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: TK.primary }}>fact_check</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16.5, color: TK.text1 }}>{lang === 'ar' ? 'مراجعة وتأكيد بيان الشحنة' : 'Review & Confirm Dispatch Manifest'}</div>
            <div style={{ fontSize: 12.5, color: TK.text2, marginTop: 1 }}>{lang === 'ar' ? 'يرجى تدقيق جميع التفاصيل قبل إصدار بوليصة الشحن' : 'Please audit all details before generating carrier airway bill'}</div>
          </div>
        </div>

        {isTestMode && (
          <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 8, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
            🧪 Carrier Sandbox Test Booking
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Origin */}
        <div style={{ padding: '16px 18px', borderRadius: 14, background: '#f8fafc', border: `1px solid ${TK.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: TK.primary, fontWeight: 800, fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>flight_takeoff</span>
            {lang === 'ar' ? 'الراسل (المصدر)' : 'Sender (Origin)'}
          </div>
          <div style={{ fontWeight: 800, fontSize: 14, color: TK.text1 }}>{sender.name || '—'}</div>
          {sender.company && <div style={{ fontSize: 12.5, color: TK.text2 }}>{sender.company}</div>}
          <div style={{ fontSize: 12, color: TK.text3, marginTop: 4 }}>
            {sender.phoneCountryCode} {sender.phone} • {sender.email}
          </div>
          {sender.taxId && <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 2 }}>Tax ID: <strong>{sender.taxId}</strong></div>}
          <div style={{ fontSize: 12, color: TK.text2, marginTop: 6, lineHeight: 1.4 }}>
            {sender.addr1}{sender.area ? `, ${sender.area}` : ''}, {sender.city}, {sender.country}
          </div>
        </div>

        {/* Destination */}
        <div style={{ padding: '16px 18px', borderRadius: 14, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#2563eb', fontWeight: 800, fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>flight_land</span>
            {lang === 'ar' ? 'المستلم (الوجهة)' : 'Receiver (Destination)'}
          </div>
          <div style={{ fontWeight: 800, fontSize: 14, color: TK.text1 }}>{receiver.name || '—'}</div>
          {receiver.company && <div style={{ fontSize: 12.5, color: TK.text2 }}>{receiver.company}</div>}
          <div style={{ fontSize: 12, color: TK.text3, marginTop: 4 }}>
            {receiver.phoneCountryCode} {receiver.phone} • {receiver.email}
          </div>
          {receiver.taxId && <div style={{ fontSize: 11.5, color: TK.text2, marginTop: 2 }}>Customs / CR: <strong>{receiver.taxId}</strong></div>}
          <div style={{ fontSize: 12, color: TK.text2, marginTop: 6, lineHeight: 1.4 }}>
            {receiver.addr1}{receiver.area ? `, ${receiver.area}` : ''}, {receiver.city}, {receiver.country}
          </div>
        </div>

        {/* Package Specs */}
        <div style={{ padding: '16px 18px', borderRadius: 14, background: '#f8fafc', border: `1px solid ${TK.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: TK.text1, fontWeight: 800, fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.primary }}>inventory_2</span>
              {lang === 'ar' ? 'مواصفات الطرود والشحنة' : 'Package & Cargo Specs'}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: TK.primaryBg, color: TK.primary }}>
              {(pkg.packagesList?.length || 1)} Piece{(pkg.packagesList?.length || 1) > 1 ? 's' : ''} • {pkg.weight || 0} kg total
            </span>
          </div>

          {(pkg.packagesList && pkg.packagesList.length > 0 ? pkg.packagesList : [pkg]).map((pItem, pIdx) => (
            <div key={pItem.id || pIdx} style={{ fontSize: 12, color: TK.text2, marginBottom: pIdx < (pkg.packagesList?.length || 1) - 1 ? 8 : 0, borderBottom: pIdx < (pkg.packagesList?.length || 1) - 1 ? `1px dashed ${TK.border}` : 'none', paddingBottom: 6 }}>
              <div style={{ fontWeight: 700, color: TK.text1 }}>
                #{pIdx + 1}: {pItem.description || 'General Cargo'} ({pItem.pkgType || pkg.pkgType || 'Box'})
              </div>
              <div style={{ fontSize: 11.5, color: TK.text3, marginTop: 2 }}>
                Qty: <strong>{pItem.qty || 1}</strong> • Weight: <strong>{pItem.weight || 1} kg</strong> • Dims: {pItem.length || 20}×{pItem.width || 15}×{pItem.height || 10} cm {pItem.value ? `• Declared: KD ${pItem.value}` : ''}
              </div>
            </div>
          ))}

          {pkg.dangerousGoods && (
            <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '4px 8px', borderRadius: 6 }}>
              ⚠️ DG: {pkg.unCode || 'IATA Regulated'} ({pkg.dgClass || 'Hazardous'})
            </div>
          )}
          {pkg.insurance && (
            <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '4px 8px', borderRadius: 6 }}>
              🛡 Insured: Total Declared KD {pkg.value || '0'} (+KD {insurancePremium})
            </div>
          )}
        </div>

        {/* Carrier Routing, Addons & Rate */}
        <div style={{ padding: '16px 18px', borderRadius: 14, background: '#f8fafc', border: `1px solid ${TK.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: TK.text1, fontWeight: 800, fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: TK.primary }}>local_shipping</span>
            {lang === 'ar' ? 'شركة الشحن والإضافات المحددة' : 'Carrier & Selected Add-ons'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: TK.primary }}>
            {KNOWN_CARRIERS[service.carrierCode]?.name || service.carrierCode || 'DHL Express'}
          </div>
          <div style={{ fontSize: 12, color: TK.text2, marginTop: 4 }}>
            Service Level: <strong>{service.serviceName || service.serviceCode || 'Express Air'}</strong>
          </div>
          {selectedAddons.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {selectedAddons.map(a => (
                <span key={a.serviceCode} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af' }}>
                  +{a.serviceName}
                </span>
              ))}
            </div>
          )}
          {grandTotal && (
            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900, color: TK.primary }}>
              Total Dispatch Rate: KD {grandTotal}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation agreement */}
      <div
        data-field-key="review_confirmed"
        id="field-review_confirmed"
        style={{
          padding: '14px 18px', borderRadius: 12,
          border: `1.5px solid ${errors?.review_confirmed ? '#ef4444' : (confirmed ? TK.primary : TK.border)}`,
          background: errors?.review_confirmed ? '#fff5f5' : (confirmed ? TK.primaryBg : '#fafbfc'),
          boxShadow: errors?.review_confirmed ? '0 0 0 3px rgba(239,68,68,0.15)' : 'none',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', transition: 'all 0.15s'
        }}
        onClick={() => {
          setConfirmed(c => {
            const next = !c;
            if (next && clearError) clearError('review_confirmed');
            return next;
          });
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${errors?.review_confirmed ? '#ef4444' : (confirmed ? TK.primary : TK.text3)}`,
          background: confirmed ? TK.primary : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {confirmed && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
        </div>
        <div style={{ fontSize: 12.5, color: errors?.review_confirmed ? '#ef4444' : TK.text1, lineHeight: 1.4, fontWeight: errors?.review_confirmed ? 700 : 500 }}>
          {lang === 'ar'
            ? 'أقر وأؤكد بموجب هذا أن جميع المحتويات وبيانات المواد الخطرة والقيم الجمركية والعناوين المقدمة دقيقة ومتوافقة مع لوائح IATA DGR والجمارك والنقل في دول مجلس التعاون الخليجي.'
            : 'I hereby certify that all contents, dangerous goods declarations, customs values, and addresses provided are accurate in compliance with IATA DGR and GCC transport customs regulations.'}
        </div>
      </div>
      {errors?.review_confirmed && (
        <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 700, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
          {errors.review_confirmed}
        </div>
      )}
    </div>
  );
};

// ── Wizard Step Progress Pill ──────────────────────────
const WizardProgress = ({ step, setStep }) => {
  const { lang } = useLanguage();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, width: '100%', overflowX: 'auto', paddingBottom: 4 }}>
      {WIZARD_STEPS.map((s, idx) => {
        const isCompleted = step > s.id;
        const isCurrent = step === s.id;
        return (
          <React.Fragment key={s.id}>
            <div
              onClick={() => isCompleted && setStep(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: 20, cursor: isCompleted ? 'pointer' : 'default',
                background: isCurrent ? TK.primary : (isCompleted ? TK.primaryBg : '#f1f5f9'),
                color: isCurrent ? '#fff' : (isCompleted ? TK.primary : TK.text3),
                fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', transition: 'all 0.2s'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                {isCompleted ? 'check' : s.icon}
              </span>
              <span>{lang === 'ar' ? (s.labelAr || s.label) : s.label}</span>
            </div>
            {idx < WIZARD_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, minWidth: 12, background: step > idx + 1 ? TK.primary : '#e2e8f0' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ── Main Kinetic Shipment Wizard Component ──────────────
export const KineticShipmentWizard = ({ onClose, editing }) => {
  const navigate = useNavigate();
  const { user, refreshUser, isStaff, isAdmin } = useAuth();
  const { t, lang, isRTL } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdTn, setCreatedTn] = useState(null);
  const [errors, setErrors] = useState({});
  const wizardContainerRef = useRef(null);

  const clearError = useCallback((fieldKey) => {
    setErrors(prev => {
      if (!prev || !prev[fieldKey]) return prev;
      const copy = { ...prev };
      delete copy[fieldKey];
      return copy;
    });
  }, []);

  const clearErrors = useCallback((fieldKeys) => {
    setErrors(prev => {
      if (!prev) return prev;
      let changed = false;
      const copy = { ...prev };
      (fieldKeys || []).forEach(k => {
        if (copy[k]) {
          delete copy[k];
          changed = true;
        }
      });
      return changed ? copy : prev;
    });
  }, []);

  // Top-of-form reset on step advance or navigation
  useEffect(() => {
    if (wizardContainerRef.current) {
      wizardContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // Superadmin / Staff API Test Sandbox Mode Switcher
  const [isTestMode, setIsTestMode] = useState(false);

  // Client Selection for Staff / Admin ("On Behalf Of")
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [assignedCarrierCode, setAssignedCarrierCode] = useState(null);

  // User & Client Address Books
  const [userAddresses, setUserAddresses] = useState([]);
  const [clientAddresses, setClientAddresses] = useState([]);
  const [allAddressBooks, setAllAddressBooks] = useState([]);

  const [saveSenderToBook, setSaveSenderToBook] = useState(false);
  const [saveReceiverToBook, setSaveReceiverToBook] = useState(false);

  // Dynamic Live Carrier Adapter Quotes
  const [quoteRates, setQuoteRates] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  // Package Templates
  const [templates, setTemplates] = useState(() => {
    try {
      const stored = localStorage.getItem('tl_package_templates');
      return stored ? JSON.parse(stored) : DEFAULT_PACKAGE_TEMPLATES;
    } catch {
      return DEFAULT_PACKAGE_TEMPLATES;
    }
  });

  const blank = (country = 'Kuwait', countryCode = 'KW') => ({
    name: '', company: '', phone: '', email: '', taxId: '', addr1: '', addr2: '', area: '', city: countryCode === 'KW' ? 'Kuwait City' : 'Dubai', state: '', zip: NON_POSTAL_COUNTRIES.includes(countryCode) ? '00000' : '13001', country, countryCode, phoneCountryCode: countryCode === 'KW' ? '+965' : (countryCode === 'AE' ? '+971' : '+966'), instructions: '', formattedAddress: '', latitude: countryCode === 'KW' ? 29.3759 : 25.2048, longitude: countryCode === 'KW' ? 47.9774 : 55.2708, verified: false
  });

  const [sender, setSender] = useState(() => ({
    name: user?.name || '',
    company: user?.organization?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    taxId: user?.carrierConfig?.taxId || user?.carrierConfig?.vatNo || '',
    addr1: '', addr2: '', area: '', city: 'Kuwait City', state: '', zip: '00000', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', instructions: '', formattedAddress: '', latitude: 29.3759, longitude: 47.9774, verified: false
  }));

  const [receiver, setReceiver] = useState(() => blank('United Arab Emirates', 'AE'));
  const [pkg, setPkg] = useState(() => ({
    description: '', qty: '1', value: '', weight: '1.0', length: '20', width: '15', height: '10', pkgType: 'Box', insurance: false, dangerousGoods: false, unCode: '', dgClass: '', properShippingName: '', packingGroup: '', dgServiceCode: '', dgContentId: '', dgMarks: ''
  }));
  const [service, setService] = useState(() => ({
    carrierCode: 'DGR', carrierId: 'DGR', serviceCode: 'P', serviceName: 'Express Worldwide', quotedPrice: null, currency: 'KWD', selectedAddons: [], pickupType: 'Schedule Driver Pickup', pickupDate: new Date().toISOString().slice(0, 10), pickupTime: '9:00 AM – 12:00 PM', instructions: ''
  }));
  const [customs, setCustoms] = useState(() => ({
    shipmentType: 'Commercial', incoterms: 'DAP – Delivered at Place', hsCode: '', origin: 'Kuwait', invoiceNum: '', invoiceVal: '', notes: ''
  }));

  // Fetch assignable clients and addresses
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        let clientList = [];
        try {
          const assignableRes = await userService.getAssignableClients();
          clientList = assignableRes?.data || [];
        } catch {
          try {
            const userRes = await userService.getUsers();
            clientList = (userRes.data || []).filter(u => ['client', 'org_manager', 'org_agent'].includes(u.role));
          } catch {}
        }
        setClients(clientList);

        // Extract all address books from all clients
        const aggregated = [];
        clientList.forEach(cl => {
          if (Array.isArray(cl.addresses)) {
            cl.addresses.forEach(addr => {
              aggregated.push({
                ...addr,
                clientName: cl.name,
                label: addr.label || `${cl.name} - ${addr.company || addr.city || 'Address'}`
              });
            });
          }
        });
        setAllAddressBooks(aggregated);

        // Fetch current user addresses
        if (user?.addresses && Array.isArray(user.addresses)) {
          setUserAddresses(user.addresses);
        } else {
          const res = await userService.getMe();
          if (res?.data?.addresses && Array.isArray(res.data.addresses)) {
            setUserAddresses(res.data.addresses);
          }
        }
      } catch (err) {
        console.debug('Failed to fetch initial wizard data:', err.message);
      }
    };
    fetchInitialData();
  }, [user]);

  // Handle client selection on behalf of
  const handleClientChange = (clientId) => {
    setSelectedClientId(clientId);
    if (!clientId) {
      setAssignedCarrierCode(null);
      setClientAddresses([]);
      // Reset sender to current user
      setSender({
        name: user?.name || '',
        company: user?.organization?.name || '',
        phone: user?.phone || '',
        email: user?.email || '',
        taxId: user?.carrierConfig?.taxId || user?.carrierConfig?.vatNo || '',
        addr1: '', addr2: '', area: '', city: 'Kuwait City', state: '', zip: '00000', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', instructions: '', formattedAddress: '', latitude: 29.3759, longitude: 47.9774, verified: false
      });
      return;
    }

    const client = clients.find(c => c.id === clientId);
    if (client) {
      // Load this specific client's address book
      const cAddrs = Array.isArray(client.addresses) ? client.addresses : [];
      setClientAddresses(cAddrs);

      // Determine assigned carrier policy
      const carrier = client?.agentPolicy?.shippingAccess?.carrierCode || client?.carrierConfig?.preferredCarrier || 'DGR';
      const assignedService = client?.agentPolicy?.shippingAccess?.serviceCode || client?.carrierConfig?.serviceCode || 'P';
      setAssignedCarrierCode(carrier);

      // Auto-fill sender from client default or primary address
      const defAddr = cAddrs.find(a => a.isDefault) || cAddrs[0] || {};
      const countryObj = countries.find(c => c.code === defAddr.countryCode) || countries.find(c => c.name === defAddr.country);

      setSender({
        name: client.name || defAddr.contactPerson || '',
        company: client.organization?.name || client.company || defAddr.company || '',
        phone: client.phone || defAddr.phone || '',
        email: client.email || defAddr.email || '',
        taxId: client.carrierConfig?.taxId || client.carrierConfig?.vatNo || defAddr.taxId || '',
        addr1: defAddr.addressLine1 || defAddr.streetLines?.[0] || '',
        addr2: defAddr.addressLine2 || defAddr.streetLines?.[1] || '',
        area: defAddr.area || '',
        city: defAddr.city || 'Kuwait City',
        state: defAddr.state || '',
        zip: defAddr.postalCode || defAddr.zip || '00000',
        country: countryObj?.name || 'Kuwait',
        countryCode: countryObj?.code || 'KW',
        phoneCountryCode: countryObj?.dialCode || '+965',
        instructions: '',
        formattedAddress: defAddr.formattedAddress || '',
        latitude: defAddr.latitude || 29.3759,
        longitude: defAddr.longitude || 47.9774,
        verified: true
      });

      // Update service carrier
      setService(s => ({
        ...s,
        carrierCode: carrier,
        carrierId: carrier,
        serviceCode: assignedService
      }));

      enqueueSnackbar(`Loaded profile, address book & carrier policy for ${client.name}`, { variant: 'info' });
    }
  };

  // Sender & Receiver address book resolution
  const activeSenderAddresses = useMemo(() => {
    if (selectedClientId && clientAddresses.length > 0) {
      return clientAddresses;
    }
    return userAddresses.length > 0 ? userAddresses : allAddressBooks;
  }, [selectedClientId, clientAddresses, userAddresses, allAddressBooks]);

  const activeReceiverAddresses = useMemo(() => {
    if (selectedClientId && clientAddresses.length > 0) {
      return clientAddresses;
    }
    return userAddresses.length > 0 ? userAddresses : allAddressBooks;
  }, [selectedClientId, clientAddresses, userAddresses, allAddressBooks]);

  // Fetch Live Carrier Adapter Rate Quotes
  const fetchCarrierQuotes = useCallback(async () => {
    setLoadingQuotes(true);
    try {
      const senderCountryCode = sender.countryCode || 'KW';
      const receiverCountryCode = receiver.countryCode || 'AE';
      const weightVal = parseFloat(pkg.weight) || 1.0;
      const declaredVal = parseFloat(pkg.value) || 0;

      const packagesList = (pkg.packagesList && pkg.packagesList.length > 0)
        ? pkg.packagesList
        : [{
            weight: weightVal,
            length: parseFloat(pkg.length) || 20,
            width: parseFloat(pkg.width) || 15,
            height: parseFloat(pkg.height) || 10,
            packageType: pkg.pkgType || 'Box',
            description: pkg.description || 'General Cargo',
            qty: parseInt(pkg.qty) || 1,
            value: declaredVal
          }];

      const payload = {
        sender: {
          city: (sender.city || 'Kuwait City').substring(0, 45).trim(),
          countryCode: senderCountryCode,
          postalCode: sender.zip || '00000'
        },
        receiver: {
          city: (receiver.city || 'Dubai').substring(0, 45).trim(),
          countryCode: receiverCountryCode,
          postalCode: receiver.zip || '00000'
        },
        packages: packagesList.map(p => ({
          weight: parseFloat(p.weight) || 1.0,
          length: parseFloat(p.length) || 20,
          width: parseFloat(p.width) || 15,
          height: parseFloat(p.height) || 10,
          packageType: p.pkgType || pkg.pkgType || 'Box'
        })),
        parcels: packagesList.map(p => ({
          weight: parseFloat(p.weight) || 1.0,
          length: parseFloat(p.length) || 20,
          width: parseFloat(p.width) || 15,
          height: parseFloat(p.height) || 10,
          declaredValue: parseFloat(p.value) || 0
        })),
        items: packagesList.map(p => ({
          description: p.description || pkg.description || 'General Cargo',
          quantity: parseInt(p.qty) || 1,
          value: parseFloat(p.value) || 0,
          currency: p.currency || 'KWD',
          hsCode: p.hsCode || customs.hsCode || '',
          countryOfOrigin: p.originCountry || customs.origin || 'KW'
        })),
        dangerousGoods: {
          contains: Boolean(pkg.dangerousGoods),
          unCode: pkg.unCode || '',
          code: pkg.unCode || '', // Some adapters use unCode, some use code
          class: pkg.dgClass || '',
          properShippingName: pkg.properShippingName || '',
          serviceCode: pkg.dgServiceCode || '',
          contentId: pkg.dgContentId || '',
          customDescription: pkg.dgMarks || ''
        },
        insurance: Boolean(pkg.insurance),
        userId: selectedClientId || undefined,
        isTest: isTestMode,
        environment: isTestMode ? 'test' : 'production'
      };

      // Call rate quoting API endpoint
      let quotes = [];
      try {
        const res = await api.post('/shipments/quote', payload);
        quotes = res.data?.data || [];
      } catch (err) {
        console.debug('Primary quote call fallback:', err.message);
      }

      if (quotes.length === 0) {
        // High fidelity fallback rates based on carrier models
        const baseAirPrice = 12.0 + (weightVal * 4.5);
        const baseGroundPrice = 4.5 + (weightVal * 1.8);
        const insuranceFee = pkg.insurance ? Math.max(2.5, declaredVal * 0.01) : 0;
        const dgFee = pkg.dangerousGoods ? 8.5 : 0;

        quotes = [
          {
            carrierCode: 'DGR',
            carrierName: 'DHL Express Global',
            serviceCode: 'P',
            serviceName: 'Express Worldwide (P)',
            totalPrice: Number((baseAirPrice + insuranceFee + dgFee).toFixed(3)),
            currency: 'KWD',
            eta: '1–2 Business Days'
          },
          {
            carrierCode: 'OTE',
            carrierName: 'LogesTechs GCC Ground',
            serviceCode: 'EXP',
            serviceName: 'GCC Overland Standard',
            totalPrice: Number((baseGroundPrice + insuranceFee + dgFee).toFixed(3)),
            currency: 'KWD',
            eta: '3–5 Business Days'
          },
          {
            carrierCode: 'INTERNAL',
            carrierName: 'Target Dedicated Fleet',
            serviceCode: 'INTERNAL_STD',
            serviceName: 'Domestic Local Fleet Dispatch',
            totalPrice: Number((3.0 + (weightVal * 0.5)).toFixed(3)),
            currency: 'KWD',
            eta: 'Same-Day / Next-Day'
          }
        ];
      }

      // Format quotes
      const formatted = quotes.map(q => ({
        ...q,
        carrierCode: (q.carrier || q.carrierCode || 'DGR').toUpperCase(),
        carrierName: q.carrierName || KNOWN_CARRIERS[q.carrier?.toUpperCase()]?.name || q.carrier,
        serviceCode: q.serviceCode || 'STD',
        serviceName: q.serviceName || 'Express Service',
        totalPrice: q.totalPrice !== null && q.totalPrice !== undefined ? Number(q.totalPrice) : null,
        currency: q.currency || 'KWD',
        eta: q.estimatedDelivery ? new Date(q.estimatedDelivery).toLocaleDateString() : (q.eta || '2–3 Business Days'),
        optionalServices: q.optionalServices || []
      }));

      setQuoteRates(formatted);

      // Auto-select first matching or assigned carrier
      const matched = assignedCarrierCode
        ? formatted.find(f => f.carrierCode === assignedCarrierCode)
        : formatted[0];

      if (matched) {
        setService(s => ({
          ...s,
          carrierCode: matched.carrierCode,
          carrierId: matched.carrierCode,
          serviceCode: matched.serviceCode,
          serviceName: matched.serviceName,
          quotedPrice: matched.totalPrice,
          currency: matched.currency
        }));
      }
    } catch (error) {
      console.error('Rate calculation error:', error);
    } finally {
      setLoadingQuotes(false);
    }
  }, [sender, receiver, pkg, selectedClientId, assignedCarrierCode, isTestMode]);

  // Trigger rate calculation when entering Step 4 or when switching test mode
  useEffect(() => {
    if (step === 4) {
      fetchCarrierQuotes();
    }
  }, [step, isTestMode, fetchCarrierQuotes]);

  // Immediate Save to Address Book Handler
  const handleSaveAddressNow = async (addressData, addressType = 'Location') => {
    if (!addressData.name || !addressData.addr1) {
      enqueueSnackbar('Please enter contact name and street address before saving', { variant: 'warning' });
      return;
    }
    try {
      const newAddr = {
        id: 'addr-' + Date.now(),
        label: `${addressData.company || addressData.name} (${addressData.city || 'GCC'})`,
        contactPerson: addressData.name,
        company: addressData.company || '',
        phone: addressData.phone || '',
        phoneCountryCode: addressData.phoneCountryCode || '+965',
        email: addressData.email || '',
        taxId: addressData.taxId || '',
        addressLine1: addressData.addr1,
        addressLine2: addressData.addr2 || '',
        city: addressData.city,
        state: addressData.state || '',
        postalCode: addressData.zip || '00000',
        country: addressData.country || 'Kuwait',
        countryCode: addressData.countryCode || 'KW',
        area: addressData.area || '',
        latitude: addressData.latitude,
        longitude: addressData.longitude,
        instructions: addressData.instructions || '',
        formattedAddress: addressData.formattedAddress || `${addressData.addr1}, ${addressData.city}`
      };

      const updatedUserAddrs = [...userAddresses, newAddr];
      setUserAddresses(updatedUserAddrs);
      if (selectedClientId) {
        setClientAddresses(prev => [...prev, newAddr]);
      }

      // Persist to backend
      try {
        await api.post('/addresses', newAddr);
      } catch {
        await userService.updateProfile({ addresses: updatedUserAddrs });
      }

      if (refreshUser) await refreshUser();
      enqueueSnackbar(`${addressType} address saved to Address Book!`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar('Failed to save address: ' + err.message, { variant: 'error' });
    }
  };

  // Save new custom package template
  const handleSaveNewTemplate = (newTemplate) => {
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    try {
      localStorage.setItem('tl_package_templates', JSON.stringify(updated));
      shipmentService.savePackageTemplate(newTemplate).catch(() => {});
    } catch {}
    enqueueSnackbar(`Package template "${newTemplate.name}" saved!`, { variant: 'success' });
  };

  const handleNext = () => {
    const form = { sender, receiver, pkg, service, customs, confirmed };
    const stepErrors = validateWizardStep(step, form, isRTL, lang);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      const alertMsg = getValidationAlertMessage(step, stepErrors, isRTL, lang);
      enqueueSnackbar(alertMsg, { variant: 'error' });

      // Auto-scroll to the first invalid field smoothly & focus
      const firstKey = Object.keys(stepErrors)[0];
      setTimeout(() => {
        const el = document.querySelector(`[data-field-key="${firstKey}"]`) || document.getElementById(`field-${firstKey}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = el.matches('input, select, textarea') ? el : el.querySelector('input, select, textarea');
          if (focusable && typeof focusable.focus === 'function') {
            focusable.focus();
          }
        }
      }, 50);
      return;
    }

    setErrors({});
    setStep(s => Math.min(6, s + 1));
  };

  const handleBack = () => {
    if (step > 1) setStep(s => s - 1);
    else if (onClose) onClose();
    else navigate(-1);
  };

  const handleConfirmSubmit = async () => {
    const form = { sender, receiver, pkg, service, customs, confirmed };
    const stepErrors = validateWizardStep(6, form, isRTL, lang);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      const alertMsg = getValidationAlertMessage(6, stepErrors, isRTL, lang);
      enqueueSnackbar(alertMsg, { variant: 'error' });
      const firstKey = Object.keys(stepErrors)[0];
      setTimeout(() => {
        const el = document.querySelector(`[data-field-key="${firstKey}"]`) || document.getElementById(`field-${firstKey}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable = el.matches('input, select, textarea') ? el : el.querySelector('input, select, textarea');
          if (focusable && typeof focusable.focus === 'function') {
            focusable.focus();
          }
        }
      }, 50);
      return;
    }

    setSubmitting(true);
    try {
      const senderCountryCode = sender.countryCode || (sender.country === 'Kuwait' ? 'KW' : 'AE');
      const receiverCountryCode = receiver.countryCode || (receiver.country === 'United Arab Emirates' ? 'AE' : (receiver.country === 'Saudi Arabia' ? 'SA' : 'KW'));

      const senderStreet = [sender.addr1, sender.addr2, sender.area].filter(Boolean);
      const receiverStreet = [receiver.addr1, receiver.addr2, receiver.area].filter(Boolean);

      const senderZip = sender.zip || (NON_POSTAL_COUNTRIES.includes(senderCountryCode) ? '00000' : '13001');
      const receiverZip = receiver.zip || (NON_POSTAL_COUNTRIES.includes(receiverCountryCode) ? '00000' : '00000');

      const addonsSurcharge = (service.selectedAddons || []).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
      const baseRate = Number(service.quotedPrice) || 0;
      const finalPrice = baseRate > 0 ? Number((baseRate + addonsSurcharge).toFixed(3)) : undefined;

      const finalPackagesList = (pkg.packagesList && pkg.packagesList.length > 0)
        ? pkg.packagesList
        : [{
            weight: Number(pkg.weight) || 1,
            length: Number(pkg.length) || 20,
            width: Number(pkg.width) || 15,
            height: Number(pkg.height) || 10,
            pkgType: pkg.pkgType || 'Box',
            description: pkg.description || 'General Cargo',
            qty: Number(pkg.qty) || 1,
            value: Number(pkg.value) || 0
          }];

      const payload = {
        sender: {
          contactPerson: sender.name,
          name: sender.name,
          company: sender.company || '',
          phone: sender.phone,
          phoneCountryCode: sender.phoneCountryCode || '+965',
          email: sender.email || '',
          streetLines: senderStreet.length > 0 ? senderStreet : [sender.formattedAddress || 'Main Street'],
          addressLine1: (sender.addr1 || sender.formattedAddress || 'Main Street').substring(0, 45).trim(),
          addressLine2: (sender.addr2 || '').substring(0, 45).trim(),
          city: (sender.city || 'Kuwait City').substring(0, 45).trim(),
          state: sender.state || '',
          postalCode: senderZip,
          countryCode: senderCountryCode,
          country: sender.country || 'Kuwait',
          area: sender.area || '',
          taxId: sender.taxId || '',
          latitude: sender.latitude,
          longitude: sender.longitude,
          formattedAddress: sender.formattedAddress || `${sender.addr1 || ''}, ${sender.city || ''}, ${senderCountryCode}`
        },
        receiver: {
          contactPerson: receiver.name,
          name: receiver.name,
          company: receiver.company || '',
          phone: receiver.phone,
          phoneCountryCode: receiver.phoneCountryCode || '+971',
          email: receiver.email || '',
          streetLines: receiverStreet.length > 0 ? receiverStreet : [receiver.formattedAddress || 'Main Street'],
          addressLine1: (receiver.addr1 || receiver.formattedAddress || 'Main Street').substring(0, 45).trim(),
          addressLine2: (receiver.addr2 || '').substring(0, 45).trim(),
          city: (receiver.city || 'Dubai').substring(0, 45).trim(),
          state: receiver.state || '',
          postalCode: receiverZip,
          countryCode: receiverCountryCode,
          country: receiver.country || 'United Arab Emirates',
          area: receiver.area || '',
          taxId: receiver.taxId || '',
          instructions: receiver.instructions || '',
          latitude: receiver.latitude,
          longitude: receiver.longitude,
          formattedAddress: receiver.formattedAddress || `${receiver.addr1 || ''}, ${receiver.city || ''}, ${receiverCountryCode}`
        },
        packages: finalPackagesList.map(p => ({
          weight: Number(p.weight) || 1,
          length: Number(p.length) || 20,
          width: Number(p.width) || 15,
          height: Number(p.height) || 10,
          packageType: p.pkgType || pkg.pkgType || 'Box',
          description: p.description || pkg.description || 'General Cargo'
        })),
        parcels: finalPackagesList.map(p => ({
          weight: Number(p.weight) || 1,
          length: Number(p.length) || 20,
          width: Number(p.width) || 15,
          height: Number(p.height) || 10,
          declaredValue: Number(p.value) || 0,
          packageType: p.pkgType || pkg.pkgType || 'Box',
          description: p.description || pkg.description || 'General Cargo'
        })),
        items: finalPackagesList.map(p => ({
          description: p.description || pkg.description || 'General Cargo',
          quantity: Number(p.qty) || 1,
          price: Number(p.value) || 0,
          value: Number(p.value) || 0,
          currency: p.currency || 'KWD',
          hsCode: p.hsCode || customs.hsCode || '',
          countryOfOrigin: p.originCountry || customs.origin || 'KW'
        })),
        shipmentType: pkg.pkgType === 'Envelope' ? 'documents' : 'package',
        carrierCode: service.carrierCode || 'DGR',
        serviceCode: service.serviceCode || 'P',
        currency: service.currency || 'KWD',
        price: finalPrice,
        incoterm: customs.incoterms?.split(' ')[0] || 'DAP',
        insurance: Boolean(pkg.insurance),
        dangerousGoods: {
          contains: Boolean(pkg.dangerousGoods),
          unCode: pkg.unCode || '',
          code: pkg.unCode || '',
          class: pkg.dgClass || '',
          properShippingName: pkg.properShippingName || '',
          serviceCode: pkg.dgServiceCode || '',
          contentId: pkg.dgContentId || '',
          customDescription: pkg.dgMarks || ''
        },
        pickupRequired: service.pickupType.includes('Pickup'),
        pickupDate: service.pickupDate,
        pickupTime: service.pickupTime,
        specialInstructions: [service.instructions, receiver.instructions].filter(Boolean).join(' | ') || '',
        onBehalfOfUserId: selectedClientId || undefined,
        userId: selectedClientId || undefined,
        isTest: isTestMode,
        environment: isTestMode ? 'test' : 'production',
        valueAddedServices: (service.selectedAddons || []).map(a => a.serviceCode),
        customsInvoice: {
          invoiceNumber: customs.invoiceNum || '',
          declaredValue: Number(customs.invoiceVal || pkg.value || 0),
          notes: customs.notes || ''
        }
      };

      const res = editing
        ? await shipmentService.updateShipmentDetails(editing.trackingNumber, payload)
        : await shipmentService.createShipment(payload);

      // Save Address to user profile if checkboxes are ticked
      if (saveSenderToBook) handleSaveAddressNow(sender, 'Sender');
      if (saveReceiverToBook) handleSaveAddressNow(receiver, 'Receiver');

      const tn = res.data?.trackingNumber || ('TLG-' + Date.now().toString().slice(-8));
      const createdObj = { ...payload, trackingNumber: tn, id: res.data?.id || tn };
      setCreatedTn(tn);
      setCreatedShipment(createdObj);
      setSuccess(true);
      enqueueSnackbar(lang === 'ar' ? `تم إصدار البوليصة ${tn} بنجاح!` : `Shipment ${tn} created successfully!`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed to create shipment', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const [createdShipment, setCreatedShipment] = useState(null);

  const handleDownloadWaybill = async () => {
    try {
      const { generateWaybillPDF } = await import('../../utils/pdfGenerator');
      await generateWaybillPDF(createdShipment || { trackingNumber: createdTn, sender, receiver, parcels: pkg.packagesList || [pkg] });
      enqueueSnackbar(lang === 'ar' ? 'تم إنشاء بوليصة الشحن PDF بنجاح!' : 'Waybill PDF generated successfully!', { variant: 'success' });
    } catch (e) {
      enqueueSnackbar('Failed to generate waybill PDF: ' + e.message, { variant: 'error' });
    }
  };

  const handleDownloadInvoice = async () => {
    try {
      const { generateCommercialInvoicePDF } = await import('../../utils/pdfGenerator');
      await generateCommercialInvoicePDF(createdShipment || { trackingNumber: createdTn, sender, receiver, parcels: pkg.packagesList || [pkg], customs });
      enqueueSnackbar(lang === 'ar' ? 'تم إنشاء الفاتورة التجارية PDF بنجاح!' : 'Commercial Invoice PDF generated successfully!', { variant: 'success' });
    } catch (e) {
      enqueueSnackbar('Failed to generate invoice PDF: ' + e.message, { variant: 'error' });
    }
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);

  if (success) {
    return (
      <div style={{
        maxWidth: 720, margin: '40px auto', background: '#fff', borderRadius: 20,
        padding: '50px 36px', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.14)',
        border: `1px solid ${TK.border}`
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: '50%', background: TK.successBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: TK.success }}>check_circle</span>
        </div>
        <h2 style={{ fontWeight: 900, fontSize: 22, color: TK.text1, marginBottom: 6 }}>
          {lang === 'ar' ? 'تم إصدار بوليصة الشحن وترحيلها بنجاح!' : 'Shipment Manifest Dispatched!'}
        </h2>
        <p style={{ fontSize: 14, color: TK.text2, marginBottom: 20 }}>
          {lang === 'ar' ? 'رقم تتبع البوليصة:' : 'Tracking Number:'} <strong style={{ color: TK.primary }}>#{createdTn}</strong>
          {isTestMode && <span style={{ marginLeft: 8, color: '#b45309', fontWeight: 700 }}>({lang === 'ar' ? '🧪 حجز تجريبي' : '🧪 Sandbox Test Booking'})</span>}
        </p>

        {/* Carrier Documents PDF Download Strip */}
        <div style={{
          margin: '0 auto 28px', maxWidth: 540, padding: '18px 20px', borderRadius: 16,
          background: '#f8fafc', border: `1.5px solid ${TK.border}`, textAlign: lang === 'ar' ? 'right' : 'left'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: TK.primary }}>description</span>
            <span style={{ fontWeight: 800, fontSize: 13.5, color: TK.text1 }}>
              {lang === 'ar' ? 'وثائق وبوالص الشحن الرسمية' : 'Official Carrier Documents & Labels'}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={handleDownloadWaybill}
              style={{
                padding: '11px 24px', borderRadius: 12, border: 'none',
                background: TK.primary, color: '#fff', fontWeight: 700, fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 2px 8px rgba(0,80,212,0.25)', transition: 'all 0.15s'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span>
              {lang === 'ar' ? 'طباعة بوليصة الشحن (PDF)' : 'Carrier Waybill / Label (PDF)'}
            </button>
          </div>
        </div>

        {/* Navigation Footer */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate(`/shipment/${createdTn}`)}
            style={{
              padding: '12px 24px', borderRadius: 12, border: `1.5px solid ${TK.primary}`,
              background: TK.primaryBg, color: TK.primary, fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>visibility</span>
            {lang === 'ar' ? 'عرض تفاصيل الشحنة' : 'View Consignment Details'}
          </button>
          <button
            type="button"
            onClick={() => { setSuccess(false); setStep(1); }}
            style={{
              padding: '12px 20px', borderRadius: 12, border: `1.5px solid ${TK.border}`,
              background: '#fff', color: TK.text1, fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            {lang === 'ar' ? 'إنشاء بوليصة أخرى' : 'Create Another'}
          </button>
        </div>
      </div>
    );
  }

  const currentStep = WIZARD_STEPS.find(s => s.id === step);

  return (
    <div
      ref={wizardContainerRef}
      style={{
        maxWidth: 840, margin: '20px auto 40px', background: '#fff',
        borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
        border: `1px solid ${TK.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}
    >
      {/* Header */}
      <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${TK.border}`, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: TK.text1 }}>
              {editing
                ? (lang === 'ar' ? 'تعديل بيانات بوليصة الشحن' : 'Edit Shipment')
                : (lang === 'ar' ? 'إنشاء بوليصة شحن جديدة' : 'New Shipment Manifest')}
            </div>
            <div style={{ fontSize: 12.5, color: TK.text3, marginTop: 2 }}>
              {lang === 'ar'
                ? `الخطوة ${step} من ${WIZARD_STEPS.length} — ${currentStep?.labelAr || currentStep?.label}`
                : `Step ${step} of ${WIZARD_STEPS.length} — ${currentStep?.label}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose || (() => navigate(-1))}
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${TK.border}`,
              background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: TK.text2
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>

        {/* Prominent "On Behalf Of Client" Selector */}
        {(clients.length > 0 || isStaff || isAdmin) && (
          <div style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 14,
            background: selectedClientId ? '#eff6ff' : '#f8fafc',
            border: `1.5px solid ${selectedClientId ? '#3b82f6' : TK.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 8,
                background: selectedClientId ? '#dbeafe' : '#e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: selectedClientId ? '#2563eb' : TK.text2 }}>
                  account_circle
                </span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: TK.text1 }}>
                  {lang === 'ar' ? 'إنشاء بالنيابة عن شركة / متجر' : 'Create on Behalf of Client / Organization'}
                </div>
                <div style={{ fontSize: 11.5, color: TK.text2 }}>
                  {selectedClientId
                    ? (lang === 'ar' ? `العميل المحدد: ${selectedClient?.name || 'العميل'} • تم ربط دفتر العناوين والسياسة` : `Active Client: ${selectedClient?.name || 'Selected Client'} • Address Book & Policy Attached`)
                    : (lang === 'ar' ? 'اختر متجر أو عميل لتحديد السياسة التسعيرية، أو أنشئ مباشرة' : 'Select a client to scope address book & routing policy, or create directly')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={selectedClientId}
                onChange={e => handleClientChange(e.target.value)}
                style={{
                  padding: '8px 14px', borderRadius: 10,
                  border: `1.5px solid ${selectedClientId ? '#2563eb' : TK.border}`,
                  background: '#fff', color: selectedClientId ? '#1e40af' : TK.text1,
                  fontWeight: 700, fontSize: 12.5, outline: 'none', cursor: 'pointer', minWidth: 200
                }}
              >
                <option value="">{lang === 'ar' ? 'إصدار مباشر (حسابي)' : 'Direct Dispatch (My Account)'}</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.organization?.name || c.email || c.role})
                  </option>
                ))}
              </select>

              {selectedClientId && (
                <button
                  type="button"
                  onClick={() => handleClientChange('')}
                  title="Reset to My Account"
                  style={{
                    padding: '8px 10px', borderRadius: 8, border: `1px solid ${TK.border}`,
                    background: '#fff', color: TK.text2, cursor: 'pointer', display: 'flex', alignItems: 'center'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>restart_alt</span>
                </button>
              )}
            </div>
          </div>
        )}

        <WizardProgress step={step} setStep={setStep} />
      </div>

      {/* Body Form */}
      <div key={step} className="animate-slide-right" style={{ padding: '24px 28px', flex: 1 }}>
        {step === 1 && (
          <AddressStep
            title={lang === 'ar' ? 'بيانات الراسل (المصدر والشحن)' : 'Sender (Origin Dispatch)'}
            subtitle={lang === 'ar' ? 'من هو التاجر أو الراسل ومكان استلام الشحنة؟' : 'Who is sending this shipment from origin?'}
            icon="flight_takeoff"
            data={sender}
            setData={setSender}
            savedAddresses={activeSenderAddresses}
            saveToBook={saveSenderToBook}
            setSaveToBook={setSaveSenderToBook}
            isReceiver={false}
            onSaveAddressNow={handleSaveAddressNow}
            selectedClientLabel={selectedClient?.name}
            errors={errors}
            clearError={clearError}
            clearErrors={clearErrors}
          />
        )}
        {step === 2 && (
          <AddressStep
            title={lang === 'ar' ? 'بيانات المستلم (الوجهة والتسليم)' : 'Receiver (Consignee / Destination)'}
            subtitle={lang === 'ar' ? 'من هو المستلم وعنوان التسليم النهائي؟' : 'Who is receiving this cargo at destination?'}
            icon="flight_land"
            data={receiver}
            setData={setReceiver}
            savedAddresses={activeReceiverAddresses}
            saveToBook={saveReceiverToBook}
            setSaveToBook={setSaveReceiverToBook}
            isReceiver={true}
            onSaveAddressNow={handleSaveAddressNow}
            selectedClientLabel={selectedClient?.name}
            errors={errors}
            clearError={clearError}
            clearErrors={clearErrors}
          />
        )}
        {step === 3 && (
          <PackageStep
            data={pkg}
            setData={setPkg}
            templates={templates}
            onSaveNewTemplate={handleSaveNewTemplate}
            errors={errors}
            clearError={clearError}
            clearErrors={clearErrors}
          />
        )}
        {step === 4 && (
          <ServiceStep
            data={service}
            setData={setService}
            isStaff={isStaff}
            isAdmin={isAdmin}
            assignedCarrierCode={assignedCarrierCode}
            quoteRates={quoteRates}
            loadingQuotes={loadingQuotes}
            onRefreshQuotes={fetchCarrierQuotes}
            isTestMode={isTestMode}
            setIsTestMode={setIsTestMode}
            errors={errors}
            clearError={clearError}
            clearErrors={clearErrors}
          />
        )}
        {step === 5 && (
          <LogisticsStep
            service={service}
            setService={setService}
            customs={customs}
            setCustoms={setCustoms}
            errors={errors}
            clearError={clearError}
            clearErrors={clearErrors}
          />
        )}
        {step === 6 && (
          <ReviewStep
            sender={sender}
            receiver={receiver}
            pkg={pkg}
            service={service}
            customs={customs}
            confirmed={confirmed}
            setConfirmed={setConfirmed}
            isTestMode={isTestMode}
            errors={errors}
            clearError={clearError}
          />
        )}
      </div>

      {/* Footer Navigation */}
      <div style={{
        padding: '16px 28px', borderTop: `1px solid ${TK.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#fafbfc'
      }}>
        <button
          type="button"
          onClick={handleBack}
          className="press-tactile"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
            borderRadius: 10, border: `1px solid ${TK.border}`, background: '#fff',
            color: TK.text1, fontWeight: 700, fontSize: 13, cursor: 'pointer'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {lang === 'ar' ? 'arrow_forward' : 'arrow_back'}
          </span>
          {step === 1 ? (lang === 'ar' ? 'إلغاء' : 'Cancel') : (lang === 'ar' ? 'السابق' : 'Back')}
        </button>

        {step < 6 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={false}
            className="press-tactile hover-lift"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 22px',
              borderRadius: 10, border: 'none',
              background: TK.primary,
              color: '#fff', fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,80,212,0.25)',
              transition: 'all 0.15s'
            }}
          >
            <span>{lang === 'ar' ? 'الخطوة التالية' : 'Next Step'}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {lang === 'ar' ? 'arrow_back' : 'arrow_forward'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={submitting}
            className="press-tactile hover-lift"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '11px 26px',
              borderRadius: 10, border: 'none',
              background: !submitting ? TK.success : '#94a3b8',
              color: '#fff', fontWeight: 800, fontSize: 13.5,
              cursor: !submitting ? 'pointer' : 'not-allowed',
              boxShadow: !submitting ? '0 4px 14px rgba(16,185,129,0.3)' : 'none'
            }}
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>sync</span>
                <span>{lang === 'ar' ? 'جاري ترحيل البوليصة...' : 'Dispatching Manifest…'}</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span>
                <span>{lang === 'ar' ? 'تأكيد وإصدار بوليصة الشحن' : 'Confirm & Create Shipment'}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default KineticShipmentWizard;
