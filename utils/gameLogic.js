/**
 * Calculate distance between two points (Manhattan distance)
 * @param {Object} pos1 {x, y}
 * @param {Object} pos2 {x, y}
 * @returns {number}
 */
const getDistance = (pos1, pos2) => {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
};

/**
 * Validate a move action
 * @param {Object} currentPos {x, y}
 * @param {Object} targetPos {x, y}
 * @returns {boolean}
 */
const validateMove = (currentPos, targetPos) => {
    const distance = getDistance(currentPos, targetPos);
    // Max 3 tiles distance
    return distance >= 1 && distance <= 3;
};

/**
 * Validate an attack action
 * @param {Object} currentPos {x, y}
 * @param {Object} targetPos {x, y}
 * @returns {boolean}
 */
const validateAttack = (currentPos, targetPos) => {
    const distance = getDistance(currentPos, targetPos);
    // Adjacent tile only
    return distance === 1;
};

module.exports = {
    getDistance,
    validateMove,
    validateAttack
};
