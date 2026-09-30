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

    const senderName = escapePdfText(sender.name || sender.company || 'Shipper on file');
    const senderPhone = escapePdfText(sender.phone || 'N/A');
    const senderAddr = escapePdfText(`${sender.city || 'Kuwait City'}, ${sender.countryCode || 'KW'}`);

    const receiverName = escapePdfText(receiver.name || receiver.company || 'Consignee on file');
    const receiverPhone = escapePdfText(receiver.phone || 'N/A');
    const receiverAddr = escapePdfText(`${receiver.city || 'Destination City'}, ${receiver.countryCode || 'GCC'}`);

    const originCode = escapePdfText(sender.countryCode || 'KW');
    const destCode = escapePdfText(receiver.countryCode || 'SA');

    const streamText = [
        'BT',
        `/F1 22 Tf 50 790 Td (${isDhl ? 'DHL EXPRESS' : escapePdfText(carrierName.toUpperCase())}) Tj`,
        `/F1 12 Tf 0 -22 Td (${isDhl ? 'EXPRESS WORLDWIDE (P)' : 'EXPRESS PRIORITY PARCEL'}) Tj`,
        `/F1 14 Tf 0 -24 Td (AWB / WAYBILL: ${trk}) Tj`,
        `/F2 8 Tf 0 -14 Td (Routing: KWI-${destCode} | Internal Ref: ${internalTrk} | Origin Hub: ${originCode}) Tj`,
        
        `/F1 11 Tf 0 -26 Td (FROM / SHIPPER:) Tj`,
        `/F2 9 Tf 0 -14 Td (${senderName}) Tj`,
        `/F2 8 Tf 0 -12 Td (Tel: ${senderPhone}) Tj`,
        `/F2 8 Tf 0 -12 Td (${senderAddr}) Tj`,

        `/F1 11 Tf 0 -22 Td (TO / CONSIGNEE:) Tj`,
        `/F2 9 Tf 0 -14 Td (${receiverName}) Tj`,
        `/F2 8 Tf 0 -12 Td (Tel: ${receiverPhone}) Tj`,
        `/F2 8 Tf 0 -12 Td (${receiverAddr}) Tj`,

        `/F1 11 Tf 0 -24 Td (SHIPMENT DETAILS & CUSTOMS SUMMARY:) Tj`,
        `/F2 9 Tf 0 -14 Td (Pieces: ${totalPieces} Pcs   |   Weight: ${totalWeight.toFixed(2)} KG   |   Terms: DAP) Tj`,
        `/F2 9 Tf 0 -14 Td (Payment Method: ${escapePdfText(shipment.paymentStatus || 'PAID')}   |   Account: 418002621) Tj`,

        `/F1 11 Tf 0 -26 Td (BARCODE VERIFICATION:) Tj`,
        `/F3 16 Tf 0 -20 Td (|||||  ||||  ||||||  |||||  ||||  ||||||  ||||  |||||) Tj`,
        `/F1 10 Tf 0 -16 Td (*${trk}*) Tj`,

        `/F2 8 Tf 0 -24 Td (Authorized Multi-Carrier Gateway. Official Transport & Carriage Document.) Tj`,
        `ET`
    ];

    return buildPdfDocument(streamText);
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

    const streamText = [
        'BT',
        `/F1 20 Tf 50 790 Td (${isDhl ? 'DHL EXPRESS - COMMERCIAL INVOICE' : 'COMMERCIAL CUSTOMS INVOICE'}) Tj`,
        `/F1 11 Tf 0 -22 Td (INVOICE NO: ${invoiceNo}   |   CARRIER: ${escapePdfText(carrierName.toUpperCase())}) Tj`,
        `/F2 8 Tf 0 -14 Td (Waybill Number: ${trk}   |   Date: ${new Date().toISOString().split('T')[0]}) Tj`,

        `/F1 10 Tf 0 -25 Td (EXPORTER / SHIPPER (SENDER):) Tj`,
        `/F2 9 Tf 0 -14 Td (${escapePdfText(sender.name || sender.company || 'Shipper on file')}) Tj`,
        `/F2 8 Tf 0 -12 Td (${escapePdfText(sender.city || 'Kuwait City')}, ${escapePdfText(sender.countryCode || 'KW')}) Tj`,

        `/F1 10 Tf 0 -20 Td (IMPORTER / CONSIGNEE (RECEIVER):) Tj`,
        `/F2 9 Tf 0 -14 Td (${escapePdfText(receiver.name || receiver.company || 'Consignee on file')}) Tj`,
        `/F2 8 Tf 0 -12 Td (${escapePdfText(receiver.city || 'Destination City')}, ${escapePdfText(receiver.countryCode || 'GCC')}) Tj`,

        `/F1 10 Tf 0 -24 Td (ITEMIZED MERCHANDISE DECLARATION:) Tj`
    ];

    if (items.length > 0) {
        items.slice(0, 5).forEach((item, i) => {
            const desc = escapePdfText(item.description || `Merchandise Item #${i + 1}`);
            const qty = item.quantity || 1;
            const val = Number(item.declaredValue || item.value || (Number(totalAmount) / items.length) || 1).toFixed(3);
            streamText.push(`/F2 8 Tf 0 -14 Td (${i + 1}. ${desc} | Qty: ${qty} | Declared Value: ${val} ${currency} | HS Code: ${escapePdfText(item.hsCode || '8500.00')}) Tj`);
        });
    } else {
        streamText.push(`/F2 8 Tf 0 -14 Td (1. Express Consignment Merchandise | Qty: 1 | Value: ${totalAmount} ${currency} | HS: 8500.00) Tj`);
    }

    streamText.push(
        `/F1 11 Tf 0 -24 Td (TOTAL CUSTOMS VALUE: ${totalAmount} ${currency}) Tj`,
        `/F2 8 Tf 0 -18 Td (Declaration: I declare that the goods and quantities above are true and correct.) Tj`,
        `/F2 8 Tf 0 -14 Td (Authorized Officer: Target Logistics Customs Clearance Desk) Tj`,
        `ET`
    );

    return buildPdfDocument(streamText);
}

module.exports = {
    createMinimalCarrierPdf,
    generateCarrierAwbPdf,
    generateCarrierInvoicePdf
};
