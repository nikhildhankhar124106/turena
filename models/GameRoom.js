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
        safeZone: {
            minX: { type: Number, default: 0 },
            maxX: { type: Number, default: 9 },
            minY: { type: Number, default: 0 },
            maxY: { type: Number, default: 9 },
        },
        mysteryBox: {
            x: { type: Number, default: null },
            y: { type: Number, default: null },
            powerType: { type: String, default: null },
            activeTurnsLeft: { type: Number, default: 0 }
        },
        walls: [
            {
                x: { type: Number, required: true },
                y: { type: Number, required: true }
            }
        ],
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
