const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { generateTargetShipmentReceiptPdf } = require('../utils/carrierPdfMock');

// This directory is deliberately outside /uploads, which is served as public static content.
const PRIVATE_RECEIPTS_DIR = path.resolve(__dirname, '../../private-shipment-receipts');

const getReceiptPath = (trackingNumber) => {
    const key = crypto.createHash('sha256').update(String(trackingNumber)).digest('hex');
    return path.join(PRIVATE_RECEIPTS_DIR, `${key}.pdf`);
};

async function generateAndStoreInternalShipmentReceipt(shipment, carrierName) {
    const dataUri = generateTargetShipmentReceiptPdf(shipment, carrierName, { includeInternalCosts: true });
    const base64 = dataUri.split(',')[1];
    if (!base64) throw new Error('Internal shipment receipt could not be generated');
    const filePath = getReceiptPath(shipment.trackingNumber);
    await fs.mkdir(PRIVATE_RECEIPTS_DIR, { recursive: true, mode: 0o700 });
    await fs.writeFile(filePath, Buffer.from(base64, 'base64'), { mode: 0o600 });
    await fs.chmod(filePath, 0o600);
    return filePath;
}

module.exports = { generateAndStoreInternalShipmentReceipt };
