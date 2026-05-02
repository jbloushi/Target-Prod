# Production Readiness Checklist

> Complete this before every production deployment.  
> Derived from [docs/audits/audit-report.md](../audits/audit-report.md), [security-report.md](../audits/security-report.md), and system architecture.  
> Owner: Engineering lead signs off before deploy.

---

## How to Use This Checklist

- **First deploy:** Complete every section
- **Subsequent deploys:** Complete sections marked *(every deploy)*; skip one-time sections if infrastructure hasn't changed
- **Hotfix deploy:** At minimum complete the Critical section and the Testing section

---

## 0. Pre-Deploy Gate (Block deploy if any of these fail)

```
□ All tests pass: npm run verify (runs lint + test + build + audit across workspaces)
□ No CRITICAL or HIGH findings open from the last security review
□ Migration files are committed and reviewed
□ No .env file is committed to git (git status shows no .env* changes)
□ Feature branch is merged to main and CI is green
```

---

## 1. Server Environment *(every deploy)*

### Node & Runtime
```
□ Node.js version matches .nvmrc or package.json engines field (20.x or 22.x)
□ PM2 is installed and configured to auto-restart on crash
□ Process count matches available CPU cores (pm2 start server.js -i max)
□ PM2 startup hook is set: pm2 startup && pm2 save
```

### Environment Variables

Every variable below must be set, non-empty, and correct for the production environment:

```
CRITICAL — server will not start without these (validated at startup):
□ DATABASE_URL              — mysql://user:pass@host:3306/target_logistics
□ JWT_SECRET                — minimum 64 characters, randomly generated
□ API_KEY_SECRET            — for hashing API keys
□ ENCRYPTION_KEY            — for field encryption
□ NODE_ENV                  — must be 'production'

DHL Express (DHLX):
□ DHL_API_KEY
□ DHL_API_SECRET
□ DHL_ACCOUNT_NUMBER
□ DHL_API_URL               — must be production URL, NOT the /test endpoint
                              Production: https://express.api.dhl.com/mydhlapi/
                              ⚠ Current default in code points to /test — verify this is overridden

OTE/LogesTechs:
□ LOGESTECHS_COMPANY_ID
□ LOGESTECHS_USERNAME
□ LOGESTECHS_PASSWORD
□ LOGESTECHS_SHIPMENT_BASE_URL
□ LOGESTECHS_FULFILLMENT_BASE_URL

CORS & Frontend:
□ CORS_ORIGIN               — must be exact production domain, e.g. https://app.yourdomain.com
                              ⚠ If unset, server defaults to wildcard '*' — security risk
□ FRONTEND_URL              — same as CORS_ORIGIN

Rate Limiting:
□ RATE_LIMIT_ENABLED        — must be 'true' in production
                              ⚠ Default in .env.example is 'false' — easy to miss

Maps:
□ GOOGLE_MAPS_API_KEY       — must be restricted to production domain in GCP Console

Optional but recommended:
□ SENTRY_DSN                — error tracking
□ LOG_LEVEL                 — set to 'info' (not 'debug') in production
□ LOG_TO_FILE               — consider 'true' for persistent logs alongside PM2
```

### What NOT to do
```
□ DHL_API_URL does NOT contain 'test' in its path
□ JWT_SECRET is NOT 'dev-secret-key-change-in-production' or any default value
□ NODE_ENV is NOT 'development'
□ RATE_LIMIT_ENABLED is NOT 'false'
□ CORS_ORIGIN is NOT '*' or unset
```

---

## 2. Database *(every deploy)*

```
□ Run migrations before starting server:
    cd backend && npm run db:migrate:deploy
    (uses prisma migrate deploy — safe for production, does not create new migration files)

□ Verify migration count matches expected:
    npx prisma migrate status
    (all migrations should show as 'Applied')

□ Confirm backup exists before running migrations on existing production data

□ If this is a first deploy: run the seed script to create admin org and user:
    npm run seed
    Then immediately change the seed admin password

□ Verify database connection from the server:
    curl https://your-domain.com/health
    (response should show {"status":"healthy"} — DB check is included)
```

### Database Health Check Response
```json
{
  "status": "healthy",
  "timestamp": "2026-05-02T...",
  "uptime": 123,
  "database": "connected"
}
```
If `database` shows anything other than `"connected"`, do not proceed.

---

## 3. Security *(every deploy)*

```
□ CORS_ORIGIN is set to the exact production domain (not wildcard)
□ RATE_LIMIT_ENABLED=true
□ JWT_SECRET is 64+ characters and randomly generated (not a dictionary word)
□ No .env file is accessible via Nginx (test: curl https://your-domain.com/.env → should 404)
□ Nginx is configured to deny access to hidden files:
      location ~ /\. { deny all; }
□ Uploads directory is not publicly listable (Nginx autoindex off)
□ HTTPS is configured and HTTP redirects to HTTPS
□ Helmet is active (verify response headers include X-Content-Type-Options, X-Frame-Options)
□ Server version header is hidden (nginx: server_tokens off)
□ Debug logging console.log('QUOTE DEBUG') block — verify it is removed from api.controller.js
   or debug mode is gated behind an environment check before shipping
```

### Google Maps API Key (one-time, but verify after each key rotation)
```
□ In GCP Console: API key is restricted to HTTP referrers matching production domain only
□ No unrestricted key is used in the production frontend build
```

---

## 4. Carrier Configuration *(verify after any carrier credential change)*

