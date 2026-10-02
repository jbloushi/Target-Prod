<?php
/**
 * Target Logistics - WooCommerce Production Test Order Seeder
 * 
 * Usage:
 * 1. CLI: wp eval-file seed-orders.php
 * 2. Web: Place in WordPress root or wp-content, access via browser (admin only) or include in functions.php
 */

if ( ! defined( 'ABSPATH' ) ) {
    // If called directly via web browser, bootstrap WordPress
    $wp_load = dirname( __FILE__ ) . '/../../../../wp-load.php';
    if ( ! file_exists( $wp_load ) ) {
        $wp_load = dirname( __FILE__ ) . '/../../../wp-load.php';
    }
    if ( file_exists( $wp_load ) ) {
        require_once $wp_load;
    } else {
        die( 'WordPress environment not found. Please run via WP-CLI: wp eval-file seed-orders.php' );
    }
}

if ( ! class_exists( 'WooCommerce' ) ) {
    die( 'WooCommerce is not active.' );
}

$sample_orders_data = array(
    // 1. Domestic Kuwait Order
    array(
        'customer' => array(
            'first_name' => 'Fahad',
            'last_name'  => 'Al-Otaibi',
            'company'    => 'Al-Otaibi Trading',
            'email'      => 'fahad.otaibi@example.kw',
            'phone'      => '+96599123456',
            'address_1'  => 'Block 3, Street 15, Villa 22',
            'address_2'  => 'Floor 2, Apt 4',
            'city'       => 'Kuwait City',
            'state'      => 'Capital',
            'postcode'   => '13001',
            'country'    => 'KW',
        ),
        'items' => array(
            array(
                'name'     => 'Kuwait Royal Arabian Oud Perfume 100ml',
                'sku'      => 'OUD-ROYAL-100',
                'qty'      => 2,
                'price'    => 28.500,
                'weight'   => 0.75, // kg
            ),
            array(
                'name'     => 'Traditional Incense Burner (Mabkhara)',
                'sku'      => 'MBK-GOLD-01',
                'qty'      => 1,
                'price'    => 12.000,
                'weight'   => 0.50,
            ),
        ),
        'note' => 'Deliver during evening hours after 5 PM.',
    ),

    // 2. Regional GCC - Saudi Arabia (Riyadh)
    array(
        'customer' => array(
            'first_name' => 'Abdullah',
            'last_name'  => 'Al-Ghamdi',
            'company'    => 'Gulf Digital Tech',
            'email'      => 'a.ghamdi@example.sa',
            'phone'      => '+966501234567',
            'address_1'  => 'King Fahd Road, Al Olaya District',
            'address_2'  => 'Al Anoud Tower, Floor 14',
            'city'       => 'Riyadh',
            'state'      => 'Riyadh Province',
            'postcode'   => '12214',
            'country'    => 'SA',
        ),
        'items' => array(
            array(
                'name'     => 'Premium Embroidered Silk Abaya (Black)',
                'sku'      => 'ABY-SILK-BLK',
                'qty'      => 1,
                'price'    => 45.000,
                'weight'   => 0.90,
            ),
            array(
                'name'     => 'Pure Leather Handbag & Wallet Set',
                'sku'      => 'LTH-BAG-SET',
                'qty'      => 1,
                'price'    => 35.000,
                'weight'   => 1.20,
            ),
        ),
        'note' => 'National Address: RYD-8892. Call upon arrival.',
    ),

    // 3. Regional GCC - UAE (Dubai)
    array(
        'customer' => array(
            'first_name' => 'Rashid',
            'last_name'  => 'Al-Maktoum',
            'company'    => 'Emirates Retail LLC',
            'email'      => 'rashid.m@example.ae',
            'phone'      => '+971509876543',
            'address_1'  => 'Sheikh Zayed Road, Trade Centre 2',
            'address_2'  => 'Office 302',
            'city'       => 'Dubai',
            'state'      => 'Dubai',
            'postcode'   => '00000',
            'country'    => 'AE',
        ),
        'items' => array(
            array(
                'name'     => 'Smart Watch Italian Leather Strap 22mm',
                'sku'      => 'WTC-STRAP-BRN',
                'qty'      => 2,
                'price'    => 14.500,
                'weight'   => 0.30,
            ),
            array(
                'name'     => 'Wireless Fast Charging Station 3-in-1',
                'sku'      => 'CHG-3IN1-WHT',
                'qty'      => 1,
                'price'    => 19.000,
                'weight'   => 0.45,
            ),
        ),
        'note' => 'Deliver to front desk reception.',
    ),

    // 4. International - United Kingdom (London)
    array(
        'customer' => array(
            'first_name' => 'Edward',
            'last_name'  => 'Harrison',
            'company'    => 'Harrison Luxury Imports',
            'email'      => 'edward.h@example.co.uk',
            'phone'      => '+447911123456',
            'address_1'  => '14 Margaret Street, Fitzrovia',
            'address_2'  => 'Flat 3B',
            'city'       => 'London',
            'state'      => 'Greater London',
            'postcode'   => 'W1W 8RN',
            'country'    => 'GB',
        ),
        'items' => array(
            array(
                'name'     => 'Exclusive Oriental Amber Eau De Parfum 50ml',
                'sku'      => 'PRF-AMBER-50',
                'qty'      => 1,
                'price'    => 55.000,
                'weight'   => 0.60,
            ),
            array(
                'name'     => 'Handmade Kuwaiti Wooden Jewelry Box',
                'sku'      => 'WOD-BOX-KW',
                'qty'      => 1,
                'price'    => 25.000,
                'weight'   => 1.10,
            ),
        ),
        'note' => 'Please leave with concierge if unavailable.',
    ),
);

