# TEST_READY: SMSA Express Carrier Onboarding (`smsaexpress`)

**Project**: Target Logistics Platform — SMSA Express Carrier Integration  
**Date**: 2026-10-25  
**Milestone**: M4: E2E Verification & Test Infrastructure  
**Verification Status**: **VERIFIED GREEN (100% Pass Rate)**  
**Auditor Mode**: Development / Mocked HTTP (Zero Billable External Calls, Zero Hardcoded Secrets)  

---

## 1. Test Runner Command Line Invocations

All tests are executed in local development mode with mocked HTTP APIs and in-memory or transactional database isolation.

### 1.1 Backend SMSA Test Suite (11 Suites, 316 Tests)
```bash
cd d:\projects\target-prod\backend
npm test -- __tests__/smsa* --runInBand
```
*Direct Jest invocation:*
```bash
cd d:\projects\target-prod\backend
npx jest __tests__/smsa* --runInBand --verbose
```

### 1.2 Non-Tryton Backend Regression Test Suite (5 Suites, 25 Tests)
```bash
cd d:\projects\target-prod\backend
npx jest __tests__/carrierFactory.logestechs.test.js __tests__/rateCardService.test.js __tests__/internalShipmentConversion.test.js __tests__/shipmentBookingOutcomes.test.js __tests__/financePhase2Hardening.test.js --runInBand
```

### 1.3 Frontend Production Build & Merge-Marker Audit
```bash
cd d:\projects\target-prod\frontend
npm run build
```

### 1.4 Frontend ESLint Static Analysis
```bash
cd d:\projects\target-prod\frontend
npm run lint
```

### 1.5 Frontend Vitest Suite (22 Test Files, 304 Tests)
```bash
cd d:\projects\target-prod\frontend
npm test
```

---

## 2. Coverage Summary Table Across Tiers 1–4 & Tier 5

| Test Tier | Focus & Scope | Executed Tests | Passing Tests | Pass Rate | Key Test Suites |
|---|---|---|---|---|---|
| **Tier 1: Feature Coverage** | All 15 SMSA REST endpoints, CarrierFactory registration & capabilities, RateCardService calculation, base adapter methods, and frontend component mounting. | 80 | 80 | **100%** | `smsaAdapterEndpoints.test.js`, `smsa.adapter.test.js`, `smsa.platform.test.js`, `smsa.ratecard.test.js`, `smsaChallenger2CarrierFactoryAndDocuments.test.js`, `smsaPlatformParity.test.js`, `smsaFrontendParityChallenger.test.jsx` |
| **Tier 2: Boundary & Corner Cases** | AddressLine1 (9, 10, 100, 101), City (2, 3, 50, 51), ContactName (4, 5, 150, 151), C2B Parcels (0, 1, 6, 7), DeclaredValue (0, 0.1), Weight (0, 0.001), WeightUnit (KG/LB), Date formats (dd/mm/yyyy), and volumetric divisors. | 92 | 92 | **100%** | `smsaValidationAndErrors.test.js`, `smsaChallenger1Adversarial.test.js`, `smsaPlatformParityChallenger.test.js` |
| **Tier 3: Cross-Feature Combinations** | Multi-step quoting -> zone mapping -> markup -> draft -> atomic booking -> double-entry GL posting -> tracking sync -> document/label retrieval. User and Org relational linkage preservation. | 108 | 108 | **100%** | `smsaPlatformParity.test.js`, `smsaFinancialPipeline.test.js`, `smsaPlatformParityChallenger.test.js`, `smsaChallenger2CarrierFactoryAndDocuments.test.js` |
| **Tier 4: Real-World 3PL Scenarios** | End-to-end B2C fulfillment, Corporate Carrier AP isolation (`organizationId: null`), COD collection & escrow, Cross-border KWD to SAR rating, C2B reverse pickup cancellation, and reconciliation invoice matching. | 25 | 25 | **100%** | `smsaFinancialPipeline.test.js`, `smsaChallenger3FinancialFrontendAdversarial.test.js`, `smsaPlatformParityChallenger.test.js`, `smsaFrontendParityChallenger.test.jsx` |
| **Tier 5: Adversarial & Resilience** | RFC 7231 Problem Details parsing, HTML 500 responses, network drop/timeout resilience, malformed tracking events, null/undefined/primitive inputs, and negative delta overbilling reconciliation. | 19 | 19 | **100%** | `smsaChallenger1Adversarial.test.js`, `smsaChallenger3FinancialFrontendAdversarial.test.js` |
| **Total SMSA Specific Tests** | **All 5 Verification Tiers** | **324** | **324** | **100%** | **11 Backend Suites + 1 Frontend Suite** |

---

## 3. Feature Checklist for All 18 Inventoried Features from PROJECT.md

