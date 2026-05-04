# Feature Development Standard

> Engineering playbook for adding new features to Target Logistics safely and consistently.  
> This codebase is Express.js (backend) + React 18 (frontend) + MySQL via Prisma.  
> Follow these rules for every feature — no exceptions for "small" changes.

---

## Guiding Principles

1. **No code without a test for the happy path** — if it's worth shipping, it's worth one test
2. **No new database column without a migration** — never use `prisma db push` in staging or production
3. **No new route without auth middleware** — unprotected routes are the #1 security risk
4. **No new carrier/external call without a CarrierLog entry** — external failures must be debuggable
5. **No financial write outside `prisma.$transaction()`** — partial writes corrupt the ledger
6. **No `console.log()` in any committed code** — use the Winston logger

---

## Project Structure

```
backend/src/
  routes/          ← HTTP route definitions only — no logic here
  controllers/     ← Request handling: parse req, call service, send res
  services/        ← Business logic — the only layer that touches the DB
  adapters/        ← External API integrations (carriers)
  middleware/      ← Auth, RBAC, rate limiting, error handling
  constants/       ← Enums, status lists, shared constants
  utils/           ← Pure utility functions (no DB, no business logic)
  config/          ← Environment variables, DB connection

frontend/src/
  pages/           ← Route-level components (one per URL)
  components/      ← Reusable UI components
  services/api.jsx ← All HTTP calls to backend — never call fetch/axios directly in components
  context/         ← React Context (auth, theme, shipment state)
  utils/           ← Pure helpers
  constants/       ← Status configs, label maps
```

---

## Adding a New Backend Feature

### Step 1: Plan the data model first

Before writing any code:
- What DB tables are affected?
- Do you need a new column? A new table? A new JSON blob field?
- Are there index implications? (queries that filter/sort on the new field need indexes)
- If adding a new column with a NOT NULL constraint: what is the default for existing rows?

Write the Prisma schema change before the controller. Everything depends on the shape of the data.

### Step 2: Write the Prisma migration

```bash
# In backend/:
npx prisma migrate dev --name "add_invoice_model"
# Reviews diff, creates migration file under prisma/migrations/
# NEVER use: prisma db push (bypasses migration history)
```

Migration file checklist:
- [ ] Migration is committed to git alongside the code change
- [ ] Migration is idempotent (safe to run twice)
- [ ] If altering a large table: test migration time on a copy of production data
- [ ] If adding NOT NULL column: provide a default or backfill existing rows in the migration

### Step 3: Write the service

**File:** `backend/src/services/{featureName}.service.js`

Rules:
- Services are the only layer that queries the DB
- Services do not import from `controllers/` — only controllers import services
- All DB writes that span multiple tables go inside `prisma.$transaction()`
- Financial writes must use `financeLedgerService.createLedgerEntry()` — never write to `OrganizationLedger` directly
- Use `async/await` + `try/catch` — no `.then()/.catch()` chains
- Do not throw raw `Error` — use `AppError` or set `err.statusCode` so the error middleware handles it correctly

```javascript
// Good:
const { AppError } = require('../utils/AppError');
if (!shipment) throw new AppError('Shipment not found', 404);

// Also acceptable:
const err = new Error('Shipment not found');
err.statusCode = 404;
throw err;
```

### Step 4: Write the controller

**File:** `backend/src/controllers/{featureName}.controller.js`

