const User = require('../models/User');
const logger = require('./logger');

/**
 * Get the title string for a given level.
 */
function getTitleForLevel(level) {
    if (level >= 20) return 'Legend';
    if (level >= 15) return 'Champion';
    if (level >= 10) return 'Gladiator';
    if (level >= 5) return 'Warrior';
    return 'Recruit';
}

/**
 * Calculate XP rewards for a completed match.
 * @param {number} winnerLevel
 * @param {number} loserLevel
 * @returns {{ winnerXp: number, loserXp: number }}
 */
function calculateXP(winnerLevel, loserLevel) {
    const winnerXp = 50;
    const loserXp = 10;
    return { winnerXp, loserXp };
}

/**
 * Apply XP to a user, handle level-ups, update title.
 * @param {object} user - Mongoose User document
 * @param {number} xpGained
 * @returns {{ leveledUp: boolean, newLevel: number, newTitle: string }}
 */
function applyXP(user, xpGained) {
    user.level = user.level || 1;
    user.xp = (user.xp || 0) + xpGained;
    user.xpToNextLvl = 100;
    const oldLevel = user.level;

    let leveledUp = false;
    while (user.xp >= user.xpToNextLvl) {
        user.xp -= user.xpToNextLvl;
        user.level += 1;
        leveledUp = true;
    }

    user.title = getTitleForLevel(user.level);

    return {
        leveledUp,
        newLevel: user.level,
        newTitle: user.title,
        oldLevel
    };
}

/**
 * Full XP award flow for a completed match.
 * Loads both users, calculates XP, applies, saves.
 * @param {string} winnerId - MongoDB ObjectId string
 * @param {string} loserId  - MongoDB ObjectId string
 * @returns {Promise<object>} XP award details
 */
async function awardMatchXP(winnerId, loserId) {
    try {
        const winner = await User.findById(winnerId);
        const loser = await User.findById(loserId);

        // If users don't exist (e.g. guest/fake IDs), return defaults
        if (!winner || !loser) {
            logger.warn(`XP award skipped: winner=${!!winner}, loser=${!!loser}`);
            return {
                winnerId,
                loserId,
                winnerXpGained: 0,
                loserXpGained: 0,
                winnerLeveledUp: false,
                loserLeveledUp: false,
                winnerLevel: winner?.level || 1,
                loserLevel: loser?.level || 1,
                winnerTitle: winner?.title || 'Recruit',
                loserTitle: loser?.title || 'Recruit'
            };
        }

        const { winnerXp, loserXp } = calculateXP(winner.level, loser.level);

        // Update stats
        winner.winCount += 1;
        winner.gamesPlayed += 1;
        loser.lossCount += 1;
        loser.gamesPlayed += 1;

        const winnerResult = applyXP(winner, winnerXp);
        const loserResult = applyXP(loser, loserXp);

        await winner.save();
        await loser.save();

        logger.info(`XP awarded: Winner(${winnerId}) +${winnerXp}XP → Lv${winnerResult.newLevel}, Loser(${loserId}) +${loserXp}XP → Lv${loserResult.newLevel}`);

        return {
            winnerId,
            loserId,
            winnerXpGained: winnerXp,
            loserXpGained: loserXp,
            winnerLeveledUp: winnerResult.leveledUp,
            loserLeveledUp: loserResult.leveledUp,
            winnerLevel: winnerResult.newLevel,
            loserLevel: loserResult.newLevel,
            winnerTitle: winnerResult.newTitle,
            loserTitle: loserResult.newTitle,
            winnerXp: winner.xp,
            loserXp: loser.xp,
            winnerXpToNext: winner.xpToNextLvl,
            loserXpToNext: loser.xpToNextLvl
        };
    } catch (error) {
        logger.error(`Error awarding XP: ${error.message}`);
        return {
            winnerId,
            loserId,
            winnerXpGained: 0,
            loserXpGained: 0,
            winnerLeveledUp: false,
            loserLeveledUp: false,
            winnerLevel: 1,
            loserLevel: 1,
            winnerTitle: 'Recruit',
            loserTitle: 'Recruit'
        };
    }
}

module.exports = {
    getTitleForLevel,
    calculateXP,
    applyXP,
    awardMatchXP
};