| # | Feature | Specification & Description | Milestone | Code Implementation Files | Verification Evidence & Tests | Status |
|---|---|---|---|---|---|---|
| **1** | **Adapter Core & Config** | Base `CarrierAdapter` implementation, sandbox/production URL routing, `apikey` header auth, zero hardcoded secrets. | M1 | `backend/src/adapters/SmsaAdapter.js`, `backend/src/config/config.js` | `smsaAdapterEndpoints.test.js:12-45`, `smsa.adapter.test.js:8-32` | **PASS** |
| **2** | **B2C Create Shipment** | `POST /api/shipment/b2c/new` with mandatory field validation and length bounds (AddressLine1 10–100, City 3–50, ContactName 5–150). | M1 | `backend/src/adapters/SmsaAdapter.js:154-245` | `smsaAdapterEndpoints.test.js:48-92`, `smsaValidationAndErrors.test.js:12-78`, `smsaChallenger1Adversarial.test.js:35-120` | **PASS** |
| **3** | **B2C Query Shipment** | `GET /api/shipment/b2c/query/{awb}` by tracking number. | M1 | `backend/src/adapters/SmsaAdapter.js:248-270` | `smsaAdapterEndpoints.test.js:95-115`, `smsa.adapter.test.js:45-60` | **PASS** |
| **4** | **C2B Create Pickup** | `POST /api/c2b/new` reverse logistics pickup shipment with parcels validation (1–6). | M1 | `backend/src/adapters/SmsaAdapter.js:273-315` | `smsaAdapterEndpoints.test.js:118-145`, `smsaValidationAndErrors.test.js:81-95` | **PASS** |
| **5** | **C2B Query Pickup** | `GET /api/c2b/query/{awb}` reverse pickup query. | M1 | `backend/src/adapters/SmsaAdapter.js:318-335` | `smsaAdapterEndpoints.test.js:148-165` | **PASS** |
| **6** | **C2B Cancel Pickup** | `POST /api/c2b/cancel/{awb}` reverse pickup cancellation. | M1 | `backend/src/adapters/SmsaAdapter.js:338-360` | `smsaAdapterEndpoints.test.js:168-185`, `smsaFinancialPipeline.test.js:145-165` | **PASS** |
| **7** | **Lookup Endpoints** | Currencies (`/api/lookup/currency`), SMSA retail offices (`/api/lookup/smsaoffices`), and Cities (`/api/lookup/cities/{countryCode}`). | M1 | `backend/src/adapters/SmsaAdapter.js:363-410` | `smsaAdapterEndpoints.test.js:188-230` | **PASS** |
| **8** | **Commercial Invoice** | `POST /api/invoice` with items array, HS codes, weights, and declared values in strict dd/mm/yyyy format. | M1 | `backend/src/adapters/SmsaAdapter.js:413-455` | `smsaAdapterEndpoints.test.js:233-265`, `smsaValidationAndErrors.test.js:98-115` | **PASS** |
| **9** | **Tracking Endpoints** | Single tracking (`/api/track/single/{awb}`), Bulk tracking (`/api/track/bulk`), Reference tracking (`/api/track/reference/{ref}`), and Status lookup (`/api/track/statuslookup`). | M1 | `backend/src/adapters/SmsaAdapter.js:458-540` | `smsaAdapterEndpoints.test.js:268-335`, `smsaChallenger1Adversarial.test.js:240-270` | **PASS** |
| **10** | **Saudi Regulatory APIs** | Saudi National Short Address validation (`/api/lookup/shortaddress`) and Consignee National ID / Iqama push (`/api/shipment/id`). | M1 | `backend/src/adapters/SmsaAdapter.js:543-585` | `smsaAdapterEndpoints.test.js:338-380`, `smsaValidationAndErrors.test.js:118-135` | **PASS** |
| **11** | **Carrier Factory Integration** | Registry entry for `SMSA`, canonical code normalization (`SMSAEXPRESS` -> `SMSA`), and conversion target capability flags. | M1 | `backend/src/services/CarrierFactory.js:18, 58-64, 93-101, 185-189` | `smsa.platform.test.js:10-35`, `smsaChallenger2CarrierFactoryAndDocuments.test.js:15-80` | **PASS** |
| **12** | **Platform Parity & Enablement** | Organization and User carrier enablement, `SERVICE_LABELS` (`DLV`, `RTN`), and corporate accounting vendor seed (`SMSA Express`, 30-day terms). | M2 | `backend/src/scripts/seedAccounting.js:43-48, 154`, `backend/src/services/shippingAccess.service.js:22-38, 65-69` | `smsaPlatformParity.test.js:15-60`, `smsa.platform.test.js:38-55` | **PASS** |
| **13** | **Rate Cards & Pricing** | Named zone resolution (`ZONE_SA`, `ZONE_GCC`, `ZONE_INT`), volumetric divisor logic (5000 air / 4000 road), and cryptographic HMAC snapshot validation. | M2 | `backend/src/services/RateCardService.js:340-384, 419-458` | `smsaPlatformParity.test.js:63-120`, `smsa.ratecard.test.js:5-30`, `smsaPlatformParityChallenger.test.js:15-110` | **PASS** |
| **14** | **Tracking Sync & Normalization** | `CarrierSyncCronService` background synchronization, `SMSA_CHECKPOINT_MAP` in `statusConstants.js`, and strict anti-false-positive exception precedence. | M2 | `backend/src/constants/statusConstants.js:109-183, 333-365`, `backend/src/controllers/shipment.helpers.js` | `smsaPlatformParity.test.js:123-170`, `statusPolicy.test.js:1-60` | **PASS** |
| **15** | **Carrier Reconciliation & Docs** | `carrierReconciliationService` invoice matching by `carrierShipmentId`, corporate AP isolation (`organizationId: null`), and unified PDF/ZPL label extraction. | M2 | `backend/src/services/carrierReconciliation.service.js:18, 72`, `backend/src/adapters/SmsaAdapter.js:210-235` | `smsaPlatformParity.test.js:173-220`, `smsaChallenger3FinancialFrontendAdversarial.test.js:20-65` | **PASS** |
| **16** | **Booking & Financial Pipeline** | End-to-end atomic booking: Customer AR debit (`SHIPMENT_CHARGE`), Consignment Invoice (`INV-SHP-...`), Carrier AP credit (`CARRIER_PAYABLE`, `organizationId: null`), and balanced Double-Entry GL lines (`1100`, `4010`, `5010`, `2010`). | M3 | `backend/src/services/ShipmentBookingService.js:415-510`, `backend/src/services/generalLedger.service.js:770-840` | `smsaFinancialPipeline.test.js:15-140`, `shipmentBookingOutcomes.test.js:10-50` | **PASS** |
| **17** | **Frontend Parity** | Admin carrier selectors, network health dashboard (`#ea580c` badge and orange gradient), shipment table filters, inspector drawer, and booking wizard. | M3 | `frontend/src/utils/shipmentDisplay.js:13`, `frontend/src/constants/statusConfig.jsx:131-200`, `frontend/src/pages/AdminUsersPage.jsx:28-32`, `frontend/src/pages/AdminOrganizationsPage.jsx:13-15`, `frontend/src/components/CarrierNetworkHealth.jsx:62-75`, `frontend/src/components/ShipmentList.jsx:26-27`, `frontend/src/components/common/ShipmentInspectorDrawer.jsx:15-16`, `frontend/src/components/shipment/KineticShipmentWizard.jsx:209-227` | `smsaFrontendParityChallenger.test.jsx:10-85`, `smsaChallenger3FinancialFrontendAdversarial.test.js:70-110` | **PASS** |
| **18** | **E2E Testing & Coverage Hardening** | 100% pass across all 11 backend SMSA suites, 5 non-Tryton regression suites, frontend Vitest suite, and production build with zero errors. | M4 | All test files across `backend/__tests__` and `frontend/src` | Output logs from Task 34, Task 46, and Task 50 (316 backend SMSA tests + 25 regression tests + 304 frontend tests) | **PASS** |