```
□ DHL/DHLX: Confirm DHL_API_URL points to production endpoint (not /test)
□ DHL/DHLX: Test with a real quote request via the platform — should return live rates
□ OTE: Test with a test shipment creation in sandbox first if credentials changed
□ ARAMEX: Confirm no real users are assigned to Aramex carrier
         (Aramex adapter is a mock — should not be in production use)
□ FedEx: Confirm no users are assigned to FedEx carrier (all methods throw)
□ Confirm CarrierLog table is receiving entries (check after first test booking)
```

### Carrier Assignment Audit
Before every deploy, run this check on the database:
```sql
-- Should return 0 rows until Aramex integration is built:
SELECT COUNT(*) FROM User WHERE JSON_CONTAINS(agentPolicy, '"ARAMEX"', '$.allowedCarriers');
SELECT COUNT(*) FROM Organization WHERE JSON_CONTAINS(allowedCarriers, '"ARAMEX"');

-- Should return 0 rows until FedEx is implemented:
SELECT COUNT(*) FROM User WHERE JSON_CONTAINS(agentPolicy, '"FEDEX"', '$.allowedCarriers');
SELECT COUNT(*) FROM Organization WHERE JSON_CONTAINS(allowedCarriers, '"FEDEX"');
```

---

## 5. Frontend Build *(every deploy)*

```
□ Build succeeds with no errors:
    cd frontend && npm run build
    
□ Build produces no chunks above the 550KB warning threshold
   (check Vite output — large chunks need investigation)
   
□ frontend/.env.local or .env.production contains:
    REACT_APP_API_URL=https://your-domain.com/api
    (must point to production backend, not localhost)

□ Nginx serves the built /dist folder with correct MIME types
□ Nginx fallback to index.html is configured (SPA routing):
    try_files $uri $uri/ /index.html;
    
□ Test at least these routes manually after deploy:
    □ Login page loads
    □ Dashboard loads after login
    □ Create a test shipment (draft)
    □ Public tracking page loads for an existing tracking number
```

---

## 6. Testing *(every deploy)*

```
□ Backend tests pass: npm test --prefix backend
□ Frontend tests pass: npm test --prefix frontend
□ npm audit passes (or all HIGH/CRITICAL findings are acknowledged):
    npm audit --prefix backend
    npm audit --prefix frontend

□ Smoke test after deploy (manual — 5 minutes):
    □ Health check: GET /health → {"status":"healthy","database":"connected"}
    □ Login with admin account
    □ View dashboard — no JS errors in browser console
    □ Load shipments list — data appears
    □ View a tracked shipment — tracking events show
    □ Public tracking: open /track/{trackingNumber} without login
```

---

## 7. Idempotency and Booking Safety *(check after any booking service changes)*

```
□ Idempotency middleware is active for booking routes
□ Idempotency lock DB write is awaited (check idempotency.middleware.js line ~57-64)
   This is a known bug — if not yet fixed, concurrent booking submissions may double-charge
□ Confirm booking attempt deduplication works: submit same booking twice quickly → second returns idempotent response
```

---

## 8. Monitoring & Alerting *(one-time setup, verify on first deploy)*

```
□ PM2 is logging to a file (pm2 logs shows output)
□ If SENTRY_DSN is configured: trigger a test error and confirm it appears in Sentry
□ Server error log location is known to all on-call engineers
□ Nginx access and error logs are accessible
□ Health check endpoint is monitored (uptime service pinging /health every 60s minimum)
□ Database disk usage monitoring is in place (MySQL can fill disk on large CarrierLog tables)
```

---

## 9. Backup & Recovery *(one-time setup)*

```
□ Automated daily MySQL backup is configured
□ Backup restore has been tested (not just backup creation)
□ Uploads directory (/backend/uploads/documents/) is included in backup
□ Recovery time objective is documented: "How long to recover from full server loss?"
□ Database credentials are stored in a password manager, not only in the server .env
```

---

## 10. Post-Deploy Verification *(every deploy — 30 minutes after deploy)*

```
□ Check PM2 process status: pm2 status (all processes should show 'online')
□ Check error logs: pm2 logs --lines 100 (look for any ERROR or FATAL entries)
□ Check CarrierLog table: confirm new entries are being written for any test bookings
□ Check OrganizationLedger: confirm DEBIT entries are created correctly on booking
□ Check server response time: first request after cold start should be < 2s
□ Confirm rate limiting is active: hammer /api/auth/login 25 times → should receive 429
```

---

## Sign-Off

| Check | Owner | Date |
|---|---|---|
| Environment variables verified | | |
| Database migration applied | | |
| Security checklist complete | | |
| Carrier configuration verified | | |
| Frontend build verified | | |
| Smoke tests passed | | |
| Post-deploy monitoring checked | | |

**Deploy approved by:** ___________________  **Date:** ___________________

---

## Rollback Plan

If any post-deploy check fails:

1. **Immediate:** `pm2 restart all` — restarts the process, may resolve transient startup errors
2. **If server error persists:** `pm2 stop all` → redeploy the previous backend build
3. **If migration caused DB issue:**
   - Do not run `prisma migrate reset` on production (drops all data)
   - Write a manual reversal SQL or a new Prisma migration to undo the change
   - Restore from backup only as last resort
4. **If frontend is broken but backend is fine:**
   - Redeploy previous frontend `/dist` folder to Nginx
   - Backend requires no change
5. **Communicate:** Notify the team immediately if a rollback is initiated — do not wait
