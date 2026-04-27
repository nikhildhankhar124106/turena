const GameRoom = require('../models/GameRoom');
const PlayerState = require('../models/PlayerState');
const xpManager = require('./xpManager');
const logger = require('./logger');

class TurnManager {
    constructor() {
        this.timers = new Map(); // Map roomId -> Date timeout
    }

    startTurnTimer(io, roomId, durationMs = 30000) {
        this.clearTurnTimer(roomId);

        // Save the expected end time to DB for reconnection logic
        const turnTimerEndsAt = new Date(Date.now() + durationMs);
        GameRoom.findOneAndUpdate({ roomId }, { turnTimerEndsAt })
            .catch(err => logger.error(`Error saving timer for ${roomId}`, err));

        // Start node timeout
        const timerId = setTimeout(async () => {
            logger.info(`⏳ Turn timeout auto-skip for room ${roomId}`);
            await this.handleTurnTimeout(io, roomId);
        }, durationMs);

        this.timers.set(roomId, timerId);
    }

    clearTurnTimer(roomId) {
        if (this.timers.has(roomId)) {
            clearTimeout(this.timers.get(roomId));
            this.timers.delete(roomId);
        }
    }

    async handleTurnTimeout(io, roomId) {
        try {
            const room = await GameRoom.findOne({ roomId }).populate('players.playerState');
            if (!room || room.status !== 'playing') {
                this.clearTurnTimer(roomId);
                return;
            }

            // Turn ended -> switch turn using the turn manager's own switch logic
            await this.switchTurn(io, room);
            // Optionally emit a specific event that a turn was skipped
            io.to(roomId).emit('turnSkipped', { message: 'Turn auto-skipped due to timeout' });
        } catch (error) {
            logger.error(`Error handling turn timeout for ${roomId}: ${error.message}`);
        }
    }

