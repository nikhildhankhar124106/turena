const GameRoom = require('../models/GameRoom');
const PlayerState = require('../models/PlayerState');
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
                turnTimerEndsAt: room.turnTimerEndsAt
            });

            // Start a new timer
            this.startTurnTimer(io, room.roomId, durationMs);
        } catch (error) {
            logger.error(`Error switching turn for ${room.roomId}: ${error.message}`);
        }
    }
}

module.exports = new TurnManager();
