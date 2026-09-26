require('dotenv').config();

/**
 * Validate required environment variables for production
 */
const validateProductionEnv = () => {
  if (process.env.NODE_ENV === 'production') {
    const required = ['DATABASE_URL', 'JWT_SECRET', 'API_KEY_SECRET', 'ENCRYPTION_KEY', 'DHL_API_KEY', 'DHL_API_SECRET', 'CORS_ORIGIN'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables for production: ${missing.join(', ')}`);
    }

    // Validate JWT_SECRET length
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 64) {
      throw new Error('JWT_SECRET must be at least 64 characters for production');
    }
  }
};

// Run validation
if (process.env.NODE_ENV === 'production') {
  validateProductionEnv();
}

module.exports = {
  // Server Configuration
  port: parseInt(process.env.PORT, 10) || 8899,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database Configuration
  databaseUrl: process.env.DATABASE_URL,

  // Security & Authentication
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  apiKeySecret: process.env.API_KEY_SECRET || process.env.JWT_SECRET || 'dev-api-key-secret',
  encryptionKey: process.env.ENCRYPTION_KEY,
  corsOrigin: process.env.CORS_ORIGIN || '',
  frontendUrl: process.env.FRONTEND_URL || 'https://target-logistics.com',
  publicTrackingBaseUrl: process.env.PUBLIC_TRACKING_BASE_URL || process.env.FRONTEND_URL || 'https://target-logistics.com',
  supportWhatsappPhone: process.env.SUPPORT_WHATSAPP_PHONE || '96597691271',

  // Production Carrier Configuration (Default)
  dhlApiKey: process.env.DHL_API_KEY,
  dhlApiSecret: process.env.DHL_API_SECRET,
  dhlAccountNumber: process.env.DHL_ACCOUNT_NUMBER,
  dhlApiUrl: process.env.DHL_API_URL || 'https://express.api.dhl.com/mydhlapi',

  // Sandbox / Test Carrier Configuration (Dynamic Dual-Routing)
  dhlTestApiKey: process.env.DHL_TEST_API_KEY || process.env.DHL_API_KEY,
  dhlTestApiSecret: process.env.DHL_TEST_API_SECRET || process.env.DHL_API_SECRET,
  dhlTestAccountNumber: process.env.DHL_TEST_ACCOUNT_NUMBER || process.env.DHL_ACCOUNT_NUMBER,
  dhlTestApiUrl: process.env.DHL_TEST_API_URL || 'https://express.api.dhl.com/mydhlapi/test',

  // LogesTechs / OTE Production & Test
  logesTechsShipmentBaseUrl: process.env.LOGESTECHS_SHIPMENT_BASE_URL || 'https://apisv2.logestechs.com/api',
  logesTechsFulfillmentBaseUrl: process.env.LOGESTECHS_FULFILLMENT_BASE_URL || 'https://apisv2.logestechs.com/api',
  logesTechsTestShipmentBaseUrl: process.env.LOGESTECHS_TEST_SHIPMENT_BASE_URL || 'https://apisv5.logestechs.com/api',
  logesTechsTestFulfillmentBaseUrl: process.env.LOGESTECHS_TEST_FULFILLMENT_BASE_URL || 'https://apisv5.logestechs.com/api',
  logesTechsCompanyId: process.env.LOGESTECHS_COMPANY_ID,
  logesTechsUsername: process.env.LOGESTECHS_USERNAME,
  logesTechsPassword: process.env.LOGESTECHS_PASSWORD,
  logesTechsEmail: process.env.LOGESTECHS_EMAIL,
  logesTechsShipmentEmail: process.env.LOGESTECHS_SHIPMENT_EMAIL,
  logesTechsShipmentPassword: process.env.LOGESTECHS_SHIPMENT_PASSWORD,
  logesTechsWebhookSecret: process.env.LOGESTECHS_WEBHOOK_SECRET || null,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  googleMapsAutocompleteUrl: process.env.GOOGLE_MAPS_AUTOCOMPLETE_URL || 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  googleMapsDetailsUrl: process.env.GOOGLE_MAPS_DETAILS_URL || 'https://maps.googleapis.com/maps/api/place/details/json',
  googleMapsValidationUrl: process.env.GOOGLE_MAPS_VALIDATION_URL || 'https://addressvalidation.googleapis.com/v1:validateAddress',

  chatwoot: {
    enabled: process.env.CHATWOOT_ENABLED === 'true',
    baseUrl: process.env.CHATWOOT_BASE_URL,
    accountId: process.env.CHATWOOT_ACCOUNT_ID,
    inboxId: process.env.CHATWOOT_INBOX_ID,
    apiAccessToken: process.env.CHATWOOT_API_ACCESS_TOKEN,
    allowPlainTextFallback: process.env.CHATWOOT_ALLOW_PLAIN_TEXT_FALLBACK !== 'false',
    templateConfig: process.env.CHATWOOT_TEMPLATE_CONFIG
      ? safeJsonParse(process.env.CHATWOOT_TEMPLATE_CONFIG, {})
      : {},
    webhookSecret: process.env.CHATWOOT_WEBHOOK_SECRET || null
  },

  // Phenix ERP Configuration
  phenix: {
    apiUser: process.env.PHENIX_API_USER || '',
    apiPassword: process.env.PHENIX_API_PASSWORD || '',
    token: process.env.PHENIX_TOKEN || '',
    endpoint: process.env.PHENIX_ENDPOINT || 'https://apigateway.phenix.software/api/rest/TPhenixApi/%22Report%22/201',
    syncDaysBack: parseInt(process.env.PHENIX_SYNC_DAYS_BACK, 10) || 3,
    cronEnabled: process.env.PHENIX_SYNC_CRON_ENABLED === 'true',
    intervalMs: parseInt(process.env.PHENIX_SYNC_INTERVAL_MS, 10) || 15 * 60 * 1000
  },

  // Logging Configuration
  logLevel: process.env.LOG_LEVEL || 'info',
  logToFile: process.env.LOG_TO_FILE === 'true',

  // Optional Configuration
  sentryDsn: process.env.SENTRY_DSN,
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 5000, // Legacy
  rateLimitGlobalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX, 10) || 3000,
  rateLimitAuthMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 200,
  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 10485760, // 10MB default
};

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}
