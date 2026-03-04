import React, { useState, useEffect, useRef, Component } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
    FaFileMedical, FaUpload, FaMicroscope, FaExclamationCircle,
    FaCheckCircle, FaChartBar, FaStethoscope, FaInfoCircle, FaArrowLeft,
    FaCamera, FaTimes, FaTrash, FaUserMd, FaShieldAlt, FaEye,
    FaAppleAlt, FaRunning, FaTint, FaBed, FaHeartbeat,
    FaLeaf, FaBrain, FaExclamationTriangle,
    FaThumbsUp, FaFlask, FaArrowRight
} from 'react-icons/fa';
import { Link } from 'react-router-dom';

// ─── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null }; }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) { console.error('ReportAnalysis error:', error, info); }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
                    <h3>Something went wrong loading this page.</h3>
                    <pre style={{ fontSize: '0.75rem', marginTop: '1rem', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                        {this.state.error?.message}
                    </pre>
                    <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                        Try Again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Status colour helpers ──────────────────────────────────────────────────
const STATUS_COLORS = {
    Normal:     { bg: '#dcfce7', border: '#86efac', text: '#166534', dot: '#22c55e' },
    Borderline: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', dot: '#f59e0b' },
    High:       { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', dot: '#ef4444' },
    Low:        { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af', dot: '#3b82f6' },
    Unknown:    { bg: '#f1f5f9', border: '#cbd5e1', text: '#64748b', dot: '#94a3b8' },
};

const riskColor = (level) => {
    if (level === 'High')   return { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' };
    if (level === 'Medium') return { bg: '#fef3c7', text: '#d97706', border: '#fcd34d' };
    return { bg: '#dcfce7', text: '#16a34a', border: '#86efac' };
};

// ─── Sub-components ─────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
    const s = STATUS_COLORS[status] || STATUS_COLORS.Unknown;
    const icons = { Normal: <FaCheckCircle />, High: <FaExclamationCircle />, Low: <FaExclamationCircle />, Borderline: <FaInfoCircle /> };
    return (
        <span style={{
            background: s.bg, color: s.text, padding: '0.2rem 0.65rem',
            borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            border: `1px solid ${s.border}`
        }}>
            {icons[status] || <FaInfoCircle />} {status}
        </span>
    );
};

const ParameterCard = ({ param, history = [] }) => {
    const { name, value, unit, normal_range, status, min, max, interpretation, category } = param;
    const s = STATUS_COLORS[status] || STATUS_COLORS.Unknown;
    const [expanded, setExpanded] = useState(false);

    // Range bar maths
    const span       = (max - min) || 1;
    const dispMin    = min - span * 0.5;
    const dispMax    = max + span * 0.5;
    const dispSpan   = dispMax - dispMin;
    const pct        = Math.min(Math.max(((value - dispMin) / dispSpan) * 100, 2), 98);
    const minPct     = ((min - dispMin) / dispSpan) * 100;
    const maxPct     = ((max - dispMin) / dispSpan) * 100;

    // Trend from history
    const trendData = history
        .map(r => {
            const p = Array.isArray(r.extracted_data) ? r.extracted_data.find(x => x.name === name) : null;
            return p ? { val: p.value, date: new Date(r.created_at) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.date - b.date);

    return (
        <div style={{
            background: 'white', borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            borderLeft: `4px solid ${s.dot}`,
            transition: 'box-shadow 0.2s'
        }}>
            {/* Header */}
            <div style={{ padding: '1.1rem 1.25rem 0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{category}</div>
                        <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 700, marginTop: '0.15rem' }}>{name}</div>
                    </div>
                    <StatusBadge status={status} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 800, color: s.text }}>{value}</span>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>{unit}</span>
                </div>
            </div>

            {/* Range bar */}
            <div style={{ padding: '0.25rem 1.25rem 0.75rem' }}>
                <div style={{ position: 'relative', height: '32px', marginTop: '0.5rem' }}>
                    {/* track */}
                    <div style={{ position: 'absolute', top: '13px', left: 0, right: 0, height: '6px', background: '#f1f5f9', borderRadius: '3px' }} />
                    {/* normal zone */}
                    <div style={{
                        position: 'absolute', top: '13px',
                        left: `${minPct}%`, width: `${maxPct - minPct}%`,
                        height: '6px', background: '#bbf7d0', borderRadius: '2px'
                    }} />
                    {/* value indicator */}
                    <div style={{
                        position: 'absolute', top: '6px',
                        left: `${pct}%`, transform: 'translateX(-50%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center'
                    }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: s.dot, border: '2px solid white', boxShadow: `0 0 0 2px ${s.dot}` }} />
                    </div>
                    {/* range labels */}
                    <div style={{ position: 'absolute', bottom: '-2px', left: `${minPct}%`, fontSize: '0.6rem', color: '#94a3b8', transform: 'translateX(-50%)' }}>{min}</div>
                    <div style={{ position: 'absolute', bottom: '-2px', left: `${maxPct}%`, fontSize: '0.6rem', color: '#94a3b8', transform: 'translateX(-50%)' }}>{max}</div>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                    Normal: {normal_range} {unit}
                </div>
            </div>

            {/* Trend mini-chart */}
            {trendData.length > 1 && (
                <div style={{ padding: '0 1.25rem 0.75rem', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontWeight: 700, marginBottom: '4px', marginTop: '0.5rem' }}>TREND</div>
                    <svg width="100%" height="28" style={{ overflow: 'visible' }}>
                        {trendData.map((d, i) => {
                            if (i === 0) return null;
                            const prev = trendData[i - 1];
                            const x1 = `${((i - 1) / (trendData.length - 1)) * 100}%`;
                            const x2 = `${(i / (trendData.length - 1)) * 100}%`;
                            const y1 = 28 - ((prev.val - dispMin) / dispSpan) * 28;
                            const y2 = 28 - ((d.val - dispMin) / dispSpan) * 28;
                            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />;
                        })}
                        {trendData.map((d, i) => {
                            const cx = `${(i / (trendData.length - 1)) * 100}%`;
                            const cy = 28 - ((d.val - dispMin) / dispSpan) * 28;
                            return <circle key={i} cx={cx} cy={cy} r="3" fill="#6366f1" />;
                        })}
                    </svg>
                </div>
            )}

            {/* Expandable interpretation */}
            {interpretation && (
                <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            width: '100%', padding: '0.5rem 1.25rem',
                            background: 'none', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            fontSize: '0.72rem', color: '#6366f1', fontWeight: 600
                        }}
                    >
                        <span>AI Interpretation</span>
                        <FaArrowRight style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                    </button>
                    {expanded && (
                        <div style={{ padding: '0.5rem 1.25rem 1rem', fontSize: '0.78rem', color: '#475569', lineHeight: '1.7', background: '#fafbff' }}>
                            {interpretation}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main Component ──────────────────────────────────────────────────────────
const ReportAnalysis = () => {
    const { user } = useAuth();
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reports, setReports] = useState([]);
    const [selectedReport, setSelectedReport] = useState(null);
    const [error, setError] = useState('');
    const [showCamera, setShowCamera] = useState(false);
    const [videoStream, setVideoStream] = useState(null);
    const videoRef = useRef(null);

    const [previewFile, setPreviewFile] = useState(null); // { url, name, isPdf }

    const openPreview = (file) => {
        const url = URL.createObjectURL(file);
        setPreviewFile({ url, name: file.name, isPdf: file.type === 'application/pdf' });
    };
    const closePreview = () => {
        if (previewFile) URL.revokeObjectURL(previewFile.url);
        setPreviewFile(null);
    };
    // Active section tab for analysis view
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => { fetchReports(); return () => stopCamera(); }, []);
    useEffect(() => {
        if (showCamera && videoStream && videoRef.current) {
            videoRef.current.srcObject = videoStream;
        }
    }, [showCamera, videoStream]);
    const fetchReports = async () => {
        try {
            const res = await api.get('/reports');
            setReports(res.data.reports || []);
            if (res.data.reports?.length > 0) setSelectedReport(res.data.reports[0]);
        } catch (err) { console.error('Failed to fetch reports', err); }
    };

    const handleFileChange = (e) => {
        const selected = Array.from(e.target.files);
        const valid = selected.filter(f => ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(f.type));
        if (valid.length < selected.length) setError('Only PDF and PNG/JPG images are supported.');
        else setError('');

        const newPrev = valid.map(f => ({
            name: f.name,
            url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null
        }));
        setFiles(prev => [...prev, ...valid]);
        setPreviews(prev => [...prev, ...newPrev]);
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            setVideoStream(stream); setShowCamera(true);
        } catch { setError('Could not access camera.'); }
    };

    const stopCamera = () => {
        videoStream?.getTracks().forEach(t => t.stop());
        setVideoStream(null); setShowCamera(false);
    };

    const capturePhoto = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
        canvas.toBlob(blob => {
            const f = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setFiles(prev => [...prev, f]);
            setPreviews(prev => [...prev, { name: f.name, url: URL.createObjectURL(f) }]);
            stopCamera(); setError('');
        }, 'image/jpeg');
    };

    const removeFile = (i) => {
        if (previews[i]?.url) URL.revokeObjectURL(previews[i].url);
        setFiles(f => f.filter((_, idx) => idx !== i));
        setPreviews(p => p.filter((_, idx) => idx !== i));
    };

    const clearAll = () => {
        previews.forEach(p => p.url && URL.revokeObjectURL(p.url));
        setFiles([]); setPreviews([]); setError('');
    };

    const handleUpload = async (e) => {
        if (e) e.preventDefault();
        if (!files.length) return;
        setLoading(true); setError('');
        try {
            const newReports = [];
            for (const file of files) {
                const fd = new FormData();
                fd.append('file', file);
                const res = await api.post('/analyze-report', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                newReports.push(res.data.report);
            }
            setReports(prev => [...newReports, ...prev]);
            setSelectedReport(newReports[0]);
            clearAll();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to analyze report.');
        } finally { setLoading(false); }
    };

    // ── Destructure selected report data ────────────────────────────────────
    // Guard: extracted_data must be an array (old reports may store a dict/object)
    const rawExtracted = selectedReport?.extracted_data;
    const params = Array.isArray(rawExtracted) ? rawExtracted : [];

    const riskLevel = selectedReport?.risk_level || 'Low';
    const riskC = riskColor(riskLevel);

    // Guard: health_plan must be a plain object (not null, not array, not string)
    const rawHealthPlan = selectedReport?.health_plan;
    const healthPlan = (rawHealthPlan && typeof rawHealthPlan === 'object' && !Array.isArray(rawHealthPlan))
        ? rawHealthPlan : {};

    const riskReasoning = healthPlan?.risk_reasoning || selectedReport?.explanation || '';
    const clinicalSummary = selectedReport?.summary || '';
    const doctorInterpretation = selectedReport?.ai_explanation || '';
    const confidence = typeof selectedReport?.confidence === 'number' ? selectedReport.confidence : parseFloat(selectedReport?.confidence || 0) || 0;
    const department = selectedReport?.recommended_department || 'General Medicine';

    const abnormalParams = params.filter(p => p.status !== 'Normal');
    const normalParams   = params.filter(p => p.status === 'Normal');

    const TABS = [
        { id: 'overview',  label: 'Overview',          icon: <FaShieldAlt /> },
        { id: 'labs',      label: 'Lab Findings',       icon: <FaFlask /> },
        { id: 'interpret', label: "Doctor's Notes",     icon: <FaUserMd /> },
        { id: 'wellness',  label: 'Wellness Plan',      icon: <FaLeaf /> },
    ];

    return (
        <>
        {/* ── File Preview Modal ── */}
        {previewFile && (
            <div onClick={closePreview} style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0,0,0,0.75)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
            }}>
                <div onClick={e => e.stopPropagation()} style={{
                    background: 'white', borderRadius: '16px', overflow: 'hidden',
                    maxWidth: '90vw', maxHeight: '90vh', width: '800px',
                    display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.4)'
                }}>
                    {/* Modal header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.85rem 1.25rem', borderBottom: '1px solid #e2e8f0',
                        background: '#f8fafc'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FaFileMedical style={{ color: '#3b82f6' }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {previewFile.name}
                            </span>
                        </div>
                        <button onClick={closePreview} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#64748b', fontSize: '1.1rem', display: 'flex', alignItems: 'center'
                        }}><FaTimes /></button>
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'auto', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                        {previewFile.isPdf ? (
                            <iframe
                                src={previewFile.url}
                                title={previewFile.name}
                                style={{ width: '100%', height: '75vh', border: 'none' }}
                            />
                        ) : (
                            <img
                                src={previewFile.url}
                                alt={previewFile.name}
                                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
                            />
                        )}
                    </div>
                </div>
            </div>
        )}

        <div className="app-layout" style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #f8fafc 100%)', minHeight: '100vh' }}>
            {/* Navbar */}
            <nav className="navbar" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #e2e8f0' }}>
                <div className="navbar-brand">
                    <Link to="/patient-dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
                        <FaArrowLeft style={{ color: 'white' }} />
                    </Link>
                    <span className="navbar-title">AI Clinical <span>Insight</span></span>
                </div>
                <div className="navbar-right">
                    <div className="navbar-user"><span>{user?.username}</span></div>
                </div>
            </nav>

            <div className="main-body" style={{ padding: '1.5rem 2rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>

                    {/* ── SIDEBAR ──────────────────────────────────────────── */}
                    <div>
                        {/* Upload Card */}
                        <div className="card" style={{ borderRadius: '20px', marginBottom: '1rem', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                            <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <span className="card-title">📤 Upload Report</span>
                            </div>
                            <div className="card-body">
                                {!showCamera ? (
                                    <form onSubmit={handleUpload}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                            <button type="button" className="btn-secondary" onClick={() => document.getElementById('report-up').click()} style={{ fontSize: '0.78rem', padding: '0.55rem' }}>
                                                <FaUpload style={{ marginRight: '0.3rem' }} />File
                                            </button>
                                            <button type="button" className="btn-secondary" onClick={startCamera} style={{ fontSize: '0.78rem', padding: '0.55rem', background: '#475569' }}>
                                                <FaCamera style={{ marginRight: '0.3rem' }} />Scan
                                            </button>
                                        </div>
                                        <input type="file" multiple accept=".pdf,image/*" onChange={handleFileChange} id="report-up" style={{ display: 'none' }} />

                                        {files.length > 0 && (
                                            <div style={{ marginBottom: '0.75rem', maxHeight: '120px', overflowY: 'auto' }}>
                                                {files.map((f, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.5rem', background: '#f1f5f9', borderRadius: '8px', marginBottom: '0.3rem' }}>
                                                        <FaFileMedical style={{ color: '#3b82f6', flexShrink: 0, fontSize: '0.8rem' }} />
                                                        <span style={{ fontSize: '0.72rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                                                        <FaEye onClick={() => openPreview(f)} style={{ color: '#3b82f6', cursor: 'pointer', fontSize: '0.72rem', flexShrink: 0 }} title="View file" />
                                                        <FaTrash onClick={() => removeFile(i)} style={{ color: '#ef4444', cursor: 'pointer', fontSize: '0.68rem' }} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {error && <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.5rem', padding: '0.4rem 0.6rem', background: '#fee2e2', borderRadius: '8px' }}>{error}</div>}

                                        <button type="submit" className="btn-primary" disabled={loading || !files.length} style={{ width: '100%', borderRadius: '12px', fontSize: '0.85rem' }}>
                                            {loading ? '🧠 Analyzing…' : '⚕️ Analyze Report'}
                                        </button>
                                    </form>
                                ) : (
                                    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
                                        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', background: '#000' }} />
                                        <div style={{ position: 'absolute', bottom: '10px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                            <button onClick={capturePhoto} style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', border: 'none', cursor: 'pointer' }} />
                                            <button onClick={stopCamera} style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#ef4444', border: 'none', color: 'white', cursor: 'pointer' }}><FaTimes /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Report History */}
                        <div className="card" style={{ borderRadius: '20px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
                            <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <span className="card-title">📋 Report History</span>
                            </div>
                            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                                {reports.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No reports yet</div>
                                ) : reports.map(r => {
                                    const rc = riskColor(r.risk_level);
                                    return (
                                        <div key={r.id} onClick={() => { setSelectedReport(r); setActiveTab('overview'); }} style={{
                                            padding: '0.85rem 1rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                                            background: selectedReport?.id === r.id ? '#eff6ff' : 'white',
                                            borderLeft: `4px solid ${selectedReport?.id === r.id ? '#2563eb' : 'transparent'}`,
                                            transition: 'background 0.15s'
                                        }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.report_name}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                                                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{new Date(r.created_at).toLocaleDateString()}</span>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: rc.text, background: rc.bg, padding: '0.1rem 0.5rem', borderRadius: '10px' }}>{r.risk_level}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── MAIN ANALYSIS PANEL ──────────────────────────────── */}
                    <div style={{ position: 'relative', minWidth: 0 }}>

                        {/* Loading overlay */}
                        {loading && (
                            <div style={{
                                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.88)',
                                backdropFilter: 'blur(6px)', zIndex: 1000,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '24px'
                            }}>
                                <div style={{
                                    width: '90px', height: '90px', background: '#eff6ff', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', color: '#2563eb',
                                    animation: 'pulse 2s infinite', marginBottom: '1.25rem'
                                }}>
                                    <FaMicroscope />
                                </div>
                                <h3 style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.4rem' }}>AI Clinical Brain at Work…</h3>
                                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Extracting parameters & generating deep insights</p>
                                <style>{`@keyframes pulse{0%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(37,99,235,.4)}70%{transform:scale(1);box-shadow:0 0 0 18px rgba(37,99,235,0)}100%{transform:scale(0.95);box-shadow:0 0 0 0 rgba(37,99,235,0)}}.pulse-anim{animation:pulse 2s infinite}`}</style>
                            </div>
                        )}

                        {selectedReport ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                                {/* ─── Risk Banner ───────────────────────────── */}
                                <div style={{
                                    background: `linear-gradient(135deg, #1d4ed8, #0d9488)`,
                                    borderRadius: '20px', padding: '1.5rem 2rem', color: 'white',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    flexWrap: 'wrap', gap: '1rem'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>AI Clinical Assessment</div>
                                        <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>{selectedReport.report_name}</h2>
                                        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem', opacity: 0.9 }}>
                                            <span>📅 {new Date(selectedReport.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            <span>🏥 {department}</span>
                                            <span>📊 {params.length} parameters detected</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1rem 1.5rem', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                                            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: '0.25rem' }}>RISK LEVEL</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{riskLevel}</div>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1rem 1.5rem', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                                            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: '0.25rem' }}>CONFIDENCE</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{(confidence * 100).toFixed(0)}%</div>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '16px', padding: '1rem 1.5rem', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                                            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: '0.25rem' }}>ABNORMAL</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{abnormalParams.length}/{params.length}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* ─── Risk Reasoning Card ────────────────────── */}
                                {riskReasoning && (
                                    <div style={{
                                        display: 'flex', gap: '1rem', alignItems: 'flex-start',
                                        padding: '1rem 1.25rem', borderRadius: '16px',
                                        background: riskC.bg, border: `1px solid ${riskC.border}`
                                    }}>
                                        <FaBrain style={{ color: riskC.text, fontSize: '1.2rem', flexShrink: 0, marginTop: '0.15rem' }} />
                                        <div>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: riskC.text, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Risk Analysis Reasoning</div>
                                            <p style={{ margin: 0, fontSize: '0.875rem', color: riskC.text, lineHeight: '1.6' }}>{riskReasoning}</p>
                                        </div>
                                    </div>
                                )}

                                {/* ─── Tabs ──────────────────────────────────── */}
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {TABS.map(tab => (
                                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                                            padding: '0.5rem 1.1rem', borderRadius: '30px', border: 'none', cursor: 'pointer',
                                            fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.2s',
                                            background: activeTab === tab.id ? 'linear-gradient(90deg,#2563eb,#0d9488)' : 'white',
                                            color: activeTab === tab.id ? 'white' : '#64748b',
                                            boxShadow: activeTab === tab.id ? '0 4px 12px rgba(37,99,235,0.3)' : '0 1px 4px rgba(0,0,0,0.08)'
                                        }}>
                                            {tab.icon} {tab.label}
                                        </button>
                                    ))}
                                </div>

                                {/* ══════════════ TAB: OVERVIEW ══════════════ */}
                                {activeTab === 'overview' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                                        {/* Quick stats row */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: '1rem' }}>
                                            {[
                                                { label: 'Normal', count: normalParams.length, bg: '#dcfce7', color: '#166534', icon: <FaThumbsUp /> },
                                                { label: 'Abnormal', count: abnormalParams.filter(p => p.status === 'High' || p.status === 'Low').length, bg: '#fee2e2', color: '#991b1b', icon: <FaExclamationTriangle /> },
                                                { label: 'Borderline', count: abnormalParams.filter(p => p.status === 'Borderline').length, bg: '#fef3c7', color: '#92400e', icon: <FaInfoCircle /> },
                                                { label: 'Total Tests', count: params.length, bg: '#eff6ff', color: '#1e40af', icon: <FaChartBar /> },
                                            ].map(s => (
                                                <div key={s.label} style={{ background: s.bg, borderRadius: '16px', padding: '1rem', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '1.5rem', color: s.color, marginBottom: '0.25rem' }}>{s.icon}</div>
                                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color }}>{s.count}</div>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: s.color, textTransform: 'uppercase' }}>{s.label}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Clinical Summary */}
                                        <div className="card" style={{ borderRadius: '20px', overflow: 'hidden' }}>
                                            <div style={{ background: 'linear-gradient(90deg,#2563eb,#0d9488)', padding: '0.85rem 1.5rem' }}>
                                                <div style={{ color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                                                    <FaStethoscope /> Clinical Summary
                                                </div>
                                            </div>
                                            <div className="card-body">
                                                {clinicalSummary ? clinicalSummary.split('\n\n').map((para, i) => (
                                                    <p key={i} style={{ margin: '0 0 1rem', lineHeight: '1.75', color: '#334155', fontSize: '0.9rem' }}>{para}</p>
                                                )) : <p style={{ color: '#94a3b8' }}>No summary available.</p>}
                                            </div>
                                        </div>

                                        {/* Abnormal parameters highlight */}
                                        {abnormalParams.length > 0 && (
                                            <div className="card" style={{ borderRadius: '20px' }}>
                                                <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <FaExclamationCircle style={{ color: '#ef4444' }} /> Parameters Requiring Attention
                                                    </span>
                                                </div>
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                                        <thead>
                                                            <tr style={{ background: '#f8fafc' }}>
                                                                {['Test', 'Value', 'Normal Range', 'Status', 'Category'].map(h => (
                                                                    <th key={h} style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#64748b', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {abnormalParams.map((p, i) => (
                                                                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#1e293b' }}>{p.name}</td>
                                                                    <td style={{ padding: '0.75rem 1rem', color: '#1e293b' }}>{p.value} <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{p.unit}</span></td>
                                                                    <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{p.normal_range} {p.unit}</td>
                                                                    <td style={{ padding: '0.75rem 1rem' }}><StatusBadge status={p.status} /></td>
                                                                    <td style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.78rem' }}>{p.category}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Recommended consultation */}
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'white', borderRadius: '20px', padding: '1.25rem 1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
                                            <div style={{ background: 'linear-gradient(135deg,#0d9488,#0f766e)', padding: '1rem', borderRadius: '14px', color: 'white', fontSize: '1.4rem' }}>
                                                <FaStethoscope />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Recommended Specialist</div>
                                                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0d9488' }}>{department}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.15rem' }}>Based on your detected parameters and their categories</div>
                                            </div>
                                            <Link to="/patient-dashboard" className="btn-primary" style={{ textDecoration: 'none', fontSize: '0.82rem', padding: '0.6rem 1.1rem', borderRadius: '12px' }}>
                                                Book Now
                                            </Link>
                                        </div>
                                    </div>
                                )}

                                {/* ════════════ TAB: LAB FINDINGS ════════════ */}
                                {activeTab === 'labs' && (
                                    <div>
                                        {params.length === 0 ? (
                                            <div className="card" style={{ padding: '3rem', textAlign: 'center', borderRadius: '20px', color: '#94a3b8' }}>
                                                <FaFlask style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }} />
                                                <p>No structured parameters were detected in this report.</p>
                                                <p style={{ fontSize: '0.8rem' }}>This can happen with low-quality scans or handwritten reports.</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {Object.entries(
                                                        params.reduce((acc, p) => {
                                                            acc[p.category] = (acc[p.category] || 0) + 1;
                                                            return acc;
                                                        }, {})
                                                    ).map(([cat, cnt]) => (
                                                        <span key={cat} style={{ padding: '0.2rem 0.75rem', background: '#eff6ff', color: '#2563eb', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                            {cat} ({cnt})
                                                        </span>
                                                    ))}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '1rem' }}>
                                                    {params.map((p, i) => (
                                                        <ParameterCard key={i} param={p} history={reports} />
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ══════════ TAB: DOCTOR'S NOTES ══════════ */}
                                {activeTab === 'interpret' && (
                                    <div className="card" style={{ borderRadius: '20px', overflow: 'hidden' }}>
                                        <div style={{ background: 'linear-gradient(90deg,#1d4ed8,#6366f1)', padding: '1rem 1.5rem' }}>
                                            <div style={{ color: 'white', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <FaUserMd /> AI Doctor's Interpretation
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                                                Detailed clinical explanation of your lab results
                                            </div>
                                        </div>
                                        <div className="card-body" style={{ background: '#fafbff' }}>
                                            {doctorInterpretation ? (
                                                <div style={{ whiteSpace: 'pre-line', lineHeight: '1.85', color: '#334155', fontSize: '0.88rem' }}>
                                                    {doctorInterpretation}
                                                </div>
                                            ) : (
                                                <p style={{ color: '#94a3b8' }}>No interpretation available yet.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ════════ TAB: WELLNESS PLAN ════════════ */}
                                {activeTab === 'wellness' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: '1rem' }}>
                                            {[
                                                { key: 'diet',      icon: <FaAppleAlt />,  label: 'Nutrition & Diet',   bg: '#fdf4ff', color: '#d946ef', border: '#f0abfc' },
                                                { key: 'exercise',  icon: <FaRunning />,   label: 'Exercise Plan',      bg: '#ecfdf5', color: '#10b981', border: '#6ee7b7' },
                                                { key: 'hydration', icon: <FaTint />,      label: 'Hydration',          bg: '#eff6ff', color: '#3b82f6', border: '#93c5fd' },
                                                { key: 'sleep',     icon: <FaBed />,       label: 'Sleep Optimisation', bg: '#fff7ed', color: '#f59e0b', border: '#fcd34d' },
                                                { key: 'stress',    icon: <FaHeartbeat />, label: 'Stress Management',  bg: '#fef2f2', color: '#ef4444', border: '#fca5a5' },
                                            ].map(({ key, icon, label, bg, color, border }) => healthPlan[key] && typeof healthPlan[key] === 'string' && (
                                                <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '18px', padding: '1.25rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                                                        <div style={{ background: color + '22', color, padding: '0.5rem', borderRadius: '10px', fontSize: '1.1rem' }}>{icon}</div>
                                                        <span style={{ fontWeight: 700, color, fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                                                    </div>
                                                    <p style={{ margin: 0, color: '#475569', fontSize: '0.85rem', lineHeight: '1.7' }}>
                                                        {healthPlan[key].split(' • ').map((item, i) => (
                                                            <span key={i}>{i > 0 && <><br />•&nbsp;</>}{item}</span>
                                                        ))}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ════════════ TAB: AI CHATBOT ════════════ */}
                                {/* ─── Medical Disclaimer ──────────────────────── */}
                                <div style={{
                                    padding: '1rem 1.25rem', background: '#f8fafc', borderRadius: '14px',
                                    border: '1px dashed #cbd5e1', display: 'flex', gap: '0.75rem', alignItems: 'flex-start'
                                }}>
                                    <FaExclamationTriangle style={{ color: '#f59e0b', fontSize: '1rem', flexShrink: 0, marginTop: '0.1rem' }} />
                                    <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: '1.6' }}>
                                        <strong>Medical Disclaimer:</strong> This AI clinical assistant provides educational insights only and does not replace professional medical consultation. The analysis is based on extracted OCR data and may not be 100% accurate. Always consult a qualified healthcare provider for clinical diagnosis, treatment decisions, and interpretation of your results.
                                    </p>
                                </div>

                            </div>
                        ) : (
                            /* Empty state */
                            <div className="card" style={{ height: '560px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRadius: '24px' }}>
                                <div style={{ maxWidth: '380px' }}>
                                    <div style={{ width: '110px', height: '110px', background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', fontSize: '3rem', color: '#3b82f6' }}>
                                        <FaMicroscope />
                                    </div>
                                    <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.75rem' }}>AI Clinical Insight Ready</h2>
                                    <p style={{ color: '#64748b', lineHeight: '1.7', marginBottom: '1.5rem' }}>
                                        Upload a medical report (PDF or image) to receive deep AI-powered analysis — including lab parameter interpretation, risk assessment, and personalised wellness recommendations.
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                        {['CBC', 'Metabolic Panel', 'Lipid Panel', 'Thyroid', 'Kidney Function'].map(t => (
                                            <span key={t} style={{ padding: '0.25rem 0.75rem', background: '#eff6ff', color: '#2563eb', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600 }}>{t}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        </>
    );
};

export default function ReportAnalysisPage() {
    return (
        <ErrorBoundary>
            <ReportAnalysis />
        </ErrorBoundary>
    );
}
