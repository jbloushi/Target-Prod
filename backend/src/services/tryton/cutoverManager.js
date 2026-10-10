const config = require('../../config/config');
const logger = require('../../utils/logger');
const trytonClient = require('./trytonClient');

class CutoverManager {
    constructor() {
        this.activeBackend = process.env.PRIMARY_BACKEND || config.primaryBackend || 'LEGACY_MYSQL';
    }

    /**
     * Gets the currently active primary backend.
     */
    getPrimaryBackend() {
        return this.activeBackend;
    }

    /**
     * Checks if Tryton is the primary source of truth.
     */
    isTrytonPrimary() {
        return this.activeBackend === 'TRYTON';
    }

    /**
     * Switches the primary backend dynamically (or on PM2 zero-downtime reload).
     */
    setPrimaryBackend(targetBackend) {
        const valid = ['TRYTON', 'LEGACY_MYSQL'];
        if (!valid.includes(targetBackend)) {
            throw new Error(`Invalid primary backend: ${targetBackend}. Must be one of: ${valid.join(', ')}`);
        }
        const previous = this.activeBackend;
        this.activeBackend = targetBackend;
        config.primaryBackend = targetBackend;
        logger.info(`[CutoverManager] Switched primary backend: ${previous} -> ${this.activeBackend}`);
        return { previous, current: this.activeBackend };
    }

    /**
     * Instant fallback runbook trigger to restore MySQL as primary.
     */
    fallbackToLegacyMysql() {
        return this.setPrimaryBackend('LEGACY_MYSQL');
    }

    /**
     * Routes shipment submission based on active primary backend.
     */
    async routeShipmentSubmission(command, actor, fallbackHandler) {
        if (this.isTrytonPrimary()) {
            logger.info(`[CutoverManager] PRIMARY=TRYTON: Executing direct Tryton write for ${command.reference || command.trackingNumber}`);
            
            // Primary write directly into Tryton ERP
            const trytonResult = await trytonClient.mirrorShipment({
                trackingNumber: command.trackingNumber || `TRK-TRYTON-${Date.now().toString().slice(-6)}`,
                totalWeight: command.weight || 1.5,
                carrierCode: command.carrierCode || 'DGR',
                user: actor
            });

            // Asynchronous shadow replica to MySQL for dual-read zero-risk safety
            if (fallbackHandler) {
                setImmediate(async () => {
                    try {
                        await fallbackHandler(command, actor);
                    } catch (e) {
                        logger.warn(`[CutoverManager] Shadow MySQL replica write failed: ${e.message}`);
                    }
                });
            }

            return {
                backend: 'TRYTON',
                trytonShipmentId: trytonResult?.trytonShipmentId,
                status: 'client_submitted',
                primarySuccess: true
            };
        } else {
            logger.info(`[CutoverManager] PRIMARY=LEGACY_MYSQL: Delegating to legacy MySQL pipeline with Tryton shadow queue`);
            const legacyResult = await fallbackHandler(command, actor);
            return {
                backend: 'LEGACY_MYSQL',
                ...legacyResult,
                primarySuccess: true
            };
        }
    }
}

module.exports = new CutoverManager();
