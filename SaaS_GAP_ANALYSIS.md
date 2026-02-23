# SaaS Gap Analysis & Audit Trail Report

## 🎯 System Evolution Goal
Transitioning the current monolithic MVP into a scalable SaaS 3PL platform with:
*   Multiple carrier integrations
*   Multiple DHL accounts (DGR + non-DGR)
*   Full accounting & invoicing
*   Client API access
*   Rigorous Multi-tenant architecture

---

## 🏗️ 1. Multi-Tenant Architecture
**Current State:** 
Organizations are isolated at the application level via `req.user.organization`. Controllers manually inject this ID into Mongoose queries.
**Gap (High Risk):** 
If a developer creates a new route and forgets to add `query.organization = req.user.organization;`, cross-tenant data leakage occurs. 
**Next Step for SaaS:**
Implement a global Mongoose plugin (tenant scoping) or use `cls-hooked` (Async Local Storage) to automatically inject the tenant ID into all queries at the DB driver level.

## 🚚 2. Multiple DHL Accounts & Carrier Integrations
**Current State:**
The `CarrierAdapter.js` base pattern is correctly established. However, the `DgrAdapter.js` relies on globally hardcoded environment variables via `config.js` (`DHL_API_KEY`, `DHL_API_SECRET`).
**Gap:**
The system assumes one global master account. It cannot currently handle a non-DGR DHL account alongside the DGR account, nor can it handle Bring-Your-Own-Carrier (BYOC) for 3PL clients.
**Next Step for SaaS:**
Move carrier API credentials into a database model (e.g., `CarrierCredential`). Update the `CarrierFactory.js` to accept a credential context dynamically based on the Organization's routing rules before instantiating the adapter.

## 💰 3. Financial Ledger to "Full Accounting"
**Current State:**
A robust foundational ledger exists. It handles debits on booking, AR aging, and prevents negative balances via `financeHold`.
**Gap:**
Missing formal Invoice generation (PDFs with proper SaaS tax IDs, sequential invoice numbers) and actual Payment Gateway integration (e.g., Stripe, MyFatoorah) to automatically resolve negative balances or process Top-Ups.
**Next Step for SaaS:**
Implement a scheduled CRON job to batch ledger charges into monthly/weekly formal Invoices (`Invoice` model), and integrate a payment gateway adapter.

## 🔌 4. Client API Access
**Current State:**
Foundational pieces exist: `ApiClient.model.js` and `external.controller.js` are present. `User` can generate an `apiKey`.
**Gap:**
- No webhook dispatcher (event-driven HTTP posts back to client URLs when DHL status changes).
- No rigorous rate-limiting or API tiering.
- No client-facing developer documentation or sandbox mode.
**Next Step for SaaS:**
Establish a Webhook registration model and an event dispatcher in the `shipment-tracking.controller.js`.

---

## 🕵️‍♂️ Current Audit Trail Analysis

You asked: *"Do we have any audit trail?"*

**Answer:** You have **Fragmented Domain-level Auditing**, but you lack **Global Entity Auditing**.

### What you DO have:
1.  **Financial Audit (Excellent):** The `OrganizationLedger` is an immutable, append-only log. It even creates `0-amount` entries for visibility when manual actions occur (e.g., FIFO payment allocation). Reversals are handled structurally instead of via deletion.
2.  **External Communication Audit (Excellent):** All payloads sent to and received from DHL are logged permanently in the `CarrierLog` collection.
3.  **Shipment State Audit (Good):** The `history` array tracks location movements, and `bookingAttempts` tracks granular failures to the carrier API.

### What is MISSING (The Gap):
There is **no system-wide entity audit log.** 
*   If an Admin changes an Organization's markup from 15% to 5%, there is no record of who did it or when.
*   If a user's role is elevated from `client` to `org_manager`, there is no record.
*   If an address is silently modified, there is no historical snapshot.

**Recommendation for SaaS:**
Implement a global audit plugin (e.g., `mongoose-audit-trail` or custom pre-save hooks) that automatically intercepts modifications to critical collections (`User`, `Organization`, `Organization.markup`) and writes the `<Before State>`, `<After State>`, and `<User ID>` to a generic `SystemAuditLog` collection.
