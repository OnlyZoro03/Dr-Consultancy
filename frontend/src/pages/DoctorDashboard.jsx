import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ChatBox from '../components/ChatBox';
import SummaryCard from '../components/SummaryCard';
import DepartmentChart from '../components/DepartmentChart';
import RiskPieChart from '../components/RiskPieChart';
import PatientExplanationPanel from '../components/PatientExplanationPanel';
import HighRiskAlert, { playAlertBeep } from '../components/HighRiskAlert';
import NextPatientRecommendation from '../components/NextPatientRecommendation';
import socket from '../services/socket';
import {
    FaUserMd, FaSortAmountDown,
    FaHeartbeat, FaClipboardList, FaExclamationTriangle,
    FaClock, FaCheckCircle, FaCommentMedical, FaEdit,
    FaUser, FaPhone, FaCalendarAlt, FaVenusMars, FaRulerVertical, FaWeight,
    FaChartBar, FaUsers, FaHospital, FaBrain, FaBell
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

    // ── AI Triage Queue ───────────────────────────────────────────────────────
    const [triageQueue, setTriageQueue]   = useState([]);
    const [triageLoading, setTriageLoading] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState(null);

    // ── Next-Patient Recommendation state ──────────────────────────────────
    const [nextPatient, setNextPatient] = useState(null);
    const [nextPatientLoading, setNextPatientLoading] = useState(false);
    const [multipleHighRisk, setMultipleHighRisk] = useState(false);

    const fetchNextPatient = async () => {
        setNextPatientLoading(true);
        try {
            const res = await api.get('/doctor/next-patient');
            setNextPatient(res.data.recommendation);
            setMultipleHighRisk(res.data.multiple_high_risk || false);
        } catch (err) {
            console.error('Next-patient fetch error:', err);
        } finally {
            setNextPatientLoading(false);
        }
    };

    // ── High-Risk Alert state ─────────────────────────────────────────
    const [highRiskAlerts, setHighRiskAlerts] = useState([]);
    const [socketConnected, setSocketConnected] = useState(false);
    const alertCounterRef = useRef(0);

    const dismissAlert = useCallback((alertId) => {
        setHighRiskAlerts(prev => prev.filter(a => a._alertId !== alertId));
    }, []);

    // ── Socket lifecycle tied to doctor session ────────────────────────
    useEffect(() => {
        const riskOrder = { High: 0, Medium: 1, Low: 2 };

        /**
         * Sort queue: primary → priority_score desc (if present),
         * secondary → risk level (High first), tertiary → created_at asc
         */
        const sortQueue = (list) =>
            [...list].sort((a, b) => {
                // Prefer explicit priority_score from scheduler when available
                const scoreA = a.priority_score ?? 0;
                const scoreB = b.priority_score ?? 0;
                if (scoreB !== scoreA) return scoreB - scoreA;

                // Fallback: risk level
                const riskDiff = (riskOrder[a.risk_level] ?? 3) - (riskOrder[b.risk_level] ?? 3);
                if (riskDiff !== 0) return riskDiff;

                // Tertiary: arrival time (earlier = higher priority)
                const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return timeA - timeB;
            });

        const onConnect = () => setSocketConnected(true);
        const onDisconnect = () => setSocketConnected(false);

        const onNewTriage = (data) => {
            // Merge into triage queue and re-sort by full priority logic
            setTriageQueue(prev => sortQueue([data, ...prev.filter(p => p.id !== data.id)]));

            // Also refresh the appointments list + next-patient recommendation
            fetchAppointments();
            fetchNextPatient();

            // ── Live analytics update ─────────────────────────────────────
            // Update dashboardStats in-place so charts refresh without a reload
            const dept = data.department || data.recommended_department;
            const risk = data.risk_level;
            setDashboardStats(prev => {
                if (!prev) return prev; // not yet loaded — skip

                // Department load: increment existing bar, or add a new one
                const updatedDeptLoad = prev.department_load
                    ? prev.department_load.map(d =>
                        d.department === dept ? { ...d, count: d.count + 1 } : d
                      )
                    : [];
                if (dept && !updatedDeptLoad.find(d => d.department === dept)) {
                    updatedDeptLoad.push({ department: dept, count: 1 });
                }

                // Risk distribution: increment matching slice, or add a new slice
                const updatedRiskDist = prev.risk_distribution
                    ? prev.risk_distribution.map(r =>
                        r.risk === risk ? { ...r, value: r.value + 1 } : r
                      )
                    : [];
                if (risk && !updatedRiskDist.find(r => r.risk === risk)) {
                    updatedRiskDist.push({ risk, value: 1 });
                }

                return {
                    ...prev,
                    total_patients_today: (prev.total_patients_today || 0) + 1,
                    high_risk_count:
                        risk === 'High'
                            ? (prev.high_risk_count || 0) + 1
                            : (prev.high_risk_count || 0),
                    department_load:   updatedDeptLoad,
                    risk_distribution: updatedRiskDist,
                };
            });

            // Show floating alert only for High Risk patients
            if (data.risk_level === 'High') {
                playAlertBeep();
                setHighRiskAlerts(prev => [
                    ...prev,
                    { ...data, _alertId: ++alertCounterRef.current },
                ]);
            }
        };

        socket.on('connect',            onConnect);
        socket.on('disconnect',         onDisconnect);
        socket.on('new_patient_triage', onNewTriage);

        // Sync initial connection state
        setSocketConnected(socket.connected);

        return () => {
            socket.off('connect',            onConnect);
            socket.off('disconnect',         onDisconnect);
            socket.off('new_patient_triage', onNewTriage);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Doctor Dashboard analytics state ─────────────────────────────────────
    const [dashboardStats, setDashboardStats] = useState(null);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [dashboardError, setDashboardError] = useState('');

    // Pre-fetch everything on mount so real-time socket updates have a base to mutate
    useEffect(() => { fetchAppointments(); fetchTriageQueue(); fetchDashboardStats(); fetchNextPatient(); }, []);

    const fetchTriageQueue = async () => {
        setTriageLoading(true);
        try {
            const res = await api.get('/doctor/patient-queue');
            setTriageQueue(res.data);
        } catch (err) {
            console.error('Triage queue error:', err);
        } finally {
            setTriageLoading(false);
        }
    };

    // Fetch dashboard stats whenever the analytics tab is opened
    useEffect(() => {
        if (activeTab === 'analytics') fetchDashboardStats();
    }, [activeTab]);

    const fetchDashboardStats = async () => {
        setDashboardLoading(true);
        setDashboardError('');
        try {
            const res = await api.get('/doctor/stats');
            setDashboardStats(res.data);
        } catch (err) {
            console.error('Dashboard stats error:', err);
            setDashboardError('Failed to load dashboard data. Please try again.');
        } finally {
            setDashboardLoading(false);
        }
    };

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
            await api.put(`/doctor/appointment/${id}`, { status });
            fetchAppointments();
        } catch (err) {
            alert('Action failed. Please try again.');
        }
    };

    const counts = {
        total:     appointments.length,
        emergency: appointments.filter(a => a.status === 'Emergency Scheduled').length,
        queued:    appointments.filter(a => a.status === 'Queued').length,
        high:      appointments.filter(a => a.risk_level === 'High').length,
    };

    const getRiskBadge = (level) => {
        if (level === 'High') return 'badge badge-high';
        if (level === 'Medium') return 'badge badge-medium';
        return 'badge badge-low';
    };

    // Returns inline style for AI-assigned scheduling status badges.
    // Also handles legacy statuses (Pending/Approved/Rejected) for DB backward compat.
    const getScheduleStatusStyle = (status) => {
        const map = {
            'Emergency Scheduled': { background: '#fee2e2', color: '#b91c1c', border: '1.5px solid #fca5a5' },
            'Queued':              { background: '#fef3c7', color: '#92400e', border: '1.5px solid #fcd34d' },
            'Waiting':             { background: '#f0fdf4', color: '#166534', border: '1.5px solid #86efac' },
            // Legacy
            'Pending':   { background: '#fef3c7', color: '#92400e',  border: '1.5px solid #fcd34d' },
            'Approved':  { background: '#f0fdf4', color: '#166534',  border: '1.5px solid #86efac' },
            'Rejected':  { background: '#fee2e2', color: '#b91c1c',  border: '1.5px solid #fca5a5' },
        };
        return map[status] || map['Waiting'];
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
                        className={`sidebar-item ${activeTab === 'analytics' ? 'active' : ''}`}
                        onClick={() => setActiveTab('analytics')}
                    >
                        <span className="icon"><FaChartBar /></span> Doctor Dashboard
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
                            {/* ── AI Next-Patient Recommendation card ───────── */}
                            <NextPatientRecommendation
                                recommendation={nextPatient}
                                loading={nextPatientLoading}
                                multipleHighRisk={multipleHighRisk}
                                onSelect={(patient) => {
                                    // Merge with triage data if available so the panel is rich
                                    const full = triageQueue.find(t => t.id === patient.id) || patient;
                                    setSelectedPatient(full);
                                }}
                            />

                            <div className="page-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h1 className="page-title">Patient Queue</h1>
                                    <p className="page-subtitle">AI-prioritized triage list — High risk patients appear first</p>
                                </div>

                                {/* Live indicator + test button */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingTop: 4 }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        fontSize: '0.76rem', fontWeight: 700,
                                        padding: '5px 11px', borderRadius: 20,
                                        background: socketConnected ? '#f0fdf4' : '#fef2f2',
                                        color:      socketConnected ? '#16a34a' : '#dc2626',
                                        border:     `1.5px solid ${socketConnected ? '#bbf7d0' : '#fecaca'}`,
                                    }}>
                                        <span style={{
                                            width: 7, height: 7, borderRadius: '50%',
                                            background: socketConnected ? '#22c55e' : '#ef4444',
                                            animation: socketConnected ? 'socketPulse 2s ease-in-out infinite' : 'none',
                                            display: 'inline-block', flexShrink: 0,
                                        }}/>
                                        {socketConnected ? 'Live' : 'Offline'}
                                    </span>

                                    <button
                                        title="Simulate a high-risk patient alert (demo)"
                                        onClick={async () => {
                                            try { await api.post('/doctor/test-alert', {}); }
                                            catch (e) { alert('Test alert failed: ' + (e?.response?.data?.message || e.message)); }
                                        }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                            background: 'linear-gradient(135deg,#dc2626,#b91c1c)',
                                            color: '#fff', fontSize: '0.78rem', fontWeight: 700,
                                            boxShadow: '0 2px 8px rgba(220,38,38,0.35)',
                                        }}
                                    >
                                        <FaBell style={{ fontSize: '0.72rem' }}/> Test Alert
                                    </button>
                                </div>
                            </div>

                            <style>{`
                                @keyframes socketPulse {
                                    0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
                                    50%      { box-shadow: 0 0 0 4px rgba(34,197,94,0); }
                                }
                            `}</style>

                            {/* Stats */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-icon teal"><FaClipboardList /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.total}</div>
                                        <div className="stat-label">Total Patients</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon red"><FaExclamationTriangle /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.emergency}</div>
                                        <div className="stat-label">Emergency Scheduled</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon orange"><FaClock /></div>
                                    <div className="stat-info">
                                        <div className="stat-value">{counts.queued}</div>
                                        <div className="stat-label">Queued</div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon red"><FaHeartbeat /></div>
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
                                                <th>AI Status</th>
                                                <th>Info</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {appointments.map(appt => {
                                                // Merge with richer triage data if available
                                                const triage = triageQueue.find(t => t.id === appt.id);
                                                return (
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
                                                        {/* AI-assigned scheduling status badge */}
                                                        <span style={{
                                                            ...getScheduleStatusStyle(appt.status),
                                                            fontSize: '0.72rem', fontWeight: 700,
                                                            padding: '3px 10px', borderRadius: 12,
                                                            display: 'inline-block', whiteSpace: 'nowrap',
                                                        }}>
                                                            {appt.status}
                                                        </span>
                                                        {/* Priority score pill if available */}
                                                        {(triage?.priority_score != null) && (
                                                            <div style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 700, marginTop: 3 }}>
                                                                Score: {triage.priority_score}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {/* AI Explanation button only — no manual scheduling */}
                                                        <button
                                                            onClick={() => setSelectedPatient(triage || {
                                                                id: appt.id,
                                                                name: appt.patient_name || `Patient #${appt.patient_id}`,
                                                                age: appt.age,
                                                                gender: appt.gender,
                                                                symptoms: appt.symptoms,
                                                                department: appt.recommended_department,
                                                                risk_level: appt.risk_level,
                                                                pre_existing_conditions: appt.pre_existing_conditions,
                                                                vitals_raw: appt.vitals,
                                                                vitals_structured: {},
                                                                confidence: null,
                                                                ai_explanation: {},
                                                            })}
                                                            title="View AI Explanation"
                                                            style={{
                                                                padding: '0.4rem 0.65rem',
                                                                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                                                                color: '#fff', border: 'none', borderRadius: 8,
                                                                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
                                                                display: 'flex', alignItems: 'center', gap: 5,
                                                                whiteSpace: 'nowrap',
                                                            }}
                                                        >
                                                            <FaBrain style={{ fontSize: '0.75rem' }} /> AI
                                                        </button>
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Doctor Dashboard Analytics Tab ──────────────────── */}
                    {activeTab === 'analytics' && (
                        <div>
                            {/* ── Header row with Live Monitoring badge ── */}
                            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h1 className="page-title">Doctor Dashboard</h1>
                                    <p className="page-subtitle">Real-time patient triage statistics and hospital workload</p>
                                </div>

                                {/* Live / offline badge */}
                                <div style={{ flexShrink: 0, paddingTop: 4 }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        fontSize: '0.76rem', fontWeight: 700,
                                        padding: '5px 12px', borderRadius: 20,
                                        background: socketConnected ? '#f0fdf4' : '#fffbeb',
                                        color:      socketConnected ? '#16a34a' : '#92400e',
                                        border:     `1.5px solid ${socketConnected ? '#bbf7d0' : '#fde68a'}`,
                                        lineHeight: 1.3,
                                    }}>
                                        <span style={{
                                            width: 7, height: 7, borderRadius: '50%',
                                            background: socketConnected ? '#22c55e' : '#f59e0b',
                                            animation: socketConnected ? 'socketPulse 2s ease-in-out infinite' : 'none',
                                            display: 'inline-block', flexShrink: 0,
                                        }}/>
                                        {socketConnected ? 'Live Monitoring Active' : 'Live updates temporarily unavailable'}
                                    </span>
                                </div>
                            </div>

                            {dashboardLoading && (
                                <div className="loading-spinner">
                                    <div className="spinner"></div> Loading dashboard...
                                </div>
                            )}

                            {dashboardError && !dashboardLoading && (
                                <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
                                    {dashboardError}
                                    <button
                                        onClick={fetchDashboardStats}
                                        style={{ marginLeft: '1rem', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                    >
                                        Retry
                                    </button>
                                </div>
                            )}

                            {dashboardStats && !dashboardLoading && (
                                <>
                                    {/* ── Row 1: Summary Cards ─────────────────── */}
                                    <div className="dashboard-cards-grid">
                                        <SummaryCard
                                            title="Total Patients Today"
                                            value={dashboardStats.total_patients_today}
                                            icon={<FaUsers style={{ fontSize: '1.6rem' }} />}
                                            color="bg-blue"
                                            subtext="Across all departments"
                                        />
                                        <SummaryCard
                                            title="High Risk Patients"
                                            value={dashboardStats.high_risk_count}
                                            icon={<FaExclamationTriangle style={{ fontSize: '1.6rem' }} />}
                                            color="bg-red"
                                            subtext="Require immediate attention"
                                        />
                                        <SummaryCard
                                            title="Avg. Waiting Time"
                                            value={`${dashboardStats.average_waiting_time} min`}
                                            icon={<FaClock style={{ fontSize: '1.6rem' }} />}
                                            color="bg-green"
                                            subtext="Per patient today"
                                        />
                                    </div>

                                    {/* ── Row 2: Department Bar Chart ──────────── */}
                                    <div style={{ marginTop: '1.75rem' }}>
                                        <DepartmentChart data={dashboardStats.department_load || []} />
                                    </div>

                                    {/* ── Row 3: Risk Pie Chart ────────────────── */}
                                    <div style={{ marginTop: '1.75rem', maxWidth: 520 }}>
                                        <RiskPieChart data={dashboardStats.risk_distribution || []} />
                                    </div>
                                </>
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
                                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>Emergency Scheduled: <strong style={{ color: '#dc2626' }}>{counts.emergency}</strong></p>
                                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>Queued: <strong style={{ color: '#d97706' }}>{counts.queued}</strong></p>
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

            {/* ── AI Explanation Sliding Panel ─────────────────────────── */}
            {selectedPatient && (
                <PatientExplanationPanel
                    patient={selectedPatient}
                    onClose={() => setSelectedPatient(null)}
                />
            )}
            {/* ── High-Risk Real-Time Alert Stack ──────────────────────── */}
            <HighRiskAlert alerts={highRiskAlerts} onDismiss={dismissAlert} />        </div>
    );
};

export default DoctorDashboard;
