# Accounting & Finance Module

> **Real implementation documentation.** Based on source code as of 2026-05-03.

---

## Overview

The finance system uses a double-entry-style immutable ledger. Every financial event (shipment charge, payment, reversal) creates an `OrganizationLedger` entry. Balances are stored redundantly on the `Organization` record for fast reads and recomputed from ledger sums for accuracy checks. Payment allocation tracks which payments have been applied to which shipments.

**Key files:**
```
backend/src/
  services/financeInvoice.service.js  - Invoice snapshot logic
  services/financeLedger.service.js   — All finance logic
  controllers/finance.controller.js   — HTTP handlers
  routes/finance.routes.js            — Route definitions
```

**Decimal precision:** All financial math uses `decimal.js` (precision: 20, rounding: HALF_UP). API responses are serialized to 3 decimal places. DB columns are `Decimal(18, 4)`.

---

## Entities

### Organization

Holds the running balance and credit configuration:

| Field | Type | Notes |
|---|---|---|
| `balance` | Decimal(18,4) | Running ledger balance (DEBIT minus CREDIT). Positive = owes money |
| `creditLimit` | Decimal(18,4) | Maximum allowed outstanding balance before shipments are held |
| `unappliedBalance` | Decimal(18,4) | Cash received but not yet allocated to specific shipments |
| `currency` | String | Default: `'KWD'` |
| `markup` | JSON | Org-level markup policy |

### OrganizationLedger

The immutable audit trail. Every financial event is a row here — rows are never updated or deleted.

| Field | Notes |
|---|---|
| `organizationId` | Nullable — null = solo shipper (no org) |
| `amount` | Always positive |
| `entryType` | `DEBIT` or `CREDIT` |
| `category` | `SHIPMENT_CHARGE`, `PAYMENT`, `ALLOCATION`, `REVERSAL`, `ADJUSTMENT` |
| `description` | Human-readable description |
| `reference` | External reference (e.g. tracking number, payment ref) |
| `sourceRepo` | `'Shipment'`, `'Payment'`, `'Reversal'` — what created this entry |
| `sourceId` | ID of the source record |
| `parentEntryId` | Set on reversal entries — links back to the entry being reversed |
| `balanceAfter` | Org balance snapshot after this entry was posted |
| `createdBy` | User ID who triggered the entry |
| `metadata` | JSON — carrier code, currency, attempt ID, etc. |

### Payment

A cash receipt from a customer. Sits in a pool until allocated to shipments.

| Field | Notes |
|---|---|
| `organizationId` | Nullable |
| `amount` | Payment amount |
| `status` | `UNAPPLIED` → `PARTIALLY_APPLIED` → `APPLIED` |
| `method` | `'manual'` (only method currently supported) |
| `reference` | Customer's payment reference / cheque number / transfer ID |
| `notes` | Free-text notes |
| `postedAt` | When the payment was recorded |

### PaymentAllocation

Links a payment to a specific shipment. One payment can be spread across many shipments.

| Field | Notes |
|---|---|
| `paymentId` | FK → Payment |
| `shipmentId` | FK → Shipment |
| `amount` | Amount allocated from this payment to this shipment |
| `status` | `ACTIVE` or `REVERSED` |
| `isFifo` | Whether this allocation was created by the FIFO auto-allocator |
| `reversedAt`, `reversedBy`, `reversalReason` | Set when reversed |

### Invoice

A billing document snapshot for uninvoiced shipment-charge ledger entries in a billing period. Creating an invoice does not create a new ledger entry because the shipment charges are already posted.

| Field | Notes |
|---|---|
| `organizationId` | Nullable. `null` means solo shippers / no org |
| `invoiceNumber` | Unique generated reference like `INV-YYYYMMDD-XXXXXX` |
| `periodStart`, `periodEnd` | Billing period included in the invoice |
| `subtotal`, `vat`, `total` | Invoice totals, stored as Decimal |
| `currency` | Usually organization currency or line currency |
| `status` | `draft`, `sent`, `paid`, `overdue`, `disputed`, `void` |
| `dueDate`, `sentAt`, `paidAt` | Lifecycle timestamps |
| `createdById` | User who generated the invoice |

### InvoiceLine

Each invoice line links one shipment charge ledger entry to one invoice.

| Field | Notes |
|---|---|
| `invoiceId` | FK to Invoice |
| `shipmentId` | FK to Shipment |
| `ledgerEntryId` | Unique reference to the `OrganizationLedger` shipment charge entry |
| `trackingNumber`, `shipmentDate` | Snapshot fields for stable invoice output |
| `amount`, `currency` | Snapshot amount and currency |
| `paid`, `totalPaid`, `remainingBalance` | Payment snapshot at invoice generation time |

---

## Data Flow

### 1. Shipment booked → DEBIT posted

Triggered inside `ShipmentBookingService.bookShipment()` on successful carrier booking:

