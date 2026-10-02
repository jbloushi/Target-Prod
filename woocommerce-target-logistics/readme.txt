=== Target Logistics Shipping & Pickup for WooCommerce ===
Contributors: mawthook, targetlogistics
Tags: woocommerce, shipping, pickup, tracking, logistics, carrier, 3pl, dhl
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
WC requires at least: 5.0
WC tested up to: 9.3
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automated shipment booking, live carrier rates, and warehouse courier pickup scheduling via Target Logistics Client API.

== Description ==

**Target Logistics Shipping & Pickup for WooCommerce** connects your WooCommerce online store directly with Target Logistics 3PL Client API.

### Key Features

* **Seamless API Connection**: Simply paste your `x-api-key` and test your connection instantly.
* **Carrier & Manual Shipment Support**: Compatible with both Carrier-backed accounts (DGR, DHL, etc.) and Internal/Manual accounts.
* **Auto-Quoting**: Dynamically requests live carrier quotes (`POST /v1/quotes`) to select available carrier service codes (e.g. `P`) for the specific route.
* **Warehouse Pickup Scheduling**: Automatically or manually dispatch courier pickup requests (`POST /client/pickups`) directly to Target Logistics dispatchers.
* **Interactive Order Meta Box**: Review sender, recipient, parcels, carrier, and pickup schedule directly from the single order admin screen.
* **Live Status Refresh**: Check real-time tracking events and pickup confirmation directly within WooCommerce.
* **Bulk Order Booking**: Select multiple orders from the WooCommerce Orders list and book them in one click.
* **Customer Tracking Experience**: Automatic tracking badges and links on Customer Account, "Order Received" page, and transactional emails.
* **HPOS Ready**: Built from the ground up to support High-Performance Order Storage (HPOS) and legacy custom post types.

== Installation ==

1. Upload the `woocommerce-target-logistics` folder to your `/wp-content/plugins/` directory, or upload the `.zip` archive via **Plugins > Add New > Upload Plugin**.
2. Activate the plugin through the **Plugins** menu in WordPress.
3. Go to **WooCommerce > Settings > Integration > Target Logistics** (or click **WooCommerce > Target Logistics** in your admin menu).
4. Enter your Client API Key and configure your warehouse sender address.
5. Click **Test API Connection** to verify your setup.

== Frequently Asked Questions ==

= Where do I find my Client API Key? =
Log in to your Target Logistics platform account and navigate to **Settings > API Keys** to generate or view your key.

= Does this support High-Performance Order Storage (HPOS)? =
Yes! The plugin fully declares and supports WooCommerce Custom Order Tables (HPOS).

== Screenshots ==

1. Target Logistics Settings Screen with API Connection Tester.
2. Single Order Meta Box showing booked tracking number, carrier label, and pickup status.
3. WooCommerce Orders List with Target Logistics tracking column.

== Changelog ==

= 1.0.0 =
* Initial release with support for shipments, carrier quotes, warehouse pickup requests, and unified tracking.
