<?php
/**
 * Target Logistics Shipment & Pickup Booking Service
 *
 * Maps WooCommerce orders to Target Logistics Client API payloads,
 * handles quotes, books shipments, and schedules courier pickups.
 *
 * @package WooCommerce_Target_Logistics
 */

defined( 'ABSPATH' ) || exit;

class Target_Logistics_Pickup_Service {

    /**
     * API Client
     *
     * @var Target_Logistics_API
     */
    protected $api;

    /**
     * Plugin Settings
     *
     * @var array
     */
    protected $settings;

    /**
     * Constructor
     *
     * @param Target_Logistics_API|null $api Optional API client instance.
     */
    public function __construct( $api = null ) {
        $this->settings = get_option( 'woocommerce_target_logistics_settings', array() );
        $this->api      = $api !== null ? $api : new Target_Logistics_API();
    }

    /**
     * Book Shipment and optional Pickup for a WooCommerce Order
     *
     * @param int|WC_Order $order Order ID or instance.
     * @param array        $overrides Optional manual overrides from admin meta box.
     * @return array Array with success, tracking_number, pickup_id, message.
     */
    public function book_order_shipment( $order, $overrides = array() ) {
        if ( is_numeric( $order ) ) {
            $order = wc_get_order( $order );
        }

        if ( ! $order ) {
            return array(
                'success' => false,
                'message' => __( 'Invalid order ID or order not found.', 'wc-target-logistics' ),
            );
        }

        // Build shipment payload
        $payload_result = $this->build_shipment_payload( $order, $overrides );
        if ( is_wp_error( $payload_result ) ) {
            return array(
                'success' => false,
                'message' => $payload_result->get_error_message(),
            );
        }

        $shipment_data = $payload_result;

        // Auto-quote if enabled and service code is needed
        $auto_quote = isset( $this->settings['auto_quote_before_booking'] ) && 'yes' === $this->settings['auto_quote_before_booking'];
        if ( ! empty( $overrides['carrier_code'] ) && 'MANUAL' === strtoupper( $overrides['carrier_code'] ) ) {
            $auto_quote = false;
        }

        if ( $auto_quote && empty( $overrides['service_code'] ) ) {
            $quote_payload = array(
                'sender'   => $shipment_data['sender'],
                'receiver' => $shipment_data['receiver'],
                'parcels'  => $shipment_data['parcels'],
                'items'    => $shipment_data['items'],
                'currency' => $shipment_data['currency'],
            );

            $quote_response = $this->api->get_quotes( $quote_payload );

            if ( ! is_wp_error( $quote_response ) && ! empty( $quote_response['data'] ) && is_array( $quote_response['data'] ) ) {
                $quotes = $quote_response['data'];
                // Prefer configured default service code if available in quote results, else take first
                $configured_service = ! empty( $this->settings['default_service_code'] ) ? trim( $this->settings['default_service_code'] ) : '';
                $selected_service = null;
                $selected_carrier = null;

                foreach ( $quotes as $q ) {
                    if ( ! empty( $configured_service ) && isset( $q['serviceCode'] ) && $q['serviceCode'] === $configured_service ) {
                        $selected_service = $q['serviceCode'];
                        $selected_carrier = isset( $q['carrier'] ) ? $q['carrier'] : null;
                        break;
                    }
                }

                if ( ! $selected_service && ! empty( $quotes[0]['serviceCode'] ) ) {
                    $selected_service = $quotes[0]['serviceCode'];
                    $selected_carrier = isset( $quotes[0]['carrier'] ) ? $quotes[0]['carrier'] : null;
                }

                if ( $selected_service ) {
                    $shipment_data['serviceCode'] = $selected_service;
                }
                if ( $selected_carrier && empty( $shipment_data['carrierCode'] ) ) {
                    $shipment_data['carrierCode'] = $selected_carrier;
                }
            }
        }

        // Call Create Shipment API
        $idempotency_key = 'wc-order-' . $order->get_id() . '-' . wp_generate_uuid4();
        $response = $this->api->create_shipment( $shipment_data, $idempotency_key );

        if ( is_wp_error( $response ) ) {
            $error_message = $response->get_error_message();
            $order->add_order_note( sprintf( __( 'Target Logistics booking failed: %s', 'wc-target-logistics' ), $error_message ) );
            return array(
                'success' => false,
                'message' => $error_message,
            );
        }

        if ( empty( $response['success'] ) || empty( $response['data'] ) ) {
            $err = isset( $response['error'] ) ? $response['error'] : __( 'Unknown API error.', 'wc-target-logistics' );
            $order->add_order_note( sprintf( __( 'Target Logistics booking failed: %s', 'wc-target-logistics' ), $err ) );
            return array(
                'success' => false,
                'message' => $err,
            );
        }

        $shipment_res    = $response['data'];
        $tracking_number = isset( $shipment_res['trackingNumber'] ) ? $shipment_res['trackingNumber'] : '';
        $carrier         = isset( $shipment_res['carrier'] ) ? $shipment_res['carrier'] : ( isset( $shipment_data['carrierCode'] ) ? $shipment_data['carrierCode'] : '' );
        $service         = isset( $shipment_res['serviceCode'] ) ? $shipment_res['serviceCode'] : ( isset( $shipment_data['serviceCode'] ) ? $shipment_data['serviceCode'] : '' );
        $status          = isset( $shipment_res['status'] ) ? $shipment_res['status'] : 'booked';
        $label_url       = isset( $shipment_res['labelUrl'] ) ? $shipment_res['labelUrl'] : '';
        $invoice_url     = isset( $shipment_res['invoiceUrl'] ) ? $shipment_res['invoiceUrl'] : '';

        // Save order meta
        $order->update_meta_data( '_target_logistics_tracking_number', $tracking_number );
        $order->update_meta_data( '_target_logistics_carrier', $carrier );
        $order->update_meta_data( '_target_logistics_service', $service );
        $order->update_meta_data( '_target_logistics_status', $status );
        $order->update_meta_data( '_target_logistics_label_url', $label_url );
        $order->update_meta_data( '_target_logistics_invoice_url', $invoice_url );
        $order->update_meta_data( '_target_logistics_booked_at', current_time( 'mysql' ) );
        $order->update_meta_data( '_target_logistics_raw_response', $shipment_res );

        // Pickup Booking
        $pickup_id     = null;
        $pickup_status = null;
        $enable_pickup = isset( $this->settings['enable_pickup'] ) && 'yes' === $this->settings['enable_pickup'];
        $auto_pickup   = isset( $this->settings['auto_request_pickup'] ) && 'yes' === $this->settings['auto_request_pickup'];
        $should_pickup = isset( $overrides['request_pickup'] ) ? (bool) $overrides['request_pickup'] : ( $enable_pickup && $auto_pickup );

        if ( $should_pickup ) {
            $pickup_result = $this->schedule_pickup( $order, $shipment_data, $overrides );
            if ( $pickup_result['success'] ) {
                $pickup_id     = $pickup_result['pickup_id'];
                $pickup_status = $pickup_result['status'];
            }
        }

        $order->save();

        // Build note
        $note_text = sprintf(
            __( 'Target Logistics Shipment Booked! Tracking Number: %1$s | Carrier: %2$s | Status: %3$s', 'wc-target-logistics' ),
            $tracking_number,
            $carrier ? $carrier : 'N/A',
            $status
        );
        if ( $pickup_id ) {
            $note_text .= sprintf( __( ' | Pickup Request ID: %s (Status: %s)', 'wc-target-logistics' ), $pickup_id, $pickup_status );
        }
        $order->add_order_note( $note_text );

        // Optionally complete order if configured
        if ( isset( $this->settings['mark_completed_after_booking'] ) && 'yes' === $this->settings['mark_completed_after_booking'] ) {
            if ( $order->get_status() !== 'completed' ) {
                $order->update_status( 'completed', __( 'Order auto-completed after Target Logistics shipment booking.', 'wc-target-logistics' ) );
            }
        }

        return array(
            'success'         => true,
            'tracking_number' => $tracking_number,
            'carrier'         => $carrier,
            'status'          => $status,
            'label_url'       => $label_url,
            'pickup_id'       => $pickup_id,
            'pickup_status'   => $pickup_status,
            'message'         => __( 'Shipment and pickup successfully processed with Target Logistics.', 'wc-target-logistics' ),
        );
    }

