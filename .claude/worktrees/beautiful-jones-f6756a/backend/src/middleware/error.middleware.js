const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const handleCastErrorDB = err => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400, 'ERR_INVALID_ID');
};

const handleDuplicateFieldsDB = err => {
  const value = err.errmsg?.match(/(['"])(\\?.)*?\1/)?.[0] || 'unknown';
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400, 'ERR_DUPLICATE');
};

const handleValidationErrorDB = err => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400, 'ERR_VALIDATION');
};

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    success: false,
    error: err.message,
    code: err.code || 'ERR_UNKNOWN',
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code || 'ERR_UNKNOWN',
    });
  } else {
    logger.error('ERROR 💥', err);
    res.status(err.statusCode || 500).json({
      success: false,
      error: 'Something went wrong!',
      code: 'ERR_INTERNAL',
    });
  }
};

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);

    sendErrorProd(error, res);
  }
};

module.exports = {
  AppError,
  errorHandler
};
