import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FaUser, FaEnvelope, FaLock, FaUserMd, FaUserInjured, FaHeartbeat, FaGoogle } from 'react-icons/fa';

const Register = () => {
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        role: 'patient'
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { register, loginWithGoogle } = useAuth();
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await register(formData);
        setLoading(false);
        if (result.success) {
            navigate('/login');
        } else {
            setError(result.message);
        }
    };
    const handleGoogleRegister = async () => {
        setError('');
        setLoading(true);
        // Use the currently selected role from the radio buttons
        const result = await loginWithGoogle(formData.role);
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
                <p className="auth-subtitle">Create your account to get started</p>

                <h2 className="auth-form-title">Create Account</h2>

                {error && <div className="alert alert-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <div className="input-wrapper">
                            <FaUser className="input-icon" />
                            <input
                                type="text"
                                name="username"
                                placeholder="John Doe"
                                value={formData.username}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <div className="input-wrapper">
                            <FaEnvelope className="input-icon" />
                            <input
                                type="email"
                                name="email"
                                placeholder="you@example.com"
                                value={formData.email}
                                onChange={handleChange}
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
                                name="password"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">I am a...</label>
                        <div className="role-selector">
                            <label className={`role-option ${formData.role === 'patient' ? 'active' : ''}`}>
                                <input type="radio" name="role" value="patient" checked={formData.role === 'patient'} onChange={handleChange} />
                                <FaUserInjured /> Patient
                            </label>
                            <label className={`role-option ${formData.role === 'doctor' ? 'active' : ''}`}>
                                <input type="radio" name="role" value="doctor" checked={formData.role === 'doctor'} onChange={handleChange} />
                                <FaUserMd /> Doctor
                            </label>
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Creating Account...' : 'Create Account'}
                    </button>
                </form>

                <div className="auth-divider">
                    <span>OR</span>
                </div>

                <button
                    type="button"
                    className="btn-google"
                    onClick={handleGoogleRegister}
                    disabled={loading}
                >
                    <FaGoogle className="google-icon" /> Continue with Google
                </button>

                <p className="auth-link">
                    Already have an account? <Link to="/login">Sign In</Link>
                </p>
            </div>
        </div>
    );
};

export default Register;
