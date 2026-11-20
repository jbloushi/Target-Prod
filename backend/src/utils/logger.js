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

const SENSITIVE_LOG_KEY = /(authorization|password|token|secret|api[_-]?key|cookie|session[_-]?id|payment[_-]?link|checkout[_-]?url|errorData|payload|response(json)?|request(body)?|headers?)/i;
const redactLogString = (value) => String(value)
  .replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
  .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|verify[_-]?token|password|secret|authorization|session_id)=)[^&\s]+/gi, '$1[REDACTED]')
  .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|verify[_-]?token|session_id)=)[^&\s]+/gi, '$1[REDACTED]');
const redactLogValue = (value, depth = 0) => {
  if (typeof value === 'string') return redactLogString(value);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, depth + 1));
  if (!value || typeof value !== 'object' || depth > 6) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_LOG_KEY.test(key) ? '[REDACTED]' : redactLogValue(item, depth + 1)
  ]));
};
const redactSensitiveLogFields = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SENSITIVE_LOG_KEY.test(key)) info[key] = '[REDACTED]';
    else info[key] = redactLogValue(info[key]);
  }
  return info;
});

/**
 * Production format (JSON for cloud log aggregation)
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  redactSensitiveLogFields(),
  winston.format.json()
);

/**
 * Development format (human-readable with colors)
 */
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  redactSensitiveLogFields(),
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
    redactSensitiveLogFields(),
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
