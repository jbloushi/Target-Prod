import { NON_POSTAL_COUNTRIES, isPostalCodeRequired, isValidInternationalPhone } from '../../../components/shipment/shipmentValidation';
import { DG_PRESET_OPTIONS, DEFAULT_PACKAGE_TEMPLATES } from '../../../components/shipment/KineticShipmentWizard';

export const VOLUMETRIC_DIVISOR = 5000;
export const SANDBOX_DEFAULT_PHONE = '+201040957289';
export const SANDBOX_DEFAULT_DIAL_CODE = '+20';
export const SANDBOX_DEFAULT_LOCAL_PHONE = '1040957289';

export { NON_POSTAL_COUNTRIES, isPostalCodeRequired, isValidInternationalPhone, DG_PRESET_OPTIONS, DEFAULT_PACKAGE_TEMPLATES };

/**
 * Calculate volumetric and chargeable weight for a single parcel row.
 * Volumetric Divisor = 5000 (cm^3 / kg) per IATA / Target Logistics standard.
 * Chargeable Weight = max(actualGrossWeight, volumetricWeight).
 */
export function calculateParcelMetrics(parcel = {}) {
    const qty = Math.max(1, parseInt(parcel.qty, 10) || 1);
    const unitWeight = Math.max(0, parseFloat(parcel.weight) || 0);
    const length = Math.max(0, parseFloat(parcel.length) || 0);
    const width = Math.max(0, parseFloat(parcel.width) || 0);
    const height = Math.max(0, parseFloat(parcel.height) || 0);
    const unitValue = Math.max(0, parseFloat(parcel.value) || 0);

    const actualWeight = Number((unitWeight * qty).toFixed(2));
    const unitVolumetric = (length * width * height) / VOLUMETRIC_DIVISOR;
    const volumetricWeight = Number((unitVolumetric * qty).toFixed(2));
    const chargeableWeight = Number(Math.max(actualWeight, volumetricWeight).toFixed(2));
    const isVolumetricGoverning = volumetricWeight > actualWeight;
    const totalDeclaredValue = Number((unitValue * qty).toFixed(3));

    return {
        qty,
        unitWeight,
        length,
        width,
        height,
        actualWeight,
        unitVolumetric: Number(unitVolumetric.toFixed(2)),
        volumetricWeight,
        chargeableWeight,
        isVolumetricGoverning,
        totalDeclaredValue
    };
}

/**
 * Aggregate weight, piece, and declared value telemetry across all parcels.
 */
export function calculateShipmentWeightMetrics(packagesList = []) {
    const list = Array.isArray(packagesList) && packagesList.length > 0 ? packagesList : [];
    let totalPieces = 0;
    let totalActualWeight = 0;
    let totalVolumetricWeight = 0;
    let totalDeclaredValue = 0;

    const parcelMetrics = list.map((p) => {
        const m = calculateParcelMetrics(p);
        totalPieces += m.qty;
        totalActualWeight += m.actualWeight;
        totalVolumetricWeight += m.volumetricWeight;
        totalDeclaredValue += m.totalDeclaredValue;
        return m;
    });

    const actual = Number(totalActualWeight.toFixed(2));
    const volumetric = Number(totalVolumetricWeight.toFixed(2));
    const chargeable = Number(Math.max(actual, volumetric, 0.5).toFixed(2));
    const isVolumetricGoverning = volumetric > actual;

    return {
        parcelCount: list.length,
        totalPieces: Math.max(1, totalPieces),
        actualWeight: actual,
        volumetricWeight: volumetric,
        chargeableWeight: chargeable,
        isVolumetricGoverning,
        totalDeclaredValue: Number(totalDeclaredValue.toFixed(3)),
        parcelMetrics
    };
}

/**
 * Standardized V2 Carrier Catalog & SLA Matrix
 */
