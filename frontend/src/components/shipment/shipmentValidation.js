/**
 * shipmentValidation.js
 * Carrier-aware required field matrix and validation engine for KineticShipmentWizard.
 * Enforces specific rules for DHL Express DGR ('DGR'), LogesTechs GCC Ground ('OTE'),
 * non-postal countries, dangerous goods, and cross-border customs.
 */

export const NON_POSTAL_COUNTRIES = ['KW', 'AE', 'QA', 'BH', 'OM', 'HK', 'IE'];

export const FIELD_LABELS = {
  sender_name: { en: 'Sender Name', ar: 'اسم الراسل' },
  sender_phone: { en: 'Sender Phone', ar: 'رقم هاتف الراسل' },
  sender_addr1: { en: 'Sender Address (Line 1)', ar: 'عنوان شارع الراسل' },
  sender_city: { en: 'Sender City', ar: 'مدينة الراسل' },
  sender_country: { en: 'Sender Country', ar: 'دولة الراسل' },
  sender_zip: { en: 'Sender Postal / ZIP Code', ar: 'الرمز البريدي للراسل' },

  receiver_name: { en: 'Receiver Name', ar: 'اسم المستلم' },
  receiver_phone: { en: 'Receiver Phone', ar: 'رقم هاتف المستلم' },
  receiver_addr1: { en: 'Receiver Address (Line 1)', ar: 'عنوان شارع المستلم' },
  receiver_city: { en: 'Receiver City', ar: 'مدينة المستلم' },
  receiver_country: { en: 'Receiver Country', ar: 'دولة المستلم' },
  receiver_zip: { en: 'Receiver Postal / ZIP Code', ar: 'الرمز البريدي للمستلم' },

  pkg_description: { en: 'Package Description', ar: 'وصف محتوى الطرد' },
  pkg_qty: { en: 'Package Quantity (> 0)', ar: 'الكمية (> 0)' },
  pkg_weight: { en: 'Package Weight (> 0 kg)', ar: 'الوزن (> 0 كجم)' },
  pkg_length: { en: 'Package Length (> 0 cm)', ar: 'الطول (> 0 سم)' },
  pkg_width: { en: 'Package Width (> 0 cm)', ar: 'العرض (> 0 سم)' },
  pkg_height: { en: 'Package Height (> 0 cm)', ar: 'الارتفاع (> 0 سم)' },

  pkg_unCode: { en: 'UN Identification Code', ar: 'رمز الأمم المتحدة UN' },
  pkg_dgClass: { en: 'Hazard Class', ar: 'فئة المواد الخطرة' },
  pkg_dgServiceCode: { en: 'Carrier Service Code (HE/HV/HK/HC)', ar: 'رمز خدمة المواد الخطرة' },
  pkg_dgContentId: { en: 'Content ID', ar: 'معرف المحتوى' },
  pkg_properShippingName: { en: 'Proper Shipping Name', ar: 'اسم الشحن المعتمد' },
  pkg_dgMarks: { en: 'DGR Marks / Custom Description', ar: 'بيان وعلامات المواد الخطرة' },

  service_carrierCode: { en: 'Carrier Selection', ar: 'اختيار شركة الشحن' },
  service_serviceCode: { en: 'Service Code Selection', ar: 'اختيار خدمة الشحن' },

  customs_invoiceVal: { en: 'Declared Customs Value (> 0)', ar: 'القيمة الجمركية المصرحة (> 0)' },
  customs_currency: { en: 'Invoice Currency', ar: 'عملة الفاتورة الجمركية' },
  customs_invoiceNum: { en: 'Commercial Invoice Number', ar: 'رقم الفاتورة التجارية' },

  review_confirmed: { en: 'Legal Declaration Agreement', ar: 'الموافقة على الإقرار القانوني' },
};

/**
 * Validates international phone format.
 * Must contain at least 6 digits and valid phone characters.
 */
export const isValidInternationalPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (!trimmed) return false;
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.length >= 6 && /^[\d\s+\-().]{6,25}$/.test(trimmed);
};

/**
 * Checks if country requires postal code.
 * Non-postal countries (KW, AE, QA, BH, OM, HK, IE) do not require postal code.
 */
export const isPostalCodeRequired = (countryCode) => {
  if (!countryCode) return true;
  return !NON_POSTAL_COUNTRIES.includes(String(countryCode).trim().toUpperCase());
};

const COUNTRY_NAME_TO_CODE = {
  'kuwait': 'KW',
  'united arab emirates': 'AE',
  'uae': 'AE',
  'saudi arabia': 'SA',
  'qatar': 'QA',
  'bahrain': 'BH',
  'oman': 'OM',
  'united states': 'US',
  'usa': 'US',
  'united kingdom': 'GB',
  'uk': 'GB',
  'germany': 'DE',
  'canada': 'CA',
  'hong kong': 'HK',
  'ireland': 'IE',
};

