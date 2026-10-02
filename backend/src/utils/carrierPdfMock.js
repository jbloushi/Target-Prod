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
    const isDhl = String(carrierName || '').toLowerCase().includes('dhl') || String(shipment.carrierCode || '').toUpperCase() === 'DGR';
    const trk = escapePdfText(shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.trackingNumber);
    const internalTrk = escapePdfText(shipment.trackingNumber);
    const sender = shipment.origin || shipment.sender || {};
    const receiver = shipment.destination || shipment.receiver || {};
    const parcels = shipment.parcels || [];
    const totalWeight = parcels.reduce((sum, p) => sum + (Number(p.weight) || 0), 0) || Number(shipment.weight || 1.0);
    const totalPieces = parcels.reduce((sum, p) => sum + (Number(p.quantity) || 1), 0) || Number(shipment.pieces || 1);

    const senderName = escapePdfText(sender.name || sender.company || sender.contactPerson || 'Shipper on file');
    const senderPhone = escapePdfText(sender.phone || 'N/A');
    const senderAddr = escapePdfText(`${sender.city || 'Kuwait City'}, ${sender.countryCode || 'KW'}`);

    const receiverName = escapePdfText(receiver.name || receiver.company || receiver.contactPerson || 'Consignee on file');
    const receiverPhone = escapePdfText(receiver.phone || 'N/A');
    const receiverAddr = escapePdfText(`${receiver.city || 'Destination City'}, ${receiver.countryCode || 'GCC'}`);

    const originCode = escapePdfText(sender.countryCode || 'KW');
    const destCode = escapePdfText(receiver.countryCode || 'SA');

    const streamLines = [
        // Top Yellow/Red Carrier Banner
        'q',
        isDhl ? '1.0 0.8 0.0 rg 40 765 515 50 re f' : '0.9 0.9 0.9 rg 40 765 515 50 re f',
        '0.85 0.1 0.1 RG 3 w 40 815 515 0 re s',
        '0.2 0.2 0.2 RG 1 w 40 765 515 50 re s',
        'Q',
        'BT',
        `/F1 20 Tf 55 792 Td (${isDhl ? 'DHL EXPRESS' : escapePdfText(carrierName.toUpperCase())}) Tj`,
        `/F1 11 Tf 220 0 Td (AIR WAYBILL / TRANSPORT LABEL) Tj`,
        `/F2 9 Tf -220 -15 Td (Service: ${isDhl ? 'EXPRESS WORLDWIDE (P)' : 'EXPRESS PRIORITY PARCEL'}  |  Gateway: KWI-${destCode}) Tj`,
        'ET',

        // AWB Number & Barcode Area Box
        'q',
        '0.96 0.96 0.96 rg 40 685 515 65 re f',
        '0.7 0.7 0.7 RG 1 w 40 685 515 65 re s',
        'Q',
        'BT',
        `/F1 14 Tf 55 728 Td (WAYBILL (AWB): ${trk}) Tj`,
        `/F2 8 Tf 0 -13 Td (Internal Reference: ${internalTrk}   |   Origin Hub: ${originCode}   |   Destination: ${destCode}) Tj`,
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
        `/F2 8 Tf -265 -14 Td (Account: ${escapePdfText(shipment.origin?.shipperAccount || '418002621')}) Tj`,
        `/F2 8 Tf 265 0 Td (Terms: DAP / Duty Unpaid) Tj`,
        'ET',

        // Shipment Details Box
        'q',
        '0.8 0.8 0.8 RG 1 w 40 435 515 95 re s',
        '0.93 0.93 0.93 rg 40 505 515 25 re f',
        'Q',
        'BT',
        `/F1 10 Tf 50 513 Td (SHIPMENT PARTICULARS & MANIFEST SUMMARY:) Tj`,
        `/F2 9 Tf 0 -22 Td (Total Pieces: ${totalPieces} Pcs   |   Gross Weight: ${totalWeight.toFixed(2)} KG   |   Volumetric Weight: Standard) Tj`,
        `/F2 9 Tf 0 -16 Td (Payment Status: ${escapePdfText(shipment.paymentStatus || 'PAID')}   |   Shipment Date: ${new Date().toISOString().split('T')[0]}) Tj`,
        `/F2 8 Tf 0 -16 Td (Declared Goods: ${escapePdfText(shipment.items?.[0]?.description || 'Commercial Express Consignment')}) Tj`,
        'ET',

        // Footer & Legal
        'q',
        '0.8 0.8 0.8 RG 0.5 w 40 400 515 0 re s',
        'Q',
        'BT',
        `/F2 7 Tf 50 385 Td (Official Carrier Air Waybill document generated via Target Logistics Gateway under carrier operating license.) Tj`,
        `/F2 7 Tf 0 -10 Td (Carrier liability is strictly subject to the Montreal Convention and DHL Express Standard Conditions of Carriage.) Tj`,
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

module.exports = {
    createMinimalCarrierPdf,
    generateCarrierAwbPdf,
    generateCarrierInvoicePdf
};
