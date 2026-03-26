// ── Game Controller (stubs) ─────────────────────────────────────────

/**
 * @route   POST /api/games
 * @desc    Create a new game session
 */
exports.createGame = async (req, res, next) => {
    try {
        const { gridRows = 10, gridCols = 10 } = req.body;
        // TODO: create Game document, return game id
        res.status(201).json({
            success: true,
            message: 'Game created',
            data: {
                gameId: 'placeholder-game-id',
                gridSize: { rows: gridRows, cols: gridCols },
                status: 'waiting',
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/games
 * @desc    List available games
 */
exports.listGames = async (req, res, next) => {
    try {
        // TODO: query Game collection
        res.status(200).json({
            success: true,
            data: [],
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @route   GET /api/games/:id
 * @desc    Get single game state
 */
exports.getGame = async (req, res, next) => {
    try {
        const { id } = req.params;
        // TODO: find game by id
        res.status(200).json({
            success: true,
            data: { gameId: id, status: 'waiting' },
        });
    } catch (error) {
        next(error);
    }
};
