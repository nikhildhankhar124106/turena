const mongoose = require('mongoose');

const matchHistorySchema = new mongoose.Schema(
    {
        roomId: {
            type: String, // String ref to avoid strict GameRoom existence requirement if old rooms get deleted
            index: true,
        },
        players: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        durationSeconds: {
            type: Number,
            default: 0,
        },
        totalTurns: {
            type: Number,
            default: 0,
        },
        endedAt: {
            type: Date,
            default: Date.now,
        },
        winnerXpGained: {
            type: Number,
            default: 0,
        },
        loserXpGained: {
            type: Number,
            default: 0,
        },
        winnerLevel: {
            type: Number,
        },
        loserLevel: {
            type: Number,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('MatchHistory', matchHistorySchema);
