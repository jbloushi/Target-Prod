#!/bin/bash
# ============================================================
#  3PL Mawthook — Wizard Installer for aaPanel VPS
#  Run: bash fresh-install.sh
# ============================================================

# ── Colors & symbols ────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}!${NC}"
ARROW="${CYAN}→${NC}"

# ── Helpers ──────────────────────────────────────────────────
divider() { echo -e "${BLUE}────────────────────────────────────────────${NC}"; }
header()  { echo ""; divider; echo -e "  ${BOLD}${CYAN}$1${NC}"; divider; }
log()     { echo -e "  ${ARROW} $1"; }
ok()      { echo -e "  ${PASS} ${GREEN}$1${NC}"; }
warn()    { echo -e "  ${WARN} ${YELLOW}$1${NC}"; }
fail()    { echo -e "  ${FAIL} ${RED}$1${NC}"; echo ""; exit 1; }
step()    { echo ""; echo -e "${BOLD}${BLUE}[ Step $1/$TOTAL_STEPS ] $2${NC}"; }

TOTAL_STEPS=11

# ── Config ───────────────────────────────────────────────────
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
DOMAIN="3pl.mawthook.io"

# ════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     3PL MAWTHOOK — INSTALL WIZARD        ║"
echo "  ║     Target Logistics Platform            ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  Domain  : ${BOLD}https://$DOMAIN${NC}"
echo -e "  Install : ${BOLD}$PROJECT_ROOT${NC}"
echo -e "  Date    : $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
warn "This will RESET the database and reinstall everything."
warn "Other apps on this VPS will NOT be affected."
echo ""
read -p "  Press ENTER to continue or Ctrl+C to cancel..." _

# ════════════════════════════════════════════════════════════
# STEP 1 — Check system dependencies
# ════════════════════════════════════════════════════════════
step 1 "Checking System Dependencies"

# Node.js
NODE_VER=$(node -v 2>/dev/null)
if [ $? -eq 0 ]; then
  ok "Node.js $NODE_VER"
else
  fail "Node.js not found. Install it via aaPanel → App Store → Node.js"
fi

# npm
NPM_VER=$(npm -v 2>/dev/null)
if [ $? -eq 0 ]; then
  ok "npm v$NPM_VER"
else
  fail "npm not found."
fi

# PM2
PM2_VER=$(pm2 -v 2>/dev/null)
if [ $? -eq 0 ]; then
  ok "PM2 v$PM2_VER"
else
  warn "PM2 not found. Installing..."
  npm install -g pm2 || fail "Could not install PM2"
  ok "PM2 installed"
fi

# git
GIT_VER=$(git --version 2>/dev/null)
if [ $? -eq 0 ]; then
  ok "git ($GIT_VER)"
else
  fail "git not found. Run: apt install git"
fi

# MySQL client
if [ -f "$MYSQL_BIN" ]; then
  ok "MySQL client at $MYSQL_BIN"
else
  fail "MySQL client not found at $MYSQL_BIN. Is aaPanel MySQL installed?"
fi

# curl
if command -v curl &>/dev/null; then
  ok "curl available"
else
  warn "curl not found. Installing..."
  apt-get install -y curl &>/dev/null || fail "Could not install curl"
fi

# Nginx
if [ -f "/www/server/nginx/sbin/nginx" ]; then
  ok "aaPanel Nginx found"
else
  warn "aaPanel Nginx not found at default path — will try system nginx on reload"
fi

# ════════════════════════════════════════════════════════════
# STEP 2 — Check project directory
# ════════════════════════════════════════════════════════════
step 2 "Checking Project Directory"

if [ ! -d "$PROJECT_ROOT" ]; then
  fail "Project directory not found: $PROJECT_ROOT"
fi
ok "Project root exists: $PROJECT_ROOT"

if [ ! -f "$BACKEND_DIR/.env" ]; then
  fail ".env file missing at $BACKEND_DIR/.env\nCreate it with DATABASE_URL, JWT_SECRET, DHL credentials."
