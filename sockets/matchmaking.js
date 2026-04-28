const crypto = require('crypto');
const logger = require('../utils/logger');
const User = require('../models/User');
const GameRoom = require('../models/GameRoom');
const PlayerState = require('../models/PlayerState');
const turnManager = require('../utils/turnManager');

/**
 * In-memory matchmaking queue with level-based pairing.
 */
class Matchmaking {
    constructor() {
        this.queue = []; // { socketId, userId, level, username, title, enqueuedAt }
        this.tickInterval = null;
    }

    /**
     * Start the matchmaking tick loop.
     * @param {import('socket.io').Server} io
     */
    start(io) {
        if (this.tickInterval) return;
        this.tickInterval = setInterval(() => this.tick(io), 2000);
        logger.info('Matchmaking system started');
    }

    stop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    /**
     * Add a player to the queue.
     */
    async addToQueue(socket, userId) {
        // Remove duplicate entries
        this.removeFromQueue(userId);

        let level = 1;
        let username = 'Player';
        let title = 'Recruit';

        try {
            const user = await User.findById(userId);
            if (user) {
                level = user.level || 1;
                username = user.username || 'Player';
                title = user.title || 'Recruit';
            }
        } catch (err) {
            // Guest/fake user — default level 1
            logger.warn(`Could not fetch user ${userId} for matchmaking, using defaults`);
        }

        const entry = {
            socketId: socket.id,
            userId,
            level,
            username,
            title,
            enqueuedAt: Date.now()
        };

        this.queue.push(entry);
        logger.info(`Player ${userId} (Lv${level}) joined queue. Queue size: ${this.queue.length}`);

        socket.emit('queueJoined', {
            position: this.queue.length,
            level,
            username,
            title
        });
    }

    /**
     * Remove a player from the queue.
     */
    removeFromQueue(userId) {
        const idx = this.queue.findIndex(e => e.userId === userId);
        if (idx !== -1) {
            this.queue.splice(idx, 1);
            logger.info(`Player ${userId} left queue. Queue size: ${this.queue.length}`);
        }
    }

    /**
     * Remove a player by socket ID (for disconnects).
     */
    removeBySocketId(socketId) {
        const idx = this.queue.findIndex(e => e.socketId === socketId);
        if (idx !== -1) {
            logger.info(`Player ${this.queue[idx].userId} removed from queue (disconnect)`);
            this.queue.splice(idx, 1);
        }
    }

    /**
     * Get the allowed level range based on wait time.
     */
    getAllowedRange(waitTimeMs) {
        if (waitTimeMs >= 20000) return Infinity;  // Match with anyone
        if (waitTimeMs >= 15000) return 5;
        if (waitTimeMs >= 10000) return 2;
        if (waitTimeMs >= 5000) return 1;
        return 0; // strict exact match initially
    }

    /**
     * Get a warning message for wait time thresholds.
     */
    getWarningForWaitTime(waitTimeMs) {
        if (waitTimeMs >= 20000) return { message: 'Not same level, searching for more or less level player (ANY)...', expandedRange: 'ANY' };
        if (waitTimeMs >= 15000) return { message: 'Not same level, searching for more or less level player (±5)...', expandedRange: '±5' };
        if (waitTimeMs >= 10000) return { message: 'Not same level, searching for more or less level player (±2)...', expandedRange: '±2' };
        if (waitTimeMs >= 5000) return { message: 'Not same level, searching for more or less level player...', expandedRange: '±1' };
        return null;
    }