    /**
     * Schedule a Pickup Request with Client API (/client/pickups)
     *
     * @param WC_Order $order
     * @param array    $shipment_data
     * @param array    $overrides
     * @return array
     */
    public function schedule_pickup( $order, $shipment_data, $overrides = array() ) {
        $pickup_date = ! empty( $overrides['pickup_date'] ) ? $overrides['pickup_date'] : $this->calculate_pickup_datetime();
        $pickup_notes = ! empty( $overrides['pickup_instructions'] ) ? $overrides['pickup_instructions'] : ( isset( $this->settings['pickup_instructions'] ) ? $this->settings['pickup_instructions'] : '' );

        $pickup_payload = array(
            'sender'              => $shipment_data['sender'],
            'receiver'            => $shipment_data['receiver'],
            'parcels'             => $shipment_data['parcels'],
            'serviceCode'         => isset( $shipment_data['serviceCode'] ) ? $shipment_data['serviceCode'] : null,
            'requestedPickupDate' => $pickup_date,
            'pickupInstructions'  => $pickup_notes,
        );

        $response = $this->api->create_pickup( $pickup_payload );

        if ( is_wp_error( $response ) ) {
            $error_msg = $response->get_error_message();
            $order->add_order_note( sprintf( __( 'Pickup request failed: %s', 'wc-target-logistics' ), $error_msg ) );
            return array( 'success' => false, 'message' => $error_msg );
        }

        if ( empty( $response['success'] ) || empty( $response['data'] ) ) {
            $err = isset( $response['error'] ) ? $response['error'] : __( 'Failed to book pickup.', 'wc-target-logistics' );
            $order->add_order_note( sprintf( __( 'Pickup request failed: %s', 'wc-target-logistics' ), $err ) );
            return array( 'success' => false, 'message' => $err );
        }

        $pickup_res = $response['data'];
        $pickup_id  = isset( $pickup_res['id'] ) ? $pickup_res['id'] : null;
        $status     = isset( $pickup_res['status'] ) ? $pickup_res['status'] : 'REQUESTED';

        $order->update_meta_data( '_target_logistics_pickup_id', $pickup_id );
        $order->update_meta_data( '_target_logistics_pickup_status', $status );
        $order->update_meta_data( '_target_logistics_pickup_date', $pickup_date );
        $order->save();

        return array(
            'success'   => true,
            'pickup_id' => $pickup_id,
            'status'    => $status,
        );
    }

