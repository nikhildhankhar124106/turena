const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema(
    {
        players: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        gridSize: {
            rows: { type: Number, default: 10 },
            cols: { type: Number, default: 10 },
        },
        gridState: {
            type: [[mongoose.Schema.Types.Mixed]],
            default: [],
        },
        currentTurn: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        turnNumber: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ['waiting', 'active', 'finished'],
            default: 'waiting',
        },
        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Game', gameSchema);