export const V2_CARRIER_CATALOG = [
    {
        id: 'DGR',
        code: 'DGR',
        serviceCode: 'P',
        emblem: 'DGR',
        nameEn: 'DGR Express Worldwide',
        nameAr: 'DGR إكسبريس العالمي',
        badgeEn: 'Express Air · Door-to-Door',
        badgeAr: 'شحن جوي سريع · من الباب للباب',
        descEn: 'Priority international air network with Paperless Trade (PLT) & IATA DGR clearance.',
        descAr: 'شبكة شحن جوي دولية ذات أولوية مع تخليص جمركي إلكتروني ودعم المواد الخطرة.',
        transitEn: '1–3 Business Days',
        transitAr: '١–٣ أيام عمل',
        slaPct: 97,
        supportsDgr: true,
        supportsInternational: true,
        baseRatePerKg: 3.25,
        minBaseRate: 15.25,
        wholesaleRatio: 0.64,
        accentClass: 'bg-[#FFCC00] text-[#D40511] border-[#D40511]/20',
        dotClass: 'bg-[#D40511]'
    },
    {
        id: 'DGR2',
        code: 'DGR2',
        serviceCode: 'P',
        emblem: 'DHL',
        nameEn: 'DHL Express Worldwide',
        nameAr: 'دي إتش إل إكسبريس العالمي',
        badgeEn: 'Express Air · Door-to-Door',
        badgeAr: 'شحن جوي سريع · من الباب للباب',
        descEn: 'DHL Express account for international air freight with Paperless Trade (PLT) & IATA DGR clearance.',
        descAr: 'حساب دي إتش إل إكسبريس للشحن الجوي الدولي مع تخليص جمركي إلكتروني ودعم المواد الخطرة.',
        transitEn: '1–3 Business Days',
        transitAr: '١–٣ أيام عمل',
        slaPct: 97,
        supportsDgr: true,
        supportsInternational: true,
        baseRatePerKg: 3.25,
        minBaseRate: 15.25,
        wholesaleRatio: 0.64,
        accentClass: 'bg-[#FFCC00] text-[#D40511] border-[#D40511]/20',
        dotClass: 'bg-[#D40511]'
    },
    {
        id: 'ARAMEX',
        code: 'ARAMEX',
        serviceCode: 'P',
        emblem: 'ARMX',
        nameEn: 'Aramex Priority Express',
        nameAr: 'أرامكس بريوريتي إكسبريس',
        badgeEn: 'MENA & Global Express',
        badgeAr: 'شحن سريع للشرق الأوسط والعالم',
        descEn: 'Reliable door-to-door air and GCC cross-border express courier network.',
        descAr: 'شبكة شحن سريعة وموثوقة عبر دول الخليج والشرق الأوسط والعالم.',
        transitEn: '2–4 Business Days',
        transitAr: '٢–٤ أيام عمل',
        slaPct: 96,
        supportsDgr: false,
        supportsInternational: true,
        baseRatePerKg: 2.40,
        minBaseRate: 11.85,
        wholesaleRatio: 0.62,
        accentClass: 'bg-rose-600 text-white border-rose-700',
        dotClass: 'bg-rose-600'
    },
    {
        id: 'SMSA',
        code: 'SMSA',
        serviceCode: 'DLV',
        emblem: 'SMSA',
        nameEn: 'SMSA Express Saudi & GCC',
        nameAr: 'سمسا إكسبريس الخليج والسعودية',
        badgeEn: 'Saudi & GCC Specialist',
        badgeAr: 'متخصص الخليج والسعودية',
        descEn: 'High-density Saudi Arabia and GCC commercial & B2C distribution corridor.',
        descAr: 'توزيع سريع ومباشر للشحنات التجارية والأفراد في السعودية ودول الخليج.',
        transitEn: '2–3 Business Days',
        transitAr: '٢–٣ أيام عمل',
        slaPct: 95,
        supportsDgr: true,
        supportsInternational: true,
        baseRatePerKg: 2.10,
        minBaseRate: 10.40,
        wholesaleRatio: 0.60,
        accentClass: 'bg-orange-500 text-white border-orange-600',
        dotClass: 'bg-orange-500'
    },
    {
        id: 'OTE',
        code: 'OTE',
        serviceCode: 'STD',
        emblem: 'OTE',
        nameEn: 'LogesTechs GCC Ground (OTE)',
        nameAr: 'لوجستكس للشحن البري الخليجي',
        badgeEn: 'GCC Overland Linehaul',
        badgeAr: 'شحن بري خليجي اقتصادي',
        descEn: 'Economical GCC road freight for multi-parcel cartons and commercial pallets.',
        descAr: 'شحن بري اقتصادي عبر دول مجلس التعاون للطرود المتعددة والطبليات.',
        transitEn: '3–5 Business Days',
        transitAr: '٣–٥ أيام عمل',
        slaPct: 92,
        supportsDgr: true,
        supportsInternational: true,
        baseRatePerKg: 1.45,
        minBaseRate: 8.50,
        wholesaleRatio: 0.58,
        accentClass: 'bg-sky-600 text-white border-sky-700',
        dotClass: 'bg-sky-600'
    },
    {
        id: 'INTERNAL',
        code: 'INTERNAL',
        serviceCode: 'STD',
        emblem: 'TGR',
        nameEn: 'Manual Shipment (Target Fleet)',
        nameAr: 'شحنة يدوية (أسطول تارجت الداخلي)',
        badgeEn: 'Internal / Domestic Dispatch',
        badgeAr: 'تشغيل داخلي / توصيل محلي',
        descEn: 'Booked locally via Target Logistics internal fleet (TGR prefix) without external 3PL API dispatch.',
        descAr: 'تُحجز وتُدار داخلياً عبر أسطول تارجت للخدمات اللوجستية دون الحاجة لربط ناقل خارجي.',
        transitEn: 'Same Day / Next Day',
        transitAr: 'نفس اليوم / اليوم التالي',
        slaPct: 99,
        supportsDgr: true,
        supportsInternational: true,
        baseRatePerKg: 0.75,
        minBaseRate: 4.50,
        wholesaleRatio: 0.55,
        accentClass: 'bg-emerald-600 text-white border-emerald-700',
        dotClass: 'bg-emerald-600'
    }
];

