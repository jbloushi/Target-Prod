#!/bin/bash

# 🔍 VPS Diagnostic Tool for Target Logistics
# Purpose: Identify why Nginx is returning 502 Bad Gateway

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== VPS Diagnostic Started ===${NC}"

# 1. Check Port 8899
echo -e "\n${YELLOW}[1/5] Checking port 8899 (Backend)...${NC}"
if netstat -tuln | grep -q ":8899 "; then
    echo -e "${GREEN}✅ Port 8899 is listening.${NC}"
    netstat -tuln | grep ":8899 "
else
    echo -e "${RED}❌ Port 8899 is NOT listening!${NC}"
fi

# 2. Check Docker
echo -e "\n${YELLOW}[2/5] Checking Docker containers...${NC}"
if command -v docker &> /dev/null; then
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
else
    echo -e "Docker not installed."
fi

# 3. Check PM2
echo -e "\n${YELLOW}[3/5] Checking PM2 processes...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 status
else
    echo -e "PM2 not installed."
fi

# 4. Check Backend Health Local
echo -e "\n${YELLOW}[4/5] Testing local backend health check...${NC}"
HEALTH_CHECK=$(curl -s -m 5 http://localhost:8899/health)
if [[ $HEALTH_CHECK == *"\"status\":\"ok\""* ]]; then
    echo -e "${GREEN}✅ Backend is responding correctly: $HEALTH_CHECK${NC}"
else
    echo -e "${RED}❌ Local health check failed or timed out.${NC}"
    echo -e "Response: $HEALTH_CHECK"
fi

# 5. Check Nginx Error Logs
echo -e "\n${YELLOW}[5/5] Checking last 10 Nginx error logs...${NC}"
if [ -f /var/log/nginx/error.log ]; then
    tail -n 10 /var/log/nginx/error.log
elif [ -f /www/server/nginx/logs/error.log ]; then
    tail -n 10 /www/server/nginx/logs/error.log
else
    echo -e "Nginx error logs not found in standard locations."
fi

echo -e "\n${BLUE}=== Diagnostic Complete ===${NC}"
