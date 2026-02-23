const mongoose = require('mongoose');

const { mongoUri } = require('./config');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    let connectionUri = mongoUri;
    let useMemoryServer = false;

    // In development, use in-memory MongoDB ONLY if no URI is provided
    if (process.env.NODE_ENV === 'development' && !mongoUri) {
      logger.info('Development mode & No MONGO_URI: Starting in-memory MongoDB...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongoServer = await MongoMemoryServer.create({
          instance: {
            dbName: 'shipment-tracker',
            storageEngine: 'wiredTiger' // Required for transactions
          },
          replSet: { count: 1 } // Enable Replica Set for Transactions support
        });
        connectionUri = mongoServer.getUri();
        useMemoryServer = true;
        logger.info('In-memory MongoDB started: ' + connectionUri);
      } catch (memError) {
        logger.error('Failed to start memory server:', memError);
        // Fall through to try the configured URI
      }
    } else if (mongoUri) {
      logger.info('Using provided MongoDB URI' + (process.env.NODE_ENV === 'development' ? ' in Development mode' : ''));
    }

    if (!connectionUri) {
      logger.error('MongoDB URI is missing and memory server failed');
      throw new Error('Invalid MongoDB URI');
    }

    await mongoose.connect(connectionUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    });

    logger.info('MongoDB connected successfully' + (useMemoryServer ? ' (In-Memory)' : ''));
  } catch (error) {
    logger.error('MongoDB connection error:', error.message);
    throw error;
  }
};

const closeDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB Atlas connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB Atlas connection:', error);
  }
};

module.exports = {
  connectDB,
  closeDB,
};
