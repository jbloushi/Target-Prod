<?php
/**
 * Target Logistics Settings Screen
 *
 * Adds and manages settings in WooCommerce > Settings > Integration > Target Logistics.
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class Target_Logistics_Settings extends WC_Integration {

    /**
     * Constructor
     */
    public function __construct() {
        $this->id                 = 'target_logistics';
        $this->method_title       = __( 'Target Logistics', 'wc-target-logistics' );
        $this->method_description = __( 'Connect your store to Target Logistics Client API to create/book carrier or manual shipments and schedule warehouse pickups automatically.', 'wc-target-logistics' );

        // Load settings fields
        $this->init_form_fields();
        $this->init_settings();

        // Save settings action
        add_action( 'woocommerce_update_options_integration_' . $this->id, array( $this, 'process_admin_options' ) );

        // AJAX handler for connection test
        add_action( 'wp_ajax_target_logistics_test_connection', array( $this, 'ajax_test_connection' ) );
    }

    /**
     * Initialize form fields
     */
    public function init_form_fields() {
        $this->form_fields = array(
            'enabled' => array(
                'title'       => __( 'Enable/Disable', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Enable Target Logistics Integration', 'wc-target-logistics' ),
                'default'     => 'yes',
            ),

            // Section: API Configuration
            'api_section' => array(
                'title'       => __( '1. Client API Connection', 'wc-target-logistics' ),
                'type'        => 'title',
                'description' => __( 'Configure your Target Logistics Client API credentials.', 'wc-target-logistics' ),
            ),
            'environment' => array(
                'title'       => __( 'Environment', 'wc-target-logistics' ),
                'type'        => 'select',
                'description' => __( 'Select Target Logistics environment.', 'wc-target-logistics' ),
                'default'     => 'production',
                'options'     => array(
                    'production' => __( 'Production (https://api.target-kw.com/api)', 'wc-target-logistics' ),
                    'custom'     => __( 'Custom Base URL', 'wc-target-logistics' ),
                    'local'      => __( 'Local Development (http://localhost:8899/api)', 'wc-target-logistics' ),
                ),
            ),
            'custom_api_url' => array(
                'title'       => __( 'Custom API URL', 'wc-target-logistics' ),
                'type'        => 'text',
                'description' => __( 'Required only if "Custom Base URL" is selected above.', 'wc-target-logistics' ),
                'default'     => '',
                'placeholder' => 'https://api.target-kw.com/api',
            ),
            'api_key' => array(
                'title'       => __( 'API Key (x-api-key)', 'wc-target-logistics' ),
                'type'        => 'password',
                'description' => __( 'Obtain your Client API key from your Target Logistics account Settings page.', 'wc-target-logistics' ),
                'default'     => '',
                'desc_tip'    => true,
            ),
            'test_connection_button' => array(
                'title'       => __( 'Connection Test', 'wc-target-logistics' ),
                'type'        => 'target_logistics_test_btn',
                'description' => __( 'Verify API key and connectivity with Target Logistics server.', 'wc-target-logistics' ),
            ),

            // Section: Warehouse / Shipper Details
            'sender_section' => array(
                'title'       => __( '2. Shipper / Warehouse Pickup Address', 'wc-target-logistics' ),
                'type'        => 'title',
                'description' => __( 'The origin location where the courier will pick up shipments.', 'wc-target-logistics' ),
            ),
            'sender_company' => array(
                'title'       => __( 'Company Name', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => get_bloginfo( 'name' ),
            ),
            'sender_contact_person' => array(
                'title'       => __( 'Contact Person', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => 'Warehouse Manager',
            ),
            'sender_phone_country_code' => array(
                'title'       => __( 'Phone Country Code', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => '+965',
                'placeholder' => '+965',
                'description' => __( 'International calling code, e.g. +965, +971, +966.', 'wc-target-logistics' ),
            ),
            'sender_phone' => array(
                'title'       => __( 'Phone Number', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => '',
                'placeholder' => '96512345678',
            ),
            'sender_email' => array(
                'title'       => __( 'Email Address', 'wc-target-logistics' ),
                'type'        => 'email',
                'default'     => get_option( 'admin_email' ),
            ),
            'sender_country_code' => array(
                'title'       => __( 'Country Code (ISO 2-letter)', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => 'KW',
                'placeholder' => 'KW',
                'description' => __( 'ISO 2-letter country code (e.g. KW, SA, AE, US).', 'wc-target-logistics' ),
            ),
            'sender_city' => array(
                'title'       => __( 'City', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => 'Kuwait City',
            ),
            'sender_postal_code' => array(
                'title'       => __( 'Postal Code', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => '13001',
            ),
            'sender_street_lines' => array(
                'title'       => __( 'Street / Warehouse Address Lines', 'wc-target-logistics' ),
                'type'        => 'textarea',
                'default'     => "Industrial Area, Block 4\nStreet 12, Building 3",
                'description' => __( 'One street line per line.', 'wc-target-logistics' ),
            ),

            // Section: Carrier & Shipment Configuration
            'shipping_section' => array(
                'title'       => __( '3. Shipping Defaults & Carrier Logic', 'wc-target-logistics' ),
                'type'        => 'title',
                'description' => __( 'Control carrier assignment, quote handling, and export customs parameters.', 'wc-target-logistics' ),
            ),
            'default_carrier_code' => array(
                'title'       => __( 'Default Carrier Code', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => '',
                'placeholder' => __( 'Auto (Managed by Target Logistics)', 'wc-target-logistics' ),
                'description' => __( 'Leave blank to let Target Logistics automatically route based on your account settings. Enter DGR (DHL Express) or MANUAL only if you wish to override.', 'wc-target-logistics' ),
            ),
            'default_service_code' => array(
                'title'       => __( 'Default Service Code', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => '',
                'placeholder' => __( 'Auto (Managed by Target Logistics)', 'wc-target-logistics' ),
                'description' => __( 'Leave blank for automatic service selection by Target Logistics. Enter P (Express Worldwide) only if you wish to force a specific code.', 'wc-target-logistics' ),
            ),
            'auto_quote_before_booking' => array(
                'title'       => __( 'Auto-Quote Route Verification', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Verify live route availability and select best service code dynamically before booking.', 'wc-target-logistics' ),
                'default'     => 'yes',
                'description' => __( 'Recommended: Ensures the destination country accepts the selected international export service.', 'wc-target-logistics' ),
            ),
            'default_incoterm' => array(
                'title'       => __( 'Default Incoterm', 'wc-target-logistics' ),
                'type'        => 'select',
                'default'     => 'DAP',
                'options'     => array(
                    'DAP' => 'DAP (Delivered at Place)',
                    'DDP' => 'DDP (Delivered Duty Paid)',
                    'EXW' => 'EXW (Ex Works)',
                    'FCA' => 'FCA (Free Carrier)',
                    'CPT' => 'CPT (Carriage Paid To)',
                ),
            ),
            'export_reason' => array(
                'title'       => __( 'Export Reason', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => 'Sale',
                'description' => __( 'Reason for shipment (e.g. Sale, Commercial, Gift, Sample).', 'wc-target-logistics' ),
            ),
            'default_hs_code' => array(
                'title'       => __( 'Default Harmonized Tariff (HS) Code', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => '610910',
                'description' => __( 'HS code for customs clearance. Used as fallback if product metadata does not specify one.', 'wc-target-logistics' ),
            ),

            // Section: Pickup Request Defaults
            'pickup_section' => array(
                'title'       => __( '4. Pickup Request Configuration', 'wc-target-logistics' ),
                'type'        => 'title',
                'description' => __( 'Configure warehouse courier pickup booking via /client/pickups.', 'wc-target-logistics' ),
            ),
            'enable_pickup' => array(
                'title'       => __( 'Enable Pickup Request', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Allow scheduling courier pickups for booked shipments.', 'wc-target-logistics' ),
                'default'     => 'yes',
            ),
            'auto_request_pickup' => array(
                'title'       => __( 'Auto-Schedule Pickup on Booking', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Automatically dispatch a pickup request to Target Logistics when a shipment is booked.', 'wc-target-logistics' ),
                'default'     => 'yes',
            ),
            'pickup_timing' => array(
                'title'       => __( 'Default Pickup Date/Time', 'wc-target-logistics' ),
                'type'        => 'select',
                'default'     => 'next_day_10',
                'options'     => array(
                    'next_day_10' => __( 'Next Day at 10:00 AM', 'wc-target-logistics' ),
                    'next_day_14' => __( 'Next Day at 02:00 PM', 'wc-target-logistics' ),
                    'same_day_16' => __( 'Same Day at 04:00 PM', 'wc-target-logistics' ),
                    'two_days_10' => __( '2 Days later at 10:00 AM', 'wc-target-logistics' ),
                ),
            ),
            'pickup_instructions' => array(
                'title'       => __( 'Default Pickup Instructions', 'wc-target-logistics' ),
                'type'        => 'textarea',
                'default'     => 'Call warehouse contact upon arrival. Shipment ready at reception.',
            ),

            // Section: Parcel Defaults
            'parcel_section' => array(
                'title'       => __( '5. Default Parcel Packaging', 'wc-target-logistics' ),
                'type'        => 'title',
                'description' => __( 'Fallback parcel weight and dimensions if products lack them.', 'wc-target-logistics' ),
            ),
            'default_weight' => array(
                'title'       => __( 'Default Weight (kg)', 'wc-target-logistics' ),
                'type'        => 'decimal',
                'default'     => '1.0',
            ),
            'default_length' => array(
                'title'       => __( 'Default Length (cm)', 'wc-target-logistics' ),
                'type'        => 'number',
                'default'     => '30',
            ),
            'default_width' => array(
                'title'       => __( 'Default Width (cm)', 'wc-target-logistics' ),
                'type'        => 'number',
                'default'     => '20',
            ),
            'default_height' => array(
                'title'       => __( 'Default Height (cm)', 'wc-target-logistics' ),
                'type'        => 'number',
                'default'     => '10',
            ),
            'parcel_strategy' => array(
                'title'       => __( 'Packaging Strategy', 'wc-target-logistics' ),
                'type'        => 'select',
                'default'     => 'single_box',
                'options'     => array(
                    'single_box'  => __( 'Combine all items into 1 package/parcel', 'wc-target-logistics' ),
                    'per_item'    => __( 'Each line item in its own package/parcel', 'wc-target-logistics' ),
                ),
            ),

            // Section: Order Automation
            'automation_section' => array(
                'title'       => __( '6. Order Automation', 'wc-target-logistics' ),
                'type'        => 'title',
                'description' => __( 'Automatically book shipments when orders transition states.', 'wc-target-logistics' ),
            ),
            'auto_book_status' => array(
                'title'       => __( 'Auto-Book on Order Status', 'wc-target-logistics' ),
                'type'        => 'select',
                'default'     => 'disabled',
                'options'     => array(
                    'disabled'      => __( 'Disabled (Manual booking via Order Actions only)', 'wc-target-logistics' ),
                    'wc-processing' => __( 'When Order becomes "Processing"', 'wc-target-logistics' ),
                    'wc-completed'  => __( 'When Order becomes "Completed"', 'wc-target-logistics' ),
                ),
            ),
            'mark_completed_after_booking' => array(
                'title'       => __( 'Change Status after Booking', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Automatically update order status to "Completed" once shipment is successfully booked.', 'wc-target-logistics' ),
                'default'     => 'no',
            ),

            // Section: Customer Tracking Display
            'tracking_section' => array(
                'title'       => __( '7. Customer Tracking Experience', 'wc-target-logistics' ),
                'type'        => 'title',
                'description' => __( 'Display tracking numbers and links to customers.', 'wc-target-logistics' ),
            ),
            'show_tracking_order_details' => array(
                'title'       => __( 'Show in Order Details', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Display tracking number and link in Customer Account > View Order and Order Received (Thank You) page.', 'wc-target-logistics' ),
                'default'     => 'yes',
            ),
            'show_tracking_in_email' => array(
                'title'       => __( 'Show in Customer Emails', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Include tracking info in Order Completed and Customer Invoice emails.', 'wc-target-logistics' ),
                'default'     => 'yes',
            ),
            'public_tracking_url_template' => array(
                'title'       => __( 'Public Tracking URL Template', 'wc-target-logistics' ),
                'type'        => 'text',
                'default'     => 'https://mawthook.io/track/{tracking_number}',
                'description' => __( 'Use {tracking_number} as a placeholder.', 'wc-target-logistics' ),
            ),

            // Section: Debugging
            'debug_section' => array(
                'title'       => __( '8. Debug & Logs', 'wc-target-logistics' ),
                'type'        => 'title',
            ),
            'debug_log' => array(
                'title'       => __( 'Enable Debug Logging', 'wc-target-logistics' ),
                'type'        => 'checkbox',
                'label'       => __( 'Log API requests, responses, and errors to WooCommerce > Status > Logs (target-logistics).', 'wc-target-logistics' ),
                'default'     => 'no',
            ),
        );
    }

    /**
     * Custom field renderer for Test Connection button
     */
    public function generate_target_logistics_test_btn_html( $key, $data ) {
        $field_key = $this->get_field_key( $key );
        $defaults  = array(
            'title'       => '',
            'description' => '',
        );
        $data = wp_parse_args( $data, $defaults );

        ob_start();
        ?>
        <tr valign="top">
            <th scope="row" class="titledesc">
                <label><?php echo esc_html( $data['title'] ); ?></label>
            </th>
            <td class="forminp">
                <button type="button" class="button button-secondary" id="tl-btn-test-connection">
                    <span class="dashicons dashicons-rest-api" style="vertical-align: middle; margin-right: 4px;"></span>
                    <?php esc_html_e( 'Test API Connection', 'wc-target-logistics' ); ?>
                </button>
                <span id="tl-test-connection-status" style="margin-left: 10px; font-weight: 600;"></span>
                <p class="description"><?php echo esc_html( $data['description'] ); ?></p>
            </td>
        </tr>
        <?php
        return ob_get_clean();
    }

    /**
     * AJAX handler for Test Connection
     */
    public function ajax_test_connection() {
        check_ajax_referer( 'target_logistics_admin_nonce', 'security' );

        if ( ! current_user_can( 'manage_woocommerce' ) ) {
            wp_send_json_error( array( 'message' => __( 'Permission denied.', 'wc-target-logistics' ) ) );
        }

        $api_key     = isset( $_POST['api_key'] ) ? sanitize_text_field( wp_unslash( $_POST['api_key'] ) ) : '';
        $environment = isset( $_POST['environment'] ) ? sanitize_text_field( wp_unslash( $_POST['environment'] ) ) : 'production';
        $custom_url  = isset( $_POST['custom_api_url'] ) ? sanitize_text_field( wp_unslash( $_POST['custom_api_url'] ) ) : '';

        // If api_key in POST is empty, fall back to saved key
        if ( empty( $api_key ) ) {
            $settings = get_option( 'woocommerce_target_logistics_settings', array() );
            $api_key  = isset( $settings['api_key'] ) ? $settings['api_key'] : '';
        }

        $api = new Target_Logistics_API( $api_key, $environment, $custom_url );
        $result = $api->test_connection();

        if ( $result['success'] ) {
            wp_send_json_success( array(
                'message' => $result['message'],
                'url'     => $api->get_base_url(),
            ) );
        } else {
            wp_send_json_error( array(
                'message' => $result['message'],
                'url'     => $api->get_base_url(),
            ) );
        }
    }
}
