import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Grid from './components/Grid';

const SERVER_URL = 'http://localhost:5000';

const generateFakeId = () => {
    const chars = 'abcdef0123456789';
    return Array.from({ length: 24 }).map(() => chars[Math.floor(Math.random() * 16)]).join('');
};

const App = () => {
    // Use a generated valid MongoDB ObjectId string for testing
    const [myPlayerId, setMyPlayerId] = useState(() => {
        const stored = sessionStorage.getItem('turenaUserId');
        if (stored) return stored;
        const newId = generateFakeId();
        sessionStorage.setItem('turenaUserId', newId);
        return newId;
    });

    const [socket, setSocket] = useState(null);

    // View states: 'lobby', 'waiting', 'game'
    const [view, setView] = useState('lobby');
    const [roomIdInput, setRoomIdInput] = useState('');
    const [currentRoom, setCurrentRoom] = useState(null);

    const [matchResult, setMatchResult] = useState(null);
    const [floatingTexts, setFloatingTexts] = useState([]);

    const [timeLeft, setTimeLeft] = useState(30);

    // Mapped game state for Grid
    const [gameState, setGameState] = useState({
        currentTurn: null,
        players: []
    });

    // --- Socket Initialization ---
    useEffect(() => {
        const newSocket = io(SERVER_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => console.log('Connected to Server'));

        newSocket.on('roomCreated', ({ roomId, gameRoom }) => {
            setCurrentRoom(roomId);
            setView('waiting');
            mapServerStateToFrontend(gameRoom);
        });

        newSocket.on('roomJoined', ({ roomId, gameRoom }) => {
            setCurrentRoom(roomId);
            setView('waiting');
            mapServerStateToFrontend(gameRoom);
        });

        newSocket.on('roomUpdated', ({ gameRoom }) => {
            mapServerStateToFrontend(gameRoom);
        });

        newSocket.on('gameStarted', ({ gameRoom }) => {
            setCurrentRoom(gameRoom.roomId);
            setView('game');
            setMatchResult(null);
            mapServerStateToFrontend(gameRoom);
        });

        newSocket.on('moveMade', ({ userId, x, y, action }) => {
            if (action === 'move') {
                // Optimistically update position, true state comes natively usually, but lets update
                setGameState(prev => {
                    const players = [...prev.players];
                    const p = players.find(p => p.id === userId);
                    if (p) {
                        p.pos = { x, y };
                    }
                    return { ...prev, players };
                });
            }
        });

        newSocket.on('turnChanged', (data) => {
            setGameState(prev => {
                const turnStr = data.currentTurn?.toString();
                const nextTurnPlayer = prev.players.find(p => p.stateId === turnStr);
                if (!nextTurnPlayer) {
                    console.warn('[turnChanged] Could not map stateId to userId:', turnStr, 'players:', prev.players.map(p => ({ id: p.id, stateId: p.stateId })));
                }
                return { ...prev, currentTurn: nextTurnPlayer ? nextTurnPlayer.id : turnStr };
            });
            // Timer Ends at
            if (data.turnTimerEndsAt) {
                const diff = Math.floor((new Date(data.turnTimerEndsAt) - new Date()) / 1000);
                setTimeLeft(Math.max(0, diff));
            } else {
                setTimeLeft(30);
            }
        });

        newSocket.on('playerHit', ({ targetId, newHp }) => {
            setGameState(prev => {
                const players = [...prev.players];
                const target = players.find(p => p.id === targetId);
                if (target) {
                    triggerFloatingText(target.pos.x, target.pos.y, '-20');
                    target.hp = newHp;
                }
                return { ...prev, players };
            });
        });

        newSocket.on('gameOver', ({ winner, reason }) => {
            setMatchResult(winner === myPlayerId ? 'win' : 'loss');
        });

        newSocket.on('gameError', (err) => {
            alert('Error: ' + err.message);
        });

        return () => newSocket.close();
    }, [myPlayerId]);


    // Timer countdown local loop
    useEffect(() => {
        if (view !== 'game' || matchResult) return;
        const interval = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, [view, matchResult]);


    const mapServerStateToFrontend = (gameRoom) => {
        // Map backend players array [{ user: 'id', playerState: { ... } }] to frontend
        const mappedPlayers = gameRoom.players.map((pRecord, index) => {
            const uId = typeof pRecord.user === 'object' ? pRecord.user._id : pRecord.user;
            const state = pRecord.playerState;
            return {
                id: uId.toString(),
                stateId: state._id.toString(),
                team: index + 1,
                pos: state.position || { x: 0, y: 0 },
                hp: state.hp || 100
            };
        });

        // Map currentTurn from stateId back to userId for frontend
        let mappedTurn = null;
        if (gameRoom.currentTurn) {
            const tStateStr = gameRoom.currentTurn.toString();
            const pOfTurn = mappedPlayers.find(mp => mp.stateId === tStateStr);
            if (pOfTurn) mappedTurn = pOfTurn.id;
        }

        setGameState({
            currentTurn: mappedTurn,
            players: mappedPlayers
        });

        if (gameRoom.turnTimerEndsAt) {
            const diff = Math.floor((new Date(gameRoom.turnTimerEndsAt) - new Date()) / 1000);
            setTimeLeft(Math.max(0, diff));
        }
    };

    const triggerFloatingText = (x, y, text) => {
        const id = Date.now() + Math.random();
        setFloatingTexts(prev => [...prev, { id, x, y, text }]);
        setTimeout(() => {
            setFloatingTexts(prev => prev.filter(ft => ft.id !== id));
        }, 1500);
    };

    const handleAction = (actionType, x, y) => {
        if (matchResult || !socket) return;
        socket.emit('makeMove', { roomId: currentRoom, userId: myPlayerId, action: actionType, x, y });
    };

    const handleExitGame = () => {
        if (socket && currentRoom) {
            socket.emit('leaveRoom', { roomId: currentRoom, userId: myPlayerId });
        }
        setMatchResult(null);
        setCurrentRoom(null);
        setView('lobby');
        setGameState({ currentTurn: null, players: [] });
        setTimeLeft(30);
    };

    // --- Render helpers ---
    const isMyTurn = gameState.currentTurn === myPlayerId;
    const progressPercent = (timeLeft / 30) * 100;
    const isUrgent = timeLeft <= 5;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            {/* ── Lobby View (inlined to prevent input remount) ── */}
            {view === 'lobby' && (
                <div className="history-container" style={{ textAlign: 'center' }}>
                    <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#fff' }}>TURENA Arena</h2>
                    <p style={{ color: '#9ca3af' }}>Your Session ID: {myPlayerId.substring(0, 6)}...</p>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '30px' }}>
                        <button className="modal-btn" onClick={() => socket.emit('createRoom', { userId: myPlayerId })}>
                            Create New Room
                        </button>
                    </div>

                    <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #1f2937' }}>
                        <input
                            type="text"
                            value={roomIdInput}
                            onChange={e => setRoomIdInput(e.target.value.toUpperCase())}
                            placeholder="Room Code (e.g. A1B2C3)"
                            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #374151', background: '#0b0e14', color: '#fff', marginRight: '10px' }}
                        />
                        <button className="modal-btn" onClick={() => socket.emit('joinRoom', { roomId: roomIdInput, userId: myPlayerId })}>
                            Join Room
                        </button>
                    </div>
                </div>
            )}

            {view === 'waiting' && (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <h2 style={{ color: '#fff' }}>Room Code: <span style={{ color: '#38bdf8', letterSpacing: '2px' }}>{currentRoom}</span></h2>
                    <p style={{ color: '#9ca3af' }}>Waiting for opponent to join...</p>
                </div>
            )}

            {view === 'game' && (
                <>
                    {/* ── Top Bar ── */}
                    <div style={{ width: '600px', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '20px', fontWeight: 'bold', color: isMyTurn ? '#38bdf8' : '#fbbf24' }}>
                                {isMyTurn ? "YOUR TURN" : "ENEMY IS THINKING..."}
                            </span>
                            <span style={{ fontSize: '18px', fontWeight: 'bold', color: isUrgent ? '#ef4444' : '#fff' }}>
                                {timeLeft}s
                            </span>
                        </div>
                        <div style={{ width: '100%', background: '#1f2937', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                            <div
                                className={`timer-bar ${isUrgent ? 'timer-urgent' : ''}`}
                                style={{ width: `${progressPercent}%`, background: isMyTurn ? '#38bdf8' : '#fbbf24' }}
                            />
                        </div>
                    </div>

                    <Grid gameState={gameState} myPlayerId={myPlayerId} onAction={handleAction} floatingTexts={floatingTexts} />

                    <div style={{ color: '#9ca3af', fontSize: '15px', textAlign: 'center', marginTop: '20px' }}>
                        <p style={{ margin: '4px' }}><strong>Move:</strong> Click blue highlighted tile (max distance 3)</p>
                        <p style={{ margin: '4px' }}><strong>Attack:</strong> Click red enemy tile (distance 1)</p>
                    </div>

                    {/* ── Exit Game Button ── */}
                    <button
                        onClick={handleExitGame}
                        style={{
                            marginTop: '20px',
                            padding: '10px 28px',
                            background: 'transparent',
                            border: '1px solid #ef4444',
                            color: '#ef4444',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => { e.target.style.background = '#ef4444'; e.target.style.color = '#fff'; }}
                        onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = '#ef4444'; }}
                    >
                        Exit Game
                    </button>

                    {matchResult && (
                        <div className="modal-overlay">
                            <div className="modal-content">
                                <h1 style={{
                                    fontSize: '48px',
                                    margin: '0 0 20px 0',
                                    color: matchResult === 'win' ? '#38bdf8' : '#ef4444',
                                    textShadow: `0 0 20px ${matchResult === 'win' ? 'rgba(56,189,248,0.5)' : 'rgba(239,68,68,0.5)'}`
                                }}>
                                    {matchResult === 'win' ? 'VICTORY' : 'DEFEAT'}
                                </h1>
                                <div>
                                    <button className="modal-btn" onClick={handleExitGame}>
                                        Return to Lobby
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default App;
