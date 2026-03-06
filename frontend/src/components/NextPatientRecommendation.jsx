import React from 'react';
import { FaBrain, FaExclamationTriangle, FaClock, FaStar, FaBuilding, FaNotesMedical } from 'react-icons/fa';

/**
 * NextPatientRecommendation
 *
 * Props:
 *  recommendation  - Object returned by GET /api/doctor/next-patient, or null
 *  loading         - bool: show skeleton while fetching
 *  multipleHighRisk - bool: show "Multiple critical patients detected" banner
 *  onSelect        - (patient) => void  — opens the AI Explanation Panel
 */
const RISK_STYLES = {
    High:   { bg: '#fff1f2', border: '#fca5a5', badge: '#ef4444', text: '#991b1b' },
    Medium: { bg: '#fffbeb', border: '#fcd34d', badge: '#f59e0b', text: '#92400e' },
    Low:    { bg: '#f0fdf4', border: '#86efac', badge: '#22c55e', text: '#14532d' },
};

const NextPatientRecommendation = ({ recommendation, loading, multipleHighRisk, onSelect }) => {
    /* ── Empty queue ─────────────────────────────────────────────── */
    if (!loading && !recommendation) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#f8fafc', border: '1.5px dashed #cbd5e1',
                borderRadius: 14, padding: '16px 20px', marginBottom: '1.5rem',
            }}>
                <FaBrain style={{ fontSize: '1.5rem', color: '#94a3b8', flexShrink: 0 }} />
                <div>
                    <p style={{ fontWeight: 700, color: '#475569', margin: 0 }}>AI Recommended Next Patient</p>
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 2 }}>No patients currently waiting.</p>
                </div>
            </div>
        );
    }

    /* ── Loading skeleton ────────────────────────────────────────── */
    if (loading) {
        return (
            <div style={{
                background: '#f1f5f9', border: '1.5px solid #e2e8f0',
                borderRadius: 14, padding: '18px 22px', marginBottom: '1.5rem',
                animation: 'pulse 1.5s ease-in-out infinite',
            }}>
                <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
                <div style={{ height: 14, width: '35%', background: '#cbd5e1', borderRadius: 6, marginBottom: 10 }} />
                <div style={{ height: 20, width: '60%', background: '#cbd5e1', borderRadius: 6, marginBottom: 8 }} />
                <div style={{ height: 12, width: '80%', background: '#e2e8f0', borderRadius: 6 }} />
            </div>
        );
    }

    const { risk_level = 'Low' } = recommendation;
    const styles = RISK_STYLES[risk_level] || RISK_STYLES.Low;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect && onSelect(recommendation)}
            onKeyDown={e => e.key === 'Enter' && onSelect && onSelect(recommendation)}
            style={{
                background: styles.bg,
                border: `2px solid ${styles.border}`,
                borderRadius: 16,
                padding: '18px 22px',
                marginBottom: '1.5rem',
                cursor: 'pointer',
                transition: 'box-shadow 0.18s, transform 0.18s',
                boxShadow: '0 2px 12px rgba(59,130,246,0.09)',
                outline: 'none',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 6px 24px rgba(59,130,246,0.18)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(59,130,246,0.09)';
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                    background: 'linear-gradient(135deg,#2563eb,#4f46e5)',
                    borderRadius: 10, width: 36, height: 36,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                    <FaBrain style={{ color: '#fff', fontSize: '1rem' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 800, color: '#1e293b', fontSize: '0.95rem', letterSpacing: '0.01em' }}>
                        AI Recommended Next Patient
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                        Highest priority based on risk · waiting time · symptoms
                    </p>
                </div>

                {/* Priority score badge */}
                <div style={{
                    background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
                    color: '#fff', borderRadius: 10,
                    padding: '5px 12px', textAlign: 'center', flexShrink: 0,
                }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', opacity: 0.85 }}>PRIORITY</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.1 }}>
                        {recommendation.priority_score ?? '—'}
                    </div>
                </div>
            </div>

            {/* Multiple critical patients warning */}
            {multipleHighRisk && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: 8, padding: '6px 12px', marginBottom: 12,
                }}>
                    <FaExclamationTriangle style={{ color: '#ef4444', fontSize: '0.8rem', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#b91c1c' }}>
                        Multiple critical patients detected. Prioritise by score.
                    </span>
                </div>
            )}

            {/* Patient detail grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '10px 20px',
            }}>
                <InfoChip icon={<FaStar style={{ color: '#2563eb' }} />} label="Patient ID" value={recommendation.patient_id} />
                <InfoChip
                    icon={<FaExclamationTriangle style={{ color: styles.badge }} />}
                    label="Risk Level"
                    value={
                        <span style={{
                            background: styles.badge, color: '#fff',
                            fontSize: '0.75rem', fontWeight: 700,
                            padding: '2px 10px', borderRadius: 20,
                        }}>
                            {risk_level}
                        </span>
                    }
                />
                <InfoChip icon={<FaBuilding style={{ color: '#0891b2' }} />} label="Department" value={recommendation.department} />
                <InfoChip icon={<FaClock style={{ color: '#d97706' }} />} label="Waiting" value={`${recommendation.waiting_time ?? 0} min`} />
                <InfoChip
                    icon={<FaNotesMedical style={{ color: '#7c3aed' }} />}
                    label="Symptoms"
                    value={recommendation.symptoms}
                    wide
                />
            </div>

            <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: '#64748b', textAlign: 'right' }}>
                Click to view full AI explanation →
            </p>
        </div>
    );
};

/* Small label+value chip */
const InfoChip = ({ icon, label, value, wide }) => (
    <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: '0.72rem' }}>{icon}</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
            </span>
        </div>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.35 }}>
            {value ?? '—'}
        </div>
    </div>
);

export default NextPatientRecommendation;
