export const getManhattanDistance = (x1, y1, x2, y2) => {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
};

export const isValidMove = (playerPos, targetX, targetY) => {
    if (!playerPos) return false;
    const dist = getManhattanDistance(playerPos.x, playerPos.y, targetX, targetY);
    // Max 3 tiles
    return dist >= 1 && dist <= 3;
};

export const isValidAttack = (playerPos, targetX, targetY) => {
    if (!playerPos) return false;
    const dist = getManhattanDistance(playerPos.x, playerPos.y, targetX, targetY);
    // Exactly 1 tile horizontally/vertically for adjacent (Manhattan)
    return dist === 1;
};
