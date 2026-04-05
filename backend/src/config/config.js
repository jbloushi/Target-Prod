require('dotenv').config();

/**
 * Validate required environment variables for production
 */
const validateProductionEnv = () => {
  if (process.env.NODE_ENV === 'production') {
    const required = ['DATABASE_URL', 'JWT_SECRET', 'DHL_API_KEY', 'DHL_API_SECRET'];
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
  corsOrigin: process.env.CORS_ORIGIN || '*',
  frontendUrl: process.env.FRONTEND_URL || 'https://target-logistics.com',

  // API Keys (will be validated in adapters)
  dhlApiKey: process.env.DHL_API_KEY,
  dhlApiSecret: process.env.DHL_API_SECRET,
  dhlAccountNumber: process.env.DHL_ACCOUNT_NUMBER,
  dhlApiUrl: process.env.DHL_API_URL || 'https://express.api.dhl.com/mydhlapi/test',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  googleMapsAutocompleteUrl: process.env.GOOGLE_MAPS_AUTOCOMPLETE_URL || 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  googleMapsDetailsUrl: process.env.GOOGLE_MAPS_DETAILS_URL || 'https://maps.googleapis.com/maps/api/place/details/json',
  googleMapsValidationUrl: process.env.GOOGLE_MAPS_VALIDATION_URL || 'https://addressvalidation.googleapis.com/v1:validateAddress',

  // Logging Configuration
  logLevel: process.env.LOG_LEVEL || 'info',
  logToFile: process.env.LOG_TO_FILE === 'true',

  // Optional Configuration
  sentryDsn: process.env.SENTRY_DSN,
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100, // Legacy
  rateLimitGlobalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX, 10) || 100,
  rateLimitAuthMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 20,
  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE, 10) || 10485760, // 10MB default
};
