#!/bin/bash

# 🛠️ Target Logistics: Port Conflict Resolver
# Purpose: Stop PM2 and switch to Docker for the backend.

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Resolving Deployment Conflict ===${NC}"

# 1. Stop PM2 process if it exists
if command -v pm2 &> /dev/null; then
    echo -e "Checking for PM2 process '3pl-backend'..."
    if pm2 list | grep -q "3pl-backend"; then
        echo -e "${YELLOW}Stopping PM2 3pl-backend...${NC}"
        pm2 stop 3pl-backend
        pm2 delete 3pl-backend
        pm2 save
    else
        echo -e "PM2 process '3pl-backend' not found. Good."
    fi
fi

# 2. Re-deploy with Docker
echo -e "\n${BLUE}Ensuring Docker containers are running...${NC}"
cd /www/wwwroot/3pl.mawthook.io
docker-compose up -d --build backend

# 3. Verify
echo -e "\n${YELLOW}Checking port 8899...${NC}"
if netstat -tuln | grep -q ":8899 "; then
    echo -e "${GREEN}✅ Port 8899 is now active via Docker.${NC}"
else
    echo -e "${RED}❌ Port 8899 is still NOT active. Check 'docker logs target-logistics-api'${NC}"
fi

# 4. Reload Nginx
echo -e "\n${BLUE}Reloading Nginx...${NC}"
systemctl reload nginx

echo -e "\n${GREEN}=== Conflict Resolved! Please test the API now. ===${NC}"
