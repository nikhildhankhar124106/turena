export const getManhattanDistance = (x1, y1, x2, y2) => {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
};

const getBfsDistance = (startX, startY, targetX, targetY, walls = []) => {
    if (startX === targetX && startY === targetY) return 0;
    const queue = [{ x: startX, y: startY, dist: 0 }];
    const visited = new Set();
    visited.add(`${startX},${startY}`);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.x === targetX && current.y === targetY) return current.dist;

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

export const isValidMove = (playerPos, targetX, targetY, activePower, walls = []) => {
    if (!playerPos) return false;
    const isWall = walls.some(w => w.x === targetX && w.y === targetY);
    if (isWall) return false;

    if (activePower === 'high_jump') {
        const dist = getManhattanDistance(playerPos.x, playerPos.y, targetX, targetY);
        return dist >= 1 && dist <= 5;
    }

    const pathDist = getBfsDistance(playerPos.x, playerPos.y, targetX, targetY, walls);
    return pathDist >= 1 && pathDist <= 3;
};

export const isValidAttack = (playerPos, targetX, targetY, activePower) => {
    if (!playerPos) return false;
    const dist = getManhattanDistance(playerPos.x, playerPos.y, targetX, targetY);
    // Exactly 1 tile horizontally/vertically normally, 5 for sniper
    const maxDist = activePower === 'sniper' ? 5 : 1;
    return dist >= 1 && dist <= maxDist;
};