```
financeLedgerService.createLedgerEntry(organizationId, {
  sourceRepo: 'Shipment',
  sourceId: shipment.id,
  amount: totalPrice,             ← from pricingSnapshot.totalPrice or shipment.price
  entryType: 'DEBIT',
  category: 'SHIPMENT_CHARGE',
  description: 'Charge for {trackingNumber}',
  reference: trackingNumber,
  metadata: { attemptId, carrierCode, currency, fixedFeeApplied }
})
```

`createLedgerEntry()` atomically:
1. `UPDATE organization SET balance = balance + amount` (MySQL atomic increment)
2. `INSERT OrganizationLedger` with `balanceAfter` snapshot

For solo shippers (no org), `balanceAfter` is computed by reading the last ledger entry's `balanceAfter` and adding the new amount.

### 2. Payment received → CREDIT posted

Triggered by `POST /api/finance/organizations/:orgId/payments` (accounting role required):

```
prisma.$transaction([
  payment.create({ amount, method, reference, notes }),
  financeLedgerService.createLedgerEntry(organizationId, {
    sourceRepo: 'Payment',
    sourceId: payment.id,
    amount,
    entryType: 'CREDIT',
    category: 'PAYMENT'
  }),
  organization.update({ unappliedBalance: { increment: amount } })
])
```

All three writes are atomic. The ledger CREDIT reduces the balance. `unappliedBalance` is incremented — this tracks cash not yet matched to specific shipments.

### 3. Payment allocated to shipments

Two modes:

**Manual allocation** (`POST /api/finance/organizations/:orgId/allocations`):
- Accounting user specifies `paymentId`, `shipmentIds[]`, and `amount`
- For each shipment: creates a `PaymentAllocation` record
- Decrements `organization.unappliedBalance` by the allocated amount
- Updates `payment.status`: UNAPPLIED → PARTIALLY_APPLIED → APPLIED
- Updates `shipment.paid`, `shipment.totalPaid`, `shipment.remainingBalance`
- Writes a zero-amount `ALLOCATION` audit entry to the ledger

**FIFO auto-allocation** (`POST /api/finance/organizations/:orgId/allocations/fifo`):
- Fetches all `UNAPPLIED` / `PARTIALLY_APPLIED` payments ordered by `postedAt ASC` (oldest first)
- Fetches all unpaid shipments (`paid: false`, status not `draft`) ordered by `createdAt ASC`
- Applies each payment to shipments in order until payment is exhausted or shipments are covered
- Each allocation is created with `isFifo: true`

### 4. Invoice generated

Triggered by `POST /api/finance/organizations/:orgId/invoices`:

1. Accounting selects a billing period.
2. `financeInvoiceService.createInvoiceFromPeriod()` queries `OrganizationLedger` for uninvoiced `SHIPMENT_CHARGE` DEBIT rows in that period.
3. Existing `InvoiceLine.ledgerEntryId` values are excluded so the same shipment charge cannot be invoiced twice.
4. The invoice is created in `draft` status with one line per shipment charge.

Invoices are billing snapshots. The ledger remains the source of truth for balances.

### 5. Reversal

**Reverse an allocation** (`POST /api/finance/allocations/:allocationId/reverse`):
- Sets allocation `status: 'REVERSED'`
- Returns `amount` to `organization.unappliedBalance`
- Post-reversal: payment status and shipment paid status are recalculated

**Reverse a ledger entry** (`reverseLedgerEntry()`):
- Creates a new opposite-type entry (DEBIT→CREDIT or vice versa)
- Sets `category: 'REVERSAL'`, links back via `parentEntryId`
- If the original was a `PAYMENT` entry, adjusts `unappliedBalance` accordingly

---

## Balance Calculation

`getOrganizationBalance(organizationId)`:
```sql
SELECT SUM(amount) WHERE entryType='DEBIT'   → debitTotal
SELECT SUM(amount) WHERE entryType='CREDIT'  → creditTotal
balance = debitTotal - creditTotal
```

**Positive balance = org owes money** (more charges than credits).  
`availableCredit = org.creditLimit - balance`

> **Important:** `Organization.balance` is a cached running total maintained by atomic increments in `createLedgerEntry()`. The `getOrganizationBalance()` function recomputes from ledger sums for accuracy — but this is only used in the balance API response, not in the credit gate check. The credit gate reads `org.creditLimit` vs `org.balance` (the cached field), not the recomputed sum.

---

## Shipment Accounting

`getShipmentAccounting(shipmentId)` returns per-shipment payment status:

```javascript
{
  totalCharge: Decimal,        // from pricingSnapshot.totalPrice or shipment.price
  totalPaid: Decimal,          // sum of ACTIVE PaymentAllocations for this shipment
  remainingBalance: Decimal,   // totalCharge - totalPaid
  status: 'unpaid' | 'partial' | 'paid' | 'overdue',
  daysOutstanding: number
}
```

