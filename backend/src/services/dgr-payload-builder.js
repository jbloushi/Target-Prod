const { normalizeShipment } = require('../utils/shipmentNormalizer');

/**
 * Normalizes a string to contain only digits.
 * @param {string} val 
 * @returns {string}
 */
const normalizeDigits = (val) => (val || '').replace(/\D/g, '');

/**
 * Normalize country code to ISO2 if possible.
 * Falls back to provided fallback when input is not ISO2.
 * @param {string} input
 * @param {string} fallback
 * @returns {string}
 */
const normalizeCountryCode = (input, fallback) => {
    const code = (input || '').toString().trim().toUpperCase();
    if (code.length === 2) return code;
    const fallbackCode = (fallback || '').toString().trim().toUpperCase();
    return fallbackCode.length === 2 ? fallbackCode : code;
};

/**
 * Normalizes city name for carrier compatibility.
 * Specifically handles Kuwait cases.
 * @param {string} city 
 * @param {string} countryCode 
 * @returns {string}
 */
const normalizeCityForCarrier = (city, countryCode) => {
    const c = (city || '').toString().trim().toUpperCase();
    if (countryCode === 'KW') {
        if (c === 'KUWAIT CITY' || c === 'CITY') return 'KUWAIT';
    }
    return c;
};

/**
 * Normalizes phone number to have + prefix and digits only.
 * @param {string} phone 
 * @param {string} countryCode 
 * @returns {string}
 */
const normalizePhoneForCarrier = (phone, countryCode) => {
    let p = (phone || '').toString().trim();
    if (!p) return p;
    // Remove all non-digit characters except leading +
    const hasPlus = p.startsWith('+');
    p = p.replace(/\D/g, '');
    if (hasPlus) return `+${p}`;

    // Default prefix if missing and it's a known country logic could go here, 
    // but for now just ensure at least one + if it looks like it needs one.
    // DHL strictly requires leading +
    return `+${p}`;
};

/**
 * Formatting helper for 3 decimal places
 * @param {number} num 
 * @returns {number}
 */
const formatWeight = (num) => Number(Number(num || 0).toFixed(3));

/**
 * Normalize currency to 3 chars (DHL Limit)
 * @param {string} currency 
 * @returns {string}
 */
const normalizeCur = (currency) => (currency || 'KWD').substring(0, 3).toUpperCase();


/**
 * Validates the order data for DGR Invoice requirements (Pre-flight).
 * Returns an array of error strings.
 * @param {Object} order - The normalized order object
 * @returns {string[]} errors
 */
