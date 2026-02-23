import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

/**
 * Generates the official "Shipment Label" PDF
 * Optimized for A4 printing with clear information hierarchy.
 */
export const generateWaybillPDF = async (request) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // --- Colors & Styling ---
    const primaryColor = [25, 118, 210]; // #1976d2
    const lightGrey = [245, 245, 245];
    const dividerColor = [200, 200, 200];

    // --- Improved Data Extraction (Handles both Wizard State & Backend Model) ---
    const parcels = request.parcels || [];

    // Support aliases: Wizard uses sender/receiver, Backend uses origin/destination (or customerDetails)
    const rawSender = request.sender || request.origin || request.customerDetails?.shipperDetails || {};
    const rawReceiver = request.receiver || request.destination || request.customerDetails?.receiverDetails || {};

    // Helper to clean "undefined" strings and nulls
    const cleanStr = (val) => (val && val !== 'undefined' && val !== 'null') ? val : '';

    // Helper to normalize party data
    const extractParty = (data) => {
        const phoneCode = cleanStr(data.phoneCountryCode);
        const phoneNum = cleanStr(data.phone);

        return {
            company: cleanStr(data.company || data.companyName || data.contactPerson || 'N/A'),
            contactPerson: cleanStr(data.contactPerson || data.fullName || 'N/A'),
            phone: `${phoneCode} ${phoneNum}`.trim(),
            reference: cleanStr(data.reference || 'N/A'),
            vat: cleanStr(data.vatNumber || data.vatNo || 'N/A'),
            // Address parts
            addressLine1: Array.isArray(data.streetLines) ? cleanStr(data.streetLines[0]) : cleanStr(data.address || data.formattedAddress || 'N/A'),
            addressLine2: Array.isArray(data.streetLines) && data.streetLines[1] ? cleanStr(data.streetLines[1]) : (data.buildingName ? `${cleanStr(data.buildingName)} ${cleanStr(data.unitNumber)}`.trim() : ''),
            city: cleanStr(data.city || data.cityName),
            country: cleanStr(data.countryCode || data.country)
        };
    };

    const sender = extractParty(rawSender);
    const receiver = extractParty(rawReceiver);

    const totals = request.totals || parcels.reduce((acc, p) => {
        const qty = Number(p.quantity) || 1;
        // Handle both flat (Wizard) and nested (Backend) dimensions
        const len = Number(p.length || p.dimensions?.length || 0);
        const wid = Number(p.width || p.dimensions?.width || 0);
        const hgt = Number(p.height || p.dimensions?.height || 0);

        const v = (len * wid * hgt) / 5000;
        acc.pieces += qty;
        acc.actualWeight += (Number(p.weight) || 0) * qty;
        acc.volumetricWeight += v * qty;
        acc.declaredValue += (Number(p.declaredValue) || 0) * qty;
        return acc;
    }, { pieces: 0, actualWeight: 0, volumetricWeight: 0, declaredValue: 0 });

    const billableWeight = totals.billableWeight || Math.max(totals.actualWeight, totals.volumetricWeight);

    // --- Helper Functions ---
    const drawSectionHeader = (text, x, y, width) => {
        doc.setFillColor(0, 0, 0); // Black header for printing
        doc.rect(x, y, width, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(text.toUpperCase(), x + 2, y + 5.5);
        doc.setTextColor(0, 0, 0);
    };

    const drawCardFrame = (x, y, w, h) => {
        doc.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
        doc.setLineWidth(0.1);
        doc.roundedRect(x, y, w, h, 1, 1, 'S');
    };

    // --- 1. Top Branding & Header ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TARGET LOGISTICS', 15, 20);

    doc.setFontSize(18);
    doc.setTextColor(0, 0, 0);
    doc.text('SHIPMENT LABEL v3', pageWidth - 15, 20, { align: 'right' });

    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(1);
    doc.line(15, 25, pageWidth - 15, 25);

    // --- 2. Main Metadata Row ---
    const qrSize = 35;
    const qrX = pageWidth - 15 - qrSize;
    const qrY = 32;

    try {
        const trackingNum = request.trackingNumber && request.trackingNumber !== 'PENDING' ? request.trackingNumber : request._id;
        const qrData = JSON.stringify({
            id: request._id,
            tracking: trackingNum
        });
        const qrImage = await QRCode.toDataURL(qrData);
        doc.addImage(qrImage, 'PNG', qrX, qrY, qrSize, qrSize);
    } catch (err) { }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SHIPMENT ID:', 15, 35);
    doc.setFont('helvetica', 'normal');
    const displayId = (request.trackingNumber && request.trackingNumber !== 'PENDING' ? request.trackingNumber : request._id) || 'PENDING';
    doc.text(displayId.toUpperCase(), 15, 41);

    doc.setFont('helvetica', 'bold');
    doc.text('SHIP DATE:', 60, 35);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString(), 60, 41);

    doc.setFont('helvetica', 'bold');
    doc.text('SERVICE LEVEL:', 100, 35);
    doc.setFont('helvetica', 'normal');
    doc.text(request.selectedRate?.serviceName?.toUpperCase() || 'STANDARD EXPRESS', 100, 41);

    // --- 3. Totals Strip ---
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(15, 50, pageWidth - 70, 16, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PCS', 20, 56);
    doc.text('BILLABLE WEIGHT', 55, 56);
    doc.text('TOTAL VALUE', 95, 56);

    doc.setFontSize(11);
    doc.text(`${totals.pieces}`, 20, 62);
    doc.text(`${billableWeight.toFixed(2)} KG`, 55, 62);
    doc.text(`$${totals.declaredValue.toFixed(2)} USD`, 95, 62);

    // --- 4. Shipper & Receiver Info ---
    // --- 4. Shipper & Receiver Info ---
    const yCards = 75;
    const cardW = (pageWidth - 35) / 2;
    const cardH = 50;

    // From (Shipper)
    drawSectionHeader('FROM (SHIPPER)', 15, yCards, cardW);
    drawCardFrame(15, yCards + 8, cardW, cardH);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(sender.company.toUpperCase(), 20, yCards + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Attn: ${sender.contactPerson}`, 20, yCards + 21);
    doc.text(`Tel: ${sender.phone}`, 20, yCards + 25);
    doc.text(`Ref: ${sender.reference}`, 20, yCards + 29);

    const senderAddr = doc.splitTextToSize(`${sender.addressLine1}\n${sender.addressLine2}\n${sender.city}, ${sender.country}\n${sender.vat ? `VAT: ${sender.vat}` : ''}`, cardW - 10);
    doc.text(senderAddr, 20, yCards + 35);

    // To (Consignee)
    const recX = 15 + cardW + 5;
    drawSectionHeader('TO (CONSIGNEE)', recX, yCards, cardW);
    drawCardFrame(recX, yCards + 8, cardW, cardH);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(receiver.company.toUpperCase(), recX + 5, yCards + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Attn: ${receiver.contactPerson}`, recX + 5, yCards + 21);
    doc.text(`Tel: ${receiver.phone}`, recX + 5, yCards + 25);
    doc.text(`Ref: ${receiver.reference}`, recX + 5, yCards + 29);

    const recAddr = doc.splitTextToSize(`${receiver.addressLine1}\n${receiver.addressLine2}\n${receiver.city}, ${receiver.country}\n${receiver.vat ? `VAT: ${receiver.vat}` : ''}`, cardW - 10);
    doc.text(recAddr, recX + 5, yCards + 35);

    // --- 5. Parcel Table ---
    // --- 5. Parcel Table ---
    const tableData = parcels.map((p, i) => {
        const len = Number(p.length || p.dimensions?.length || 0);
        const wid = Number(p.width || p.dimensions?.width || 0);
        const hgt = Number(p.height || p.dimensions?.height || 0);
        const qty = Number(p.quantity || 1);

        // Try to find value in parcel, or fallback to corresponding item by index (simplified)
        // If passing backend object, values are in 'items' array
        const itemVal = Number(p.declaredValue || (request.items && request.items[i]?.declaredValue) || 0);
        const totalVal = itemVal * qty;

        return [
            i + 1,
            p.description || (request.items && request.items[i]?.description) || 'N/A',
            `${Number(p.weight).toFixed(2)} KG`,
            `${len}x${wid}x${hgt}`,
            qty,
            `$${totalVal.toFixed(2)}`
        ];
    });

    autoTable(doc, {
        startY: yCards + cardH + 15,
        head: [['PCS', 'Description', 'Unit Weight', 'Dimensions', 'Qty', 'Total Value']],
        body: tableData,
        theme: 'plain',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', lineColor: dividerColor, lineWidth: 0.1 },
        columnStyles: { 0: { cellWidth: 10 }, 4: { cellWidth: 15 }, 5: { cellWidth: 30 } },
        foot: [['TOTALS', '', `${totals.actualWeight.toFixed(2)} KG`, '', `${totals.pieces}`, `$${totals.declaredValue.toFixed(2)}`]],
        footStyles: { fillColor: lightGrey, fontStyle: 'bold' }
    });

    // --- 6. Declaration & Signatures ---
    const ySign = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    const declText = 'I hereby declare that the contents of this consignment are fully and accurately described above and are in proper condition for international transport according to applicable regulations.';
    doc.text(doc.splitTextToSize(declText, pageWidth - 30), 15, ySign);

    doc.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    doc.line(15, ySign + 25, 80, ySign + 25);
    doc.line(115, ySign + 25, 180, ySign + 25);

    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('SHIPPER SIGNATURE & DATE', 15, ySign + 30);
    doc.text('RECEIVER SIGNATURE & DATE', 115, ySign + 30);

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('© TARGET LOGISTICS HUB - OFFICIAL SHIPMENT DOCUMENT', pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Open Printer
    const pdfBlobUrl = doc.output('bloburl');
    window.open(pdfBlobUrl, '_blank');
};