**Paid status logic:**
- `paid` if `remainingBalance ≤ 0.001`
- `partial` if `totalPaid > 0` and `remainingBalance > 0`
- `overdue` if `remainingBalance > 0` and `daysOutstanding > 30`
- `unpaid` otherwise

The `shipment.paid` boolean field and `shipment.remainingBalance` column are denormalized copies, updated by `updateShipmentPaidStatus()` whenever an allocation is created or reversed.

---

## Aging Report

`getAgingReport(organizationId)` buckets unpaid shipment balances by age:

| Bucket | Age |
|---|---|
| `0-30` | 0–30 days old |
| `31-60` | 31–60 days |
| `61-90` | 61–90 days |
| `90+` | Over 90 days |

Revenue snapshot `getRevenueSnapshot({ startDate, endDate, orgId })` groups ledger DEBITs by org + year + month for the accounting dashboard.

---

## Credit Gate (Finance Hold)

During booking, `ShipmentBookingService` checks:
```
if (shipment.price > organization.availableCredit) → set financeHold, reject booking
```

The credit gate reads `org.creditLimit` and `org.balance` from the DB. It does **not** call `getOrganizationBalance()` (which recomputes from ledger sums) — it trusts the cached `balance` field.

When triggered, a `financeHold` JSON blob is written to the shipment:
```javascript
{
  status: true,
  reason: 'Insufficient available credit',
  checkedAt: ISO8601,
  availableCredit: number,
  requiredAmount: number
}
```

**Bypass roles:** `admin`, `staff`, `accounting` skip the credit gate entirely.

---

## Finance Routes

All routes require authentication. Organization-scoped routes require `VIEW_FINANCE` or `MANAGE_PAYMENTS` capability.

```
GET  /api/finance/balance                              — Own org balance (any auth)
GET  /api/finance/ledger                               — Own org ledger (any auth)

GET  /api/finance/organizations/:orgId/overview        — VIEW_FINANCE
GET  /api/finance/organizations/:orgId/payments        — VIEW_FINANCE
POST /api/finance/organizations/:orgId/payments        — MANAGE_PAYMENTS
POST /api/finance/organizations/:orgId/allocations     — MANAGE_PAYMENTS
POST /api/finance/organizations/:orgId/allocations/fifo — MANAGE_PAYMENTS
GET  /api/finance/shipments/:shipmentId/accounting     — VIEW_FINANCE
POST /api/finance/allocations/:allocationId/reverse    — REVERSE_PAYMENTS
```

Additional invoice routes:

```
GET   /api/finance/organizations/:orgId/invoices       - VIEW_FINANCE
POST  /api/finance/organizations/:orgId/invoices       - MANAGE_PAYMENTS
PATCH /api/finance/invoices/:invoiceId/status          - MANAGE_PAYMENTS
```

The `:orgId` parameter accepts `'none'` to query solo shippers (users with no org). Only `admin` can access the `'none'` org.

---

## Known Weaknesses

### 1. Balance field drift risk
`Organization.balance` is maintained via atomic increments on every `createLedgerEntry()` call. If a ledger entry write succeeds but the organization balance update fails (or vice versa — though they're in a transaction), the cached balance will diverge from the ledger sum. There is no reconciliation job to detect or correct this drift.

### 2. Credit gate reads cached balance
The booking credit gate checks `org.balance` (the cached field) rather than recomputing from ledger sums. If the cache is stale, an org could book shipments that exceed their actual credit limit. A reconciliation endpoint exists in the API (`/balance` recomputes from sums) but is not used in the booking path.

### 3. FIFO runs outside a single transaction
`allocatePaymentsFifo()` iterates payments and shipments in a loop, calling `allocatePayment()` individually. Each allocation is its own transaction. If the process fails mid-way (server crash, timeout), some allocations will have been committed and others not. There is no rollback to a pre-FIFO state.

### 4. Revenue snapshot does in-memory grouping
`getRevenueSnapshot()` loads all matching ledger entries into memory, then groups by org/year/month in JavaScript. For orgs with large shipment history this will be slow and memory-intensive. There is a code comment noting "or use queryRaw for high volume" but it is not implemented.

### 5. No cancellation finance logic visible
There is no finance logic triggered when a shipment is cancelled. If a shipment is booked (ledger DEBIT posted) and then cancelled, the charge is not automatically reversed. A manual reversal via `reverseLedgerEntry()` would be required.

### 6. Unapplied balance for solo shippers
For shipments with no org (`organizationId = null`), the unapplied balance calculation fetches all null-org payments and allocations into memory and computes manually. This is an O(n) in-memory scan that does not scale.

### 7. Invoice MVP limitations
Invoices are stored and status-trackable, but PDF generation, WhatsApp/email sending, invoice payment matching, invoice-level audit events, and Phenix export/import reconciliation are not implemented yet.
