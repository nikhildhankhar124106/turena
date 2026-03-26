const mongoose = require('mongoose');

const moveSchema = new mongoose.Schema(
    {
        gameId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Game',
            required: true,
        },
        playerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        x: {
            type: Number,
            required: true,
        },
        y: {
            type: Number,
            required: true,
        },
        action: {
            type: String,
            required: true,
            trim: true,
        },
        turnNumber: {
            type: Number,
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Move', moveSchema);
