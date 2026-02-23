# 🚀 Target Logistics: aaPanel Deployment Guide (Native — No Docker)

This guide covers deploying the application directly on an aaPanel VPS using **PM2 + local MongoDB + Nginx** — no Docker required.

---

## Architecture

```
aaPanel VPS
├── Nginx (reverse proxy + static files)
│   ├── /             → Frontend build (static)
│   └── /api          → Backend (PM2 on port 8899)
├── PM2 (process manager)
│   └── target-logistics-api (Node.js cluster)
├── MongoDB 7 (system service)
│   └── cargo-tracker database
└── SSL (Let's Encrypt via aaPanel)
```

---

## 🆕 Fresh Installation

### 1. Install Prerequisites

In aaPanel **App Store**, install:
- **Node.js** (v18+ LTS)
- **MongoDB 7** (or install via system package manager)
- **Nginx** (usually pre-installed with aaPanel)

Then install PM2 globally:
```bash
npm install -g pm2
```

### 2. Clone Repository

```bash
cd /www/wwwroot
git clone https://github.com/jbloushi/3PLogstics-Solution.git 3pl.mawthook.io
cd 3pl.mawthook.io
```

### 3. Environment Configuration

Create the `.env` file in the project root:
```bash
cp .env.docker.example .env
nano .env
```

> [!IMPORTANT]
> **Required `.env` values:**
> - `MONGO_URI=mongodb://localhost:27017/cargo-tracker` (local MongoDB, no Docker)
> - `JWT_SECRET` — Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
> - `JWT_EXPIRES_IN=7d`
> - `GOOGLE_MAPS_API_KEY` — Required for tracking/address features
> - `DHL_API_KEY` & `DHL_API_SECRET` — Required for shipping labels
> - `NODE_ENV=production`
> - `PORT=8899`

### 4. Install Dependencies & Start Backend

```bash
# Backend
cd backend
npm install --production

# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 process list for auto-restart on reboot
pm2 save
pm2 startup
```

Verify the API is running:
```bash
curl http://localhost:8899/health
# Expected: {"status":"ok","database":"connected"}
```

### 5. Build & Deploy Frontend

```bash
cd ../frontend
npm install
npm run build

# Copy build to site directory
mkdir -p ../site
cp -r build/* ../site/
```

### 6. Nginx Configuration

In aaPanel → Website → Create Site → `3pl.mawthook.io` (Static site).

Edit Nginx config (Site Settings → Config):
```nginx
location / {
    root /www/wwwroot/3pl.mawthook.io/site;
    try_files $uri $uri/ /index.html;
}

location /api {
    proxy_pass http://localhost:8899;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
}
```

Enable SSL via aaPanel → SSL → Let's Encrypt.

### 7. Initial User Setup

```bash
cd /www/wwwroot/3pl.mawthook.io/backend
node scripts/create-default-users.js
```

---

## 🔄 Updating an Existing Deployment

### Quick Update (Script)

```bash
bash /www/wwwroot/3pl.mawthook.io/deploy.sh
```

### Manual Update

```bash
cd /www/wwwroot/3pl.mawthook.io

# 1. Pull latest code
git pull origin master

# 2. Update backend
cd backend
npm install --production
pm2 reload target-logistics-api

# 3. Update frontend
cd ../frontend
npm install
npm run build
rm -rf ../site/*
cp -r build/* ../site/

# 4. Reload Nginx
systemctl reload nginx
```

---

## 🗄️ Database Management

### MongoDB (Local System Service)

```bash
# Check status
systemctl status mongod

# Connect to shell
mongosh cargo-tracker

# Manual backup
mongodump --db cargo-tracker --out /www/backup/mongodb/$(date +%Y%m%d)

# Restore from backup
mongorestore --db cargo-tracker /www/backup/mongodb/YYYYMMDD/cargo-tracker
```

### Automated Backups

Add to crontab (`crontab -e`):
```bash
# Daily backup at 3am
0 3 * * * mongodump --db cargo-tracker --out /www/backup/mongodb/$(date +\%Y\%m\%d) && find /www/backup/mongodb -mtime +7 -delete
```

---

## 🔧 Troubleshooting

### Check API Health
```bash
curl http://localhost:8899/health
```

### View Logs
```bash
# PM2 logs (real-time)
pm2 logs target-logistics-api

# PM2 log files
cat /www/wwwroot/3pl.mawthook.io/backend/logs/pm2-out.log
cat /www/wwwroot/3pl.mawthook.io/backend/logs/pm2-error.log

# PM2 process status
pm2 status
pm2 monit  # Real-time monitoring
```

### Common Issues

| Issue | Solution |
|---|---|
| `Port 8899 already in use` | `pm2 stop all` then restart, or `lsof -i :8899` to find and kill the process |
| MongoDB connection refused | `systemctl start mongod` and check `MONGO_URI` in `.env` |
| 502 Bad Gateway | Check if PM2 is running: `pm2 status`, check Nginx proxy config |
| Frontend changes not showing | Clear browser cache, verify `site/` directory has latest build |

---

**Last Updated:** 2026-02-18  
**Target:** aaPanel VPS / Native PM2 Deployment (No Docker)