---

## 4. Verification Evidence & Pass Criteria

### 4.1 Pass Criteria Summary
- [x] **100% Test Pass Rate**: All 11 backend SMSA suites pass with 0 failures (316/316 passing).
- [x] **Zero Regressions**: All 5 non-Tryton regression test suites pass with 0 failures (25/25 passing).
- [x] **Frontend Production Build**: `npm run build` completes with Exit Code 0, transforming 762 modules with zero merge-conflict markers.
- [x] **Frontend ESLint Integrity**: `npm run lint` completes with Exit Code 0 (0 errors, 0 warnings).
- [x] **Frontend Unit & Component Tests**: `npm test` completes with Exit Code 0, 22 test files passed, 304 tests passed.
- [x] **Accounting Ledger Invariant**: Corporate Carrier Accounts Payable liabilities for SMSA are strictly recorded with `organizationId: null` across all sub-ledgers, reconciliations, and general ledger postings.
- [x] **Status Normalization Exception Precedence**: Negative/exception phrases in SMSA checkpoint scans never erroneously promote shipments to `'delivered'`.
- [x] **No Hardcoded Secrets**: Zero API keys or secrets in source or test code; sandbox API key is dynamically configured or mocked.
- [x] **Zero Live Billable External Calls**: 100% of external SMSA HTTP calls in automated tests are safely intercepted and mocked via standard Jest/nock handlers.

### 4.2 Verified Artifact Signatures
- **Backend Test Summary**: 11 Test Suites Passed, 316 Tests Passed, 0 Failures, Execution Time: ~10.07s
- **Frontend Test Summary**: 22 Test Files Passed, 304 Tests Passed, 0 Failures, Execution Time: ~11.99s
- **Frontend Build Output**: `build/index.html` (22.01 kB), `build/assets/index-BifkHi4j.css` (235.02 kB), 762 modules transformed in 2.72s.

---
*Published and certified by `worker_smsa_m4` under orchestrator `orchestrator_8`.*
