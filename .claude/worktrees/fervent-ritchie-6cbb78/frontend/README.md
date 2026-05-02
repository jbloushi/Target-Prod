# Frontend

The frontend is a React 18 single page application built with Vite for Target Logistics platform users, client users, public tracking users, drivers, finance users, and administrators.

## Commands

```bash
npm install
npm start
npm run lint
npm test
npm run build
npm run verify
```

The local dev server runs on `http://localhost:3000`.

`npm run lint` runs the frontend ESLint gate. `npm test` runs Vitest coverage for status rendering rules, role capabilities, and CSV export behavior. `npm run verify` runs lint, tests, build, and audit.

## Environment

Create `frontend/.env.local` locally. Do not commit it.

```env
REACT_APP_API_URL=http://localhost:8899/api
```

## Source Map

| Path | Purpose |
| --- | --- |
| `src/pages/` | Route-level screens. |
| `src/components/` | Shared and domain components. |
| `src/components/shipment/` | Shipment wizard and shipment content panels. |
| `src/components/layout/` | App shell, sidebar, and footer. |
| `src/services/api.jsx` | Axios API client and service wrappers. |
| `src/constants/statusConfig.jsx` | Frontend shipment status labels and progress steps. |
| `src/utils/capabilities.jsx` | Frontend RBAC capability mirror. |
| `src/ui/` | Shared UI primitives and tokens. |

## Current UI Invariants

- Light mode is the default app experience. Dark mode is optional.
- Product copy should use friendly operational labels, not carrier-specific technical wording.
- Shipment type options are limited to `Standard Package` and `Document Express`.
- Client users should not be forced to select carrier or service in the wizard when their assigned access already determines it.
- Public tracking must remain light, branded, and easy for customers to read.
- Manual Shipment should not show the carrier approval/booking action.
- Manual Shipment editing should expose authorized manual commercial fields where the user role allows it.
- Frontend status labels must stay aligned with backend status constants.

## Main Pages

| Page | Purpose |
| --- | --- |
| `ShipmentWizardV2.jsx` | Step-by-step shipment creation. |
| `ShipmentDetailsPage.jsx` | Shipment detail, editing, documents, status, timeline. |
| `ShipmentsPage.jsx` | Shipment listing. |
| `PublicTrackingLandingPage.jsx` | Public tracking search/detail experience. |
| `DriverPickupPage.jsx` | Driver pickup workflow. |
| `WarehouseScanPage.jsx` | Warehouse scan workflow. |
| `FinancePage.jsx` | Finance and accounting workflows. |
| `AdminUsersPage.jsx` | User and shipping access administration. |
| `AdminOrganizationsPage.jsx` | Organization administration. |
| `SettingsPage.jsx` | Profile and API key settings. |
| `AddressBookPage.jsx` | Saved addresses. |

## Build Verification

Run this before handing off frontend changes:

```bash
npm run build
```
