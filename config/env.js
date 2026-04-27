const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/turena',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'supersecret_turena_jwt_key_development_only_123',
};
