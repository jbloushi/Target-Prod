require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

// Initialize Prisma Client (uses Library Engine for direct Connection)
const prisma = new PrismaClient({
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
};
