---
status: accepted
---

# ADR 0002: Migrate Target-Prod 3PL Backend to Headless Tryton ERP via Strangler Fig Gateway

## Context
Target Logistics currently operates a high-throughput 3PL logistics platform using Node.js, Express, Prisma ORM, and MySQL. While operationally capable, the platform relies on unvalidated JSON blobs (`origin`, `destination`, `items`, `parcels`), hand-rolled double-entry accounting in JavaScript, and lacks mathematical consignment inventory segregation. 

The system must migrate to Tryton ERP 7.x (Python / PostgreSQL) to provide strict double-entry stock accounting and financial general ledger guarantees. The migration must execute with zero system downtime and zero data loss on a bare-metal VPS without Docker.

## Decisions

1. **Strangler Fig Gateway Strategy:** The existing Express backend is retained as the Headless API Gateway. External client REST contracts (`POST /v1/quotes`, `POST /v1/shipments`, `x-api-key`), rate-limiting, and Chatwoot webhook integrations remain 100% unchanged. The gateway will run in dual-writing mode (writing to MySQL primary and Tryton JSON-RPC secondary).
2. **Bare-Metal & Native VPS Deployment (No Docker):** Tryton ERP runs natively in a dedicated Python 3.12 virtual environment (`/opt/tryton/venv`), supervised alongside Node.js by PM2 in the existing aaPanel environment. PostgreSQL 16 operates natively on the database host.
3. **Scope Boundaries:**
   - **In Scope:** B2B Merchant Accounts, Consignment Stock, Multi-piece Parcels, Pricing Engine & Zone Rate Cards (0.5 kg increments), Kuwait Hub Intake & Manual Scale Verification Gate, DHL Express/DGR Customs Automation, and KWD General Ledger Invoicing.
   - **Out of Scope (Deferred):** Cash-on-Delivery (COD) reconciliation engine and Driver Delivery Runs / Fleet Mobile modules (confirmed not in current active use).
4. **Full Historical Backfill:** Since total platform data spans $\le 4\text{ months}$, 100% of historical organizations, users, shipments, packages, and journal entries will be migrated via a Proteus script into PostgreSQL.
5. **7-Day Shadow Phase:** Dual-writing and background shadow rate verification run for 7 days, proving 100% mathematical parity down to 0.001 KWD before switching primary traffic.

## Consequences

- Zero downtime and zero disruption for merchants, driver portals, and WooCommerce plugins.
- Mathematical double-entry stock integrity for client-owned consignment inventory.
- Operational staff gain an enterprise review gate preventing unverified carrier bookings.
- No containerization overhead; runs natively within existing VPS and PM2 runbooks.
