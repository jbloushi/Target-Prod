const axios = require('axios');
const http = require('http');
const config = require('../../config/config');
const logger = require('../../utils/logger');

class TrytonClient {
    constructor(options = {}) {
        this.baseUrl = (options.url || config.tryton?.url || 'http://127.0.0.1:8000').replace(/\/+$/, '');
        this.database = options.database || config.tryton?.database || 'target_prod';
        this.username = options.username || config.tryton?.username || 'admin';
        this.password = options.password || config.tryton?.password || 'admin';
        this.enabled = options.enabled ?? (config.tryton?.enabled !== false);
        this.shadowMode = options.shadowMode ?? (config.tryton?.shadowMode !== false);

        this.cachedSession = null;
        this.client = axios.create({
            httpAgent: new http.Agent({ keepAlive: true, maxSockets: 20 }),
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    /**
     * Authenticates with Tryton JSON-RPC and caches the session token.
     */
    async login(forceRefresh = false) {
        if (!forceRefresh && this.cachedSession && this.cachedSession.expiresAt > Date.now()) {
            return this.cachedSession;
        }

        const endpoint = `${this.baseUrl}/${this.database}/rpc/`;
        const payload = {
            id: Date.now(),
            method: 'common.db.login',
            params: [this.username, { password: this.password }]
        };

        const res = await this.client.post(endpoint, payload);
        if (res.data?.error) {
            throw new Error(`Tryton Login Error: ${JSON.stringify(res.data.error)}`);
        }

        const dataResult = res.data && typeof res.data === 'object' && 'result' in res.data ? res.data.result : res.data;
        const [userId, sessionToken] = Array.isArray(dataResult) ? dataResult : [];
        if (!userId || !sessionToken) {
            throw new Error(`Tryton Login failed: Missing user ID or session token in response: ${JSON.stringify(res.data)}`);
        }

        // Format: Session base64(username:userId:sessionToken)
        const rawAuth = `${this.username}:${userId}:${sessionToken}`;
        const authHeader = `Session ${Buffer.from(rawAuth).toString('base64')}`;

        this.cachedSession = {
            userId,
            sessionToken,
            authHeader,
            expiresAt: Date.now() + 25 * 60 * 1000 // 25 min expiry cache
        };

        return this.cachedSession;
    }

    /**
     * Executes arbitrary Tryton JSON-RPC method with automatic re-login on 401.
     */
    async execute(method, params = [], context = {}) {
        if (!this.enabled) {
            logger.debug(`[TrytonClient] Skipping ${method}: Tryton integration disabled`);
            return null;
        }

        const session = await this.login();
        const endpoint = `${this.baseUrl}/${this.database}/rpc/`;
        
        // Tryton standard: context dict is the final argument of RPC methods
        const rpcParams = [...params, context];
        const payload = {
            id: Date.now(),
            method,
            params: rpcParams
        };

        try {
            const res = await this.client.post(endpoint, payload, {
                headers: { Authorization: session.authHeader }
            });

            if (res.data?.error) {
                throw new Error(`Tryton RPC Error [${method}]: ${JSON.stringify(res.data.error)}`);
            }

            return res.data && typeof res.data === 'object' && 'result' in res.data ? res.data.result : res.data;
        } catch (err) {
            // If 401 or session expired, attempt one re-login and retry
            if (err.response?.status === 401 || err.response?.status === 403 || err.message?.includes('Session') || err.response?.data?.error?.toString().includes('Session')) {
                logger.warn(`[TrytonClient] Session expired for ${method}, re-authenticating...`);
                const refreshed = await this.login(true);
                const retryRes = await this.client.post(endpoint, payload, {
                    headers: { Authorization: refreshed.authHeader }
                });
                if (retryRes.data?.error) {
                    throw new Error(`Tryton RPC Retry Error [${method}]: ${JSON.stringify(retryRes.data.error)}`);
                }
                return retryRes.data && typeof retryRes.data === 'object' && 'result' in retryRes.data ? retryRes.data.result : retryRes.data;
            }
            throw err;
        }
    }

    /**
     * Model method helper: model.<model_name>.<method_name>
     */
    async modelCall(model, method, ...args) {
        return this.execute(`model.${model}.${method}`, args);
    }

    /**
     * Verifies server connectivity and version.
     */
    async checkHealth() {
        const endpoint = `${this.baseUrl}/rpc/`;
        const res = await this.client.post(endpoint, {
            id: 1,
            method: 'common.server.version',
            params: []
        });
        return res.data && typeof res.data === 'object' && 'result' in res.data ? res.data.result : res.data;
    }

    /**
     * Ensures party exists in Tryton with delivery address. Returns party ID.
     */
    async mirrorParty(partyData) {
        if (!partyData) return null;
        const name = (partyData.name || partyData.company || partyData.contactPerson || 'Anonymous Client').trim();

        // Check if exists
        const existingIds = await this.modelCall('party.party', 'search', [['name', '=', name]], 0, 1, null);
        if (existingIds && existingIds.length > 0) {
            const partyId = existingIds[0];
            // Ensure delivery address exists
            const addrs = await this.modelCall('party.address', 'search', [['party', '=', partyId]], 0, 1, null);
            if (!addrs || addrs.length === 0) {
                await this.modelCall('party.address', 'create', [{
                    party: partyId,
                    city: 'Kuwait City',
                    delivery: true
                }]);
            }
            return partyId;
        }

        // Create party
        const newIds = await this.modelCall('party.party', 'create', [{
            name,
            code: partyData.id ? `PRISMA-${partyData.id}` : undefined
        }]);
        const partyId = newIds[0];

        // Create default address
        await this.modelCall('party.address', 'create', [{
            party: partyId,
            city: 'Kuwait City',
            delivery: true
        }]);

        return partyId;
    }

    /**
     * Mirrors a created Prisma shipment to Tryton stock.shipment.out.
     */
    async mirrorShipment(prismaShipment) {
        if (!this.enabled || !prismaShipment) return null;

        const customerId = await this.mirrorParty(prismaShipment.user || prismaShipment.sender);
        
        // Ensure customer has delivery address
        const addresses = await this.modelCall('party.address', 'search', [['party', '=', customerId]], 0, 1, null);
        let addressId = addresses?.[0];
        if (!addressId) {
            const newAddrs = await this.modelCall('party.address', 'create', [{
                party: customerId,
                city: 'Kuwait City',
                delivery: true
            }]);
            addressId = newAddrs[0];
        }

        // Retrieve warehouse and output/storage locations
        const warehouses = await this.modelCall('stock.location', 'search_read', [['type', '=', 'warehouse']], 0, 1, null, ['id', 'output_location', 'storage_location']);
        const wh = (warehouses && warehouses.length > 0) ? warehouses[0] : { id: 5, output_location: 2, storage_location: 3 };

        const weight = Number(prismaShipment.totalWeight || prismaShipment.weight || 1.0);
        const dims = prismaShipment.parcels?.[0]?.dimensions || prismaShipment.dimensions || {};
        const length = Number(dims.length || 20.0);
        const width = Number(dims.width || 20.0);
        const height = Number(dims.height || 10.0);

        // Create shipment in Tryton
        const shipmentValues = {
            company: 1,
            customer: customerId,
            delivery_address: addressId,
            warehouse: wh.id,
            warehouse_output: wh.output_location || 2,
            warehouse_storage: wh.storage_location || 3,
            client_weight: weight,
            carrier_code: prismaShipment.carrierCode || 'DGR',
            carrier_waybill: prismaShipment.trackingNumber
        };

        const newShipmentIds = await this.modelCall('stock.shipment.out', 'create', [shipmentValues]);
        const trytonShipmentId = newShipmentIds[0];

        // Transition draft -> client_submitted
        try {
            await this.modelCall('stock.shipment.out', 'submit', [trytonShipmentId]);
        } catch (e) {
            logger.warn(`[TrytonClient] Transition submit skipped/failed for ${trytonShipmentId}: ${e.message}`);
        }

        // Attach Package
        const pkgTypes = await this.modelCall('stock.package.type', 'search', [], 0, 1, null);
        const pkgTypeId = pkgTypes && pkgTypes.length > 0 ? pkgTypes[0] : 1;

        await this.modelCall('stock.package', 'create', [{
            company: 1,
            shipment: `stock.shipment.out,${trytonShipmentId}`,
            type: pkgTypeId,
            gross_weight: weight,
            length,
            width,
            height
        }]);

        logger.info(`[TrytonClient] Mirrored shipment ${prismaShipment.trackingNumber} -> Tryton ID ${trytonShipmentId}`);
        return { trytonShipmentId };
    }

    /**
     * Mirrors warehouse scale review scan to Tryton.
     */
    async mirrorWarehouseScan(trackingNumber, scanData) {
        if (!this.enabled || !trackingNumber) return null;

        // Search shipment by carrier_waybill
        const found = await this.modelCall('stock.shipment.out', 'search', [['carrier_waybill', '=', trackingNumber]], 0, 1, null);
        if (!found || found.length === 0) {
            logger.warn(`[TrytonClient] Shipment ${trackingNumber} not found in Tryton for scan mirror`);
            return null;
        }

        const shipmentId = found[0];
        const weight = Number(scanData.weight || 1.0);
        const dims = scanData.dimensions || {};
        const length = Number(dims.length || 20.0);
        const width = Number(dims.width || 20.0);
        const height = Number(dims.height || 10.0);
        const shelfLocation = scanData.shelfLocation || 'SHW-BAY-A1';
        const notes = scanData.notes || scanData.reason || 'Warehouse Intake Scan';

        // Check current shipment state and transition to received_at_hub
        const shipmentRecords = await this.modelCall('stock.shipment.out', 'read', [shipmentId], ['state']);
        const currentState = shipmentRecords?.[0]?.state;
        if (currentState === 'draft') {
            await this.modelCall('stock.shipment.out', 'submit', [shipmentId]);
            await this.modelCall('stock.shipment.out', 'receive_at_hub', [shipmentId]);
        } else if (currentState === 'client_submitted' || currentState === 'driver_picked_up') {
            await this.modelCall('stock.shipment.out', 'receive_at_hub', [shipmentId]);
        }

        // Call process_scale_intake RPC method
        await this.modelCall(
            'stock.shipment.out',
            'process_scale_intake',
            [shipmentId],
            weight,
            length,
            width,
            height,
            shelfLocation,
            notes
        );

        logger.info(`[TrytonClient] Mirrored warehouse scan for ${trackingNumber} on Tryton ID ${shipmentId}`);
        return { success: true, trytonShipmentId: shipmentId };
    }
}

module.exports = new TrytonClient();
