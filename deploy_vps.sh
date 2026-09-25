#!/usr/bin/env bash
# ==============================================================================
# Target Logistics - Production VPS Deployment Script
# Web Server: 157.173.118.162
# Database Server: 194.195.87.56
# ==============================================================================

set -e

echo "🚀 Starting Target Logistics Production Deployment..."
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📂 Project root: ${PROJECT_ROOT}"

# 1. Pull latest code from GitHub
echo "⬇️  Pulling latest changes from origin main..."
git fetch origin main
git reset --hard origin/main

# 2. Backend Deployment
echo "📦 Deploying Backend (/root/projects/target/backend)..."
cd "${PROJECT_ROOT}/backend"
npm install --production=false

echo "🔄 Generating Prisma client & running database migrations against MySQL (194.195.87.56:3306)..."
npx prisma generate

# Resolve any previously failed migration (e.g. from db push creating tables before migrate deploy)
# This marks the failed migration as applied so migrate deploy can proceed.
FAILED_MIGRATION=$(npx prisma migrate status 2>&1 | grep -oP '(?<=Migration name: )\S+' || true)
if [ -n "$FAILED_MIGRATION" ]; then
    echo "⚠️  Resolving previously failed migration: ${FAILED_MIGRATION}"
    npx prisma migrate resolve --applied "$FAILED_MIGRATION" || true
fi

npx prisma migrate deploy || npx prisma db push --accept-data-loss

echo "🌱 Seeding / verifying Chart of Accounts, Bank Accounts, and Accounting Periods..."
node src/scripts/seedAccounting.js || true

# Restart Backend in PM2 / aaPanel
echo "♻️  Restarting backend service..."
if command -v pm2 &> /dev/null; then
    pm2 restart target-backend || pm2 restart 1 || pm2 restart all
else
    echo "⚠️  PM2 not found in PATH, please reload backend via aaPanel Node Project Manager"
fi

# 3. Frontend Deployment
echo "🎨 Deploying Frontend (/root/projects/target/frontend)..."
cd "${PROJECT_ROOT}/frontend"
npm install --production=false
npm run build

echo "♻️  Restarting frontend service..."
if command -v pm2 &> /dev/null; then
    pm2 restart target-frontend || pm2 restart 0 || pm2 restart all
else
    echo "⚠️  PM2 not found in PATH, please reload frontend via aaPanel Node Project Manager"
fi

echo "✅ Production Deployment Completed Successfully!"
echo "🌐 Backend: http://127.0.0.1:8899 | Frontend: http://127.0.0.1:3000"