/**
 * Checks if shipment is international / cross-border, or requires customs invoice.
 */
export const isInternationalShipment = (sender = {}, receiver = {}, customs = {}) => {
  const getCode = (party) => {
    if (!party) return '';
    if (party.countryCode) return String(party.countryCode).trim().toUpperCase();
    if (party.country) {
      const lower = String(party.country).trim().toLowerCase();
      if (COUNTRY_NAME_TO_CODE[lower]) return COUNTRY_NAME_TO_CODE[lower];
      return String(party.country).trim().toUpperCase();
    }
    return '';
  };
  const sCountry = getCode(sender) || 'KW';
  const rCountry = getCode(receiver) || sCountry;
  const isCrossBorder = sCountry !== rCountry;
  const isCustoms = Boolean(customs?.shipmentType && customs.shipmentType !== 'Documents Only');
  return isCrossBorder || isCustoms;
};

/**
 * Checks if DHL DGR dangerous goods declarations are required.
 */
export const isDGRCargoRequired = (service = {}, pkg = {}, options = {}) => {
  const carrierCode = (typeof service === 'string' ? service : (service?.carrierCode || options?.carrierCode || '')).toUpperCase();
  if (pkg?.dangerousGoods) return true;
  if (options?.requireDGR || options?.isDGRCargo) return true;
  if (pkg?.unCode || pkg?.dgClass || pkg?.properShippingName) return true;
  if (carrierCode === 'DGR' && (pkg?.dangerousGoods || pkg?.unCode || options?.isDGRCargo)) {
    return true;
  }
  return false;
};

/**
 * Validates a single step (1-6) of the KineticShipmentWizard.
 * @param {number} step - Current step number (1 to 6)
 * @param {Object} state - Wizard state: { sender, receiver, pkg, service, customs, confirmed }
 * @param {Object} options - Validation options: { lang, requireDGR, isDGRCargo, carrierCode }
 * @returns {{ isValid: boolean, errors: Record<string, string>, failedKeys: string[] }}
 */
