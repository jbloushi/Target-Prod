const { normalizeStatus, isNegativeOrExceptionPhrase } = require('../src/constants/statusConstants');
const scraper = require('../src/services/FreeWebScraperService');
const AramexAdapter = require('../src/adapters/AramexAdapter');

const update = 'Updated delivery address required from customer';
const description = `In Transit / International TransitIn transit - ${update}`;

describe('Aramex address exception', () => {
    test('recognizes the reported update as an exception', () => {
        expect(normalizeStatus(description)).toBe('exception');
        expect(isNegativeOrExceptionPhrase(description)).toBe(true);
        expect(scraper._mapStatus(description)).toBe('exception');
    });

    test('preserves the exception on the current transit progress point', () => {
        const result = scraper._parseAramexHtmlEvents(`
            <div class="shipment-update-descp">${update}</div>
            <div class="shipment-update-datetime">2026-10-19T10:16:00Z</div>
            <div class="shipment-progess-point done"><span>Created</span></div>
            <div class="shipment-progess-point current"><span>In transit</span></div>
            <div class="shipment-progess-point"><span>Delivered</span></div>
        `, '38290078046');
        expect(result.status).toBe('exception');
        expect(result.events.at(-1)).toMatchObject({ statusCode: 'exception', description: `In transit - ${update}` });
        expect(result.events.some(event => event.statusCode === 'delivered')).toBe(false);
    });

    test('official adapter recognizes the exception before transit text', () => {
        expect(new AramexAdapter()._mapAramexStatusCode('SH012', description)).toBe('exception');
    });

    test('a completed delivered progress point still overrides a stale banner', () => {
        const result = scraper._parseAramexHtmlEvents(`
            <div class="shipment-update-descp">${update}</div>
            <div class="shipment-progess-point current"><span>Delivered</span></div>
        `, 'test');
        expect(result.status).toBe('delivered');
    });
});
