const { prisma } = require('../config/database');
const logger = require('../utils/logger');

// Default SLA target hours by carrier and destination country
const DEFAULT_SLA_CONFIG = {
    // Domestic Kuwait
    DOMESTIC_HOURS: 24,
    DOMESTIC_EXPRESS_HOURS: 8,
    // GCC Regional
    GCC_HOURS: 72,
    GCC_EXPRESS_HOURS: 48,
    // International
    INTL_HOURS: 120,
    INTL_EXPRESS_HOURS: 72,
    // Penalty rate: percentage of shipping cost credited back per 24 hours of delay, capped at 100%
    PENALTY_RATE_PER_DAY_DELAY: 0.20, // 20% per day
    MAX_PENALTY_RATE: 1.0 // 100%
};

const GCC_COUNTRY_CODES = new Set(['KW', 'SA', 'AE', 'QA', 'BH', 'OM']);

class SlaTrackerService {
    /**
     * Determines SLA target hours for a shipment based on origin, destination and service
     */
    static getTargetHours(shipment, customSlaHours = null) {
        if (typeof customSlaHours === 'number' && customSlaHours > 0) {
            return customSlaHours;
        }

        const destCountry = (shipment.destination?.countryCode || shipment.destination?.country || 'KW').toUpperCase();
        const originCountry = (shipment.origin?.countryCode || shipment.origin?.country || 'KW').toUpperCase();
        const isExpress = (shipment.serviceCode || '').toLowerCase().includes('express');

        if (originCountry === 'KW' && destCountry === 'KW') {
            return isExpress ? DEFAULT_SLA_CONFIG.DOMESTIC_EXPRESS_HOURS : DEFAULT_SLA_CONFIG.DOMESTIC_HOURS;
        }

        if (GCC_COUNTRY_CODES.has(destCountry)) {
            return isExpress ? DEFAULT_SLA_CONFIG.GCC_EXPRESS_HOURS : DEFAULT_SLA_CONFIG.GCC_HOURS;
        }

        return isExpress ? DEFAULT_SLA_CONFIG.INTL_EXPRESS_HOURS : DEFAULT_SLA_CONFIG.INTL_HOURS;
    }

