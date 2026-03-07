import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ChatBox from '../components/ChatBox';
import {
    FaCalendarCheck, FaNotesMedical, FaRobot, FaHeartbeat,
    FaUserCircle, FaClipboardList, FaExclamationTriangle,
    FaCheckCircle, FaClock, FaCommentMedical, FaEdit,
    FaUser, FaPhone, FaCalendarAlt, FaRulerVertical, FaWeight, FaVenusMars,
    FaFileMedical
} from 'react-icons/fa';

const PatientDashboard = () => {
    const { user, updateProfile, logout } = useAuth();
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileFormData, setProfileFormData] = useState({
        username: user?.username || '',
        gender: user?.gender || '',
        age: user?.age || '',
        heightFeet: '',
        heightInches: '',
        weight: user?.weight || '',
        phone_number: user?.phone_number || ''
    });
    const [profileLoading, setProfileLoading] = useState(false);

    useEffect(() => {
        if (isEditingProfile && user) {
            let feet = '', inches = '';
            if (user.height) {
                const match = user.height.match(/(\d+)'(\d+)"/);
                if (match) {
                    feet = match[1];
                    inches = match[2];
                }
            }
            setProfileFormData({
                username: user.username || '',
                gender: user.gender || '',
                age: user.age || '',
                heightFeet: feet,
                heightInches: inches,
                weight: user.weight || '',
                phone_number: user.phone_number || ''
            });
        }
    }, [isEditingProfile, user]);
    const [formData, setFormData] = useState({
        patient_name: user?.username || '',
        age: user?.age || '',
        gender: user?.gender || 'Male',
        symptoms: '',
        pre_existing_conditions: ''
    });
    const [loading, setLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [submitError, setSubmitError] = useState('');
    const [reports, setReports] = useState([]);
    const [aiPrediction, setAiPrediction] = useState(null);

    useEffect(() => { fetchDashboard(); }, []);

    const fetchDashboard = async () => {
        setFetchLoading(true);
        try {
            const [dashRes, reportsRes] = await Promise.all([
                api.get('/patient/dashboard'),
                api.get('/reports')
            ]);
            setAppointments(dashRes.data.appointments);
            setReports(reportsRes.data.reports || []);
        } catch (err) {
            console.error(err);
        } finally {
            setFetchLoading(false);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleProfileChange = (e) => {
        setProfileFormData({ ...profileFormData, [e.target.name]: e.target.value });
    };

    const handleProfileSubmit = async (e) => {
        e.preventDefault();
        setProfileLoading(true);

        // Combine feet and inches
        const heightCombined = profileFormData.heightFeet ? `${profileFormData.heightFeet}'${profileFormData.heightInches || 0}"` : '';

        const submissionData = {
            ...profileFormData,
            height: heightCombined
        };

        const result = await updateProfile(submissionData);
        setProfileLoading(false);
        if (result.success) {
            setIsEditingProfile(false);
        } else {
            alert(result.message || 'Failed to update profile');
        }
    };

    const submitAppointment = async (e) => {
        e.preventDefault();
        setLoading(true);
        setAiPrediction(null);
        setSubmitError('');
        try {
            const submissionData = {
                patient_name: formData.patient_name,
                age: formData.age,
                gender: formData.gender,
                symptoms: formData.symptoms,
                pre_existing_conditions: formData.pre_existing_conditions,
                vitals: 'Not provided'
            };

            const res = await api.post('/appointments', submissionData);
            setAiPrediction({
                ...res.data.ai_analysis,
                queue_position: res.data.queue_position,
                priority_score: res.data.priority_score,
            });
            await fetchDashboard();
            setFormData({
                patient_name: user?.username || '',
                age: user?.age || '',
                gender: user?.gender || 'Male',
                symptoms: '',
                pre_existing_conditions: ''
            });
        } catch (err) {
            const msg = err?.response?.data?.message || 'Failed to submit appointment. Please try again.';
            setSubmitError(msg);
        } finally {
            setLoading(false);
        }
    };

    const counts = {
        total: appointments.length,
        pending: appointments.filter(a => a.status === 'Pending').length,
        approved: appointments.filter(a => a.status === 'Approved').length,
        high: appointments.filter(a => a.risk_level === 'High').length,
    };

    const getRiskClass = (level) => {
        if (level === 'High') return 'risk-high';
        if (level === 'Medium') return 'risk-medium';
        return 'risk-low';
    };

    const getStatusBadge = (status) => {
        const map = { Pending: 'badge-pending', Approved: 'badge-approved', Rejected: 'badge-rejected' };
        return map[status] || 'badge-pending';
    };

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: <FaCalendarCheck /> },
        { id: 'analyze-report', label: 'Analyze Report', icon: <FaFileMedical /> },
        { id: 'new-appointment', label: 'Apply Appointment', icon: <FaNotesMedical /> },
        { id: 'doctor-chat', label: 'Doctor Chat', icon: <FaCommentMedical /> },
        { id: 'profile', label: 'My Profile', icon: <FaUserCircle /> },
    ];

    return (
        <div className="app-layout">
            {/* Navbar */}
            <nav className="navbar">
                <div className="navbar-brand">
                    <div className="navbar-logo"><FaHeartbeat style={{ color: 'white' }} /></div>
                    <span className="navbar-title">AI <span>Smart Triage</span></span>
                </div>
                <div className="navbar-right">
                    <div className="navbar-user">
                        <div className="avatar">{user?.username?.[0]?.toUpperCase()}</div>
                        <span>{user?.username}</span>
                    </div>
                    <button className="logout-btn" onClick={logout}>Logout</button>
                </div>
            </nav>

            <div className="main-body">
                {/* Sidebar */}
                <aside className="sidebar">
                    <p className="sidebar-section-title">Patient Portal</p>
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            className={`sidebar-item ${activeTab === item.id ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                            onClick={() => {
                                if (item.disabled) return;
                                if (item.id === 'analyze-report') {
                                    navigate('/report-analysis');
                                } else {
                                    setActiveTab(item.id);
                                }
                            }}
                        >
                            <span className="icon">{item.icon}</span>
                            {item.label}
                            {item.disabled && <span style={{ fontSize: '0.7rem', marginLeft: 'auto', color: '#94a3b8' }}>Soon</span>}
                        </button>
                    ))}
                </aside>

                {/* Main Content */}
                <main className={`main-content ${activeTab === 'doctor-chat' ? 'no-padding' : ''}`}>

                    {/* ── Dashboard Tab ── */}
                    {activeTab === 'dashboard' && (
                        <div>
                            <div className="page-header">
                                <h1 className="page-title">My Health Dashboard</h1>
                                <p className="page-subtitle">Track your appointments and health status</p>
                            </div>

                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-icon blue"><FaCalendarCheck /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.total}</div>
                                        <div className="stat-label">Total Appointments</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon orange"><FaClock /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.pending}</div>
                                        <div className="stat-label">Pending</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon green"><FaCheckCircle /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.approved}</div>
                                        <div className="stat-label">Approved</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon red"><FaExclamationTriangle /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.high}</div>
                                        <div className="stat-label">High Risk</div>
                                    </div>
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-header">
                                    <span className="card-title">Appointment History</span>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <button className="btn-secondary" onClick={() => setActiveTab('new-appointment')}>
                                            + New Appointment
                                        </button>
                                    </div>
                                </div>
                                <div className="card-body">
                                    {fetchLoading ? (
                                        <div className="loading">Loading history...</div>
                                    ) : (
                                        <div className="appt-list-dashboard">
                                            {appointments.length === 0 ? (
                                                <div className="no-data">No appointments found.</div>
                                            ) : appointments.slice(0, 3).map(appt => (
                                                <div key={appt.id} className={`appt-item-small ${getRiskClass(appt.risk_level)}`}>
                                                    <div className="appt-info-small">
                                                        <span className="appt-symptoms">{appt.symptoms.substring(0, 60)}...</span>
                                                        <span className={`badge ${getStatusBadge(appt.status)}`}>{appt.status}</span>
                                                    </div>
                                                    {appt.appointment_date && (
                                                        <p className="appt-detail" style={{ marginTop: '0.5rem', color: '#2563eb', fontWeight: 600 }}>
                                                            📅 Scheduled: {new Date(appt.appointment_date).toLocaleString()}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── New Appointment Tab ── */}
                    {activeTab === 'new-appointment' && (
                        <div>
                            <div className="page-header">
                                <h1 className="page-title">Apply for Appointment</h1>
                                <p className="page-subtitle">Our AI will analyze your symptoms and assign a risk level</p>
                            </div>

                            {submitError && (
                                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                                    ⚠️ {submitError}
                                </div>
                            )}

                            {aiPrediction && (
                                <div className="ai-result">
                                    <div className="ai-result-title">
                                        <FaRobot /> AI Analysis Complete
                                    </div>
                                    <div className="ai-result-grid">
                                        <div className="ai-result-item">
                                            <div className="ai-result-item-label">Risk Level</div>
                                            <div className="ai-result-item-value" style={{
                                                color: aiPrediction.risk_level === 'High' ? '#dc2626' : aiPrediction.risk_level === 'Medium' ? '#d97706' : '#16a34a'
                                            }}>
                                                {aiPrediction.risk_level}
                                            </div>
                                        </div>
                                        <div className="ai-result-item">
                                            <div className="ai-result-item-label">Recommended Department</div>
                                            <div className="ai-result-item-value">{aiPrediction.recommended_department}</div>
                                        </div>
                                        {aiPrediction.queue_position != null && (
                                            <div className="ai-result-item">
                                                <div className="ai-result-item-label">Queue Position</div>
                                                <div className="ai-result-item-value" style={{ color: '#2563eb', fontWeight: 800 }}>
                                                    #{aiPrediction.queue_position}
                                                </div>
                                            </div>
                                        )}
                                        {aiPrediction.priority_score != null && (
                                            <div className="ai-result-item">
                                                <div className="ai-result-item-label">Priority Score</div>
                                                <div className="ai-result-item-value" style={{ color: '#7c3aed', fontWeight: 800 }}>
                                                    {aiPrediction.priority_score}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    {aiPrediction.reasons?.length > 0 && (
                                        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#1e40af' }}>
                                            <strong>Reasons:</strong> {aiPrediction.reasons.join(', ')}
                                        </div>
                                    )}
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <span className="alert alert-success" style={{ display: 'inline-block' }}>
                                            ✅ Appointment request submitted successfully!
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="form-card">
                                <form onSubmit={submitAppointment}>
                                    <div className="form-field">
                                        <label>Patient Name *</label>
                                        <input
                                            type="text"
                                            name="patient_name"
                                            value={formData.patient_name}
                                            onChange={handleInputChange}
                                            placeholder="Full Name"
                                            required
                                        />
                                    </div>

                                    <div className="form-grid-2">
                                        <div className="form-field">
                                            <label>Age *</label>
                                            <input type="number" name="age" value={formData.age} onChange={handleInputChange} placeholder="e.g. 35" required min="1" max="120" />
                                        </div>
                                        <div className="form-field">
                                            <label>Gender *</label>
                                            <select name="gender" value={formData.gender} onChange={handleInputChange}>
                                                <option>Male</option>
                                                <option>Female</option>
                                                <option>Other</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-field">
                                        <label>Symptoms * <span style={{ color: '#64748b', fontWeight: 400 }}>(be specific for better AI analysis)</span></label>
                                        <textarea
                                            name="symptoms"
                                            value={formData.symptoms}
                                            onChange={handleInputChange}
                                            placeholder="e.g., severe chest pain, shortness of breath, dizziness for 2 days..."
                                            required
                                        />
                                    </div>


                                    <div className="form-field">
                                        <label>Pre-existing Conditions <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
                                        <input
                                            type="text"
                                            name="pre_existing_conditions"
                                            value={formData.pre_existing_conditions}
                                            onChange={handleInputChange}
                                            placeholder="e.g., Diabetes, Hypertension, Asthma"
                                        />
                                    </div>

                                    <button type="submit" className="btn-primary" disabled={loading}>
                                        {loading ? '🤖 Analyzing with AI...' : '🤖 Analyze & Submit Request'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ── Doctor Chat Tab ── */}
                    {activeTab === 'doctor-chat' && (
                        <ChatBox />
                    )}

                    {/* ── Profile Tab ── */}
                    {activeTab === 'profile' && (
                        <div>
                            <div className="page-header">
                                <h1 className="page-title">My Profile</h1>
                            </div>
                            <div className="card" style={{ maxWidth: 600 }}>
                                <div className="card-header">
                                    <span className="card-title">Profile Information</span>
                                    {!isEditingProfile && (
                                        <button className="btn-secondary" onClick={() => setIsEditingProfile(true)}>
                                            <FaEdit /> Edit Profile
                                        </button>
                                    )}
                                </div>
                                <div className="card-body">
                                    {isEditingProfile ? (
                                        <form onSubmit={handleProfileSubmit}>
                                            <div className="form-group">
                                                <label className="form-label">Full Name</label>
                                                <div className="input-wrapper">
                                                    <FaUser className="input-icon" />
                                                    <input
                                                        type="text"
                                                        name="username"
                                                        className="form-control"
                                                        value={profileFormData.username}
                                                        onChange={handleProfileChange}
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
                                                            value={profileFormData.gender}
                                                            onChange={handleProfileChange}
                                                            required
                                                        >
                                                            <option value="">Select</option>
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
                                                            value={profileFormData.age}
                                                            onChange={handleProfileChange}
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="form-grid-2">
                                                <div className="form-group">
                                                    <label className="form-label">Height</label>
                                                    <div className="form-grid-2" style={{ gap: '0.5rem' }}>
                                                        <div className="input-wrapper">
                                                            <FaRulerVertical className="input-icon" />
                                                            <select
                                                                name="heightFeet"
                                                                value={profileFormData.heightFeet}
                                                                onChange={handleProfileChange}
                                                                style={{ paddingLeft: '2.25rem' }}
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
                                                                value={profileFormData.heightInches}
                                                                onChange={handleProfileChange}
                                                                style={{ paddingLeft: '1rem' }}
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
                                                    <label className="form-label">Weight</label>
                                                    <div className="input-wrapper">
                                                        <FaWeight className="input-icon" />
                                                        <input
                                                            type="text"
                                                            name="weight"
                                                            value={profileFormData.weight}
                                                            onChange={handleProfileChange}
                                                            placeholder="e.g. 70kg"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <label className="form-label">Mobile Number</label>
                                                <div className="input-wrapper">
                                                    <FaPhone className="input-icon" />
                                                    <input
                                                        type="tel"
                                                        name="phone_number"
                                                        value={profileFormData.phone_number}
                                                        onChange={handleProfileChange}
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                                <button type="submit" className="btn-primary" disabled={profileLoading}>
                                                    {profileLoading ? 'Saving...' : 'Save Changes'}
                                                </button>
                                                <button type="button" className="btn-secondary" onClick={() => setIsEditingProfile(false)}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                                                <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.5rem' }}>
                                                    {user?.username?.[0]?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{user?.username}</div>
                                                    <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{user?.email}</div>
                                                </div>
                                            </div>
                                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1.25rem' }}>
                                                <div className="profile-details">
                                                    <div className="profile-detail-item">
                                                        <span className="label">Gender:</span>
                                                        <span className="value">{user?.gender || '—'}</span>
                                                    </div>
                                                    <div className="profile-detail-item">
                                                        <span className="label">Age:</span>
                                                        <span className="value">{user?.age ? `${user.age} years` : '—'}</span>
                                                    </div>
                                                    <div className="profile-detail-item">
                                                        <span className="label">Height:</span>
                                                        <span className="value">{user?.height || '—'}</span>
                                                    </div>
                                                    <div className="profile-detail-item">
                                                        <span className="label">Weight:</span>
                                                        <span className="value">{user?.weight || '—'}</span>
                                                    </div>
                                                    <div className="profile-detail-item">
                                                        <span className="label">Mobile:</span>
                                                        <span className="value">{user?.phone_number || '—'}</span>
                                                    </div>
                                                </div>

                                                <div style={{ marginTop: '1.5rem', borderTop: '1px dashed #e2e8f0', paddingTop: '1rem' }}>
                                                    <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Total Appointments: <strong style={{ color: '#1e293b' }}>{counts.total}</strong></p>
                                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>High Risk Cases: <strong style={{ color: '#dc2626' }}>{counts.high}</strong></p>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default PatientDashboard;
