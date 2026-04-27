const crypto = require('crypto');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const GameRoom = require('../models/GameRoom');
const PlayerState = require('../models/PlayerState');
const User = require('../models/User');
const MatchHistory = require('../models/MatchHistory');

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const turnManager = require('../utils/turnManager');
const matchmaking = require('./matchmaking');
const xpManager = require('../utils/xpManager');
const { validateMove, validateAttack } = require('../utils/gameLogic');

/**
 * Initialise Socket.io event handlers.
 * @param {import('socket.io').Server} io
 */
const initSocket = (io) => {
    // Socket authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.userId = decoded.id;
            next();
        } catch (err) {
            return next(new Error('Authentication error: Invalid token'));
        }
    });

    // Start the matchmaking loop for this server instance
    matchmaking.start(io);

    io.on('connection', (socket) => {
        logger.info(` Socket connected: ${socket.id} (User: ${socket.userId})`);

        // ── Matchmaking Queue ─────────────────────────────────────────────
        socket.on('joinQueue', () => {
            const userId = socket.userId;
            if (!userId) return socket.emit('gameError', { message: 'User ID required' });
            matchmaking.addToQueue(socket, userId);
        });

        socket.on('leaveQueue', () => {
            const userId = socket.userId;
            if (!userId) return;
            matchmaking.removeFromQueue(userId);
        });

        // ── Create a game room ────────────────────────────────────────────
        socket.on('createRoom', async () => {
            const userId = socket.userId;
            try {
                if (!userId) {
                    return socket.emit('gameError', { message: 'User ID is required to create a room' });
                }

                // Generate a 6-character hex room ID
                const roomId = crypto.randomBytes(3).toString('hex').toUpperCase();

                // Create the room
                const gameRoom = new GameRoom({
                    roomId,
                    status: 'waiting',
                    players: [],
                    gridSize: { rows: 10, cols: 10 },
                });
                await gameRoom.save();

                // Create PlayerState for host
                const playerState = new PlayerState({
                    gameRoom: gameRoom._id,
                    user: userId,
                    position: { x: 0, y: 0 },
                });
                await playerState.save();

                // Add to room
                gameRoom.players.push({ user: userId, playerState: playerState._id });
                await gameRoom.save();

                socket.join(roomId);
                logger.info(`User ${userId} created and joined room ${roomId}`);

                // Send back creation confirmation
                socket.emit('roomCreated', { roomId, gameRoom });

            } catch (error) {
                logger.error(`Error in createRoom: ${error.message}`);
                socket.emit('gameError', { message: 'Server error creating room' });
            }
        });

        // ── Join a game room ──────────────────────────────────────────────
        socket.on('joinRoom', async ({ roomId }) => {
            const userId = socket.userId;
            try {
                if (!roomId || !userId) {
                    return socket.emit('gameError', { message: 'roomId and userId are required' });
                }

                // Find room without populating to make modifications easier
                const room = await GameRoom.findOne({ roomId });

                if (!room) {
                    return socket.emit('gameError', { message: 'Room not found' });
                }

                if (room.status !== 'waiting') {
                    return socket.emit('gameError', { message: `Cannot join room in ${room.status} state` });
                }

                if (room.players.length >= 2) {
                    return socket.emit('gameError', { message: 'Room is full' });
                }

                // Check if user is already in the room
                const isAlreadyInRoom = room.players.some(p => p.user.toString() === userId);
                if (isAlreadyInRoom) {
                    socket.join(roomId);
                    return socket.emit('roomJoined', { roomId, gameRoom: room, message: 'Rejoined room' });
                }

                // Create PlayerState for Joiner
                const playerState = new PlayerState({
                    gameRoom: room._id,
                    user: userId,
                    position: { x: 0, y: 0 },
                });
                await playerState.save();

                room.players.push({ user: userId, playerState: playerState._id });

                socket.join(roomId);
                logger.info(`User ${userId} joined room ${roomId}`);

                // Start game if 2 players reached
                if (room.players.length === 2) {
                    room.status = 'playing';

                    // Assign Initial Positions
                    const p1StateId = room.players[0].playerState;
                    await PlayerState.findByIdAndUpdate(p1StateId, { position: { x: 1, y: 4 } });

                    const p2StateId = room.players[1].playerState;
                    await PlayerState.findByIdAndUpdate(p2StateId, { position: { x: 8, y: 4 } });

                    // Setup turn tracking
                    room.currentTurn = p1StateId;
                    room.turnNumber = 1;

                    // Set start timer
                    const durationMs = 30000;
                    room.turnTimerEndsAt = new Date(Date.now() + durationMs);

                    await room.save();

                    // Start turn timer in memory
                    turnManager.startTurnTimer(io, roomId, durationMs);

                    // Re-fetch populated room to broadcast full state
                    const populatedRoom = await GameRoom.findOne({ roomId }).populate('players.playerState');

                    // Broadcast game start to room
                    io.to(roomId).emit('gameStarted', { gameRoom: populatedRoom });
                    logger.info(`Game started in room ${roomId}. Turn timer started.`);
                } else {
                    await room.save();
                    // Broadcast updated room state (waiting for Player 2)
                    io.to(roomId).emit('roomUpdated', { gameRoom: room });
                }

            } catch (error) {
                logger.error(`Error in joinRoom: ${error.message}`);
                socket.emit('gameError', { message: 'Server error joining room' });
            }
        });

        // ── Handle a move/action ───────────────────────────────────────────────
        socket.on('makeMove', async ({ roomId, x, y, action }) => {
            const userId = socket.userId;
            try {
                logger.info(`Action '${action}' in ${roomId} by ${userId} to (${x},${y})`);

                const room = await GameRoom.findOne({ roomId }).populate('players.playerState');
                if (!room || room.status !== 'playing') {
                    logger.info(`[DEBUG] makeMove rejected: room=${room ? room.roomId : 'null'}, status=${room ? room.status : 'N/A'}`);
                    return socket.emit('gameError', { message: 'Invalid or inactive room' });
                }

                // Find acting player's state
                const playerRecord = room.players.find(p => p.user.toString() === userId);
                if (!playerRecord) {
                    logger.info(`[DEBUG] Player not found: userId=${userId}, players=${room.players.map(p => p.user.toString())}`);
                    return socket.emit('gameError', { message: 'Player not in this room' });
                }

                const playerState = playerRecord.playerState;

                // 1. Turn validation
                if (room.currentTurn.toString() !== playerState._id.toString()) {
                    logger.info(`[DEBUG] Not your turn: currentTurn=${room.currentTurn}, playerStateId=${playerState._id}`);
                    return socket.emit('gameError', { message: 'Not your turn' });
                }

                const targetPos = { x, y };

                // 2. Action validation
                if (action === 'move') {
                    // Maximum 3 tiles distance normally (or 6 for high_jump)
                    if (!validateMove(playerState.position, targetPos, playerState.activePower, room.walls)) {
                        return socket.emit('gameError', { message: 'Invalid move.' });
                    }

                    // Update position
                    playerState.position = targetPos;
                    
                    if (playerState.activePower === 'high_jump') {
                        playerState.activePower = null; // Expires after one use
                        io.to(roomId).emit('powerExpired', { userId: userId, power: 'high_jump' });
                    }

                    // Mystery Box Pickup
                    if (room.mysteryBox && room.mysteryBox.x === targetPos.x && room.mysteryBox.y === targetPos.y && room.mysteryBox.powerType) {
                        const collectedPower = room.mysteryBox.powerType;
                        if (collectedPower === 'health_kit') {
                            playerState.hp = 100; // Insta heal
                            io.to(roomId).emit('playerHit', { targetId: userId, newHp: 100, reason: 'heal' });
                        } else {
                            playerState.activePower = collectedPower;
                            playerState.activePowerTurnsLeft = 3;
                        }
                        room.mysteryBox.activeTurnsLeft = 0; // consumed
                        room.mysteryBox.powerType = null;
                        io.to(roomId).emit('boxCollected', { userId, power: collectedPower });
                    }

                    await playerState.save();

                } else if (action === 'attack') {
                    // Adjacent tile only normally (or 5 for sniper)
                    if (!validateAttack(playerState.position, targetPos, playerState.activePower, room.walls)) {
                        return socket.emit('gameError', { message: 'Target out of range.' });
                    }
                    let isSniperShot = false;
                    if (playerState.activePower === 'sniper') {
                        isSniperShot = true;
                        playerState.activePower = null; // Expires after one use
                        io.to(roomId).emit('powerExpired', { userId: userId, power: 'sniper' });
                        await playerState.save();
                    }

                    // Find if there is an opponent at targetPos
                    const opponentRecord = room.players.find(p =>
                        p.playerState.position.x === targetPos.x &&
                        p.playerState.position.y === targetPos.y &&
                        p.user.toString() !== userId
                    );

                    if (opponentRecord) {
                        const opponentState = opponentRecord.playerState;
                        let damage = isSniperShot ? 30 : 20; // Default or calculate based on skills
                        
                        if (opponentState.activePower === 'bullet_vest') {
                            damage = 10;
                            opponentState.activePower = null; // Expires after absorbing a hit
                            io.to(roomId).emit('powerExpired', { userId: opponentRecord.user.toString(), power: 'bullet_vest' });
                        }

                        opponentState.hp = Math.max(0, opponentState.hp - damage);
                        if (opponentState.hp === 0) {
                            opponentState.isAlive = false;
                            // Optionally trigger end game logic if opponent dies
                            room.status = 'finished';
                            room.winner = userId;
                            await room.save();
                            turnManager.clearTurnTimer(roomId);

                            // Save MatchHistory record
                            const durationSeconds = Math.floor((Date.now() - new Date(room.createdAt).getTime()) / 1000);
                            
                            // Award XP and calculate gains
                            const xpDetails = await xpManager.awardMatchXP(userId, opponentRecord.user.toString());
                            
                            const matchHistory = new MatchHistory({
                                roomId: room.roomId,
                                players: room.players.map(p => p.user),
                                winner: userId,
                                durationSeconds,
                                totalTurns: room.turnNumber,
                                endedAt: new Date(),
                                winnerXpGained: xpDetails.winnerXpGained,
                                loserXpGained: xpDetails.loserXpGained,
                                winnerLevel: xpDetails.winnerLevel,
                                loserLevel: xpDetails.loserLevel
                            });
                            await matchHistory.save().catch(err => logger.error('Error saving match history', err));

                            io.to(roomId).emit('gameOver', { winner: userId, reason: 'Opponent defeated' });
                            
                            // Send individual XP results
                            io.to(roomId).emit('xpAwarded', xpDetails);
                        }
                        await opponentState.save();

                        // Broadcast updated HP
                        io.to(roomId).emit('playerHit', {
                            attackerId: userId,
                            targetId: opponentRecord.user,
                            damage,
                            newHp: opponentState.hp
                        });
                    } else {
                        // Attack missed / empty tile
                        socket.emit('gameWarning', { message: 'Attack missed, no target at location' });
                    }
                } else if (action === 'usePower') {
                    if (playerState.activePower === 'create_wall') {
                        const wallTiles = [
                            { x: x - 1, y },
                            { x, y },
                            { x: x + 1, y }
                        ];
                        let placedWalls = [];
                        for (const tile of wallTiles) {
                            if (tile.x >= 0 && tile.x < 10 && tile.y >= 0 && tile.y < 10) {
                                const isOccupied = room.players.some(p => p.playerState.position.x === tile.x && p.playerState.position.y === tile.y && p.playerState.hp > 0);
                                const isWall = room.walls.some(w => w.x === tile.x && w.y === tile.y);
                                if (!isOccupied && !isWall) {
                                    room.walls.push(tile);
                                    placedWalls.push(tile);
                                }
                            }
                        }

                        if (placedWalls.length > 0) {
                            playerState.activePower = null; // Consume power
                            await playerState.save();
                            await room.save();
                            placedWalls.forEach(w => io.to(roomId).emit('wallCreated', w));
                            io.to(roomId).emit('powerExpired', { userId: userId, power: 'create_wall' });
                        } else {
                            return socket.emit('gameError', { message: 'Cannot place wall here.' });
                        }
                    } else {
                        return socket.emit('gameError', { message: 'No applicable power to use directly on tile.' });
                    }
                } else {
                    return socket.emit('gameError', { message: 'Unknown action' });
                }

                // Successfully executed action, broadcast the move
                io.to(roomId).emit('moveMade', { userId, x, y, action });

                // If game ended during attack, don't switch turn
                if (room.status === 'playing') {
                    // 3. Switch Turn automatically after an action
                    await turnManager.switchTurn(io, room);
                }

            } catch (error) {
                logger.error(`Error in makeMove: ${error.message}`);
                socket.emit('gameError', { message: 'Server error processing move' });
            }
        });

        // ── Choose Initial Power ──────────────────────────────────────────────
        socket.on('chooseInitialPower', async ({ roomId, power }) => {
            const userId = socket.userId;
            try {
                const room = await GameRoom.findOne({ roomId }).populate('players.playerState');
                if (!room || room.status !== 'playing') {
                    return socket.emit('gameError', { message: 'Invalid or inactive room' });
                }
                const playerRecord = room.players.find(p => p.user.toString() === userId);
                if (playerRecord) {
                    const playerState = playerRecord.playerState;
                    if (!playerState.activePower) {
                        playerState.activePower = power;
                        playerState.activePowerTurnsLeft = 3;
                        await playerState.save();
                        io.to(roomId).emit('powerChosen', { userId, power });
                    }
                }
            } catch (error) {
                logger.error(`Error choosing power: ${error.message}`);
            }
        });

        // ── Leave a game room ───────────────────────────────────────────
        socket.on('leaveRoom', ({ roomId }) => {
            const userId = socket.userId;
            socket.leave(roomId);
            turnManager.clearTurnTimer(roomId); // Note: Should probably check if game is entirely empty or handle properly but skipping for now
            logger.info(`User ${userId} left room ${roomId}`);
            socket.to(roomId).emit('playerLeft', { userId });
        });

        // ── Disconnect ──────────────────────────────────────────────────
        socket.on('disconnect', () => {
            logger.info(` Socket disconnected: ${socket.id}`);
            matchmaking.removeBySocketId(socket.id);
        });
    });
};

module.exports = initSocket;
