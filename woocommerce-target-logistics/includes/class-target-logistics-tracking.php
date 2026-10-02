<?php
/**
 * Target Logistics Customer Tracking and Emails
 *
 * Displays tracking numbers, status, and direct tracking links in customer
 * order details, account pages, and transactional emails. Also provides a tracking shortcode.
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class Target_Logistics_Tracking {

    /**
     * Constructor
     */
    public function __construct() {
        $settings = get_option( 'woocommerce_target_logistics_settings', array() );

        // Customer Order Details (Thank you page & My Account > View Order)
        if ( ! isset( $settings['show_tracking_order_details'] ) || 'yes' === $settings['show_tracking_order_details'] ) {
            add_action( 'woocommerce_order_details_after_order_table', array( $this, 'display_tracking_in_order_details' ), 10, 1 );
        }

        // Customer Transactional Emails
        if ( ! isset( $settings['show_tracking_in_email'] ) || 'yes' === $settings['show_tracking_in_email'] ) {
            add_action( 'woocommerce_email_after_order_table', array( $this, 'display_tracking_in_emails' ), 10, 4 );
        }

        // Shortcode: [target_logistics_track]
        add_shortcode( 'target_logistics_track', array( $this, 'render_tracking_shortcode' ) );
    }

    /**
     * Build Public Tracking URL for a tracking number
     *
     * @param string $tracking_number
     * @return string
     */
    public static function get_tracking_url( $tracking_number ) {
        $settings = get_option( 'woocommerce_target_logistics_settings', array() );
        $tpl      = ! empty( $settings['public_tracking_url_template'] ) ? $settings['public_tracking_url_template'] : 'https://mawthook.io/track/{tracking_number}';
        return str_replace( '{tracking_number}', rawurlencode( $tracking_number ), $tpl );
    }

    /**
     * Display Tracking in Order Details (Account & Thank You page)
     *
     * @param WC_Order $order
     */
    public function display_tracking_in_order_details( $order ) {
        if ( ! $order ) {
            return;
        }

        $tracking_number = $order->get_meta( '_target_logistics_tracking_number' );
        if ( empty( $tracking_number ) ) {
            return;
        }

        $carrier    = $order->get_meta( '_target_logistics_carrier' );
        $status     = $order->get_meta( '_target_logistics_status' );
        $track_url  = self::get_tracking_url( $tracking_number );
        ?>
        <section class="woocommerce-columns woocommerce-columns--2 woocommerce-columns--addresses col2-set addresses target-logistics-customer-card" style="margin-top: 24px; padding: 18px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;">
            <h2 class="woocommerce-column__title" style="margin-top: 0; font-size: 1.15rem; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                <span class="dashicons dashicons-location-alt" style="color: #2563eb;"></span>
                <?php esc_html_e( 'Shipment Tracking', 'wc-target-logistics' ); ?>
            </h2>

            <p style="margin-bottom: 8px;">
                <strong><?php esc_html_e( 'Carrier:', 'wc-target-logistics' ); ?></strong>
                <span><?php echo esc_html( $carrier ? $carrier : __( 'Target Logistics', 'wc-target-logistics' ) ); ?></span>
            </p>

            <p style="margin-bottom: 8px;">
                <strong><?php esc_html_e( 'Tracking Number:', 'wc-target-logistics' ); ?></strong>
                <code style="padding: 2px 6px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: 600; font-size: 1rem;"><?php echo esc_html( $tracking_number ); ?></code>
            </p>

            <?php if ( ! empty( $status ) ) : ?>
                <p style="margin-bottom: 14px;">
                    <strong><?php esc_html_e( 'Status:', 'wc-target-logistics' ); ?></strong>
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; background: #e0f2fe; color: #0369a1; font-weight: 600; font-size: 0.85rem; text-transform: uppercase;">
                        <?php echo esc_html( $status ); ?>
                    </span>
                </p>
            <?php endif; ?>

            <p style="margin-bottom: 0;">
                <a href="<?php echo esc_url( $track_url ); ?>" target="_blank" rel="noopener noreferrer" class="button button-primary" style="display: inline-block; padding: 8px 16px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
                    <?php esc_html_e( 'Track Your Package &rarr;', 'wc-target-logistics' ); ?>
                </a>
            </p>
        </section>
        <?php
    }

    /**
     * Display Tracking info in Customer Transactional Emails
     *
     * @param WC_Order $order
     * @param bool     $sent_to_admin
     * @param bool     $plain_text
     * @param WC_Email $email
     */
    public function display_tracking_in_emails( $order, $sent_to_admin, $plain_text, $email = null ) {
        if ( ! $order ) {
            return;
        }

        $tracking_number = $order->get_meta( '_target_logistics_tracking_number' );
        if ( empty( $tracking_number ) ) {
            return;
        }

        $carrier   = $order->get_meta( '_target_logistics_carrier' );
        $status    = $order->get_meta( '_target_logistics_status' );
        $track_url = self::get_tracking_url( $tracking_number );

        if ( $plain_text ) {
            echo "\n========================================\n";
            echo esc_html__( 'SHIPMENT TRACKING INFORMATION', 'wc-target-logistics' ) . "\n";
            echo "========================================\n";
            echo sprintf( esc_html__( 'Carrier: %s', 'wc-target-logistics' ), $carrier ? $carrier : 'Target Logistics' ) . "\n";
            echo sprintf( esc_html__( 'Tracking Number: %s', 'wc-target-logistics' ), $tracking_number ) . "\n";
            if ( $status ) {
                echo sprintf( esc_html__( 'Status: %s', 'wc-target-logistics' ), strtoupper( $status ) ) . "\n";
            }
            echo sprintf( esc_html__( 'Track Online: %s', 'wc-target-logistics' ), $track_url ) . "\n\n";
            return;
        }

        ?>
        <div style="margin: 20px 0; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <h3 style="margin-top: 0; margin-bottom: 12px; color: #1e293b; font-size: 16px;">
                <?php esc_html_e( 'Shipment Tracking', 'wc-target-logistics' ); ?>
            </h3>
            <p style="margin: 4px 0; color: #475569; font-size: 14px;">
                <strong><?php esc_html_e( 'Carrier:', 'wc-target-logistics' ); ?></strong>
                <?php echo esc_html( $carrier ? $carrier : __( 'Target Logistics', 'wc-target-logistics' ) ); ?>
            </p>
            <p style="margin: 4px 0; color: #475569; font-size: 14px;">
                <strong><?php esc_html_e( 'Tracking Number:', 'wc-target-logistics' ); ?></strong>
                <span style="font-family: monospace; font-weight: bold; background: #ffffff; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 3px;">
                    <?php echo esc_html( $tracking_number ); ?>
                </span>
            </p>
            <?php if ( ! empty( $status ) ) : ?>
                <p style="margin: 4px 0; color: #475569; font-size: 14px;">
                    <strong><?php esc_html_e( 'Status:', 'wc-target-logistics' ); ?></strong>
                    <?php echo esc_html( strtoupper( $status ) ); ?>
                </p>
            <?php endif; ?>
            <p style="margin: 12px 0 0;">
                <a href="<?php echo esc_url( $track_url ); ?>" target="_blank" style="display: inline-block; padding: 8px 14px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 13px;">
                    <?php esc_html_e( 'Track Shipment', 'wc-target-logistics' ); ?>
                </a>
            </p>
        </div>
        <?php
    }

    /**
     * Render Tracking Shortcode [target_logistics_track]
     *
     * @param array $atts
     * @return string
     */
    public function render_tracking_shortcode( $atts ) {
        $tracking_number = isset( $_GET['tl_track'] ) ? sanitize_text_field( wp_unslash( $_GET['tl_track'] ) ) : '';
        $track_url = ! empty( $tracking_number ) ? self::get_tracking_url( $tracking_number ) : '';

        ob_start();
        ?>
        <div class="target-logistics-track-form" style="max-width: 500px; margin: 20px 0; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 18px; color: #0f172a;">
                <?php esc_html_e( 'Track Your Shipment', 'wc-target-logistics' ); ?>
            </h3>
            <form method="GET" action="">
                <div style="display: flex; gap: 8px;">
                    <input type="text" name="tl_track" value="<?php echo esc_attr( $tracking_number ); ?>" placeholder="<?php esc_attr_e( 'Enter Tracking Number...', 'wc-target-logistics' ); ?>" required style="flex: 1; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;" />
                    <button type="submit" class="button button-primary" style="padding: 10px 18px; background: #2563eb; color: #ffffff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
                        <?php esc_html_e( 'Track', 'wc-target-logistics' ); ?>
                    </button>
                </div>
            </form>
            <?php if ( ! empty( $tracking_number ) ) : ?>
                <div style="margin-top: 16px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px;">
                    <p style="margin: 0; color: #166534; font-size: 14px;">
                        <?php
                        printf(
                            /* translators: 1: tracking number, 2: tracking link */
                            esc_html__( 'Tracking Number %1$s: %2$s', 'wc-target-logistics' ),
                            '<strong>' . esc_html( $tracking_number ) . '</strong>',
                            '<a href="' . esc_url( $track_url ) . '" target="_blank" style="font-weight: 600; color: #15803d;">' . esc_html__( 'Click here to view live tracking details &rarr;', 'wc-target-logistics' ) . '</a>'
                        );
                        ?>
                    </p>
                </div>
            <?php endif; ?>
        </div>
        <?php
        return ob_get_clean();
    }
}
