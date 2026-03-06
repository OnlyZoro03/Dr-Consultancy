import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FaEnvelope, FaLock, FaHeartbeat, FaGoogle } from 'react-icons/fa';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, loginWithGoogle } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await login(email, password);
        setLoading(false);
        if (result.success) {
            if (result.role === 'doctor') navigate('/doctor-dashboard');
            else navigate('/patient-dashboard');
        } else {
            setError(result.message);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setLoading(true);
        const result = await loginWithGoogle(); // Defaults to 'patient' if new user
        setLoading(false);
        if (result.success) {
            if (result.role === 'doctor') navigate('/doctor-dashboard');
            else navigate('/patient-dashboard');
        } else {
            setError(result.message);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-logo">
                    <div className="auth-logo-icon">
                        <FaHeartbeat style={{ color: 'white' }} />
                    </div>
                </div>
                <h1 className="auth-title" style={{ textAlign: 'center' }}>AI Smart Triage</h1>
                <p className="auth-subtitle">Intelligent Patient Management System</p>

                <h2 className="auth-form-title">Welcome Back</h2>

                {error && <div className="alert alert-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <div className="input-wrapper">
                            <FaEnvelope className="input-icon" />
                            <input
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <div className="input-wrapper">
                            <FaLock className="input-icon" />
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <div className="auth-divider">
                    <span>OR</span>
                </div>

                <button
                    type="button"
                    className="btn-google"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                >
                    <FaGoogle className="google-icon" /> Continue with Google
                </button>

                <p className="auth-link">
                    Don't have an account? <Link to="/register">Create Account</Link>
                </p>
            </div>
        </div>
    );
};

export default Login;
