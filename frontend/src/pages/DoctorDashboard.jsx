import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ChatBox from '../components/ChatBox';
import {
    FaUserMd, FaCheck, FaTimes, FaSortAmountDown,
    FaHeartbeat, FaClipboardList, FaExclamationTriangle,
    FaClock, FaCheckCircle, FaCommentMedical, FaEdit,
    FaUser, FaPhone, FaCalendarAlt, FaVenusMars, FaRulerVertical, FaWeight
} from 'react-icons/fa';

const DoctorDashboard = () => {
    const { user, updateProfile, logout } = useAuth();
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
                phone_number: user.phone_number || '',
                heightFeet: feet,
                heightInches: inches,
                weight: user.weight || ''
            });
        }
    }, [isEditingProfile, user]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('queue');
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState(null);
    const [manualDate, setManualDate] = useState('');

    useEffect(() => { fetchAppointments(); }, []);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const res = await api.get('/doctor/dashboard');
            setAppointments(res.data.appointments);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
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

    const handleAction = async (id, status) => {
        try {
            if (status === 'Approved') {
                const appt = appointments.find(a => a.id === id);
                setSelectedAppt(appt);
                setShowScheduleModal(true);
                return;
            }
            await api.put(`/doctor/appointment/${id}`, { status });
            fetchAppointments();
        } catch (err) {
            alert('Action failed. Please try again.');
        }
    };

    const confirmApprove = async () => {
        if (!manualDate) {
            alert('Please select a date and time.');
            return;
        }
        try {
            await api.put(`/doctor/appointment/${selectedAppt.id}`, {
                status: 'Approved',
                appointment_date: manualDate
            });
            setShowScheduleModal(false);
            setSelectedAppt(null);
            setManualDate('');
            fetchAppointments();
        } catch (err) {
            alert('Failed to approve appointment.');
        }
    };

    const counts = {
        total: appointments.length,
        pending: appointments.filter(a => a.status === 'Pending').length,
        approved: appointments.filter(a => a.status === 'Approved').length,
        high: appointments.filter(a => a.risk_level === 'High').length,
    };

    const getRiskBadge = (level) => {
        if (level === 'High') return 'badge badge-high';
        if (level === 'Medium') return 'badge badge-medium';
        return 'badge badge-low';
    };

    const getStatusBadge = (status) => {
        const map = { Pending: 'badge badge-pending', Approved: 'badge badge-approved', Rejected: 'badge badge-rejected' };
        return map[status] || 'badge badge-pending';
    };

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
                        <div className="avatar" style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}>
                            {user?.username?.[0]?.toUpperCase()}
                        </div>
                        <span>Dr. {user?.username}</span>
                    </div>
                    <button className="logout-btn" onClick={logout}>Logout</button>
                </div>
            </nav>

            <div className="main-body">
                {/* Sidebar */}
                <aside className="sidebar">
                    <p className="sidebar-section-title">Doctor Portal</p>
                    <button
                        className={`sidebar-item ${activeTab === 'queue' ? 'active' : ''}`}
                        onClick={() => setActiveTab('queue')}
                    >
                        <span className="icon"><FaClipboardList /></span> Patient Queue
                    </button>
                    <button
                        className={`sidebar-item ${activeTab === 'chat' ? 'active' : ''}`}
                        onClick={() => setActiveTab('chat')}
                    >
                        <span className="icon"><FaCommentMedical /></span> Patient Chat
                    </button>
                    <button
                        className={`sidebar-item ${activeTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActiveTab('profile')}
                    >
                        <span className="icon"><FaUserMd /></span> My Profile
                    </button>
                </aside>

                {/* Main Content */}
                <main className={`main-content ${activeTab === 'chat' ? 'no-padding' : ''}`}>
                    {activeTab === 'queue' && (
                        <div>
                            <div className="page-header">
                                <h1 className="page-title">Patient Queue</h1>
                                <p className="page-subtitle">AI-prioritized triage list — High risk patients appear first</p>
                            </div>

                            {/* Stats */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-icon teal"><FaClipboardList /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.total}</div>
                                        <div className="stat-label">Total Requests</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon orange"><FaClock /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.pending}</div>
                                        <div className="stat-label">Awaiting Review</div>
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

                            {/* Table */}
                            {loading ? (
                                <div className="loading-spinner"><div className="spinner"></div> Loading patient queue...</div>
                            ) : appointments.length === 0 ? (
                                <div className="card">
                                    <div className="card-body">
                                        <div className="empty-state">
                                            <div className="empty-state-icon">📋</div>
                                            <div className="empty-state-title">No appointment requests yet</div>
                                            <div className="empty-state-desc">Patient requests will appear here once submitted.</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="table-wrapper">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Risk Level</th>
                                                <th>Patient Info</th>
                                                <th>Department</th>
                                                <th>Symptoms</th>
                                                <th>Vitals</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {appointments.map(appt => (
                                                <tr key={appt.id} className={appt.risk_level === 'High' ? 'risk-high-row' : ''}>
                                                    <td>
                                                        <span className={getRiskBadge(appt.risk_level)}>{appt.risk_level}</span>
                                                    </td>
                                                    <td>
                                                        <div style={{ fontWeight: 600 }}>{appt.patient_name || `Patient #${appt.patient_id}`}</div>
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{appt.gender}, {appt.age} yrs</div>
                                                        {appt.pre_existing_conditions && (
                                                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                                                                {appt.pre_existing_conditions}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontWeight: 600, color: '#2563eb' }}>{appt.recommended_department}</td>
                                                    <td style={{ maxWidth: 200 }}>
                                                        <div style={{ fontSize: '0.85rem' }}>{appt.symptoms}</div>
                                                    </td>
                                                    <td style={{ fontSize: '0.85rem', color: '#64748b' }}>{appt.vitals || '—'}</td>
                                                    <td>
                                                        <span className={getStatusBadge(appt.status)}>{appt.status}</span>
                                                    </td>
                                                    <td>
                                                        {appt.status === 'Pending' ? (
                                                            <div className="action-btns">
                                                                <button
                                                                    className="btn-secondary"
                                                                    onClick={() => handleAction(appt.id, 'Approved')}
                                                                    title="Approve"
                                                                    style={{ padding: '0.4rem 0.75rem' }}
                                                                >
                                                                    <FaCheck />
                                                                </button>
                                                                <button
                                                                    className="btn-danger"
                                                                    onClick={() => handleAction(appt.id, 'Rejected')}
                                                                    title="Reject"
                                                                    style={{ padding: '0.4rem 0.75rem' }}
                                                                >
                                                                    <FaTimes />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                                                {appt.status === 'Approved' ? '✅ Done' : '❌ Rejected'}
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'chat' && <ChatBox />}

                    {activeTab === 'profile' && (
                        <div>
                            <div className="page-header">
                                <h1 className="page-title">Doctor Profile</h1>
                            </div>
                            <div className="card" style={{ maxWidth: 520 }}>
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
                                                <label className="form-label">Phone Number</label>
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
                                                <div className="avatar" style={{ width: 64, height: 64, fontSize: '1.5rem', background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}>
                                                    {user?.username?.[0]?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>Dr. {user?.username}</div>
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
                                                        <span className="label">Phone:</span>
                                                        <span className="value">{user?.phone_number || '—'}</span>
                                                    </div>
                                                </div>

                                                <div style={{ marginTop: '1.5rem', borderTop: '1px dashed #e2e8f0', paddingTop: '1rem' }}>
                                                    <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Total Patients: <strong style={{ color: '#1e293b' }}>{counts.total}</strong></p>
                                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>Approved: <strong style={{ color: '#16a34a' }}>{counts.approved}</strong></p>
                                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>Pending Review: <strong style={{ color: '#d97706' }}>{counts.pending}</strong></p>
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

            {/* Scheduling Modal */}
            {showScheduleModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 className="modal-title"><FaCalendarAlt /> Schedule Appointment</h2>
                            <button className="modal-close" onClick={() => setShowScheduleModal(false)}>
                                <FaTimes />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="schedule-info">
                                <p>Patient Name</p>
                                <div className="info-value">{selectedAppt?.patient_name || `Patient #${selectedAppt?.patient_id}`}</div>
                                <p style={{ marginTop: '0.8rem' }}>Symptoms</p>
                                <div className="info-value" style={{ fontSize: '0.85rem' }}>{selectedAppt?.symptoms}</div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Consultation Date & Time</label>
                                <div className="input-wrapper">
                                    <FaClock className="input-icon" />
                                    <input
                                        type="datetime-local"
                                        value={manualDate}
                                        onChange={(e) => setManualDate(e.target.value)}
                                        required
                                        className="form-control"
                                        style={{ border: 'none', background: 'transparent', width: '100%', padding: '0.5rem 0' }}
                                    />
                                </div>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                                    Select a suitable time for the consultation.
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowScheduleModal(false)}>
                                Cancel
                            </button>
                            <button className="btn-primary" onClick={confirmApprove} style={{ marginTop: 0 }}>
                                <FaCheck /> Confirm & Schedule
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorDashboard;
