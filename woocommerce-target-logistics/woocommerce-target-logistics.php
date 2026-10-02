<?php
/**
 * Plugin Name: Target Logistics Shipping & Pickup for WooCommerce
 * Plugin URI: https://mawthook.io
 * Description: Automated shipment booking, live carrier quoting, and courier pickup scheduling via the Target Logistics Client API.
 * Version: 1.0.0
 * Author: Target Logistics / Mawthook
 * Author URI: https://mawthook.io
 * Text Domain: wc-target-logistics
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * WC tested up to: 9.3
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

// Plugin constants
define( 'WC_TARGET_LOGISTICS_VERSION', '1.0.0' );
define( 'WC_TARGET_LOGISTICS_FILE', __FILE__ );
define( 'WC_TARGET_LOGISTICS_PATH', plugin_dir_path( __FILE__ ) );
define( 'WC_TARGET_LOGISTICS_URL', plugin_dir_url( __FILE__ ) );

/**
 * Declare HPOS (High-Performance Order Storage) Compatibility
 */
add_action( 'before_woocommerce_init', function() {
    if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
    }
} );

/**
 * Check WooCommerce dependency and bootstrap plugin
 */
function wc_target_logistics_init() {
    // Check if WooCommerce is active
    if ( ! class_exists( 'WooCommerce' ) ) {
        add_action( 'admin_notices', 'wc_target_logistics_missing_wc_notice' );
        return;
    }

    // Load translations
    load_plugin_textdomain( 'wc-target-logistics', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );

    // Require classes
    require_once WC_TARGET_LOGISTICS_PATH . 'includes/class-target-logistics-api.php';
    require_once WC_TARGET_LOGISTICS_PATH . 'includes/class-target-logistics-settings.php';
    require_once WC_TARGET_LOGISTICS_PATH . 'includes/class-target-logistics-pickup.php';
    require_once WC_TARGET_LOGISTICS_PATH . 'includes/class-target-logistics-order.php';
    require_once WC_TARGET_LOGISTICS_PATH . 'includes/class-target-logistics-bulk.php';
    require_once WC_TARGET_LOGISTICS_PATH . 'includes/class-target-logistics-tracking.php';
    require_once WC_TARGET_LOGISTICS_PATH . 'includes/class-target-logistics.php';

    // Instantiate orchestrator
    Target_Logistics::instance();
}
add_action( 'plugins_loaded', 'wc_target_logistics_init' );

/**
 * Missing WooCommerce Admin Notice
 */
function wc_target_logistics_missing_wc_notice() {
    ?>
    <div class="notice notice-error is-dismissible">
        <p>
            <strong><?php esc_html_e( 'Target Logistics for WooCommerce', 'wc-target-logistics' ); ?></strong>
            <?php esc_html_e( 'requires WooCommerce to be installed and active.', 'wc-target-logistics' ); ?>
        </p>
    </div>
    <?php
}