function validateShipmentForDgr(order) {
    const errors = [];
    const { sender, receiver, items, dangerousGoods } = order;

    // Shipper
    if (!sender.company && !sender.contactPerson) errors.push('Shipper: Company or Contact Person is required.');

    const shipperLines = splitAddressLines(sender);
    if (!shipperLines.line1) errors.push('Shipper: Address Line 1 (Street) is required.');

    if (!sender.city) errors.push('Shipper: City is required.');
    if (!sender.countryCode) errors.push('Shipper: Country Code is required.');
    if (!sender.postalCode) errors.push('Shipper: Postal Code is required.');
    if (!sender.phone) errors.push('Shipper: Phone is required.');

    // Consignee
    if (!receiver.contactPerson) errors.push('Consignee: Contact Person is required.');

    const receiverLines = splitAddressLines(receiver);
    if (!receiverLines.line1) errors.push('Consignee: Address Line 1 (Street) is required.');

    if (!receiver.city) errors.push('Consignee: City is required.');
    if (!receiver.countryCode) errors.push('Consignee: Country Code is required.');
    if (!receiver.postalCode) errors.push('Consignee: Postal Code is required.');
    if (!receiver.phone) errors.push('Consignee: Phone is required.');

    // Invoice
    if (!order.currency) errors.push('Invoice: Currency is required.');

    // Items
    if (!items || items.length === 0) errors.push('Shipment must have at least one line item.');

    items.forEach((item, index) => {
        const prefix = `Item ${index + 1}:`;
        if (!item.description) errors.push(`${prefix} Description is required.`);
        if (!item.hsCode) errors.push(`${prefix} HS Code is required.`);
        else if (normalizeDigits(item.hsCode).length < 6) errors.push(`${prefix} HS Code must be at least 6 digits.`);

        if (!item.countryOfOrigin) errors.push(`${prefix} Country of Origin is required.`);
        if (!item.quantity || item.quantity <= 0) errors.push(`${prefix} Quantity must be > 0.`);
        if (!item.value || item.value <= 0) errors.push(`${prefix} Unit Value must be > 0.`);
    });

    // DG Validation
    if (dangerousGoods && dangerousGoods.contains) {
        if (!dangerousGoods.code) errors.push('DG: UN Code is required.');
        if (!dangerousGoods.serviceCode) errors.push('DG: Service Code (HE/HV/HK/HC) is required.');
        if (!dangerousGoods.contentId) errors.push('DG: Content ID is required.');
        if (!dangerousGoods.properShippingName) errors.push('DG: Proper Shipping Name is required.');
        if (!dangerousGoods.customDescription) errors.push('DG: Custom Description is required.');

        // Dry Ice Specific
        if (dangerousGoods.code === '1845') {
            if (!dangerousGoods.dryIceWeight || dangerousGoods.dryIceWeight <= 0) {
                errors.push('DG: Dry Ice (UN1845) requires positive dryIceWeight.');
            }
        }
    }

    return errors;
}

/**
 * Composes the line item description, adding DG info if necessary.
 * @param {Object} item 
 * @param {Object} dangerousGoods
 * @returns {string}
 */
function composeItemDescription(item, dangerousGoods) {
    const ITEM_DESCRIPTION_MAX_LENGTH = 250;
    const desc = item.description || '';
    return desc.replace(/[\r\n]+/g, ' ').substring(0, ITEM_DESCRIPTION_MAX_LENGTH);
}

/**
 * Helper to split address into max 3 lines of 45 chars.
 * Intelligently combines structured components if streetLines are minimal.
 * @param {Object} party - Sender or Receiver normalized object
 * @returns {Object} {line1, line2, line3}
 */
function splitAddressLines(party) {
    const { streetLines, buildingName, unitNumber, area, landmark } = party;

    // Start with streetLines
    let baseLines = Array.isArray(streetLines) ? [...streetLines] : [(streetLines || '')];

    // Add building/unit if provided and not already in lines
    const subLine = [buildingName, unitNumber].filter(Boolean).join(', ');
    if (subLine && !baseLines.some(l => l.includes(subLine))) {
        baseLines.push(subLine);
    }

    // Add area if provided
    if (area && !baseLines.some(l => l.includes(area))) {
        baseLines.push(area);
    }

    // Add landmark if provided
    if (landmark && !baseLines.some(l => l.includes(landmark))) {
        baseLines.push(landmark);
    }

    const fullText = baseLines.filter(Boolean).join(' ').trim();
    const maxLen = 45;
    const finalLines = [];

    let remaining = fullText;
    while (remaining.length > 0 && finalLines.length < 3) {
        if (remaining.length <= maxLen) {
            finalLines.push(remaining);
            break;
        }

        let splitIdx = remaining.lastIndexOf(' ', maxLen);
        if (splitIdx === -1) splitIdx = maxLen; // Force split if no space

        finalLines.push(remaining.substring(0, splitIdx).trim());
        remaining = remaining.substring(splitIdx).trim();
    }

    // Ensure we send at least one line if empty (validation requires it elsewhere)
    if (finalLines.length === 0) finalLines.push('.');

    return {
        line1: finalLines[0],
        line2: finalLines[1] || undefined,
        line3: finalLines[2] || undefined
    };
}

