const { prisma } = require('../config/database');
const CarrierDocumentService = require('./CarrierDocumentService');
const { generateTargetShipmentReceiptPdf } = require('../utils/carrierPdfMock');

const TARGET_RECEIPT_VERSION = 2;

async function generateAndAttachTargetShipmentReceipt(shipment, carrierName) {
    const rawDocuments = shipment?.documents;
    let documents = rawDocuments;
    if (typeof documents === 'string') {
        try { documents = JSON.parse(documents); } catch { documents = []; }
    }

    const docList = Array.isArray(documents)
        ? documents
        : (Array.isArray(documents?.attachments) ? documents.attachments : []);
    const existing = docList.find((doc) => String(doc?.type || '').toLowerCase() === 'target_shipment_receipt') ||
        (!Array.isArray(documents) ? documents?.targetShipmentReceipt : null);
    if (Number(existing?.receiptVersion || 0) >= TARGET_RECEIPT_VERSION && (existing?.url || documents?.targetShipmentReceiptUrl)) {
        return shipment;
    }

    const receiptData = generateTargetShipmentReceiptPdf(shipment, carrierName);
    const uploaded = await CarrierDocumentService.uploadDocument(
        'target_shipment_receipt', receiptData, 'pdf', shipment.trackingNumber
    );
    if (!uploaded?.url) throw new Error('Target shipment receipt could not be stored');
    const receipt = { ...uploaded, receiptVersion: TARGET_RECEIPT_VERSION };

    const updatedDocuments = Array.isArray(documents)
        ? [...documents.filter((doc) => String(doc?.type || '').toLowerCase() !== 'target_shipment_receipt'), receipt]
        : {
            ...(documents && typeof documents === 'object' ? documents : {}),
            attachments: [...docList.filter((doc) => String(doc?.type || '').toLowerCase() !== 'target_shipment_receipt'), receipt],
            targetShipmentReceipt: receipt,
            targetShipmentReceiptUrl: receipt.url
        };

    return prisma.shipment.update({
        where: { id: shipment.id },
        data: { documents: updatedDocuments }
    });
}

module.exports = { generateAndAttachTargetShipmentReceipt, TARGET_RECEIPT_VERSION };