Rules:
- Controllers only: parse `req`, call the service, send `res`
- No DB queries in controllers — everything goes through a service
- No business logic in controllers — move it to the service
- All controllers wrap everything in `try/catch` and call `handleControllerError(res, error, 'context')`
- Never return stack traces to the client in production (the error middleware handles this, but don't bypass it)

```javascript
exports.createInvoice = async (req, res) => {
    try {
        const result = await invoiceService.create(req.body, req.user);
        res.status(201).json({ success: true, data: result });
    } catch (error) {
        return handleControllerError(res, error, 'Create invoice');
    }
};
```

### Step 5: Write the route

**File:** `backend/src/routes/{featureName}.routes.js`

**Every route must have:**
1. `authController.protect` — validates JWT, loads `req.user`
2. `authorize('CAPABILITY_NAME')` — checks RBAC capability (or a role check if simpler)
3. Input validation via `express-validator` for any user-supplied data

For shipment or finance data, capability checks are not enough. Apply the shared access helpers from `backend/src/middleware/authorize.middleware.js`:

- `scopeShipmentWhere(req, where)` for shipment list/stat queries.
- `canAccessShipment(req, shipment)` before returning or mutating a shipment by ID/tracking number.
- `canAccessOrganization(req, organizationId)` before returning or mutating organization finance data.

Current client shipment visibility:

- `org_manager` can view all shipments for their company.
- `org_agent` and `client` can view only shipments they created or shipments created on their behalf through `createdOnBehalfOfUserId`.
- `staff` and `driver` can view only directly assigned shipments or shipments allowed by active `UserAccessScope` rows.
- `UserAccessScope.scopeType = CLIENT_USER` grants access to one selected client user's shipments and shipments created on behalf of that client user.
- `UserAccessScope.scopeType = COMPANY_ALL_USERS` grants access to all users' shipments for one selected company.
- Scope assignment is managed through `GET /api/users/:id/access-scopes` and `PUT /api/users/:id/access-scopes`, both protected by `MANAGE_USERS`.
- Shipment Wizard client-account dropdowns must use `GET /api/users/assignable-clients`, not the broad user list, so staff/drivers only see client users allowed by active creation scopes.
- `canCreateOnBehalf` controls whether staff/drivers can create shipments for the selected client user or company; `ShipmentDraftService` must enforce it before accepting `userId` from the request body.
- Platform-wide roles (`admin`, `accounting`, `manager`) can view across companies when the route capability allows it.
- Product labels should use `Company Manager` for `org_manager` and `Company Client` for `org_agent`.

```javascript
const express = require('express');
const router = express.Router();
const { protect } = require('../controllers/auth.controller');
const { authorize } = require('../middleware/authorize.middleware');
const { body, param } = require('express-validator');
const invoiceController = require('../controllers/invoice.controller');

router.use(protect);  // all routes in this file require auth

router.get(
    '/organizations/:orgId/invoices',
    authorize('VIEW_FINANCE'),
    invoiceController.listInvoices
);

router.post(
    '/organizations/:orgId/invoices',
    authorize('MANAGE_PAYMENTS'),
    [
        body('periodStart').isISO8601().withMessage('periodStart must be a date'),
        body('periodEnd').isISO8601().withMessage('periodEnd must be a date'),
        body('shipmentIds').isArray({ min: 1 }).withMessage('shipmentIds must be a non-empty array'),
    ],
    invoiceController.createInvoice
);

module.exports = router;
```

**Mount in `server.js`:**
```javascript
app.use('/api/finance', require('./routes/invoice.routes'));
```

### Step 6: Add input validation

Use `express-validator` for all user-supplied data. The validation runs before the controller.

```javascript
// In the route:
const { validationResult } = require('express-validator');

// In the controller (add at the top):
const errors = validationResult(req);
if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
}
```

Validate at minimum:
- Required fields are present
- Types are correct (ISO dates, numbers, UUIDs)
- Enums contain only valid values
- Lengths are bounded (text fields have max length)

### Step 7: Write tests

**File:** `backend/__tests__/{featureName}.test.js`

Minimum required tests for every feature:

```
□ Happy path: creates/returns the expected resource
□ Auth: returns 401 when no token provided
□ RBAC: returns 403 when wrong role/capability
□ Validation: returns 400 when required field missing
□ Not found: returns 404 for non-existent resource
□ Tenant isolation: user cannot access another org's resource
```

For financial features, also test:
```
□ Ledger entry is created with correct type and amount
□ Organization balance is updated correctly
□ Transaction rollback: if one write fails, all writes are rolled back
```

Run tests: `npm test --prefix backend`  
Run with coverage: `npm test --prefix backend -- --coverage`

---

## Adding a New Frontend Feature

### Step 1: Add the API call to `services/api.jsx`

Never call `axios` or `fetch` directly from a component. All HTTP calls go through the centralized API service:

```javascript
// In frontend/src/services/api.jsx:
export const listInvoices = (orgId, params) =>
    api.get(`/finance/organizations/${orgId}/invoices`, { params });

export const createInvoice = (orgId, data) =>
    api.post(`/finance/organizations/${orgId}/invoices`, data);
```

### Step 2: Create the page component

**File:** `frontend/src/pages/{FeatureName}Page.jsx`

Rules:
- One page component per URL route
- Page components fetch data; they do not contain complex business logic
- Use SWR for data that needs to stay fresh; use `useState`/`useEffect` for one-time loads
- Check capabilities before rendering actions:

```javascript
import { useAuth } from '../context/AuthContext';
import { hasCapability } from '../utils/capabilities';

const { user } = useAuth();
const canManage = hasCapability(user, 'MANAGE_PAYMENTS');

// Then in JSX:
{canManage && <Button onClick={handleCreate}>Create Invoice</Button>}
```

### Step 3: Add the route

**File:** `frontend/src/routes/index.jsx`

```javascript
import InvoicesPage from '../pages/InvoicesPage';

// Inside the router config:
<Route
    path="/finance/invoices"
    element={
        <ProtectedRoute requiredCapability="VIEW_FINANCE">
            <InvoicesPage />
        </ProtectedRoute>
    }
/>
```

### Step 4: Write a component test

**File:** `frontend/src/__tests__/{FeatureName}.test.jsx`

Minimum:
```
□ Renders without crashing
□ Shows loading state while data is fetching
□ Shows data when API returns success
□ Shows error state when API returns error
□ Action buttons are hidden when user lacks the required capability
```

---

## RBAC: Adding a New Capability

When a new feature needs its own permission:

1. Add the capability string to `backend/src/middleware/rbac.policy.js` under the relevant roles
2. Add it to `frontend/src/utils/capabilities.jsx` for the frontend capability checks
3. Use `authorize('NEW_CAPABILITY')` in the route
4. Test that unauthorized roles receive 403

Capability naming convention: `VERB_NOUN` — e.g. `VIEW_INVOICES`, `MANAGE_INVOICES`, `REVERSE_INVOICES`

---

## Adding New Environment Variables

1. Add to `backend/src/config/config.js` under the relevant section
2. Add to `backend/.env.example` with an empty value and a comment explaining it
3. If required for production: add to the `requiredEnvVars` array in `config.js` so the server refuses to start without it
4. If required only for a specific carrier/service: validate it in that adapter's `validate()` method, not globally

---

## Error Handling Rules

| Scenario | What to do |
|---|---|
| Input validation failure | Return 400 with `{ success: false, errors: [...] }` |
| Resource not found | Return 404 with `{ success: false, error: 'X not found' }` |
| Auth failure | Let `protect` middleware handle (401) |
| Permission failure | Let `authorize` middleware handle (403) |
| External API error | Catch, log with `logger.error()`, throw with `isProviderError: true` |
| Unexpected server error | Let `handleControllerError` handle (500, no stack trace in prod) |
| Financial write failure | Must roll back entire transaction — do not partially commit |

**Never:**
- Return stack traces to the client in production
- Swallow errors silently (empty `catch` blocks)
- Use `console.error()` — use `logger.error()` with structured context

---

## Logging Rules

```javascript
// Correct:
logger.info('Shipment booked', { trackingNumber, userId, carrierCode });
logger.error('Carrier API failed', { error: err.message, carrierCode, trackingNumber });
logger.debug('Quote request payload', { ...sanitizedPayload });  // only appears at LOG_LEVEL=debug

// Wrong:
console.log('debug info');
console.error(err);
logger.info('[DEBUG] checking value:', value);  // don't tag with [DEBUG] — use logger.debug()
```

Structured logging: always pass context as a second object argument, not string interpolation:
```javascript
logger.error(`Failed for ${trackingNumber}`);           // ← bad: not queryable
logger.error('Booking failed', { trackingNumber, error: err.message }); // ← good
```

---

## Code Review Checklist

Before opening a PR, verify:

```
□ No console.log() or console.error() anywhere in the diff
□ Every new route has authController.protect + authorize()
□ Every user-supplied input has express-validator rules
□ All financial writes are in prisma.$transaction()
□ New DB columns have a migration file committed
□ Tests cover happy path + 401 + 403 + 404 at minimum
□ No hardcoded credentials or secrets
□ No stack traces returned to client
□ CarrierLog written for any new external API call
□ New env vars added to .env.example
□ Linter passes: npm run lint --prefix frontend
□ Tests pass: npm test --prefix backend && npm test --prefix frontend
```
