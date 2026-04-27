const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

const generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, {
        expiresIn: '30d',
    });
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new player
 */
exports.register = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields' });
        }

        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await User.create({
            username,
            email,
            passwordHash
        });

        if (user) {
            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    _id: user._id,
                    username: user.username,
                    email: user.email,
                    token: generateToken(user._id)
                },
            });
        } else {
            res.status(400).json({ success: false, message: 'Invalid user data' });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate player
 */
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                _id: user._id,
                username: user.username,
                email: user.email,
                token: generateToken(user._id)
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged in user
 */
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};