/**
 * Builds the Export Declaration (Commercial Invoice) section.
 * @param {Object} order - Normalized order
 * @param {Object} config - Optional config overrides
 */
function buildExportDeclaration(order, config = {}) {
    // Always build Export Declaration for international shipments or when requested
    const isInternational = order.sender.countryCode !== order.receiver.countryCode;
    if (!isInternational && !order.forceInvoice && !order.items.some(i => i.hsCode)) return undefined;
    const { items, sender, receiver } = order;

    // Calculate total physical weight from packages to ensure Invoice Gross Weight matches
    const totalParcelWeight = order.packages?.reduce((sum, p) => sum + (Number(p.weight?.value || p.weight || 0)), 0) || 0;
    const totalItemQty = items.reduce((sum, i) => sum + (Number(i.quantity || 1)), 0);

    const lineItems = items.map((item, idx) => {
        const description = composeItemDescription(item, order.dangerousGoods);
        const commCode = normalizeDigits(item.hsCode);
        const qty = Number(item.quantity || 1);
        const manufacturerCountryCode = normalizeCountryCode(item.countryOfOrigin, sender.countryCode);

        // Calculate a proportional share of the gross weight if multiple items exist, 
        // otherwise just use the item's own weight logic.
        // If there's only one line item, it gets the full parcel weight as Gross Weight.
        const itemNetWeight = item.netWeight || item.weight || 0.1;
        const totalLineNet = itemNetWeight * qty;

        // If we have a total parcel weight, we distribute it proportionally by quantity to the Gross Weight field
        const itemGrossWeight = totalParcelWeight > 0
            ? (totalParcelWeight * (qty / totalItemQty))
            : (item.grossWeight || itemNetWeight) * qty;

        const hsType = order.hsCodeType || 'outbound';
        let commodityCodes = [];
        if (hsType === 'inbound') {
            commodityCodes.push({ typeCode: 'inbound', value: commCode });
        } else if (hsType === 'both') {
            commodityCodes.push({ typeCode: 'outbound', value: commCode });
            commodityCodes.push({ typeCode: 'inbound', value: commCode });
        } else {
            commodityCodes.push({ typeCode: 'outbound', value: commCode });
        }

        return {
            number: idx + 1,
            description: description,
            price: Number(item.value) || Number(item.declaredValue) || 1,
            quantity: {
                value: qty,
                unitOfMeasurement: item.unitOfMeasurement || 'PCS'
            },
            commodityCodes: commodityCodes,
            priceCurrency: order.currency || 'KWD',
            manufacturerCountry: manufacturerCountryCode,
            weight: {
                netValue: formatWeight(totalLineNet),
                grossValue: formatWeight(itemGrossWeight)
            },
            customerReferences: [
                ...(item.sku ? [{ typeCode: 'AFE', value: item.sku }] : [])
            ]
        };
    });

    const invoiceDate = order.invoice?.date || new Date().toISOString().split('T')[0];
    const invoiceNumber = order.invoice?.number || `INV-${order.reference || Date.now()}`;

    const exportDeclaration = {
        lineItems,
        invoice: {
            number: invoiceNumber,
            date: invoiceDate,
            signatureName: order.labelSettings?.signatureName || sender.contactPerson || sender.company || 'Shipper',
            signatureTitle: order.labelSettings?.signatureTitle || 'Sender',
            instructions: [
                [
                    order.remarks,
                    order.gstPaid ? 'GST: Paid' : 'GST: Not Paid',
                    `Payer of GST/VAT: ${order.payerOfVat || 'Receiver'}`,
                    order.palletCount > 0 ? `Total Pallets: ${order.palletCount}` : '',
                    order.packageMarks ? `Package Marks: ${order.packageMarks}` : '',
                    sender.taxId ? `Shipper TaxID: ${sender.taxId}` : '',
                    receiver.taxId ? `Receiver TaxID: ${receiver.taxId}` : ''
                ].filter(Boolean).join(' | ').substring(0, 300) // DGR Limit
            ],
            customerReferences: (() => {
                const refs = [
                    { typeCode: 'CU', value: order.reference || order.sender?.reference }
                ];
                if (order.senderContractNumber) {
                    refs.push({ typeCode: 'CN', value: order.senderContractNumber.substring(0, 35) });
                }
                if (order.receiverContractNumber) {
                    refs.push({ typeCode: 'ANT', value: order.receiverContractNumber.substring(0, 35) });
                } else if (order.receiverReference || order.receiver?.reference) {
                    refs.push({ typeCode: 'ANT', value: order.receiverReference || order.receiver?.reference });
                }
                return refs.filter(r => r && r.value);
            })()
        },
        exportReason: order.exportReason || 'Sale',
        exportReasonType: order.exportReasonType || 'permanent',
        placeOfIncoterm: order.placeOfIncoterm || order.receiver.city // Fallback to Receiver City
    };

    return exportDeclaration;
}

