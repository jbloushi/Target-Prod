# VPS And aaPanel Deployment Guide

This guide describes a typical VPS deployment for the Target Logistics React frontend and Express backend using aaPanel, Nginx, PM2, Node.js, and MySQL.

Do not commit real production credentials. Keep production `.env` files on the server only.

## Prerequisites

- VPS running Ubuntu/Debian or CentOS.
- aaPanel installed.
- SSH or aaPanel terminal access.
- Domain pointed to the VPS.
- Node.js 20.x or 22.x.
- MySQL 8.0.
- Nginx.
- PM2 Manager or PM2 CLI.

## Database

Create a MySQL database in aaPanel.

Recommended values:

- Database: `target_logistics`
- User: `target_logistics_api`
- Password: strong generated password

The backend `DATABASE_URL` uses this shape with connection pooling parameters:

```env
DATABASE_URL="mysql://target_logistics_api:PASSWORD@127.0.0.1:3306/target_logistics?connection_limit=10&pool_timeout=20&connect_timeout=10"
```

> **Connection Pooling Note**: In PM2 cluster mode with 2 instances, `connection_limit=10` allocates up to 10 connections per process (20 connections total), preventing MySQL connection exhaustion while staying well within the aaPanel MySQL default (`max_connections = 151`).

## Backend Deployment

Upload the repository without `node_modules`, `.npm-cache`, generated PDFs, screenshots, or local `.env` files.

On the server:

```bash
cd /www/wwwroot/target-logistics/backend
npm install
npm run deploy:prepare
```

Create `backend/.env` on the server:

```env
PORT=8899
NODE_ENV=production
DATABASE_URL="mysql://target_logistics_api:PASSWORD@127.0.0.1:3306/target_logistics?connection_limit=10&pool_timeout=20&connect_timeout=10"
JWT_SECRET="replace-with-a-long-random-secret-at-least-64-characters-for-production"
JWT_EXPIRES_IN=7d
API_KEY_SECRET="replace-with-a-32-or-64-char-secret-for-api-key-hashing"
# Generate 64-hex char (32 bytes) key using: openssl rand -hex 32
ENCRYPTION_KEY="replace-with-a-64-char-hex-key-generated-by-openssl"
CORS_ORIGIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com
RATE_LIMIT_ENABLED=true

# Operational & Async Queue Configuration
ASYNC_CARRIER_DISPATCH=true
CHATWOOT_ENABLED=true
CHATWOOT_BASE_URL=https://chatwoot.your-domain.com
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_INBOX_ID=1
CHATWOOT_API_ACCESS_TOKEN=your-chatwoot-platform-token
CHATWOOT_WEBHOOK_SECRET=your-chatwoot-webhook-signing-secret
```

Start with PM2 or aaPanel Node project:

```bash
npm start
```

Backend health check:

```bash
curl http://127.0.0.1:8899/health
```

## Frontend Deployment

Create `frontend/.env.local` on the server before building:

```env
REACT_APP_API_URL=https://your-domain.com/api
```

Build:

```bash
cd /www/wwwroot/target-logistics/frontend
npm install
npm run build
```

Serve `frontend/build` as the Nginx site document root.

## Nginx Routing

Use React fallback routing and proxy `/api` to the backend.

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

location /api/ {
    proxy_pass http://127.0.0.1:8899;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Enable HTTPS and force HTTPS in aaPanel.

## Post-Deploy Verification

- `https://your-domain.com` loads the React app.
- `https://your-domain.com/api` returns the API index/404 response from the backend.
- `https://your-domain.com/track` loads public tracking.
- Login works.
- Shipment creation works for a platform user.
- A client API key can call `/api/v1/quotes` and receives only the assigned service/internal result.
- Internal shipment creation does not call a carrier booking adapter.
- Generated documents are written to `backend/uploads/documents` and are not committed.

## Maintenance Notes

- Run `npm run db:migrate:deploy` on staging and production for every deploy that includes Prisma migrations. Back up the database before applying schema changes.
- **MySQL 8 Migration Recovery**: Because MySQL 8 DDL statements cause implicit commits, if a migration fails partway through:
  1. Inspect status: `npx prisma migrate status`
  2. If a migration is marked failed, verify database state, fix the schema discrepancy, and mark it resolved: `npx prisma migrate resolve --applied <migration_name>` or `--rolled-back <migration_name>`
- Do not use `prisma db push` on production; it bypasses the committed migration history.
- Keep `.env` files outside version control.
- Keep `CORS_ORIGIN` aligned with the deployed frontend domain.
- Rotate `JWT_SECRET` and API keys if credentials are exposed.