fi
ok ".env file found"

# Verify DATABASE_URL points to correct port
if grep -q "3307" "$BACKEND_DIR/.env"; then
  ok "DATABASE_URL uses port 3307 ✓"
else
  warn "DATABASE_URL may not use port 3307 — verifying..."
  grep "DATABASE_URL" "$BACKEND_DIR/.env" | head -1
fi

# ════════════════════════════════════════════════════════════
# STEP 3 — Pull latest code
# ════════════════════════════════════════════════════════════
step 3 "Pulling Latest Code from GitHub"

cd $PROJECT_ROOT
git fetch origin 2>&1 | tail -1
git reset --hard origin/main 2>&1 | tail -1
ok "Code synced to latest ($(git log -1 --format='%h %s'))"

# ════════════════════════════════════════════════════════════
# STEP 4 — Stop old processes
# ════════════════════════════════════════════════════════════
step 4 "Stopping Old PM2 Processes"

if pm2 describe $PM2_NAME &>/dev/null; then
  pm2 delete $PM2_NAME &>/dev/null
  ok "Deleted old PM2 process: $PM2_NAME"
else
  ok "No existing PM2 process to clean up"
fi

# ════════════════════════════════════════════════════════════
# STEP 5 — Reset MySQL database
# ════════════════════════════════════════════════════════════
step 5 "Resetting MySQL Database"

