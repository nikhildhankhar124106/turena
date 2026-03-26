const express = require('express');
const router = express.Router();
const {
    createGame,
    listGames,
    getGame,
} = require('../controllers/gameController');

router.post('/', createGame);
router.get('/', listGames);
router.get('/:id', getGame);

module.exports = router;