    /**
     * Evaluates the SLA performance of an individual shipment
     * @param {Object} shipment 
     * @param {Object} [options]
     * @returns {Object} SLA Evaluation details
     */
    static evaluateShipment(shipment, options = {}) {
        if (!shipment) return null;

        const targetHours = this.getTargetHours(shipment, options.customSlaHours);
        const startTime = new Date(shipment.createdAt || Date.now());
        
        // Find delivered timestamp from history or checkpoints if available
        let deliveredTime = null;
        if (shipment.status === 'delivered') {
            const history = Array.isArray(shipment.history) ? shipment.history : [];
            const deliveredEntry = history.find(h => (h.status || '').toLowerCase() === 'delivered');
            deliveredTime = deliveredEntry?.timestamp ? new Date(deliveredEntry.timestamp) : new Date(shipment.updatedAt || Date.now());
        }

        const endTime = deliveredTime || new Date();
        const elapsedHours = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60));
        const isDelivered = shipment.status === 'delivered';
        const isFinal = ['delivered', 'cancelled', 'returned'].includes(shipment.status);

        let slaStatus = 'IN_TRANSIT_ON_SCHEDULE';
        let isBreached = false;
        let delayHours = 0;

        if (isDelivered) {
            if (elapsedHours <= targetHours) {
                slaStatus = 'ON_TIME';
            } else {
                slaStatus = 'SLA_BREACHED';
                isBreached = true;
                delayHours = Math.round((elapsedHours - targetHours) * 10) / 10;
            }
        } else if (!isFinal) {
            if (elapsedHours > targetHours) {
                slaStatus = 'IN_TRANSIT_OVERDUE';
                isBreached = true;
                delayHours = Math.round((elapsedHours - targetHours) * 10) / 10;
            } else if (elapsedHours > targetHours * 0.75) {
                slaStatus = 'IN_TRANSIT_AT_RISK';
            }
        } else {
            slaStatus = shipment.status.toUpperCase();
        }

        // Calculate estimated late penalty credit
        let penaltyAmount = 0;
        const shippingCost = Number(shipment.price || shipment.costPrice || 0);
        if (isBreached && delayHours > 0 && shippingCost > 0) {
            const daysDelayed = Math.ceil(delayHours / 24);
            const penaltyPercent = Math.min(
                DEFAULT_SLA_CONFIG.MAX_PENALTY_RATE,
                daysDelayed * (options.penaltyRatePerDay || DEFAULT_SLA_CONFIG.PENALTY_RATE_PER_DAY_DELAY)
            );
            penaltyAmount = Math.round(shippingCost * penaltyPercent * 1000) / 1000;
        }

        return {
            shipmentId: shipment.id,
            trackingNumber: shipment.trackingNumber,
            carrierCode: shipment.carrierCode,
            status: shipment.status,
            targetHours,
            elapsedHours: Math.round(elapsedHours * 10) / 10,
            delayHours,
            slaStatus,
            isBreached,
            startTime,
            deliveredTime,
            currency: shipment.currency || 'KWD',
            shippingCost,
            estimatedPenaltyCredit: penaltyAmount
        };
    }

    /**
     * Generates an aggregated Carrier SLA & Penalty Performance Report
     * @param {Object} filterOptions
     * @param {string} [filterOptions.organizationId]
     * @param {string} [filterOptions.carrierCode]
     * @param {Date} [filterOptions.startDate]
     * @param {Date} [filterOptions.endDate]
     */
    static async getCarrierSlaReport(filterOptions = {}) {
        const { organizationId, carrierCode, startDate, endDate } = filterOptions;

        const where = {};
        if (organizationId) where.organizationId = organizationId;
        if (carrierCode) where.carrierCode = carrierCode;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const shipments = await prisma.shipment.findMany({
            where,
            select: {
                id: true,
                trackingNumber: true,
                carrierCode: true,
                serviceCode: true,
                status: true,
                price: true,
                costPrice: true,
                currency: true,
                origin: true,
                destination: true,
                history: true,
                createdAt: true,
                updatedAt: true
            },
            take: 500,
            orderBy: { createdAt: 'desc' }
        });

        const evaluations = shipments.map(s => this.evaluateShipment(s));
        const total = evaluations.length;
        const delivered = evaluations.filter(e => e.status === 'delivered');
        const onTime = delivered.filter(e => e.slaStatus === 'ON_TIME');
        const lateDelivered = delivered.filter(e => e.slaStatus === 'SLA_BREACHED');
        const overdueInTransit = evaluations.filter(e => e.slaStatus === 'IN_TRANSIT_OVERDUE');

        const onTimeRate = delivered.length > 0
            ? Math.round((onTime.length / delivered.length) * 1000) / 10
            : 100;

        const totalPenaltyCredits = evaluations.reduce((acc, e) => acc + (e.estimatedPenaltyCredit || 0), 0);

        // Group by carrier
        const carrierBreakdown = {};
        for (const ev of evaluations) {
            const cCode = ev.carrierCode || 'UNASSIGNED';
            if (!carrierBreakdown[cCode]) {
                carrierBreakdown[cCode] = {
                    carrierCode: cCode,
                    total: 0,
                    delivered: 0,
                    onTime: 0,
                    late: 0,
                    penaltyCredits: 0
                };
            }
            carrierBreakdown[cCode].total++;
            if (ev.status === 'delivered') {
                carrierBreakdown[cCode].delivered++;
                if (ev.slaStatus === 'ON_TIME') {
                    carrierBreakdown[cCode].onTime++;
                } else {
                    carrierBreakdown[cCode].late++;
                }
            }
            carrierBreakdown[cCode].penaltyCredits += ev.estimatedPenaltyCredit || 0;
        }

        Object.values(carrierBreakdown).forEach(c => {
            c.onTimeRate = c.delivered > 0 ? Math.round((c.onTime / c.delivered) * 1000) / 10 : 100;
            c.penaltyCredits = Math.round(c.penaltyCredits * 1000) / 1000;
        });

        return {
            summary: {
                totalShipments: total,
                deliveredCount: delivered.length,
                onTimeCount: onTime.length,
                lateDeliveredCount: lateDelivered.length,
                overdueInTransitCount: overdueInTransit.length,
                onTimeRatePercentage: onTimeRate,
                totalPenaltyCredits: Math.round(totalPenaltyCredits * 1000) / 1000,
                currency: shipments[0]?.currency || 'KWD'
            },
            carrierBreakdown: Object.values(carrierBreakdown),
            recentBreaches: evaluations.filter(e => e.isBreached).slice(0, 50)
        };
    }
}

module.exports = SlaTrackerService;
