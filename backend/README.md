# Backend

The backend is an Express API using Prisma and MySQL. It owns authentication, RBAC, shipment creation, carrier integration, client API access, pickup operations, finance, public tracking, and document serving.

## Commands

```bash
npm install
npm run dev
npm start
npm run db:generate
npm run db:migrate:deploy
npm run deploy:prepare
npm run seed
npm test
npm run test:coverage
npm run verify
```

`npm test` runs the backend Jest suite for shipment access policy, API key authentication, client API carrier/service enforcement, internal shipment editing, automatic carrier status promotion, and finance workflows.

Prisma commands:

```bash
npm run db:generate
npm run db:migrate:deploy
```

Use `npm run db:migrate:deploy` for staging and production. It applies committed Prisma migrations, including database indexes, without creating new migration files. Avoid `prisma db push` outside disposable local databases.

## Environment

Create `backend/.env` locally. Do not commit it.

```env
PORT=8899
NODE_ENV=development
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/target_logistics"
JWT_SECRET="replace-with-a-long-secret"
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000
LOGESTECHS_SHIPMENT_BASE_URL=https://apisv2.logestechs.com/api
LOGESTECHS_FULFILLMENT_BASE_URL=https://apisv5.logestechs.com/api
LOGESTECHS_COMPANY_ID=
LOGESTECHS_USERNAME=
LOGESTECHS_PASSWORD=
# Optional shipment auth overrides
LOGESTECHS_EMAIL=
LOGESTECHS_SHIPMENT_EMAIL=
LOGESTECHS_SHIPMENT_PASSWORD=
ADMIN_ORGANIZATION_NAME=Target Logistics
ADMIN_NAME=System Admin
ADMIN_EMAIL=admin@target.local
ADMIN_PASSWORD=replace-with-a-temporary-local-password
```

## Source Map

| Path | Purpose |
| --- | --- |
| `src/server.js` | Express setup, middleware, route mounting, health check. |
| `src/config/` | Runtime config and database client. |
| `src/routes/` | Express route files. |
| `src/controllers/` | Request handlers split by domain. |
| `src/services/` | Shipment, carrier, pricing, finance, API access, and utility services. |
| `src/middleware/` | Auth, API key, RBAC, idempotency, rate/security middleware. |
| `src/constants/statusConstants.js` | Backend shipment status source of truth. |
| `prisma/schema.prisma` | Active database schema. |

## Important Routes

| Prefix | Purpose |
| --- | --- |
| `/api/auth` | Login, signup, OTP, API key generation. |
| `/api/shipments` | Authenticated platform shipment operations. |
| `/api/public/shipments` | Public tracking and public location update. |
| `/api/v1` | Client API shipment, quote, tracking, and address routes. |
| `/api/client` | External pickup and client tracking routes. |
| `/api/finance` | Finance and accounting routes. |
| `/api/users` | User administration. |
| `/api/organizations` | Organization administration. |
| `/api/pickups` | Platform pickup requests. |
| `/api/geocode` | Geocode helpers. |

## Current Backend Invariants

- Prisma/MySQL is the active persistence path.
- Client shipping access is enforced through `src/services/shippingAccess.service.js`.
- Client API requests should not require carrier/service selection from the client.
- Internal shipments use `carrierCode: INTERNAL` and skip external carrier booking.
- Manual status changes are limited to `admin`, `manager`, and `accounting`.
- Canonical shipment statuses live in `src/constants/statusConstants.js`.
- RBAC capabilities live in `src/middleware/rbac.policy.js` and must stay aligned with the frontend copy.
- Runtime generated documents belong in `uploads/documents` and should not be committed.
- The legacy document-model path has been removed from the maintained backend. New database work should use Prisma.
