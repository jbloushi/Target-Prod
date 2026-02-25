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

# Clone repo (you'll need a GitHub PAT if it's private)
git clone https://github.com/jbloushi/Target-Prod.git .

# NOTE: The 'site' folder does not exist yet! 
# It is automatically created when you run the build script below.
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
If you prefer not to use `deploy.sh`, run these sequentially:
```bash
# 1. Build the frontend code
cd frontend
npm install
npm run build   # This creates a 'build' folder inside frontend/

# 2. Create the 'site' directory for Nginx
mkdir -p /www/wwwroot/3pl.mawthook.io/site

# 3. Copy the production files to the site directory
cp -r build/* /www/wwwroot/3pl.mawthook.io/site/
```

---

## 4. aaPanel Configuration

### Web Site Setup
1. Go to **Website > Add site**.
2. Enter your domain (e.g., `3pl.yourdomain.com`).
3. Set **Site Category** to `Static`
4. Set **Root Directory** to `/www/wwwroot/3pl.mawthook.io/site` (where the frontend build goes).

### Full Nginx Configuration
Use this optimized configuration in your aaPanel site settings (**Website > Config**):

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name 3pl.mawthook.io www.3pl.mawthook.io;

    root /www/wwwroot/3pl.mawthook.io/site;
    index index.html;

    # SSL (Managed by Let's Encrypt in aaPanel)
    ssl_certificate     /www/server/panel/vhost/cert/3pl.mawthook.io/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/3pl.mawthook.io/privkey.pem;

    # Performance: gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # API Backend Proxy
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8899;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Static Assets Cache
    location ^~ /static/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # SPA Routing
    location / {
        try_files $uri $uri/ /index.html;
    }
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

---

## 6. FAQ / Troubleshooting

### "There is no 'site' folder"
The `site` folder is the **production bundle** created by the React build process. It is created automatically when you run `./deploy.sh`. Once the script finishes, you will see it at `/www/wwwroot/3pl.mawthook.io/site`.

### "npm run build fails in root"
The root directory does not have a build script. You must either:
1. Run `./deploy.sh` (recommended)
2. Or `cd frontend` then run `npm run build`.
```
