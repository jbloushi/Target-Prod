# Target Logistics Shipping & Pickup Plugin for WooCommerce

A robust, enterprise-grade WordPress / WooCommerce plugin integrating the **Target Logistics Client API (v2.2)** for automated shipment creation, carrier quoting, and courier pickup scheduling.

---

## 🌟 Highlights & Capabilities

- **Direct Server-to-Server Client API Integration**: Authenticates securely using `x-api-key`.
- **Dual Mode Support**:
  - **Carrier-backed Mode**: Supports carrier flows (e.g. `DGR`, `DHL`) with dynamic route quoting (`POST /v1/quotes`) to determine valid `serviceCode` (e.g. `P`).
  - **Manual Mode**: Supports internal manual shipments (`carrierCode: MANUAL`) without carrier booking overhead.
- **Warehouse Courier Pickup Scheduling**:
  - Automatically or manually dispatches pickup requests to Target Logistics (`POST /client/pickups`).
  - Supports configurable pickup time offsets (e.g. Next Day at 10:00 AM, Same Day, etc.) and custom dispatch instructions.
  - Live pickup status polling (`GET /client/pickups/:id`).
- **Interactive Order Management**:
  - **Order Meta Box**: Interactive panel on the Order edit page to quote rates, override carrier/service codes, schedule pickups, view tracking numbers, and download shipping labels (`labelUrl`).
  - **Single & Bulk Booking**: Book single orders directly or process dozens of orders simultaneously via the WooCommerce Orders bulk actions menu.
  - **Status Synchronization**: Refresh tracking and pickup statuses on-demand directly from the API.
  - **Order Automation**: Optional trigger to automatically book shipments when orders transition to `Processing` or `Completed`.
- **Customer Facing Experience**:
  - Displays carrier name, tracking number, and tracking button on the "Order Received" (Thank you) page and "My Account > View Order".
  - Automatically injects shipment tracking details into customer transactional emails (Completed Order, Invoice).
  - Shortcode `[target_logistics_track]` for an embeddable tracking form on any public page.
- **Modern WooCommerce Architecture**:
  - Full compatibility with **HPOS** (High-Performance Order Storage / Custom Order Tables) and Classic CPT orders.
  - WordPress HTTP API with timeouts, SSL verification, idempotency keys, and WooCommerce debug logging.

---

## 📁 Directory Structure

```
woocommerce-target-logistics/
├── woocommerce-target-logistics.php     # Main plugin bootstrap & HPOS declaration
├── readme.txt                          # Standard WordPress plugin readme
├── README.md                           # Documentation & integration guide
├── includes/
│   ├── class-target-logistics.php      # Main orchestrator singleton
│   ├── class-target-logistics-api.php  # HTTP API client for /v1 and /client endpoints
│   ├── class-target-logistics-settings.php # WC Integration settings screen & connection tester
│   ├── class-target-logistics-pickup.php   # Order mapper, quote handler, shipment & pickup booking engine
│   ├── class-target-logistics-order.php    # Single order meta box & AJAX actions
│   ├── class-target-logistics-bulk.php     # Orders list table column & bulk booking handler
│   └── class-target-logistics-tracking.php # Customer account & email tracking output + shortcode
└── assets/
    ├── css/
    │   └── admin.css                   # Admin UI styles, status badges & cards
    └── js/
        └── admin.js                    # Admin AJAX handlers (Test Connection, Quotes, Booking)
```

---

## 🚀 Installation

1. Copy or upload the `woocommerce-target-logistics` folder to your WordPress installation:
   ```
   wp-content/plugins/woocommerce-target-logistics/
   ```
   *Or install the `woocommerce-target-logistics.zip` file directly from **Plugins > Add New > Upload Plugin**.*
2. Activate the plugin in **Plugins > Installed Plugins**.
3. Navigate to **WooCommerce > Settings > Integration > Target Logistics** (or **WooCommerce > Target Logistics** in the admin sidebar).

---

## ⚙️ Configuration Guide

