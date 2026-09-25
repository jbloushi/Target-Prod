import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api, { shipmentService, userService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { countries } from '../../utils/countries';
import GoogleAddressInput from '../GoogleAddressInput';
import GoogleMapPinDrop from '../GoogleMapPinDrop';
import { TradeRouteDisplay } from '../common/TradeRouteDisplay';
import { StatusBadge } from '../common/StatusBadge';
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
  { id: 1, label: 'Sender', labelAr: 'الراسل', icon: 'flight_takeoff' },
  { id: 2, label: 'Receiver', labelAr: 'المستلم', icon: 'flight_land' },
  { id: 3, label: 'Package & Cargo', labelAr: 'الطرود والبضائع', icon: 'inventory_2' },
  { id: 4, label: 'Carrier & Rates', labelAr: 'شركة الشحن والأسعار', icon: 'local_shipping' },
  { id: 5, label: 'Customs & Logistics', labelAr: 'اللوجستيات والجمارك', icon: 'event_note' },
  { id: 6, label: 'Review & Dispatch', labelAr: 'المراجعة والإصدار', icon: 'fact_check' },
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

// ── Pure DaisyUI Form Components ──────────────────────
const DaisyInput = ({
  dataFieldKey,
  id,
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  icon,
  required = false,
  half = false,
  error,
  helperText,
  disabled = false,
  className = '',
  ...rest
}) => {
  const isError = Boolean(error || helperText);
  const key = dataFieldKey || id;
  return (
    <div
      data-field-key={key}
      id={id || (key ? `field-${key}` : undefined)}
      className={`form-control ${half ? 'w-full md:w-[calc(50%-0.375rem)]' : 'w-full'} ${className}`}
      {...rest}
    >
      {(label || helperText) && (
        <div className="flex justify-between items-baseline mb-1 gap-2">
          {label && (
            <label className="text-xs font-bold text-base-content/80 select-none">
              {label} {required && <span className="text-error font-black">*</span>}
            </label>
          )}
          {helperText && (
            <span className={`text-[11px] font-semibold text-right ${isError ? 'text-error' : 'text-base-content/60'}`}>
              {helperText}
            </span>
          )}
        </div>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="material-symbols-outlined absolute start-3 text-base-content/40 text-lg pointer-events-none select-none">
            {icon}
          </span>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          className={`input input-bordered input-sm w-full bg-base-100 text-sm font-medium transition-all ${
            icon ? 'ps-9' : ''
          } ${isError ? 'input-error border-error focus:border-error' : 'focus:input-primary'}`}
        />
      </div>
    </div>
  );
};

const DaisyPhoneInput = ({
  dataFieldKey,
  id,
  label,
  value,
  onChange,
  dialCode = '+965',
  onDialCodeChange,
  required = false,
  half = false,
  error,
  helperText,
  disabled = false,
  className = '',
  ...rest
}) => {
  const isError = Boolean(error || helperText);
  const key = dataFieldKey || id;
  return (
    <div
      data-field-key={key}
      id={id || (key ? `field-${key}` : undefined)}
      className={`form-control ${half ? 'w-full md:w-[calc(50%-0.375rem)]' : 'w-full'} ${className}`}
      {...rest}
    >
      {(label || helperText) && (
        <div className="flex justify-between items-baseline mb-1 gap-2">
          {label && (
            <label className="text-xs font-bold text-base-content/80 select-none">
              {label} {required && <span className="text-error font-black">*</span>}
            </label>
          )}
          {helperText && (
            <span className={`text-[11px] font-semibold text-right ${isError ? 'text-error' : 'text-base-content/60'}`}>
              {helperText}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <select
          value={dialCode}
          onChange={(e) => onDialCodeChange && onDialCodeChange(e.target.value)}
          disabled={disabled}
          className="select select-bordered select-sm w-24 bg-base-100 text-xs font-mono font-bold shrink-0 focus:select-primary"
        >
          {countries.map((c) => (
            <option key={c.code} value={c.dialCode}>
              {c.dialCode} ({c.code})
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <input
            type="tel"
            placeholder="e.g. 99123456"
            value={value ?? ''}
            onChange={onChange}
            disabled={disabled}
            className={`input input-bordered input-sm w-full bg-base-100 text-sm font-medium font-mono transition-all ${
              isError ? 'input-error border-error focus:border-error' : 'focus:input-primary'
            }`}
          />
        </div>
      </div>
    </div>
  );
};

// ── Step 1 & 2: Unified Address Step (Sender / Receiver) ────────
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
  errors = {},
  clearError,
  clearErrors
}) => {
  const { lang } = useLanguage();
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  const pfx = isReceiver ? 'receiver' : 'sender';
  const [showMap, setShowMap] = useState(false);

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

  const senderPresets = [
    { label: '🏢 Shuwaikh Logistics Hub', city: 'Shuwaikh Industrial', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '70001', addr1: 'Block 1, Street 14, Target Logistics Hub' },
    { label: '🏪 Airport Cargo Terminal', city: 'Farwaniya', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '80000', addr1: 'Cargo City, Kuwait International Airport' },
    { label: '🏬 Kuwait City Financial Centre', city: 'Kuwait City', country: 'Kuwait', countryCode: 'KW', phoneCountryCode: '+965', zip: '13001', addr1: 'Sharq, Block 3, Al-Hamra Tower Wing' }
  ];

  const receiverPresets = [
    { label: '🏙️ Dubai Business Bay', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', phoneCountryCode: '+971', zip: '00000', addr1: 'Bay Square, Building 4' },
    { label: '🇸🇦 Riyadh Olaya Hub', city: 'Riyadh', country: 'Saudi Arabia', countryCode: 'SA', phoneCountryCode: '+966', zip: '12211', addr1: 'King Fahd Road, Al Olaya District' },
    { label: '🏬 Abu Dhabi Hub', city: 'Abu Dhabi', country: 'United Arab Emirates', countryCode: 'AE', phoneCountryCode: '+971', zip: '00000', addr1: 'Al Reem Island, Marina Bay 1' }
  ];

  const presets = isReceiver ? receiverPresets : senderPresets;

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-5 md:p-6 space-y-6">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-base-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <span className="material-symbols-outlined text-2xl">{icon}</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-base-content">{title}</h2>
            <p className="text-xs text-base-content/60">{subtitle}</p>
          </div>
        </div>

        {/* Address Book Quick Select */}
        {savedAddresses.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-base-content/60 shrink-0">
              {lang === 'ar' ? 'دفتر العناوين:' : 'Address Book:'}
            </span>
            <select
              onChange={handleSelectSavedAddress}
              defaultValue=""
              className="select select-bordered select-xs w-48 text-xs bg-base-100 focus:select-primary"
            >
              <option value="" disabled>{lang === 'ar' ? 'اختر عنواناً محفوظاً' : 'Select saved address'}</option>
              {savedAddresses.map((a, idx) => (
                <option key={a.id || a._id || idx} value={a.id || a._id || idx}>
                  {a.label || a.contactPerson || a.name || `Address ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Quick Location Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-base-content/50">⚡ {lang === 'ar' ? 'عناوين سريعة:' : 'Quick Presets:'}</span>
        {presets.map((preset, pIdx) => (
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
            className="btn btn-xs btn-outline border-base-300 hover:border-primary hover:bg-primary/5 text-base-content/70 hover:text-primary font-medium"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Primary Contact Fields */}
      <div className="flex flex-wrap gap-4">
        <DaisyInput
          dataFieldKey={`${pfx}_name`}
          id={`field-${pfx}_name`}
          label={lang === 'ar' ? 'اسم جهة الاتصال / الشخص' : 'Contact Full Name'}
          placeholder="e.g. John Doe / Ahmed Al-Mutawa"
          value={data.name}
          onChange={e => { upd('name', e.target.value); clearError && clearError(`${pfx}_name`); }}
          icon="person"
          error={Boolean(errors[`${pfx}_name`])}
          helperText={errors[`${pfx}_name`]}
          required
          half
        />

        <DaisyInput
          dataFieldKey={`${pfx}_company`}
          id={`field-${pfx}_company`}
          label={lang === 'ar' ? 'اسم الشركة / المؤسسة' : 'Company / Entity Name'}
          placeholder="e.g. Al-Bahar Logistics Corp."
          value={data.company}
          onChange={e => upd('company', e.target.value)}
          icon="business"
          half
        />

        <DaisyPhoneInput
          dataFieldKey={`${pfx}_phone`}
          id={`field-${pfx}_phone`}
          label={lang === 'ar' ? 'رقم الهاتف المباشر' : 'Phone Number'}
          value={data.phone}
          onChange={e => { upd('phone', e.target.value); clearError && clearError(`${pfx}_phone`); }}
          dialCode={data.phoneCountryCode}
          onDialCodeChange={c => upd('phoneCountryCode', c)}
          error={Boolean(errors[`${pfx}_phone`])}
          helperText={errors[`${pfx}_phone`]}
          required
          half
        />

        <DaisyInput
          dataFieldKey={`${pfx}_email`}
          id={`field-${pfx}_email`}
          label={lang === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
          placeholder="contact@company.com"
          value={data.email}
          onChange={e => upd('email', e.target.value)}
          type="email"
          icon="mail"
          half
        />

        <DaisyInput
          dataFieldKey={`${pfx}_taxId`}
          id={`field-${pfx}_taxId`}
          label={lang === 'ar' ? 'الرقم الضريبي / السجل التجاري / البطاقة المدنية' : 'Tax ID / VAT / Customs CR / Civil ID'}
          placeholder="e.g. VAT-KW-9482710 or Commercial Registry No."
          value={data.taxId}
          onChange={e => upd('taxId', e.target.value)}
          icon="badge"
          helperText={lang === 'ar' ? 'مطلوب للتخليص الجمركي وإصدار الفواتير' : 'Required for GCC customs clearance & commercial invoice generation'}
        />
      </div>

      {/* Google Address Autocomplete */}
      <div className="space-y-1.5 pt-2">
        <label className="text-xs font-bold text-base-content/80 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm text-primary">search</span>
          {lang === 'ar' ? 'البحث عن العنوان (Google Places)' : 'Search Global Address Registry (Google Places)'}
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

      {/* Structured Address Details */}
      <div className="flex flex-wrap gap-4 pt-2">
        <DaisyInput
          dataFieldKey={`${pfx}_addr1`}
          id={`field-${pfx}_addr1`}
          label={lang === 'ar' ? 'العنوان - السطر الأول (الشارع والمبنى)' : 'Street Address Line 1'}
          placeholder="Building, Street, House No."
          value={data.addr1}
          onChange={e => { upd('addr1', e.target.value); clearError && clearError(`${pfx}_addr1`); }}
          icon="home"
          error={Boolean(errors[`${pfx}_addr1`])}
          helperText={errors[`${pfx}_addr1`]}
          required
        />

        <DaisyInput
          dataFieldKey={`${pfx}_addr2`}
          id={`field-${pfx}_addr2`}
          label={lang === 'ar' ? 'الشقة / الطابق / المكتب (السطر الثاني)' : 'Apartment / Suite / Office / Unit (Line 2)'}
          placeholder="Flat 4B, 2nd Floor"
          value={data.addr2}
          onChange={e => upd('addr2', e.target.value)}
          icon="apartment"
          half
        />

        <DaisyInput
          dataFieldKey={`${pfx}_area`}
          id={`field-${pfx}_area`}
          label={lang === 'ar' ? 'المنطقة / الحي / القطعة' : 'District / Area / Block'}
          placeholder="e.g. Block 4, Shuwaikh Industrial"
          value={data.area}
          onChange={e => upd('area', e.target.value)}
          icon="map"
          half
        />

        <DaisyInput
          dataFieldKey={`${pfx}_city`}
          id={`field-${pfx}_city`}
          label={lang === 'ar' ? 'المدينة' : 'City / Municipality'}
          placeholder="e.g. Kuwait City / Dubai"
          value={data.city}
          onChange={e => { upd('city', e.target.value); clearError && clearError(`${pfx}_city`); }}
          icon="location_city"
          error={Boolean(errors[`${pfx}_city`])}
          helperText={errors[`${pfx}_city`]}
          required
          half
        />

        <DaisyInput
          dataFieldKey={`${pfx}_state`}
          id={`field-${pfx}_state`}
          label={lang === 'ar' ? 'المحافظة / الإمارة' : 'State / Governorate / Province'}
          placeholder="e.g. Al Asimah / Capital"
          value={data.state}
          onChange={e => upd('state', e.target.value)}
          icon="signpost"
          half
        />

        {/* Country Selector */}
        <div
          data-field-key={`${pfx}_country`}
          id={`field-${pfx}_country`}
          className="form-control w-full md:w-[calc(50%-0.375rem)]"
        >
          <div className="flex justify-between items-baseline mb-1 gap-2">
            <label className="text-xs font-bold text-base-content/80 select-none">
              {lang === 'ar' ? 'الدولة / الإقليم' : 'Country / Territory'} <span className="text-error font-black">*</span>
            </label>
            {errors[`${pfx}_country`] && (
              <span className="text-[11px] font-semibold text-error text-right">
                {errors[`${pfx}_country`]}
              </span>
            )}
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute start-3 top-1/2 -translate-y-1/2 text-base-content/40 text-lg pointer-events-none">
              public
            </span>
            <select
              value={data.countryCode || 'KW'}
              onChange={(e) => {
                const code = e.target.value;
                const cObj = countries.find(c => c.code === code);
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
              className={`select select-bordered select-sm w-full ps-9 bg-base-100 text-sm font-medium ${
                errors[`${pfx}_country`] ? 'select-error border-error' : 'focus:select-primary'
              }`}
            >
              {countries.map(c => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Postal Code */}
        <DaisyInput
          dataFieldKey={`${pfx}_zip`}
          id={`field-${pfx}_zip`}
          label={lang === 'ar' ? 'الرمز البريدي' : 'Postal / ZIP Code'}
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

      {/* Receiver Instructions */}
      {isReceiver && (
        <DaisyInput
          dataFieldKey="receiver_instructions"
          id="field-receiver_instructions"
          label={lang === 'ar' ? 'تعليمات تسليم المستلم / رمز البوابة / معالم الموقع' : 'Consignee Delivery Instructions / Gate Code / Landmarks'}
          placeholder="e.g. Gate 3, Ring intercom #12, leave at reception desk"
          value={data.instructions}
          onChange={e => upd('instructions', e.target.value)}
          icon="door_front"
        />
      )}

      {/* Interactive Map Toggle */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className="btn btn-xs btn-ghost gap-1.5 text-primary font-bold hover:bg-primary/10"
        >
          <span className="material-symbols-outlined text-base">pin_drop</span>
          {showMap
            ? (lang === 'ar' ? 'إخفاء الخريطة الدقيقة' : 'Hide Precise Pin Drop Map')
            : (lang === 'ar' ? 'إظهار الخريطة الدقيقة وتحديد الإحداثيات' : 'Show Location Pin Drop & GPS Coordinates')}
        </button>

        {showMap && (
          <div className="mt-3 p-3 rounded-xl border border-base-200 bg-base-200/40">
            <GoogleMapPinDrop
              latitude={data.latitude}
              longitude={data.longitude}
              addressLabel={data.formattedAddress || `${data.addr1 || ''}, ${data.city || ''}, ${data.country || ''}`}
              height="240px"
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
        )}
      </div>

      {/* Save to Address Book Checkbox */}
      <div className="pt-2">
        <label className="label cursor-pointer justify-start gap-3 p-3 rounded-xl border border-base-200 bg-base-200/30 hover:bg-base-200/50 transition-all">
          <input
            type="checkbox"
            checked={Boolean(saveToBook)}
            onChange={e => setSaveToBook(e.target.checked)}
            className="checkbox checkbox-primary checkbox-sm"
          />
          <span className="text-xs font-semibold text-base-content/80 select-none">
            {isReceiver
              ? (lang === 'ar' ? 'حفظ بيانات المستلم في دفتر العناوين للاستخدام المستقبلي' : 'Save this consignee to Address Book for future shipments')
              : (lang === 'ar' ? 'حفظ عنوان الراسل في دفتر العناوين للاستخدام المستقبلي' : 'Save this shipper address to Address Book for future shipments')}
          </span>
        </label>
      </div>
    </div>
  );
};

// ── Step 3: Package & Cargo Details ────────────────────────────
const PackageStep = ({ data, setData, templates, onSaveNewTemplate, errors = {}, clearError, clearErrors }) => {
  const { lang } = useLanguage();
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const packageTypes = ['Box', 'Envelope', 'Pallet', 'Bag', 'Crate', 'Tube'];
  const packages = data.packagesList && data.packagesList.length > 0 ? data.packagesList : [data];

  const handleApplyTemplate = (tmpl) => {
    if (!tmpl) return;
    setData(d => ({
      ...d,
      pkgType: tmpl.pkgType || 'Box',
      weight: String(tmpl.weight || '1.0'),
      length: String(tmpl.length || '20'),
      width: String(tmpl.width || '15'),
      height: String(tmpl.height || '10'),
      description: tmpl.description || 'General Cargo',
      value: tmpl.value || '15.00',
      dangerousGoods: Boolean(tmpl.dangerousGoods),
      unCode: tmpl.unCode || '',
      dgClass: tmpl.dgClass || '',
      properShippingName: tmpl.properShippingName || '',
      packagesList: [{
        weight: String(tmpl.weight || '1.0'),
        length: String(tmpl.length || '20'),
        width: String(tmpl.width || '15'),
        height: String(tmpl.height || '10'),
        description: tmpl.description || 'General Cargo',
        value: tmpl.value || '15.00',
        qty: '1',
        pkgType: tmpl.pkgType || 'Box'
      }]
    }));
    if (clearErrors) {
      clearErrors(['pkg_description', 'pkg_weight', 'pkg_length', 'pkg_width', 'pkg_height']);
    }
  };

  const handleSaveModalSubmit = () => {
    if (!templateName.trim()) return;
    const newTmpl = {
      id: 'custom_' + Date.now(),
      name: templateName.trim(),
      pkgType: data.pkgType || 'Box',
      weight: data.weight || '1.0',
      length: data.length || '20',
      width: data.width || '15',
      height: data.height || '10',
      description: data.description || 'General Cargo',
      value: data.value || '15.00',
      dangerousGoods: Boolean(data.dangerousGoods),
      unCode: data.unCode || '',
      dgClass: data.dgClass || '',
      properShippingName: data.properShippingName || ''
    };
    onSaveNewTemplate(newTmpl);
    setTemplateName('');
    setShowSaveModal(false);
  };

  const declaredVal = parseFloat(data.value) || 0;
  const insurancePremium = Math.max(2.5, declaredVal * 0.01).toFixed(3);

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-5 md:p-6 space-y-6">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-base-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <span className="material-symbols-outlined text-2xl">inventory_2</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-base-content">{lang === 'ar' ? 'مواصفات الطرود والبضائع' : 'Package & Cargo Specifications'}</h2>
            <p className="text-xs text-base-content/60">{lang === 'ar' ? 'إدارة الأبعاد والأوزان وتصنيف المواد الخطرة والتأمين' : 'Manage weight, volumetric dimensions, IATA DGR classification and insurance'}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSaveModal(true)}
          className="btn btn-xs btn-outline border-base-300 hover:border-primary gap-1.5 text-xs font-bold"
        >
          <span className="material-symbols-outlined text-sm">bookmark_add</span>
          {lang === 'ar' ? 'حفظ كقالب مخصص' : 'Save as Template'}
        </button>
      </div>

      {/* Quick Template Chips */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-base-content/60">📦 {lang === 'ar' ? 'قوالب الشحنات الجاهزة:' : 'Package Templates:'}</span>
        <div className="flex flex-wrap gap-2">
          {templates.map(tmpl => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => handleApplyTemplate(tmpl)}
              className="btn btn-xs btn-outline border-base-200 hover:border-primary hover:bg-primary/5 text-base-content/80 hover:text-primary font-medium"
            >
              {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Package Type Pills */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-base-content/80 select-none">
          {lang === 'ar' ? 'نوع الطرد' : 'Package Container Type'}
        </label>
        <div className="flex flex-wrap gap-2">
          {packageTypes.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => upd('pkgType', t)}
              className={`btn btn-sm gap-2 ${
                data.pkgType === t ? 'btn-primary' : 'btn-outline border-base-200 bg-base-100 text-base-content/80 hover:border-primary/50'
              }`}
            >
              <span className="material-symbols-outlined text-base">
                {t === 'Box' ? 'inventory_2' : t === 'Envelope' ? 'mail' : t === 'Pallet' ? 'pallet' : 'category'}
              </span>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Insurance Protection Toggle */}
      <div
        onClick={() => upd('insurance', !data.insurance)}
        className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-4 ${
          data.insurance ? 'border-success bg-success/5 shadow-sm' : 'border-base-200 bg-base-200/20 hover:bg-base-200/40'
        }`}
      >
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(data.insurance)}
            onChange={() => {}}
            className="checkbox checkbox-success checkbox-sm pointer-events-none"
          />
          <div>
            <div className={`text-xs font-bold ${data.insurance ? 'text-success-content' : 'text-base-content'}`}>
              🛡️ {lang === 'ar' ? 'التأمين الشامل على الشحنة ضد الفقدان أو التلف' : 'Insource Full Cargo Insurance & Loss Protection'}
            </div>
            <div className="text-[11px] text-base-content/60">
              {lang === 'ar' ? 'تغطية شاملة ضد الحوادث أو التلف أو الفقدان بنسبة 1% من القيمة المصرحة' : 'Comprehensive coverage against damage, loss, or theft (1% of declared value, min 2.500 KWD)'}
            </div>
          </div>
        </div>
        {data.insurance && (
          <span className="badge badge-success badge-sm font-mono font-bold text-success-content">
            +KD {insurancePremium}
          </span>
        )}
      </div>

      {/* Dangerous Goods (IATA DGR) Toggle & Presets */}
      <div className={`p-4 rounded-xl border transition-all space-y-4 ${
        data.dangerousGoods ? 'border-warning bg-warning/5 shadow-sm' : 'border-base-200 bg-base-200/20'
      }`}>
        <div
          onClick={() => {
            const next = !data.dangerousGoods;
            upd('dangerousGoods', next);
            if (!next && clearErrors) {
              clearErrors(['pkg_unCode', 'pkg_dgClass', 'pkg_properShippingName', 'pkg_dgServiceCode', 'pkg_dgContentId', 'pkg_dgMarks']);
            }
          }}
          className="flex items-center justify-between cursor-pointer gap-3"
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(data.dangerousGoods)}
              onChange={() => {}}
              className="checkbox checkbox-warning checkbox-sm pointer-events-none"
            />
            <div>
              <div className="text-xs font-bold text-base-content flex items-center gap-1.5">
                <span className="material-symbols-outlined text-warning text-base">warning</span>
                {lang === 'ar' ? 'الشحنة تحتوي على مواد خطرة خاضعة للوائح إياتا (IATA DGR)' : 'Contains Dangerous Goods / Hazardous Cargo (IATA Regulated)'}
              </div>
              <div className="text-[11px] text-base-content/60">
                {lang === 'ar' ? 'عطور، بطاريات ليثيوم، غازات مضغوطة، سوائل كيميائية قابلة للاشتعال' : 'Perfumes, Lithium batteries, aerosols, paints, chemical flammable liquids'}
              </div>
            </div>
          </div>
          {data.dangerousGoods && (
            <span className="badge badge-warning badge-sm font-bold text-warning-content">
              IATA DGR Active
            </span>
          )}
        </div>

        {data.dangerousGoods && (
          <div className="pt-3 border-t border-warning/20 space-y-4">
            <div className="form-control w-full">
              <label className="text-xs font-bold text-base-content/80 mb-1">
                {lang === 'ar' ? 'اختر تصنيف المواد الخطرة الجاهز (IATA Presets)' : 'Select IATA Dangerous Goods Preset'}
              </label>
              <select
                value={data.unCode || 'none'}
                onChange={(e) => {
                  const sel = DG_PRESET_OPTIONS.find(o => o.unCode === e.target.value || o.id === e.target.value);
                  if (sel) {
                    setData(d => ({
                      ...d,
                      unCode: sel.unCode,
                      dgClass: sel.dgClass,
                      properShippingName: sel.properShippingName,
                      packingGroup: sel.packingGroup,
                      dgServiceCode: sel.serviceCode,
                      dgContentId: sel.contentId,
                      dgMarks: sel.marks
                    }));
                    if (clearErrors) {
                      clearErrors(['pkg_unCode', 'pkg_dgClass', 'pkg_properShippingName', 'pkg_dgServiceCode', 'pkg_dgContentId', 'pkg_dgMarks']);
                    }
                  }
                }}
                className="select select-bordered select-sm w-full bg-base-100 text-xs font-medium focus:select-primary"
              >
                {DG_PRESET_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.unCode || opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-4">
              <DaisyInput
                dataFieldKey="pkg_unCode"
                id="field-pkg_unCode"
                label={lang === 'ar' ? 'رمز الأمم المتحدة (UN Code)' : 'UN Identification Code'}
                placeholder="e.g. UN1266"
                value={data.unCode}
                onChange={e => { upd('unCode', e.target.value); clearError && clearError('pkg_unCode'); }}
                error={Boolean(errors.pkg_unCode)}
                helperText={errors.pkg_unCode}
                required
                half
              />

              <DaisyInput
                dataFieldKey="pkg_dgClass"
                id="field-pkg_dgClass"
                label={lang === 'ar' ? 'فئة الخطورة (Hazard Class)' : 'Hazard Class'}
                placeholder="e.g. Class 3 — Flammable Liquid"
                value={data.dgClass}
                onChange={e => { upd('dgClass', e.target.value); clearError && clearError('pkg_dgClass'); }}
                error={Boolean(errors.pkg_dgClass)}
                helperText={errors.pkg_dgClass}
                required
                half
              />

              <DaisyInput
                dataFieldKey="pkg_dgServiceCode"
                id="field-pkg_dgServiceCode"
                label={lang === 'ar' ? 'رمز خدمة الناقل (HE, HV, HK, HC)' : 'Carrier DGR Service Code (HE/HV/HK/HC)'}
                placeholder="HE"
                value={data.dgServiceCode}
                onChange={e => { upd('dgServiceCode', e.target.value); clearError && clearError('pkg_dgServiceCode'); }}
                error={Boolean(errors.pkg_dgServiceCode)}
                helperText={errors.pkg_dgServiceCode}
                required
                half
              />

              <DaisyInput
                dataFieldKey="pkg_dgContentId"
                id="field-pkg_dgContentId"
                label={lang === 'ar' ? 'معرف المحتوى (Content ID)' : 'DGR Content ID'}
                placeholder="910"
                value={data.dgContentId}
                onChange={e => { upd('dgContentId', e.target.value); clearError && clearError('pkg_dgContentId'); }}
                error={Boolean(errors.pkg_dgContentId)}
                helperText={errors.pkg_dgContentId}
                required
                half
              />

              <DaisyInput
                dataFieldKey="pkg_properShippingName"
                id="field-pkg_properShippingName"
                label={lang === 'ar' ? 'اسم الشحن المعتمد (Proper Shipping Name)' : 'Proper Shipping Name'}
                placeholder="PERFUMERY PRODUCTS WITH FLAMMABLE SOLVENTS"
                value={data.properShippingName}
                onChange={e => { upd('properShippingName', e.target.value); clearError && clearError('pkg_properShippingName'); }}
                error={Boolean(errors.pkg_properShippingName)}
                helperText={errors.pkg_properShippingName}
                required
              />

              <DaisyInput
                dataFieldKey="pkg_dgMarks"
                id="field-pkg_dgMarks"
                label={lang === 'ar' ? 'بيان وعلامات المواد الخطرة' : 'DGR Marks / Custom Description'}
                placeholder="DANGEROUS GOODS AS PER ASSOCIATED DGD"
                value={data.dgMarks}
                onChange={e => { upd('dgMarks', e.target.value); clearError && clearError('pkg_dgMarks'); }}
                error={Boolean(errors.pkg_dgMarks)}
                helperText={errors.pkg_dgMarks}
                required
              />
            </div>
          </div>
        )}
      </div>

      {/* Multiple Packages / Parcels Editor */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between pb-2 border-b border-base-200">
          <span className="text-xs font-bold text-base-content">
            📦 {lang === 'ar' ? 'قائمة الطرود والقطع' : 'Parcels & Packages List'} ({packages.length})
          </span>
          <button
            type="button"
            onClick={() => {
              const newPkg = {
                id: Date.now(),
                description: 'General Cargo',
                qty: '1',
                weight: '1.0',
                length: '20',
                width: '15',
                height: '10',
                value: '15.00',
                pkgType: data.pkgType || 'Box'
              };
              const updated = [...packages, newPkg];
              const totalW = updated.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
              setData(d => ({ ...d, packagesList: updated, weight: totalW.toFixed(2) }));
            }}
            className="btn btn-xs btn-primary gap-1 font-bold"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            {lang === 'ar' ? 'إضافة طرد إضافي' : 'Add Another Package'}
          </button>
        </div>

        {packages.map((item, idx) => {
          const l = parseFloat(item.length) || 1;
          const w = parseFloat(item.width) || 1;
          const h = parseFloat(item.height) || 1;
          const volWeight = ((l * w * h) / 5000).toFixed(2);
          const pfxKey = idx === 0 ? 'pkg' : `pkg_${idx}`;

          return (
            <div key={item.id || idx} className="p-4 rounded-xl border border-base-200 bg-base-200/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-base-content">
                  <span className="badge badge-sm badge-neutral font-mono font-bold">#{idx + 1}</span>
                  <span>{item.description || 'Cargo Item'}</span>
                </div>
                {packages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = packages.filter((_, i) => i !== idx);
                      const totalW = updated.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
                      setData(d => ({ ...d, packagesList: updated, weight: totalW.toFixed(2) }));
                    }}
                    className="btn btn-ghost btn-xs text-error hover:bg-error/10 gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    {lang === 'ar' ? 'حذف' : 'Remove'}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <DaisyInput
                  dataFieldKey={idx === 0 ? 'pkg_description' : `pkg_${idx}_description`}
                  id={`field-${idx === 0 ? 'pkg_description' : `pkg_${idx}_description`}`}
                  label={lang === 'ar' ? 'وصف المحتوى' : 'Content Description'}
                  placeholder="e.g. Electronic components, apparel, medical supplies"
                  value={item.description}
                  onChange={(e) => {
                    const val = e.target.value;
                    const updated = packages.map((p, i) => i === idx ? { ...p, description: val } : p);
                    setData(d => ({ ...d, packagesList: updated, description: idx === 0 ? val : d.description }));
                    clearError && clearError(idx === 0 ? 'pkg_description' : `pkg_${idx}_description`);
                  }}
                  icon="subject"
                  error={Boolean(errors[idx === 0 ? 'pkg_description' : `pkg_${idx}_description`])}
                  helperText={errors[idx === 0 ? 'pkg_description' : `pkg_${idx}_description`]}
                  required
                />

                <DaisyInput
                  dataFieldKey={idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`}
                  id={`field-${idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`}`}
                  label={lang === 'ar' ? 'الكمية (قطع)' : 'Quantity (pieces)'}
                  placeholder="1"
                  value={item.qty}
                  onChange={(e) => {
                    const val = e.target.value;
                    const updated = packages.map((p, i) => i === idx ? { ...p, qty: val } : p);
                    setData(d => ({ ...d, packagesList: updated, qty: idx === 0 ? val : d.qty }));
                    clearError && clearError(idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`);
                  }}
                  type="number"
                  icon="pin"
                  error={Boolean(errors[idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`])}
                  helperText={errors[idx === 0 ? 'pkg_qty' : `pkg_${idx}_qty`]}
                  required
                  half
                />

                <DaisyInput
                  dataFieldKey={idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`}
                  id={`field-${idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`}`}
                  label={lang === 'ar' ? 'الوزن الفعلي (كجم)' : 'Gross Weight (kg)'}
                  placeholder="1.0"
                  value={item.weight}
                  onChange={(e) => {
                    const val = e.target.value;
                    const updated = packages.map((p, i) => i === idx ? { ...p, weight: val } : p);
                    const totalW = updated.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
                    setData(d => ({ ...d, packagesList: updated, weight: totalW.toFixed(2) }));
                    clearError && clearError(idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`);
                  }}
                  type="number"
                  icon="scale"
                  error={Boolean(errors[idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`])}
                  helperText={errors[idx === 0 ? 'pkg_weight' : `pkg_${idx}_weight`]}
                  required
                  half
                />

                {/* Dimensions L x W x H */}
                <div className="flex gap-2 w-full md:w-[calc(50%-0.375rem)]">
                  <DaisyInput
                    dataFieldKey={idx === 0 ? 'pkg_length' : `pkg_${idx}_length`}
                    id={`field-${idx === 0 ? 'pkg_length' : `pkg_${idx}_length`}`}
                    label={lang === 'ar' ? 'الطول (سم)' : 'L (cm)'}
                    placeholder="20"
                    value={item.length}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = packages.map((p, i) => i === idx ? { ...p, length: val } : p);
                      setData(d => ({ ...d, packagesList: updated, length: idx === 0 ? val : d.length }));
                      clearError && clearError(idx === 0 ? 'pkg_length' : `pkg_${idx}_length`);
                    }}
                    type="number"
                    error={Boolean(errors[idx === 0 ? 'pkg_length' : `pkg_${idx}_length`])}
                    required
                  />
                  <DaisyInput
                    dataFieldKey={idx === 0 ? 'pkg_width' : `pkg_${idx}_width`}
                    id={`field-${idx === 0 ? 'pkg_width' : `pkg_${idx}_width`}`}
                    label={lang === 'ar' ? 'العرض (سم)' : 'W (cm)'}
                    placeholder="15"
                    value={item.width}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = packages.map((p, i) => i === idx ? { ...p, width: val } : p);
                      setData(d => ({ ...d, packagesList: updated, width: idx === 0 ? val : d.width }));
                      clearError && clearError(idx === 0 ? 'pkg_width' : `pkg_${idx}_width`);
                    }}
                    type="number"
                    error={Boolean(errors[idx === 0 ? 'pkg_width' : `pkg_${idx}_width`])}
                    required
                  />
                  <DaisyInput
                    dataFieldKey={idx === 0 ? 'pkg_height' : `pkg_${idx}_height`}
                    id={`field-${idx === 0 ? 'pkg_height' : `pkg_${idx}_height`}`}
                    label={lang === 'ar' ? 'الارتفاع (سم)' : 'H (cm)'}
                    placeholder="10"
                    value={item.height}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = packages.map((p, i) => i === idx ? { ...p, height: val } : p);
                      setData(d => ({ ...d, packagesList: updated, height: idx === 0 ? val : d.height }));
                      clearError && clearError(idx === 0 ? 'pkg_height' : `pkg_${idx}_height`);
                    }}
                    type="number"
                    error={Boolean(errors[idx === 0 ? 'pkg_height' : `pkg_${idx}_height`])}
                    required
                  />
                </div>

                <div className="w-full md:w-[calc(50%-0.375rem)] flex items-end">
                  <div className="w-full p-2.5 rounded-lg border border-base-200 bg-base-100 flex items-center justify-between text-xs">
                    <span className="text-base-content/60 font-medium">📐 {lang === 'ar' ? 'الوزن الحجمي التقديري:' : 'Volumetric Weight:'}</span>
                    <span className="font-mono font-bold text-primary">{volWeight} kg</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save Template Modal */}
      {showSaveModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-base text-base-content">
              {lang === 'ar' ? 'حفظ مواصفات الطرد كقالب دائم' : 'Save Package Specs as Preset Template'}
            </h3>
            <p className="text-xs text-base-content/60 py-2">
              {lang === 'ar' ? 'أدخل اسماً مميزاً للقالب لإعادة استخدامه بنقرة واحدة لاحقاً.' : 'Give this template a descriptive name to apply these dimensions and cargo properties in 1-click.'}
            </p>
            <div className="py-2">
              <input
                type="text"
                placeholder="e.g. Standard 5kg Perfume Box"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="input input-bordered input-sm w-full bg-base-100"
              />
            </div>
            <div className="modal-action">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="btn btn-sm btn-ghost"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSaveModalSubmit}
                disabled={!templateName.trim()}
                className="btn btn-sm btn-primary"
              >
                {lang === 'ar' ? 'حفظ القالب' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Step 4: Service & Carrier Selection ────────────────────────
const ServiceStep = ({
  data,
  setData,
  assignedCarrierCode,
  quoteRates = [],
  loadingQuotes = false,
  onRefreshQuotes,
  errors = {},
  clearError
}) => {
  const { lang } = useLanguage();
  const upd = (k, v) => setData(d => ({ ...d, [k]: v }));

  const rates = quoteRates.length > 0 ? quoteRates : [
    {
      carrierCode: 'DGR',
      carrierName: 'DHL Express Global',
      serviceCode: 'P',
      serviceName: 'Express Worldwide (P)',
      badge: 'Express Air Network',
      color: '#D40511',
      bg: '#FEF2F2',
      icon: 'flight_takeoff',
      desc: 'Worldwide priority express with customs clearance and door-to-door courier.',
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
      desc: 'Specialized overland trucking across Kuwait, UAE, KSA, Qatar, Bahrain, and Oman with COD support.',
      totalPrice: 6.300,
      eta: '3–5 Business Days'
    },
    {
      carrierCode: 'INTERNAL',
      carrierName: 'Target Dedicated Fleet',
      serviceCode: 'INTERNAL_STD',
      serviceName: 'Domestic Local Fleet Dispatch',
      badge: 'Domestic Same-Day',
      color: '#059669',
      bg: '#ECFDF5',
      icon: 'electric_rickshaw',
      desc: 'Target Logistics domestic courier dispatch & same-day local distribution.',
      totalPrice: 3.500,
      eta: 'Same-Day / Next-Day'
    }
  ];

  const selectedAddons = data.selectedAddons || [];

  const toggleAddon = (addon) => {
    const exists = selectedAddons.some(a => a.serviceCode === addon.serviceCode);
    const updated = exists
      ? selectedAddons.filter(a => a.serviceCode !== addon.serviceCode)
      : [...selectedAddons, addon];
    setData(d => ({ ...d, selectedAddons: updated }));
  };

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-5 md:p-6 space-y-6">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-base-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <span className="material-symbols-outlined text-2xl">local_shipping</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-base-content">{lang === 'ar' ? 'اختيار شركة الشحن والأسعار المباشرة' : 'Carrier Network & Live Adapter Quotes'}</h2>
            <p className="text-xs text-base-content/60">{lang === 'ar' ? 'مقارنة أسعار الشحن المباشرة والخدمات الإضافية وجدولة الاستلام' : 'Real-time rate quoting via direct carrier adapters with optional value-added services'}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefreshQuotes}
          disabled={loadingQuotes}
          className="btn btn-xs btn-outline border-base-300 hover:border-primary gap-1.5 text-xs font-bold"
        >
          <span className={`material-symbols-outlined text-sm ${loadingQuotes ? 'animate-spin' : ''}`}>
            sync
          </span>
          {loadingQuotes ? (lang === 'ar' ? 'جاري التسعير...' : 'Calculating...') : (lang === 'ar' ? 'تحديث الأسعار' : 'Refresh Rates')}
        </button>
      </div>

      {/* Carrier Selection Radio Cards */}
      <div
        data-field-key="service_carrierCode"
        id="field-service_carrierCode"
        className="space-y-3"
      >
        <div className="flex justify-between items-baseline mb-1">
          <label className="text-xs font-bold text-base-content/80">
            {lang === 'ar' ? 'اختر الناقل المناسب' : 'Select Authorized Logistics Gateway'} <span className="text-error font-black">*</span>
          </label>
          {errors.service_carrierCode && (
            <span className="text-[11px] font-semibold text-error">
              {errors.service_carrierCode}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {rates.map(rate => {
            const isSelected = data.carrierCode === rate.carrierCode;
            const carrierMeta = KNOWN_CARRIERS[rate.carrierCode] || {
              name: rate.carrierName || rate.carrierCode,
              badge: rate.serviceName || 'Express Service',
              color: '#0050d4',
              icon: 'local_shipping',
              desc: rate.serviceName || 'Direct carrier booking'
            };

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
                    currency: rate.currency || 'KWD'
                  }));
                  clearError && clearError('service_carrierCode');
                }}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                    : 'border-base-200 bg-base-100 hover:border-base-300'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-primary' : 'border-base-content/30'
                  }`}>
                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </div>

                  <div className="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl" style={{ color: carrierMeta.color }}>
                      {carrierMeta.icon}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-base-content">{carrierMeta.name}</span>
                      <span className="badge badge-sm badge-outline font-semibold">{carrierMeta.badge}</span>
                      {assignedCarrierCode === rate.carrierCode && (
                        <span className="badge badge-sm badge-success text-success-content font-bold">★ Assigned</span>
                      )}
                    </div>
                    <div className="text-xs text-base-content/60 mt-0.5">{carrierMeta.desc}</div>
                    <div className="text-[11px] text-base-content/50 mt-1 flex items-center gap-2">
                      <span>⏱️ <strong>{rate.eta || '1–3 Business Days'}</strong></span>
                      {rate.serviceCode && <span>• Code: <strong>{rate.serviceCode}</strong></span>}
                    </div>
                  </div>
                </div>

                <div className="text-right flex sm:flex-col items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-base-200">
                  <div className="text-[10px] uppercase font-bold text-base-content/50">{lang === 'ar' ? 'سعر الشحن' : 'Live Carrier Rate'}</div>
                  <div className="text-lg font-black text-primary font-mono">
                    {rate.totalPrice !== null && rate.totalPrice !== undefined
                      ? `${rate.currency || 'KWD'} ${Number(rate.totalPrice).toFixed(3)}`
                      : 'Manual Rating'}
                  </div>
                  <div className="text-[10px] text-success font-bold">✓ Standard Customs Included</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Value-Added Services & Addons */}
      <div className="space-y-3 pt-2">
        <label className="text-xs font-bold text-base-content/80 select-none">
          ✨ {lang === 'ar' ? 'الخدمات الإضافية الاختيارية' : 'Value-Added Services & Priority Add-ons'}
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DEFAULT_CARRIER_ADDONS.paid.map(addon => {
            const isChecked = selectedAddons.some(a => a.serviceCode === addon.serviceCode);
            return (
              <div
                key={addon.serviceCode}
                onClick={() => toggleAddon(addon)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  isChecked ? 'border-primary bg-primary/5' : 'border-base-200 bg-base-200/20 hover:bg-base-200/40'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="checkbox checkbox-primary checkbox-sm pointer-events-none"
                  />
                  <div>
                    <div className="text-xs font-bold text-base-content">{addon.serviceName}</div>
                    <div className="text-[10px] text-base-content/60">{addon.desc}</div>
                  </div>
                </div>
                <span className="badge badge-sm badge-neutral font-mono font-bold shrink-0">
                  +{Number(addon.price).toFixed(3)} KWD
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Courier Pickup Logistics */}
      <div className="p-4 rounded-xl border border-base-200 bg-base-200/20 space-y-4 pt-4">
        <label className="text-xs font-bold text-base-content/80 select-none flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base text-primary">event_available</span>
          {lang === 'ar' ? 'جدولة استلام الطرد' : 'Pickup & Drop-off Logistics'}
        </label>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-4 w-full">
            <label className="label cursor-pointer gap-2">
              <input
                type="radio"
                name="pickupType"
                checked={data.pickupType?.includes('Pickup')}
                onChange={() => upd('pickupType', 'Schedule Driver Pickup')}
                className="radio radio-primary radio-sm"
              />
              <span className="text-xs font-bold text-base-content">{lang === 'ar' ? 'طلب مندوب استلام' : 'Schedule Driver Pickup'}</span>
            </label>

            <label className="label cursor-pointer gap-2">
              <input
                type="radio"
                name="pickupType"
                checked={data.pickupType?.includes('Drop-off')}
                onChange={() => upd('pickupType', 'Drop-off at Target Hub')}
                className="radio radio-primary radio-sm"
              />
              <span className="text-xs font-bold text-base-content">{lang === 'ar' ? 'تسليم في فرع تارجت' : 'Drop-off at Target Hub'}</span>
            </label>
          </div>

          {data.pickupType?.includes('Pickup') && (
            <>
              <DaisyInput
                label={lang === 'ar' ? 'تاريخ الاستلام' : 'Pickup Date'}
                type="date"
                value={data.pickupDate}
                onChange={e => upd('pickupDate', e.target.value)}
                half
              />

              <div className="form-control w-full md:w-[calc(50%-0.375rem)]">
                <label className="text-xs font-bold text-base-content/80 mb-1">
                  {lang === 'ar' ? 'الفترة الزمنية للاستلام' : 'Pickup Time Slot'}
                </label>
                <select
                  value={data.pickupTime || '9:00 AM – 12:00 PM'}
                  onChange={e => upd('pickupTime', e.target.value)}
                  className="select select-bordered select-sm w-full bg-base-100 text-xs font-medium focus:select-primary"
                >
                  <option value="9:00 AM – 12:00 PM">9:00 AM – 12:00 PM (Morning Priority)</option>
                  <option value="12:00 PM – 4:00 PM">12:00 PM – 4:00 PM (Afternoon Window)</option>
                  <option value="4:00 PM – 8:00 PM">4:00 PM – 8:00 PM (Evening Window)</option>
                </select>
              </div>
            </>
          )}

          <DaisyInput
            label={lang === 'ar' ? 'تعليمات خاصة للسائق' : 'Special Driver Instructions'}
            placeholder="e.g. Ring warehouse bell, gate 4 loading dock"
            value={data.instructions}
            onChange={e => upd('instructions', e.target.value)}
            icon="notes"
          />
        </div>
      </div>
    </div>
  );
};

// ── Step 5: Logistics & Customs Compliance ─────────────────────
const LogisticsStep = ({ customs, setCustoms, errors = {}, clearError }) => {
  const { lang } = useLanguage();
  const updCst = (k, v) => setCustoms(c => ({ ...c, [k]: v }));

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-5 md:p-6 space-y-6">
      {/* Step Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-base-200">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          <span className="material-symbols-outlined text-2xl">event_note</span>
        </div>
        <div>
          <h2 className="text-base font-bold text-base-content">{lang === 'ar' ? 'اللوجستيات والجمارك والفواتير التجارية' : 'Customs Compliance & Commercial Invoice'}</h2>
          <p className="text-xs text-base-content/60">{lang === 'ar' ? 'إدخال شروط التجارة الدولية (Incoterms) والقيمة المصرحة للتخليص الجمركي' : 'Specify international trade terms, declared customs valuation and tariff classification'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Incoterms */}
        <div className="form-control w-full md:w-[calc(50%-0.375rem)]">
          <label className="text-xs font-bold text-base-content/80 mb-1">
            {lang === 'ar' ? 'شروط التجارة الدولية (Incoterms)' : 'Incoterms (Terms of Sale)'}
          </label>
          <select
            value={customs.incoterms || 'DAP – Delivered at Place'}
            onChange={e => updCst('incoterms', e.target.value)}
            className="select select-bordered select-sm w-full bg-base-100 text-xs font-medium focus:select-primary"
          >
            <option value="DAP – Delivered at Place">DAP – Delivered at Place (Standard)</option>
            <option value="DDP – Delivered Duty Paid">DDP – Delivered Duty Paid (Duties Billed to Shipper)</option>
            <option value="CIF – Cost, Insurance and Freight">CIF – Cost, Insurance and Freight</option>
            <option value="EXW – Ex Works">EXW – Ex Works</option>
            <option value="FOB – Free on Board">FOB – Free on Board</option>
          </select>
        </div>

        {/* Category */}
        <div className="form-control w-full md:w-[calc(50%-0.375rem)]">
          <label className="text-xs font-bold text-base-content/80 mb-1">
            {lang === 'ar' ? 'تصنيف الشحنة' : 'Shipment Category'}
          </label>
          <select
            value={customs.shipmentType || 'Commercial'}
            onChange={e => updCst('shipmentType', e.target.value)}
            className="select select-bordered select-sm w-full bg-base-100 text-xs font-medium focus:select-primary"
          >
            <option value="Commercial">Commercial Cargo / Merchandise</option>
            <option value="Personal">Personal Effects / Private Goods</option>
            <option value="Sample">Commercial Sample / Prototype</option>
            <option value="Return">Return for Repair / Warranty</option>
          </select>
        </div>

        <DaisyInput
          dataFieldKey="customs_invoiceNum"
          id="field-customs_invoiceNum"
          label={lang === 'ar' ? 'رقم الفاتورة التجارية' : 'Commercial Invoice Number'}
          placeholder="e.g. INV-2026-9042"
          value={customs.invoiceNum}
          onChange={e => { updCst('invoiceNum', e.target.value); clearError && clearError('customs_invoiceNum'); }}
          icon="receipt"
          error={Boolean(errors.customs_invoiceNum)}
          helperText={errors.customs_invoiceNum}
          required={customs.shipmentType === 'Commercial'}
          half
        />

        <DaisyInput
          dataFieldKey="customs_invoiceVal"
          id="field-customs_invoiceVal"
          label={lang === 'ar' ? 'القيمة الجمركية المصرحة' : 'Declared Customs Value'}
          placeholder="150.000"
          value={customs.invoiceVal}
          onChange={e => { updCst('invoiceVal', e.target.value); clearError && clearError('customs_invoiceVal'); }}
          type="number"
          icon="payments"
          error={Boolean(errors.customs_invoiceVal)}
          helperText={errors.customs_invoiceVal}
          required
          half
        />

        {/* Currency Select */}
        <div
          data-field-key="customs_currency"
          id="field-customs_currency"
          className="form-control w-full md:w-[calc(50%-0.375rem)]"
        >
          <div className="flex justify-between items-baseline mb-1 gap-2">
            <label className="text-xs font-bold text-base-content/80">
              {lang === 'ar' ? 'عملة الفاتورة' : 'Invoice Currency'} <span className="text-error font-black">*</span>
            </label>
            {errors.customs_currency && (
              <span className="text-[11px] font-semibold text-error">
                {errors.customs_currency}
              </span>
            )}
          </div>
          <select
            value={customs.currency || 'KWD'}
            onChange={e => { updCst('currency', e.target.value); clearError && clearError('customs_currency'); }}
            className={`select select-bordered select-sm w-full bg-base-100 text-xs font-mono font-bold ${
              errors.customs_currency ? 'select-error border-error' : 'focus:select-primary'
            }`}
          >
            <option value="KWD">KWD – Kuwaiti Dinar</option>
            <option value="SAR">SAR – Saudi Riyal</option>
            <option value="AED">AED – UAE Dirham</option>
            <option value="USD">USD – US Dollar</option>
            <option value="EUR">EUR – Euro</option>
          </select>
        </div>

        <DaisyInput
          dataFieldKey="customs_hsCode"
          id="field-customs_hsCode"
          label={lang === 'ar' ? 'رمز النظام المنسق (HS Tariff Code)' : 'HS Tariff Code'}
          placeholder="e.g. 3303.00.00 (Perfumes)"
          value={customs.hsCode}
          onChange={e => updCst('hsCode', e.target.value)}
          icon="tag"
          half
        />

        <DaisyInput
          dataFieldKey="customs_notes"
          id="field-customs_notes"
          label={lang === 'ar' ? 'ملاحظات وتصريحات التخليص الجمركي' : 'Customs Declaration Notes'}
          placeholder="Special customs clearance instructions, duty payment account numbers, or COO details"
          value={customs.notes}
          onChange={e => updCst('notes', e.target.value)}
          icon="description"
        />
      </div>
    </div>
  );
};

// ── Step 6: Review & Final Confirmation ────────────────────────
const ReviewStep = ({ sender, receiver, pkg, service, customs, confirmed, setConfirmed, isTestMode, errors = {}, clearError }) => {
  const { lang } = useLanguage();
  const declaredVal = parseFloat(customs.invoiceVal || pkg.value) || 0;
  const insurancePremium = pkg.insurance ? Math.max(2.5, declaredVal * 0.01).toFixed(3) : '0.000';
  const selectedAddons = service.selectedAddons || [];
  const addonsSurcharge = selectedAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const baseRate = Number(service.quotedPrice) || 0;
  const grandTotal = baseRate > 0 ? (baseRate + addonsSurcharge).toFixed(3) : null;
  const packagesList = pkg.packagesList && pkg.packagesList.length > 0 ? pkg.packagesList : [pkg];

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200/80 p-5 md:p-6 space-y-6">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-base-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <span className="material-symbols-outlined text-2xl">fact_check</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-base-content">{lang === 'ar' ? 'مراجعة وتأكيد بيان الشحنة' : 'Review & Confirm Dispatch Manifest'}</h2>
            <p className="text-xs text-base-content/60">{lang === 'ar' ? 'يرجى تدقيق جميع التفاصيل قبل إصدار بوليصة الشحن الرسمية' : 'Audit consignee, cargo particulars, and rate breakdown before generating airway bill'}</p>
          </div>
        </div>

        {isTestMode && (
          <span className="badge badge-warning font-bold gap-1 text-xs">
            🧪 Sandbox Test Booking
          </span>
        )}
      </div>

      {/* Origin & Destination Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Shipper */}
        <div className="p-4 rounded-xl border border-base-200 bg-base-200/30 space-y-1.5 text-xs">
          <div className="flex items-center gap-2 font-bold text-primary text-sm pb-1 border-b border-base-200">
            <span className="material-symbols-outlined text-base">flight_takeoff</span>
            {lang === 'ar' ? 'الراسل (المصدر)' : 'Shipper (Origin)'}
          </div>
          <div className="font-bold text-sm text-base-content pt-1">{sender.name || '—'}</div>
          {sender.company && <div className="text-base-content/70">{sender.company}</div>}
          <div className="text-base-content/60 font-mono">
            {sender.phoneCountryCode} {sender.phone} • {sender.email}
          </div>
          {sender.taxId && <div className="text-base-content/70">Tax ID: <strong>{sender.taxId}</strong></div>}
          <div className="text-base-content/80 pt-1">
            {sender.addr1}{sender.area ? `, ${sender.area}` : ''}, {sender.city}, {sender.country}
          </div>
        </div>

        {/* Consignee */}
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-1.5 text-xs">
          <div className="flex items-center gap-2 font-bold text-primary text-sm pb-1 border-b border-primary/20">
            <span className="material-symbols-outlined text-base">flight_land</span>
            {lang === 'ar' ? 'المستلم (الوجهة)' : 'Consignee (Destination)'}
          </div>
          <div className="font-bold text-sm text-base-content pt-1">{receiver.name || '—'}</div>
          {receiver.company && <div className="text-base-content/70">{receiver.company}</div>}
          <div className="text-base-content/60 font-mono">
            {receiver.phoneCountryCode} {receiver.phone} • {receiver.email}
          </div>
          {receiver.taxId && <div className="text-base-content/70">Customs / CR: <strong>{receiver.taxId}</strong></div>}
          <div className="text-base-content/80 pt-1">
            {receiver.addr1}{receiver.area ? `, ${receiver.area}` : ''}, {receiver.city}, {receiver.country}
          </div>
        </div>
      </div>

      {/* Cargo Particulars */}
      <div className="p-4 rounded-xl border border-base-200 bg-base-100 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-base-200 text-xs font-bold text-base-content">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">inventory_2</span>
            {lang === 'ar' ? 'مواصفات الطرود والقطع' : 'Consignment Cargo Manifest'}
          </div>
          <span className="badge badge-sm badge-neutral font-bold">
            {packagesList.length} Piece{packagesList.length > 1 ? 's' : ''} • {pkg.weight || 1} kg total
          </span>
        </div>

        <div className="space-y-2">
          {packagesList.map((p, pIdx) => (
            <div key={p.id || pIdx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs py-1 border-b border-base-200/50 last:border-b-0">
              <div className="font-bold text-base-content">
                #{pIdx + 1}: {p.description || 'General Cargo'} ({p.pkgType || 'Box'})
              </div>
              <div className="text-base-content/60 font-mono text-[11px]">
                Qty: <strong>{p.qty || 1}</strong> • Weight: <strong>{p.weight || 1} kg</strong> • Dims: {p.length || 20}×{p.width || 15}×{p.height || 10} cm
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {pkg.dangerousGoods && (
            <span className="badge badge-warning badge-sm font-bold gap-1">
              ⚠️ DG: {pkg.unCode || 'IATA Regulated'} ({pkg.dgClass || 'Hazardous'})
            </span>
          )}
          {pkg.insurance && (
            <span className="badge badge-success badge-sm font-bold gap-1 text-success-content">
              🛡️ Insured (+KD {insurancePremium})
            </span>
          )}
        </div>
      </div>

      {/* Carrier & Financial Breakdown */}
      <div className="p-4 rounded-xl border border-base-200 bg-base-200/20 space-y-2 text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-base-200">
          <div className="flex items-center gap-2 font-bold text-base-content">
            <span className="material-symbols-outlined text-base text-primary">local_shipping</span>
            {KNOWN_CARRIERS[service.carrierCode]?.name || service.carrierCode || 'Carrier Gateway'}
          </div>
          <span className="badge badge-sm badge-outline font-semibold">{service.serviceName || service.serviceCode}</span>
        </div>

        {selectedAddons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 py-1">
            {selectedAddons.map(a => (
              <span key={a.serviceCode} className="badge badge-xs badge-neutral">
                +{a.serviceName} ({Number(a.price).toFixed(3)} KWD)
              </span>
            ))}
          </div>
        )}

        {grandTotal && (
          <div className="flex items-center justify-between pt-2 border-t border-base-200">
            <span className="font-bold text-base-content">{lang === 'ar' ? 'إجمالي تكلفة الشحن المستحقة:' : 'Total Airway Bill Price:'}</span>
            <span className="text-base font-black text-primary font-mono">{grandTotal} KWD</span>
          </div>
        )}
      </div>

      {/* Confirmation Declaration Agreement Checkbox */}
      <div
        data-field-key="review_confirmed"
        id="field-review_confirmed"
        onClick={() => {
          setConfirmed(c => {
            const next = !c;
            if (next && clearError) clearError('review_confirmed');
            return next;
          });
        }}
        className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3.5 ${
          errors?.review_confirmed
            ? 'border-error bg-error/10'
            : (confirmed ? 'border-primary bg-primary/5' : 'border-base-200 bg-base-200/20 hover:bg-base-200/40')
        }`}
      >
        <input
          type="checkbox"
          checked={Boolean(confirmed)}
          onChange={() => {}}
          className={`checkbox checkbox-sm pointer-events-none ${errors?.review_confirmed ? 'checkbox-error' : 'checkbox-primary'}`}
        />
        <div className="flex-1 text-xs font-semibold text-base-content/90 select-none">
          {lang === 'ar'
            ? 'أقر بأن جميع بيانات البضائع والأوزان والقيم الجمركية المصرحة وتصنيفات المواد الخطرة الواردة أعلاه صحيحة ومطابقة للوائح الجمارك ومنظمة إياتا الدولية.'
            : 'I certify that all cargo particulars, weights, declared customs values, and hazardous material classifications provided are complete and accurate in accordance with IATA and GCC Customs regulations.'}
        </div>
      </div>
    </div>
  );
};

// ── Main Kinetic Shipment Wizard Component ─────────────────────
export const KineticShipmentWizard = ({ onClose, onComplete, editing }) => {
  const navigate = useNavigate();
  const { user, refreshUser, isStaff, isAdmin, isManager, isAccounting } = useAuth();
  const { lang, isRTL } = useLanguage();
  const { enqueueSnackbar } = useSnackbar();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdTn, setCreatedTn] = useState(null);
  const [createdShipment, setCreatedShipment] = useState(null);
  const [errors, setErrors] = useState({});
  const wizardContainerRef = useRef(null);

  const [isTestMode, setIsTestMode] = useState(false);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [assignedCarrierCode, setAssignedCarrierCode] = useState(null);

  const [userAddresses, setUserAddresses] = useState([]);
  const [clientAddresses, setClientAddresses] = useState([]);
  const [allAddressBooks, setAllAddressBooks] = useState([]);
  const [saveSenderToBook, setSaveSenderToBook] = useState(false);
  const [saveReceiverToBook, setSaveReceiverToBook] = useState(false);

  const [quoteRates, setQuoteRates] = useState([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

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

  // Top-of-form scroll on step advance
  useEffect(() => {
    if (wizardContainerRef.current) {
      wizardContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // Load assignable clients and address book
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
          } catch {
            // Fallback
          }
        }
        setClients(clientList);

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

  // Load shipment if editing
  useEffect(() => {
    if (editing?.trackingNumber) {
      const fetchExisting = async () => {
        try {
          const res = await shipmentService.getShipmentByTrackingNumber(editing.trackingNumber);
          const data = res.data?.data || res.data;
          if (data) {
            if (data.sender) {
              setSender(prev => ({
                ...prev,
                name: data.sender.contactPerson || data.sender.name || prev.name,
                company: data.sender.company || prev.company,
                phone: data.sender.phone || prev.phone,
                phoneCountryCode: data.sender.phoneCountryCode || prev.phoneCountryCode,
                email: data.sender.email || prev.email,
                taxId: data.sender.taxId || prev.taxId,
                addr1: data.sender.addressLine1 || data.sender.streetLines?.[0] || data.sender.addr1 || prev.addr1,
                addr2: data.sender.addressLine2 || data.sender.streetLines?.[1] || data.sender.addr2 || prev.addr2,
                area: data.sender.area || prev.area,
                city: data.sender.city || prev.city,
                country: data.sender.country || prev.country,
                countryCode: data.sender.countryCode || prev.countryCode,
                zip: data.sender.postalCode || data.sender.zip || prev.zip
              }));
            }
            if (data.receiver) {
              setReceiver(prev => ({
                ...prev,
                name: data.receiver.contactPerson || data.receiver.name || prev.name,
                company: data.receiver.company || prev.company,
                phone: data.receiver.phone || prev.phone,
                phoneCountryCode: data.receiver.phoneCountryCode || prev.phoneCountryCode,
                email: data.receiver.email || prev.email,
                taxId: data.receiver.taxId || prev.taxId,
                addr1: data.receiver.addressLine1 || data.receiver.streetLines?.[0] || data.receiver.addr1 || prev.addr1,
                addr2: data.receiver.addressLine2 || data.receiver.streetLines?.[1] || data.receiver.addr2 || prev.addr2,
                area: data.receiver.area || prev.area,
                city: data.receiver.city || prev.city,
                country: data.receiver.country || prev.country,
                countryCode: data.receiver.countryCode || prev.countryCode,
                zip: data.receiver.postalCode || data.receiver.zip || prev.zip,
                instructions: data.receiver.instructions || prev.instructions
              }));
            }
            if (data.packages?.length || data.parcels?.length) {
              const list = data.packages || data.parcels;
              setPkg(prev => ({
                ...prev,
                weight: String(list[0]?.weight || prev.weight),
                length: String(list[0]?.length || prev.length),
                width: String(list[0]?.width || prev.width),
                height: String(list[0]?.height || prev.height),
                description: list[0]?.description || prev.description,
                packagesList: list
              }));
            }
            if (data.carrierCode) {
              setService(prev => ({
                ...prev,
                carrierCode: data.carrierCode,
                carrierId: data.carrierCode,
                serviceCode: data.serviceCode || prev.serviceCode,
                quotedPrice: data.price || prev.quotedPrice
              }));
            }
          }
        } catch (e) {
          console.debug('Failed to load editing shipment:', e.message);
        }
      };
      fetchExisting();
    }
  }, [editing?.trackingNumber]);

  // Client Selection for Staff / Admin ("On Behalf Of")
  const handleClientChange = (clientId) => {
    setSelectedClientId(clientId);
    if (!clientId) {
      setAssignedCarrierCode(null);
      setClientAddresses([]);
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
      const cAddrs = Array.isArray(client.addresses) ? client.addresses : [];
      setClientAddresses(cAddrs);
      const carrier = client?.agentPolicy?.shippingAccess?.carrierCode || client?.carrierConfig?.preferredCarrier || 'DGR';
      const assignedService = client?.agentPolicy?.shippingAccess?.serviceCode || client?.carrierConfig?.serviceCode || 'P';
      setAssignedCarrierCode(carrier);

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

      setService(s => ({
        ...s,
        carrierCode: carrier,
        carrierId: carrier,
        serviceCode: assignedService
      }));

      enqueueSnackbar(`Loaded profile & policy for ${client.name}`, { variant: 'info' });
    }
  };

  const activeSenderAddresses = useMemo(() => {
    if (selectedClientId && clientAddresses.length > 0) return clientAddresses;
    return userAddresses.length > 0 ? userAddresses : allAddressBooks;
  }, [selectedClientId, clientAddresses, userAddresses, allAddressBooks]);

  const activeReceiverAddresses = useMemo(() => {
    if (selectedClientId && clientAddresses.length > 0) return clientAddresses;
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
          code: pkg.unCode || '',
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

      let quotes = [];
      try {
        const res = await api.post('/shipments/quote', payload);
        quotes = res.data?.data || [];
      } catch (err) {
        console.debug('Primary quote call fallback:', err.message);
      }

      if (quotes.length === 0) {
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

      const formatted = quotes.map(q => ({
        ...q,
        carrierCode: (q.carrier || q.carrierCode || 'DGR').toUpperCase(),
        carrierName: q.carrierName || KNOWN_CARRIERS[q.carrier?.toUpperCase()]?.name || q.carrier,
        serviceCode: q.serviceCode || 'STD',
        serviceName: q.serviceName || 'Express Service',
        totalPrice: q.totalPrice !== null && q.totalPrice !== undefined ? Number(q.totalPrice) : null,
        currency: q.currency || 'KWD',
        eta: q.estimatedDelivery ? new Date(q.estimatedDelivery).toLocaleDateString() : (q.eta || '2–3 Business Days')
      }));

      setQuoteRates(formatted);

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

  useEffect(() => {
    if (step === 4) {
      fetchCarrierQuotes();
    }
  }, [step, isTestMode, fetchCarrierQuotes]);

  const handleSaveAddressNow = async (addressData, addressType = 'Location') => {
    if (!addressData.name || !addressData.addr1) return;
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

      try {
        await api.post('/addresses', newAddr);
      } catch {
        await userService.updateProfile({ addresses: updatedUserAddrs });
      }

      if (refreshUser) await refreshUser();
    } catch (err) {
      console.debug('Failed to save address:', err.message);
    }
  };

  const handleSaveNewTemplate = (newTemplate) => {
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    try {
      localStorage.setItem('tl_package_templates', JSON.stringify(updated));
      shipmentService.savePackageTemplate(newTemplate).catch(() => {});
    } catch {
      // Ignore
    }
    enqueueSnackbar(`Package template "${newTemplate.name}" saved!`, { variant: 'success' });
  };

  const handleNext = () => {
    const form = { sender, receiver, pkg, service, customs, confirmed };
    const stepErrors = validateWizardStep(step, form, isRTL, lang);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      const alertMsg = getValidationAlertMessage(step, stepErrors, isRTL, lang);
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

      if (saveSenderToBook) handleSaveAddressNow(sender, 'Sender');
      if (saveReceiverToBook) handleSaveAddressNow(receiver, 'Receiver');

      const tn = res.data?.trackingNumber || ('TLG-' + Date.now().toString().slice(-8));
      const createdObj = { ...payload, trackingNumber: tn, id: res.data?.id || tn };
      setCreatedTn(tn);
      setCreatedShipment(createdObj);
      setSuccess(true);
      enqueueSnackbar(lang === 'ar' ? `تم إصدار البوليصة ${tn} بنجاح!` : `Shipment ${tn} created successfully!`, { variant: 'success' });
      if (onComplete) onComplete(createdObj);
    } catch (err) {
      enqueueSnackbar(err.message || 'Failed to create shipment', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

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

  // ── Success Confirmation Screen ──────────────────────────────
  if (success) {
    return (
      <div className="max-w-2xl mx-auto my-8 card bg-base-100 shadow-xl border border-base-200/80 p-6 md:p-10 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto text-success">
          <span className="material-symbols-outlined text-4xl">check_circle</span>
        </div>

        <div>
          <h2 className="text-xl md:text-2xl font-black text-base-content">
            {lang === 'ar' ? 'تم إصدار بوليصة الشحن وترحيلها بنجاح!' : 'Shipment Manifest Dispatched!'}
          </h2>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-xs text-base-content/60">{lang === 'ar' ? 'رقم التتبع:' : 'Tracking Number:'}</span>
            <span className="badge badge-lg badge-primary font-mono font-black text-sm px-3 py-1">
              #{createdTn}
            </span>
            {isTestMode && (
              <span className="badge badge-sm badge-warning font-bold">
                🧪 Sandbox
              </span>
            )}
          </div>
        </div>

        {/* Carrier Documents PDF Download Strip */}
        <div className="p-4 rounded-2xl bg-base-200/40 border border-base-200 space-y-3 text-start">
          <div className="flex items-center gap-2 text-xs font-bold text-base-content">
            <span className="material-symbols-outlined text-primary text-base">description</span>
            <span>{lang === 'ar' ? 'وثائق وبوالص الشحن الرسمية' : 'Official Carrier Documents & Labels'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleDownloadWaybill}
              className="btn btn-sm btn-outline border-base-300 hover:border-primary gap-2 font-bold text-xs"
            >
              <span className="material-symbols-outlined text-sm text-primary">print</span>
              {lang === 'ar' ? 'طباعة بوليصة الشحن (AWB)' : 'Download Airway Bill (AWB)'}
            </button>

            <button
              type="button"
              onClick={handleDownloadInvoice}
              className="btn btn-sm btn-outline border-base-300 hover:border-primary gap-2 font-bold text-xs"
            >
              <span className="material-symbols-outlined text-sm text-primary">receipt_long</span>
              {lang === 'ar' ? 'تحميل الفاتورة التجارية (PDF)' : 'Download Commercial Invoice'}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-base-200">
          <button
            type="button"
            onClick={() => navigate(`/shipment/${createdTn}`)}
            className="btn btn-primary btn-sm px-6 font-bold w-full sm:w-auto"
          >
            <span className="material-symbols-outlined text-sm">visibility</span>
            {lang === 'ar' ? 'فحص وتتبع الشحنة' : 'Inspect Consignment Dossier'}
          </button>

          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setCreatedTn(null);
              setConfirmed(false);
              setStep(1);
            }}
            className="btn btn-outline btn-sm px-6 font-bold w-full sm:w-auto"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            {lang === 'ar' ? 'إنشاء شحنة أخرى' : 'Create Another Shipment'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/shipments')}
            className="btn btn-ghost btn-sm text-xs font-semibold text-base-content/70 w-full sm:w-auto"
          >
            {lang === 'ar' ? 'العودة لقائمة الشحنات' : 'Return to Shipments'}
          </button>
        </div>
      </div>
    );
  }

  // ── Active Consignment Stats for Sidebar ─────────────────────
  const packagesList = pkg.packagesList && pkg.packagesList.length > 0 ? pkg.packagesList : [pkg];
  const totalWeight = packagesList.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) || parseFloat(pkg.weight) || 1;
  const declaredTotal = parseFloat(customs.invoiceVal || pkg.value) || 0;
  const addonsSurcharge = (service.selectedAddons || []).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const baseRate = Number(service.quotedPrice) || 0;
  const activePrice = baseRate > 0 ? (baseRate + addonsSurcharge).toFixed(3) : null;

  return (
    <div ref={wizardContainerRef} className="max-w-7xl mx-auto space-y-6">
      {/* Top Header & Context Cockpit */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">
            {lang === 'ar' ? 'تارجت للخدمات اللوجستية والشحن الدولي' : 'Target Logistics Global Operations'}
          </div>
          <h1 className="text-xl md:text-2xl font-black text-base-content flex items-center gap-2.5">
            {editing
              ? (lang === 'ar' ? 'تعديل بيانات الشحنة' : 'Edit Shipment')
              : (lang === 'ar' ? 'إصدار بوليصة شحن جديدة' : 'New Shipment Manifest')}
            {isTestMode && (
              <span className="badge badge-warning font-mono font-bold text-xs">
                🧪 Sandbox Mode
              </span>
            )}
          </h1>
          <p className="text-xs text-base-content/60 mt-0.5">
            {lang === 'ar'
              ? 'إنشاء ومزامنة بوالص الشحن المتعددة مع التخليص الجمركي وتصنيف المواد الخطرة'
              : 'End-to-end multi-carrier consignment dispatch with IATA DGR and automated customs compliance'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Admin / Staff / Manager "On Behalf Of" Client Scope */}
          {(isAdmin || isStaff || isManager || isAccounting) && clients.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-base-content/60">
                {lang === 'ar' ? 'حساب العميل:' : 'On Behalf Of:'}
              </span>
              <select
                value={selectedClientId}
                onChange={e => handleClientChange(e.target.value)}
                className="select select-bordered select-xs w-44 bg-base-100 text-xs font-semibold focus:select-primary"
              >
                <option value="">{user?.name || 'Direct Account'}</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.organization?.name || c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sandbox Toggle */}
          <button
            type="button"
            onClick={() => setIsTestMode(!isTestMode)}
            className={`btn btn-xs gap-1 font-bold ${
              isTestMode ? 'btn-warning' : 'btn-outline border-base-300 text-base-content/70 hover:border-warning'
            }`}
          >
            <span className="material-symbols-outlined text-sm">science</span>
            {isTestMode ? 'Sandbox Active' : 'Test Mode'}
          </button>

          <button
            type="button"
            onClick={handleBack}
            className="btn btn-xs btn-ghost text-base-content/60"
          >
            {lang === 'ar' ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>

      {/* Step Indicator Ribbon (DaisyUI Steps) */}
      <div className="card bg-base-100 shadow-sm border border-base-200/80 p-4 overflow-x-auto">
        <ul className="steps steps-horizontal w-full min-w-[600px]">
          {WIZARD_STEPS.map((s) => {
            const isCompleted = step > s.id;
            const isCurrent = step === s.id;
            return (
              <li
                key={s.id}
                onClick={() => {
                  if (s.id < step) setStep(s.id);
                }}
                className={`step cursor-pointer transition-all ${
                  isCurrent || isCompleted ? 'step-primary font-bold text-xs' : 'font-medium text-xs text-base-content/50'
                }`}
                data-content={isCompleted ? '✓' : s.id}
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm hidden sm:inline">{s.icon}</span>
                  <span>{lang === 'ar' ? (s.labelAr || s.label) : s.label}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Two-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Active Step Form */}
        <div className="lg:col-span-8 space-y-6">
          {step === 1 && (
            <AddressStep
              title={lang === 'ar' ? 'بيانات الراسل (المصدر والشاحن)' : 'Sender & Shipper Origin'}
              subtitle={lang === 'ar' ? 'حدد اسم جهة الاتصال والعنوان الفعلي لاستلام الشحنة' : 'Provide shipper identity, pickup street address and contact details'}
              icon="flight_takeoff"
              data={sender}
              setData={setSender}
              savedAddresses={activeSenderAddresses}
              saveToBook={saveSenderToBook}
              setSaveToBook={setSaveSenderToBook}
              isReceiver={false}
              errors={errors}
              clearError={clearError}
              clearErrors={clearErrors}
            />
          )}

          {step === 2 && (
            <AddressStep
              title={lang === 'ar' ? 'بيانات المستلم (الوجهة والتسليم)' : 'Receiver & Consignee Destination'}
              subtitle={lang === 'ar' ? 'حدد تفاصيل المستلم وعنوان التسليم ورقم الهاتف للتواصل عبر واتساب' : 'Provide destination consignee name, delivery address and mobile contact'}
              icon="flight_land"
              data={receiver}
              setData={setReceiver}
              savedAddresses={activeReceiverAddresses}
              saveToBook={saveReceiverToBook}
              setSaveToBook={setSaveReceiverToBook}
              isReceiver={true}
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
              assignedCarrierCode={assignedCarrierCode}
              quoteRates={quoteRates}
              loadingQuotes={loadingQuotes}
              onRefreshQuotes={fetchCarrierQuotes}
              errors={errors}
              clearError={clearError}
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

        {/* Right Column: Sticky Summary & Navigation Cockpit */}
        <div className="lg:col-span-4 sticky top-6 space-y-4">
          <div className="card bg-base-100 shadow-sm border border-base-200/80 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-base-200">
              <span className="text-xs font-bold uppercase tracking-wider text-base-content/60">
                {lang === 'ar' ? 'ملخص البوليصة' : 'Manifest Dossier'}
              </span>
              <StatusBadge status={editing ? 'in_transit' : 'draft'} size="xs" />
            </div>

            {/* Dynamic Trade Route Display */}
            <div className="p-3 rounded-xl bg-base-200/40 border border-base-200">
              <TradeRouteDisplay
                origin={{ city: sender.city || 'Kuwait City', countryCode: sender.countryCode || 'KW' }}
                destination={{ city: receiver.city || 'Dubai', countryCode: receiver.countryCode || 'AE' }}
              />
            </div>

            {/* Consignment Metrics */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-base-200/50">
                <span className="text-base-content/60">{lang === 'ar' ? 'عدد الطرود:' : 'Total Packages:'}</span>
                <span className="font-bold text-base-content font-mono">{packagesList.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-base-200/50">
                <span className="text-base-content/60">{lang === 'ar' ? 'الوزن الإجمالي:' : 'Total Gross Weight:'}</span>
                <span className="font-bold text-base-content font-mono">{totalWeight} kg</span>
              </div>
              <div className="flex justify-between py-1 border-b border-base-200/50">
                <span className="text-base-content/60">{lang === 'ar' ? 'الناقل المعتمد:' : 'Selected Carrier:'}</span>
                <span className="font-bold text-primary">{KNOWN_CARRIERS[service.carrierCode]?.name || service.carrierCode}</span>
              </div>
              {declaredTotal > 0 && (
                <div className="flex justify-between py-1 border-b border-base-200/50">
                  <span className="text-base-content/60">{lang === 'ar' ? 'القيمة المصرحة:' : 'Declared Value:'}</span>
                  <span className="font-bold text-base-content font-mono">{declaredTotal} {customs.currency || 'KWD'}</span>
                </div>
              )}
            </div>

            {/* Dangerous Goods Flag */}
            {pkg.dangerousGoods && (
              <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/30 flex items-center gap-2 text-xs font-bold text-warning-content">
                <span className="material-symbols-outlined text-sm text-warning">warning</span>
                <span>IATA DGR: {pkg.unCode || 'Regulated Cargo'}</span>
              </div>
            )}

            {/* Live Rate Total */}
            {activePrice && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-base-content/50">{lang === 'ar' ? 'سعر الشحن التقديري' : 'Estimated Airway Bill'}</div>
                  <div className="text-xs text-base-content/60">{service.serviceName || 'Express Rate'}</div>
                </div>
                <div className="text-lg font-black text-primary font-mono">{activePrice} KWD</div>
              </div>
            )}

            {/* Stepper Navigation Buttons */}
            <div className="space-y-2 pt-2 border-t border-base-200">
              {step < 6 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="btn btn-primary w-full btn-sm font-bold shadow-md shadow-primary/20 gap-2"
                >
                  <span>{lang === 'ar' ? 'الخطوة التالية (Next Step)' : 'Next Step'}</span>
                  <span className="material-symbols-outlined text-sm">{isRTL ? 'arrow_back' : 'arrow_forward'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={submitting}
                  className="btn btn-primary w-full font-bold shadow-lg shadow-primary/25 gap-2"
                >
                  {submitting ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <span className="material-symbols-outlined text-base">rocket_launch</span>
                  )}
                  <span>
                    {submitting
                      ? (lang === 'ar' ? 'جاري الإصدار والترحيل...' : 'Dispatching Manifest...')
                      : (lang === 'ar' ? 'إصدار وترحيل بوليصة الشحن' : 'Dispatch Shipment & Issue Waybill')}
                  </span>
                </button>
              )}

              <div className="flex gap-2">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="btn btn-outline btn-sm flex-1 font-semibold"
                  >
                    <span className="material-symbols-outlined text-sm">{isRTL ? 'arrow_forward' : 'arrow_back'}</span>
                    <span>{lang === 'ar' ? 'السابق' : 'Previous'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onClose ? onClose() : navigate(-1)}
                  className="btn btn-ghost btn-sm text-xs font-semibold text-base-content/60"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KineticShipmentWizard;