/**
 * Value-Added Services (Optional Add-ons)
 */
export const V2_VALUE_ADDED_SERVICES = [
    {
        serviceCode: 'SIG',
        nameEn: 'Direct Signature Required',
        nameAr: 'توقيع المستلم المباشر إلزامي',
        descEn: 'Handover only to named consignee with digital signature capture.',
        descAr: 'التسليم حصرياً للمستلم المحدد مع توقيع إلكتروني موثق.',
        rate: 1.5,
        icon: 'draw'
    },
    {
        serviceCode: 'DDP',
        nameEn: 'Delivered Duty Paid (DDP)',
        nameAr: 'خالص الرسوم الجمركية (DDP)',
        descEn: 'Shipper pre-pays destination import customs duties & taxes.',
        descAr: 'يتحمل المرسل كافة الرسوم الجمركية والضرائب في بلد الوجهة.',
        rate: 5.0,
        icon: 'receipt_long'
    },
    {
        serviceCode: 'PRM',
        nameEn: 'Priority Morning Delivery (10:30 AM)',
        nameAr: 'توصيل صباحي مبكر (قبل 10:30 ص)',
        descEn: 'Earliest time-definite morning business delivery commitment.',
        descAr: 'التزام بالتسليم في الفترة الصباحية المبكرة لقطاع الأعمال.',
        rate: 3.0,
        icon: 'schedule'
    },
    {
        serviceCode: 'SA',
        nameEn: 'Government ID Verification',
        nameAr: 'التحقق من الهوية الرسمية عند التسليم',
        descEn: 'Courier verifies Civil ID / Passport number before parcel release.',
        descAr: 'يتحقق المندوب من البطاقة المدنية أو جواز السفر قبل تسليم الطرد.',
        rate: 2.5,
        icon: 'badge'
    },
    {
        serviceCode: 'AA',
        nameEn: 'Saturday / Weekend Priority Delivery',
        nameAr: 'توصيل عطلة نهاية الأسبوع (السبت)',
        descEn: 'Guaranteed weekend delivery schedule across GCC hubs.',
        descAr: 'تسليم مضمون خلال عطلة نهاية الأسبوع في دول الخليج.',
        rate: 4.5,
        icon: 'event'
    }
];