    async switchTurn(io, room) {
        try {
            // Determine current player index
            const currentIndex = room.players.findIndex(
                p => p.playerState._id.toString() === room.currentTurn.toString()
            );

            // Determine next player index
            const nextIndex = (currentIndex + 1) % room.players.length;
            const nextPlayerStateId = room.players[nextIndex].playerState._id;

            room.currentTurn = nextPlayerStateId;
            room.turnNumber += 1;

            // Optional: Cooldown reduction & energy recovery for next player
            const nextPlayerState = await PlayerState.findById(nextPlayerStateId);
            if (nextPlayerState && nextPlayerState.abilityCooldowns) {
                for (const [ability, cooldown] of nextPlayerState.abilityCooldowns) {
                    if (cooldown > 0) {
                        nextPlayerState.abilityCooldowns.set(ability, cooldown - 1);
                    }
                }
            }

            // --- TURENA New Mechanics ---
            let turnEvents = [];

            // 1. Grid Shrinking (Danger Zone) - Every 8 turns
            if (room.turnNumber % 8 === 0) {
                const sz = room.safeZone;
                if (sz.maxX - sz.minX >= 2 && sz.maxY - sz.minY >= 2) {
                    sz.minX++;
                    sz.maxX--;
                    sz.minY++;
                    sz.maxY--;
                    turnEvents.push({ type: 'zoneShrink', safeZone: sz });
                }
            }

            // 2. Mystery Box Logic - Spawn every 6 turns, disappears after 6 turns
            if (room.mysteryBox && room.mysteryBox.activeTurnsLeft > 0) {
                room.mysteryBox.activeTurnsLeft--;
                if (room.mysteryBox.activeTurnsLeft === 0) {
                    room.mysteryBox.x = null;
                    room.mysteryBox.y = null;
                    room.mysteryBox.powerType = null;
                    turnEvents.push({ type: 'boxDespawn' });
                }
            }
            if ((!room.mysteryBox || room.mysteryBox.activeTurnsLeft <= 0) && room.turnNumber % 3 === 0) {
                const sz = room.safeZone;
                const powers = ['create_wall', 'sniper', 'high_jump', 'bullet_vest', 'health_kit'];
                const pType = powers[Math.floor(Math.random() * powers.length)];
                room.mysteryBox = {
                    x: Math.floor(Math.random() * (sz.maxX - sz.minX + 1)) + sz.minX,
                    y: Math.floor(Math.random() * (sz.maxY - sz.minY + 1)) + sz.minY,
                    powerType: pType,
                    activeTurnsLeft: 6
                };
                turnEvents.push({ type: 'boxSpawn', mysteryBox: room.mysteryBox });
            }

            // 2.5 Random Powers every 5 turns for those without power
            try {
                if (room.turnNumber % 5 === 0) {
                    const powers = ['create_wall', 'sniper', 'high_jump', 'bullet_vest'];
                    for (const p of room.players) {
                        const pState = await PlayerState.findById(p.playerState._id);
                        if (pState && pState.hp > 0 && !pState.activePower) {
                            pState.activePower = powers[Math.floor(Math.random() * powers.length)];
                            pState.activePowerTurnsLeft = 3;
                            await pState.save();
                            const uidStr = p.user._id ? p.user._id.toString() : p.user.toString();
                            turnEvents.push({ type: 'powerGranted', userId: uidStr, power: pState.activePower });
                        }
                    }
                }
            } catch (err) {
                logger.error(`[DEBUG] Error in random powers logic: ${err.message}`);
            }

            let alivePlayers = [];
            let hpMap = new Map();
            // 3. Auto-Death Check
            for (const p of room.players) {
                const pState = await PlayerState.findById(p.playerState._id);
                if (pState.hp > 0) {
                    hpMap.set(p.user.toString(), pState.hp);
                    const outOfBounds = pState.position.x < room.safeZone.minX || pState.position.x > room.safeZone.maxX || pState.position.y < room.safeZone.minY || pState.position.y > room.safeZone.maxY;
                    if (outOfBounds) {
                        pState.hp = 0;
                        pState.isAlive = false;
                        await pState.save();
                        io.to(room.roomId).emit('playerHit', { targetId: p.user, newHp: 0, reason: 'danger_zone' });
                    } else {
                        alivePlayers.push(p.user);
                    }
                }
            }

            if (nextPlayerState) {
                if (nextPlayerState.activePower && nextPlayerState.activePowerTurnsLeft > 0) {
                    nextPlayerState.activePowerTurnsLeft -= 1;
                    if (nextPlayerState.activePowerTurnsLeft <= 0) {
                        const expiredPower = nextPlayerState.activePower;
                        nextPlayerState.activePower = null;
                        const uidStr = room.players[nextIndex].user._id ? room.players[nextIndex].user._id.toString() : room.players[nextIndex].user.toString();
                        turnEvents.push({ type: 'powerExpired', userId: uidStr, power: expiredPower });
                    }
                }
                await nextPlayerState.save();
            }

            // Set new endsAt time
            const durationMs = 30000;
            room.turnTimerEndsAt = new Date(Date.now() + durationMs);
            await room.save();

            // Broadcast new turn
            io.to(room.roomId).emit('turnChanged', {
                currentTurn: room.currentTurn,
                turnNumber: room.turnNumber,
                turnTimerEndsAt: room.turnTimerEndsAt,
                events: turnEvents
            });

            // 4. Game Over evaluation
            if (alivePlayers.length <= 1) {
                room.status = 'finished';
                let winnerId = alivePlayers.length === 1 ? alivePlayers[0] : null;
                
                if (alivePlayers.length === 0 && hpMap.size > 0) {
                    let bestUserId = null;
                    let bestHp = -1;
                    for (const [uid, hp] of hpMap.entries()) {
                        if (hp > bestHp) {
                            bestHp = hp;
                            bestUserId = uid;
                        } else if (hp === bestHp) {
                            bestUserId = null; // tie, no winner
                        }
                    }
                    winnerId = bestUserId;
                }
                room.winner = winnerId;
                await room.save();
                this.clearTurnTimer(room.roomId);

                let xpDetails = { winnerXpGained: 0, loserXpGained: 0 };
                if (winnerId) {
                    const loserId = room.players.find(p => p.user.toString() !== winnerId.toString())?.user;
                    if (loserId) {
                        xpDetails = await xpManager.awardMatchXP(winnerId.toString(), loserId.toString());
                    }
                }

                const MatchHistory = require('../models/MatchHistory');
                const matchHistory = new MatchHistory({
                    roomId: room.roomId,
                    players: room.players.map(p => p.user),
                    winner: winnerId,
                    durationSeconds: Math.floor((Date.now() - new Date(room.createdAt).getTime()) / 1000),
                    totalTurns: room.turnNumber,
                    endedAt: new Date(),
                    winnerXpGained: xpDetails.winnerXpGained,
                    loserXpGained: xpDetails.loserXpGained,
                    winnerLevel: xpDetails.winnerLevel,
                    loserLevel: xpDetails.loserLevel
                });
                await matchHistory.save().catch(err => logger.error('Error saving match', err));

                io.to(room.roomId).emit('gameOver', { winner: winnerId, reason: 'Danger Zone Elimination' });
                if (winnerId) {
                   io.to(room.roomId).emit('xpAwarded', xpDetails);
                }
                return;
            }

            // Start a new timer
            this.startTurnTimer(io, room.roomId, durationMs);
        } catch (error) {
            logger.error(`Error switching turn for ${room.roomId}: ${error.message}`);
        }
    }
}

module.exports = new TurnManager();
