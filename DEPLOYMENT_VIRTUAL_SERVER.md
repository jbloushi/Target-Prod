# 🚀 3PL Solution Deployment Guide (Existing aaPanel Setup)

This guide provides concise instructions for deploying the **Target-Prod** solution on an existing VPS with **aaPanel** already installed.

## 1. Prerequisites
Ensure the following are installed via the aaPanel web interface:
- **Nginx**
- **Node.js Version Manager** (Install Node v18+ and PM2)
- **MongoDB** (v5.0+)

---

## 2. GitHub Push (Local Setup)
Run these commands in your **local project directory** to push to your private GitHub repo:

```bash
# Initialize git if not already done
git init
git add .
git commit -m "chore: initial production-ready commit"

# Rename branch to main
git branch -M main

# Add your private repo as origin
git remote add origin https://github.com/jbloushi/Target-Prod.git

# Push to GitHub
git push origin main --force
```

---

## 3. Deployment on VPS
Log in to your VPS via SSH and run these bundled commands:

### Create Project Directory and Clone
```bash
# Create directory (Aligned with deploy.sh)
mkdir -p /www/wwwroot/3pl.mawthook.io
cd /www/wwwroot/3pl.mawthook.io

# Clone repo (you'll need a GitHub PAT if it's private)
git clone https://github.com/jbloushi/Target-Prod.git .
```

### 1. Setup Environment (Root Directory)
```bash
# Copy the production template
cp backend/.env.production.example .env

# Edit and fill in your secrets (DHL, Google Maps, JWT, Mongo URI)
nano .env 
```

### 2. Install & Build (One-Click Bundle)
Run this command from the root directory to install and build everything:

```bash
# Make script executable and run
chmod +x deploy.sh && ./deploy.sh
```

> [!NOTE]
> The root directory only contains the deployment scripts. The actual code is in `backend/` and `frontend/`. If you want to run commands manually, you MUST `cd` into those folders first.

### Manual Backend Setup (Optional)
```bash
cd backend
npm install --production
pm2 start ecosystem.config.js --env production
```

### Manual Frontend Setup (Optional)
```bash
cd frontend
npm install
npm run build
```

---

## 4. aaPanel Configuration

### Web Site Setup
1. Go to **Website > Add site**.
2. Enter your domain (e.g., `3pl.yourdomain.com`).
3. Set **Site Category** to `Static`
4. Set **Root Directory** to `/www/wwwroot/3pl.mawthook.io/site` (where the frontend build goes).

### Reverse Proxy for Backend
1. Click on your site in aaPanel.
2. Go to **Reverse Proxy > Add reverse proxy**.
3. **Proxy Name**: `backend`
4. **Target URL**: `http://127.0.0.1:8899` (Matches backend port)
5. **Sent Domain**: `$host`
6. Click **Save**.
7. Click **Conf** for this proxy and change the location block to:
```nginx
location /api {
    proxy_pass http://127.0.0.1:8899;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

### SSL Setup
1. Go to the **SSL** tab for your site.
2. Select **Let's Encrypt** and apply.

---

## 5. Maintenance Commands
```bash
# Tail logs
pm2 logs target-logistics-api

# Check status
pm2 status

# Restart deployment after pushing new code
./deploy.sh
```
