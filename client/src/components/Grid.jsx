import React, { useRef, useEffect } from 'react';
import { isValidMove, isValidAttack } from '../utils/gridUtils';

const CELL_SIZE = 60;
const GRID_ROWS = 10;
const GRID_COLS = 10;

const COLORS = {
    background: '#1a1e29',
    gridLine: '#2d3342',
    validMove: 'rgba(56, 189, 248, 0.3)',
    validAttack: 'rgba(239, 68, 68, 0.4)',
    player1: '#38bdf8',
    player2: '#fbbf24',
    text: '#ffffff',
    hpBackground: 'rgba(0, 0, 0, 0.6)',
    dangerZone: 'rgba(255, 0, 0, 0.2)',
    warningZone: 'rgba(255, 165, 0, 0.4)',
    wall: '#4b5563',
    mysteryBox: 'rgba(250, 204, 21, 0.8)'
};

const Grid = ({ gameState, myPlayerId, onAction, floatingTexts, powerMode }) => {
    const canvasRef = useRef(null);

    const drawGrid = (ctx) => {
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, GRID_COLS * CELL_SIZE, GRID_ROWS * CELL_SIZE);

        const { players, currentTurn, safeZone, mysteryBox, walls } = gameState;
        const isMyTurn = currentTurn === myPlayerId;
        const myPlayer = players.find(p => p.id === myPlayerId);

        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                const shrinkWarning = gameState.turnNumber % 8 === 6 || gameState.turnNumber % 8 === 7;
                // Danger Zone check
                const isDanger = c < safeZone.minX || c > safeZone.maxX || r < safeZone.minY || r > safeZone.maxY;
                const isWarning = !isDanger && shrinkWarning && (c === safeZone.minX || c === safeZone.maxX || r === safeZone.minY || r === safeZone.maxY);

                if (isDanger) {
                    ctx.fillStyle = COLORS.dangerZone;
                    ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                } else if (isWarning) {
                    ctx.fillStyle = COLORS.warningZone;
                    ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                }

                // Walls
                const isWall = walls?.find(w => w.x === c && w.y === r);
                if (isWall) {
                    ctx.fillStyle = COLORS.wall;
                    ctx.fillRect(c * CELL_SIZE + 4, r * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
                }

                // Mystery Box
                if (mysteryBox && mysteryBox.x === c && mysteryBox.y === r) {
                    ctx.fillStyle = COLORS.mysteryBox;
                    ctx.fillRect(c * CELL_SIZE + 10, r * CELL_SIZE + 10, CELL_SIZE - 20, CELL_SIZE - 20);
                    ctx.fillStyle = COLORS.text;
                    ctx.font = '12px Inter';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🎁', c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2);
                }

                const enemy = players.find(
                    p => p.id !== myPlayerId && p.pos.x === c && p.pos.y === r && p.hp > 0
                );
                const obstacle = players.find(
                    p => p.pos.x === c && p.pos.y === r && p.hp > 0
                );

                if (isMyTurn && myPlayer && myPlayer.hp > 0) {
                    if (powerMode) {
                        if (!obstacle && !isWall && !isDanger) {
                            ctx.fillStyle = COLORS.validMove;
                            ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                        }
                    } else {
                        if (enemy && isValidAttack(myPlayer.pos, c, r, myPlayer.activePower, walls)) {
                            ctx.fillStyle = COLORS.validAttack;
                            ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                        } else if (!obstacle && isValidMove(myPlayer.pos, c, r, myPlayer.activePower, walls)) {
                            ctx.fillStyle = COLORS.validMove;
                            ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                        }
                    }
                }

                ctx.strokeStyle = COLORS.gridLine;
                ctx.strokeRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }

        players.forEach(p => {
            if (p.hp <= 0) return;

            const centerX = p.pos.x * CELL_SIZE + CELL_SIZE / 2;
            const centerY = p.pos.y * CELL_SIZE + CELL_SIZE / 2;

            if (currentTurn === p.id) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, CELL_SIZE * 0.42, 0, 2 * Math.PI);
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.arc(centerX, centerY, CELL_SIZE * 0.32, 0, 2 * Math.PI);
            ctx.fillStyle = p.team === 1 ? COLORS.player1 : COLORS.player2;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.fillStyle = COLORS.hpBackground;
            ctx.fillRect(centerX - 24, centerY - CELL_SIZE * 0.45 - 12, 48, 16);

            ctx.fillStyle = COLORS.text;
            ctx.font = '10px Inter';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${p.hp} HP`, centerX, centerY - CELL_SIZE * 0.45 - 4);
        });
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        drawGrid(ctx);
    }, [gameState, myPlayerId]);

    const handleCanvasClick = (e) => {
        const { currentTurn, players, safeZone, walls } = gameState;
        if (currentTurn !== myPlayerId) return;

        const myPlayer = players.find(p => p.id === myPlayerId);
        if (!myPlayer || myPlayer.hp <= 0) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const col = Math.floor(x / CELL_SIZE);
        const row = Math.floor(y / CELL_SIZE);

        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;

        const obstacle = players.find(p => p.pos.x === col && p.pos.y === row && p.hp > 0);
        const isWall = walls?.find(w => w.x === col && w.y === row);
        const isDanger = col < safeZone.minX || col > safeZone.maxX || row < safeZone.minY || row > safeZone.maxY;

        if (powerMode) {
            if (!obstacle && !isWall && !isDanger) {
                onAction('usePower', col, row);
            }
            return;
        }

        if (obstacle) {
            if (obstacle.id !== myPlayerId && isValidAttack(myPlayer.pos, col, row, myPlayer.activePower, walls)) {
                onAction('attack', col, row);
            }
        } else {
            if (isValidMove(myPlayer.pos, col, row, myPlayer.activePower, walls)) {
                onAction('move', col, row);
            }
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <canvas
                ref={canvasRef}
                width={GRID_COLS * CELL_SIZE}
                height={GRID_ROWS * CELL_SIZE}
                onClick={handleCanvasClick}
                style={{ cursor: gameState.currentTurn === myPlayerId ? 'pointer' : 'not-allowed' }}
            />

            {/* Floating Damage Text */}
            {floatingTexts && floatingTexts.map(ft => (
                <div key={ft.id} className="floating-text" style={{
                    left: ft.x * CELL_SIZE + (CELL_SIZE / 2) - 15,
                    top: ft.y * CELL_SIZE + (CELL_SIZE / 2) - 20
                }}>
                    {ft.text}
                </div>
            ))}
        </div>
    );
};

export default Grid;
