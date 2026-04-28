import React, { useState, useEffect } from 'react';

const MatchmakingScreen = ({ queueData = {}, onCancel }) => {
    const { position, waitTime = 0, queueSize = 1, expandedRangeMessage } = queueData;
    const [localTime, setLocalTime] = useState(waitTime);

    useEffect(() => {
        setLocalTime(waitTime);
    }, [waitTime]);

    useEffect(() => {
        const interval = setInterval(() => {
            setLocalTime(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    
    // Format mm:ss
    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    return (
        <div className="matchmaking-container">
            <div className="radar-animation">
                <div className="radar-pulse primary"></div>
                <div className="radar-pulse secondary"></div>
                <div className="radar-center"></div>
            </div>

            <h2 className="matchmaking-title">Searching for Online Opponent</h2>
            <div className="matchmaking-timer">{formatTime(localTime)}</div>

            <div className="matchmaking-stats">
                <div className="mm-stat">
                    <span>Queue Position</span>
                    <strong>{position}/{queueSize}</strong>
                </div>
                <div className="mm-stat">
                    <span>Estimated Wait</span>
                    <strong>00:15</strong>
                </div>
            </div>

            <div className="matchmaking-status-box">
                <div className="status-indicator spinning"></div>
                <span>Finding opponent...</span>
            </div>

            {expandedRangeMessage && (
                <div className="matchmaking-warning">
                    <span className="warning-icon">⚠️</span>
                    {expandedRangeMessage}
                </div>
            )}

            <button className="btn-cancel-queue" onClick={onCancel}>
                Cancel Matchmaking
            </button>
        </div>
    );
};

export default MatchmakingScreen;
