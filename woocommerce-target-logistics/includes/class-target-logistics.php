<?php
/**
 * Target Logistics Main Orchestrator Class
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class Target_Logistics {

    /**
     * Singleton instance
     *
     * @var Target_Logistics
     */
    protected static $instance = null;

    /**
     * Order Manager
     *
     * @var Target_Logistics_Order_Manager
     */
    public $order_manager;

    /**
     * Bulk Actions
     *
     * @var Target_Logistics_Bulk_Actions
     */
    public $bulk_actions;

    /**
     * Customer Tracking
     *
     * @var Target_Logistics_Tracking
     */
    public $tracking;

    /**
     * Get singleton instance
     *
     * @return Target_Logistics
     */
    public static function instance() {
        if ( is_null( self::$instance ) ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    public function __construct() {
        $this->init_hooks();
        $this->init_components();
    }

    /**
     * Initialize WordPress / WooCommerce hooks
     */
    private function init_hooks() {
        // Register Integration in WooCommerce Settings
        add_filter( 'woocommerce_integrations', array( $this, 'add_integration' ) );

        // Register Native Shipping Method for Shipping Zones
        add_filter( 'woocommerce_shipping_methods', array( $this, 'add_shipping_method' ) );

        // Enqueue Admin Scripts & Styles
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_assets' ) );

        // Action links in plugins table
        add_filter( 'plugin_action_links_' . plugin_basename( WC_TARGET_LOGISTICS_FILE ), array( $this, 'add_plugin_action_links' ) );

        // Admin menu shortcut under WooCommerce
        add_action( 'admin_menu', array( $this, 'add_admin_menu_shortcut' ), 60 );

        // AJAX handlers for settings screen
        add_action( 'wp_ajax_target_logistics_test_connection', array( $this, 'ajax_test_connection' ) );
        add_action( 'wp_ajax_target_logistics_seed_products', array( $this, 'ajax_seed_products' ) );
        add_action( 'wp_ajax_target_logistics_seed_orders', array( $this, 'ajax_seed_orders' ) );
        add_action( 'wp_ajax_target_logistics_clear_logs', array( $this, 'ajax_clear_logs' ) );

        // Direct action handler for sample products & orders seeding
        add_action( 'admin_init', array( $this, 'handle_direct_seeding' ) );

        // Admin notices
        add_action( 'admin_notices', array( $this, 'render_admin_notices' ) );
    }

    /**
     * Initialize Subcomponents
     */
    private function init_components() {
        $this->order_manager = new Target_Logistics_Order_Manager();
        $this->bulk_actions  = new Target_Logistics_Bulk_Actions();
        $this->tracking      = new Target_Logistics_Tracking();
    }

    /**
     * Add Integration to WooCommerce
     *
     * @param array $integrations
     * @return array
     */
    public function add_integration( $integrations ) {
        $integrations[] = 'Target_Logistics_Settings';
        return $integrations;
    }

    /**
     * Add Native Shipping Method to WooCommerce
     *
     * @param array $methods
     * @return array
     */
    public function add_shipping_method( $methods ) {
        $methods['target_logistics_shipping'] = 'WC_Target_Logistics_Shipping_Method';
        return $methods;
    }

    /**
     * Add Action Links on Plugins page
     *
     * @param array $links
     * @return array
     */
    public function add_plugin_action_links( $links ) {
        $settings_url = admin_url( 'admin.php?page=wc-settings&tab=integration&section=target_logistics' );
        $custom_links = array(
            '<a href="' . esc_url( $settings_url ) . '">' . esc_html__( 'Settings', 'wc-target-logistics' ) . '</a>',
        );
        return array_merge( $custom_links, $links );
    }

    /**
     * Add Admin Menu Shortcut under WooCommerce
     */
    public function add_admin_menu_shortcut() {
        add_submenu_page(
            'woocommerce',
            __( 'Target Logistics', 'wc-target-logistics' ),
            __( 'Target Logistics', 'wc-target-logistics' ),
            'manage_woocommerce',
            'wc-settings&tab=integration&section=target_logistics'
        );
    }

    /**
     * AJAX handler for connection test
     */
    public function ajax_test_connection() {
        $settings = new Target_Logistics_Settings();
        $settings->ajax_test_connection();
    }

    /**
     * AJAX handler for seed products
     */
    public function ajax_seed_products() {
        $settings = new Target_Logistics_Settings();
        $settings->ajax_seed_products();
    }

    /**
     * AJAX handler for seed orders
     */
    public function ajax_seed_orders() {
        $settings = new Target_Logistics_Settings();
        $settings->ajax_seed_orders();
    }

    /**
     * AJAX handler for clear logs
     */
    public function ajax_clear_logs() {
        $settings = new Target_Logistics_Settings();
        $settings->ajax_clear_logs();
    }

    /**
     * Handle Direct URL seeding action for products, orders, and log cleanup
     */
    public function handle_direct_seeding() {
        if ( ! isset( $_GET['tl_action'] ) ) {
            return;
        }

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_die( esc_html__( 'Permission denied.', 'wc-target-logistics' ) );
        }

        check_admin_referer( 'target_logistics_seed_direct' );

        $action = sanitize_text_field( wp_unslash( $_GET['tl_action'] ) );

        if ( 'clear_logs' === $action ) {
            delete_option( 'target_logistics_recent_logs' );
            $redirect_url = add_query_arg(
                array(
                    'page'            => 'wc-settings',
                    'tab'             => 'integration',
                    'section'         => 'target_logistics',
                    'tl_logs_cleared' => '1',
                ),
                admin_url( 'admin.php' )
            );
            wp_safe_redirect( $redirect_url );
            exit;
        }

        if ( 'seed_products' === $action ) {
            $created = Target_Logistics_Settings::seed_sample_products();
            $redirect_url = add_query_arg(
                array(
                    'page'      => 'wc-settings',
                    'tab'       => 'integration',
                    'section'   => 'target_logistics',
                    'tl_seeded' => $created,
                ),
                admin_url( 'admin.php' )
            );
            wp_safe_redirect( $redirect_url );
            exit;
        }

        if ( 'seed_orders' === $action ) {
            $created = Target_Logistics_Settings::seed_sample_orders();
            $redirect_url = add_query_arg(
                array(
                    'page'             => 'wc-orders',
                    'tl_orders_seeded' => count( $created ),
                ),
                admin_url( 'admin.php' )
            );
            wp_safe_redirect( $redirect_url );
            exit;
        }
    }

    /**
     * Render Admin Notice on successful direct seeding
     */
    public function render_admin_notices() {
        if ( isset( $_GET['tl_logs_cleared'] ) ) {
            ?>
            <div class="notice notice-success is-dismissible">
                <p>
                    <strong><?php esc_html_e( 'Target Logistics:', 'wc-target-logistics' ); ?></strong>
                    <?php esc_html_e( 'API activity logs cleared successfully.', 'wc-target-logistics' ); ?>
                </p>
            </div>
            <?php
        }

        if ( isset( $_GET['tl_seeded'] ) ) {
            $count = absint( $_GET['tl_seeded'] );
            ?>
            <div class="notice notice-success is-dismissible">
                <p>
                    <strong><?php esc_html_e( 'Target Logistics:', 'wc-target-logistics' ); ?></strong>
                    <?php echo esc_html( sprintf( __( 'Successfully generated/updated %d sample products with realistic weights, dimensions, and HS codes! Go to Products to view.', 'wc-target-logistics' ), $count ) ); ?>
                </p>
            </div>
            <?php
        }

        if ( isset( $_GET['tl_orders_seeded'] ) ) {
            $count = absint( $_GET['tl_orders_seeded'] );
            ?>
            <div class="notice notice-success is-dismissible">
                <p>
                    <strong><?php esc_html_e( 'Target Logistics:', 'wc-target-logistics' ); ?></strong>
                    <?php echo esc_html( sprintf( __( 'Successfully created %d sample production test orders (Kuwait Domestic, Saudi Arabia GCC, and UAE Dubai)! Click into any order below to test live quotation and 1-click booking.', 'wc-target-logistics' ), $count ) ); ?>
                </p>
            </div>
            <?php
        }
    }

    /**
     * Enqueue Admin Assets
     *
     * @param string $hook_suffix
     */
    public function enqueue_admin_assets( $hook_suffix ) {
        $screen = get_current_screen();
        if ( ! $screen ) {
            return;
        }

        $is_order_screen = in_array( $screen->id, array( 'shop_order', 'woocommerce_page_wc-orders', 'edit-shop_order' ), true );
        $is_settings_screen = ( 'woocommerce_page_wc-settings' === $screen->id && (
            ( isset( $_GET['tab'] ) && 'integration' === $_GET['tab'] ) ||
            ( isset( $_GET['section'] ) && 'target_logistics' === $_GET['section'] )
        ) );

        if ( ! $is_order_screen && ! $is_settings_screen ) {
            return;
        }

        // CSS
        wp_enqueue_style(
            'target-logistics-admin',
            WC_TARGET_LOGISTICS_URL . 'assets/css/admin.css',
            array(),
            WC_TARGET_LOGISTICS_VERSION
        );

        // JS
        wp_enqueue_script(
            'target-logistics-admin',
            WC_TARGET_LOGISTICS_URL . 'assets/js/admin.js',
            array( 'jquery' ),
            WC_TARGET_LOGISTICS_VERSION,
            true
        );

        wp_localize_script( 'target-logistics-admin', 'targetLogisticsAdmin', array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce'    => wp_create_nonce( 'target_logistics_admin_nonce' ),
            'i18n'     => array(
                'testing'        => esc_html__( 'Testing connection...', 'wc-target-logistics' ),
                'quoting'        => esc_html__( 'Fetching live quotes from carrier API...', 'wc-target-logistics' ),
                'booking'        => esc_html__( 'Booking shipment & requesting pickup...', 'wc-target-logistics' ),
                'book_success'   => esc_html__( 'Shipment booked successfully!', 'wc-target-logistics' ),
                'confirm_book'   => esc_html__( 'Are you sure you want to book this shipment and schedule pickup with Target Logistics?', 'wc-target-logistics' ),
                'confirm_reset'  => esc_html__( 'Reset booking data for this order? This cannot be undone.', 'wc-target-logistics' ),
                'select_service' => esc_html__( 'Click to select available service', 'wc-target-logistics' ),
                'no_quotes'      => esc_html__( 'No quotes returned for this route. You can still proceed with manual mode or assigned carrier.', 'wc-target-logistics' ),
                'error'          => esc_html__( 'An unexpected error occurred. Please check logs.', 'wc-target-logistics' ),
            ),
        ) );
    }
}
