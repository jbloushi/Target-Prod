# New Carrier API Integration Checklist

> Engineering playbook for adding a new carrier to Target Logistics.  
> Reference implementation: `DgrAdapter.js` (DHLX) and `LogesTechsAdapter.js` (OTE).  
> Read [docs/modules/carriers.md](../modules/carriers.md) before starting.

---

## When to Use This Playbook

- Adding a new carrier integration (e.g. Aramex real implementation, SMSA, Fetchr, J&T)
- Renaming an existing carrier code (e.g. DGR → DHLX — see Step 0)
- Replacing a mock/placeholder adapter with a real one

---

## Step 0: Adding DHLX — DHL Express Account 2

`DGR` remains the code for the existing DHL Account 1 and does not change. `DHLX` is a completely new second DHL account with its own credentials and its own adapter class. Because `DgrAdapter` already accepts constructor config overrides, `DhlxAdapter` is a thin subclass — no new API logic needed.

1. **Create `backend/src/adapters/DhlxAdapter.js`:**
   ```javascript
   const DgrAdapter = require('./DgrAdapter');
   class DhlxAdapter extends DgrAdapter {
       constructor(config = {}) {
           super({
               apiKey:        config.apiKey        || process.env.DHLX_API_KEY,
               apiSecret:     config.apiSecret      || process.env.DHLX_API_SECRET,
               accountNumber: config.accountNumber  || process.env.DHLX_ACCOUNT_NUMBER,
               baseUrl:       config.baseUrl        || process.env.DHLX_API_URL,
               ...config
           });
       }
   }
   module.exports = DhlxAdapter;
   ```

2. **Register in `CarrierFactory.js`:**
   ```javascript
   const DhlxAdapter = require('../adapters/DhlxAdapter');
   // In getAdapter():
   case 'DHLX': return new DhlxAdapter(config);
   // In getAvailableCarriers():
   { code: 'DHLX', name: 'DHL Express (Account 2)', active: false }
   //                                                        ^^^^^ start inactive
   ```

3. **Add env vars to `backend/.env.example`:**
   ```
   # DHL Express Account 2 (DHLX)
   DHLX_API_KEY=
   DHLX_API_SECRET=
   DHLX_ACCOUNT_NUMBER=
   DHLX_API_URL=https://express.api.dhl.com/mydhlapi/
   ```

4. **Test with sandbox credentials:**
   - Set `DHLX_API_URL` to the test endpoint first
   - Post a quote via `POST /api/shipments/quote` with `carrierCode: 'DHLX'`
   - Confirm rates come back on Account 2 credentials
   - Confirm CarrierLog row shows `carrierCode: 'DHLX'`

5. **Set `active: true`** in `getAvailableCarriers()` only after credential testing passes

6. **Run full test suite:** `npm test --prefix backend`

**DGR is unchanged.** Existing shipments, users, and org configs that reference `DGR` are unaffected.

---

## Step 1: Understand the Carrier's API

Before writing a line of code, answer these questions. If any answer is unknown, get it from the carrier's tech team first.

**Authentication**
- [ ] What auth method? (Basic, Bearer token, API key header, OAuth2)
- [ ] Are credentials per-request or session-based (token refresh needed)?
- [ ] Is there a sandbox/test environment with separate credentials?

**Rate Quoting**
- [ ] Does the carrier expose a rate quote API? (OTE does not — LogesTechsAdapter returns `[]`)
- [ ] What is the request shape? (parcel dimensions, weight, origin, destination, service type)
- [ ] What does the response look like? (list of services with prices, currencies, delivery ETAs)
- [ ] Are there special service codes (express, economy, same-day)?

**Shipment Creation**
- [ ] What is the request shape? (address format, item/parcel format, required vs optional fields)
- [ ] What does success return? (tracking number, internal ID, label URL or base64 PDF?)
- [ ] What does duplicate submission return? (error code, HTTP status) — important for recovery logic
- [ ] What does an address validation failure look like?

**Tracking**
- [ ] What endpoint retrieves tracking events?
- [ ] What is the event/checkpoint format? (status codes, descriptions, timestamps, locations)
- [ ] Does the carrier replay events from multiple sources (like DHL does)? If so, deduplication is needed.

**Cancellation**
- [ ] Is there a cancel endpoint?
- [ ] What are the cancellation windows / rules?
- [ ] What does success/failure look like?

**Documents**
- [ ] Does the carrier return labels inline (base64) or as a URL to fetch separately?
- [ ] What formats? (PDF, ZPL, PNG)
- [ ] Are AWB and invoice separate documents or combined?

**Error Format**
- [ ] What does an error response look like? (status code + body shape)
- [ ] Are there retryable errors? (date unavailable → retry with +1 day like DHL does)

