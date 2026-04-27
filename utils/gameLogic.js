/**
 * Calculate distance between two points (Manhattan distance)
 * @param {Object} pos1 {x, y}
 * @param {Object} pos2 {x, y}
 * @returns {number}
 */
const getDistance = (pos1, pos2) => {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
};

const getBfsDistance = (startPos, targetPos, walls = []) => {
    if (startPos.x === targetPos.x && startPos.y === targetPos.y) return 0;
    const queue = [{ x: startPos.x, y: startPos.y, dist: 0 }];
    const visited = new Set();
    visited.add(`${startPos.x},${startPos.y}`);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.x === targetPos.x && current.y === targetPos.y) return current.dist;

        // Limiting search arbitrarily to keep it fast
        if (current.dist >= 15) continue;

        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ];

        for (const n of neighbors) {
            const isWall = walls.some(w => w.x === n.x && w.y === n.y);
            const key = `${n.x},${n.y}`;
            if (!isWall && !visited.has(key)) {
                visited.add(key);
                queue.push({ x: n.x, y: n.y, dist: current.dist + 1 });
            }
        }
    }
    return Infinity;
};

/**
 * Validate a move action
 * @param {Object} currentPos {x, y}
 * @param {Object} targetPos {x, y}
 * @param {string} activePower
 * @param {Array} walls
 * @returns {boolean}
 */
const validateMove = (currentPos, targetPos, activePower, walls = []) => {
    // Check if target is a wall
    const isWall = walls.some(w => w.x === targetPos.x && w.y === targetPos.y);
    if (isWall) return false;

    if (activePower === 'high_jump') {
        const distance = getDistance(currentPos, targetPos);
        return distance >= 1 && distance <= 5;
    }

    const pathDistance = getBfsDistance(currentPos, targetPos, walls);
    return pathDistance >= 1 && pathDistance <= 3;
};

/**
 * Validate an attack action
 * @param {Object} currentPos {x, y}
 * @param {Object} targetPos {x, y}
 * @param {string} activePower
 * @returns {boolean}
 */
const validateAttack = (currentPos, targetPos, activePower, walls = []) => {
    const distance = getDistance(currentPos, targetPos);
    const maxDistance = activePower === 'sniper' ? 5 : 1;
    
    if (distance < 1 || distance > maxDistance) return false;

    if (activePower === 'sniper') {
        if (currentPos.x !== targetPos.x && currentPos.y !== targetPos.y) {
            return false;
        }
        const minX = Math.min(currentPos.x, targetPos.x);
        const maxX = Math.max(currentPos.x, targetPos.x);
        const minY = Math.min(currentPos.y, targetPos.y);
        const maxY = Math.max(currentPos.y, targetPos.y);

        for (const wall of walls) {
            if (currentPos.y === targetPos.y && wall.y === currentPos.y) {
                if (wall.x > minX && wall.x < maxX) return false;
            }
            if (currentPos.x === targetPos.x && wall.x === currentPos.x) {
                if (wall.y > minY && wall.y < maxY) return false;
            }
        }
    }
    return true;
};

module.exports = {
    getDistance,
    validateMove,
    validateAttack
};
