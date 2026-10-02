/**
 * Target Logistics Admin JavaScript
 */

(function($) {
    'use strict';

    $(document).ready(function() {

        // ==========================================
        // 1. Settings Screen: Test API Connection
        // ==========================================
        $('#tl-btn-test-connection').on('click', function(e) {
            e.preventDefault();

            var $btn    = $(this);
            var $status = $('#tl-test-connection-status');
            var apiKey  = $('#woocommerce_target_logistics_api_key').val();
            var env     = $('#woocommerce_target_logistics_environment').val();
            var custom  = $('#woocommerce_target_logistics_custom_api_url').val();

            $btn.prop('disabled', true);
            $status.html('<span class="dashicons dashicons-update tl-spinning"></span> ' + targetLogisticsAdmin.i18n.testing);

            $.post(targetLogisticsAdmin.ajax_url, {
                action: 'target_logistics_test_connection',
                security: targetLogisticsAdmin.nonce,
                api_key: apiKey,
                environment: env,
                custom_api_url: custom
            }, function(response) {
                $btn.prop('disabled', false);
                if (response.success) {
                    $status.html('<span style="color: #15803d;"><span class="dashicons dashicons-yes-alt"></span> ' + response.data.message + '</span>');
                } else {
                    var msg = response.data && response.data.message ? response.data.message : targetLogisticsAdmin.i18n.error;
                    $status.html('<span style="color: #b91c1c;"><span class="dashicons dashicons-warning"></span> ' + msg + '</span>');
                }
            }).fail(function() {
                $btn.prop('disabled', false);
                $status.html('<span style="color: #b91c1c;"><span class="dashicons dashicons-warning"></span> ' + targetLogisticsAdmin.i18n.error + '</span>');
            });
        });

        // 1b. Settings Screen: Generate Sample Products
        $('#tl-btn-seed-products').on('click', function(e) {
            e.preventDefault();

            var $btn    = $(this);
            var $status = $('#tl-seed-products-status');

            $btn.prop('disabled', true);
            $status.html('<span class="dashicons dashicons-update tl-spinning"></span> Generating products...');

            $.post(targetLogisticsAdmin.ajax_url, {
                action: 'target_logistics_seed_products',
                security: targetLogisticsAdmin.nonce
            }, function(response) {
                $btn.prop('disabled', false);
                if (response.success) {
                    $status.html('<span style="color: #15803d;"><span class="dashicons dashicons-yes-alt"></span> ' + response.data.message + '</span>');
                } else {
                    var msg = response.data && response.data.message ? response.data.message : targetLogisticsAdmin.i18n.error;
                    $status.html('<span style="color: #b91c1c;"><span class="dashicons dashicons-warning"></span> ' + msg + '</span>');
                }
            }).fail(function() {
                $btn.prop('disabled', false);
                $status.html('<span style="color: #b91c1c;"><span class="dashicons dashicons-warning"></span> Failed to generate sample products.</span>');
            });
        });

        // Toggle custom URL field depending on environment selection
        function toggleCustomUrlField() {
            var env = $('#woocommerce_target_logistics_environment').val();
            if (env === 'custom') {
                $('#woocommerce_target_logistics_custom_api_url').closest('tr').show();
            } else {
                $('#woocommerce_target_logistics_custom_api_url').closest('tr').hide();
            }
        }
        $('#woocommerce_target_logistics_environment').on('change', toggleCustomUrlField);
        toggleCustomUrlField();


        // ==========================================
        // 2. Order Meta Box Interactions
        // ==========================================
        var $wrap = $('.target-logistics-box-wrap');
        if (!$wrap.length) {
            return;
        }

        var orderId = $wrap.data('order-id');

        // Toggle pickup section
        $('#tl_request_pickup').on('change', function() {
            if ($(this).is(':checked')) {
                $('#tl_pickup_details_wrap').slideDown(150);
            } else {
                $('#tl_pickup_details_wrap').slideUp(150);
            }
        });

        // Helper notice
        function showNotice(text, type) {
            var color = type === 'success' ? '#15803d' : '#b91c1c';
            var bg    = type === 'success' ? '#dcfce7' : '#fee2e2';
            var border= type === 'success' ? '#86efac' : '#fca5a5';
            $('#tl-feedback-notice').html(
                '<div style="padding: 8px 10px; border-radius: 4px; font-size: 12px; background:' + bg + '; color:' + color + '; border:1px solid ' + border + ';">' + text + '</div>'
            ).slideDown(150);
        }

        // Fetch Quote Rates
        $('#tl-btn-quote-order').on('click', function(e) {
            e.preventDefault();
            var $btn = $(this);
            var $container = $('#tl-quotes-container');

            $btn.prop('disabled', true).find('.dashicons').addClass('tl-spinning');
            $container.html('<p style="font-size: 12px; color: #64748b;"><span class="dashicons dashicons-update tl-spinning"></span> ' + targetLogisticsAdmin.i18n.quoting + '</p>').slideDown(150);

            $.post(targetLogisticsAdmin.ajax_url, {
                action: 'target_logistics_quote_order',
                security: targetLogisticsAdmin.nonce,
                order_id: orderId
            }, function(response) {
                $btn.prop('disabled', false).find('.dashicons').removeClass('tl-spinning');
                if (response.success && response.data.quotes && response.data.quotes.length > 0) {
                    var html = '<div style="margin-bottom: 6px; font-size: 11px; font-weight: 600; color: #475569;">' + targetLogisticsAdmin.i18n.select_service + ':</div>';
                    $.each(response.data.quotes, function(i, q) {
                        var serviceCode = q.serviceCode || '';
                        var carrier = q.carrier || '';
                        var price = q.totalPrice !== undefined ? q.totalPrice + ' ' + (q.currency || '') : 'Free';
                        html += '<div class="tl-quote-item" data-carrier="' + carrier + '" data-service="' + serviceCode + '">';
                        html += '  <div><div class="tl-quote-name">' + (q.serviceName || 'Standard Service') + '</div>';
                        html += '  <div class="tl-quote-code">Carrier: ' + carrier + ' | Service: ' + (serviceCode || 'N/A') + '</div></div>';
                        html += '  <div class="tl-quote-price">' + price + '</div>';
                        html += '</div>';
                    });
                    $container.html(html);

                    // Select quote click
                    $('.tl-quote-item').on('click', function() {
                        $('.tl-quote-item').removeClass('selected');
                        $(this).addClass('selected');
                        var c = $(this).data('carrier');
                        var s = $(this).data('service');
                        if (c) $('#tl_override_carrier').val(c);
                        if (s) $('#tl_override_service').val(s);
                    });
                } else {
                    var msg = response.data && response.data.message ? response.data.message : targetLogisticsAdmin.i18n.no_quotes;
                    $container.html('<div style="font-size: 12px; color: #b91c1c;">' + msg + '</div>');
                }
            }).fail(function() {
                $btn.prop('disabled', false).find('.dashicons').removeClass('tl-spinning');
                $container.html('<div style="font-size: 12px; color: #b91c1c;">' + targetLogisticsAdmin.i18n.error + '</div>');
            });
        });

        // Book Order & Schedule Pickup
        $('#tl-btn-book-order').on('click', function(e) {
            e.preventDefault();
            var $btn = $(this);

            var carrier = $('#tl_override_carrier').val();
            var service = $('#tl_override_service').val();
            var requestPickup = $('#tl_request_pickup').is(':checked') ? 1 : 0;
            var pickupDate = $('#tl_pickup_date').val();
            var pickupNotes = $('#tl_pickup_notes').val();

            if (!confirm(targetLogisticsAdmin.i18n.confirm_book)) {
                return;
            }

            $btn.prop('disabled', true).find('.dashicons').addClass('tl-spinning');
            showNotice(targetLogisticsAdmin.i18n.booking, 'success');

            $.post(targetLogisticsAdmin.ajax_url, {
                action: 'target_logistics_book_order',
                security: targetLogisticsAdmin.nonce,
                order_id: orderId,
                carrier_code: carrier,
                service_code: service,
                request_pickup: requestPickup,
                pickup_date: pickupDate,
                pickup_instructions: pickupNotes
            }, function(response) {
                if (response.success) {
                    showNotice(targetLogisticsAdmin.i18n.book_success, 'success');
                    setTimeout(function() {
                        window.location.reload();
                    }, 1000);
                } else {
                    $btn.prop('disabled', false).find('.dashicons').removeClass('tl-spinning');
                    var msg = response.data && response.data.message ? response.data.message : targetLogisticsAdmin.i18n.error;
                    showNotice(msg, 'error');
                }
            }).fail(function() {
                $btn.prop('disabled', false).find('.dashicons').removeClass('tl-spinning');
                showNotice(targetLogisticsAdmin.i18n.error, 'error');
            });
        });

        // Refresh Tracking Status
        $('#tl-btn-refresh-status').on('click', function(e) {
            e.preventDefault();
            var $btn = $(this);
            $btn.prop('disabled', true).find('.dashicons').addClass('tl-spinning');

            $.post(targetLogisticsAdmin.ajax_url, {
                action: 'target_logistics_refresh_order',
                security: targetLogisticsAdmin.nonce,
                order_id: orderId
            }, function(response) {
                $btn.prop('disabled', false).find('.dashicons').removeClass('tl-spinning');
                if (response.success) {
                    window.location.reload();
                } else {
                    showNotice(targetLogisticsAdmin.i18n.error, 'error');
                }
            }).fail(function() {
                $btn.prop('disabled', false).find('.dashicons').removeClass('tl-spinning');
                showNotice(targetLogisticsAdmin.i18n.error, 'error');
            });
        });

        // Reset Booking
        $('#tl-btn-reset-order').on('click', function(e) {
            e.preventDefault();
            if (!confirm(targetLogisticsAdmin.i18n.confirm_reset)) {
                return;
            }

            var $btn = $(this);
            $btn.prop('disabled', true);

            $.post(targetLogisticsAdmin.ajax_url, {
                action: 'target_logistics_reset_order',
                security: targetLogisticsAdmin.nonce,
                order_id: orderId
            }, function(response) {
                if (response.success) {
                    window.location.reload();
                } else {
                    $btn.prop('disabled', false);
                    showNotice(targetLogisticsAdmin.i18n.error, 'error');
                }
            }).fail(function() {
                $btn.prop('disabled', false);
                showNotice(targetLogisticsAdmin.i18n.error, 'error');
            });
        });

    });

})(jQuery);
