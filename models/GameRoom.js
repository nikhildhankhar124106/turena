const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema(
    {
        roomId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['waiting', 'starting', 'playing', 'finished'],
            default: 'waiting',
        },
        players: [
            {
                user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                playerState: { type: mongoose.Schema.Types.ObjectId, ref: 'PlayerState' },
            },
        ],
        gridSize: {
            rows: { type: Number, default: 10 },
            cols: { type: Number, default: 10 },
        },
        currentTurn: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PlayerState',
            default: null,
        },
        turnNumber: {
            type: Number,
            default: 1,
        },
        turnTimerEndsAt: {
            type: Date,
        },
        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null, // Stores the winner when game finishes
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('GameRoom', gameRoomSchema);