/**
 * Common HS Code Quick-Pick Reference Catalog
 */
export const HS_CODE_PRESETS = [
    { code: '8517.12.00', labelEn: '8517.12.00 — Smartphones & Telecom Devices', labelAr: '8517.12.00 — الهواتف الذكية وأجهزة الاتصالات' },
    { code: '8471.30.00', labelEn: '8471.30.00 — Laptops & Portable Computers', labelAr: '8471.30.00 — أجهزة الكمبيوتر المحمولة والإلكترونيات' },
    { code: '3303.00.00', labelEn: '3303.00.00 — Perfumes, Oud & Fragrances', labelAr: '3303.00.00 — العطور والطيب ومستحضرات التجميل' },
    { code: '6203.42.00', labelEn: '6203.42.00 — Apparel, Textiles & Garments', labelAr: '6203.42.00 — الملابس الجاهزة والمنسوجات' },
    { code: '9018.90.00', labelEn: '9018.90.00 — Medical & Laboratory Instruments', labelAr: '9018.90.00 — الأجهزة والمعدات الطبية والمخبرية' },
    { code: '8708.99.00', labelEn: '8708.99.00 — Automotive Spare Parts', labelAr: '8708.99.00 — قطع غيار ومستلزمات السيارات' },
    { code: '4901.99.00', labelEn: '4901.99.00 — Printed Books, Contracts & Documents', labelAr: '4901.99.00 — المطبوعات والوثائق والعقود الورقية' }
];

/**
 * Origin & Consignee Quick Hub Presets
 */
export const ORIGIN_HUB_PRESETS = [
    {
        id: 'kw_shuwaikh',
        labelEn: 'Shuwaikh Industrial Hub (KW)',
        labelAr: 'مركز الشويخ الصناعي (الكويت)',
        company: 'Target Logistics Operations',
        city: 'Shuwaikh Industrial',
        area: 'Block 1',
        state: 'Al Asimah',
        country: 'Kuwait',
        countryCode: 'KW',
        phoneCountryCode: '+20',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        zip: '70001',
        addr1: 'Block 1, Street 14, Target Logistics Hub',
        latitude: 29.3422,
        longitude: 47.9347
    },
    {
        id: 'kw_airport',
        labelEn: 'KWI Airport Cargo City (KW)',
        labelAr: 'مدينة الشحن الجوي - مطار الكويت',
        company: 'Target Air Freight Wing',
        city: 'Farwaniya',
        area: 'Airport District',
        state: 'Farwaniya',
        country: 'Kuwait',
        countryCode: 'KW',
        phoneCountryCode: '+20',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        zip: '80000',
        addr1: 'Cargo Terminal Gate 3, Kuwait Intl Airport',
        latitude: 29.2404,
        longitude: 47.9712
    },
    {
        id: 'kw_sharq',
        labelEn: 'Kuwait City Financial Centre (KW)',
        labelAr: 'المركز المالي - شرق (مدينة الكويت)',
        company: 'Gulf Apex Trading W.L.L.',
        city: 'Kuwait City',
        area: 'Sharq',
        state: 'Al Asimah',
        country: 'Kuwait',
        countryCode: 'KW',
        phoneCountryCode: '+20',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        zip: '13001',
        addr1: 'Sharq, Block 3, Al-Hamra Business Tower',
        latitude: 29.3785,
        longitude: 47.9903
    }
];

