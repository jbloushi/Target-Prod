/**
 * Carrier PDF Document Generator
 * Generates lightweight, compliant PDF documents for Waybills and Customs Invoices
 * for DHL Express (DGR), Aramex, FedEx, OTE, and Internal platform consignments.
 */

function escapePdfText(text) {
    if (!text) return '';
    return String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdfDocument(streamTextLines) {
    const lines = [
        '%PDF-1.4',
        '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
        '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj',
        '3 0 obj <</Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 595 842] /Contents 5 0 R>> endobj',
        '4 0 obj <</Font <</F1 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>> /F2 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> /F3 <</Type /Font /Subtype /Type1 /BaseFont /Courier-Bold>>>>>> endobj'
    ];

    const streamContent = streamTextLines.join('\n');
    const streamLength = Buffer.byteLength(streamContent, 'utf8');

    lines.push(
        `5 0 obj <</Length ${streamLength}>> stream`,
        streamContent,
        `endstream endobj`,
        `xref`,
        `0 6`,
        `0000000000 65535 f `,
        `0000000010 00000 n `,
        `0000000060 00000 n `,
        `0000000117 00000 n `,
        `0000000219 00000 n `,
        `0000000340 00000 n `,
        `trailer <</Size 6 /Root 1 0 R>>`,
        `startxref`,
        `500`,
        `%%EOF`
    );

    const pdfBuffer = Buffer.from(lines.join('\n'), 'utf8');
    return `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
}

function createMinimalCarrierPdf(title, trackingNumber, carrier = 'DHL Express', extraDetails = {}) {
    const carrierEsc = escapePdfText(carrier.toUpperCase());
    const titleEsc = escapePdfText(title.toUpperCase());
    const trkEsc = escapePdfText(trackingNumber);

    const streamText = [
        'BT',
        `/F1 18 Tf 50 780 Td (${carrierEsc} - ${titleEsc}) Tj`,
        `/F1 13 Tf 0 -26 Td (WAYBILL / AWB: ${trkEsc}) Tj`,
        `/F2 9 Tf 0 -20 Td (Target Express Multi-Carrier Gateway - Official Air Logistics Document) Tj`,
        `/F2 9 Tf 0 -15 Td (Date: ${new Date().toISOString()}) Tj`,
        `/F2 9 Tf 0 -15 Td (Status: CARRIER DISPATCH CONFIRMED - READY FOR FLIGHT / TRANSIT) Tj`
    ];

    if (extraDetails.origin) {
        streamText.push(`/F2 9 Tf 0 -15 Td (Origin: ${escapePdfText(extraDetails.origin)}) Tj`);
    }
    if (extraDetails.destination) {
        streamText.push(`/F2 9 Tf 0 -15 Td (Destination: ${escapePdfText(extraDetails.destination)}) Tj`);
    }
    if (extraDetails.service) {
        streamText.push(`/F2 9 Tf 0 -15 Td (Service: ${escapePdfText(extraDetails.service)}) Tj`);
    }

    streamText.push(
        `/F1 11 Tf 0 -30 Td (SECURITY & CUSTOMS CLEARANCE MANIFEST) Tj`,
        `/F2 8 Tf 0 -15 Td (This electronic document serves as verified carrier registration and customs declaration.) Tj`,
        `/F3 12 Tf 0 -14 Td (|||||  ||||  ||||||  |||||  ||||  ||||||  ||||  |||||) Tj`,
        `ET`
    );

    return buildPdfDocument(streamText);
}

function generateCarrierAwbPdf(shipment, carrierName = 'DHL Express') {
    const isInternal = String(carrierName || '').toLowerCase().includes('target') || String(shipment.carrierCode || '').toUpperCase() === 'INTERNAL';
    const isDhl = !isInternal && (String(carrierName || '').toLowerCase().includes('dhl') || String(shipment.carrierCode || '').toUpperCase() === 'DGR');
    const trk = escapePdfText(shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.trackingNumber);
    const internalTrk = escapePdfText(shipment.trackingNumber);
    const sender = shipment.origin || shipment.sender || {};
    const receiver = shipment.destination || shipment.receiver || {};
    const parcels = shipment.parcels || [];
    const totalWeight = parcels.reduce((sum, p) => sum + (Number(p.weight) || 0), 0) || Number(shipment.weight || 1.0);
    const totalPieces = parcels.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0) || Number(shipment.pieces || 1);

    const senderName = escapePdfText(sender.name || sender.company || sender.contactPerson || 'Target Logistics Shipper');
    const senderPhone = escapePdfText(sender.phone || 'N/A');
    const senderAddr = escapePdfText(`${sender.city || 'Kuwait City'}, ${sender.countryCode || 'KW'}`);

    const receiverName = escapePdfText(receiver.name || receiver.company || receiver.contactPerson || 'Consignee on file');
    const receiverPhone = escapePdfText(receiver.phone || 'N/A');
    const receiverAddr = escapePdfText(`${receiver.city || 'Kuwait City'}, ${receiver.countryCode || 'KW'}`);

    const originCode = escapePdfText(sender.countryCode || 'KW');
    const destCode = escapePdfText(receiver.countryCode || (isInternal ? 'KW' : 'SA'));

    const bannerColor = isInternal ? '0.75 0.1 0.1 rg' : (isDhl ? '1.0 0.8 0.0 rg' : '0.1 0.2 0.4 rg');
    const bannerTitle = isInternal ? 'TARGET LOGISTICS' : (isDhl ? 'DHL EXPRESS' : escapePdfText(carrierName.toUpperCase()));
    const bannerSubtitle = isInternal ? 'DOMESTIC EXPRESS WAYBILL / LABEL' : 'AIR WAYBILL / TRANSPORT LABEL';
    const serviceTitle = isInternal ? 'Service: TARGET EXPRESS (DOM)  |  Hub: KUWAIT DOMESTIC (KWI)' : (isDhl ? `Service: EXPRESS WORLDWIDE (${escapePdfText(shipment.serviceCode || 'P')})  |  Gateway: KWI-${destCode}` : `Service: EXPRESS PRIORITY  |  Gateway: KWI-${destCode}`);
    const codText = shipment.codAmount ? `   |   COD Amount: ${Number(shipment.codAmount).toFixed(3)} ${escapePdfText(shipment.codCurrency || 'KWD')}` : '';

    const streamLines = [
        // Top Banner
        'q',
        `${bannerColor} 40 765 515 50 re f`,
        '0.85 0.1 0.1 RG 3 w 40 815 515 0 re s',
        '0.2 0.2 0.2 RG 1 w 40 765 515 50 re s',
        'Q',
        'BT',
        isInternal ? '1.0 1.0 1.0 rg' : '0.0 0.0 0.0 rg',
        `/F1 20 Tf 55 792 Td (${bannerTitle}) Tj`,
        `/F1 11 Tf 220 0 Td (${bannerSubtitle}) Tj`,
        `/F2 9 Tf -220 -15 Td (${serviceTitle}) Tj`,
        '0.0 0.0 0.0 rg',
        'ET',

        // AWB Number & Barcode Area Box
        'q',
        '0.96 0.96 0.96 rg 40 685 515 65 re f',
        '0.7 0.7 0.7 RG 1 w 40 685 515 65 re s',
        'Q',
        'BT',
        `/F1 14 Tf 55 728 Td (WAYBILL (AWB): ${trk}) Tj`,
        `/F2 8 Tf 0 -13 Td (Reference: ${internalTrk}   |   Origin Hub: ${originCode}   |   Destination: ${destCode}) Tj`,
        `/F3 16 Tf 0 -18 Td (|||||  ||||  ||||||  |||||  ||||  ||||||  ||||  |||||) Tj`,
        `/F1 9 Tf 0 -12 Td (*${trk}*) Tj`,
        'ET',

        // Shipper & Consignee Side-by-Side Boxes
        'q',
        '0.8 0.8 0.8 RG 1 w 40 550 250 120 re s',
        '0.93 0.93 0.93 rg 40 645 250 25 re f',
        '0.8 0.8 0.8 RG 1 w 305 550 250 120 re s',
        '0.93 0.93 0.93 rg 305 645 250 25 re f',
        'Q',
        'BT',
        `/F1 10 Tf 50 653 Td (FROM / SHIPPER:) Tj`,
        `/F1 10 Tf 265 0 Td (TO / CONSIGNEE:) Tj`,
        `/F1 9 Tf -265 -22 Td (${senderName}) Tj`,
        `/F1 9 Tf 265 0 Td (${receiverName}) Tj`,
        `/F2 8 Tf -265 -14 Td (Tel: ${senderPhone}) Tj`,
        `/F2 8 Tf 265 0 Td (Tel: ${receiverPhone}) Tj`,
        `/F2 8 Tf -265 -14 Td (${senderAddr}) Tj`,
        `/F2 8 Tf 265 0 Td (${receiverAddr}) Tj`,
        `/F2 8 Tf -265 -14 Td (Account: ${escapePdfText(shipment.origin?.shipperAccount || 'TARGET-KW')}) Tj`,
        `/F2 8 Tf 265 0 Td (Terms: ${isInternal ? 'DOMESTIC DELIVERY' : 'DAP / Duty Unpaid'}) Tj`,
        'ET',

        // Shipment Details Box
        'q',
        '0.8 0.8 0.8 RG 1 w 40 435 515 95 re s',
        '0.93 0.93 0.93 rg 40 505 515 25 re f',
        'Q',
        'BT',
        `/F1 10 Tf 50 513 Td (SHIPMENT PARTICULARS & MANIFEST SUMMARY:) Tj`,
        `/F2 9 Tf 0 -22 Td (Total Pieces: ${totalPieces} Pcs   |   Gross Weight: ${totalWeight.toFixed(2)} KG   |   Volumetric Weight: Standard) Tj`,
        `/F2 9 Tf 0 -16 Td (Payment Status: ${escapePdfText(shipment.paymentStatus || 'PAID')}${codText}   |   Date: ${new Date().toISOString().split('T')[0]}) Tj`,
        `/F2 8 Tf 0 -16 Td (Declared Goods: ${escapePdfText(shipment.items?.[0]?.description || 'E-Commerce Package / Goods')}) Tj`,
        'ET',

        // Footer & Legal
        'q',
        '0.8 0.8 0.8 RG 0.5 w 40 400 515 0 re s',
        'Q',
        'BT',
        `/F2 7 Tf 50 385 Td (Official Transport Waybill document generated via Target Logistics Gateway - www.target-kw.com) Tj`,
        `/F2 7 Tf 0 -10 Td (Carrier liability is strictly subject to Target Logistics Conditions of Carriage.) Tj`,
        'ET'
    ];

    return buildPdfDocument(streamLines);
}

function generateCarrierInvoicePdf(shipment, carrierName = 'DHL Express') {
    const isDhl = String(carrierName || '').toLowerCase().includes('dhl') || String(shipment.carrierCode || '').toUpperCase() === 'DGR';
    const trk = escapePdfText(shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.trackingNumber);
    const invoiceNo = escapePdfText(shipment.documents?.phenixBillId ? `INV-PH-${shipment.documents.phenixBillId}` : `INV-${shipment.trackingNumber}`);
    const sender = shipment.origin || shipment.sender || {};
    const receiver = shipment.destination || shipment.receiver || {};
    const items = shipment.items || [];
    const currency = escapePdfText(shipment.currency || 'KWD');
    const totalAmount = Number(shipment.price || shipment.totalCharge || 0).toFixed(3);

    const senderName = escapePdfText(sender.name || sender.company || sender.contactPerson || 'Shipper on file');
    const receiverName = escapePdfText(receiver.name || receiver.company || receiver.contactPerson || 'Consignee on file');

    const streamLines = [
        // Header
        'q',
        isDhl ? '1.0 0.8 0.0 rg 40 765 515 50 re f' : '0.9 0.9 0.9 rg 40 765 515 50 re f',
        '0.85 0.1 0.1 RG 3 w 40 815 515 0 re s',
        '0.2 0.2 0.2 RG 1 w 40 765 515 50 re s',
        'Q',
        'BT',
        `/F1 18 Tf 55 792 Td (${isDhl ? 'DHL EXPRESS' : escapePdfText(carrierName.toUpperCase())}) Tj`,
        `/F1 11 Tf 220 0 Td (COMMERCIAL CUSTOMS INVOICE) Tj`,
        `/F2 8 Tf -220 -15 Td (Invoice No: ${invoiceNo}   |   Date: ${new Date().toISOString().split('T')[0]}   |   Waybill: ${trk}) Tj`,
        'ET',

        // Shipper & Consignee
        'q',
        '0.8 0.8 0.8 RG 1 w 40 645 250 100 re s',
        '0.93 0.93 0.93 rg 40 720 250 25 re f',
        '0.8 0.8 0.8 RG 1 w 305 645 250 100 re s',
        '0.93 0.93 0.93 rg 305 720 250 25 re f',
        'Q',
        'BT',
        `/F1 10 Tf 50 728 Td (EXPORTER / SENDER:) Tj`,
        `/F1 10 Tf 265 0 Td (IMPORTER / CONSIGNEE:) Tj`,
        `/F1 9 Tf -265 -20 Td (${senderName}) Tj`,
        `/F1 9 Tf 265 0 Td (${receiverName}) Tj`,
        `/F2 8 Tf -265 -13 Td (${escapePdfText(sender.city || 'Kuwait City')}, ${escapePdfText(sender.countryCode || 'KW')}) Tj`,
        `/F2 8 Tf 265 0 Td (${escapePdfText(receiver.city || 'Destination City')}, ${escapePdfText(receiver.countryCode || 'GCC')}) Tj`,
        `/F2 8 Tf -265 -13 Td (Tel: ${escapePdfText(sender.phone || 'N/A')}) Tj`,
        `/F2 8 Tf 265 0 Td (Tel: ${escapePdfText(receiver.phone || 'N/A')}) Tj`,
        'ET',

        // Merchandise Table
        'q',
        '0.8 0.8 0.8 RG 1 w 40 450 515 175 re s',
        '0.90 0.90 0.90 rg 40 595 515 30 re f',
        'Q',
        'BT',
        `/F1 9 Tf 50 605 Td (#   Description                                         Qty     Unit Value        Total Value      HS Code) Tj`,
        'ET'
    ];

    if (items.length > 0) {
        items.slice(0, 5).forEach((item, i) => {
            const desc = escapePdfText((item.description || `Merchandise Item #${i + 1}`).substring(0, 35));
            const qty = item.quantity || 1;
            const unitVal = Number(item.declaredValue || item.value || (Number(totalAmount) / items.length) || 1).toFixed(3);
            const lineTotal = (Number(unitVal) * qty).toFixed(3);
            const hs = escapePdfText(item.hsCode || '8517.12');
            const yOffset = 575 - (i * 22);

            streamLines.push(
                'BT',
                `/F2 8 Tf 50 ${yOffset} Td (${i + 1}   ${desc.padEnd(40, ' ')}   ${String(qty).padEnd(4, ' ')}   ${unitVal} ${currency}   ${lineTotal} ${currency}   ${hs}) Tj`,
                'ET'
            );
        });
    } else {
        streamLines.push(
            'BT',
            `/F2 8 Tf 50 575 Td (1   Commercial Express Merchandise Consignment          1       ${totalAmount} ${currency}   ${totalAmount} ${currency}   8517.12) Tj`,
            'ET'
        );
    }

    // Totals & Declaration
    streamLines.push(
        'q',
        '0.95 0.95 0.95 rg 40 370 515 60 re f',
        '0.8 0.8 0.8 RG 1 w 40 370 515 60 re s',
        'Q',
        'BT',
        `/F1 11 Tf 50 410 Td (TOTAL DECLARED CUSTOMS VALUE:  ${totalAmount} ${currency}) Tj`,
        `/F2 8 Tf 0 -18 Td (I declare that the information in this invoice is true and correct and represents genuine commercial value.) Tj`,
        `/F1 8 Tf 0 -14 Td (Authorized Signatory: Target Logistics International Clearance Operations) Tj`,
        'ET'
    );

    return buildPdfDocument(streamLines);
}

function generateCarrierAwbPdfBuffer(shipment, carrierName = 'Target Express') {
    const dataUrl = generateCarrierAwbPdf(shipment, carrierName);
    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
}

/**
 * Generates a Target-branded customer receipt or a staff-only accounting receipt.
 * Customer copies show billed amount components and never show carrier costs.
 */
function generateTargetShipmentReceiptPdf(shipment, carrierName = 'Target Express', options = {}) {
    const trk = escapePdfText(shipment.trackingNumber || 'N/A');
    const carrierAwb = escapePdfText(shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.trackingNumber || 'Pending');
    const carrierLabel = escapePdfText(carrierName || shipment.carrierCode || 'Target Express');
    const service = escapePdfText(shipment.serviceCode || 'STD');
    const sender = shipment.origin || shipment.sender || {};
    const receiver = shipment.destination || shipment.receiver || {};
    const parcels = Array.isArray(shipment.parcels) ? shipment.parcels : [];
    const totalWeight = parcels.reduce((sum, p) => sum + (Number(p?.weight) || 0), 0) || Number(shipment.weight || 1.0);
    const totalPieces = parcels.reduce((sum, p) => sum + (Number(p?.quantity) || 1), 0) || Number(shipment.pieces || 1);

    const totalPriceNumber = Math.max(0, Number(shipment.price ?? shipment.pricingSnapshot?.totalPrice ?? 0) || 0);
    const totalPrice = totalPriceNumber.toFixed(3);
    const rawCarrierCost = shipment.carrierCost ?? shipment.costPrice ?? shipment.pricingSnapshot?.carrierRate ?? shipment.pricingSnapshot?.baseRate;
    const carrierCost = rawCarrierCost === null || rawCarrierCost === undefined || rawCarrierCost === '' || !Number.isFinite(Number(rawCarrierCost))
        ? 'NOT RECORDED'
        : Number(rawCarrierCost).toFixed(3);
    const isInternal = options.includeInternalCosts === true;
    const currency = escapePdfText(shipment.currency || shipment.pricingSnapshot?.currency || 'KWD');
    const shipmentCreatedAt = new Date(shipment.createdAt || Date.now());
    const validShipmentDate = !Number.isNaN(shipmentCreatedAt.getTime());
    // Keep November shipment receipts aligned with their shipment date; other receipts
    // are dated when generated so the document is not silently backdated.
    const receiptDate = validShipmentDate && shipmentCreatedAt.getUTCMonth() === 10
        ? shipmentCreatedAt
        : new Date();
    const createdDate = escapePdfText(receiptDate.toISOString().slice(0, 19).replace('T', ' '));

    const addressText = (address) => [address.addressLine1, address.addressLine2, address.street, address.block, address.building]
        .filter(Boolean).join(', ');
    const senderLine = escapePdfText(`${sender.name || sender.company || 'Shipper'} | ${addressText(sender)}`);
    const senderContact = escapePdfText(`${[sender.city, sender.state, sender.postalCode, sender.countryCode || 'KW'].filter(Boolean).join(', ')} | ${sender.phone || ''} | ${sender.email || ''}`);
    const receiverLine = escapePdfText(`${receiver.name || receiver.company || 'Consignee'} | ${addressText(receiver)}`);
    const receiverContact = escapePdfText(`${[receiver.city, receiver.state, receiver.postalCode, receiver.countryCode].filter(Boolean).join(', ')} | ${receiver.phone || ''} | ${receiver.email || ''}`);
    const shipmentType = escapePdfText(shipment.shipmentType || shipment.serviceType || shipment.description || 'General Cargo');
    const snapshot = shipment.pricingSnapshot && typeof shipment.pricingSnapshot === 'object' ? shipment.pricingSnapshot : {};
    const optionalServices = Array.isArray(snapshot.optionalServices)
        ? snapshot.optionalServices.map((item) => ({
            label: String(item?.serviceName || item?.name || item?.serviceCode || 'Optional service').slice(0, 42),
            amount: Number(item?.totalPrice)
        })).filter((item) => Number.isFinite(item.amount) && item.amount > 0)
        : [];
    const optionalTotal = Math.min(totalPriceNumber, Math.max(
        0,
        Number(snapshot.optionalServicesTotal) || optionalServices.reduce((sum, item) => sum + item.amount, 0)
    ));
    const detailedOptionalTotal = optionalServices.reduce((sum, item) => sum + item.amount, 0);
    const storedPaid = Math.max(0, Number(shipment.totalPaid) || 0);
    const totalPaid = shipment.paid && storedPaid <= 0 ? totalPriceNumber : storedPaid;
    const remainingBalance = shipment.paid
        ? 0
        : Math.max(0, Number(shipment.remainingBalance ?? (totalPriceNumber - totalPaid)) || 0);
    const paidText = shipment.paid || remainingBalance <= 0.001 ? 'PAID' : 'BILLED / ON ACCOUNT';
    const chargeRows = isInternal
        ? [
            { label: 'Carrier cost (internal)', amount: carrierCost },
            { label: 'Customer charge', amount: `${totalPrice} ${currency}` }
        ]
        : [
            { label: 'Shipment service', amount: `${Math.max(0, totalPriceNumber - optionalTotal).toFixed(3)} ${currency}` },
            ...(optionalTotal > 0 && optionalServices.length > 0 && Math.abs(detailedOptionalTotal - optionalTotal) < 0.002
                ? [
                    ...optionalServices.slice(0, 3).map((item) => ({ label: item.label, amount: `${item.amount.toFixed(3)} ${currency}` })),
                    ...(optionalServices.length > 3 ? [{
                        label: 'Other selected services',
                        amount: `${optionalServices.slice(3).reduce((sum, item) => sum + item.amount, 0).toFixed(3)} ${currency}`
                    }] : [])
                ]
                : optionalTotal > 0 ? [{ label: 'Additional services', amount: `${optionalTotal.toFixed(3)} ${currency}` }] : [])
        ];
    const chargeSectionLines = [
        'q',
        '0.94 0.96 1.0 rg 40 350 515 195 re f',
        '0.78 0.83 0.9 RG 1 w 40 350 515 195 re s',
        'Q',
        'BT',
        '/F1 11 Tf 55 523 Td (CHARGE BREAKDOWN) Tj',
        'ET'
    ];
    let chargeY = 500;
    chargeRows.forEach((row) => {
        chargeSectionLines.push(
            'BT',
            `/F2 9 Tf 58 ${chargeY} Td (${escapePdfText(row.label)}) Tj`,
            'ET',
            'BT',
            `/F2 9 Tf 385 ${chargeY} Td (${escapePdfText(row.amount)}) Tj`,
            'ET'
        );
        chargeY -= 17;
    });
    chargeY -= 4;
    chargeSectionLines.push(
        'q',
        `0.72 0.78 0.86 RG 0.8 w 55 ${chargeY + 10} m 540 ${chargeY + 10} l S`,
        'Q',
        'BT',
        `/F1 10 Tf 58 ${chargeY - 5} Td (${isInternal ? 'CUSTOMER TOTAL CHARGED:' : 'TOTAL CHARGED:'}) Tj`,
        'ET',
        'BT',
        `/F1 10 Tf 385 ${chargeY - 5} Td (${totalPrice} ${currency}) Tj`,
        'ET',
        'BT',
        `/F2 8 Tf 58 ${chargeY - 23} Td (Payment status: ${paidText}) Tj`,
        'ET',
        'BT',
        `/F2 8 Tf 270 ${chargeY - 23} Td (Paid: ${totalPaid.toFixed(3)} ${currency}) Tj`,
        'ET',
        'BT',
        `/F2 8 Tf 405 ${chargeY - 23} Td (Balance: ${remainingBalance.toFixed(3)} ${currency}) Tj`,
        'ET',
        'BT',
        ...(isInternal ? [`/F2 8 Tf 58 ${chargeY - 40} Td (CONFIDENTIAL - INTERNAL STAFF / ACCOUNTING USE ONLY) Tj`] : [`/F2 8 Tf 58 ${chargeY - 40} Td (Customer receipt issued by Target Logistics Kuwait) Tj`]),
        'ET'
    );

    const streamLines = [
        'q',
        '0.0 0.31 0.83 rg 40 765 515 50 re f',
        '0.0 0.31 0.83 RG 1 w 40 765 515 50 re s',
        '1.0 1.0 1.0 RG 2 w 55 790 m 55 799 62 806 71 806 c 80 806 87 799 87 790 c 87 781 80 774 71 774 c 62 774 55 781 55 790 c S',
        '1.0 1.0 1.0 RG 2 w 61 790 m 61 796 65 800 71 800 c 77 800 81 796 81 790 c 81 784 77 780 71 780 c 65 780 61 784 61 790 c S',
        '1.0 1.0 1.0 rg 68 787 6 6 re f',
        'Q',
        'BT',
        '1.0 1.0 1.0 rg',
        '/F1 18 Tf 100 794 Td (TARGET) Tj',
        'ET',
        'BT',
        '1.0 1.0 1.0 rg',
        '/F2 8 Tf 101 779 Td (LOGISTICS  |  KUWAIT) Tj',
        'ET',
        'BT',
        '1.0 1.0 1.0 rg',
        `/F1 10 Tf 350 796 Td (${isInternal ? 'INTERNAL COST RECEIPT' : 'SHIPMENT RECEIPT'}) Tj`,
        'ET',
        'BT',
        '1.0 1.0 1.0 rg',
        `/F2 7 Tf 350 780 Td (${carrierLabel}  |  ${service}  |  ${createdDate} UTC) Tj`,
        'ET',
        'BT',
        '0.0 0.0 0.0 rg',
        `/F1 12 Tf 50 735 Td (Target Tracking #: ${trk}) Tj`,
        `/F2 10 Tf 0 -18 Td (Carrier AWB / Ref: ${carrierAwb}) Tj`,
        `/F1 10 Tf 0 -28 Td (SHIPPER DETAILS) Tj`,
        `/F2 9 Tf 0 -15 Td (${senderLine}) Tj`,
        `/F2 8 Tf 0 -12 Td (${senderContact}) Tj`,
        `/F1 10 Tf 0 -22 Td (CONSIGNEE DETAILS) Tj`,
        `/F2 9 Tf 0 -15 Td (${receiverLine}) Tj`,
        `/F2 8 Tf 0 -12 Td (${receiverContact}) Tj`,
        `/F1 10 Tf 0 -22 Td (CONSIGNMENT SUMMARY) Tj`,
        `/F2 9 Tf 0 -15 Td (Type: ${shipmentType}   |   Pieces: ${totalPieces}   |   Chargeable / Actual Weight: ${Number(totalWeight).toFixed(2)} KG) Tj`,
        'ET',
        ...chargeSectionLines
    ];

    return buildPdfDocument(streamLines);
}

module.exports = {
    createMinimalCarrierPdf,
    generateCarrierAwbPdf,
    generateCarrierAwbPdfBuffer,
    generateCarrierInvoicePdf,
    generateTargetShipmentReceiptPdf
};