export const validateWizardStep = (step, state = {}, options = {}, maybeLang = 'en') => {
  const errors = {};
  const {
    sender = {},
    receiver = {},
    pkg = {},
    service = {},
    customs = {},
    confirmed = false
  } = state;
  const lang = (typeof options === 'object' && options !== null ? options.lang : null)
    || (typeof maybeLang === 'string' ? maybeLang : (typeof options === 'string' ? options : 'en'));

  if (step === 1) {
    // Step 1 (Sender)
    if (!sender.name || !String(sender.name).trim()) {
      errors.sender_name = lang === 'ar' ? 'اسم جهة اتصال الراسل مطلوب' : 'Contact Person / Name is required';
    }
    if (!isValidInternationalPhone(sender.phone)) {
      errors.sender_phone = lang === 'ar' ? 'رقم هاتف الراسل مطلوب بصيغة دولية' : 'Phone is required (international format)';
    }
    if (!sender.addr1 || !String(sender.addr1).trim()) {
      errors.sender_addr1 = lang === 'ar' ? 'عنوان شارع الراسل مطلوب' : 'Address Line 1 (Street) is required';
    }
    if (!sender.city || !String(sender.city).trim()) {
      errors.sender_city = lang === 'ar' ? 'مدينة الراسل مطلوبة' : 'City is required';
    }
    const sCountry = sender.countryCode || sender.country;
    if (!sCountry || !String(sCountry).trim()) {
      errors.sender_country = lang === 'ar' ? 'دولة الراسل مطلوبة' : 'Country is required';
    }
    const sCountryCode = (sender.countryCode || '').toUpperCase();
    if (isPostalCodeRequired(sCountryCode)) {
      if (!sender.zip || !String(sender.zip).trim() || String(sender.zip).trim() === '00000') {
        errors.sender_zip = lang === 'ar' ? 'الرمز البريدي مطلوب للدول البريدية' : 'Postal Code is required unless country is in non-postal list';
      }
    }
  } else if (step === 2) {
    // Step 2 (Receiver)
    if (!receiver.name || !String(receiver.name).trim()) {
      errors.receiver_name = lang === 'ar' ? 'اسم جهة اتصال المستلم مطلوب' : 'Contact Person / Name is required';
    }
    if (!isValidInternationalPhone(receiver.phone)) {
      errors.receiver_phone = lang === 'ar' ? 'رقم هاتف المستلم مطلوب بصيغة دولية' : 'Phone is required (international format)';
    }
    if (!receiver.addr1 || !String(receiver.addr1).trim()) {
      errors.receiver_addr1 = lang === 'ar' ? 'عنوان شارع المستلم مطلوب' : 'Address Line 1 (Street) is required';
    }
    if (!receiver.city || !String(receiver.city).trim()) {
      errors.receiver_city = lang === 'ar' ? 'مدينة المستلم مطلوبة' : 'City is required';
    }
    const rCountry = receiver.countryCode || receiver.country;
    if (!rCountry || !String(rCountry).trim()) {
      errors.receiver_country = lang === 'ar' ? 'دولة المستلم مطلوبة' : 'Country is required';
    }
    const rCountryCode = (receiver.countryCode || '').toUpperCase();
    if (isPostalCodeRequired(rCountryCode)) {
      if (!receiver.zip || !String(receiver.zip).trim() || String(receiver.zip).trim() === '00000') {
        errors.receiver_zip = lang === 'ar' ? 'الرمز البريدي مطلوب للدول البريدية' : 'Postal Code is required unless country is in non-postal list';
      }
    }
  } else if (step === 3) {
    // Step 3 (Package & Dangerous Goods)
    const packagesList = (pkg.packagesList && pkg.packagesList.length > 0)
      ? pkg.packagesList
      : [pkg];

    packagesList.forEach((p, idx) => {
      const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;
      if (!p.description || !String(p.description).trim()) {
        errors[`${pfx}_description`] = lang === 'ar' ? 'وصف الطرد مطلوب' : 'Package description is required';
      }
      const rawQty = p.qty !== undefined && p.qty !== null && String(p.qty).trim() !== '' ? p.qty : 1;
      const qty = Number(rawQty);
      if (isNaN(qty) || qty <= 0) {
        errors[`${pfx}_qty`] = lang === 'ar' ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity (> 0) is required';
      }
      const weight = Number(p.weight);
      if (isNaN(weight) || weight <= 0) {
        errors[`${pfx}_weight`] = lang === 'ar' ? 'الوزن يجب أن يكون أكبر من صفر' : 'Weight (> 0) is required';
      }
      const rawLength = p.length !== undefined && p.length !== null && String(p.length).trim() !== '' ? p.length : 10;
      const length = Number(rawLength);
      if (isNaN(length) || length <= 0) {
        errors[`${pfx}_length`] = lang === 'ar' ? 'الطول يجب أن يكون أكبر من صفر' : 'Package length (> 0) is required';
      }
      const rawWidth = p.width !== undefined && p.width !== null && String(p.width).trim() !== '' ? p.width : 10;
      const width = Number(rawWidth);
      if (isNaN(width) || width <= 0) {
        errors[`${pfx}_width`] = lang === 'ar' ? 'العرض يجب أن يكون أكبر من صفر' : 'Package width (> 0) is required';
      }
      const rawHeight = p.height !== undefined && p.height !== null && String(p.height).trim() !== '' ? p.height : 10;
      const height = Number(rawHeight);
      if (isNaN(height) || height <= 0) {
        errors[`${pfx}_height`] = lang === 'ar' ? 'الارتفاع يجب أن يكون أكبر من صفر' : 'Package height (> 0) is required';
      }
    });

    // Carrier-Specific (DHL DGR) / Dangerous Goods
    if (isDGRCargoRequired(service, pkg, options)) {
      if (!pkg.unCode || !String(pkg.unCode).trim()) {
        errors.pkg_unCode = lang === 'ar' ? 'رمز الأمم المتحدة (UN Code) مطلوب' : 'UN Code (e.g. UN1266, UN3481) is required';
      }
      if (!pkg.dgClass || !String(pkg.dgClass).trim()) {
        errors.pkg_dgClass = lang === 'ar' ? 'فئة الخطورة مطلوبة' : 'Hazard Class (e.g. Class 3, Class 9) is required';
      }
      if (!pkg.dgServiceCode || !String(pkg.dgServiceCode).trim()) {
        errors.pkg_dgServiceCode = lang === 'ar' ? 'رمز خدمة الناقل (HE, HV, HK, HC) مطلوب' : 'Service Code (HE, HV, HK, HC) is required';
      }
      if (!pkg.dgContentId || !String(pkg.dgContentId).trim()) {
        errors.pkg_dgContentId = lang === 'ar' ? 'معرف المحتوى (Content ID) مطلوب' : 'Content ID (e.g. 910, 967) is required';
      }
      if (!pkg.properShippingName || !String(pkg.properShippingName).trim()) {
        errors.pkg_properShippingName = lang === 'ar' ? 'اسم الشحن المعتمد مطلوب' : 'Proper Shipping Name is required';
      }
      if (!pkg.dgMarks || !String(pkg.dgMarks).trim()) {
        errors.pkg_dgMarks = lang === 'ar' ? 'بيان وعلامات المواد الخطرة مطلوب' : 'DGR Marks / Custom Description is required';
      }
    }
  } else if (step === 4) {
    // Step 4 (Service / Carrier)
    if (!service.carrierCode || !String(service.carrierCode).trim()) {
      errors.service_carrierCode = lang === 'ar' ? 'اختيار شركة الشحن مطلوب' : 'Carrier selection is required';
    }
  } else if (step === 5) {
    // Step 5 (Logistics & Customs)
    if (isInternationalShipment(sender, receiver, customs)) {
      const declaredVal = parseFloat(customs.invoiceVal || pkg.value);
      if (isNaN(declaredVal) || declaredVal <= 0) {
        errors.customs_invoiceVal = lang === 'ar' ? 'القيمة المصرحة (> 0) مطلوبة' : 'Declared Value (> 0) is required for international/customs shipments';
      }
      const curr = (customs.currency || pkg.currency || service.currency || 'KWD').trim();
      if (!curr) {
        errors.customs_currency = lang === 'ar' ? 'العملة مطلوبة' : 'Currency is required for international/customs shipments';
      }
      if (customs.shipmentType === 'Commercial' && (!customs.invoiceNum || !String(customs.invoiceNum).trim())) {
        errors.customs_invoiceNum = lang === 'ar' ? 'رقم الفاتورة التجارية مطلوب' : 'Invoice details are required for international/customs shipments';
      }
    }
  } else if (step === 6) {
    // Step 6 (Review)
    if (!confirmed) {
      errors.review_confirmed = lang === 'ar' ? 'الموافقة على الإقرار القانوني مطلوبة' : 'Legal declaration confirmation checkbox is required';
    }
  }

  const failedKeys = Object.keys(errors);
  Object.defineProperty(errors, 'isValid', { value: failedKeys.length === 0, enumerable: false, configurable: true });
  Object.defineProperty(errors, 'failedKeys', { value: failedKeys, enumerable: false, configurable: true });
  Object.defineProperty(errors, 'errors', { value: errors, enumerable: false, configurable: true });

  return errors;
};