$created_orders = array();

echo "==========================================================\n";
echo "🚀 Target Logistics - Generating Production Test Orders...\n";
echo "==========================================================\n\n";

foreach ( $sample_orders_data as $index => $data ) {
    try {
        $order = wc_create_order();
        if ( is_wp_error( $order ) ) {
            echo "❌ Failed to create order " . ( $index + 1 ) . ": " . $order->get_error_message() . "\n";
            continue;
        }

        // Set customer billing & shipping addresses
        $c = $data['customer'];
        $order->set_address( $c, 'billing' );
        $order->set_address( $c, 'shipping' );
        $order->set_customer_note( $data['note'] );

        // Add line items
        foreach ( $data['items'] as $item_data ) {
            $item = new WC_Order_Item_Product();
            $item->set_name( $item_data['name'] );
            $item->set_quantity( $item_data['qty'] );
            $item->set_subtotal( $item_data['price'] * $item_data['qty'] );
            $item->set_total( $item_data['price'] * $item_data['qty'] );

            // Save line item weight as meta for parcel calculations
            $item->add_meta_data( '_weight', $item_data['weight'], true );
            $item->add_meta_data( '_sku', $item_data['sku'], true );

            $order->add_item( $item );
        }

        // Set standard shipping method
        $shipping = new WC_Order_Item_Shipping();
        $shipping->set_method_title( 'Target Express International Delivery' );
        $shipping->set_method_id( 'target_logistics_shipping' );
        $shipping->set_total( 5.000 );
        $order->add_item( $shipping );

        // Calculate totals and set status to Processing (ready for booking)
        $order->calculate_totals();
        $order->set_payment_method( 'knet' );
        $order->set_payment_method_title( 'KNET / Credit Card (Test)' );
        $order->update_status( 'processing', 'Target Logistics sample production order generated for booking test.' );
        $order->save();

        $created_orders[] = $order->get_id();
        echo "✅ Created Order #" . $order->get_order_number() . " (" . $c['city'] . ", " . $c['country'] . ") - Total: " . wc_price( $order->get_total() ) . "\n";

    } catch ( Exception $e ) {
        echo "❌ Exception creating order: " . $e->getMessage() . "\n";
    }
}

echo "\n==========================================================\n";
echo "🎉 SUCCESS: Created " . count( $created_orders ) . " test orders in WooCommerce!\n";
echo "Order IDs: " . implode( ', ', $created_orders ) . "\n";
echo "Go to: WP Admin > WooCommerce > Orders to inspect and book with Target Logistics.\n";
echo "==========================================================\n";
