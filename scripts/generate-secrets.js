#!/usr/bin/env node

/**
 * Security Secrets Generator for 3PLogistics-Solution
 * 
 * This script generates secure random secrets for production deployment.
 * Run this before deploying to production to get secure credentials.
 */

const crypto = require('crypto');

console.log('\n==============================================');
console.log('🔐 Security Secrets Generator');
console.log('==============================================\n');

// Generate JWT Secret (64 bytes = 128 hex characters)
const jwtSecret = crypto.randomBytes(64).toString('hex');

// Generate MongoDB Root Password (32 bytes = 64 hex characters)
const mongoPassword = crypto.randomBytes(32).toString('hex');

// Generate a simpler password option (24 characters, alphanumeric)
const simplePassword = crypto.randomBytes(18).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 24);

console.log('📋 Generated Secrets:\n');
console.log('1. JWT_SECRET (for backend/.env):');
console.log('   ' + jwtSecret);
console.log('');

console.log('2. MONGO_ROOT_PASSWORD (strong, 64 characters):');
console.log('   ' + mongoPassword);
console.log('');

console.log('3. MONGO_ROOT_PASSWORD (simpler, 24 characters):');
console.log('   ' + simplePassword);
console.log('');

console.log('==============================================');
console.log('📝 Next Steps:');
console.log('==============================================\n');

console.log('1. Copy backend/.env.production.example to backend/.env');
console.log('2. Replace JWT_SECRET with the value above');
console.log('3. Update MONGO_URI password with one of the MongoDB passwords above');
console.log('4. Update .env in root directory with the same MongoDB password');
console.log('5. Replace DHL API credentials with your own from https://developer.dhl.com/');
console.log('6. Replace Google Maps API key from https://console.cloud.google.com/');
console.log('7. Set CORS_ORIGIN to your actual domain(s)');
console.log('');

console.log('⚠️  IMPORTANT: Never commit .env files to Git!');
console.log('✅ These secrets are cryptographically secure and safe for production.\n');
