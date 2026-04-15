# Target Logistics

Target Logistics is a multi-tenant shipment operations platform for creating, pricing, booking, tracking, and financially managing shipments across carrier networks and manual fulfillment.

The system is a monorepo with a React frontend, an Express API, and a Prisma/MySQL database.

## Current Product Shape

- Platform users can create shipments, review shipment details, book eligible carrier shipments, scan pickups, process warehouse handovers, and manage public tracking.
- Client users are restricted to their assigned shipping access: exactly one carrier/service pair or Manual Shipment.
- API clients do not need to send carrier or service fields. The backend derives them from the assigned user policy.
- Manual Shipments are supported without 3PL carrier registration. They use `carrierCode: MANUAL`, skip carrier booking, and allow manual operational fields such as price, cost, currency, and estimated delivery.
- Shipment status can be changed manually only by `admin`, `manager`, and `accounting` roles. Carrier sync, booking, pickup scan, and warehouse scan flows can still move statuses automatically.
- Shipment types are limited to `Standard Package` and `Document Express`.
- The UI is branded for Target Logistics with light mode as the default and dark mode as an optional theme.

## Documentation

Keep these files updated when behavior changes:

| File | Purpose |
| --- | --- |
| [docs/PLATFORM_FEATURES.md](docs/PLATFORM_FEATURES.md) | Maintained feature catalog and product invariants for future developers. |
| [CLIENT_API_GUIDE.md](CLIENT_API_GUIDE.md) | Client-facing API integration guide. |
| [backend/README.md](backend/README.md) | Backend architecture, commands, and source map. |
| [frontend/README.md](frontend/README.md) | Frontend architecture, commands, and UI conventions. |
| [VPS_AAPANEL_DEPLOYMENT.md](VPS_AAPANEL_DEPLOYMENT.md) | VPS and aaPanel deployment checklist. |
| [branding_.md](branding_.md) | Current Target Logistics UI and brand direction. |

Historical audit reports, gap analyses, temporary screenshots, generated PDFs, npm cache files, and one-off diagnostic scripts should not be treated as maintained documentation.

## Tech Stack

- Frontend: React 18, React Router, styled-components, Material UI, notistack, Axios.
- Backend: Node.js, Express, Prisma, MySQL, JWT authentication, rate limiting, Helmet, CORS.
- Database: MySQL through Prisma Client.
- Carrier integrations: DGR/DHL active, Manual Shipment active, Aramex adapter present, FedEx/UPS listed but not active for normal use.

## Repository Layout

```text
backend/
  prisma/                 Prisma schema and generated client inputs
  src/controllers/        Express controller logic
  src/routes/             Route registration
  src/services/           Carrier, pricing, ledger, shipment, and access services
  src/middleware/         Auth, API key, RBAC, idempotency, and request middleware
  src/constants/          Shared backend status constants

frontend/
  src/pages/              Route-level screens
  src/components/         Shared and domain components
  src/services/api.jsx    Axios API client
  src/constants/          Frontend status rendering constants
  src/utils/              Role labels, capabilities, and helpers

docs/
  PLATFORM_FEATURES.md    Canonical feature catalog
```

## Local Development

Install dependencies:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

Run both apps from the repository root:

```bash
npm run dev
```

## Production Verification

Run the full readiness gate before release:

```bash
npm run verify
```

This runs the frontend ESLint gate, backend Jest suites, frontend Vitest suites, the Vite production build, and npm audit checks for the root, backend, and frontend packages.

Focused commands:

```bash
npm run lint
npm test
npm run build
npm run audit
npm run db:migrate:deploy
npm run deploy:prepare
```

Or run each app separately:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm start
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8899/api`
- Backend health: `http://localhost:8899/health`

## Environment

Backend configuration is read from `backend/.env`.

Minimum backend values:

```env
PORT=8899
NODE_ENV=development
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/target_logistics"
JWT_SECRET="replace-with-a-long-secret"
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
ADMIN_ORGANIZATION_NAME=Target Logistics
ADMIN_NAME=System Admin
ADMIN_EMAIL=admin@target.local
ADMIN_PASSWORD=replace-with-a-temporary-local-password
```

Frontend configuration is read from `frontend/.env.local`.

```env
REACT_APP_API_URL=http://localhost:8899/api
```

Do not commit `.env`, `.env.local`, production credentials, generated labels, generated invoices, or runtime upload files.

## Database

The Prisma schema lives at `backend/prisma/schema.prisma`.

Common commands:

```bash
cd backend
npm run db:generate
npm run db:migrate:deploy
npm run seed
```

Use `npm run db:migrate:deploy` in staging and production so committed Prisma migrations are applied before the backend starts. `prisma db push` should only be used for disposable local experimentation, not release deployments.

## Verification

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm run build
```

Health check:

```bash
curl http://localhost:8899/health
```

## Documentation Maintenance Rule

When changing platform behavior, update the documentation in the same change set. In particular, update [docs/PLATFORM_FEATURES.md](docs/PLATFORM_FEATURES.md) when roles, shipment statuses, carrier access, API behavior, finance behavior, or public tracking behavior changes.
