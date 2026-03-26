const { io } = require('socket.io-client');
const mongoose = require('mongoose');

// Generate fake valid ObjectIds manually to avoid requiring mongoose module setup if not needed
const p1Id = new mongoose.Types.ObjectId().toString();
const p2Id = new mongoose.Types.ObjectId().toString();

const SERVER_URL = 'http://localhost:5000';

const client1 = io(SERVER_URL);
const client2 = io(SERVER_URL);

let roomId = null;

// Helper to wait
const wait = (ms) => new Promise(res => setTimeout(res, ms));

async function runTest() {
    console.log('--- Starting TURENA Socket Logic Test ---');
    console.log(`Player 1 ID: ${p1Id}`);
    console.log(`Player 2 ID: ${p2Id}`);

    // CLIENT 1 Events
    client1.on('connect', () => console.log('Client 1 Connected'));
    client1.on('roomCreated', ({ roomId: r, gameRoom }) => {
        console.log(`[C1] Room Created! ID: ${r}`);
        roomId = r;
    });
    client1.on('gameStarted', ({ gameRoom }) => {
        console.log(`[C1] Game Started!`);
        console.log(`[C1] Initial P1 Pos:`, gameRoom.players[0].playerState.position);
        console.log(`[C1] Initial P2 Pos:`, gameRoom.players[1].playerState.position);
        console.log(`[C1] Current Turn belongs to: ${gameRoom.currentTurn}`);
    });
    client1.on('moveMade', (data) => console.log(`[C1] Move Broadcast Received:`, data));
    client1.on('gameError', (err) => console.error(`[C1] Error: ${err.message}`));
    client1.on('turnChanged', (data) => console.log(`[C1] Turn Changed Broadcast:`, data));
    client1.on('gameOver', (data) => console.log(`[C1] Game Over! Winner: ${data.winner}, Reason: ${data.reason}`));

    // CLIENT 2 Events
    client2.on('connect', () => console.log('Client 2 Connected'));
    client2.on('roomUpdated', (data) => console.log(`[C2] Room Updated: ${data.gameRoom.roomId}`));
    client2.on('gameStarted', () => console.log(`[C2] Game Started!`));
    client2.on('moveMade', (data) => console.log(`[C2] Move Broadcast Received:`, data));
    client2.on('gameError', (err) => console.error(`[C2] Error: ${err.message}`));
    client2.on('turnChanged', (data) => console.log(`[C2] Turn Changed Broadcast:`, data));
    client2.on('gameOver', (data) => console.log(`[C2] Game Over!`));

    await wait(1000);

    console.log('\n--- Action: Player 1 Creates Room ---');
    client1.emit('createRoom', { userId: p1Id });
    await wait(2000); // format: check logs

    if (!roomId) {
        console.log('Failed to generate room. Exiting.');
        process.exit(1);
    }

    console.log('\n--- Action: Player 2 Joins Room ---');
    client2.emit('joinRoom', { roomId, userId: p2Id });
    await wait(2000);

    console.log('\n--- Action: Player 1 Moves (Valid: Distance 3) ---');
    // P1 starts at (1, 4). Valid move to (4, 4)
    client1.emit('makeMove', { roomId, userId: p1Id, action: 'move', x: 4, y: 4 });
    await wait(1000);

    console.log('\n--- Action: Player 2 Moves (Valid: Distance 3) ---');
    // P2 starts at (8, 4). Turn is now P2's. Valid move to (5, 4)
    client2.emit('makeMove', { roomId, userId: p2Id, action: 'move', x: 5, y: 4 });
    await wait(1000);

    console.log('\n--- Action: Player 1 Attacks (Valid: Distance 1) ---');
    // P1 is at (4, 4), P2 is at (5, 4). Distance = 1. Valid attack!
    client1.emit('makeMove', { roomId, userId: p1Id, action: 'attack', x: 5, y: 4 });
    await wait(1000);

    console.log('\n--- Action: Player 2 Attacks (Invalid: Out of Range) ---');
    // P1 is at (4,4), say P2 tries to attack (1,1)
    client2.emit('makeMove', { roomId, userId: p2Id, action: 'attack', x: 1, y: 1 });
    await wait(1000);

    console.log('\n--- Action: Player 2 Attacks (Valid: Distance 1) ---');
    client2.emit('makeMove', { roomId, userId: p2Id, action: 'attack', x: 4, y: 4 });
    await wait(1000);

    console.log('\n--- Test Completed. Disconnecting ---');
    client1.disconnect();
    client2.disconnect();
    setTimeout(() => {
        process.exit(0);
    }, 1000);
}

runTest();
