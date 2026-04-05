#!/bin/bash
# ============================================================
# 3PL Mawthook — Fresh Install Script for aaPanel VPS
# Run from: /www/wwwroot/3pl.mawthook.io
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${BLUE}[→] $1${NC}"; }
ok()   { echo -e "${GREEN}[✓] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
fail() { echo -e "${RED}[✗] $1${NC}"; exit 1; }

PROJECT_ROOT="/www/wwwroot/3pl.mawthook.io"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
PM2_NAME="target-logistics-api"
MYSQL_BIN="/www/server/mysql/bin/mysql"
MYSQL_PORT="3307"
MYSQL_ROOT_PASS="NewRoot2026!"
DB_NAME="target_logistics"
DB_USER="tl_api_b75531da"
DB_PASS='TL_5dfaccf76a06b652a15898d2!'
HEALTH_URL="http://127.0.0.1:8899/health"

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  3PL Mawthook — Fresh Install             ${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ── STEP 1: Stop old PM2 processes ──────────────────────────
log "Step 1/9: Stopping old PM2 processes..."
pm2 delete $PM2_NAME 2>/dev/null && ok "PM2 processes deleted" || warn "No PM2 processes to delete"

# ── STEP 2: Pull latest code ─────────────────────────────────
log "Step 2/9: Pulling latest code..."
cd $PROJECT_ROOT
git fetch origin && git reset --hard origin/main || fail "Git pull failed"
ok "Code updated to latest"

# ── STEP 3: Reset MySQL database ────────────────────────────
log "Step 3/9: Resetting MySQL database..."
$MYSQL_BIN -u root -p"$MYSQL_ROOT_PASS" -P $MYSQL_PORT -h 127.0.0.1 2>/dev/null <<SQL
DROP DATABASE IF EXISTS \`$DB_NAME\`;
CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
ok "Database reset and user ready"

# ── STEP 4: Backend dependencies ────────────────────────────
log "Step 4/9: Installing backend dependencies..."
cd $BACKEND_DIR
npm install --prefer-offline 2>&1 | tail -3
npm install mathjs --prefer-offline 2>&1 | tail -1
ok "Backend dependencies installed"

# ── STEP 5: Prisma generate + push ──────────────────────────
log "Step 5/9: Running Prisma schema push..."
./node_modules/.bin/prisma generate 2>&1 | tail -2
./node_modules/.bin/prisma db push --accept-data-loss 2>&1 | tail -3
ok "Database schema applied"

# ── STEP 6: Seed admin user ──────────────────────────────────
log "Step 6/9: Seeding admin user..."
node prisma-seed.js 2>&1
ok "Admin user seeded: admin@demo.com / password123"

# ── STEP 7: Start backend with PM2 ──────────────────────────
log "Step 7/9: Starting backend with PM2..."
NODE_ENV=production pm2 start src/server.js \
  --name $PM2_NAME \
  -i 2 \
  --cwd $BACKEND_DIR
sleep 6

# Health check
HEALTH=$(curl -s $HEALTH_URL 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "Backend healthy: $HEALTH"
else
  fail "Backend health check failed: $HEALTH\nRun: pm2 logs $PM2_NAME"
fi

# ── STEP 8: Build frontend ───────────────────────────────────
log "Step 8/9: Building frontend..."
cd $FRONTEND_DIR
npm install --prefer-offline 2>&1 | tail -3
npm run build 2>&1 | tail -5
ok "Frontend built successfully"

# ── STEP 9: Reload Nginx ─────────────────────────────────────
log "Step 9/9: Reloading Nginx..."
/www/server/nginx/sbin/nginx -t && /etc/init.d/nginx reload && ok "Nginx reloaded"

# Save PM2
pm2 save
ok "PM2 process list saved"

# ── Final test ───────────────────────────────────────────────
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}  Running final checks...${NC}"
echo -e "${BLUE}============================================${NC}"

LOGIN=$(curl -sk https://3pl.mawthook.io/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}' 2>/dev/null)

if echo "$LOGIN" | grep -q '"success":true'; then
  ok "HTTPS Login: SUCCESS ✅"
else
  warn "HTTPS Login returned: $LOGIN"
  warn "Local login test:"
  curl -s http://127.0.0.1:8899/api/auth/login \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@demo.com","password":"password123"}' | head -c 100
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  DONE! Site: https://3pl.mawthook.io      ${NC}"
echo -e "${GREEN}  Admin: admin@demo.com / password123       ${NC}"
echo -e "${GREEN}============================================${NC}"
pm2 status
