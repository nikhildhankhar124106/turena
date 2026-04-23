import React from 'react';

const ProfileCard = ({ username, level, xp, xpToNextLvl, title, gamesPlayed, winCount, isOpponent = false }) => {
    // Calculate progress percentage, capped at 100%
    const progressPercent = Math.min(100, Math.max(0, (xp / xpToNextLvl) * 100));
    
    const winRate = gamesPlayed > 0 ? Math.round((winCount / gamesPlayed) * 100) : 0;

    return (
        <div className={`profile-card ${isOpponent ? 'profile-opponent' : 'profile-player'}`}>
            <div className="profile-header">
                <div className="level-badge" title={`Level ${level}`}>
                    <span>{level}</span>
                </div>
                <div className="profile-info">
                    <h3 className="profile-name">{username || 'Player'}</h3>
                    <span className={`profile-title title-${title?.toLowerCase()}`}>{title || 'Recruit'}</span>
                </div>
            </div>

            <div className="profile-stats">
                <div className="stat">
                    <span>Games</span>
                    <strong>{gamesPlayed || 0}</strong>
                </div>
                <div className="stat">
                    <span>Wins</span>
                    <strong>{winCount || 0}</strong>
                </div>
                <div className="stat">
                    <span>Win Rate</span>
                    <strong>{winRate}%</strong>
                </div>
            </div>

            <div className="xp-container">
                <div className="xp-header">
                    <span>XP</span>
                    <span>{xp} / {xpToNextLvl}</span>
                </div>
                <div className="xp-bar-container">
                    <div className="xp-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                </div>
            </div>
        </div>
    );
};

export default ProfileCard;
