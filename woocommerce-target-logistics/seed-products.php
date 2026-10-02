<?php
/**
 * Target Logistics - WooCommerce Production Test Product Seeder
 * 
 * Usage:
 * 1. CLI: wp eval-file seed-products.php
 * 2. Web: Run via browser (admin only) or include in functions.php
 */

if ( ! defined( 'ABSPATH' ) ) {
    $wp_load = dirname( __FILE__ ) . '/../../../../wp-load.php';
    if ( ! file_exists( $wp_load ) ) {
        $wp_load = dirname( __FILE__ ) . '/../../../wp-load.php';
    }
    if ( file_exists( $wp_load ) ) {
        require_once $wp_load;
    } else {
        die( 'WordPress environment not found. Please run via WP-CLI: wp eval-file seed-products.php' );
    }
}

if ( ! class_exists( 'WooCommerce' ) ) {
    die( 'WooCommerce is not active.' );
}

$sample_products = array(
    array(
        'name'           => 'Kuwait Royal Arabian Oud Perfume 100ml',
        'sku'            => 'OUD-ROYAL-100',
        'price'          => 28.500,
        'weight'         => 0.75, // kg
        'length'         => 12,   // cm
        'width'          => 8,    // cm
        'height'         => 18,   // cm
        'stock'          => 50,
        'short_desc'     => 'Luxurious concentrated oriental fragrance with notes of aged agarwood and Damascus rose.',
        'desc'           => 'Authentic Kuwaiti blended Eau De Parfum. 100ml spray bottle encased in presentation gift box. Class 3 UN1266 compliant.',
        'category'       => 'Fragrances',
        'hs_code'        => '330300',
        'origin_country' => 'KW',
    ),
    array(
        'name'           => 'Traditional Incense Burner (Mabkhara)',
        'sku'            => 'MBK-GOLD-01',
        'price'          => 12.000,
        'weight'         => 0.50,
        'length'         => 15,
        'width'          => 15,
        'height'         => 22,
        'stock'          => 35,
        'short_desc'     => 'Hand-carved gold-accented incense burner for Bukhoor and Oud chips.',
        'desc'           => 'Traditional Middle Eastern wooden and brass incense burner. Heat resistant ceramic core.',
        'category'       => 'Home & Living',
        'hs_code'        => '741810',
        'origin_country' => 'KW',
    ),
    array(
        'name'           => 'Premium Embroidered Silk Abaya (Black)',
        'sku'            => 'ABY-SILK-BLK',
        'price'          => 45.000,
        'weight'         => 0.90,
        'length'         => 35,
        'width'          => 28,
        'height'         => 6,
        'stock'          => 25,
        'short_desc'     => 'Hand-embroidered luxury Emirati crepe and Japanese silk evening abaya.',
        'desc'           => 'Elegant flowing black abaya with crystal cuff embroidery and matching chiffon Sheila scarf.',
        'category'       => 'Fashion',
        'hs_code'        => '620449',
        'origin_country' => 'AE',
    ),
    array(
        'name'           => 'Pure Italian Leather Handbag & Wallet Set',
        'sku'            => 'LTH-BAG-SET',
        'price'          => 35.000,
        'weight'         => 1.20,
        'length'         => 32,
        'width'          => 16,
        'height'         => 24,
        'stock'          => 20,
        'short_desc'     => 'Handcrafted genuine calfskin handbag with matching RFID cardholder.',
        'desc'           => 'Premium grain leather handbag with gold-tone hardware. Includes detachable shoulder strap and matching wallet.',
        'category'       => 'Bags & Accessories',
        'hs_code'        => '420221',
        'origin_country' => 'IT',
    ),
    array(
        'name'           => 'Smart Watch Italian Leather Strap 22mm',
        'sku'            => 'WTC-STRAP-BRN',
        'price'          => 14.500,
        'weight'         => 0.30,
        'length'         => 20,
        'width'          => 6,
        'height'         => 2,
        'stock'          => 100,
        'short_desc'     => 'Hand-stitched vintage cognac brown leather strap with quick-release spring bars.',
        'desc'           => 'Compatible with standard 22mm smartwatches including Apple Watch, Galaxy Watch, and Garmin.',
        'category'       => 'Electronics',
        'hs_code'        => '911390',
        'origin_country' => 'IT',
    ),
    array(
        'name'           => 'Wireless Fast Charging Station 3-in-1',
        'sku'            => 'CHG-3IN1-WHT',
        'price'          => 19.000,
        'weight'         => 0.45,
        'length'         => 18,
        'width'          => 12,
        'height'         => 5,
        'stock'          => 40,
        'short_desc'     => '15W Qi-certified magnetic fast charger for smartphone, smartwatch, and earbuds.',
        'desc'           => 'Foldable aluminum multi-device charging stand. Includes USB-C braided cable and 20W PD power adapter.',
        'category'       => 'Electronics',
        'hs_code'        => '850440',
        'origin_country' => 'CN',
    ),
    array(
        'name'           => 'Exclusive Oriental Amber Eau De Parfum 50ml',
        'sku'            => 'PRF-AMBER-50',
        'price'          => 55.000,
        'weight'         => 0.60,
        'length'         => 10,
        'width'          => 7,
        'height'         => 15,
        'stock'          => 30,
        'short_desc'     => 'Intense amber and warm vanilla French-Kuwaiti niche fragrance.',
        'desc'           => 'Niche extrait de parfum crafted with natural ambergris, tonka bean, and bourbon vanilla. 50ml flacon.',
        'category'       => 'Fragrances',
        'hs_code'        => '330300',
        'origin_country' => 'KW',
    ),
    array(
        'name'           => 'Handmade Kuwaiti Wooden Jewelry Box',
        'sku'            => 'WOD-BOX-KW',
        'price'          => 25.000,
        'weight'         => 1.10,
        'length'         => 25,
        'width'          => 18,
        'height'         => 10,
        'stock'          => 15,
        'short_desc'     => 'Artisanal teak wood keepsake and jewelry box with mother-of-pearl inlay.',
        'desc'           => 'Authentic hand-carved heritage dhow-wood keepsake box lined with royal burgundy velvet.',
        'category'       => 'Handcrafts',
        'hs_code'        => '442090',
        'origin_country' => 'KW',
    ),
);

