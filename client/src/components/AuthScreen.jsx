import React, { useState } from 'react';

const AuthScreen = ({ onAuthSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
        const payload = isLogin ? { email, password } : { username, email, password };

        try {
            const response = await fetch(`${SERVER_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Save token and trigger success callback
                localStorage.setItem('turenaToken', data.data.token);
                onAuthSuccess(data.data);
            } else {
                setError(data.message || 'Authentication failed');
            }
        } catch (err) {
            setError('Server connection failed. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ width: '100%', maxWidth: '400px', padding: '30px', background: '#111827', borderRadius: '16px', border: '1px solid #1f2937', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <h1 style={{ fontSize: '36px', margin: '0 0 10px 0', textShadow: '0 0 15px rgba(56,189,248,0.5)', color: '#38bdf8' }}>TURENA</h1>
                <p style={{ color: '#9ca3af' }}>{isLogin ? 'Login to your account' : 'Create a new account'}</p>
            </div>

            {error && (
                <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {!isLogin && (
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        style={{ padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#1f2937', color: '#fff', fontSize: '16px' }}
                    />
                )}
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#1f2937', color: '#fff', fontSize: '16px' }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #374151', background: '#1f2937', color: '#fff', fontSize: '16px' }}
                />
                <button 
                    type="submit" 
                    className="btn-primary" 
                    disabled={loading}
                    style={{ marginTop: '10px' }}
                >
                    {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
                </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '20px', color: '#9ca3af', fontSize: '14px' }}>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <span 
                    style={{ color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => { setIsLogin(!isLogin); setError(null); }}
                >
                    {isLogin ? 'Register here' : 'Login here'}
                </span>
            </div>
        </div>
    );
};

export default AuthScreen;
