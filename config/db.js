const mongoose = require('mongoose');
const { MONGO_URI } = require('./env');
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(MONGO_URI);
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        // Don't crash — let the server run so REST endpoints are still testable
        logger.warn('Server will continue without database connectivity');
    }
};

module.exports = connectDB;
