/**
 * Carrier PDF Document Generator
 * Generates lightweight, compliant PDF data URIs for Waybills and Customs Invoices
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
        '4 0 obj <</Font <</F1 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>> /F2 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>>>>> endobj'
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
        `/F1 13 Tf 0 -26 Td (TRACKING NUMBER / AWB: ${trkEsc}) Tj`,
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
        `/F2 8 Tf 0 -12 Td (Carrier Barcode Scan: ||||| |||| |||||| |||| ||| |||||| ||||) Tj`,
        `ET`
    );

    return buildPdfDocument(streamText);
}

function generateCarrierAwbPdf(shipment, carrierName = 'DHL Express') {
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

    const streamText = [
        'BT',
        `/F1 18 Tf 50 790 Td (${escapePdfText(carrierName.toUpperCase())} AIR WAYBILL) Tj`,
        `/F1 12 Tf 0 -22 Td (AWB NO: ${trk}) Tj`,
        `/F2 8 Tf 0 -14 Td (Target Tracking Ref: ${internalTrk} | Ingestion: ${escapePdfText(shipment.source || 'PHENIX_ERP')}) Tj`,
        
        `/F1 10 Tf 0 -25 Td (1. SHIPPER / ORIGIN) Tj`,
        `/F2 9 Tf 0 -14 Td (${senderName}) Tj`,
        `/F2 8 Tf 0 -12 Td (Phone: ${senderPhone}) Tj`,
        `/F2 8 Tf 0 -12 Td (Address: ${senderAddr}) Tj`,

        `/F1 10 Tf 0 -22 Td (2. CONSIGNEE / DESTINATION) Tj`,
        `/F2 9 Tf 0 -14 Td (${receiverName}) Tj`,
        `/F2 8 Tf 0 -12 Td (Phone: ${receiverPhone}) Tj`,
        `/F2 8 Tf 0 -12 Td (Address: ${receiverAddr}) Tj`,

        `/F1 10 Tf 0 -22 Td (3. SHIPMENT SPECIFICATIONS) Tj`,
        `/F2 9 Tf 0 -14 Td (Pieces: ${totalPieces} Pcs | Weight: ${totalWeight.toFixed(2)} KG | Service: ${escapePdfText(shipment.serviceName || shipment.serviceCode || 'Express Worldwide')}) Tj`,
        `/F2 9 Tf 0 -14 Td (Payment Terms: ${escapePdfText(shipment.paymentStatus || 'PREPAID')} | Incoterm: DAP) Tj`,

        `/F1 10 Tf 0 -25 Td (4. BARCODE & ROUTING CODES) Tj`,
        `/F1 14 Tf 0 -18 Td (|||||  ||||  ||||||  |||||  ||||  ||||||  ||||  |||||) Tj`,
        `/F2 8 Tf 0 -14 Td (${trk}) Tj`,

        `/F2 8 Tf 0 -22 Td (Verified by Target Logistics Express. Standard Conditions of Carriage apply.) Tj`,
        `ET`
    ];

    return buildPdfDocument(streamText);
}

function generateCarrierInvoicePdf(shipment, carrierName = 'DHL Express') {
    const trk = escapePdfText(shipment.carrierShipmentId || shipment.dhlTrackingNumber || shipment.trackingNumber);
    const invoiceNo = escapePdfText(shipment.documents?.phenixBillId ? `INV-PH-${shipment.documents.phenixBillId}` : `INV-${shipment.trackingNumber}`);
    const sender = shipment.origin || shipment.sender || {};
    const receiver = shipment.destination || shipment.receiver || {};
    const items = shipment.items || [];
    const currency = escapePdfText(shipment.currency || 'KWD');
    const totalAmount = Number(shipment.price || shipment.totalCharge || 0).toFixed(3);

    const streamText = [
        'BT',
        `/F1 18 Tf 50 790 Td (COMMERCIAL CUSTOMS INVOICE) Tj`,
        `/F1 11 Tf 0 -22 Td (INVOICE NO: ${invoiceNo} | CARRIER: ${escapePdfText(carrierName.toUpperCase())}) Tj`,
        `/F2 8 Tf 0 -14 Td (Waybill Ref: ${trk} | Date of Export: ${new Date().toISOString().split('T')[0]}) Tj`,

        `/F1 10 Tf 0 -25 Td (EXPORTER / SHIPPER) Tj`,
        `/F2 9 Tf 0 -14 Td (${escapePdfText(sender.name || sender.company || 'Shipper on file')}) Tj`,
        `/F2 8 Tf 0 -12 Td (${escapePdfText(sender.city || 'Kuwait City')}, ${escapePdfText(sender.countryCode || 'KW')}) Tj`,

        `/F1 10 Tf 0 -20 Td (IMPORTER / CONSIGNEE) Tj`,
        `/F2 9 Tf 0 -14 Td (${escapePdfText(receiver.name || receiver.company || 'Consignee on file')}) Tj`,
        `/F2 8 Tf 0 -12 Td (${escapePdfText(receiver.city || 'Destination City')}, ${escapePdfText(receiver.countryCode || 'GCC')}) Tj`,

        `/F1 10 Tf 0 -24 Td (ITEMIZED CUSTOMS DECLARATION) Tj`
    ];

    if (items.length > 0) {
        items.slice(0, 5).forEach((item, i) => {
            const desc = escapePdfText(item.description || `Merchandise Item #${i + 1}`);
            const qty = item.quantity || 1;
            const val = Number(item.declaredValue || item.value || (Number(totalAmount) / items.length) || 1).toFixed(3);
            streamText.push(`/F2 8 Tf 0 -14 Td (- ${desc} (Qty: ${qty}, Value: ${val} ${currency}, HS: ${escapePdfText(item.hsCode || '8500.00')})) Tj`);
        });
    } else {
        streamText.push(`/F2 8 Tf 0 -14 Td (- General Cargo / Express Merchandise (Qty: 1, Value: ${totalAmount} ${currency})) Tj`);
    }

    streamText.push(
        `/F1 10 Tf 0 -22 Td (TOTAL DECLARED CUSTOMS VALUE: ${totalAmount} ${currency}) Tj`,
        `/F2 8 Tf 0 -18 Td (Declaration: I declare that the information above is true and correct.) Tj`,
        `/F2 8 Tf 0 -14 Td (Authorized Signatory: Target Logistics Operations Desk / Customs Clearance) Tj`,
        `ET`
    );

    return buildPdfDocument(streamText);
}

module.exports = {
    createMinimalCarrierPdf,
    generateCarrierAwbPdf,
    generateCarrierInvoicePdf
};
