<?php
/**
 * Target Logistics Shipping Method
 *
 * Registers Target Logistics as a native WooCommerce Shipping Method for Shipping Zones.
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class WC_Target_Logistics_Shipping_Method extends WC_Shipping_Method {

    /**
     * Rate Mode: 'dynamic', 'flat', or 'free'
     *
     * @var string
     */
    public $rate_mode;

    /**
     * Fallback cost if API quote is unavailable
     *
     * @var float
     */
    public $fallback_cost;

    /**
     * Additional handling fee
     *
     * @var string
     */
    public $handling_fee;

    /**
     * Constructor
     *
     * @param int $instance_id Shipping zone instance ID.
     */
    public function __construct( $instance_id = 0 ) {
        $this->id                 = 'target_logistics_shipping';
        $this->instance_id        = absint( $instance_id );
        $this->method_title       = __( 'Target Logistics', 'wc-target-logistics' );
        $this->method_description = __( 'Deliver orders locally and internationally via Target Logistics with live quotes or fixed rates.', 'wc-target-logistics' );
        $this->supports           = array(
            'shipping-zones',
            'instance-settings',
            'instance-settings-modal',
        );

        $this->init();
    }

    /**
     * Initialize Settings & Fields
     */
    public function init() {
        $this->init_form_fields();
        $this->init_settings();

        $this->title         = $this->get_option( 'title', __( 'Target Express Delivery', 'wc-target-logistics' ) );
        $this->tax_status    = $this->get_option( 'tax_status', 'taxable' );
        $this->cost          = $this->get_option( 'cost', '3.000' );
        $this->rate_mode     = $this->get_option( 'rate_mode', 'flat' );
        $this->fallback_cost = $this->get_option( 'fallback_cost', '3.000' );
        $this->handling_fee  = $this->get_option( 'handling_fee', '0' );

        add_action( 'woocommerce_update_options_shipping_' . $this->id, array( $this, 'process_admin_options' ) );
    }

    /**
     * Define Instance Settings Fields for Shipping Zones
     */
    public function init_form_fields() {
        $this->instance_form_fields = array(
            'title' => array(
                'title'       => __( 'Method Title', 'wc-target-logistics' ),
                'type'        => 'text',
                'description' => __( 'This controls the title which the customer sees during checkout.', 'wc-target-logistics' ),
                'default'     => __( 'Target Express Delivery', 'wc-target-logistics' ),
                'desc_tip'    => true,
            ),
            'rate_mode' => array(
                'title'       => __( 'Calculation Mode', 'wc-target-logistics' ),
                'type'        => 'select',
                'description' => __( 'Choose how shipping cost is calculated for this zone.', 'wc-target-logistics' ),
                'default'     => 'flat',
                'options'     => array(
                    'flat'    => __( 'Flat Rate (Fixed fee per order)', 'wc-target-logistics' ),
                    'dynamic' => __( 'Live Rates (Real-time quote via Target Logistics API)', 'wc-target-logistics' ),
                    'free'    => __( 'Free Shipping via Target Logistics', 'wc-target-logistics' ),
                ),
            ),
            'cost' => array(
                'title'       => __( 'Shipping Cost', 'wc-target-logistics' ),
                'type'        => 'text',
                'description' => __( 'Fixed cost charged to customer when in Flat Rate mode.', 'wc-target-logistics' ),
                'default'     => '3.000',
                'desc_tip'    => true,
            ),
            'handling_fee' => array(
                'title'       => __( 'Handling Fee / Markup', 'wc-target-logistics' ),
                'type'        => 'text',
                'description' => __( 'Optional markup added to the rate (e.g. 1.000 or 10%).', 'wc-target-logistics' ),
                'default'     => '0',
                'desc_tip'    => true,
            ),
            'fallback_cost' => array(
                'title'       => __( 'Fallback Cost', 'wc-target-logistics' ),
                'type'        => 'text',
                'description' => __( 'Used in Live Rates mode if the Target Logistics API is temporarily unreachable or returns no quotes.', 'wc-target-logistics' ),
                'default'     => '3.000',
                'desc_tip'    => true,
            ),
            'tax_status' => array(
                'title'   => __( 'Tax Status', 'wc-target-logistics' ),
                'type'    => 'select',
                'default' => 'taxable',
                'options' => array(
                    'taxable' => __( 'Taxable', 'wc-target-logistics' ),
                    'none'    => __( 'None', 'wc-target-logistics' ),
                ),
            ),
        );
        $this->form_fields = $this->instance_form_fields;
    }

    /**
     * Calculate Shipping at Checkout
     *
     * @param array $package Shipping package.
     */
    public function calculate_shipping( $package = array() ) {
        // Free shipping mode
        if ( 'free' === $this->rate_mode ) {
            $this->add_rate( array(
                'id'        => $this->get_rate_id(),
                'label'     => $this->title,
                'cost'      => 0,
                'tax_status'=> $this->tax_status,
                'package'   => $package,
            ) );
            return;
        }

        // Flat rate mode
        if ( 'flat' === $this->rate_mode ) {
            $cost = floatval( $this->cost ) + $this->calculate_markup( floatval( $this->cost ) );
            $this->add_rate( array(
                'id'        => $this->get_rate_id(),
                'label'     => $this->title,
                'cost'      => max( 0, $cost ),
                'tax_status'=> $this->tax_status,
                'package'   => $package,
            ) );
            return;
        }

        // Live Rates Dynamic mode
        if ( 'dynamic' === $this->rate_mode ) {
            $quotes = $this->fetch_live_quotes( $package );

            if ( ! empty( $quotes ) && is_array( $quotes ) ) {
                foreach ( $quotes as $q ) {
                    $service_code = ! empty( $q['serviceCode'] ) ? $q['serviceCode'] : 'STD';
                    $service_name = ! empty( $q['serviceName'] ) ? $q['serviceName'] : 'Express';
                    $raw_price    = isset( $q['totalPrice'] ) ? floatval( $q['totalPrice'] ) : floatval( $this->fallback_cost );
                    $final_price  = $raw_price + $this->calculate_markup( $raw_price );

                    $this->add_rate( array(
                        'id'        => $this->get_rate_id( $service_code ),
                        'label'     => $this->title . ' (' . $service_name . ')',
                        'cost'      => max( 0, $final_price ),
                        'tax_status'=> $this->tax_status,
                        'package'   => $package,
                        'meta_data' => array(
                            'carrier_code' => ! empty( $q['carrier'] ) ? $q['carrier'] : 'DGR',
                            'service_code' => $service_code,
                        ),
                    ) );
                }
                return;
            }

            // Fallback rate if dynamic quote returned empty
            $fallback = floatval( $this->fallback_cost ?: $this->cost ?: 3.0 );
            $this->add_rate( array(
                'id'        => $this->get_rate_id( 'fallback' ),
                'label'     => $this->title,
                'cost'      => max( 0, $fallback + $this->calculate_markup( $fallback ) ),
                'tax_status'=> $this->tax_status,
                'package'   => $package,
            ) );
        }
    }

    /**
     * Compute handling markup
     *
     * @param float $base_cost
     * @return float
     */
    private function calculate_markup( $base_cost ) {
        $fee = trim( (string) $this->handling_fee );
        if ( empty( $fee ) || '0' === $fee ) {
            return 0.0;
        }

        // Percentage fee (e.g. 10%)
        if ( substr( $fee, -1 ) === '%' ) {
            $pct = floatval( rtrim( $fee, '%' ) );
            return ( $base_cost * $pct ) / 100.0;
        }

        return floatval( $fee );
    }

    /**
     * Fetch Live Rate Quotes via Target Logistics Client API
     *
     * @param array $package
     * @return array
     */
    private function fetch_live_quotes( $package ) {
        $settings = get_option( 'woocommerce_target_logistics_settings', array() );
        $api_key  = isset( $settings['api_key'] ) ? $settings['api_key'] : '';

        if ( empty( $api_key ) ) {
            return array();
        }

        $env        = isset( $settings['environment'] ) ? $settings['environment'] : 'production';
        $custom_url = isset( $settings['custom_api_url'] ) ? $settings['custom_api_url'] : '';

        $api = new Target_Logistics_API( $api_key, $env, $custom_url );

        // Sender from settings
        $sender = array(
            'countryCode' => ! empty( $settings['sender_country_code'] ) ? strtoupper( $settings['sender_country_code'] ) : 'KW',
            'city'        => ! empty( $settings['sender_city'] ) ? $settings['sender_city'] : 'Kuwait City',
            'postalCode'  => ! empty( $settings['sender_postal_code'] ) ? $settings['sender_postal_code'] : '13001',
        );

        // Receiver from package destination
        $dest = isset( $package['destination'] ) ? $package['destination'] : array();
        $receiver = array(
            'countryCode' => ! empty( $dest['country'] ) ? strtoupper( $dest['country'] ) : 'KW',
            'city'        => ! empty( $dest['city'] ) ? $dest['city'] : 'Kuwait City',
            'postalCode'  => ! empty( $dest['postcode'] ) ? $dest['postcode'] : '00000',
        );

        // Compute total weight and parcels from contents
        $total_weight = 0.0;
        $items = array();

        if ( ! empty( $package['contents'] ) && is_array( $package['contents'] ) ) {
            foreach ( $package['contents'] as $values ) {
                $product = isset( $values['data'] ) ? $values['data'] : null;
                $qty     = isset( $values['quantity'] ) ? absint( $values['quantity'] ) : 1;

                if ( $product ) {
                    $item_weight = floatval( $product->get_weight() ?: 0.5 );
                    $total_weight += ( $item_weight * $qty );

                    $items[] = array(
                        'description'   => substr( $product->get_name(), 0, 50 ),
                        'quantity'      => $qty,
                        'declaredValue' => floatval( $product->get_price() ?: 1.0 ),
                    );
                }
            }
        }

        if ( $total_weight <= 0 ) {
            $total_weight = 1.0;
        }

        $currency = get_woocommerce_currency();

        $quote_payload = array(
            'sender'   => $sender,
            'receiver' => $receiver,
            'parcels'  => array(
                array(
                    'weight'     => round( $total_weight, 2 ),
                    'dimensions' => array( 'length' => 20, 'width' => 15, 'height' => 10 ),
                ),
            ),
            'items'    => ! empty( $items ) ? $items : array( array( 'description' => 'General Merchandise', 'quantity' => 1, 'declaredValue' => 10 ) ),
            'currency' => $currency,
        );

        $response = $api->get_quotes( $quote_payload );

        if ( ! is_wp_error( $response ) && ! empty( $response['data'] ) && is_array( $response['data'] ) ) {
            return $response['data'];
        }

        return array();
    }
}