echo "==========================================================\n";
echo "📦 Target Logistics - Seeding Production Sample Products...\n";
echo "==========================================================\n\n";

$created_count = 0;

foreach ( $sample_products as $p ) {
    // Check if product already exists by SKU
    $existing_id = wc_get_product_id_by_sku( $p['sku'] );
    if ( $existing_id ) {
        echo "ℹ️ Product already exists (SKU: {$p['sku']}) - ID: {$existing_id}. Updating...\n";
        $product = wc_get_product( $existing_id );
    } else {
        $product = new WC_Product_Simple();
    }

    $product->set_name( $p['name'] );
    $product->set_sku( $p['sku'] );
    $product->set_regular_price( $p['price'] );
    $product->set_price( $p['price'] );
    $product->set_short_description( $p['short_desc'] );
    $product->set_description( $p['desc'] );

    // Physical shipping attributes (crucial for Target Logistics parcel calculation)
    $product->set_weight( $p['weight'] );
    $product->set_length( $p['length'] );
    $product->set_width( $p['width'] );
    $product->set_height( $p['height'] );

    // Inventory
    $product->set_manage_stock( true );
    $product->set_stock_quantity( $p['stock'] );
    $product->set_stock_status( 'instock' );

    // Customs & Logistics Metadata
    $product->update_meta_data( '_hs_code', $p['hs_code'] );
    $product->update_meta_data( '_country_of_origin', $p['origin_country'] );

    // Assign category
    $term = term_exists( $p['category'], 'product_cat' );
    if ( ! $term ) {
        $term = wp_insert_term( $p['category'], 'product_cat' );
    }
    if ( ! is_wp_error( $term ) && isset( $term['term_id'] ) ) {
        $product->set_category_ids( array( $term['term_id'] ) );
    }

    $product_id = $product->save();

    if ( $product_id ) {
        $created_count++;
        echo "✅ Saved Product #{$product_id} [{$p['sku']}] {$p['name']} - {$p['weight']} KG - " . wc_price( $p['price'] ) . "\n";
    } else {
        echo "❌ Failed to save product: {$p['name']}\n";
    }
}

echo "\n==========================================================\n";
echo "🎉 SUCCESS: Seeded {$created_count} production products with weights, dimensions & HS codes!\n";
echo "Go to: WP Admin > Products to view and place test orders.\n";
echo "==========================================================\n";