/**
 * Builds Dangerous Goods VAS strictly according to DGR MyDHL API v3.1.2
 * @param {Object} dg 
 * @returns {Array} valueAddedServices
 */
const buildDangerousGoodsValueAddedServices = (dg) => {
    if (!dg || !dg.contains) return [];

    // Safety check for required fields (already checked in validate, but double safety)
    if (!dg.serviceCode || !dg.contentId || !dg.code || !dg.customDescription) {
        throw new Error('DG payload requires serviceCode, contentId, code, and customDescription.');
    }

    const unCode = (dg.code && !dg.code.startsWith('UN') && !dg.code.startsWith('ID'))
        ? (dg.code === '8000' ? `ID${dg.code}` : `UN${dg.code}`)
        : dg.code;

    // Strict DG Item construction - ONLY allowed fields
    const DG_CUSTOM_DESCRIPTION_MAX_LENGTH = 200;

    const dgItem = {
        contentId: dg.contentId,
        unCode: unCode, // e.g. UN1266
        customDescription: String(dg.customDescription).substring(0, DG_CUSTOM_DESCRIPTION_MAX_LENGTH)
    };

    const vas = {
        serviceCode: dg.serviceCode, // e.g. HE, HV, HK, HC
        dangerousGoods: [dgItem]
    };

    // SPECIAL HANDLING for Dry Ice (HC)
    if (dg.serviceCode === 'HC') {
        const dryIceWeight = Number(dg.dryIceWeight);
        if (!Number.isFinite(dryIceWeight) || dryIceWeight <= 0) {
            throw new Error('DG payload requires a positive dryIceWeight for serviceCode HC.');
        }
        dgItem.dryIceTotalNetWeight = dryIceWeight;
    }

    return [vas];
};

/**
 * Builds the full DGR Shipment Payload.
 * @param {Object} order - Normalized order/shipment data
 * @param {Object} config - Configuration options (account numbers etc)
 * @param {number} offsetDays - Days to add to the pickup date (for retry logic)
 */
