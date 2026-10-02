<?php
/**
 * Target Logistics Client API Service
 *
 * Handles HTTP requests to the Target Logistics Client API endpoints.
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class Target_Logistics_API {

    /**
     * API Base URL
     *
     * @var string
     */
    private $base_url;

    /**
     * API Key
     *
     * @var string
     */
    private $api_key;

    /**
     * Request timeout in seconds
     *
     * @var int
     */
    private $timeout = 30;

    /**
     * Constructor
     *
     * @param string $api_key Optional override.
     * @param string $environment Optional override (production|local|custom).
     * @param string $custom_url Optional custom URL.
     */
    public function __construct( $api_key = null, $environment = null, $custom_url = null ) {
        $settings = get_option( 'woocommerce_target_logistics_settings', array() );

        $this->api_key = $api_key !== null ? trim( $api_key ) : ( isset( $settings['api_key'] ) ? trim( $settings['api_key'] ) : '' );

        $env = $environment !== null ? $environment : ( isset( $settings['environment'] ) ? $settings['environment'] : 'production' );
        $custom = $custom_url !== null ? $custom_url : ( isset( $settings['custom_api_url'] ) ? $settings['custom_api_url'] : '' );

        $this->base_url = $this->resolve_base_url( $env, $custom );
    }

    /**
     * Resolve Base URL depending on environment
     *
     * @param string $environment Environment key.
     * @param string $custom_url Custom base URL.
     * @return string
     */
    public function resolve_base_url( $environment, $custom_url = '' ) {
        switch ( $environment ) {
            case 'local':
                return 'http://localhost:8899/api';
            case 'custom':
                $trimmed = rtrim( trim( $custom_url ), '/' );
                if ( empty( $trimmed ) ) {
                    return 'https://api.target-kw.com/api';
                }
                if ( ! preg_match( '#/(api|v1)$#i', $trimmed ) ) {
                    $trimmed .= '/api';
                }
                return $trimmed;
            case 'production':
            default:
                return 'https://api.target-kw.com/api';
        }
    }

    /**
     * Get Base URL
     *
     * @return string
     */
    public function get_base_url() {
        return $this->base_url;
    }

    /**
     * Standard Request Headers
     *
     * @param string $idempotency_key Optional idempotency key.
     * @return array
     */
    private function get_headers( $idempotency_key = '' ) {
        $headers = array(
            'Content-Type' => 'application/json',
            'Accept'       => 'application/json',
            'x-api-key'    => $this->api_key,
            'User-Agent'   => 'WooCommerce-TargetLogistics/' . WC_TARGET_LOGISTICS_VERSION,
        );

        if ( ! empty( $idempotency_key ) ) {
            $headers['Idempotency-Key'] = $idempotency_key;
        }

        return $headers;
    }

    /**
     * Make HTTP Request
     *
     * @param string $endpoint Relative endpoint e.g. '/v1/shipments'.
     * @param string $method GET, POST, PUT, DELETE.
     * @param array|null $payload Body payload for POST/PUT.
     * @param string $idempotency_key Optional idempotency key.
     * @return array|WP_Error
     */
    public function request( $endpoint, $method = 'GET', $payload = null, $idempotency_key = '' ) {
        if ( empty( $this->api_key ) ) {
            return new WP_Error( 'missing_api_key', __( 'Target Logistics API Key is missing. Please configure it in settings.', 'wc-target-logistics' ) );
        }

        $url = rtrim( $this->base_url, '/' ) . '/' . ltrim( $endpoint, '/' );

        $args = array(
            'method'      => strtoupper( $method ),
            'headers'     => $this->get_headers( $idempotency_key ),
            'timeout'     => $this->timeout,
            'redirection' => 5,
            'httpversion' => '1.1',
            'sslverify'   => ( strpos( $url, 'https://' ) === 0 ),
        );

        if ( $payload !== null && in_array( $args['method'], array( 'POST', 'PUT', 'PATCH' ), true ) ) {
            $args['body'] = wp_json_encode( $payload );
        }

        $this->log( sprintf( 'API Request: %s %s', $args['method'], $url ), $payload, 'info' );

        $response = wp_remote_request( $url, $args );

        if ( is_wp_error( $response ) ) {
            $this->log( 'API Request Failed (WP_Error): ' . $response->get_error_message(), array( 'url' => $url ), 'error' );
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code( $response );
        $raw_body    = wp_remote_retrieve_body( $response );
        $json        = json_decode( $raw_body, true );

        if ( $status_code < 200 || $status_code >= 300 ) {
            $error_message = '';
            if ( is_array( $json ) && ! empty( $json['error'] ) ) {
                $error_message = $json['error'];
                if ( ! empty( $json['details'] ) && is_array( $json['details'] ) ) {
                    $error_message .= ' (' . implode( ', ', $json['details'] ) . ')';
                }
            } elseif ( ! empty( $raw_body ) ) {
                $error_message = wp_strip_all_tags( substr( $raw_body, 0, 300 ) );
            } else {
                $error_message = sprintf( __( 'HTTP Error %d returned by Target Logistics API.', 'wc-target-logistics' ), $status_code );
            }

            $this->log( sprintf( 'API Error [%d]: %s', $status_code, $error_message ), array(
                'url'      => $url,
                'request'  => $payload,
                'response' => $json ? $json : $raw_body,
            ), 'error' );

            return new WP_Error( 'api_error_' . $status_code, $error_message, array(
                'status'   => $status_code,
                'response' => $json,
            ) );
        }

        $this->log( sprintf( 'API Success [%d]: %s', $status_code, $endpoint ), $json, 'info' );
        return $json;
    }

    /**
     * Test connection to API
     *
     * @return array Array with success bool and message
     */
    public function test_connection() {
        if ( empty( $this->api_key ) ) {
            return array(
                'success' => false,
                'message' => __( 'API Key cannot be blank.', 'wc-target-logistics' ),
            );
        }

        // Test with address book or a lightweight test quote
        $response = $this->request( '/v1/addresses', 'GET' );

        if ( is_wp_error( $response ) ) {
            return array(
                'success' => false,
                'message' => $response->get_error_message(),
            );
        }

        if ( isset( $response['success'] ) && $response['success'] ) {
            return array(
                'success' => true,
                'message' => __( 'Connection successful! API key is valid and connected to Target Logistics.', 'wc-target-logistics' ),
            );
        }

        return array(
            'success' => true,
            'message' => __( 'Connected to API endpoint successfully.', 'wc-target-logistics' ),
        );
    }

    /**
     * Get Carrier Rates / Quote
     *
     * POST /v1/quotes
     *
     * @param array $quote_data Payload with sender, receiver, parcels, items.
     * @return array|WP_Error
     */
    public function get_quotes( array $quote_data ) {
        return $this->request( '/v1/quotes', 'POST', $quote_data );
    }

    /**
     * Create / Book Shipment
     *
     * POST /v1/shipments
     *
     * @param array  $shipment_data Shipment payload.
     * @param string $idempotency_key Optional idempotency UUID.
     * @return array|WP_Error
     */
    public function create_shipment( array $shipment_data, $idempotency_key = '' ) {
        if ( empty( $idempotency_key ) ) {
            $idempotency_key = wp_generate_uuid4();
        }
        return $this->request( '/v1/shipments', 'POST', $shipment_data, $idempotency_key );
    }

    /**
     * Update Shipment Details
     *
     * PUT /v1/shipments/:trackingNumber
     *
     * @param string $tracking_number Tracking number.
     * @param array  $update_data Data to update.
     * @return array|WP_Error
     */
    public function update_shipment( $tracking_number, array $update_data ) {
        return $this->request( '/v1/shipments/' . rawurlencode( $tracking_number ), 'PUT', $update_data );
    }

    /**
     * Get Shipment Tracking Info
     *
     * GET /v1/tracking/:trackingNumber
     *
     * @param string $tracking_number Tracking number.
     * @return array|WP_Error
     */
    public function get_tracking( $tracking_number ) {
        return $this->request( '/v1/tracking/' . rawurlencode( $tracking_number ), 'GET' );
    }

    /**
     * Book / Create Pickup Request
     *
     * POST /client/pickups
     *
     * @param array  $pickup_data Payload: sender, receiver, parcels, requestedPickupDate, pickupInstructions.
     * @param string $idempotency_key Optional idempotency key.
     * @return array|WP_Error
     */
    public function create_pickup( array $pickup_data, $idempotency_key = '' ) {
        if ( empty( $idempotency_key ) ) {
            $idempotency_key = wp_generate_uuid4();
        }
        return $this->request( '/client/pickups', 'POST', $pickup_data, $idempotency_key );
    }

    /**
     * Get Pickup Request Status
     *
     * GET /client/pickups/:id
     *
     * @param string $pickup_id Pickup request ID.
     * @return array|WP_Error
     */
    public function get_pickup_status( $pickup_id ) {
        return $this->request( '/client/pickups/' . rawurlencode( $pickup_id ), 'GET' );
    }

    /**
     * Get Unified Tracking
     *
     * GET /client/shipments/:trackingNumber/tracking
     *
     * @param string $tracking_number Tracking number.
     * @return array|WP_Error
     */
    public function get_unified_tracking( $tracking_number ) {
        return $this->request( '/client/shipments/' . rawurlencode( $tracking_number ) . '/tracking', 'GET' );
    }

    /**
     * Helper to log messages to WooCommerce logger and rolling local buffer
     *
     * @param string $message Log message.
     * @param mixed  $context Context data.
     * @param string $level Log level: 'info', 'error', 'warning'.
     */
    public static function log( $message, $context = null, $level = 'info' ) {
        // 1. Write to WooCommerce system logs
        if ( function_exists( 'wc_get_logger' ) ) {
            $logger = wc_get_logger();
            $log_message = $message;
            if ( $context !== null ) {
                $log_message .= ' | Context: ' . wp_json_encode( $context );
            }
            if ( 'error' === $level ) {
                $logger->error( $log_message, array( 'source' => 'target-logistics' ) );
            } else {
                $logger->info( $log_message, array( 'source' => 'target-logistics' ) );
            }
        }

        // 2. Rolling buffer in WordPress options for instant in-plugin settings viewing
        $recent_logs = get_option( 'target_logistics_recent_logs', array() );
        if ( ! is_array( $recent_logs ) ) {
            $recent_logs = array();
        }

        $entry = array(
            'time'    => current_time( 'Y-m-d H:i:s' ),
            'level'   => strtoupper( $level ),
            'message' => $message,
            'context' => $context,
        );

        array_unshift( $recent_logs, $entry );
        if ( count( $recent_logs ) > 50 ) {
            $recent_logs = array_slice( $recent_logs, 0, 50 );
        }

        update_option( 'target_logistics_recent_logs', $recent_logs, false );
    }
}
