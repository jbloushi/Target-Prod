#!/bin/bash

# 🚀 3PLogistics-Solution Deployment Script v3
# Native PM2 deployment — no Docker required.

# --- Configuration ---
PROJECT_ROOT="/www/wwwroot/3pl.mawthook.io"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
NGINX_SITE_DIR="/www/wwwroot/3pl.mawthook.io/site"
PM2_PROCESS_NAME="target-logistics-api"
HEALTH_URL="http://localhost:8899/health"

# --- Colors for output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting Deployment ===${NC}"

# Navigate to project root
cd $PROJECT_ROOT || { echo -e "${RED}Error: Project root $PROJECT_ROOT not found${NC}"; exit 1; }

# 1. Pull latest code
echo -e "${BLUE}1. Pulling latest code from GitHub...${NC}"
git pull origin main || { echo -e "${RED}Error: git pull failed${NC}"; exit 1; }

# 2. Automated Secret Generation (New)
echo -e "${BLUE}2. Ensuring secure secrets (.env)...${NC}"
node scripts/generate-secrets.js || { echo -e "${RED}Error: Secret generation failed${NC}"; exit 1; }

# 3. Update Backend
echo -e "${BLUE}3. Updating Backend dependencies...${NC}"
cd $BACKEND_DIR

# Check for .env in project root or backend directory
if [ ! -f "$PROJECT_ROOT/.env" ] && [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${RED}Error: .env file missing! Expected at $PROJECT_ROOT/.env or $BACKEND_DIR/.env${NC}"
    exit 1
fi

npm install --production || { echo -e "${RED}Error: backend npm install failed${NC}"; exit 1; }

# 4. Prisma Generation (New)
echo -e "${BLUE}4. Generating Prisma Client...${NC}"
npx prisma generate || { echo -e "${RED}Error: Prisma generation failed${NC}"; exit 1; }

# (Optional) Push schema to empty DB if fresh start
# npx prisma db push --accept-data-loss || { echo -e "${RED}Error: Prisma DB push failed${NC}"; exit 1; }

# Restart Backend via PM2
echo -e "${BLUE}3. Restarting Backend via PM2...${NC}"
if pm2 describe $PM2_PROCESS_NAME > /dev/null 2>&1; then
    # Process exists — reload gracefully (zero-downtime restart)
    pm2 reload $PM2_PROCESS_NAME || { echo -e "${RED}Error: PM2 reload failed${NC}"; exit 1; }
else
    # Process doesn't exist — start fresh
    pm2 start ecosystem.config.js --env production || { echo -e "${RED}Error: PM2 start failed${NC}"; exit 1; }
fi

# Wait for backend to start
echo -e "${BLUE}4. Verifying Backend health...${NC}"
sleep 5
HEALTH_CHECK=$(curl -s $HEALTH_URL)
if [[ $HEALTH_CHECK == *"\"status\":\"ok\""* ]]; then
    echo -e "${GREEN}✅ Backend is healthy!${NC}"
else
    echo -e "${RED}❌ Backend health check failed! Response: $HEALTH_CHECK${NC}"
    echo -e "${YELLOW}Check logs: pm2 logs $PM2_PROCESS_NAME${NC}"
fi

# Update Frontend
echo -e "${BLUE}5. Updating Frontend...${NC}"
cd $FRONTEND_DIR
npm install || { echo -e "${RED}Error: frontend npm install failed${NC}"; exit 1; }
npm run build || { echo -e "${RED}Error: frontend build failed${NC}"; exit 1; }

# Copy build to nginx root
echo -e "${BLUE}6. Refreshing Nginx static files...${NC}"
if [ ! -d "$NGINX_SITE_DIR" ]; then
    mkdir -p $NGINX_SITE_DIR
fi
rm -rf $NGINX_SITE_DIR/*
cp -r build/* $NGINX_SITE_DIR/

# Set permissions
chown -R www:www $NGINX_SITE_DIR
chmod -R 755 $NGINX_SITE_DIR

# Reload Nginx
echo -e "${BLUE}7. Reloading Nginx...${NC}"
systemctl reload nginx || {
    echo -e "${YELLOW}systemctl reload failed, trying nginx -s reload...${NC}"
    nginx -s reload || {
        echo -e "${RED}Nginx reload failed! Check: nginx -t${NC}"
    }
}

# Save PM2 process list
pm2 save

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo -e "${BLUE}Final Status:${NC}"
pm2 status
