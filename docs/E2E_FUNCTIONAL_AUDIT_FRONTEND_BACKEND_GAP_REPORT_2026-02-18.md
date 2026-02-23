# 3P Logistics — E2E Functional Audit + Frontend/Backend Gap Report (2026-02-18)

## Scope
This audit reviews current functional behavior across frontend and backend with emphasis on:
- Shipment lifecycle (quote -> draft -> booking -> tracking)
- Role-aware behavior across UI/API
- Frontend/backend contract consistency
- Hardcoded shipment API behaviors (rates/optional services)

---

## 1) Functional audit findings

### 1.1 Shipment quote/rating flow
- Frontend requests quotes through `POST /api/shipments/quote` via `shipmentService.getQuotes`.
- Backend quote endpoint delegates to carrier adapter and applies markup policy.
- **Fix applied:** Removed hardcoded fallback quote + optional-services values in `DgrAdapter.getRates`; rates are now fetched from carrier `/rates` API response and parsed dynamically.

### 1.2 Shipment draft pricing integrity
- Draft creation relies on a pricing snapshot derived from carrier quote + selected optional services.
- Optional services are filtered by selected codes and totaled server-side, reducing client tampering risk.

### 1.3 Role behavior
- Runtime role system still centers on `admin/staff/client/driver`.
- Organization-side role granularity (Org Manager vs Org Agent) is still not fully separated in code.

### 1.4 Finance and operations
- Finance endpoints remain largely constrained by role middleware and need split aligned to target architecture (Accounting vs Manager).

---

## 2) Frontend vs backend contract gaps

## Gap A — Legacy role taxonomy in UI/API contracts
Frontend route guards and menu checks still assume legacy 4-role model; backend persistence reflects same.

## Gap B — Capability model missing
Frontend uses role booleans (`isStaff`, role includes checks), while backend uses endpoint-level `restrictTo`. No shared capability contract exists.

## Gap C — Error shape inconsistency risk
Frontend has defensive message extraction for `details/message/error`, indicating inconsistent backend error payload shapes across modules.

## Gap D — Shipment data visibility policy drift risk
Backend strips some sensitive fields for non-admin users in shipment responses, but there is no centralized response-policy layer.

---

## 3) Hardcoded shipment API request audit

## Checked areas
- Frontend shipment API calls
- Backend carrier rating/optional services path
- Shipment quote + pricing snapshot pipeline

## Result
- ✅ Frontend shipment quote requests are routed through centralized API client (`frontend/src/services/api.js`) and not hardwired to external carrier URLs.
- ✅ Backend shipment rates now come from carrier rate API response (no static hardcoded rate catalog in adapter).
- ✅ Optional services now derive from provider response payload (`valueAddedServices`) and not from static local arrays.

## Notes
- Carrier base URL still comes from config/env (`dhlApiUrl`) as expected.
- Non-shipment mocks may still exist in other domains (e.g., address service fallback), outside this shipment-rate scope.

---

## 4) Final MVP (functional + contract alignment)

1. Introduce shared capability claims in auth payload (e.g., `canQuote`, `canViewFinance`, `canManageCarrierRules`) and use in UI guards.
2. Lock public signup to lowest org privilege role only.
3. Standardize backend error envelope (`{ success, error: { code, message, details } }`) and update frontend parsing.
4. Complete role split: Accounting/Manager/Org Manager/Org Agent.
5. Add centralized policy middleware and query scoping layer.
6. Add shipment assignment fields and enforce driver/agent scoped views.
7. Add contract tests for quote response shape (including optional services) to prevent regression into hardcoded values.

---

## 5) Acceptance checks for this pass
- No hardcoded static shipment quote table in DGR adapter.
- No hardcoded static optional-services table in DGR adapter.
- Quote path remains API-driven end-to-end.
