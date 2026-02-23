import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FaUser, FaPhone, FaCalendarAlt, FaRulerVertical, FaWeight, FaHeartbeat, FaVenusMars } from 'react-icons/fa';

const CompleteProfile = () => {
    const { user, updateProfile } = useAuth();
    const [formData, setFormData] = useState({
        username: user?.username || '',
        gender: '',
        age: '',
        heightFeet: '',
        heightInches: '',
        weight: '',
        phone_number: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Construct height string from feet and inches
        const height = formData.heightFeet ? `${formData.heightFeet}'${formData.heightInches || 0}"` : '';

        const submissionData = {
            ...formData,
            height: height
        };

        const result = await updateProfile(submissionData);
        setLoading(false);
        if (result.success) {
            if (user.role === 'doctor') navigate('/doctor-dashboard');
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
                <h1 className="auth-title" style={{ textAlign: 'center' }}>Complete Your Profile</h1>
                <p className="auth-subtitle">We need a few more details to provide better care</p>

                {error && <div className="alert alert-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <div className="input-wrapper">
                            <FaUser className="input-icon" />
                            <input
                                type="text"
                                name="username"
                                placeholder="Your Name"
                                value={formData.username}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group">
                            <label className="form-label">Gender</label>
                            <div className="input-wrapper">
                                <FaVenusMars className="input-icon" />
                                <select
                                    name="gender"
                                    value={formData.gender}
                                    onChange={handleChange}
                                    required
                                >
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Age</label>
                            <div className="input-wrapper">
                                <FaCalendarAlt className="input-icon" />
                                <input
                                    type="number"
                                    name="age"
                                    placeholder="e.g. 25"
                                    value={formData.age}
                                    onChange={handleChange}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Height (Optional)</label>
                        <div className="form-grid-2">
                            <div className="input-wrapper">
                                <FaRulerVertical className="input-icon" />
                                <select
                                    name="heightFeet"
                                    value={formData.heightFeet}
                                    onChange={handleChange}
                                >
                                    <option value="">Feet</option>
                                    {[3, 4, 5, 6, 7, 8].map(ft => (
                                        <option key={ft} value={ft}>{ft} ft</option>
                                    ))}
                                </select>
                            </div>
                            <div className="input-wrapper">
                                <select
                                    name="heightInches"
                                    value={formData.heightInches}
                                    onChange={handleChange}
                                >
                                    <option value="">Inches</option>
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(inch => (
                                        <option key={inch} value={inch}>{inch} in</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Weight (Optional)</label>
                        <div className="input-wrapper">
                            <FaWeight className="input-icon" />
                            <input
                                type="text"
                                name="weight"
                                placeholder="e.g. 70kg"
                                value={formData.weight}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Mobile Number</label>
                        <div className="input-wrapper">
                            <FaPhone className="input-icon" />
                            <input
                                type="tel"
                                name="phone_number"
                                placeholder="+1 234 567 8900"
                                value={formData.phone_number}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Saving Profile...' : 'Complete Profile'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CompleteProfile;
