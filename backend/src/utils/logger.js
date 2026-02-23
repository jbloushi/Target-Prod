const winston = require('winston');
const { nodeEnv, logLevel, logToFile } = require('../config/config');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = nodeEnv || 'development';
  const isDevelopment = env === 'development';
  return logLevel || (isDevelopment ? 'debug' : 'info');
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

/**
 * Production format (JSON for cloud log aggregation)
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Development format (human-readable with colors)
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
);

/**
 * Choose format based on environment
 */
const logFormat = nodeEnv === 'production' ? productionFormat : developmentFormat;

/**
 * Configure transports
 */
const transports = [];

// Always add console transport for stdout (required for cloud deployments)
transports.push(
  new winston.transports.Console({
    format: logFormat,
    handleExceptions: true,
  })
);

// Conditionally add file transports (only if LOG_TO_FILE=true)
if (logToFile) {
  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/all.log',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

/**
 * Create logger instance
 */
const logger = winston.createLogger({
  level: level(),
  levels,
  transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true,
});

/**
 * Log startup information
 */
logger.info(`Logger initialized - Environment: ${nodeEnv}, Level: ${level()}, File Logging: ${logToFile}`);

module.exports = logger;
