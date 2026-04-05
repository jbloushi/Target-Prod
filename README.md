# Target Logistics - System Architecture & Developer Guide

Welcome to the **Target Logistics** platform. This document serves as the authoritative guide for developers seeking to understand, customize, or extend the codebase.

## 1. Tech Stack Overview

The application is structured as a monolithic monorepo containing a distinct Frontend and Backend, bridged by a REST API.

*   **Frontend Client:** React 18 (Single Page Application)
*   **Styling:** Material-UI (MUI) v5 with custom localized design CSS tokens (`ui/tokens.css`).
*   **Backend Server:** Node.js v22 (Express Framework)
*   **Database Engine:** Native MySQL 8.0
*   **ORM Tooling:** Prisma v6.2.1

---

## 2. Codebase Structure

### 🗂️ `\backend` (API & Core Logic)
*   **`/prisma`**: Contains `schema.prisma`. This is the single source of truth for all database tables and relationships. Any schema edits must be followed by `npx prisma db push` to sync the MySQL database.
*   **`/src/controllers`**: Holds the business logic for all endpoints. Controllers are strictly divided by domain (e.g., `user.controller.js`, `shipment-crud.controller.js`, `external.controller.js`).
*   **`/src/models`**: *[DEPRECATED]* Old Mongoose schema files from the previous MongoDB iteration. These are kept temporarily for historical reference but have been replaced by Prisma.
*   **`/src/routes`**: API routing definitions. They map specific Express HTTP verbs (GET, POST) to Controller functions and inject middleware.
*   **`/src/middleware`**: Functions that run before a controller (e.g., `apiAuth.js` which verifies JWTs).
*   **`/src/services`**: Shared utility logic (e.g., DHL Booking API adapters, mapping handlers).

### 🗂️ `\frontend` (React Interface)
*   **`/src/components`**: Reusable generic UI elements (Buttons, Tables).
*   **`/src/components/layout`**: The global structure. `Sidebar.js` defines all menu navigation and controls Role-Based Access Views.
*   **`/src/pages`**: Top-level views mapped directly to application URLs (e.g., `DashboardPage.js`, `ShipmentDetailsPage.js`).
*   **`/src/services/api.js`**: The central Axios service. It defines all outgoing frontend requests to the Node backend and handles centralized JWT token attachment.
*   **`/src/theme`**: Contains Material-UI overrides to enforce the premium dark-mode aesthetic.

---

## 3. Database Architecture (Prisma/MySQL)

We strictly use the **Prisma ORM**. To update the database structure:
1. Modify `backend/prisma/schema.prisma`.
2. Run `npx prisma db push` to push structure changes to MySQL.
3. Run `npx prisma generate` to update the native Javascript Prisma Client.

### Primary Entities:
*   **User / Organization**: The system supports multi-tenancy. A `User` (staff, driver, admin) can optionally belong to an `Organization` (client). Accounting functions, like credit limits and markups, happen at the `Organization` level.
*   **Shipment**: The core parcel object. Contains origins, destinations, items, and dimensions.
*   **History / Checkpoints**: These are now localized natively within the MySQL `Shipment` record using JSON arrays (`history` and `checkpoints`), allowing rapid mutations without heavy table joins.
*   **PickupRequests**: Abstract request entities from external clients asking a driver to come to an origin. Once approved, these natively convert into fully booked `Shipments`.

---

## 4. Development & Running Locally

Ensure XAMPP or native MySQL 8.0 is running on port 3306.

**Terminal 1 (Backend):**
\`\`\`bash
cd backend
npm install
npm run dev  # Runs Nodemon on port 8899
\`\`\`

**Terminal 2 (Frontend):**
\`\`\`bash
cd frontend
npm install
npm start   # Runs React on port 3000
\`\`\`

*   **API Base Path:** The frontend looks to \`REACT_APP_API_URL\` in \`frontend/.env.local\` to find the backend (defaults to `http://localhost:8899/api`).
*   **Database Connection:** The backend looks to \`DATABASE_URL\` in \`backend/.env\` to connect to MySQL.

---

## 5. Security & Authentication

*   Authentication is handled via **JWT (JSON Web Tokens)**.
*   Upon login (`/login`), the backend returns an encrypted JWT and standard User object.
*   The frontend stores this token in `localStorage`. 
*   `frontend/src/services/api.js` uses an Axios interceptor to automatically inject the token as `Bearer <token>` in the Authorization header on every outgoing API query.
*   The backend's `apiAuth.js` middleware rejects any incoming requests that lack a valid token.
