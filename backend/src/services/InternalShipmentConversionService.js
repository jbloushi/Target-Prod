const { prisma } = require('../config/database');
const CarrierFactory = require('./CarrierFactory');
const PricingService = require('./pricing.service');

const CONVERSION_ALLOWED_ROLES = new Set(['admin', 'manager', 'staff', 'accounting']);
const CLOSED_STATUSES = new Set(['cancelled', 'delivered']);

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const createHttpError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const defaultServiceCodeForCarrier = (carrierCode) => {
    const metadata = CarrierFactory.getCarrierMetadata(carrierCode);
    return metadata?.defaultServiceCode || 'P';
};

const buildRatePayload = (shipment, carrierCode, serviceCode) => ({
    ...shipment,
    carrierCode,
    serviceCode,
    sender: shipment.origin,
    receiver: shipment.destination,
    origin: shipment.origin,
    destination: shipment.destination,
    parcels: shipment.parcels || [],
    items: shipment.items || [],
    currency: shipment.currency || shipment.pricingSnapshot?.currency || 'KWD',
    shipmentType: shipment.shipmentType || 'package',
    dangerousGoods: shipment.origin?.dangerousGoods,
    insuredValue: shipment.origin?.insuredValue,
    incoterm: shipment.origin?.incoterm || shipment.incoterm || 'DAP',
    packagingType: shipment.origin?.packagingType || shipment.packagingType || 'user'
});

const buildManualConversionSnapshot = ({ shipment, carrierCode, serviceCode, quote, conversion }) => {
    const currency = quote?.currency || shipment.currency || shipment.pricingSnapshot?.currency || 'KWD';
    return {
        carrierRate: 0,
        markup: 0,
        totalPrice: 0,
        currency,
        billingCurrency: currency,
        policySource: 'manual',
        rulesVersion: 'conversion-manual-pricing-scaffold',
        rateType: 'CONVERSION_MANUAL',
        requiresManualPricing: true,
        targetCarrierCode: carrierCode,
        serviceCode,
        expiresAt: new Date(Date.now() + 86400000),
        conversion
    };
};

const buildPricedConversionSnapshot = ({ shipment, targetUser, carrierCode, serviceCode, quote, conversion }) => {
    if (quote.requiresManualPricing || quote.totalPrice === null || quote.totalPrice === undefined) {
        return buildManualConversionSnapshot({ shipment, carrierCode, serviceCode, quote, conversion });
    }

    const carrierPolicy = PricingService.resolveCarrierPricingPolicy(
        targetUser,
        carrierCode,
        quote.currency || shipment.currency || 'KWD'
    );
    const quoteCurrency = carrierPolicy.currency || quote.currency || shipment.currency || 'KWD';
    const baseCarrierRate = PricingService.applyCarrierBasePricePolicy(Number(quote.totalPrice || 0), targetUser, carrierCode);
    const { markup, source } = PricingService.resolveMarkup(targetUser, targetUser.organization, carrierCode);
    const snapshot = PricingService.createSnapshot(baseCarrierRate, markup, quoteCurrency, source);

    snapshot.billingCurrency = quoteCurrency;
    snapshot.declaredCurrency = shipment.currency || quoteCurrency;
    snapshot.optionalServices = [];
    snapshot.optionalServicesTotal = 0;
    snapshot.estimatedShipmentCost = snapshot.totalPrice;
    snapshot.targetCarrierCode = carrierCode;
    snapshot.serviceCode = serviceCode;
    snapshot.conversion = conversion;

    return snapshot;
};

class InternalShipmentConversionService {
    getConversionTargetCarriers() {
        return CarrierFactory
            .getAvailableCarriers()
            .filter((carrier) => carrier.active && carrier.capabilities?.supportsConversionTarget === true);
    }