---

## Step 2: Create the Adapter File

**Location:** `backend/src/adapters/{CarrierName}Adapter.js`  
**Naming convention:** Use the official brand name — `AramexAdapter.js`, `SmtpAdapter.js`, etc.

```javascript
const CarrierAdapter = require('./CarrierAdapter');
const axios = require('axios');
const logger = require('../utils/logger');

class AramexAdapter extends CarrierAdapter {
    constructor(config = {}) {
        super();
        this.config = {
            // Pull from env vars with clear names
            accountNumber:  config.accountNumber  || process.env.ARAMEX_ACCOUNT_NUMBER,
            username:       config.username       || process.env.ARAMEX_USERNAME,
            password:       config.password       || process.env.ARAMEX_PASSWORD,
            entityCode:     config.entityCode     || process.env.ARAMEX_ENTITY_CODE,
            countryCode:    config.countryCode    || process.env.ARAMEX_COUNTRY_CODE,
            baseUrl:        config.baseUrl        || process.env.ARAMEX_API_URL || 'https://ws.aramex.net/ShippingAPI.V2/',
        };
    }

    async validate(shipment) {
        const errors = [];
        if (!this.config.accountNumber) errors.push('ARAMEX_ACCOUNT_NUMBER is required');
        if (!this.config.username)      errors.push('ARAMEX_USERNAME is required');
        if (!this.config.password)      errors.push('ARAMEX_PASSWORD is required');
        if (!shipment.sender?.city)     errors.push('Sender city is required');
        if (!shipment.receiver?.city)   errors.push('Receiver city is required');
        // Add carrier-specific validations here
        return errors;
    }

    async getRates(shipment) {
        // If carrier has no rate API, return [] — do not throw
        return [];
    }

    async createShipment(shipment, serviceCode) {
        const errors = await this.validate(shipment);
        if (errors.length) {
            const err = new Error(errors.join('; '));
            err.statusCode = 400;
            throw err;
        }
        // ... build payload, call API, normalize response
        // Always return:
        return {
            trackingNumber:    string,   // carrier's tracking number
            carrierShipmentId: string,   // carrier's internal ID
            labelUrl:          string,   // data:application/pdf;base64,... or HTTPS URL
            awbUrl:            string | null,
            invoiceUrl:        string | null,
            rawResponse:       object    // full provider response for debugging
        };
    }

    async getTracking(trackingNumber) {
        // ... call carrier tracking API
        // Always return:
        return {
            trackingNumber,
            carrierCode: 'ARAMEX',
            status:      string,   // normalized platform status
            description: string,
            events: [{
                statusCode:  string,
                description: string,
                timestamp:   ISO8601_string,
                location:    string
            }]
        };
    }

    async cancelShipment(trackingNumber) {
        // ... call cancel API
        return true; // or false on failure
    }
}

module.exports = AramexAdapter;
```

**Rules:**
- Never use `console.log()` or `console.error()` — use `logger.info()`, `logger.error()`, `logger.debug()` only
- Never expose credentials in logs — redact before logging request payloads
- All methods must be `async` — no callbacks, no `.then()` chains
- `validate()` returns an array of error strings — empty array = valid
- `getRates()` returns `[]` if the carrier has no rate API — never throws for this case
- Thrown errors must set `err.statusCode` and `err.isProviderError = true` for the booking service to handle them correctly

---

## Step 3: Add Carrier Log Writes

Every API call to the carrier must be logged to the `CarrierLog` table. This is the primary debugging tool for carrier failures.

```javascript
// After receiving a response (success or failure):
await prisma.carrierLog.create({
    data: {
        carrierCode:     'ARAMEX',
        requestType:     'quote' | 'book' | 'track' | 'cancel',
        requestPayload:  sanitizedPayload,   // remove passwords/secrets before storing
        responsePayload: response?.data || null,
        statusCode:      response?.status || null,
        durationMs:      Date.now() - startTime,
        trackingNumber:  shipment.trackingNumber || null,
        organizationId:  shipment.organizationId || null
    }
}).catch(e => logger.error('CarrierLog save failed', { error: e.message }));
// Note: .catch used here intentionally — log failure must not fail the booking
```

**What to redact before logging:**
- Passwords
- API keys/secrets
- Full credit card numbers
- National ID numbers

---

## Step 4: Register in CarrierFactory

**File:** `backend/src/services/CarrierFactory.js`

```javascript
const AramexAdapter = require('../adapters/AramexAdapter');

// In getAdapter():
case 'ARAMEX':
    return new AramexAdapter(config);

// In getAvailableCarriers():
{ code: 'ARAMEX', name: 'Aramex', active: true }
//                                       ^^^^^ set false until fully tested
```

**Do not set `active: true` until the integration passes the testing checklist below.**

