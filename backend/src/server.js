const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// Globals Plugins
mongoose.plugin(require('./plugins/tenant.plugin'));

const { port, mongoUri, corsOrigin, rateLimitGlobalMax, rateLimitAuthMax, rateLimitEnabled } = require('./config/config');
const { connectDB } = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/error.middleware');
const { checkDbAuth } = require('./middleware/auth.middleware');
const shipmentRoutes = require('./routes/shipment.routes');
const authRoutes = require('./routes/auth.routes');
const authController = require('./controllers/auth.controller');
const userRoutes = require('./routes/user.routes');
const seedDemoData = require('./services/seedDemoData');

// Initialize Express app
const app = express();

// RAW REQUEST LOGGER (Pre-everything)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    const rawMsg = `[RAW_REQUEST] ${req.method} ${req.originalUrl || req.url} - CT: ${req.headers['content-type']}`;
    console.log(rawMsg);
  }
  next();
});

// FAIL-SAFE CRASH LOGGER
process.on('uncaughtException', (err) => {
  const fs = require('fs');
  const path = require('path');
  fs.appendFileSync(path.join(__dirname, '../fatal_error.log'), `[UNCAUGHT_EXCEPTION] ${new Date().toISOString()}\n${err.stack}\n\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const fs = require('fs');
  const path = require('path');
  fs.appendFileSync(path.join(__dirname, '../fatal_error.log'), `[UNHANDLED_REJECTION] ${new Date().toISOString()}\n${reason?.stack || reason}\n\n`);
});

app.set('trust proxy', 1); // Trust first proxy (Nginx)

// Enable CORS early to ensure all responses (including errors/rate limits) have CORS headers
const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (corsOrigin === '*') return callback(null, true);

    const allowedOrigins = corsOrigin.split(',').map(o => o.trim().replace(/\/$/, ''));
    const cleanOrigin = origin.replace(/\/$/, '');

    // DEBUG: Log CORS details
    // logger.debug(`CORS Check: Origin=${origin}, Clean=${cleanOrigin}, Env=${process.env.NODE_ENV}`);

    // In development, allow any localhost origin
    if (process.env.NODE_ENV === 'development' && cleanOrigin.startsWith('http://localhost')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(cleanOrigin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin} (Clean: ${cleanOrigin})`);
      logger.warn(`Allowed: ${JSON.stringify(allowedOrigins)}`);
      logger.warn(`Env: ${process.env.NODE_ENV}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(compression());

// Security middleware
app.use(helmet());

// Rate Limiting
if (rateLimitEnabled) {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: rateLimitGlobalMax,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply global rate limiter to all /api routes
  // CORS middleware already ran, so these responses will have CORS headers
  app.use('/api', globalLimiter);

  // Stricter limiter for auth and public routes
  const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: rateLimitAuthMax,
    message: { success: false, error: 'Security limit reached. Please try again later.' }
  });
  app.use('/api/auth', authLimiter);
  app.use('/api/shipments/public', authLimiter);
} else {
  logger.info('Rate limiting is disabled');
}


// Body parser middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Logging middleware (verbose logs in production can noticeably impact throughput)
app.use((req, res, next) => {
  const message = `${req.method} ${req.url}`;
  if (process.env.NODE_ENV === 'production') {
    logger.debug(message);
  } else {
    logger.info(message);
  }
  next();
});

// Database connection check middleware
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    logger.warn('MongoDB not connected, attempting to reconnect...');
    connectDB()
      .then(() => {
        logger.info('MongoDB reconnected successfully');
        next();
      })
      .catch(err => {
        logger.error('Failed to reconnect to MongoDB:', err);
        res.status(500).json({
          success: false,
          error: 'Database connection error. Please try again later.'
        });
      });
  } else {
    next();
  }
});

// Routes
const geocodeRoutes = require('./routes/geocode.routes');
const receiverRoutes = require('./routes/receiver.routes');
const pickupRoutes = require('./routes/pickup.routes');
const externalRoutes = require('./routes/external.routes');

const apiRoutes = require('./routes/api.routes');
const financeRoutes = require('./routes/finance.routes');
const organizationRoutes = require('./routes/organization.routes');

const shipmentPublicRoutes = require('./routes/shipment-public.routes');

// Standard API Route Mounting
app.use('/api/public/shipments', shipmentPublicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/finance', checkDbAuth, financeRoutes);
app.use('/api/users', checkDbAuth, userRoutes);
app.use('/api/organizations', checkDbAuth, organizationRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/client', externalRoutes);
app.use('/api/v1', apiRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/receivers', receiverRoutes);
app.use('/api/shipments', checkDbAuth, shipmentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'ok',
    database: dbStatus
  });
});


// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Shipment Tracker API is running',
    endpoints: {
      health: '/health',
      api: '/api/shipments'
    }
  });
});

const { AppError } = require('./middleware/error.middleware');

// Handle undefined routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Error handling middleware
app.use(errorHandler);


// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Run seed in development to populate In-Memory DB
    if (process.env.NODE_ENV === 'development') {
      console.log('Running startup dataseeding...');
      seedDemoData().catch(err => console.error('Seeding failed:', err));
    }

    // Start Express server
    const serverInstance = app.listen(port, () => {
      logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${port}`);
      
      // Signal PM2 that the application is ready
      if (process.send) {
        process.send('ready');
        console.log('Sent ready signal to PM2');
      }
    });
    console.log('Called app.listen');

    serverInstance.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use. Please stop other processes.`);
        process.exit(1);
      } else {
        logger.error('Server error:', error);
      }
    });

    // Handle server shutdown
    const gracefulShutdown = async () => {
      logger.info('Shutting down server...');
      serverInstance.close(async () => {
        logger.info('Express server closed');
        try {
          await mongoose.connection.close();
          logger.info('MongoDB connection closed');
          process.exit(0);
        } catch (err) {
          logger.error('Error closing MongoDB connection:', err);
          process.exit(1);
        }
      });
    };

    // Handle process termination
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Only start server if run directly
if (require.main === module) {
  startServer();
}

module.exports = app; // For testing
