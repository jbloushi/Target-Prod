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
    } catch (err) {
        // QR rendering is best effort; the printed label still carries the shipment ID.
    }

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

/**
 * Generates official Account Statement PDF for clients and organizations
 */
export const generateAccountStatementPDF = async (statement) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const primaryColor = [25, 118, 210]; // #1976d2
    const lightGrey = [245, 245, 245];
    const dividerColor = [200, 200, 200];

    const orgName = statement.organization?.name || 'Client Account';
    const orgCode = statement.organization?.code || '';
    const currency = statement.currency || 'KWD';
    const summary = statement.summary || {};
    const ledgerEntries = statement.ledgerEntries || [];

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TARGET LOGISTICS', 15, 20);

    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('STATEMENT OF ACCOUNT', pageWidth - 15, 20, { align: 'right' });

    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(1);
    doc.line(15, 25, pageWidth - 15, 25);

    // Organization & Date Details
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('STATEMENT ISSUED TO:', 15, 34);
    doc.setFont('helvetica', 'normal');
    doc.text(`${orgName} ${orgCode ? `(${orgCode})` : ''}`, 15, 40);

    doc.setFont('helvetica', 'bold');
    doc.text('DATE ISSUED:', pageWidth - 70, 34);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString(), pageWidth - 70, 40);

    doc.setFont('helvetica', 'bold');
    doc.text('CURRENCY:', pageWidth - 70, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(currency, pageWidth - 70, 54);

    // Summary Strip
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(15, 60, pageWidth - 30, 20, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL CHARGES (DEBIT)', 20, 68);
    doc.text('TOTAL PAYMENTS (CREDIT)', 75, 68);
    doc.text('CURRENT OUTSTANDING', 135, 68);

    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${Number(summary.totalDebits || 0).toFixed(3)} ${currency}`, 20, 75);
    doc.setTextColor(22, 163, 74); // Green
    doc.text(`${Number(summary.totalCredits || 0).toFixed(3)} ${currency}`, 75, 75);
    doc.setTextColor(summary.netBalance > 0 ? 220 : 0, summary.netBalance > 0 ? 38 : 0, summary.netBalance > 0 ? 38 : 0);
    doc.text(`${Number(summary.netBalance || 0).toFixed(3)} ${currency}`, 135, 75);

    // Helper to sanitize text for jsPDF default Helvetica font (avoids mojibake)
    const cleanAscii = (text) => {
        if (!text) return '';
        return String(text)
            .replace(/[^\x20-\x7E]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Ledger Rows — Sort chronologically with OPENING_BALANCE always first
    const sortedEntries = [...ledgerEntries].sort((a, b) => {
        const isAOpen = a.category === 'OPENING_BALANCE' || a.reference === 'OPENING_BAL';
        const isBOpen = b.category === 'OPENING_BALANCE' || b.reference === 'OPENING_BAL';
        if (isAOpen && !isBOpen) return -1;
        if (!isAOpen && isBOpen) return 1;
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });

    let running = 0;
    const tableRows = sortedEntries.map((entry) => {
        const debit = parseFloat(entry.debit || 0);
        const credit = parseFloat(entry.credit || 0);
        running += (debit - credit);

        return [
            entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-',
            cleanAscii(entry.reference || entry.category || 'TRANSACTION'),
            cleanAscii(entry.description || '-'),
            debit > 0 ? debit.toFixed(3) : '-',
            credit > 0 ? credit.toFixed(3) : '-',
            running.toFixed(3)
        ];
    });

    autoTable(doc, {
        startY: 88,
        head: [['Date', 'Ref / Category', 'Description', `Debit (${currency})`, `Credit (${currency})`, `Balance (${currency})`]],
        body: tableRows.length > 0 ? tableRows : [['-', 'No transactions recorded', '-', '-', '-', '-']],
        theme: 'plain',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', lineColor: dividerColor, lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 24 },
            1: { cellWidth: 42 },
            3: { cellWidth: 26, halign: 'right' },
            4: { cellWidth: 26, halign: 'right' },
            5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
        },
        didDrawPage: (data) => {
            const pageNum = doc.internal.getNumberOfPages();
            doc.setFontSize(7.5);
            doc.setTextColor(150, 150, 150);
            doc.text(`Page ${pageNum}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
            doc.text('© TARGET LOGISTICS HUB - OFFICIAL STATEMENT OF ACCOUNT', 15, pageHeight - 10);
        }
    });

    // Remittance Info Footer
    const finalY = (doc.lastAutoTable?.finalY || 120) + 12;
    if (finalY < pageHeight - 30) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('PAYMENT & REMITTANCE INSTRUCTIONS:', 15, finalY);
        doc.setFont('helvetica', 'normal');
        doc.text('Please quote your Organization Code on all wire transfers or bank deposits.', 15, finalY + 5);
        doc.text('Bank: National Bank of Kuwait (NBK) | Account: Target Logistics Co.', 15, finalY + 10);
    }

    const safeFilename = `${(orgName || 'Account').replace(/[^a-zA-Z0-9_-]/g, '_')}_Statement_${new Date().toISOString().slice(0, 10)}.pdf`;
    try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 3000);
    } catch (err) {
        doc.save(safeFilename);
    }
};