export const CONSIGNEE_HUB_PRESETS = [
    {
        id: 'ae_dubai',
        labelEn: 'Dubai Business Bay (AE)',
        labelAr: 'الخليج التجاري - دبي (الإمارات)',
        name: 'Salem Al-Rashidi',
        company: 'Emirates Horizon Distribution LLC',
        city: 'Dubai',
        area: 'Business Bay',
        state: 'Dubai',
        country: 'United Arab Emirates',
        countryCode: 'AE',
        phoneCountryCode: '+20',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        zip: '00000',
        addr1: 'Bay Square, Building 4, Suite 302',
        taxId: 'AE-TRN-100492817200003',
        latitude: 25.1850,
        longitude: 55.2650
    },
    {
        id: 'sa_riyadh',
        labelEn: 'Riyadh Olaya Commercial District (SA)',
        labelAr: 'حي العليا التجاري - الرياض (السعودية)',
        name: 'Faisal Al-Qahtani',
        company: 'Najd Industrial Supply Co.',
        city: 'Riyadh',
        area: 'Al Olaya',
        state: 'Riyadh Region',
        country: 'Saudi Arabia',
        countryCode: 'SA',
        phoneCountryCode: '+20',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        zip: '12211',
        addr1: 'King Fahd Road, Al Olaya Tower B',
        taxId: 'SA-VAT-300491827300003',
        latitude: 24.7136,
        longitude: 46.6753
    },
    {
        id: 'qa_doha',
        labelEn: 'Doha West Bay Logistics Zone (QA)',
        labelAr: 'الخليج الغربي - الدوحة (قطر)',
        name: 'Nasser Al-Thani',
        company: 'Lusail Medical & Trade W.L.L.',
        city: 'Doha',
        area: 'West Bay',
        state: 'Ad Dawhah',
        country: 'Qatar',
        countryCode: 'QA',
        phoneCountryCode: '+20',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        zip: '00000',
        addr1: 'Diplomatic Area, Street 810, Tower 12',
        taxId: 'QA-CR-88412',
        latitude: 25.3209,
        longitude: 51.5284
    },
    {
        id: 'eg_cairo',
        labelEn: 'Cairo New Cairo Business Park (EG)',
        labelAr: 'التجمع الخامس - القاهرة الجديدة (مصر)',
        name: 'Mahmoud El-Sayed',
        company: 'Delta Regional Trade Co.',
        city: 'Cairo',
        area: 'New Cairo',
        state: 'Cairo Governorate',
        country: 'Egypt',
        countryCode: 'EG',
        phoneCountryCode: '+20',
        phone: SANDBOX_DEFAULT_LOCAL_PHONE,
        zip: '11835',
        addr1: '90th Street North, Sector 2, Building 18',
        taxId: 'EG-TAX-419-882-109',
        latitude: 30.0258,
        longitude: 31.4750
    }
];

/**
 * Normalize an address for deduplication by (phone + addressLine1 + city + countryCode).
 */
