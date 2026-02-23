const express = require('express');
const router = express.Router();
const addressService = require('../services/address.service');
const logger = require('../utils/logger');

/**
 * Geocode Routes - Google Maps Address Intelligence API
 * 
 * These endpoints provide:
 * - Places Autocomplete with session tokens
 * - Place Details retrieval
 * - Address Validation API integration
 * - Country-restricted address search
 * 
 * @architecture All Google Maps API calls go through addressService
 * for centralized error handling, mocking, and cost optimization.
 */

/**
 * GET /api/geocode/autocomplete
 * 
 * Real-time address suggestions as user types
 * 
 * @query {string} query - Search text (required, min 3 chars)
 * @query {string} sessionToken - UUID for billing optimization (recommended)
 * @returns {Array} Address suggestions with placeId
 */
router.get('/autocomplete', async (req, res) => {
    try {
        const { query, sessionToken } = req.query;
        logger.info(`Autocomplete request: "${query}"`);

        if (!query || query.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Query must be at least 3 characters'
            });
        }

        const suggestions = await addressService.autocomplete(query, sessionToken);

        res.json({
            success: true,
            data: suggestions,
            sessionToken: sessionToken || null
        });
    } catch (error) {
        logger.error('Autocomplete route error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data
        });
    }
});

/**
 * GET /api/geocode/details/:placeId
 * 
 * Retrieve full structured address from Google Place ID
 * 
 * @param {string} placeId - Google Place ID
 * @query {string} sessionToken - Same token used in autocomplete
 * @returns {Object} Structured address data
 */
router.get('/details/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params;
        const { sessionToken } = req.query;

        if (!placeId) {
            return res.status(400).json({
                success: false,
                error: 'Place ID is required'
            });
        }

        const details = await addressService.getPlaceDetails(placeId, sessionToken);

        if (!details) {
            return res.status(404).json({
                success: false,
                error: 'Place not found'
            });
        }

        res.json({
            success: true,
            data: details
        });
    } catch (error) {
        logger.error('Place details route error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch place details'
        });
    }
});

/**
 * POST /api/geocode/validate
 * 
 * Validate and correct an address using Google Address Validation API
 * 
 * This is the critical step before submitting to carriers.
 * Returns validation verdict and any suggested corrections.
 * 
 * @body {Object} address - Address to validate
 * @returns {Object} Validation result with verdict and corrections
 */
router.post('/validate', async (req, res) => {
    try {
        const { address } = req.body;

        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }

        const result = await addressService.validateAddress(address);

        res.json({
            success: true,
            data: {
                verdict: result.verdict,
                validatedAddress: result.validatedAddress,
                corrections: result.corrections,
                isComplete: result.isComplete,
                requiresUserConfirmation: result.verdict === 'REQUIRES_CORRECTION'
            }
        });
    } catch (error) {
        logger.error('Address validation route error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate address'
        });
    }
});

/**
 * POST /api/geocode/normalize
 * 
 * Normalize address for a specific carrier
 * 
 * @body {Object} address - Address to normalize
 * @body {string} carrier - Carrier code (DHL, FEDEX, etc.)
 * @returns {Object} Carrier-formatted address
 */
router.post('/normalize', async (req, res) => {
    try {
        const { address, carrier = 'DHL' } = req.body;

        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }

        let normalizedAddress, normalizedContact;

        switch (carrier.toUpperCase()) {
            case 'DHL':
            default:
                normalizedAddress = addressService.normalizeForDhl(address);
                normalizedContact = addressService.normalizeContactForDhl(address);
                break;
        }

        res.json({
            success: true,
            data: {
                carrier,
                address: normalizedAddress,
                contact: normalizedContact
            }
        });
    } catch (error) {
        logger.error('Address normalization error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to normalize address'
        });
    }
});

module.exports = router;
