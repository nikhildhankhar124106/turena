const crypto = require('crypto');
const logger = require('../utils/logger');
const mongoose = require('mongoose');

const GameRoom = require('../models/GameRoom');
const PlayerState = require('../models/PlayerState');
const User = require('../models/User');
const MatchHistory = require('../models/MatchHistory');

const turnManager = require('../utils/turnManager');
const { validateMove, validateAttack } = require('../utils/gameLogic');

/**
 * Initialise Socket.io event handlers.
 * @param {import('socket.io').Server} io
 */
const initSocket = (io) => {
    io.on('connection', (socket) => {
        logger.info(`⚡ Socket connected: ${socket.id}`);

        // ── Create a game room ────────────────────────────────────────────
        socket.on('createRoom', async ({ userId }) => {
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
        socket.on('joinRoom', async ({ roomId, userId }) => {
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
        socket.on('makeMove', async ({ roomId, userId, x, y, action }) => {
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
                    // Maximum 3 tiles distance
                    if (!validateMove(playerState.position, targetPos)) {
                        return socket.emit('gameError', { message: 'Invalid move distance.' });
                    }

                    // Update position
                    playerState.position = targetPos;
                    await playerState.save();

                } else if (action === 'attack') {
                    // Adjacent tile only
                    if (!validateAttack(playerState.position, targetPos)) {
                        return socket.emit('gameError', { message: 'Target out of range.' });
                    }

                    // Find if there is an opponent at targetPos
                    const opponentRecord = room.players.find(p =>
                        p.playerState.position.x === targetPos.x &&
                        p.playerState.position.y === targetPos.y &&
                        p.user.toString() !== userId
                    );

                    if (opponentRecord) {
                        const opponentState = opponentRecord.playerState;
                        const damage = 20; // Default or calculate based on skills
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
                            const matchHistory = new MatchHistory({
                                roomId: room.roomId,
                                players: room.players.map(p => p.user),
                                winner: userId,
                                durationSeconds,
                                totalTurns: room.turnNumber,
                                endedAt: new Date()
                            });
                            await matchHistory.save().catch(err => logger.error('Error saving match history', err));

                            io.to(roomId).emit('gameOver', { winner: userId, reason: 'Opponent defeated' });
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

        // ── Leave a game room ───────────────────────────────────────────
        socket.on('leaveRoom', ({ roomId, userId }) => {
            socket.leave(roomId);
            turnManager.clearTurnTimer(roomId); // Note: Should probably check if game is entirely empty or handle properly but skipping for now
            logger.info(`User ${userId} left room ${roomId}`);
            socket.to(roomId).emit('playerLeft', { userId });
        });

        // ── Disconnect ──────────────────────────────────────────────────
        socket.on('disconnect', () => {
            logger.info(`🔌 Socket disconnected: ${socket.id}`);
        });
    });
};

module.exports = initSocket;
