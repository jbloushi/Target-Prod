<?php
/**
 * Target Logistics Bulk Actions & Order List Columns
 *
 * Handles bulk booking of shipments from the WooCommerce Orders list,
 * and adds informative columns for tracking numbers & pickup statuses.
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class Target_Logistics_Bulk_Actions {

    /**
     * Pickup Service
     *
     * @var Target_Logistics_Pickup_Service
     */
    protected $pickup_service;

    /**
     * Constructor
     */
    public function __construct() {
        $this->pickup_service = new Target_Logistics_Pickup_Service();

        // Bulk Actions (Classic & HPOS)
        add_filter( 'bulk_actions-edit-shop_order', array( $this, 'register_bulk_actions' ) );
        add_filter( 'bulk_actions-woocommerce_page_wc-orders', array( $this, 'register_bulk_actions' ) );

        add_filter( 'handle_bulk_actions-edit-shop_order', array( $this, 'handle_bulk_actions' ), 10, 3 );
        add_filter( 'handle_bulk_actions-woocommerce_page_wc-orders', array( $this, 'handle_bulk_actions' ), 10, 3 );

        // Custom Columns (Classic & HPOS)
        add_filter( 'manage_edit-shop_order_columns', array( $this, 'add_order_columns' ) );
        add_action( 'manage_shop_order_posts_custom_column', array( $this, 'render_order_columns' ), 10, 2 );

        add_filter( 'manage_woocommerce_page_wc-orders_columns', array( $this, 'add_order_columns' ) );
        add_action( 'manage_woocommerce_page_wc-orders_custom_column', array( $this, 'render_order_columns_hpos' ), 10, 2 );

        // Admin notice
        add_action( 'admin_notices', array( $this, 'display_bulk_notices' ) );
    }

    /**
     * Register Bulk Actions
     *
     * @param array $actions
     * @return array
     */
    public function register_bulk_actions( $actions ) {
        $actions['target_logistics_bulk_book'] = __( 'Target Logistics: Book Shipment & Pickup', 'wc-target-logistics' );
        return $actions;
    }

    /**
     * Handle Bulk Action Execution
     *
     * @param string $redirect_to
     * @param string $action
     * @param array  $order_ids
     * @return string
     */
    public function handle_bulk_actions( $redirect_to, $action, $order_ids ) {
        if ( 'target_logistics_bulk_book' !== $action || empty( $order_ids ) ) {
            return $redirect_to;
        }

        $success_count = 0;
        $failed_count  = 0;
        $skipped_count = 0;

        foreach ( $order_ids as $order_id ) {
            $order = wc_get_order( $order_id );
            if ( ! $order ) {
                continue;
            }

            // Skip if already booked
            if ( ! empty( $order->get_meta( '_target_logistics_tracking_number' ) ) ) {
                $skipped_count++;
                continue;
            }

            $res = $this->pickup_service->book_order_shipment( $order );
            if ( $res['success'] ) {
                $success_count++;
            } else {
                $failed_count++;
            }
        }

        $redirect_to = add_query_arg( array(
            'tl_bulk_success' => $success_count,
            'tl_bulk_failed'  => $failed_count,
            'tl_bulk_skipped' => $skipped_count,
        ), $redirect_to );

        return $redirect_to;
    }

    /**
     * Display Bulk Action Notices
     */
    public function display_bulk_notices() {
        if ( ! isset( $_GET['tl_bulk_success'] ) ) {
            return;
        }

        $success = absint( $_GET['tl_bulk_success'] );
        $failed  = absint( $_GET['tl_bulk_failed'] );
        $skipped = absint( $_GET['tl_bulk_skipped'] );

        $class = ( $failed > 0 ) ? 'notice-warning' : 'notice-success';
        ?>
        <div class="notice <?php echo esc_attr( $class ); ?> is-dismissible">
            <p>
                <strong><?php esc_html_e( 'Target Logistics Bulk Booking Complete:', 'wc-target-logistics' ); ?></strong>
                <?php
                printf(
                    /* translators: 1: success count, 2: failed count, 3: skipped count */
                    esc_html__( '%1$d booked successfully, %2$d failed, %3$d skipped (already booked).', 'wc-target-logistics' ),
                    $success,
                    $failed,
                    $skipped
                );
                ?>
            </p>
        </div>
        <?php
    }

    /**
     * Add Column to Orders List
     *
     * @param array $columns
     * @return array
     */
    public function add_order_columns( $columns ) {
        $new_columns = array();
        foreach ( $columns as $key => $column ) {
            $new_columns[ $key ] = $column;
            if ( 'order_status' === $key ) {
                $new_columns['target_logistics'] = __( 'Target Logistics', 'wc-target-logistics' );
            }
        }
        if ( ! isset( $new_columns['target_logistics'] ) ) {
            $new_columns['target_logistics'] = __( 'Target Logistics', 'wc-target-logistics' );
        }
        return $new_columns;
    }

    /**
     * Render Custom Column (Classic post mode)
     *
     * @param string $column
     * @param int    $post_id
     */
    public function render_order_columns( $column, $post_id ) {
        if ( 'target_logistics' !== $column ) {
            return;
        }

        $order = wc_get_order( $post_id );
        if ( $order ) {
            $this->output_column_content( $order );
        }
    }

    /**
     * Render Custom Column (HPOS mode)
     *
     * @param string   $column
     * @param WC_Order $order
     */
    public function render_order_columns_hpos( $column, $order ) {
        if ( 'target_logistics' !== $column ) {
            return;
        }

        $this->output_column_content( $order );
    }

    /**
     * Output column markup
     *
     * @param WC_Order $order
     */
    private function output_column_content( $order ) {
        $tracking_number = $order->get_meta( '_target_logistics_tracking_number' );
        $carrier         = $order->get_meta( '_target_logistics_carrier' );
        $status          = $order->get_meta( '_target_logistics_status' );
        $pickup_id       = $order->get_meta( '_target_logistics_pickup_id' );

        if ( empty( $tracking_number ) ) {
            echo '<span class="na">&ndash;</span>';
            return;
        }

        $settings = get_option( 'woocommerce_target_logistics_settings', array() );
        $tpl      = ! empty( $settings['public_tracking_url_template'] ) ? $settings['public_tracking_url_template'] : 'https://mawthook.io/track/{tracking_number}';
        $track_url = str_replace( '{tracking_number}', rawurlencode( $tracking_number ), $tpl );

        echo '<div style="font-size: 12px; line-height: 1.4;">';
        echo '<a href="' . esc_url( $track_url ) . '" target="_blank" style="font-weight: 600; text-decoration: none;">' . esc_html( $tracking_number ) . '</a>';
        if ( $carrier ) {
            echo '<br/><span style="color: #646970;">' . esc_html( $carrier ) . '</span>';
        }
        if ( $status ) {
            echo ' &bull; <span class="tl-col-badge">' . esc_html( strtoupper( $status ) ) . '</span>';
        }
        if ( $pickup_id ) {
            echo '<br/><span style="color: #2271b1; font-size: 11px;"><span class="dashicons dashicons-car" style="font-size: 14px; width: 14px; height: 14px; vertical-align: middle;"></span> ' . esc_html__( 'Pickup Scheduled', 'wc-target-logistics' ) . '</span>';
        }
        echo '</div>';
    }
}