    /**
     * Refresh Tracking and Pickup Status from API
     *
     * @param WC_Order $order
     * @return array
     */
    public function refresh_status( $order ) {
        $tracking_number = $order->get_meta( '_target_logistics_tracking_number' );
        $pickup_id       = $order->get_meta( '_target_logistics_pickup_id' );

        $updated = false;
        $tracking_data = null;
        $pickup_data   = null;

        if ( ! empty( $tracking_number ) ) {
            $res = $this->api->get_tracking( $tracking_number );
            if ( ! is_wp_error( $res ) && ! empty( $res['data'] ) ) {
                $tracking_data = $res['data'];
                if ( ! empty( $tracking_data['status'] ) ) {
                    $order->update_meta_data( '_target_logistics_status', $tracking_data['status'] );
                    $updated = true;
                }
            }
        }

        if ( ! empty( $pickup_id ) ) {
            $p_res = $this->api->get_pickup_status( $pickup_id );
            if ( ! is_wp_error( $p_res ) && ! empty( $p_res['data'] ) ) {
                $pickup_data = $p_res['data'];
                if ( ! empty( $pickup_data['status'] ) ) {
                    $order->update_meta_data( '_target_logistics_pickup_status', $pickup_data['status'] );
                    $updated = true;
                }
                if ( ! empty( $pickup_data['shipment']['labelUrl'] ) ) {
                    $order->update_meta_data( '_target_logistics_label_url', $pickup_data['shipment']['labelUrl'] );
                    $updated = true;
                }
            }
        }

        if ( $updated ) {
            $order->save();
        }

        return array(
            'success'       => true,
            'tracking'      => $tracking_data,
            'pickup'        => $pickup_data,
            'current_status'=> $order->get_meta( '_target_logistics_status' ),
            'pickup_status' => $order->get_meta( '_target_logistics_pickup_status' ),
        );
    }