/**
 * Builds localized notification string listing missing required fields.
 * Supports polymorphic arguments:
 * - getValidationAlertMessage(step, stepErrors, isRTL, lang)
 * - getValidationAlertMessage(failedKeysArray, lang)
 * - getValidationAlertMessage(errorsObject, lang)
 */
export const getValidationAlertMessage = (arg1 = [], arg2 = 'en', arg3 = false, arg4 = 'en') => {
  let failedKeys = [];
  let lang = 'en';

  if (typeof arg1 === 'number') {
    // Called as: getValidationAlertMessage(step, stepErrors, isRTL, lang)
    const errObj = arg2 || {};
    failedKeys = Array.isArray(errObj) ? errObj : Object.keys(errObj);
    lang = typeof arg4 === 'string' ? arg4 : (typeof arg3 === 'string' ? arg3 : 'en');
  } else if (Array.isArray(arg1)) {
    // Called as: getValidationAlertMessage(failedKeys, lang)
    failedKeys = arg1;
    lang = typeof arg2 === 'string' ? arg2 : 'en';
  } else if (typeof arg1 === 'object' && arg1 !== null) {
    // Called as: getValidationAlertMessage(errors, lang)
    failedKeys = Object.keys(arg1);
    lang = typeof arg2 === 'string' ? arg2 : 'en';
  }

  failedKeys = failedKeys.filter(k => k !== 'isValid' && k !== 'failedKeys' && k !== 'errors');

  const labels = failedKeys.map(k => {
    // Handle multi-package keys like pkg_1_description
    if (k.startsWith('pkg_') && k.includes('_')) {
      const parts = k.split('_');
      if (parts.length === 3) {
        const idx = Number(parts[1]) + 1;
        const subField = parts[2];
        const base = FIELD_LABELS[`pkg_${subField}`] || FIELD_LABELS.pkg_description;
        return lang === 'ar' ? `${base.ar} (طرد #${idx})` : `${base.en} (Package #${idx})`;
      }
    }
    const entry = FIELD_LABELS[k];
    if (!entry) return k;
    return lang === 'ar' ? entry.ar : entry.en;
  });

  if (lang === 'ar') {
    return `يرجى استكمال ${failedKeys.length} من الحقول الإلزامية: ${labels.join('، ')}`;
  }
  return `Please resolve ${failedKeys.length} required field(s): ${labels.join(', ')}`;
};
