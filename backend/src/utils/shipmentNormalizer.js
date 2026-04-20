/**
 * Normalizes shipment payloads to the carrier-agnostic model.
 * @param {Object} data - The raw shipment data from DB or Frontend
 * @returns {Object} NormalizedShipment
 */
function normalizeShipment(data) {
    const normalizeAddress = (party = {}) => ({
        company: party.company || party.contactPerson,
        contactPerson: party.contactPerson,
        phone: party.phone,
        phoneCountryCode: party.phoneCountryCode || '+965',
        email: party.email,
        streetLines: party.streetLines || [party.addressLine1 || '', party.addressLine2 || '', party.addressLine3 || ''].filter(Boolean),
        city: party.city || party.cityName,
        postalCode: party.postalCode,
        countryCode: party.countryCode,
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
    });

    const items = (data.items || []).map(item => ({
        description: item.description,
        quantity: Number(item.quantity) || 1,

        // Accept all common client payload names
        value:
            Number(item.declaredValue) ||
            Number(item.value) ||
            Number(item.unitValue) ||
            10,

        currency: data.currency || item.currency || 'USD',
        netWeight: Number(item.weight) || 0.1,
        hsCode: item.hsCode,
        countryOfOrigin: item.countryOfOrigin,
        sku: item.sku,
        declaredValue: Number(item.declaredValue) || Number(item.value) || Number(item.unitValue) || undefined,
        unitValue: Number(item.unitValue) || undefined
    }));

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
        optionalServices: data.optionalServices, // Preserve optional services (array of codes)

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
        dangerousGoods: data.dangerousGoods,

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