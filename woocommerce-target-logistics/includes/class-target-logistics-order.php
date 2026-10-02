<?php
/**
 * Target Logistics Order Meta Box and Actions
 *
 * Provides the interactive order meta box, actions, and order status triggers.
 * Compatible with Classic Orders and WooCommerce HPOS (High-Performance Order Storage).
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class Target_Logistics_Order_Manager {

    /**
     * Pickup Service instance
     *
     * @var Target_Logistics_Pickup_Service
     */
    protected $pickup_service;

    /**
     * Constructor
     */
    public function __construct() {
        $this->pickup_service = new Target_Logistics_Pickup_Service();

        // Meta box registration (Classic & HPOS)
        add_action( 'add_meta_boxes', array( $this, 'register_meta_boxes' ), 20, 2 );

        // Order Actions dropdown in order edit
        add_filter( 'woocommerce_order_actions', array( $this, 'add_order_actions' ) );
        add_action( 'woocommerce_order_action_target_logistics_book', array( $this, 'process_order_action_book' ) );
        add_action( 'woocommerce_order_action_target_logistics_refresh', array( $this, 'process_order_action_refresh' ) );

        // Automatic booking on order status change
        add_action( 'woocommerce_order_status_changed', array( $this, 'handle_order_status_change' ), 10, 4 );

        // AJAX handlers for order meta box actions
        add_action( 'wp_ajax_target_logistics_book_order', array( $this, 'ajax_book_order' ) );
        add_action( 'wp_ajax_target_logistics_refresh_order', array( $this, 'ajax_refresh_order' ) );
        add_action( 'wp_ajax_target_logistics_quote_order', array( $this, 'ajax_quote_order' ) );
        add_action( 'wp_ajax_target_logistics_reset_order', array( $this, 'ajax_reset_order' ) );
    }

    /**
     * Register Meta Box on Order page
     *
     * @param string $post_type
     * @param mixed  $post_or_order
     */
    public function register_meta_boxes( $post_type, $post_or_order ) {
        $order_screen = class_exists( '\Automattic\WooCommerce\Internal\DataStores\Orders\CustomOrdersTableController' ) &&
                        wc_get_container()->get( \Automattic\WooCommerce\Internal\DataStores\Orders\CustomOrdersTableController::class )->custom_orders_table_usage_is_enabled()
                        ? wc_get_page_screen_id( 'shop-order' )
                        : 'shop_order';

        add_meta_box(
            'target_logistics_order_metabox',
            __( 'Target Logistics — Shipment & Pickup Booking', 'wc-target-logistics' ),
            array( $this, 'render_meta_box' ),
            $order_screen,
            'side',
            'high'
        );
    }

    /**
     * Render the Meta Box Content
     *
     * @param WP_Post|WC_Order $post_or_order
     */
    public function render_meta_box( $post_or_order ) {
        $order = ( $post_or_order instanceof WC_Order ) ? $post_or_order : wc_get_order( $post_or_order->ID );

        if ( ! $order ) {
            echo '<p>' . esc_html__( 'Unable to load order.', 'wc-target-logistics' ) . '</p>';
            return;
        }

        $tracking_number = $order->get_meta( '_target_logistics_tracking_number' );
        $carrier         = $order->get_meta( '_target_logistics_carrier' );
        $service         = $order->get_meta( '_target_logistics_service' );
        $status          = $order->get_meta( '_target_logistics_status' );
        $label_url       = $order->get_meta( '_target_logistics_label_url' );
        $invoice_url     = $order->get_meta( '_target_logistics_invoice_url' );
        $pickup_id       = $order->get_meta( '_target_logistics_pickup_id' );
        $pickup_status   = $order->get_meta( '_target_logistics_pickup_status' );
        $booked_at       = $order->get_meta( '_target_logistics_booked_at' );

        $settings = get_option( 'woocommerce_target_logistics_settings', array() );
        $public_tracking_tpl = ! empty( $settings['public_tracking_url_template'] ) ? $settings['public_tracking_url_template'] : 'https://mawthook.io/track/{tracking_number}';
        $tracking_url = str_replace( '{tracking_number}', rawurlencode( $tracking_number ), $public_tracking_tpl );

        wp_nonce_field( 'target_logistics_admin_nonce', 'target_logistics_order_nonce' );
        ?>
        <div class="target-logistics-box-wrap" data-order-id="<?php echo esc_attr( $order->get_id() ); ?>">
            <?php if ( ! empty( $tracking_number ) ) : ?>
                <!-- BOOKED STATE -->
                <div class="tl-status-card tl-booked">
                    <div class="tl-badge-row">
                        <span class="tl-badge tl-badge-status tl-status-<?php echo esc_attr( sanitize_title( $status ) ); ?>">
                            <?php echo esc_html( strtoupper( $status ) ); ?>
                        </span>
                        <?php if ( $carrier ) : ?>
                            <span class="tl-badge tl-badge-carrier">
                                <?php echo esc_html( $carrier . ( $service ? ' (' . $service . ')' : '' ) ); ?>
                            </span>
                        <?php endif; ?>
                    </div>

                    <div class="tl-field-group">
                        <label><?php esc_html_e( 'Tracking Number:', 'wc-target-logistics' ); ?></label>
                        <div class="tl-tracking-value">
                            <strong><?php echo esc_html( $tracking_number ); ?></strong>
                            <a href="<?php echo esc_url( $tracking_url ); ?>" target="_blank" class="button button-small" title="<?php esc_attr_e( 'Track Online', 'wc-target-logistics' ); ?>">
                                <span class="dashicons dashicons-external"></span>
                            </a>
                        </div>
                    </div>

                    <?php if ( ! empty( $pickup_id ) ) : ?>
                        <div class="tl-field-group tl-pickup-info">
                            <label><?php esc_html_e( 'Pickup Request:', 'wc-target-logistics' ); ?></label>
                            <div class="tl-pickup-val">
                                <code><?php echo esc_html( substr( $pickup_id, 0, 14 ) . '...' ); ?></code>
                                <span class="tl-badge tl-badge-pickup tl-pickup-<?php echo esc_attr( sanitize_title( $pickup_status ) ); ?>">
                                    <?php echo esc_html( $pickup_status ?: 'REQUESTED' ); ?>
                                </span>
                            </div>
                        </div>
                    <?php endif; ?>

                    <?php if ( $booked_at ) : ?>
                        <p class="tl-booked-date">
                            <small><?php echo esc_html( sprintf( __( 'Booked: %s', 'wc-target-logistics' ), $booked_at ) ); ?></small>
                        </p>
                    <?php endif; ?>

                    <div class="tl-actions-row">
                        <?php if ( ! empty( $label_url ) ) : ?>
                            <a href="<?php echo esc_url( $label_url ); ?>" target="_blank" class="button button-primary tl-btn-block">
                                <span class="dashicons dashicons-pdf" style="vertical-align: middle;"></span>
                                <?php esc_html_e( 'Download / Print Label', 'wc-target-logistics' ); ?>
                            </a>
                        <?php endif; ?>

                        <?php if ( ! empty( $invoice_url ) ) : ?>
                            <a href="<?php echo esc_url( $invoice_url ); ?>" target="_blank" class="button button-secondary tl-btn-block">
                                <?php esc_html_e( 'Commercial Invoice', 'wc-target-logistics' ); ?>
                            </a>
                        <?php endif; ?>

                        <div class="tl-action-buttons">
                            <button type="button" class="button button-secondary" id="tl-btn-refresh-status">
                                <span class="dashicons dashicons-update" style="vertical-align: middle;"></span>
                                <?php esc_html_e( 'Refresh Status', 'wc-target-logistics' ); ?>
                            </button>
                            <button type="button" class="button-link-delete" id="tl-btn-reset-order" style="float: right; margin-top: 6px;">
                                <?php esc_html_e( 'Reset Booking', 'wc-target-logistics' ); ?>
                            </button>
                        </div>
                    </div>
                </div>

            <?php else : ?>
                <!-- UNBOOKED STATE -->
                <div class="tl-status-card tl-unbooked">
                    <p class="tl-intro">
                        <?php esc_html_e( 'This order is ready to be booked with Target Logistics Client API.', 'wc-target-logistics' ); ?>
                    </p>

                    <?php
                    $shipping_methods = $order->get_shipping_methods();
                    $selected_shipping_name = '';
                    $is_target_shipping     = false;
                    $order_carrier          = isset( $settings['default_carrier_code'] ) ? $settings['default_carrier_code'] : '';
                    $order_service          = isset( $settings['default_service_code'] ) ? $settings['default_service_code'] : '';

                    foreach ( $shipping_methods as $shipping_item ) {
                        $selected_shipping_name = $shipping_item->get_name();
                        if ( false !== strpos( $shipping_item->get_method_id(), 'target_logistics_shipping' ) ) {
                            $is_target_shipping = true;
                        }
                        if ( $shipping_item->get_meta( 'carrier_code' ) ) {
                            $order_carrier = $shipping_item->get_meta( 'carrier_code' );
                        }
                        if ( $shipping_item->get_meta( 'service_code' ) ) {
                            $order_service = $shipping_item->get_meta( 'service_code' );
                        }
                        break;
                    }
                    ?>
                    <div class="tl-summary-box">
                        <div class="tl-route-row">
                            <span class="dashicons dashicons-location-alt"></span>
                            <span><strong><?php esc_html_e( 'To:', 'wc-target-logistics' ); ?></strong> <?php echo esc_html( $order->get_shipping_city() ?: $order->get_billing_city() ); ?>, <?php echo esc_html( $order->get_shipping_country() ?: $order->get_billing_country() ); ?></span>
                        </div>
                        <div class="tl-route-row">
                            <span class="dashicons dashicons-cart"></span>
                            <span><strong><?php esc_html_e( 'Items:', 'wc-target-logistics' ); ?></strong> <?php echo esc_html( $order->get_item_count() ); ?> (<?php echo esc_html( wc_price( $order->get_total(), array( 'currency' => $order->get_currency() ) ) ); ?>)</span>
                        </div>
                        <?php if ( ! empty( $selected_shipping_name ) ) : ?>
                            <div class="tl-route-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #e2e8f0;">
                                <span class="dashicons dashicons-car"></span>
                                <span><strong><?php esc_html_e( 'Customer Shipping:', 'wc-target-logistics' ); ?></strong> <?php echo esc_html( $selected_shipping_name ); ?>
                                <?php if ( $is_target_shipping ) : ?>
                                    <span class="tl-badge" style="background: #10b981; color: #fff; margin-left: 4px; font-size: 10px; padding: 1px 5px;"><?php esc_html_e( 'Target Logistics', 'wc-target-logistics' ); ?></span>
                                <?php endif; ?>
                                </span>
                            </div>
                        <?php endif; ?>
                    </div>

                    <div class="tl-options-fold">
                        <p>
                            <label for="tl_override_carrier"><strong><?php esc_html_e( 'Carrier Code:', 'wc-target-logistics' ); ?></strong></label>
                            <input type="text" id="tl_override_carrier" class="widefat" value="<?php echo esc_attr( $order_carrier ); ?>" placeholder="<?php esc_attr_e( 'Auto-resolved if blank', 'wc-target-logistics' ); ?>" />
                        </p>

                        <p>
                            <label for="tl_override_service"><strong><?php esc_html_e( 'Service Code:', 'wc-target-logistics' ); ?></strong></label>
                            <input type="text" id="tl_override_service" class="widefat" value="<?php echo esc_attr( $order_service ); ?>" placeholder="<?php esc_attr_e( 'Auto-resolved if blank', 'wc-target-logistics' ); ?>" />
                        </p>

                        <p>
                            <label>
                                <input type="checkbox" id="tl_request_pickup" value="1" <?php checked( ! isset( $settings['enable_pickup'] ) || 'yes' === $settings['enable_pickup'] ); ?> />
                                <strong><?php esc_html_e( 'Schedule Warehouse Pickup', 'wc-target-logistics' ); ?></strong>
                            </label>
                        </p>

                        <div id="tl_pickup_details_wrap" style="<?php echo ( isset( $settings['enable_pickup'] ) && 'no' === $settings['enable_pickup'] ) ? 'display:none;' : ''; ?>">
                            <p>
                                <label for="tl_pickup_date"><strong><?php esc_html_e( 'Requested Pickup Time:', 'wc-target-logistics' ); ?></strong></label>
                                <input type="text" id="tl_pickup_date" class="widefat" value="<?php echo esc_attr( $this->pickup_service->calculate_pickup_datetime() ); ?>" />
                                <small class="description"><?php esc_html_e( 'ISO 8601 format e.g. 2026-10-03T10:00:00Z', 'wc-target-logistics' ); ?></small>
                            </p>
                            <p>
                                <label for="tl_pickup_notes"><strong><?php esc_html_e( 'Pickup Notes:', 'wc-target-logistics' ); ?></strong></label>
                                <textarea id="tl_pickup_notes" class="widefat" rows="2"><?php echo esc_textarea( isset( $settings['pickup_instructions'] ) ? $settings['pickup_instructions'] : 'Ready at warehouse' ); ?></textarea>
                            </p>
                        </div>
                    </div>

                    <div id="tl-quotes-container" style="display: none; margin: 10px 0;"></div>

                    <div class="tl-action-buttons">
                        <button type="button" class="button button-primary tl-btn-block" id="tl-btn-book-order">
                            <span class="dashicons dashicons-external" style="vertical-align: middle;"></span>
                            <?php esc_html_e( 'Book Shipment & Schedule Pickup', 'wc-target-logistics' ); ?>
                        </button>
                        <button type="button" class="button button-secondary tl-btn-block" id="tl-btn-quote-order" style="margin-top: 6px;">
                            <span class="dashicons dashicons-tag" style="vertical-align: middle;"></span>
                            <?php esc_html_e( 'Get Available Quotes', 'wc-target-logistics' ); ?>
                        </button>
                    </div>
                </div>
            <?php endif; ?>

            <div id="tl-feedback-notice" style="margin-top: 10px; display: none;"></div>
        </div>
        <?php
    }

    /**
     * Add Custom Order Action to dropdown
     *
     * @param array $actions
     * @return array
     */
    public function add_order_actions( $actions ) {
        $actions['target_logistics_book']    = __( 'Target Logistics: Book Shipment & Pickup', 'wc-target-logistics' );
        $actions['target_logistics_refresh'] = __( 'Target Logistics: Refresh Tracking Status', 'wc-target-logistics' );
        return $actions;
    }

    /**
     * Process Book Order Action from dropdown
     *
     * @param WC_Order $order
     */
    public function process_order_action_book( $order ) {
        $result = $this->pickup_service->book_order_shipment( $order );
        if ( ! $result['success'] ) {
            WC_Admin_Notices::add_custom_notice( 'target_logistics_error', sprintf( __( 'Target Logistics booking error: %s', 'wc-target-logistics' ), $result['message'] ) );
        }
    }

    /**
     * Process Refresh Order Action from dropdown
     *
     * @param WC_Order $order
     */
    public function process_order_action_refresh( $order ) {
        $this->pickup_service->refresh_status( $order );
    }

    /**
     * Handle Automatic Booking on Order Status change
     *
     * @param int      $order_id
     * @param string   $old_status
     * @param string   $new_status
     * @param WC_Order $order
     */
    public function handle_order_status_change( $order_id, $old_status, $new_status, $order ) {
        $settings = get_option( 'woocommerce_target_logistics_settings', array() );
        $target_status = isset( $settings['auto_book_status'] ) ? $settings['auto_book_status'] : 'disabled';

        if ( 'disabled' === $target_status ) {
            return;
        }

        // Compare status (e.g. 'wc-processing' -> 'processing')
        $clean_target = str_replace( 'wc-', '', $target_status );
        if ( $new_status === $clean_target ) {
            // Check if already booked
            $existing_tracking = $order->get_meta( '_target_logistics_tracking_number' );
            if ( ! empty( $existing_tracking ) ) {
                return;
            }

            // Perform booking
            $this->pickup_service->book_order_shipment( $order );
        }
    }

    /**
     * AJAX handler: Book Order
     */
    public function ajax_book_order() {
        check_ajax_referer( 'target_logistics_admin_nonce', 'security' );

        if ( ! current_user_can( 'edit_shop_orders' ) ) {
            wp_send_json_error( array( 'message' => __( 'Permission denied.', 'wc-target-logistics' ) ) );
        }

        $order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
        $order    = wc_get_order( $order_id );

        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Order not found.', 'wc-target-logistics' ) ) );
        }

        $overrides = array(
            'carrier_code'        => isset( $_POST['carrier_code'] ) ? sanitize_text_field( wp_unslash( $_POST['carrier_code'] ) ) : '',
            'service_code'        => isset( $_POST['service_code'] ) ? sanitize_text_field( wp_unslash( $_POST['service_code'] ) ) : '',
            'request_pickup'      => ! empty( $_POST['request_pickup'] ),
            'pickup_date'         => isset( $_POST['pickup_date'] ) ? sanitize_text_field( wp_unslash( $_POST['pickup_date'] ) ) : '',
            'pickup_instructions' => isset( $_POST['pickup_instructions'] ) ? sanitize_textarea_field( wp_unslash( $_POST['pickup_instructions'] ) ) : '',
        );

        $result = $this->pickup_service->book_order_shipment( $order, $overrides );

        if ( $result['success'] ) {
            wp_send_json_success( $result );
        } else {
            wp_send_json_error( $result );
        }
    }

    /**
     * AJAX handler: Refresh Tracking and Pickup
     */
    public function ajax_refresh_order() {
        check_ajax_referer( 'target_logistics_admin_nonce', 'security' );

        if ( ! current_user_can( 'edit_shop_orders' ) ) {
            wp_send_json_error( array( 'message' => __( 'Permission denied.', 'wc-target-logistics' ) ) );
        }

        $order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
        $order    = wc_get_order( $order_id );

        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Order not found.', 'wc-target-logistics' ) ) );
        }

        $result = $this->pickup_service->refresh_status( $order );
        wp_send_json_success( $result );
    }

    /**
     * AJAX handler: Get Quote Rates
     */
    public function ajax_quote_order() {
        check_ajax_referer( 'target_logistics_admin_nonce', 'security' );

        if ( ! current_user_can( 'edit_shop_orders' ) ) {
            wp_send_json_error( array( 'message' => __( 'Permission denied.', 'wc-target-logistics' ) ) );
        }

        $order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
        $order    = wc_get_order( $order_id );

        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Order not found.', 'wc-target-logistics' ) ) );
        }

        $res = $this->pickup_service->get_order_quotes( $order );

        if ( is_wp_error( $res ) ) {
            wp_send_json_error( array( 'message' => $res->get_error_message() ) );
        }

        if ( empty( $res['success'] ) || empty( $res['data'] ) ) {
            wp_send_json_error( array( 'message' => isset( $res['error'] ) ? $res['error'] : __( 'No quotes available.', 'wc-target-logistics' ) ) );
        }

        wp_send_json_success( array( 'quotes' => $res['data'] ) );
    }

    /**
     * AJAX handler: Reset Booking
     */
    public function ajax_reset_order() {
        check_ajax_referer( 'target_logistics_admin_nonce', 'security' );

        if ( ! current_user_can( 'edit_shop_orders' ) ) {
            wp_send_json_error( array( 'message' => __( 'Permission denied.', 'wc-target-logistics' ) ) );
        }

        $order_id = isset( $_POST['order_id'] ) ? absint( $_POST['order_id'] ) : 0;
        $order    = wc_get_order( $order_id );

        if ( ! $order ) {
            wp_send_json_error( array( 'message' => __( 'Order not found.', 'wc-target-logistics' ) ) );
        }

        $order->delete_meta_data( '_target_logistics_tracking_number' );
        $order->delete_meta_data( '_target_logistics_carrier' );
        $order->delete_meta_data( '_target_logistics_service' );
        $order->delete_meta_data( '_target_logistics_status' );
        $order->delete_meta_data( '_target_logistics_label_url' );
        $order->delete_meta_data( '_target_logistics_invoice_url' );
        $order->delete_meta_data( '_target_logistics_pickup_id' );
        $order->delete_meta_data( '_target_logistics_pickup_status' );
        $order->delete_meta_data( '_target_logistics_booked_at' );
        $order->save();

        $order->add_order_note( __( 'Target Logistics booking data was reset by admin.', 'wc-target-logistics' ) );

        wp_send_json_success( array( 'message' => __( 'Booking metadata reset.', 'wc-target-logistics' ) ) );
    }
}
