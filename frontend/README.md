# Target Logistics - Frontend

A modern React application for shipment tracking with Google Maps integration.

## 🛠️ Technologies
- **React 18** - UI framework
- **Material UI** - Component library
- **Google Maps API** - Interactive maps
- **React Router** - Navigation

## 📱 Features

### Dashboard
- Tabbed navigation (Shipments, Saved Addresses, Parcel Templates)
- Role-based tabs (Client Management, User Management)
- Live stats cards (Total, Pending, In Transit, Delivered)

### Shipment Management
- Create shipments with DHL rate quotes
- Real-time tracking with Google Maps
- Download DHL labels and AWB documents (staff/admin)
- Public tracking link sharing

### Role-Based Access
| Feature | Admin | Staff | Client | Public |
|---------|-------|-------|--------|--------|
| Create Shipments | ✅ | ✅ | ✅ | ❌ |
| View All Shipments | ✅ | ✅ | Own only | ❌ |
| DHL Documents | ✅ | ✅ | ❌ | ❌ |
| Tracking History | ✅ | ✅ | ✅ | ✅ |
| Update Location | ✅ | ✅ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ | ❌ |

## 🔧 Environment Variables

Create a `.env` file in the frontend directory:

```env
# Backend API endpoint
REACT_APP_API_URL=/api

# Google Maps API Key (REQUIRED for address autofill)
# Get your key from: https://console.cloud.google.com/google/maps-apis
# Required APIs: Maps JavaScript API, Places API, Geocoding API
REACT_APP_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Mapbox Token (Optional)
REACT_APP_MAPBOX_TOKEN=your_mapbox_token_here
```

### Production Deployment

For production builds, ensure the environment variables are set:

**Option 1: Docker Build**
```bash
docker build \
  --build-arg REACT_APP_API_URL=/api \
  --build-arg REACT_APP_GOOGLE_MAPS_API_KEY=your_key \
  --build-arg REACT_APP_MAPBOX_TOKEN=your_token \
  -t target-logistics-frontend .
```

**Option 2: Docker Compose**
```bash
# Create a .env file in the root directory
echo "REACT_APP_GOOGLE_MAPS_API_KEY=your_key" >> .env
echo "REACT_APP_MAPBOX_TOKEN=your_token" >> .env

# Build and run
docker-compose up -d
```

**Option 3: GitHub Actions**
Add the following secrets to your repository:
- `REACT_APP_GOOGLE_MAPS_API_KEY`
- `REACT_APP_MAPBOX_TOKEN`

> ⚠️ **Important**: Without the Google Maps API key, address autofill will not work in production!

## 🚀 Quick Start

```bash
npm install
npm start
```

The application runs at http://localhost:3000

## 📁 Project Structure

```
src/
├── components/
│   ├── GoogleMapComponent.js    # Single shipment map
│   ├── GoogleMapAll.js          # Dashboard overview map
│   ├── ShipmentDetails.js       # Shipment detail view
│   └── ShipmentList.js          # Shipment list with map
├── pages/
│   ├── DashboardPage.js         # Main dashboard
│   ├── HomePage.js              # Landing page
│   └── TrackingPage.js          # Public tracking
├── context/
│   ├── AuthContext.js           # Authentication state
│   └── ShipmentContext.js       # Shipment state
└── services/
    └── api.js                   # API client
```