---

## Step 5: Add Environment Variables

**File:** `backend/.env.example`

```bash
# Aramex
ARAMEX_ACCOUNT_NUMBER=
ARAMEX_USERNAME=
ARAMEX_PASSWORD=
ARAMEX_ENTITY_CODE=
ARAMEX_COUNTRY_CODE=
ARAMEX_API_URL=https://ws.aramex.net/ShippingAPI.V2/
```

Add the same block to `backend/src/config/config.js` under the carrier configs section. For production-required vars, add them to the `requiredEnvVars` validation array so the server refuses to start without them.

---

## Step 6: Write Tests

**Location:** `backend/__tests__/adapters/aramex.adapter.test.js`

Required test cases (minimum):

```
□ validate() returns errors when required config is missing
□ validate() returns errors when shipment data is incomplete
□ getRates() returns [] when carrier has no rate API
□ getRates() returns normalized rates[] on successful API response
□ createShipment() returns correct shape on success
□ createShipment() throws with statusCode=400 on validation failure
□ createShipment() throws with isProviderError=true on carrier API error
□ createShipment() handles duplicate shipment error code correctly
□ getTracking() returns normalized events on success
□ getTracking() returns empty events[] on no-history response (not throw)
□ cancelShipment() returns true on success
□ cancelShipment() returns false or throws on failure
□ All methods use logger, not console.*
□ Carrier log is written on every API call
```

Use `jest.mock('axios')` to mock HTTP responses — do not call live carrier APIs in unit tests. Use fixtures for carrier response shapes.

---

## Step 7: Integration Test Against Sandbox

Before setting `active: true` in CarrierFactory, verify against the carrier's sandbox environment:

```
□ Create a test shipment via POST /api/shipments + POST /api/shipments/:id/book
□ Verify label PDF is returned and readable
□ Verify tracking number is populated on shipment record
□ Verify CarrierLog row is written
□ Verify finance ledger DEBIT is posted
□ Verify getTracking() returns events after sandbox creates a fake scan
□ Attempt duplicate booking — verify recovery or clean error
□ Attempt booking with invalid address — verify 400 error, not 500
□ Cancel a test shipment — verify carrier confirms
□ Check logs — confirm no console.log output, no credentials in CarrierLog
```

---

## Step 8: Configure for an Organization

After tests pass, assign the carrier to an org or user via the admin panel:

1. Set `Organization.allowedCarriers` JSON to include the new carrier code
2. Optionally set `User.agentPolicy.allowedCarriers` for specific users
3. Optionally configure markup via `Organization.markup` for the new carrier
4. Set `active: true` in `CarrierFactory.getAvailableCarriers()`

---

## Step 9: Monitor First Production Shipments

```
□ Watch CarrierLog table for the first 10 shipments — check statusCode is 200/201
□ Confirm tracking numbers are valid (try tracking on carrier's public site)
□ Confirm labels print correctly
□ Confirm finance ledger entries are correct (DEBIT amount matches expected price)
□ Watch server logs for any logger.error() output from the adapter
□ Check for any [DEBUG] log noise in production log stream
```

---

## Adapter Naming Convention

| Carrier | File | Factory Key |
|---|---|---|
| DHL Express | `DhlAdapter.js` | `DHLX` (alias: `DHL`, `DGR` during migration) |
| OTE/LogesTechs | `LogesTechsAdapter.js` | `OTE` (alias: `LOGESTECHS`) |
| Aramex | `AramexAdapter.js` | `ARAMEX` |
| FedEx | `FedexAdapter.js` | `FEDEX` |
| UPS | `UpsAdapter.js` | `UPS` |
| SMSA | `SmsaAdapter.js` | `SMSA` |
| Fetchr | `FetchrAdapter.js` | `FETCHR` |

Rule: file name = `{BrandName}Adapter.js`. Factory key = uppercase brand name or well-known industry abbreviation.

---

## Anti-Patterns to Avoid

| Anti-pattern | Why | What to do instead |
|---|---|---|
| `console.log()` in adapter | Bypasses logger, pollutes prod logs, may leak creds | Use `logger.debug()` / `logger.error()` |
| Returning fake data on failure | Silently wrong — harder to debug than a thrown error | Throw with `statusCode` set |
| Not writing to CarrierLog | Carrier failures become undebuggable | Always write log, even on errors |
| Setting `active: true` before tests pass | Real users hit broken integration | Gate behind `active: false` until tested |
| Calling adapter directly from controller | Bypasses carrier access checks and pricing layer | Always go through `ShipmentBookingService` |
| Throwing on empty rate list | OTE has no rate API — empty is valid | Return `[]` from `getRates()` |
| Hardcoding credentials | Security risk | Env vars only, validated at startup |