export function getNormalizedAddressKey(addr = {}) {
    const phone = String(addr.phone || '').replace(/[\s\-()]/g, '').trim().toLowerCase();
    const line1 = String(addr.addressLine1 || addr.addr1 || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const city = String(addr.city || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const countryCode = String(addr.countryCode || '').trim().toLowerCase();
    return `${phone}|${line1}|${city}|${countryCode}`;
}

/**
 * Deduplicate an array of addresses by normalized (phone + addressLine1 + city + countryCode).
 */
export function deduplicateAddresses(addresses = []) {
    const list = Array.isArray(addresses) ? addresses : [];
    const seen = new Set();
    const result = [];
    for (const addr of list) {
        if (!addr || typeof addr !== 'object') continue;
        const key = getNormalizedAddressKey(addr);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(addr);
    }
    return result;
}

const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Determine which wizard step (1..6) owns a given field key.
 */
export function getStepForField(fieldKey = '') {
    const key = String(fieldKey || '');
    if (key.startsWith('sender_')) return 1;
    if (key.startsWith('receiver_')) return 2;
    if (key.startsWith('pkg')) return 3;
    if (key.startsWith('service_')) return 4;
    if (key.startsWith('customs_')) return 5;
    if (key.startsWith('review_')) return 6;
    return 1;
}

/**
 * Map a backend validation field path (e.g. "sender.addressLine1", "parcels[0].weight")
 * to the corresponding V2 wizard field key (data-field="<key>").
 */
export function mapBackendFieldToWizardField(rawField = '') {
    const raw = String(rawField || '').trim();
    if (!raw) return '';
    if (/^(sender|receiver|pkg|service|customs|review)_/.test(raw)) {
        return raw;
    }

    const partyMatch = raw.match(/^(sender|receiver|origin|destination)[._](.+)$/i);
    if (partyMatch) {
        const rawParty = partyMatch[1].toLowerCase();
        const party = rawParty === 'origin' ? 'sender' : rawParty === 'destination' ? 'receiver' : rawParty;
        const prop = partyMatch[2].toLowerCase();
        const propMap = {
            name: 'name',
            contactperson: 'name',
            phone: 'phone',
            email: 'email',
            countrycode: 'country',
            country: 'country',
            city: 'city',
            addressline1: 'addr1',
            addr1: 'addr1',
            streetlines: 'addr1',
            postalcode: 'zip',
            zip: 'zip'
        };
        return `${party}_${propMap[prop] || prop}`;
    }

    if (/^(parcels|packages)$/i.test(raw)) {
        return 'pkg_description';
    }

    const parcelMatch = raw.match(/^(?:parcels|packages)(?:\[(\d+)\]|\.(\d+))?\.(.+)$/i);
    if (parcelMatch) {
        const idx = Number(parcelMatch[1] ?? parcelMatch[2] ?? 0);
        const prop = parcelMatch[3].toLowerCase();
        const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;
        const propMap = {
            description: 'description',
            contents: 'description',
            weight: 'weight',
            length: 'length',
            width: 'width',
            height: 'height',
            declaredvalue: 'value',
            value: 'value'
        };
        return `${pfx}_${propMap[prop] || prop}`;
    }

    const flatMap = {
        description: 'pkg_description',
        weight: 'pkg_weight',
        length: 'pkg_length',
        width: 'pkg_width',
        height: 'pkg_height',
        declaredValue: 'pkg_value',
        value: 'pkg_value',
        carrierCode: 'service_carrierCode',
        hsCode: 'customs_hsCode',
        invoiceVal: 'customs_invoiceVal',
        invoiceNum: 'customs_invoiceNum'
    };
    return flatMap[raw] || raw;
}

/**
 * Validate a step (1 to 6) of the V2 Shipment Creation Cockpit (Unified Bar-Minimum).
 * Requires only the minimum fields needed to book universally across all carriers.
 */
export function validateCockpitStep(step, state = {}, isRTL = false) {
    const errors = {};
    const {
        sender = {},
        receiver = {},
        pkg = {},
        customs = {},
        service = {},
        agreedToPolicy = false
    } = state;

    if (step === 1) {
        if (!sender.name?.trim()) {
            errors.sender_name = isRTL ? 'اسم المرسل مطلوب' : 'Origin contact name is required';
        }
        const senderFullPhone = `${sender.phoneCountryCode || '+20'}${sender.phone || ''}`;
        if (!sender.phone?.trim() || !isValidInternationalPhone(senderFullPhone)) {
            errors.sender_phone = isRTL ? 'رقم هاتف المرسل مطلوب بصيغة صحيحة' : 'Valid origin phone number is required';
        }
        if (!sender.email?.trim() || !SIMPLE_EMAIL_REGEX.test(sender.email.trim())) {
            errors.sender_email = isRTL ? 'البريد الإلكتروني للمرسل مطلوب بصيغة صحيحة' : 'Valid origin email address is required';
        }
        if (!sender.countryCode?.trim() || !/^[A-Za-z]{2}$/.test(sender.countryCode.trim())) {
            errors.sender_country = isRTL ? 'رمز دولة المرسل (حرفان) مطلوب' : 'Origin 2-letter country code is required';
        }
        if (!sender.city?.trim()) {
            errors.sender_city = isRTL ? 'مدينة المرسل مطلوبة' : 'Origin city is required';
        }
        if (!sender.addr1?.trim()) {
            errors.sender_addr1 = isRTL ? 'عنوان الشارع للمرسل مطلوب' : 'Origin street address is required';
        }
        if (isPostalCodeRequired(sender.countryCode, sender.country) && (!sender.zip?.trim() || sender.zip.trim() === '00000')) {
            errors.sender_zip = isRTL ? 'الرمز البريدي للمرسل مطلوب لهذه الدولة' : 'Origin postal code is required for this country';
        }
    } else if (step === 2) {
        if (!receiver.name?.trim()) {
            errors.receiver_name = isRTL ? 'اسم المستلم مطلوب' : 'Consignee contact name is required';
        }
        const receiverFullPhone = `${receiver.phoneCountryCode || '+20'}${receiver.phone || ''}`;
        if (!receiver.phone?.trim() || !isValidInternationalPhone(receiverFullPhone)) {
            errors.receiver_phone = isRTL ? 'رقم هاتف المستلم مطلوب بصيغة صحيحة' : 'Valid consignee phone number is required';
        }
        if (!receiver.email?.trim() || !SIMPLE_EMAIL_REGEX.test(receiver.email.trim())) {
            errors.receiver_email = isRTL ? 'البريد الإلكتروني للمستلم مطلوب بصيغة صحيحة' : 'Valid consignee email address is required';
        }
        if (!receiver.countryCode?.trim() || !/^[A-Za-z]{2}$/.test(receiver.countryCode.trim())) {
            errors.receiver_country = isRTL ? 'رمز دولة المستلم (حرفان) مطلوب' : 'Consignee 2-letter country code is required';
        }
        if (!receiver.city?.trim()) {
            errors.receiver_city = isRTL ? 'مدينة المستلم مطلوبة' : 'Consignee city is required';
        }
        if (!receiver.addr1?.trim()) {
            errors.receiver_addr1 = isRTL ? 'عنوان التسليم للمستلم مطلوب' : 'Consignee street address is required';
        }
        if (isPostalCodeRequired(receiver.countryCode, receiver.country) && (!receiver.zip?.trim() || receiver.zip.trim() === '00000')) {
            errors.receiver_zip = isRTL ? 'الرمز البريدي للمستلم مطلوب لهذه الدولة' : 'Consignee postal code is required for this country';
        }
    } else if (step === 3) {
        const parcels = Array.isArray(pkg.packagesList) && pkg.packagesList.length > 0 ? pkg.packagesList : [pkg];
        const isPackageMode = pkg.shipmentType !== 'documents';
        parcels.forEach((p, idx) => {
            const pfx = idx === 0 ? 'pkg' : `pkg_${idx}`;
            if (!p.description?.trim()) {
                errors[`${pfx}_description`] = isRTL ? 'وصف محتويات الطرد مطلوب' : 'Contents description is required';
            }
            if (!(Number(p.weight) > 0)) {
                errors[`${pfx}_weight`] = isRTL ? 'الوزن يجب أن يكون أكبر من 0 كجم' : 'Weight (> 0 kg) is required';
            }
            if (!(Number(p.length) > 0)) {
                errors[`${pfx}_length`] = isRTL ? 'الطول (> 0 سم) مطلوب' : 'Length (> 0 cm) is required';
            }
            if (!(Number(p.width) > 0)) {
                errors[`${pfx}_width`] = isRTL ? 'العرض (> 0 سم) مطلوب' : 'Width (> 0 cm) is required';
            }
            if (!(Number(p.height) > 0)) {
                errors[`${pfx}_height`] = isRTL ? 'الارتفاع (> 0 سم) مطلوب' : 'Height (> 0 cm) is required';
            }
            if (isPackageMode && !(Number(p.value) > 0)) {
                errors[`${pfx}_value`] = isRTL ? 'القيمة المصرحة (> 0) مطلوبة للشحنات غير المستندية' : 'Declared value (> 0) is required for non-document shipments';
            }
        });

        if (pkg.dangerousGoods) {
            if (!pkg.unCode?.trim()) {
                errors.pkg_unCode = isRTL ? 'رمز الأمم المتحدة (UN Code) مطلوب للمواد الخطرة' : 'IATA UN Code (e.g. UN1266) is required';
            }
            if (!pkg.dgClass?.trim()) {
                errors.pkg_dgClass = isRTL ? 'فئة الخطورة (Hazard Class) مطلوبة' : 'Hazard Class is required';
            }
            if (!pkg.properShippingName?.trim()) {
                errors.pkg_properShippingName = isRTL ? 'اسم الشحن المعتمد مطلوب' : 'Proper Shipping Name is required';
            }
        }
    } else if (step === 4) {
        if (!service.carrierCode?.trim()) {
            errors.service_carrierCode = isRTL ? 'يرجى اختيار الناقل ومستوى الخدمة' : 'Please select a carrier service';
        }
    } else if (step === 5) {
        const isCrossBorder = (sender.countryCode || 'KW').toUpperCase() !== (receiver.countryCode || 'AE').toUpperCase();
        const isPackageMode = pkg.shipmentType !== 'documents';
        if (customs.shipmentPurpose?.toLowerCase().includes('commercial') && !customs.invoiceNum?.trim()) {
            errors.customs_invoiceNum = isRTL ? 'رقم الفاتورة التجارية مطلوب للشحنات التجارية' : 'Commercial invoice number is required';
        }
        if (isCrossBorder && isPackageMode) {
            if (!customs.hsCode?.trim()) {
                errors.customs_hsCode = isRTL ? 'رمز التعرفة الجمركية (HS Code) مطلوب للشحنات الدولية' : 'HS Tariff Code is required for cross-border packages';
            }
            if (!(Number(customs.invoiceVal) > 0)) {
                errors.customs_invoiceVal = isRTL ? 'القيمة الجمركية المصرحة مطلوبة' : 'Declared customs value (> 0) is required';
            }
        }
    } else if (step === 6) {
        if (!agreedToPolicy) {
            errors.review_policy = isRTL
                ? 'يرجى الموافقة على إقرار صحة البيانات وشروط النقل لإصدار الشحنة'
                : 'Please confirm the customs & dangerous goods declaration before booking';
        }
    }

    const fieldKeys = Object.keys(errors);
    return {
        isValid: fieldKeys.length === 0,
        errors,
        fieldKeys,
        firstErrorField: fieldKeys[0] || null
    };
}

/**
 * Validate all steps (1..6) and return combined errors plus the first failing step & field.
 */
export function validateAllCockpitSteps(state = {}, isRTL = false) {
    const allErrors = {};
    let firstErrorStep = null;
    let firstErrorField = null;

    for (let s = 1; s <= 6; s += 1) {
        const res = validateCockpitStep(s, state, isRTL);
        if (!res.isValid) {
            if (firstErrorStep === null) {
                firstErrorStep = s;
                firstErrorField = res.firstErrorField;
            }
            Object.assign(allErrors, res.errors);
        }
    }

    const fieldKeys = Object.keys(allErrors);
    return {
        isValid: fieldKeys.length === 0,
        errors: allErrors,
        fieldKeys,
        firstErrorStep,
        firstErrorField
    };
}
