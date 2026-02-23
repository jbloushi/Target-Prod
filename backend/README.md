# Target Logistics - Backend API

A full-featured Node.js API for shipment tracking with DHL Express integration.

## 🛠️ Technologies
- **Node.js** + **Express** - REST API framework
- **MongoDB** + **Mongoose** - Database
- **DHL Express API** - Shipping and label generation
- **Google Maps API** - Geocoding and address validation

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT token |

### Shipments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shipments` | Get all shipments (auth required) |
| POST | `/api/shipments` | Create new shipment with DHL |
| GET | `/api/shipments/:tracking` | Get shipment details |
| PATCH | `/api/shipments/:tracking/status` | Update status |
| GET | `/api/shipments/:tracking/history` | Get tracking history |
| POST | `/api/shipments/quote` | Get DHL rate quotes |
| GET | `/api/shipments/public/:tracking` | Public tracking (no auth) |

### Geocoding
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/geocode/autocomplete` | Address suggestions |
| GET | `/api/geocode/details/:placeId` | Place details |
| POST | `/api/geocode/validate` | Validate address |

## 📊 Shipment Model

```javascript
{
  trackingNumber: String,
  origin: { address, coordinates, city, countryCode, phone, email },
  destination: { address, coordinates, city, countryCode, phone, email },
  currentLocation: { address, coordinates },
  status: 'pending' | 'in_transit' | 'delivered' | 'exception',
  items: [{ description, quantity, weight, dimensions, declaredValue }],
  history: [{ location, status, timestamp }],
  labelUrl: String,        // DHL shipping label
  awbUrl: String,          // DHL air waybill
  dhlConfirmed: Boolean,   // DHL API success flag
  costPrice: Number,       // Original DHL price
  markup: Number,          // Admin markup percentage
  price: Number            // Final price to customer
}
```

## 🔧 Environment Variables

```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_secret
DHL_API_KEY=your_dhl_key
DHL_API_SECRET=your_dhl_secret
GOOGLE_MAPS_API_KEY=your_google_key
```

## 🚀 Quick Start

```bash
npm install
npm run dev
```

## 🧪 Testing

```bash
node comprehensive-api-test.js
```

Runs 14 automated tests covering auth, shipments, DHL, and geocoding.