/**
 * Generates official Commercial / Tax Invoice PDF
 */
export const generateInvoicePDF = async (invoice) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const primaryColor = [25, 118, 210]; // #1976d2
    const lightGrey = [245, 245, 245];
    const dividerColor = [200, 200, 200];

    const orgName = invoice.organization?.name || 'Client Account';
    const invoiceNum = invoice.invoiceNumber || 'INVOICE';
    const currency = invoice.currency || 'KWD';
    const subtotal = Number(invoice.subtotal || 0).toFixed(3);
    const vat = Number(invoice.vat || 0).toFixed(3);
    const total = Number(invoice.total || 0).toFixed(3);
    const status = (invoice.status || 'draft').toUpperCase();

    const formatDate = (val) => val ? new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const pStart = formatDate(invoice.periodStart);
    const pEnd = formatDate(invoice.periodEnd);
    const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : 'Upon Receipt';

    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TARGET LOGISTICS', 15, 20);

    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('COMMERCIAL INVOICE', pageWidth - 15, 20, { align: 'right' });

    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(1);
    doc.line(15, 25, pageWidth - 15, 25);

    // Metadata Row
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('BILLED TO:', 15, 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(orgName, 15, 40);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE NUMBER:', pageWidth - 85, 34);
    doc.setFont('helvetica', 'normal');
    doc.text(invoiceNum, pageWidth - 15, 34, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text('BILLING PERIOD:', pageWidth - 85, 41);
    doc.setFont('helvetica', 'normal');
    doc.text(`${pStart} - ${pEnd}`, pageWidth - 15, 41, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text('DUE DATE:', pageWidth - 85, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(dueDate, pageWidth - 15, 48, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text('STATUS:', pageWidth - 85, 55);
    doc.setFont('helvetica', 'bold');
    if (status === 'PAID') {
        doc.setTextColor(22, 163, 74);
    } else {
        doc.setTextColor(220, 38, 38);
    }
    doc.text(status, pageWidth - 15, 55, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Summary Totals Strip
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(15, 62, pageWidth - 30, 20, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SUBTOTAL', 25, 70);
    doc.text('VAT / TAX', 85, 70);
    doc.text('TOTAL DUE', 145, 70);

    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(`${subtotal} ${currency}`, 25, 77);
    doc.text(`${vat} ${currency}`, 85, 77);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`${total} ${currency}`, 145, 77);

    // Lines table
    const lines = invoice.lines || [];
    const tableRows = lines.map((line, idx) => [
        idx + 1,
        line.trackingNumber || '—',
        line.shipmentDate ? formatDate(line.shipmentDate) : '—',
        `${Number(line.amount || 0).toFixed(3)} ${line.currency || currency}`,
        line.paid ? 'PAID' : 'UNPAID'
    ]);

    autoTable(doc, {
        startY: 90,
        head: [['#', 'Tracking Number', 'Shipment Date', `Charge (${currency})`, 'Status']],
        body: tableRows.length > 0 ? tableRows : [['-', 'No itemized charges listed', '-', '-', '-']],
        theme: 'plain',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8.5, cellPadding: 2.5, font: 'helvetica', lineColor: dividerColor, lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 12 },
            1: { cellWidth: 55, fontStyle: 'bold' },
            3: { halign: 'right' },
            4: { halign: 'center' }
        }
    });

    const finalY = (doc.lastAutoTable?.finalY || 130) + 15;
    if (finalY < pageHeight - 35) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text('PAYMENT INSTRUCTIONS:', 15, finalY);
        doc.setFont('helvetica', 'normal');
        doc.text(`Please quote invoice ${invoiceNum} on all bank transfers or K-Net payments.`, 15, finalY + 5);
        doc.text('Bank: National Bank of Kuwait (NBK) | Account: Target Logistics Services W.L.L.', 15, finalY + 10);
    }

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('© TARGET LOGISTICS HUB - OFFICIAL TAX INVOICE', pageWidth / 2, pageHeight - 10, { align: 'center' });

    const safeFilename = `${invoiceNum.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 3000);
    } catch (err) {
        doc.save(safeFilename);
    }
};

/**
 * Generates official Carrier Dispatch & Handover Manifest PDF
 */
export const generateCarrierManifestPDF = async (manifest) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const primaryColor = [25, 118, 210]; // #1976d2
    const lightGrey = [245, 245, 245];
    const dividerColor = [200, 200, 200];

    const carrier = manifest.carrier || 'CARRIER HANDOVER';
    const hub = manifest.hub || 'Kuwait Central Hub';
    const manifestNumber = manifest.manifestNumber || 'MNF-00000000-0000';
    const summary = manifest.summary || {};
    const items = manifest.items || [];

    // Header Branding
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TARGET LOGISTICS HUB', 14, 18);

    doc.setFontSize(15);
    doc.setTextColor(0, 0, 0);
    doc.text(`CARRIER DISPATCH MANIFEST — ${carrier.toUpperCase()}`, pageWidth - 14, 18, { align: 'right' });

    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(1);
    doc.line(14, 22, pageWidth - 14, 22);

    // Meta Row
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('MANIFEST NO:', 14, 29);
    doc.setFont('helvetica', 'normal');
    doc.text(manifestNumber, 42, 29);

    doc.setFont('helvetica', 'bold');
    doc.text('ORIGIN HUB:', 90, 29);
    doc.setFont('helvetica', 'normal');
    doc.text(hub, 115, 29);

    doc.setFont('helvetica', 'bold');
    doc.text('DISPATCH DATE:', 180, 29);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(manifest.generatedAt || Date.now()).toLocaleString(), 212, 29);

    // Summary Strip
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(14, 34, pageWidth - 28, 14, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL SHIPMENTS', 20, 40);
    doc.text('TOTAL PIECES', 65, 40);
    doc.text('TOTAL ACTUAL WT', 115, 40);
    doc.text('BILLABLE WT', 165, 40);
    doc.text('TOTAL DECLARED VAL', 215, 40);

    doc.setFontSize(10);
    doc.text(`${summary.totalShipments || 0}`, 20, 45);
    doc.text(`${summary.totalPieces || 0} PCS`, 65, 45);
    doc.text(`${Number(summary.totalActualWeight || 0).toFixed(2)} KG`, 115, 45);
    doc.text(`${Number(summary.totalBillableWeight || 0).toFixed(2)} KG`, 165, 45);
    doc.text(`$${Number(summary.totalDeclaredValue || 0).toFixed(2)} USD`, 215, 45);

    // Manifest Items Table
    const tableRows = items.map((item, idx) => [
        item.seq || idx + 1,
        item.trackingNumber,
        item.carrierTrackingNumber || '-',
        item.destinationCountry || 'KW',
        item.receiverName || '-',
        item.receiverCity || '-',
        `${item.pieces || 1}`,
        `${Number(item.chargeableWeight || 0).toFixed(2)} KG`,
        `${item.status || 'BOOKED'}`
    ]);

    autoTable(doc, {
        startY: 52,
        head: [['#', 'Target AWB', 'Carrier Tracking / AWB', 'Dest', 'Consignee Name', 'Destination City', 'Pcs', 'Chg Weight', 'Status']],
        body: tableRows.length > 0 ? tableRows : [['-', 'No shipments ready for dispatch', '-', '-', '-', '-', '-', '-', '-']],
        theme: 'plain',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, font: 'helvetica', lineColor: dividerColor, lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 32, fontStyle: 'bold' },
            2: { cellWidth: 35 },
            3: { cellWidth: 14, halign: 'center' },
            6: { cellWidth: 12, halign: 'center' },
            7: { cellWidth: 24, halign: 'right' }
        }
    });

    // Signatures Block
    const finalY = (doc.lastAutoTable?.finalY || 130) + 12;
    if (finalY < pageHeight - 30) {
        doc.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
        doc.line(14, finalY + 15, 90, finalY + 15);
        doc.line(120, finalY + 15, 195, finalY + 15);
        doc.line(220, finalY + 15, 280, finalY + 15);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('DISPATCHER SIGNATURE & SEAL', 14, finalY + 20);
        doc.text('CARRIER DRIVER SIGNATURE & BADGE ID', 120, finalY + 20);
        doc.text('RECEIVED PARCELS COUNT', 220, finalY + 20);
    }

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('© TARGET LOGISTICS HUB - OFFICIAL CARRIER HANDOVER MANIFEST', pageWidth / 2, pageHeight - 6, { align: 'center' });

    const pdfBlobUrl = doc.output('bloburl');
    window.open(pdfBlobUrl, '_blank');
};

/**
 * Generates official Commercial Customs Invoice PDF
 */
export const generateCommercialInvoicePDF = async (request) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const primaryColor = [0, 80, 212]; // TK.primary
    const lightGrey = [245, 247, 250];
    const dividerColor = [220, 226, 235];

    const rawSender = request.sender || request.origin || {};
    const rawReceiver = request.receiver || request.destination || {};
    const items = request.items || (request.parcels || []).map(p => ({
        description: p.description || 'General Merchandise',
        quantity: Number(p.quantity || p.qty || 1),
        price: Number(p.price || p.value || p.declaredValue || 0),
        currency: request.currency || 'KWD',
        hsCode: p.hsCode || request.hsCode || '8504.40',
        countryOfOrigin: p.countryOfOrigin || request.originCountryCode || 'KW'
    }));

    const cleanStr = (val) => (val && val !== 'undefined' && val !== 'null') ? String(val) : '';
    const currency = request.currency || 'KWD';
    const trackingNumber = request.trackingNumber || 'TLG-00000000';
    const invoiceNum = request.customsInvoice?.invoiceNumber || request.invoiceNumber || `INV-${trackingNumber.replace(/[^A-Z0-9]/gi, '')}`;
    const incoterm = request.incoterm || request.customs?.incoterms || 'DAP';
    const exportReason = request.exportReason || request.reason || 'Commercial / Merchandise';

    // Header Branding
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('TARGET LOGISTICS', 15, 20);

    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('COMMERCIAL INVOICE', pageWidth - 15, 20, { align: 'right' });

    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setLineWidth(1);
    doc.line(15, 24, pageWidth - 15, 24);

    // Meta Row Table Header
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(15, 28, pageWidth - 30, 18, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text('INVOICE NUMBER', 20, 34);
    doc.text('AWB / TRACKING NO', 70, 34);
    doc.text('DATE OF EXPORT', 120, 34);
    doc.text('INCOTERM & REASON', 165, 34);

    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(invoiceNum, 20, 41);
    doc.text(trackingNumber, 70, 41);
    doc.text(new Date(request.createdAt || Date.now()).toLocaleDateString('en-GB'), 120, 41);
    doc.text(`${incoterm} • ${exportReason.slice(0, 14)}`, 165, 41);

    // Shipper vs Consignee Card Columns
    const yCards = 52;
    const cardW = (pageWidth - 36) / 2;
    const cardH = 46;

    // Shipper Card
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(15, yCards, cardW, 8, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('EXPORTER / SHIPPER (FROM):', 18, yCards + 5.5);

    doc.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(15, yCards, cardW, cardH, 1, 1, 'S');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(cleanStr(rawSender.company || rawSender.name || rawSender.contactPerson || 'Shipper Contact'), 18, yCards + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(cleanStr(rawSender.addressLine1 || rawSender.addr1 || rawSender.streetLines?.[0] || 'Origin Address'), 18, yCards + 20);
    doc.text(`${cleanStr(rawSender.city || 'Kuwait City')}, ${cleanStr(rawSender.countryCode || 'KW')}`, 18, yCards + 26);
    doc.text(`Tel: ${cleanStr(rawSender.phone || 'N/A')}`, 18, yCards + 32);
    doc.text(`Tax/VAT: ${cleanStr(rawSender.taxId || rawSender.vatNumber || 'N/A')}`, 18, yCards + 38);

    // Consignee Card
    const xReceiver = 15 + cardW + 6;
    doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
    doc.rect(xReceiver, yCards, cardW, 8, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('IMPORTER / CONSIGNEE (TO):', xReceiver + 3, yCards + 5.5);

    doc.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(xReceiver, yCards, cardW, cardH, 1, 1, 'S');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(cleanStr(rawReceiver.company || rawReceiver.name || rawReceiver.contactPerson || 'Consignee Contact'), xReceiver + 3, yCards + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(cleanStr(rawReceiver.addressLine1 || rawReceiver.addr1 || rawReceiver.streetLines?.[0] || 'Destination Address'), xReceiver + 3, yCards + 20);
    doc.text(`${cleanStr(rawReceiver.city || 'Dubai')}, ${cleanStr(rawReceiver.countryCode || 'GCC')}`, xReceiver + 3, yCards + 26);
    doc.text(`Tel: ${cleanStr(rawReceiver.phone || 'N/A')}`, xReceiver + 3, yCards + 32);
    doc.text(`Tax/VAT: ${cleanStr(rawReceiver.taxId || rawReceiver.vatNumber || 'N/A')}`, xReceiver + 3, yCards + 38);

    // Commodity Line Items Table
    let totalQty = 0;
    let totalVal = 0;
    const tableData = items.map((item, idx) => {
        const qty = Number(item.quantity || item.qty || 1);
        const unitVal = Number(item.price || item.value || item.unitValue || 0);
        const lineTotal = qty * unitVal;
        totalQty += qty;
        totalVal += lineTotal;

        return [
            idx + 1,
            item.description || 'Commodity item',
            item.hsCode || '8504.40',
            item.countryOfOrigin || 'KW',
            qty,
            `${currency} ${unitVal.toFixed(3)}`,
            `${currency} ${lineTotal.toFixed(3)}`
        ];
    });

    autoTable(doc, {
        startY: yCards + cardH + 10,
        head: [['#', 'Commodity Item Description', 'HS Code', 'Origin', 'Qty', 'Unit Value', 'Total Value']],
        body: tableData.length > 0 ? tableData : [['1', 'General Merchandise', '8504.40', 'KW', '1', `${currency} 0.000`, `${currency} 0.000`]],
        theme: 'plain',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', lineColor: dividerColor, lineWidth: 0.1 },
        columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 65 },
            2: { cellWidth: 24 },
            3: { cellWidth: 16, halign: 'center' },
            4: { cellWidth: 14, halign: 'center' },
            5: { cellWidth: 25, halign: 'right' },
            6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' }
        },
        foot: [['TOTALS', '', '', '', `${totalQty}`, '', `${currency} ${totalVal.toFixed(3)}`]],
        footStyles: { fillColor: lightGrey, fontStyle: 'bold' }
    });

    // Declaration & Legal Notes
    const yDecl = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    const declText = 'I/We hereby certify that the information contained in this invoice is true, correct, and complete to the best of our knowledge, and that the contents of this shipment are properly classified, packed, and described in accordance with international customs and carrier carriage regulations.';
    doc.text(doc.splitTextToSize(declText, pageWidth - 30), 15, yDecl);

    // Signature Line
    const ySig = yDecl + 16;
    if (ySig < pageHeight - 30) {
        doc.setDrawColor(dividerColor[0], dividerColor[1], dividerColor[2]);
        doc.line(15, ySig + 12, 95, ySig + 12);
        doc.line(pageWidth - 95, ySig + 12, pageWidth - 15, ySig + 12);

        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('AUTHORIZED SIGNATURE & STAMP', 15, ySig + 18);
        doc.text('DATE & PLACE OF ISSUANCE', pageWidth - 95, ySig + 18);
    }

    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text('© TARGET LOGISTICS HUB - OFFICIAL COMMERCIAL CUSTOMS DOCUMENT', pageWidth / 2, pageHeight - 8, { align: 'center' });

    const pdfBlobUrl = doc.output('bloburl');
    window.open(pdfBlobUrl, '_blank');
};