### 1. Client API Connection
- **Environment**: Choose **Production** (`https://3pl-api.mawthook.io/api`), **Local Development** (`http://localhost:8899/api`), or **Custom Base URL**.
- **API Key (`x-api-key`)**: Enter the API key generated in your Target Logistics platform settings.
- **Test Connection**: Click the **Test API Connection** button to verify network connectivity and key validity immediately.

### 2. Shipper / Warehouse Pickup Address
Configure the warehouse origin where couriers will arrive to pick up parcels:
- Company Name & Contact Person
- International Phone Number & Country Prefix (e.g. `+965`)
- Country Code (e.g. `KW`, `AE`, `SA`)
- City, Postal Code, and Street Lines

### 3. Shipping Defaults & Carrier Logic
- **Default Carrier Code**: e.g. `DGR`, `DHL`, or `MANUAL`.
- **Default Service Code**: e.g. `P` (Express Worldwide).
- **Auto-Quote Before Booking**: When enabled, the plugin calls `POST /v1/quotes` before booking to automatically pick the service code returned by the carrier for the specific origin-destination route.
- **Incoterm**: `DAP` (default), `DDP`, `EXW`, etc.
- **Harmonized Tariff (HS) Code**: e.g. `610910` (used for customs declarations).

### 4. Pickup Request Configuration
- **Enable Pickup Request**: Toggle courier pickup scheduling.
- **Auto-Schedule Pickup on Booking**: When enabled, automatically creates a pickup request (`POST /client/pickups`) when the shipment is booked.
- **Default Pickup Date/Time**: Next Day at 10:00 AM, Next Day at 02:00 PM, Same Day at 04:00 PM, or 2 Days later.
- **Pickup Instructions**: Special notes for the courier (e.g., "Warehouse Bay 3, call contact on arrival").

### 5. Packaging Defaults
- Default parcel weight (kg) and dimensions (cm) used as fallback if products do not have weight or dimensions configured in WooCommerce.
- Packaging Strategy: Single package for entire order, or individual parcel per line item.

### 6. Order Automation
- **Auto-Book on Order Status**: Automatically book when order status becomes `Processing` or `Completed` (or keep as `Disabled` for manual booking only).
- **Change Status after Booking**: Optionally mark order as `Completed` once booked.

---

## 📦 How to Use

### Method A: Single Order Booking (Meta Box)
1. Open any order in **WooCommerce > Orders**.
2. Look at the **Target Logistics — Shipment & Pickup Booking** meta box in the sidebar:
   - Preview the destination route and items.
   - Click **Get Available Quotes** to view live carrier services and prices.
   - Adjust the Carrier, Service, or Pickup timing if desired.
   - Click **Book Shipment & Schedule Pickup**.
3. Once booked:
   - The tracking number, carrier badge, and pickup request ID are displayed.
   - Click **Download / Print Label** to open the courier label PDF.
   - Click **Refresh Status** anytime to update the tracking and pickup status.

### Method B: Bulk Booking from Orders List
1. Go to **WooCommerce > Orders**.
2. Select the checkboxes for orders you wish to book.
3. In the Bulk Actions dropdown, select **Target Logistics: Book Shipment & Pickup** and click **Apply**.
4. The system will process each order, create the shipments and pickups, and report how many orders succeeded or failed.

### Method C: Public Tracking Shortcode
Add the shortcode `[target_logistics_track]` to any WordPress page or blog post to provide customers with a self-service package tracking form.

---

## 🔗 Target Logistics API Endpoints Used

| Action | Endpoint | Description |
|---|---|---|
| Address Check | `GET /v1/addresses` | Verifies API key connectivity |
| Carrier Quotes | `POST /v1/quotes` | Requests live available rates & service codes for the route |
| Create Shipment | `POST /v1/shipments` | Creates carrier shipment (`DGR`, `DHL`) or `MANUAL` draft |
| Tracking Status | `GET /v1/tracking/:trackingNumber` | Retrieves latest internal/carrier tracking events |
| Create Pickup | `POST /client/pickups` | Dispatches warehouse courier pickup request |
| Pickup Status | `GET /client/pickups/:id` | Checks pickup approval and assigned driver/shipment |
| Unified Tracking | `GET /client/shipments/:id/tracking` | Aggregated internal and carrier tracking timeline |