function buildDgrShipmentPayload(order, config = {}, offsetDays = 0) {
    // 1. Validate (Pre-flight)
    const errors = validateShipmentForDgr(order);
    if (errors.length > 0) {
        throw new Error(`DGR Validation Failed: ${errors.join('; ')}`);
    }

    const { sender, receiver, packages } = order;
    const senderCountryCode = normalizeCountryCode(sender.countryCode);
    const receiverCountryCode = normalizeCountryCode(receiver.countryCode);

    // 1. Determine the primary currency for the shipment
    const detectedCurrency = (order.currency || 'KWD').substring(0, 3).toUpperCase();

    // Normalize item currencies to match shipment currency (DGR requires consistency)
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
            item.currency = detectedCurrency;
        });
    }

    const totalDeclaredValue = order.items.reduce((sum, item) => sum + (item.value * item.quantity), 0);

    // 2. Prepare Addresses
    const shipperAddress = splitAddressLines(sender);
    const receiverAddress = splitAddressLines(receiver);

    // 3. Export Declaration
    const exportDeclaration = buildExportDeclaration(order, config);

    // 4. Construct Payload
    // Format date: ISO-8601 with Offset (Standard +00:00 instead of Z to avoid legacy parsing issues)
    // Sample: '2010-02-11T17:10:09 GMT+01:00' requested by user error.
    // We will use standard ISO with offset: 2026-02-02T12:00:00+00:00
    // Fix: Default to tomorrow 10:00 AM if no date provided to ensure valid pickup window
    let dateObj;
    if (order.shipmentDate) {
        dateObj = new Date(order.shipmentDate);
    }

    // If date is invalid or we need a default, use tomorrow 10 AM
    if (!dateObj || isNaN(dateObj.getTime())) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0); // 10:00 AM
        dateObj = tomorrow;
    }

    // Apply auto-scheduling offset if any
    if (offsetDays > 0) {
        dateObj.setDate(dateObj.getDate() + offsetDays);
    }

    // Manual construction to ensure YYYY-MM-DDTHH:MM:SS GMT+03:00 format (Using +03:00 for consistency with Adapter)
    // We use the local time components of dateObj but append a fixed offset or convert properly
    // Ideally use toISOString() but replace Z.
    // For simplicity and consistency with DgrAdapter:
    const timestamp = dateObj.toISOString().replace(/[Z]|\.\d{3}/g, '') + ' GMT+03:00';

    // 5. Build Dangerous Goods VAS
    const dgVas = buildDangerousGoodsValueAddedServices(order.dangerousGoods);

    // Merge with User Selected Optional Services
    const userVas = (order.optionalServices || []).map(item => {
        // Handle both string codes ('II') and objects ({ serviceCode: 'II' })
        const code = (typeof item === 'string') ? item : (item?.serviceCode || item?.code);
        return { serviceCode: code };
    }).filter(s => s.serviceCode);

    // Combine arrays ensuring no duplicates (though unlikely to overlap if handled correctly)
    const valueAddedServices = [...dgVas, ...userVas];

    // Account Number Strategy: Order Overrides > Config
    const shipperAccountNumber = order.shipperAccount || config.accountNumber;
    if (!shipperAccountNumber) {
        throw new Error('DGR Payload Error: Shipper Account Number is missing and no fallback provided in config.');
    }

    // Label Format Mapping
    // Frontend: 'pdf', 'zpl'
    // DGR API: 'pdf', 'zpl', 'lp2', 'epl'
    const labelFormat = order.labelSettings?.format || 'pdf';

    const payload = {
        plannedShippingDateAndTime: timestamp,
        pickup: { isRequested: false },
        productCode: order.serviceCode,
        localProductCode: order.serviceCode,
        getRateEstimates: false,
        accounts: [
            {
                typeCode: 'shipper',
                number: shipperAccountNumber
            },
            // If Incoterm is DDP or payerOfVat is explicitly shipper, add duties-taxes account
            ...((order.incoterm === 'DDP' || order.payerOfVat === 'shipper') ? [{
                typeCode: 'duties-taxes',
                number: config.accountNumber
            }] : [])
        ],

        // VAS: DG Only (No 'dryIce' root key)
        valueAddedServices: valueAddedServices.length > 0 ? valueAddedServices : undefined,

        outputImageProperties: {
            encodingFormat: labelFormat.toLowerCase(),
            imageOptions: [
                { typeCode: 'label', isRequested: true },
                { typeCode: 'waybillDoc', isRequested: true },
                { typeCode: 'invoice', isRequested: true }
            ]
        },

        customerDetails: {
            shipperDetails: {
                postalAddress: {
                    postalCode: sender.postalCode,
                    cityName: normalizeCityForCarrier(sender.city, senderCountryCode),
                    countryCode: senderCountryCode,
                    addressLine1: shipperAddress.line1,
                    addressLine2: shipperAddress.line2,
                    addressLine3: shipperAddress.line3
                },
                contactInformation: {
                    companyName: `${sender.company || sender.contactPerson} PH:${normalizePhoneForCarrier(sender.phone, senderCountryCode)}`.substring(0, 50),
                    fullName: sender.contactPerson,
                    phone: normalizePhoneForCarrier(sender.phone, senderCountryCode),
                    email: sender.email
                },
                typeCode: sender.traderType || 'business',
                registrationNumbers: []
            },
            receiverDetails: {
                postalAddress: {
                    postalCode: receiver.postalCode,
                    cityName: normalizeCityForCarrier(receiver.city, receiverCountryCode),
                    countryCode: receiverCountryCode,
                    addressLine1: receiverAddress.line1,
                    addressLine2: receiverAddress.line2,
                    addressLine3: receiverAddress.line3
                },
                contactInformation: {
                    companyName: `${receiver.company || receiver.contactPerson} PH:${normalizePhoneForCarrier(receiver.phone, receiverCountryCode)}`.substring(0, 50),
                    fullName: receiver.contactPerson,
                    phone: normalizePhoneForCarrier(receiver.phone, receiverCountryCode),
                    email: receiver.email
                },
                typeCode: receiver.traderType || 'business',
                registrationNumbers: []
            }
        },

        content: {
            packages: packages.map((p, i) => ({
                weight: p.weight.value,
                dimensions: {
                    length: p.dimensions.length,
                    width: p.dimensions.width,
                    height: p.dimensions.height
                },
                customerReferences: [
                    { value: order.reference || order.sender?.reference || p.reference || `PKG-${i + 1}`, typeCode: 'CU' }
                ],
                description: `${p.description || 'Box'}${order.packageMarks ? ' - ' + order.packageMarks : ''}`.substring(0, 250)
                // NO dangerousGoods here.
            })),
            isCustomsDeclarable: !order.isDocument && order.shipmentType !== 'documents',
            description: (order.palletCount > 0 ? `Pallets: ${order.palletCount}. ` : '') + (order.remarks || order.items?.[0]?.description || 'Shipment'),
            incoterm: order.incoterm || 'DAP',
            unitOfMeasurement: 'metric',
            ...((!order.isDocument && order.shipmentType !== 'documents') ? {
                declaredValue: Number(totalDeclaredValue || order.declaredValue || 1),
                declaredValueCurrency: normalizeCur(detectedCurrency || order.currency || 'USD'),
                exportDeclaration: exportDeclaration
            } : {})
        }
    };

    // Populate Registration Numbers (VAT/EORI Only)
    const addRegParams = (targetArr, party) => {
        const issuerCountryCode = normalizeCountryCode(party.countryCode);
        if (party.vatNumber && issuerCountryCode) {
            targetArr.push({ typeCode: 'VAT', number: party.vatNumber, issuerCountryCode });
        }
        if (party.eoriNumber && issuerCountryCode) {
            targetArr.push({ typeCode: 'EOR', number: party.eoriNumber, issuerCountryCode });
        }
        // TaxID intentionally omitted here (Moved to Invoice Instructions to avoid 'STN' error)
    };

    addRegParams(payload.customerDetails.shipperDetails.registrationNumbers, sender);
    addRegParams(payload.customerDetails.receiverDetails.registrationNumbers, receiver);

    // Clean empty registration arrays
    if (payload.customerDetails.shipperDetails.registrationNumbers.length === 0) {
        delete payload.customerDetails.shipperDetails.registrationNumbers;
    }
    if (payload.customerDetails.receiverDetails.registrationNumbers.length === 0) {
        delete payload.customerDetails.receiverDetails.registrationNumbers;
    }

    return payload;
}

module.exports = {
    buildDgrShipmentPayload,
    buildExportDeclaration,
    buildDangerousGoodsValueAddedServices,
    validateShipmentForDgr,
    validateDgrInvoiceData: validateShipmentForDgr // Alias for compatibility
};