    /**
     * Main tick — try to find matches.
     */
    async tick(io) {
        if (this.queue.length < 2) return;

        const matched = new Set();

        // Send queue updates and warnings
        for (const entry of this.queue) {
            const waitTime = Date.now() - entry.enqueuedAt;
            const socket = io.sockets.sockets.get(entry.socketId);
            if (!socket) {
                this.removeFromQueue(entry.userId);
                continue;
            }

            // Send periodic updates
            socket.emit('queueUpdate', {
                position: this.queue.indexOf(entry) + 1,
                waitTime: Math.floor(waitTime / 1000),
                queueSize: this.queue.length
            });

            // Send warning when range expands
            const warning = this.getWarningForWaitTime(waitTime);
            if (warning) {
                // Only send at transition points (within the tick window)
                const prevTick = waitTime - 2000;
                const prevWarning = this.getWarningForWaitTime(prevTick);
                if (!prevWarning || prevWarning.expandedRange !== warning.expandedRange) {
                    socket.emit('matchmakingWarning', warning);
                }
            }
        }

        // Try to find matches
        for (let i = 0; i < this.queue.length; i++) {
            if (matched.has(i)) continue;
            const playerA = this.queue[i];
            const waitA = Date.now() - playerA.enqueuedAt;
            const rangeA = this.getAllowedRange(waitA);

            let bestMatch = -1;
            let bestDiff = Infinity;

            for (let j = i + 1; j < this.queue.length; j++) {
                if (matched.has(j)) continue;
                const playerB = this.queue[j];
                const waitB = Date.now() - playerB.enqueuedAt;
                const rangeB = this.getAllowedRange(waitB);

                const levelDiff = Math.abs(playerA.level - playerB.level);
                const allowedRange = Math.max(rangeA, rangeB); // Use the wider range

                if (levelDiff <= allowedRange && levelDiff < bestDiff) {
                    bestDiff = levelDiff;
                    bestMatch = j;
                }
            }

            if (bestMatch !== -1) {
                matched.add(i);
                matched.add(bestMatch);

                const playerB = this.queue[bestMatch];
                // Create the match
                this.createMatch(io, playerA, playerB);
            }
        }

        // Remove matched players from queue (in reverse order to maintain indices)
        const toRemove = Array.from(matched).sort((a, b) => b - a);
        for (const idx of toRemove) {
            this.queue.splice(idx, 1);
        }
    }

    /**
     * Create a game room for two matched players.
     */
    async createMatch(io, playerA, playerB) {
        try {
            const roomId = crypto.randomBytes(3).toString('hex').toUpperCase();

            const gameRoom = new GameRoom({
                roomId,
                status: 'playing',
                players: [],
                gridSize: { rows: 10, cols: 10 },
            });

            // Create PlayerStates
            const p1State = new PlayerState({
                gameRoom: gameRoom._id,
                user: playerA.userId,
                position: { x: 1, y: 4 },
            });
            await p1State.save();

            const p2State = new PlayerState({
                gameRoom: gameRoom._id,
                user: playerB.userId,
                position: { x: 8, y: 4 },
            });
            await p2State.save();

            gameRoom.players.push(
                { user: playerA.userId, playerState: p1State._id },
                { user: playerB.userId, playerState: p2State._id }
            );

            // Setup turn
            gameRoom.currentTurn = p1State._id;
            gameRoom.turnNumber = 1;
            const durationMs = 30000;
            gameRoom.turnTimerEndsAt = new Date(Date.now() + durationMs);
            await gameRoom.save();

            // Join both sockets to the room
            const socketA = io.sockets.sockets.get(playerA.socketId);
            const socketB = io.sockets.sockets.get(playerB.socketId);

            if (socketA) socketA.join(roomId);
            if (socketB) socketB.join(roomId);

            // Start turn timer
            turnManager.startTurnTimer(io, roomId, durationMs);

            // Populate and broadcast
            const populatedRoom = await GameRoom.findOne({ roomId }).populate('players.playerState');

            // Send matchFound to both players with opponent info
            if (socketA) {
                socketA.emit('matchFound', {
                    roomId,
                    opponent: { username: playerB.username, level: playerB.level, title: playerB.title, userId: playerB.userId }
                });
            }
            if (socketB) {
                socketB.emit('matchFound', {
                    roomId,
                    opponent: { username: playerA.username, level: playerA.level, title: playerA.title, userId: playerA.userId }
                });
            }

            // Broadcast game start
            io.to(roomId).emit('gameStarted', { gameRoom: populatedRoom });

            logger.info(`Match created: ${playerA.username}(Lv${playerA.level}) vs ${playerB.username}(Lv${playerB.level}) in room ${roomId}`);
        } catch (error) {
            logger.error(`Error creating match: ${error.message}`);
        }
    }
}

module.exports = new Matchmaking();
