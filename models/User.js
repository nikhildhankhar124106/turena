const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 20,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        rating: {
            type: Number,
            default: 1000,
        },
        gamesPlayed: {
            type: Number,
            default: 0,
        },
        winCount: {
            type: Number,
            default: 0,
        },
        lossCount: {
            type: Number,
            default: 0,
        },
        xp: {
            type: Number,
            default: 0,
        },
        level: {
            type: Number,
            default: 1,
        },
        xpToNextLvl: {
            type: Number,
            default: 100,
        },
        title: {
            type: String,
            default: 'Recruit',
        },
        avatarUrl: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
