// ── Auth Controller (stubs) ─────────────────────────────────────────

/**
 * @route   POST /api/auth/register
 * @desc    Register a new player
 */
exports.register = async (req, res, next) => {
    try {
        const { username, email, password } = req.body;
        // TODO: hash password, create User document
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: { username, email },
        });
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
        // TODO: verify credentials, generate JWT
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: { email, token: 'placeholder-jwt-token' },
        });
    } catch (error) {
        next(error);
    }
};
