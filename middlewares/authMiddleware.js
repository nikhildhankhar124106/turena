const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);

            // Get user from the token
            req.user = await User.findById(decoded.id).select('-passwordHash');

            next();
        } catch (error) {
            console.error('Auth Middleware Error:', error);
            res.status(401).json({ success: false, message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
};

module.exports = { protect };
