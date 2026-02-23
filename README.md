# 📦 3PLogistics-Solution 🚢

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](DOCKER.md)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)

**3PLogistics-Solution** is a high-performance, multi-carrier shipment tracking and management system. Designed for scalability and ease of deployment, it streamlines logistics workflows for businesses of all sizes.

---

## ✨ Features

- 🚚 **Multi-Carrier Integration**: Built-in support for [DHL Express API](https://developer.dhl.com/).
- � **Driver Pickup Scanner**: QR/Barcode scanning for optimized field operations.
- 🗺️ **Interactive Mapping**: Real-time visual tracking powered by Google Maps.
- � **Enterprise-Grade Security**: JWT-based authentication and secure role-based access.
- 📊 **Automated Documentation**: Dynamic generation of invoices and labels.
- � **Docker-Ready**: Production-grade containerization for rapid scaling.
- 🔗 **Public Tracking**: Secure, shareable links for end-customer visibility.

---

## 🗺️ Product Roadmap

We are constantly evolving! Here's what's coming next:

- [ ] **Carrier Expansion**: Integration with FedEx, UPS, and Aramex.
- [ ] **AI Route Optimization**: Predictive routing for driver efficiency.
- [ ] **Customer Portal**: Self-service booking for authorized organizations.
- [ ] **Real-time Notifications**: SMS and Email milestone alerts.
- [ ] **Advanced Analytics**: Cost analysis and performance reporting.
- [ ] **Multi-Currency Support**: Automated currency conversion for international bills.

---

## 🚀 Quick Start (Docker)

Get up and running in under 2 minutes:

1. **Clone the repository**
   ```bash
   git clone https://github.com/jbloushi/3PLogstics-Solution.git
   cd 3PLogstics-Solution
   ```

2. **Configure Environment**
   ```bash
   cp .env.docker.example .env
   # Edit .env with your keys (optional for basic test)
   ```

3. **Launch**
   ```bash
   docker-compose up -d
   ```

🔗 Access the API at: `http://localhost:8899/api`
🔗 Access the Health Check: `http://localhost:8899/health`

---

## 🔐 Default Credentials

For a fresh installation or development environment, the following default users are created:

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@demo.com` | `password123` |
| **Staff** | `staff@demo.com` | `password123` |
| **Client** | `client@demo.com` | `password123` |
| **Driver** | `driver@demo.com` | `password123` |

> [!TIP]
> Use these credentials to access different perspectives of the system. The **Client** user is pre-linked to the **Target Logistics Org** with a 1000 KWD balance.

---

## 🛠️ Maintenance & Reset

### Fresh Installation / Seeding
To populate a fresh database with the default users and organization, run:
```bash
cd backend
npm run seed
```

### Reset Admin / Passwords
If you need to reset the system to its default state or recover the admin password, simply run the seed command again. It will ensure all default users exist and reset their passwords to `password123`.

---

## 🚀 Production Deployment (VPS)

### Prerequisites
- Ubuntu 20.04+ or similar Linux distribution
- Node.js 18.x
- MongoDB (standalone or Docker)
- Domain name with DNS configured (optional but recommended)

### Quick Production Setup

#### 1. Generate Secure Credentials
```bash
node scripts/generate-secrets.js
```
This will generate secure JWT secrets and MongoDB passwords. **Save these values!**

#### 2. Configure Backend Environment
```bash
cd backend
cp .env.production.example .env
nano .env
```

Update the following **REQUIRED** values:
- `JWT_SECRET` - Use the generated value from step 1
- `MONGO_URI` - Update password with generated value
- `DHL_API_KEY` & `DHL_API_SECRET` - Your DHL credentials from [developer.dhl.com](https://developer.dhl.com/)
- `GOOGLE_MAPS_API_KEY` - Your key from [Google Cloud Console](https://console.cloud.google.com/)
- `CORS_ORIGIN` - Set to your domain(s): `https://yourdomain.com`

#### 3. Configure Frontend Environment
```bash
cd frontend
cp .env.production.example .env.production
nano .env.production
```

Update:
- `REACT_APP_GOOGLE_MAPS_API_KEY` - Same as backend

#### 4. Deploy with Docker (Recommended)
```bash
# From project root
cp .env.example .env
nano .env  # Update MongoDB password from step 1

docker-compose up -d
```

#### 5. Create Default Users
```bash
docker exec -it target-logistics-api npm run create-default-users
```

#### 6. Verify Deployment
```bash
curl http://localhost:8899/health
# Expected: {"status":"ok","database":"connected"}
```

### 🔄 Updating Production After a Git Pull

If you pull new changes on the VPS and do **not** rebuild/restart, you will still be running the old Docker images (or old frontend build). Use the steps below to ensure the latest code is running:

#### Docker-based deployment
```bash
# From project root on the VPS
git pull

# Rebuild images so new code is baked in
docker-compose build --no-cache

# Restart containers with the rebuilt images
docker-compose up -d --build
```

#### Non-Docker deployment (PM2/Node + Nginx)
```bash
# Backend
git pull
cd backend
npm ci --omit=dev
pm2 restart ecosystem.config.js --env production

# Frontend (build is required for changes to appear)
cd ../frontend
npm ci --omit=dev
npm run build
# Ensure Nginx is serving the latest build output
sudo systemctl reload nginx
```

> [!IMPORTANT]
> React builds are static. If you pull frontend changes but do not rebuild, the UI will not update in production.

### 🔒 Security Checklist

Before going live, ensure you've completed:

- [ ] Changed all default passwords and secrets
- [ ] Set `NODE_ENV=production` in backend/.env
- [ ] Updated `CORS_ORIGIN` to your actual domain (not `*`)
- [ ] Replaced demo DHL API credentials with your own
- [ ] Replaced demo Google Maps API key with your own
- [ ] Configured HTTPS/SSL (use Let's Encrypt with Nginx)
- [ ] Set up firewall rules (UFW recommended)
- [ ] Configured MongoDB authentication
- [ ] Reviewed all `.env` files for sensitive data

### 📖 Detailed Deployment Guide

For step-by-step VPS deployment, Nginx configuration, SSL setup, and production best practices, see:
- [**OPERATIONS.md**](docs/OPERATIONS.md) - Complete deployment guide
- [**AAPANEL_DEPLOYMENT.md**](docs/AAPANEL_DEPLOYMENT.md) - aaPanel VPS update guide
- [**backend/PRODUCTION-USER-SETUP.md**](backend/PRODUCTION-USER-SETUP.md) - User management in production

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React, TailwindCSS |
| **Backend** | Node.js, Express |
| **Database** | MongoDB |
| **DevOps** | Docker, Docker Compose, PM2 |
| **API** | DHL Express API, Google Maps API |

---

## 📖 Documentation

- 🎯 [**Product Vision**](docs/PRODUCT_VISION.md) - Goals, MVP scope & roadmap.
- 🏗️ [**Architecture**](docs/ARCHITECTURE.md) - System design, API routes & data models.
- ⚙️ [**Operations**](docs/OPERATIONS.md) - Deployment, Docker, security & configuration.
- 👨‍💻 [**Development**](docs/DEVELOPMENT.md) - Local setup, testing & code conventions.
- 🤖 [**AI Agent Rules**](docs/AI_AGENT_RULES.md) - Binding rules for AI assistants.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Developed with ❤️ by [jbloushi](https://github.com/jbloushi)**