    /**
     * Fetch Live Rates / Quotes for an order
     *
     * @param WC_Order $order
     * @param array    $overrides
     * @return array
     */
    public function get_order_quotes( $order, $overrides = array() ) {
        $payload_result = $this->build_shipment_payload( $order, $overrides );
        if ( is_wp_error( $payload_result ) ) {
            return array(
                'success' => false,
                'message' => $payload_result->get_error_message(),
            );
        }

        $quote_payload = array(
            'sender'   => $payload_result['sender'],
            'receiver' => $payload_result['receiver'],
            'parcels'  => $payload_result['parcels'],
            'items'    => $payload_result['items'],
            'currency' => $payload_result['currency'],
        );

        $response = $this->api->get_quotes( $quote_payload );

        if ( is_wp_error( $response ) ) {
            return array(
                'success' => false,
                'message' => $response->get_error_message(),
            );
        }

        return $response;
    }

    /**
     * Build the shipment payload from WooCommerce Order
     *
     * @param WC_Order $order
     * @param array    $overrides
     * @return array|WP_Error
     */
    public function build_shipment_payload( $order, $overrides = array() ) {
        // Sender address from settings
        $sender_company = ! empty( $this->settings['sender_company'] ) ? $this->settings['sender_company'] : get_bloginfo( 'name' );
        $sender_contact = ! empty( $this->settings['sender_contact_person'] ) ? $this->settings['sender_contact_person'] : 'Warehouse Contact';
        $sender_phone   = ! empty( $this->settings['sender_phone'] ) ? $this->settings['sender_phone'] : '';
        $sender_country = ! empty( $this->settings['sender_country_code'] ) ? strtoupper( $this->settings['sender_country_code'] ) : 'KW';
        $sender_city    = ! empty( $this->settings['sender_city'] ) ? $this->settings['sender_city'] : 'Kuwait City';
        $sender_postal  = ! empty( $this->settings['sender_postal_code'] ) ? $this->settings['sender_postal_code'] : '13001';
        $sender_email   = ! empty( $this->settings['sender_email'] ) ? $this->settings['sender_email'] : get_option( 'admin_email' );
        $sender_prefix  = ! empty( $this->settings['sender_phone_country_code'] ) ? $this->settings['sender_phone_country_code'] : '+965';

        $raw_street_lines = ! empty( $this->settings['sender_street_lines'] ) ? explode( "\n", $this->settings['sender_street_lines'] ) : array( 'Warehouse Block 1' );
        $sender_street_lines = array_values( array_filter( array_map( 'trim', $raw_street_lines ) ) );
        if ( empty( $sender_street_lines ) ) {
            $sender_street_lines = array( 'Warehouse District' );
        }

        $sender = array(
            'company'          => $sender_company,
            'contactPerson'    => $sender_contact,
            'phone'            => preg_replace( '/[^0-9]/', '', $sender_phone ),
            'phoneCountryCode' => $sender_prefix,
            'email'            => $sender_email,
            'countryCode'      => $sender_country,
            'city'             => $sender_city,
            'postalCode'       => $sender_postal,
            'streetLines'      => $sender_street_lines,
        );

        // Receiver address from order
        $rec_first_name = $order->get_shipping_first_name() ?: $order->get_billing_first_name();
        $rec_last_name  = $order->get_shipping_last_name() ?: $order->get_billing_last_name();
        $rec_name       = trim( $rec_first_name . ' ' . $rec_last_name );
        if ( empty( $rec_name ) ) {
            $rec_name = $order->get_shipping_company() ?: $order->get_billing_company() ?: 'Valued Customer';
        }

        $rec_phone = $order->get_billing_phone();
        $rec_email = $order->get_billing_email();

        $rec_country = $order->get_shipping_country() ?: $order->get_billing_country() ?: 'KW';
        $rec_city    = $order->get_shipping_city() ?: $order->get_billing_city() ?: 'Kuwait City';
        $rec_postal  = $order->get_shipping_postcode() ?: $order->get_billing_postcode() ?: '00000';

        $rec_street1 = $order->get_shipping_address_1() ?: $order->get_billing_address_1();
        $rec_street2 = $order->get_shipping_address_2() ?: $order->get_billing_address_2();

        $receiver_street_lines = array_values( array_filter( array( trim( $rec_street1 ), trim( $rec_street2 ) ) ) );
        if ( empty( $receiver_street_lines ) ) {
            $receiver_street_lines = array( 'Customer Address' );
        }

        if ( empty( $rec_phone ) ) {
            return new WP_Error( 'missing_receiver_phone', __( 'Order is missing receiver phone number. Please add phone before booking.', 'wc-target-logistics' ) );
        }

        $clean_phone = preg_replace( '/[^0-9]/', '', $rec_phone );

        $receiver = array(
            'contactPerson'    => $rec_name,
            'phone'            => $clean_phone,
            'phoneCountryCode' => '+965', // fallback
            'email'            => $rec_email ?: 'customer@example.com',
            'countryCode'      => strtoupper( $rec_country ),
            'city'             => $rec_city,
            'postalCode'       => $rec_postal,
            'streetLines'      => $receiver_street_lines,
        );

        // Normalize receiver phone country code if phone starts with country prefix
        if ( strpos( $rec_phone, '+' ) === 0 ) {
            // E.g. +96512345678 or +971...
            if ( preg_match( '/^(\+\d{1,4})(\d+)$/', $rec_phone, $matches ) ) {
                $receiver['phoneCountryCode'] = $matches[1];
                $receiver['phone']            = $matches[2];
            }
        }

        // Build Items and Parcels
        $items   = array();
        $parcels = array();

        $currency = $order->get_currency() ?: 'KWD';
        $default_hs = ! empty( $this->settings['default_hs_code'] ) ? trim( $this->settings['default_hs_code'] ) : '610910';
        $default_weight = ! empty( $this->settings['default_weight'] ) ? floatval( $this->settings['default_weight'] ) : 1.0;
        $default_l      = ! empty( $this->settings['default_length'] ) ? floatval( $this->settings['default_length'] ) : 30.0;
        $default_w      = ! empty( $this->settings['default_width'] ) ? floatval( $this->settings['default_width'] ) : 20.0;
        $default_h      = ! empty( $this->settings['default_height'] ) ? floatval( $this->settings['default_height'] ) : 10.0;
        $strategy       = ! empty( $this->settings['parcel_strategy'] ) ? $this->settings['parcel_strategy'] : 'single_box';

        $total_weight = 0.0;

        foreach ( $order->get_items() as $item_id => $item ) {
            $product  = $item->get_product();
            $qty      = max( 1, (int) $item->get_quantity() );
            $subtotal = floatval( $item->get_total() );
            $unit_val = $qty > 0 ? round( $subtotal / $qty, 3 ) : 1.0;
            if ( $unit_val <= 0 ) {
                $unit_val = 1.0;
            }

            $weight = $default_weight;
            if ( $product && $product->has_weight() ) {
                $w = floatval( $product->get_weight() );
                if ( $w > 0 ) {
                    // Convert to kg if store uses different unit
                    $weight_unit = get_option( 'woocommerce_weight_unit' );
                    if ( 'g' === $weight_unit ) {
                        $weight = $w / 1000.0;
                    } elseif ( 'lbs' === $weight_unit ) {
                        $weight = $w * 0.453592;
                    } elseif ( 'oz' === $weight_unit ) {
                        $weight = $w * 0.0283495;
                    } else {
                        $weight = $w;
                    }
                }
            }

            $line_weight = $weight * $qty;
            $total_weight += $line_weight;

            $items[] = array(
                'description'     => substr( $item->get_name(), 0, 100 ),
                'quantity'        => $qty,
                'unitValue'       => $unit_val,
                'currency'        => $currency,
                'countryOfOrigin' => $sender_country,
                'hsCode'          => $default_hs,
                'weight'          => round( $line_weight, 2 ),
            );

            if ( 'per_item' === $strategy ) {
                for ( $i = 0; $i < $qty; $i++ ) {
                    $parcels[] = array(
                        'weight'      => round( max( 0.1, $weight ), 2 ),
                        'length'      => (int) $default_l,
                        'width'       => (int) $default_w,
                        'height'      => (int) $default_h,
                        'description' => substr( $item->get_name(), 0, 50 ),
                    );
                }
            }
        }

        if ( 'single_box' === $strategy || empty( $parcels ) ) {
            $parcels = array(
                array(
                    'weight'      => round( max( 0.5, $total_weight ), 2 ),
                    'length'      => (int) $default_l,
                    'width'       => (int) $default_w,
                    'height'      => (int) $default_h,
                    'description' => sprintf( 'Order #%s Goods', $order->get_order_number() ),
                ),
            );
        }

        // Carrier & Service Code
        $carrier_code = ! empty( $overrides['carrier_code'] ) ? trim( $overrides['carrier_code'] ) : ( ! empty( $this->settings['default_carrier_code'] ) ? trim( $this->settings['default_carrier_code'] ) : '' );
        $service_code = ! empty( $overrides['service_code'] ) ? trim( $overrides['service_code'] ) : ( ! empty( $this->settings['default_service_code'] ) ? trim( $this->settings['default_service_code'] ) : '' );
        $incoterm     = ! empty( $this->settings['default_incoterm'] ) ? $this->settings['default_incoterm'] : 'DAP';
        $export_reason= ! empty( $this->settings['export_reason'] ) ? $this->settings['export_reason'] : 'Sale';

        $payload = array(
            'sender'       => $sender,
            'receiver'     => $receiver,
            'parcels'      => $parcels,
            'items'        => $items,
            'currency'     => $currency,
            'incoterm'     => $incoterm,
            'exportReason' => $export_reason,
            'reference'    => 'WC-ORDER-' . $order->get_order_number(),
            'remarks'      => $order->get_customer_note() ?: 'WooCommerce Online Order',
        );

        if ( ! empty( $carrier_code ) ) {
            $payload['carrierCode'] = $carrier_code;
        }
        if ( ! empty( $service_code ) ) {
            $payload['serviceCode'] = $service_code;
        }

        return $payload;
    }

    /**
     * Compute default ISO datetime for pickup request
     *
     * @return string ISO 8601 string
     */
    public function calculate_pickup_datetime() {
        $timing = ! empty( $this->settings['pickup_timing'] ) ? $this->settings['pickup_timing'] : 'next_day_10';
        $now    = time();

        switch ( $timing ) {
            case 'same_day_16':
                $timestamp = strtotime( 'today 16:00:00' );
                if ( $timestamp <= $now ) {
                    $timestamp = strtotime( '+1 day 16:00:00' );
                }
                break;
            case 'next_day_14':
                $timestamp = strtotime( '+1 day 14:00:00' );
                break;
            case 'two_days_10':
                $timestamp = strtotime( '+2 days 10:00:00' );
                break;
            case 'next_day_10':
            default:
                $timestamp = strtotime( '+1 day 10:00:00' );
                break;
        }

        return gmdate( 'Y-m-d\TH:i:s\Z', $timestamp );
    }
}
