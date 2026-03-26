const logger = require('../utils/logger');

/**
 * Global Express error-handling middleware.
 * Must have 4 params so Express recognises it as an error handler.
 */
const errorHandler = (err, _req, res, _next) => {
    logger.error(err.stack || err.message);

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
};

module.exports = errorHandler;
