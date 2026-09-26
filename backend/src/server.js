const { validateEnv } = require('./config/envValidator');

// Run fail-fast environment validation on server bootstrap
if (require.main === module || process.env.NODE_ENV === 'production') {
  validateEnv({ exitOnError: require.main === module });
}

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { port, databaseUrl, corsOrigin, rateLimitGlobalMax, rateLimitAuthMax, rateLimitEnabled } = require('./config/config');
const { connectDB, prisma } = require('./config/database');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/error.middleware');
const shipmentRoutes = require('./routes/shipment.routes');
const authRoutes = require('./routes/auth.routes');
const authController = require('./controllers/auth.controller');
const userRoutes = require('./routes/user.routes');

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
// Only register global process exit handlers when running as main application,
// avoiding EventEmitter MaxListenersExceededWarning memory leak warnings when tests repeatedly require server.js
if (require.main === module && !process._hasTargetProdCrashHandlers) {
  process._hasTargetProdCrashHandlers = true;
  process.on('uncaughtException', (err) => {
    const fs = require('fs');
    const path = require('path');
    try {
      fs.appendFileSync(path.join(__dirname, '../fatal_error.log'), `[UNCAUGHT_EXCEPTION] ${new Date().toISOString()}\n${err.stack}\n\n`);
    } catch (_) {}
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    const fs = require('fs');
    const path = require('path');
    try {
      fs.appendFileSync(path.join(__dirname, '../fatal_error.log'), `[UNHANDLED_REJECTION] ${new Date().toISOString()}\n${reason?.stack || reason}\n\n`);
    } catch (_) {}
  });
}

app.set('trust proxy', 1); // Trust first proxy (Nginx)

// Enable CORS early to ensure all responses (including errors/rate limits) have CORS headers
const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.replace(/\/$/, '');

    // In development, allow any localhost origin
    if (process.env.NODE_ENV === 'development' && cleanOrigin.startsWith('http://localhost')) {
      return callback(null, true);
    }

    const allowedOrigins = corsOrigin.split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean);

    if (allowedOrigins.includes(cleanOrigin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin} (Clean: ${cleanOrigin})`);
      logger.warn(`Allowed: ${JSON.stringify(allowedOrigins)}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(compression());

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// Rate Limiting
if (rateLimitEnabled) {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: rateLimitGlobalMax,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      if (req.method === 'OPTIONS') return true;
      if (req.path === '/health' || req.path === '/api/health') return true;
      if (req.path.includes('/webhook')) return true;
      return false;
    }
  });

  // Apply global rate limiter to all /api routes
  app.use('/api', globalLimiter);

  // Stricter limiter specifically for sensitive login and public endpoints (brute force protection)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: rateLimitAuthMax,
    message: { success: false, error: 'Security limit reached. Please try again in a few minutes.' },
    skip: (req) => req.method === 'OPTIONS' || req.path === '/me' || req.path === '/api/auth/me'
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/public/shipments', authLimiter);

  // Stricter limiter for external client API (API-key authenticated routes)
  const externalApiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute per API key
    keyGenerator: (req) => req.headers['x-api-key'] || req.ip || 'no-key',
    validate: false,
    message: { success: false, error: 'External API rate limit reached.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS'
  });
  app.use('/api/client', externalApiLimiter);
  app.use('/api/v1', externalApiLimiter);
} else {
  logger.info('Rate limiting is disabled');
}


// Body parser middleware
app.use(express.json({ limit: '10kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
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

// Routes
const geocodeRoutes = require('./routes/geocode.routes');
const pickupRoutes = require('./routes/pickup.routes');
const externalRoutes = require('./routes/external.routes');

const apiRoutes = require('./routes/api.routes');
const financeRoutes = require('./routes/finance.routes');
const organizationRoutes = require('./routes/organization.routes');
const integrationRoutes = require('./routes/integration.routes');

const shipmentPublicRoutes = require('./routes/shipment-public.routes');
const settingsRoutes = require('./routes/settings.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');

// Standard API Route Mounting
app.use('/api', whatsappRoutes);
app.use('/api/public/shipments', shipmentPublicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/pickups', pickupRoutes);
app.use('/api/client', externalRoutes);
app.use('/api/v1', apiRoutes);
app.use('/api/geocode', geocodeRoutes);
app.use('/api/shipments', shipmentRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  const isInternal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (isInternal) {
      res.status(200).json({ status: 'ok', database: 'connected (mysql)' });
    } else {
      res.status(200).json({ status: 'ok' }); // No infrastructure detail to public
    }
  } catch (err) {
    res.status(503).json({ status: 'degraded' }); // Never expose error detail
  }
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
    // Validate environment fail-fast
    validateEnv({ exitOnError: true });

    // Connect to MySQL via Prisma
    await connectDB();

    // Start background queue workers for carrier dispatch, notifications, and webhooks
    const { initWorkers } = require('./services/queue');
    const queue = initWorkers();
    queue.start();

    // Start background carrier sync cron
    const carrierSyncCronService = require('./services/carrierSyncCron.service');
    if (process.env.CARRIER_CRON_SYNC_ENABLED !== 'false') {
      carrierSyncCronService.start();
    }

    // Start background EOM statement cron
    const eomStatementCronService = require('./services/eomStatementCron.service');
    if (process.env.EOM_STATEMENT_CRON_ENABLED !== 'false') {
      eomStatementCronService.start();
    }

    // Start background Phenix ERP auto-sync cron monitor
    const phenixSyncCronService = require('./services/phenixSyncCron.service');
    phenixSyncCronService.start();

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
          carrierSyncCronService.stop();
          eomStatementCronService.stop();
          phenixSyncCronService.stop();
          const { jobQueue } = require('./services/queue');
          jobQueue.stop();
          const { closeDB } = require('./config/database');
          await closeDB();
          process.exit(0);
        } catch (err) {
          logger.error('Error during database disconnection:', err);
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
