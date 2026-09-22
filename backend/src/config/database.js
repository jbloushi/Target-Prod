require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

/**
 * Ensures DATABASE_URL contains optimal connection pool parameters
 * for PM2 cluster mode (e.g. 2 instances * 10 connections = 20 connections max).
 */
function getSanitizedDatabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (!['mysql:', 'postgresql:', 'postgres:', 'mariadb:'].includes(url.protocol)) {
      return rawUrl;
    }
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.DB_CONNECTION_LIMIT || '10');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', process.env.DB_POOL_TIMEOUT || '20');
    }
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', process.env.DB_CONNECT_TIMEOUT || '10');
    }
    return url.toString();
  } catch (error) {
    return rawUrl;
  }
}

const sanitizedDatabaseUrl = getSanitizedDatabaseUrl(process.env.DATABASE_URL);

// Initialize Prisma Client (uses Library Engine for direct Connection with pool config)
const prisma = new PrismaClient({
  datasources: sanitizedDatabaseUrl ? { db: { url: sanitizedDatabaseUrl } } : undefined,
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

const connectDB = async () => {
  try {
    // In Prisma 7 with Library engine, $connect is optional but good for startup check
    await prisma.$connect();
    logger.info('MySQL Database (via Prisma Native Engine) connected successfully');
    return prisma;
  } catch (error) {
    logger.error('Database connection error:', error.message);
    throw error;
  }
};

const closeDB = async () => {
  try {
    await prisma.$disconnect();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
};

module.exports = {
  prisma,
  connectDB,
  closeDB,
  getSanitizedDatabaseUrl,
};
