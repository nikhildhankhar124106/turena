import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Grid from './components/Grid';
import ProfileCard from './components/ProfileCard';
import MatchmakingScreen from './components/MatchmakingScreen';
import AuthScreen from './components/AuthScreen';


const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

const App = () => {
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [myProfile, setMyProfile] = useState(null);
    const [socket, setSocket] = useState(null);

    // View states: 'auth', 'lobby', 'queue', 'waiting', 'game'
    const [view, setView] = useState('auth');
    const [roomIdInput, setRoomIdInput] = useState('');
    const [currentRoom, setCurrentRoom] = useState(null);

    const [queueData, setQueueData] = useState({ waitTime: 0 });
    const [opponentInfo, setOpponentInfo] = useState(null);

    const [matchResult, setMatchResult] = useState(null);
    const [xpResult, setXpResult] = useState(null);
    const [floatingTexts, setFloatingTexts] = useState([]);

    const [timeLeft, setTimeLeft] = useState(30);

    // Mapped game state for Grid
    const [gameState, setGameState] = useState({
        turnNumber: 1,
        currentTurn: null,
        players: [],
        safeZone: { minX: 0, maxX: 9, minY: 0, maxY: 9 },
        mysteryBox: null,
        walls: []
    });

    const [powerMode, setPowerMode] = useState(false);
    const [hasChosenPower, setHasChosenPower] = useState(false);

    // --- Auth & Profile Initialization ---
    useEffect(() => {
        const token = localStorage.getItem('turenaToken');
        if (token) {
            fetchProfile(token);
        }
    }, []);

    const fetchProfile = async (token) => {
        try {
            const res = await fetch(`${SERVER_URL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            if (data.success) {
                handleAuthSuccess(data.data);
            } else {
                localStorage.removeItem('turenaToken');
            }
        } catch (err) {
            console.error('Failed to fetch profile', err);
        }
    };

    const handleAuthSuccess = (userData) => {
        setMyPlayerId(userData._id);
        setMyProfile(userData);
        setView('lobby');
    };

    const handleLogout = () => {
        localStorage.removeItem('turenaToken');
        if (socket) socket.disconnect();
        setSocket(null);
        setMyPlayerId(null);
        setMyProfile(null);
        setView('auth');
    };

    // --- Socket Initialization ---
    useEffect(() => {
        if (view === 'auth' || !myPlayerId) return;
        const token = localStorage.getItem('turenaToken');
        
        const newSocket = io(SERVER_URL, {
            auth: { token }
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to Server');
            const savedQueueTime = sessionStorage.getItem('turenaQueue');
            if (savedQueueTime) {
                newSocket.emit('joinQueue', { userId: myPlayerId, enqueuedAt: parseInt(savedQueueTime, 10) });
            }
        });

        // Matchmaking events
        newSocket.on('queueJoined', (data) => {
            setView('queue');
            setQueueData(data);
        });

        newSocket.on('queueUpdate', (data) => {
            setQueueData(prev => ({ ...prev, ...data }));
        });

        newSocket.on('matchmakingWarning', (data) => {
            setQueueData(prev => ({ ...prev, expandedRangeMessage: data.message }));
        });

        newSocket.on('matchFound', ({ roomId, opponent }) => {
            sessionStorage.removeItem('turenaQueue');
            setCurrentRoom(roomId);
            setOpponentInfo(opponent);
            setView('waiting'); // Brief transition before gameStarts
        });

        // Traditional Room Events
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

        newSocket.on('gameStarted', ({ gameRoom }) => {
            setCurrentRoom(gameRoom.roomId);
            setView('game');
            setMatchResult(null);
            setXpResult(null);
            setHasChosenPower(false);
            mapServerStateToFrontend(gameRoom);
        });

        // Game Events
        newSocket.on('moveMade', ({ userId, x, y, action }) => {
            setGameState(prev => {
                const players = [...prev.players];
                const p = players.find(p => p.id === userId);
                if (p) {
                    if (action === 'move') {
                        p.pos = { x, y };
                        if (p.activePower === 'high_jump') p.activePower = null;
                    } else if (action === 'attack') {
                        if (p.activePower === 'sniper') p.activePower = null;
                    }
                }
                return { ...prev, players };
            });
        });

        newSocket.on('powerExpired', ({ userId, power }) => {
            setGameState(prev => {
                const players = [...prev.players];
                const target = players.find(p => p.id === userId);
                if (target) target.activePower = null;
                return { ...prev, players };
            });
        });

        newSocket.on('powerChosen', ({ userId, power }) => {
            setGameState(prev => {
                const players = [...prev.players];
                const target = players.find(p => p.id === userId);
                if (target) target.activePower = power;
                return { ...prev, players };
            });
        });

        newSocket.on('turnChanged', (data) => {
            setGameState(prev => {
                const turnStr = data.currentTurn?.toString();
                const nextTurnPlayer = prev.players.find(p => p.stateId === turnStr);
                
                let updatedPrev = { ...prev };
                if (data.events) {
                    data.events.forEach(evt => {
                        if (evt.type === 'zoneShrink') updatedPrev.safeZone = evt.safeZone;
                        if (evt.type === 'boxSpawn') updatedPrev.mysteryBox = evt.mysteryBox;
                        if (evt.type === 'boxDespawn') updatedPrev.mysteryBox = null;
                        if (evt.type === 'powerGranted') {
                            const pToUpdate = updatedPrev.players.find(p => p.id === evt.userId);
                            if (pToUpdate) pToUpdate.activePower = evt.power;
                        }
                        if (evt.type === 'powerExpired') {
                            const pToUpdate = updatedPrev.players.find(p => p.id === evt.userId);
                            if (pToUpdate) pToUpdate.activePower = null;
                        }
                    });
                }
                
                return { ...updatedPrev, turnNumber: data.turnNumber, currentTurn: nextTurnPlayer ? nextTurnPlayer.id : turnStr };
            });
            if (data.turnTimerEndsAt) {
                const diff = Math.floor((new Date(data.turnTimerEndsAt) - new Date()) / 1000);
                setTimeLeft(Math.max(0, diff));
            } else {
                setTimeLeft(30);
            }
        });

        newSocket.on('playerHit', ({ targetId, newHp, reason }) => {
            setGameState(prev => {
                const players = [...prev.players];
                const target = players.find(p => p.id === targetId);
                if (target) {
                    let text = newHp === 0 ? 'DEFEATED' : '-HIT';
                    if (reason === 'heal') text = '+HEAL';
                    triggerFloatingText(target.pos.x, target.pos.y, text);
                    target.hp = newHp;
                }
                return { ...prev, players };
            });
        });

        newSocket.on('boxCollected', ({ userId, power }) => {
            setGameState(prev => {
                const players = [...prev.players];
                const target = players.find(p => p.id === userId);
                if (target) target.activePower = power;
                return { ...prev, players, mysteryBox: null };
            });
        });

        newSocket.on('wallCreated', ({ x, y }) => {
            setGameState(prev => ({
                ...prev,
                walls: [...prev.walls, { x, y }]
            }));
            setPowerMode(false);
        });

        newSocket.on('gameOver', ({ winner, reason }) => {
            setMatchResult(winner === myPlayerId ? 'win' : 'loss');
        });

        newSocket.on('xpAwarded', (xpDetails) => {
            setXpResult(xpDetails);
            
            // Update local mock profile stats based on outcome
            setMyProfile(prev => {
                if (!prev) return prev;
                const isWinner = xpDetails.winnerId === myPlayerId;
                return {
                    ...prev,
                    gamesPlayed: (prev.gamesPlayed || 0) + 1,
                    winCount: (prev.winCount || 0) + (isWinner ? 1 : 0),
                    xp: isWinner ? xpDetails.winnerXp : xpDetails.loserXp,
                    level: isWinner ? xpDetails.winnerLevel : xpDetails.loserLevel,
                    xpToNextLvl: isWinner ? xpDetails.winnerXpToNext : xpDetails.loserXpToNext,
                    title: isWinner ? xpDetails.winnerTitle : xpDetails.loserTitle
                };
            });
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
        const mappedPlayers = gameRoom.players.map((pRecord, index) => {
            const uId = typeof pRecord.user === 'object' ? pRecord.user._id : pRecord.user;
            const state = pRecord.playerState;
            return {
                id: uId.toString(),
                stateId: state._id.toString(),
                team: index + 1,
                pos: state.position || { x: 0, y: 0 },
                hp: state.hp || 100,
                activePower: state.activePower || null
            };
        });

        let mappedTurn = null;
        if (gameRoom.currentTurn) {
            const tStateStr = gameRoom.currentTurn.toString();
            const pOfTurn = mappedPlayers.find(mp => mp.stateId === tStateStr);
            if (pOfTurn) mappedTurn = pOfTurn.id;
        }

        setGameState({
            turnNumber: gameRoom.turnNumber || 1,
            currentTurn: mappedTurn,
            players: mappedPlayers,
            safeZone: gameRoom.safeZone || { minX: 0, maxX: 9, minY: 0, maxY: 9 },
            mysteryBox: gameRoom.mysteryBox && gameRoom.mysteryBox.x !== null ? gameRoom.mysteryBox : null,
            walls: gameRoom.walls || []
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
        if (powerMode) actionType = 'usePower';
        socket.emit('makeMove', { roomId: currentRoom, userId: myPlayerId, action: actionType, x, y });
        setPowerMode(false);
    };

    const handleExitGame = () => {
        if (socket && currentRoom) {
            socket.emit('leaveRoom', { roomId: currentRoom, userId: myPlayerId });
        }
        setMatchResult(null);
        setXpResult(null);
        setCurrentRoom(null);
        setOpponentInfo(null);
        setHasChosenPower(false);
        setView('lobby');
        setGameState({ currentTurn: null, players: [] });
        setTimeLeft(30);
    };

    const handleJoinQueue = () => {
        if (socket) {
            setQueueData({ waitTime: 0 }); // reset
            const now = Date.now();
            sessionStorage.setItem('turenaQueue', now.toString());
            socket.emit('joinQueue', { userId: myPlayerId, enqueuedAt: now });
        }
    };

    const handleCancelQueue = () => {
        if (socket) {
            socket.emit('leaveQueue', { userId: myPlayerId });
            setView('lobby');
            setQueueData({});
            sessionStorage.removeItem('turenaQueue');
        }
    };

    // --- Render helpers ---
    const myPlayer = gameState.players.find(p => p.id === myPlayerId);
    const enemyPlayer = gameState.players.find(p => p.id !== myPlayerId);
    
    const isMyTurn = gameState.currentTurn === myPlayerId;
    const progressPercent = (timeLeft / 30) * 100;
    const isUrgent = timeLeft <= 5;
    const needsStartingPowerChoice = view === 'game' && gameState.turnNumber <= 2 && myPlayer && myPlayer.activePower === null && !hasChosenPower;

    const selectStartingPower = (power) => {
        socket.emit('chooseInitialPower', { roomId: currentRoom, userId: myPlayerId, power });
        setHasChosenPower(true);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', padding: '20px' }}>
            {/* ── Auth View ── */}
            {view === 'auth' && (
                <AuthScreen onAuthSuccess={handleAuthSuccess} />
            )}

            {/* ── Lobby View ── */}
            {view === 'lobby' && myProfile && (
                <div style={{ width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                        <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '5px 15px', borderRadius: '6px', cursor: 'pointer' }}>
                            Logout
                        </button>
                    </div>
                    <div style={{ marginBottom: '30px', textAlign: 'center' }}>
                        <h1 style={{ fontSize: '42px', margin: '0 0 10px 0', textShadow: '0 0 20px rgba(56,189,248,0.5)' }}>TURENA ARENA</h1>
                        <p style={{ color: '#9ca3af' }}>Multiplayer Tactical Grid Combat</p>
                    </div>

                    <ProfileCard 
                        username={myProfile.username}
                        level={myProfile.level}
                        title={myProfile.title}
                        xp={myProfile.xp}
                        xpToNextLvl={myProfile.xpToNextLvl}
                        gamesPlayed={myProfile.gamesPlayed}
                        winCount={myProfile.winCount}
                    />

                    <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <button className="btn-primary" onClick={handleJoinQueue}>
                            Find Online Match
                        </button>
                        
                        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                            <button className="btn-secondary" onClick={() => socket.emit('createRoom', { userId: myPlayerId })}>
                                Create Pvt Room
                            </button>
                            <input
                                type="text"
                                value={roomIdInput}
                                onChange={e => setRoomIdInput(e.target.value.toUpperCase())}
                                placeholder="Code"
                                maxLength={6}
                                style={{ width: '100px', padding: '10px', borderRadius: '8px', border: '1px solid #374151', background: '#111827', color: '#fff', textAlign: 'center' }}
                            />
                            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => socket.emit('joinRoom', { roomId: roomIdInput, userId: myPlayerId })}>
                                Join Pvt
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Queue View ── */}
            {view === 'queue' && (
                <MatchmakingScreen queueData={queueData} onCancel={handleCancelQueue} />
            )}

            {/* ── Waiting View ── */}
            {view === 'waiting' && (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <h2 style={{ color: '#fff' }}>Room Code: <span style={{ color: '#38bdf8', letterSpacing: '2px' }}>{currentRoom}</span></h2>
                    <p style={{ color: '#9ca3af' }}>Waiting for opponent...</p>
                </div>
            )}

            {/* ── Game View ── */}
            {view === 'game' && (
                <>
                    {/* Power Selection Modal */}
                    {needsStartingPowerChoice && (
                        <div className="modal-overlay" style={{ zIndex: 100 }}>
                            <div className="modal-content" style={{ maxWidth: '500px' }}>
                                <h2 style={{ color: '#fff', marginBottom: '20px' }}>Choose Your Starting Power</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    {['create_wall', 'sniper', 'high_jump', 'bullet_vest'].map(power => (
                                        <button 
                                            key={power}
                                            className="modal-btn" 
                                            style={{ padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                            onClick={() => selectStartingPower(power)}
                                        >
                                            <span style={{ fontWeight: 'bold' }}>{power.toUpperCase().replace('_', ' ')}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="game-layout">
                        {/* P1 Side Panel */}
                        <div className="side-panel">
                            <ProfileCard 
                                username={myProfile.username}
                                level={myProfile.level}
                                title={myProfile.title}
                                xp={myProfile.xp}
                                xpToNextLvl={myProfile.xpToNextLvl}
                                gamesPlayed={myProfile.gamesPlayed}
                                winCount={myProfile.winCount}
                            />
                            
                            {myPlayer?.activePower && (
                                <div style={{ background: '#111827', padding: '15px', borderRadius: '12px', border: '1px solid #1f2937' }}>
                                    <span style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase' }}>Active Power</span>
                                    <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '18px', margin: '5px 0' }}>
                                        {myPlayer.activePower.toUpperCase().replace('_', ' ')}
                                    </div>
                                    {myPlayer.activePower === 'create_wall' && (
                                        <button
                                            onClick={() => setPowerMode(!powerMode)}
                                            style={{ width: '100%', marginTop: '10px', padding: '8px', background: powerMode ? '#ef4444' : '#22c55e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            {powerMode ? 'Cancel Wall' : 'Build Wall'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Center Grid */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {/* Top Bar Timer */}
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

                            <Grid gameState={gameState} myPlayerId={myPlayerId} onAction={handleAction} floatingTexts={floatingTexts} powerMode={powerMode} />

                            <div style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', marginTop: '20px', display: 'flex', gap: '20px' }}>
                                <span><span style={{display:'inline-block',width:'12px',height:'12px',background:'rgba(56, 189, 248, 0.3)',border:'1px solid #38bdf8',marginRight:'5px'}}></span>Move</span>
                                <span><span style={{display:'inline-block',width:'12px',height:'12px',background:'rgba(239, 68, 68, 0.4)',border:'1px solid #ef4444',marginRight:'5px'}}></span>Attack</span>
                                <span><span style={{display:'inline-block',width:'12px',height:'12px',background:'rgba(255, 0, 0, 0.2)',marginRight:'5px'}}></span>Danger Zone</span>
                                <span>🎁 Mystery Box</span>
                            </div>
                        </div>

                        {/* P2 Side Panel */}
                        <div className="side-panel">
                            {opponentInfo ? (
                                <ProfileCard 
                                    username={opponentInfo.username}
                                    level={opponentInfo.level}
                                    title={opponentInfo.title}
                                    xp={100} // Mock for display
                                    xpToNextLvl={100}
                                    gamesPlayed={'-'}
                                    winCount={'-'}
                                    isOpponent={true}
                                />
                            ) : (
                                <div style={{ background: '#111827', padding: '20px', borderRadius: '16px', border: '1px solid #1f2937', textAlign: 'center' }}>
                                    <h3>Enemy</h3>
                                </div>
                            )}

                            {enemyPlayer?.activePower && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                    <span style={{ color: '#f87171', fontSize: '12px', textTransform: 'uppercase' }}>Enemy Power</span>
                                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '18px', margin: '5px 0' }}>
                                        {enemyPlayer.activePower.replace('_', ' ').toUpperCase()}
                                    </div>
                                </div>
                            )}

                            <button className="btn-secondary" onClick={handleExitGame} style={{ marginTop: 'auto', border: '1px solid #ef4444', color: '#ef4444' }}>
                                Surrender
                            </button>
                        </div>
                    </div>

                    {/* Game Over Modal */}
                    {matchResult && (
                        <div className="modal-overlay">
                            <div className="modal-content" style={{ minWidth: '400px' }}>
                                <h1 style={{
                                    fontSize: '56px',
                                    margin: '0 0 10px 0',
                                    color: matchResult === 'win' ? '#38bdf8' : '#ef4444',
                                    textShadow: `0 0 30px ${matchResult === 'win' ? 'rgba(56,189,248,0.5)' : 'rgba(239,68,68,0.5)'}`
                                }}>
                                    {matchResult === 'win' ? 'VICTORY' : 'DEFEAT'}
                                </h1>

                                {xpResult && (
                                    <div style={{ margin: '30px 0', padding: '20px', background: '#111827', borderRadius: '12px', border: '1px solid #1f2937' }}>
                                        <div style={{ fontSize: '18px', color: '#9ca3af', marginBottom: '10px' }}>XP Earned</div>
                                        <div className="xp-award-animation">
                                            +{matchResult === 'win' ? xpResult.winnerXpGained : xpResult.loserXpGained} XP
                                        </div>
                                        
                                        {((matchResult === 'win' && xpResult.winnerLeveledUp) || 
                                          (matchResult === 'loss' && xpResult.loserLeveledUp)) && (
                                            <div style={{ marginTop: '15px', color: '#fbbf24', fontWeight: 'bold', animation: 'pulse 1s infinite' }}>
                                                LEVEL UP! → Level {matchResult === 'win' ? xpResult.winnerLevel : xpResult.loserLevel}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <button className="btn-primary" onClick={handleExitGame}>
                                        Continue
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
