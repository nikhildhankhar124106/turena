const mongoose = require('mongoose');

const playerStateSchema = new mongoose.Schema(
    {
        gameRoom: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'GameRoom',
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        isReady: {
            type: Boolean,
            default: false,
        },
        position: {
            x: { type: Number, default: 0 },
            y: { type: Number, default: 0 },
        },
        hp: {
            type: Number,
            default: 100,
        },
        activePower: {
            type: String,
            default: null, // e.g., 'create_wall', 'sniper', 'high_jump', 'bullet_vest'
        },
        activePowerTurnsLeft: {
            type: Number,
            default: 0,
        },
        maxHp: {
            type: Number,
            default: 100,
        },
        energy: {
            type: Number,
            default: 10,
        },
        abilityCooldowns: {
            type: Map,
            of: Number, // Stores ability name mapping to remaining cool down turns
            default: {},
        },
        statusEffects: [
            {
                name: { type: String },
                duration: { Number }, // Duration left in turns
                value: { Number }, // e.g., damage amount or buff
            },
        ],
        isAlive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('PlayerState', playerStateSchema);