    async convertToCarrier(trackingNumber, options = {}, actor = {}) {
        if (!CONVERSION_ALLOWED_ROLES.has(actor.role)) {
            throw createHttpError('Permission denied', 403);
        }

        const sourceShipment = await prisma.shipment.findUnique({
            where: { trackingNumber },
            include: { user: { include: { organization: true } }, organization: true }
        });

        if (!sourceShipment) throw createHttpError('Shipment not found', 404);
        if (normalizeCode(sourceShipment.carrierCode) !== 'INTERNAL') {
            throw createHttpError('Only INTERNAL shipments can be converted to another carrier', 400);
        }
        if (sourceShipment.pricingSnapshot?.conversion?.convertedAt) {
            throw createHttpError('Shipment has already been converted', 409);
        }
        if (CLOSED_STATUSES.has(sourceShipment.status)) {
            throw createHttpError(`Shipment cannot be converted from status ${sourceShipment.status}`, 400);
        }

        await this.assertNoPostedShipmentCharge(sourceShipment);

        const carrierCode = normalizeCode(options.carrierCode);
        const targetMetadata = CarrierFactory.getCarrierMetadata(carrierCode);
        if (!targetMetadata || targetMetadata.active !== true || targetMetadata.capabilities?.supportsConversionTarget !== true) {
            throw createHttpError(`Carrier ${carrierCode || 'UNKNOWN'} is not enabled for internal shipment conversion`, 400);
        }

        const serviceCode = normalizeCode(options.serviceCode) || defaultServiceCodeForCarrier(carrierCode);
        const adapter = CarrierFactory.getAdapter(carrierCode);
        const ratePayload = buildRatePayload(sourceShipment, carrierCode, serviceCode);
        const rawQuotes = await adapter.getRates(ratePayload);
        const quotes = Array.isArray(rawQuotes) ? rawQuotes : [];
        const selectedQuote = quotes.find((quote) => normalizeCode(quote.serviceCode) === serviceCode)
            || (quotes.length === 0 ? {
                serviceCode,
                serviceName: `${targetMetadata.name} Manual Pricing`,
                totalPrice: null,
                amount: null,
                currency: sourceShipment.currency || sourceShipment.pricingSnapshot?.currency || 'KWD',
                requiresManualPricing: true
            } : null);

        if (!selectedQuote) {
            throw createHttpError(`Service ${serviceCode} is not available from ${carrierCode}`, 400);
        }

        const now = new Date();
        const conversionMetadata = {
            trackingNumber: sourceShipment.trackingNumber,
            fromCarrierCode: 'INTERNAL',
            toCarrierCode: carrierCode,
            fromServiceCode: sourceShipment.serviceCode || 'STD',
            toServiceCode: serviceCode,
            convertedAt: now,
            convertedBy: actor.id || null
        };
        const targetUser = sourceShipment.user || { id: sourceShipment.userId, organization: sourceShipment.organization };
        if (!targetUser.organization && sourceShipment.organization) {
            targetUser.organization = sourceShipment.organization;
        }
        const snapshot = buildPricedConversionSnapshot({
            shipment: sourceShipment,
            targetUser,
            carrierCode,
            serviceCode,
            quote: selectedQuote,
            conversion: conversionMetadata
        });

        const sourceHistory = Array.isArray(sourceShipment.history) ? sourceShipment.history : [];
        const convertedShipment = await prisma.shipment.update({
            where: { id: sourceShipment.id },
            data: {
                status: 'ready_for_pickup',
                serviceCode,
                carrierCode,
                currentLocation: sourceShipment.currentLocation || sourceShipment.origin,
                price: snapshot.totalPrice,
                costPrice: snapshot.carrierRate,
                markupAmount: snapshot.markup,
                currency: snapshot.billingCurrency || snapshot.currency || sourceShipment.currency || 'KWD',
                pricingSnapshot: snapshot,
                estimatedDelivery: sourceShipment.estimatedDelivery || null,
                dhlConfirmed: false,
                carrierShipmentId: null,
                dhlTrackingNumber: null,
                documents: [],
                financeHold: null,
                paid: false,
                totalPaid: 0,
                remainingBalance: snapshot.totalPrice,
                bookingAttempts: [],
                history: [
                    ...sourceHistory,
                    {
                        status: 'ready_for_pickup',
                        description: `Carrier changed from INTERNAL to ${carrierCode}`,
                        source: 'platform',
                        timestamp: now,
                        location: sourceShipment.currentLocation || sourceShipment.origin || null
                    }
                ]
            }
        });

        return {
            success: true,
            shipment: convertedShipment,
            carrierCode,
            serviceCode,
            quote: selectedQuote
        };
    }

    async assertNoPostedShipmentCharge(shipment) {
        if (!shipment.organizationId || !prisma.organizationLedger?.findFirst) return;

        const existingCharge = await prisma.organizationLedger.findFirst({
            where: {
                sourceRepo: 'Shipment',
                sourceId: shipment.id,
                category: 'SHIPMENT_CHARGE',
                entryType: 'DEBIT',
                amount: { gt: 0 }
            }
        });

        if (existingCharge) {
            throw createHttpError('Shipment has posted finance charges and must be reversed before conversion', 409);
        }
    }
}

module.exports = new InternalShipmentConversionService();