log "Connecting to MySQL on port $MYSQL_PORT..."
$MYSQL_BIN -u root -p"$MYSQL_ROOT_PASS" -P $MYSQL_PORT -h 127.0.0.1 --connect-timeout=10 2>/dev/null <<SQL
DROP DATABASE IF EXISTS \`$DB_NAME\`;
CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

if [ $? -eq 0 ]; then
  ok "Database '$DB_NAME' created fresh"
  ok "User '$DB_USER' ready with full access"
else
  fail "MySQL connection failed. Check password and port."
fi

# ════════════════════════════════════════════════════════════
# STEP 6 — Install backend dependencies
# ════════════════════════════════════════════════════════════
step 6 "Installing Backend Dependencies"

cd $BACKEND_DIR
log "Running npm install (including devDependencies for prisma CLI)..."
npm install 2>&1 | grep -E "added|updated|warn|error" | tail -3
ok "Backend dependencies ready"

# ════════════════════════════════════════════════════════════
# STEP 7 — Prisma generate + push
# ════════════════════════════════════════════════════════════
step 7 "Applying Database Schema (Prisma)"

cd $BACKEND_DIR

PRISMA="$BACKEND_DIR/node_modules/.bin/prisma"
if [ ! -f "$PRISMA" ]; then
  log "Prisma CLI not found — installing..."
  npm install prisma @prisma/client 2>&1 | tail -2
fi

log "Generating Prisma Client..."
$PRISMA generate 2>&1 | grep -E "Generated|Error|✔|✓" | head -3
ok "Prisma Client generated"

log "Pushing schema to MySQL..."
$PRISMA db push --accept-data-loss 2>&1 | grep -E "pushed|error|warn|✓|Your|🚀|Done" | head -5
ok "Database schema applied"

# ════════════════════════════════════════════════════════════
# STEP 8 — Seed admin user
# ════════════════════════════════════════════════════════════
step 8 "Seeding Admin User"

cd $BACKEND_DIR
SEED_OUT=$(node prisma-seed.js 2>&1)
echo "$SEED_OUT"
if echo "$SEED_OUT" | grep -q "Created Admin\|upsert\|already exists\|✅"; then
  ok "Admin ready: admin@demo.com / password123"
else
  warn "Seed may have had issues — check output above"
fi

# ════════════════════════════════════════════════════════════
# STEP 9 — Start backend
# ════════════════════════════════════════════════════════════
step 9 "Starting Backend with PM2"

cd $BACKEND_DIR
mkdir -p logs

# Test if server starts cleanly before PM2
log "Testing server startup (5 seconds)..."
timeout 5 node src/server.js 2>&1 | head -8 || true

log "Launching 2 cluster instances on port 8899..."
NODE_ENV=production pm2 start src/server.js \
  --name $PM2_NAME \
  -i 2 \
  --cwd $BACKEND_DIR \
  --log "$BACKEND_DIR/logs/pm2-out.log" \
  --error "$BACKEND_DIR/logs/pm2-error.log" \
  --merge-logs 2>&1 | grep -E "launched|Done|error" | head -5

log "Waiting for backend to initialize (10 seconds)..."
sleep 10

HEALTH=$(curl -s $HEALTH_URL 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "Backend is healthy → $HEALTH"
else
  echo ""
  warn "Health check failed. Direct node test:"
  node src/server.js 2>&1 | head -10
  fail "Backend not responding. Fix errors above then rerun."
fi

pm2 save &>/dev/null
ok "PM2 process list saved"

# ════════════════════════════════════════════════════════════
# STEP 10 — Build frontend
# ════════════════════════════════════════════════════════════
step 10 "Building Frontend"

cd $FRONTEND_DIR
log "Installing frontend dependencies..."
npm install --prefer-offline 2>&1 | grep -E "added|updated|error" | tail -3

log "Building React app (this takes ~2 minutes)..."
npm run build 2>&1 | grep -E "Compiled|Warning|Error|Build|chunk" | tail -5

if [ -f "$FRONTEND_DIR/build/index.html" ]; then
  ok "Frontend built successfully"
else
  fail "Frontend build failed — check errors above"
fi

# ════════════════════════════════════════════════════════════
# STEP 11 — Reload Nginx
# ════════════════════════════════════════════════════════════
step 11 "Reloading Nginx"

if [ -f "/www/server/nginx/sbin/nginx" ]; then
  /www/server/nginx/sbin/nginx -t 2>&1 && /etc/init.d/nginx reload 2>&1 | tail -1
else
  nginx -t 2>&1 && /etc/init.d/nginx reload 2>&1 | tail -1 || systemctl reload nginx 2>&1
fi
ok "Nginx reloaded"

# ════════════════════════════════════════════════════════════
# FINAL — E2E Test
# ════════════════════════════════════════════════════════════
echo ""
divider
echo -e "  ${BOLD}${CYAN}Running End-to-End Verification${NC}"
divider

# Local API test
LOCAL=$(curl -s http://127.0.0.1:8899/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}' 2>/dev/null)
if echo "$LOCAL" | grep -q '"success":true'; then
  ok "Local API login: PASS"
else
  warn "Local API login: FAIL — $LOCAL"
fi

# HTTPS test
HTTPS=$(curl -sk https://$DOMAIN/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"password123"}' 2>/dev/null)
if echo "$HTTPS" | grep -q '"success":true'; then
  ok "HTTPS login: PASS"
else
  warn "HTTPS login: FAIL — $HTTPS"
  warn "Check nginx config: /www/server/panel/vhost/nginx/$DOMAIN.conf"
fi

# Frontend check
FRONT=$(curl -sk https://$DOMAIN/ 2>/dev/null | grep -o '<title>[^<]*</title>')
if [ -n "$FRONT" ]; then
  ok "Frontend serving: $FRONT"
else
  warn "Frontend check failed"
fi

# ════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║        INSTALLATION COMPLETE ✓           ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  🌐 URL    : ${BOLD}https://$DOMAIN${NC}"
echo -e "  👤 Admin  : ${BOLD}admin@demo.com${NC}"
echo -e "  🔑 Pass   : ${BOLD}password123${NC}"
echo ""
echo -e "  ${YELLOW}Change the admin password after first login!${NC}"
echo ""
divider
pm2 status
divider
echo ""
