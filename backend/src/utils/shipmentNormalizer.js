/**
 * Normalizes shipment payloads to the carrier-agnostic model.
 * @param {Object} data - The raw shipment data from DB or Frontend
 * @returns {Object} NormalizedShipment
 */
function normalizeShipment(data) {
    const normalizeAddress = (party = {}) => {
        const contact = party.contactPerson || party.contactName || party.name || party.company || party.companyName || 'Target Shipper';
        const company = party.company || party.companyName || party.contactPerson || party.contactName || party.name || 'Target Logistics';
        const rawAddress = party.address || party.formattedAddress || party.addr1 || '';
        const streetLines = party.streetLines || [party.addressLine1 || rawAddress || '', party.addressLine2 || party.addr2 || '', party.addressLine3 || ''].filter(Boolean);

        return {
            company: company,
            contactPerson: contact,
            phone: party.phone || '+96597691271',
            phoneCountryCode: party.phoneCountryCode || '+965',
            email: party.email || 'dispatch@target-kw.com',
            streetLines: streetLines.length > 0 ? streetLines : [rawAddress || 'Kuwait City, Kuwait'],
            city: party.city || party.cityName || (party.countryCode === 'KW' ? 'Kuwait City' : 'Riyadh'),
            postalCode: party.postalCode || party.zip || (party.countryCode === 'KW' ? '15300' : '00000'),
            countryCode: (party.countryCode || 'KW').toUpperCase(),
            state: party.state,
            taxId: party.taxId,
            vatNumber: party.vatNumber || party.vatNo,
            eoriNumber: party.eoriNumber || party.eori,
            traderType: party.traderType,
            reference: party.reference,
            // Structured Components
            unitNumber: party.unitNumber,
            buildingName: party.buildingName,
            area: party.area,
            landmark: party.landmark,
            deliveryNotes: party.deliveryNotes
        };
    };

    let items = (data.items || []).map(item => ({
        description: item.description || 'General Commercial Goods',
        quantity: Number(item.quantity) || 1,

        // Accept all common client payload names
        value:
            Number(item.declaredValue) ||
            Number(item.value) ||
            Number(item.unitValue) ||
            10,

        currency: item.currency || data.currency || 'USD',
        netWeight: Number(item.weight) || 0.1,
        hsCode: item.hsCode || '851712',
        countryOfOrigin: item.countryOfOrigin || data.origin?.countryCode || 'KW',
        sku: item.sku,
        declaredValue: Number(item.declaredValue) || Number(item.value) || Number(item.unitValue) || undefined,
        unitValue: Number(item.unitValue) || undefined
    }));

    if (items.length === 0 && data.shipmentType !== 'documents') {
        const firstParcel = (data.parcels || data.packages || [])[0] || {};
        const declaredVal = Number(data.customsInvoice?.declaredValue || data.price || 15);
        items = [{
            description: firstParcel.description || 'General Commercial Goods',
            quantity: 1,
            value: declaredVal > 0 ? declaredVal : 15,
            currency: data.currency || 'USD',
            netWeight: Number(firstParcel.weight) || 1.0,
            hsCode: data.customsInvoice?.hsCode || '851712',
            countryOfOrigin: data.origin?.countryCode || 'KW',
            declaredValue: declaredVal > 0 ? declaredVal : 15,
            unitValue: declaredVal > 0 ? declaredVal : 15
        }];
    }

    const totalDeclaredValue = items.reduce((sum, item) => sum + (item.value * item.quantity), 0);

    const packages = (data.parcels || data.packages || []).map(p => ({
        weight: { value: Number(p.weight) || 1, unit: 'kg' },
        dimensions: {
            length: Number(p.dimensions?.length || p.length) || 10,
            width: Number(p.dimensions?.width || p.width) || 10,
            height: Number(p.dimensions?.height || p.height) || 10,
            unit: 'cm'
        },
        description: p.description,
        type: data.packagingType || 'my_box',
        reference: p.reference
    }));

    // If no parcels, assume 1 package from items (Legacy support)
    if (packages.length === 0 && items.length > 0) {
        const totalWeight = items.reduce((sum, i) => sum + (i.netWeight * i.quantity), 0);
        packages.push({
            weight: { value: totalWeight || 1, unit: 'kg' },
            dimensions: { length: 10, width: 10, height: 10, unit: 'cm' },
            description: 'Consolidated Items',
            type: 'custom_jBox'
        });
    }

    // Merge Customer tax IDs into Sender if Sender didn't have them explicitly
    // The Controller saves them in 'customer' object for the shipment
    const customer = data.customer || {};
    const senderData = data.sender || data.origin || {};

    // Explicitly merge tax fields if missing in sender
    if (!senderData.vatNumber && customer.vatNo) senderData.vatNumber = customer.vatNo;
    if (!senderData.eoriNumber && customer.eori) senderData.eoriNumber = customer.eori;
    if (!senderData.taxId && customer.taxId) senderData.taxId = customer.taxId;
    if (!senderData.traderType && customer.traderType) senderData.traderType = customer.traderType;

    return {
        sender: normalizeAddress(senderData),
        receiver: normalizeAddress(data.receiver || data.destination || data.customerDetails?.receiverDetails || {}),

        shipmentDate: data.plannedDate || data.plannedShippingDateAndTime || data.shipmentDate,
        serviceCode: data.serviceCode || data.productCode,
        optionalServices: data.optionalServices || data.optionalServiceCodes, // Preserve optional service selections

        isDocument: data.shipmentType === 'documents' || data.isCustomsDeclarable === false,
        shipmentType: data.shipmentType,
        incoterm: data.incoterm || 'DAP',
        currency: data.currency || 'USD',
        declaredValue: data.declaredValue || totalDeclaredValue,
        exportReason: data.exportReason || 'Sale',
        exportReasonType: data.exportReasonType,
        placeOfIncoterm: data.placeOfIncoterm,
        remarks: data.remarks,
        reference: data.reference || data.sender?.reference,

        items,
        packages,
        dangerousGoods: data.dangerousGoods || data.origin?.dangerousGoods,

        gstPaid: data.gstPaid,
        payerOfVat: data.payerOfVat,
        palletCount: data.palletCount,
        packageMarks: data.packageMarks,
        receiverReference: data.receiverReference || data.receiver?.reference,
        forceInvoice: data.forceInvoice,
        hsCodeType: data.hsCodeType,
        shipperAccount: data.shipperAccount,
        insuredValue: data.insuredValue,
        senderContractNumber: data.senderContractNumber,
        receiverContractNumber: data.receiverContractNumber,
        packagingType: data.packagingType,
        labelSettings: data.labelSettings,

        invoice: {
            number: data.invoice?.number || `INV-${Date.now()}`,
            date: data.invoice?.date,
            signatureName: data.sender?.contactPerson || 'Shipper',
            signatureTitle: 'Sender'
        }
    };
}

module.exports = { normalizeShipment };
