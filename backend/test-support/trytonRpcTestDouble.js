function mockTrytonRpc(trytonClient) {
    const rpcCalls = [];
    const shipments = new Map();
    let nextShipmentId = 61;
    trytonClient.cachedSession = null;

    const post = jest.spyOn(trytonClient.client, 'post').mockImplementation(async (_url, payload) => {
        rpcCalls.push(payload);
        const method = payload.method;
        let result = true;

        if (method === 'common.server.version') result = '8.2';
        else if (method === 'common.db.login') result = [1, 'a'.repeat(64)];
        else if (method === 'model.party.party.search' || method === 'model.party.party.search_read') result = [41];
        else if (method === 'model.party.address.search') result = [51];
        else if (method === 'model.stock.location.search_read') result = [{ id: 5, output_location: 2, storage_location: 3 }];
        else if (method === 'model.stock.shipment.out.create') {
            const id = nextShipmentId++;
            shipments.set(id, payload.params?.[0]?.[0] || {});
            result = [id];
        }
        else if (method === 'model.stock.shipment.out.search') result = [shipments.keys().next().value || 61];
        else if (method === 'model.stock.shipment.out.search_read') result = [{ id: 61, state: 'client_submitted' }];
        else if (method === 'model.stock.shipment.out.read') {
            const id = payload.params?.[0]?.[0];
            const record = shipments.get(id) || {};
            result = [{ ...record, state: 'client_submitted', client_weight: record.client_weight || 3.5, draft_selling_price: record.draft_selling_price || { decimal: '14.250' } }];
        }
        else if (method === 'model.stock.package.type.search') result = [71];
        else if (method === 'model.account.period.search' || method === 'model.account.journal.search' || method === 'model.account.account.search') result = [81];
        else if (method === 'model.account.move.create') result = [91];
        else if (method === 'model.account.move.line.search_read') result = [
            { debit: { decimal: '14.250' }, credit: { decimal: '0.000' } },
            { debit: { decimal: '0.000' }, credit: { decimal: '14.250' } }
        ];
        else if (method === 'model.target.rate_card.search') result = [101];
        else if (method === 'model.target.rate_card.calculate_rate') {
            const params = payload.params || [];
            const weight = Number(params.find(value => typeof value === 'number') || 2);
            result = { rate: 10 + Math.max(0, weight - 0.5) * 2 };
        }

        return { data: { result } };
    });

    return { post, rpcCalls };
}

module.exports = { mockTrytonRpc };
