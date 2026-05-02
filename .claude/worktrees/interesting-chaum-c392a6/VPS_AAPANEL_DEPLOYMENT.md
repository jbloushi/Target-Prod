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

The backend `DATABASE_URL` uses this shape:

```env
DATABASE_URL="mysql://target_logistics_api:PASSWORD@127.0.0.1:3306/target_logistics"
```

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
DATABASE_URL="mysql://target_logistics_api:PASSWORD@127.0.0.1:3306/target_logistics"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com
RATE_LIMIT_ENABLED=true
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
- A client API key can call `/api/v1/quotes` and receives only the assigned service/manual result.
- Manual Shipment creation does not call a carrier booking adapter.
- Generated documents are written to `backend/uploads/documents` and are not committed.

## Maintenance Notes

- Run `npm run db:migrate:deploy` on staging and production for every deploy that includes Prisma migrations. Back up the database before applying schema changes.
- Do not use `prisma db push` on production; it bypasses the committed migration history.
- Keep `.env` files outside version control.
- Keep `CORS_ORIGIN` aligned with the deployed frontend domain.
- Rotate `JWT_SECRET` and API keys if credentials are exposed.
