import React from 'react';
import {
  FaTimes, FaBrain, FaHeartbeat, FaUserMd,
  FaExclamationTriangle, FaCheckCircle, FaThermometerHalf,
} from 'react-icons/fa';

const RISK = {
  High:   { bg:'#fef2f2', border:'#fecaca', text:'#dc2626', dot:'#ef4444', badge:'#fee2e2' },
  Medium: { bg:'#fffbeb', border:'#fde68a', text:'#d97706', dot:'#f59e0b', badge:'#fef3c7' },
  Low:    { bg:'#f0fdf4', border:'#bbf7d0', text:'#16a34a', dot:'#22c55e', badge:'#dcfce7' },
};

const SectionCard = ({ icon, title, children }) => (
  <div style={{
    background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
    padding: '1rem 1.1rem', marginBottom: '0.75rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:'0.75rem' }}>
      <span style={{ color:'#4f46e5', fontSize:'1rem', lineHeight:1 }}>{icon}</span>
      <span style={{
        fontWeight:700, color:'#1e293b', fontSize:'0.78rem',
        textTransform:'uppercase', letterSpacing:'0.07em',
      }}>{title}</span>
    </div>
    {children}
  </div>
);

const Row = ({ label, value, highlight }) => (
  <div style={{
    display:'flex', justifyContent:'space-between', alignItems:'flex-start',
    padding:'0.45rem 0', borderBottom:'1px solid #f1f5f9',
  }}>
    <span style={{ color:'#64748b', fontSize:'0.83rem', fontWeight:500, flexShrink:0, paddingRight:12 }}>{label}</span>
    <span style={{
      color: highlight ? '#1d4ed8' : '#1e293b',
      fontSize:'0.83rem', fontWeight:600, textAlign:'right',
    }}>{value || '—'}</span>
  </div>
);

const ConfidenceBar = ({ value }) => {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 85 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#22c55e';
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
        <span style={{ fontSize:'0.8rem', color:'#64748b', fontWeight:500 }}>Confidence</span>
        <span style={{ fontSize:'0.8rem', fontWeight:700, color }}>{pct}%</span>
      </div>
      <div style={{ height:7, background:'#e2e8f0', borderRadius:99, overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${pct}%`, background: color,
          borderRadius:99, transition:'width 0.6s ease',
        }}/>
      </div>
    </div>
  );
};

const PatientExplanationPanel = ({ patient, onClose }) => {
  if (!patient) return null;

  const rc = RISK[patient.risk_level] || RISK.Low;
  const ai = patient.ai_explanation || {};
  const vitals = patient.vitals_structured || {};
  const conf = patient.confidence;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:'fixed', inset:0, background:'rgba(15,23,42,0.4)',
          zIndex:9998, backdropFilter:'blur(2px)',
        }}
      />

      {/* Sliding Panel */}
      <div style={{
        position:'fixed', top:0, right:0, height:'100vh', width:430,
        background:'#f8fafc', zIndex:9999, overflowY:'auto',
        boxShadow:'-8px 0 48px rgba(0,0,0,0.18)',
        display:'flex', flexDirection:'column',
        animation:'panelSlideIn 0.28s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <style>{`
          @keyframes panelSlideIn {
            from { transform: translateX(100%); opacity: 0.4; }
            to   { transform: translateX(0);    opacity: 1;   }
          }
        `}</style>

        {/* ─── Header ─── */}
        <div style={{
          background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
          padding:'1.1rem 1.25rem', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:'1rem', display:'flex', alignItems:'center', gap:7 }}>
              🧠 AI Triage Explanation
            </div>
            <div style={{ color:'rgba(255,255,255,0.72)', fontSize:'0.8rem', marginTop:3 }}>
              {patient.name} · {patient.department}
            </div>
          </div>
          <button onClick={onClose} style={{
            background:'rgba(255,255,255,0.18)', border:'none', borderRadius:8,
            width:32, height:32, cursor:'pointer', color:'#fff', fontSize:14,
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.3)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.18)'}
          ><FaTimes /></button>
        </div>

        {/* ─── Body ─── */}
        <div style={{ padding:'1rem 1rem 2rem', overflowY:'auto', flex:1 }}>

          {/* Risk Banner */}
          <div style={{
            background:rc.bg, border:`1.5px solid ${rc.border}`, borderRadius:10,
            padding:'0.75rem 1rem', marginBottom:'0.85rem',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:9 }}>
              <span style={{ width:10, height:10, borderRadius:'50%', background:rc.dot, display:'inline-block', flexShrink:0 }}/>
              <span style={{ fontWeight:700, color:rc.text, fontSize:'0.95rem' }}>{patient.risk_level} Risk</span>
            </div>
            {conf != null && (
              <span style={{
                background:rc.badge, color:rc.text, fontSize:'0.76rem',
                fontWeight:700, padding:'3px 11px', borderRadius:20,
              }}>
                {Math.round(conf * 100)}% Confidence
              </span>
            )}
          </div>

          {/* Patient Information */}
          <SectionCard icon={<FaUserMd />} title="Patient Information">
            <Row label="Name"   value={patient.name} />
            <Row label="Age"    value={patient.age ? `${patient.age} years` : null} />
            <Row label="Gender" value={patient.gender} />
            <Row
              label="Pre-existing Conditions"
              value={patient.pre_existing_conditions || 'None reported'}
            />
          </SectionCard>

          {/* Vitals */}
          <SectionCard icon={<FaHeartbeat />} title="Vitals">
            <Row label="Blood Pressure" value={vitals.bp || patient.vitals_raw || '—'} highlight />
            <Row label="Heart Rate"     value={vitals.heart_rate ? `${vitals.heart_rate} bpm` : null} highlight />
            <Row label="Temperature"    value={vitals.temperature ? `${vitals.temperature} °F` : null} />
            <Row label="SpO₂"           value={vitals.spo2 ? `${vitals.spo2}%` : null} />
          </SectionCard>

          {/* AI Reasoning */}
          <SectionCard icon={<FaBrain />} title="AI Reasoning">
            {ai.possible_concern && (
              <div style={{ marginBottom:'0.8rem' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>
                  Possible Concern
                </div>
                <div style={{
                  background:'#eff6ff', borderRadius:8, padding:'0.6rem 0.85rem',
                  color:'#1e40af', fontSize:'0.88rem', fontWeight:600,
                  border:'1px solid #bfdbfe',
                }}>
                  {ai.possible_concern}
                </div>
              </div>
            )}

            {ai.factors?.length > 0 && (
              <div style={{ marginBottom:'0.8rem' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>
                  Contributing Factors
                </div>
                <ul style={{ margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:5 }}>
                  {ai.factors.map((f, i) => (
                    <li key={i} style={{
                      display:'flex', alignItems:'flex-start', gap:8,
                      fontSize:'0.85rem', color:'#374151', lineHeight:1.45,
                    }}>
                      <span style={{ color:'#f59e0b', fontWeight:700, marginTop:2, flexShrink:0 }}>▶</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop:'0.5rem' }}>
              {conf != null && <ConfidenceBar value={conf} />}
            </div>

            <div style={{ marginTop:'0.6rem' }}>
              <Row label="Recommended Department" value={patient.department} highlight />
            </div>
          </SectionCard>

          {/* Immediate Advice */}
          {ai.advice && (
            <SectionCard icon={<FaCheckCircle />} title="Immediate Advice">
              <div style={{
                background:'#f0fdf4', borderRadius:8, padding:'0.75rem 0.9rem',
                color:'#166534', fontSize:'0.88rem', lineHeight:1.55,
                border:'1px solid #bbf7d0',
              }}>
                {ai.advice}
              </div>
            </SectionCard>
          )}

          {/* Reported Symptoms */}
          {patient.symptoms && (
            <SectionCard icon={<FaExclamationTriangle />} title="Reported Symptoms">
              <div style={{ color:'#374151', fontSize:'0.88rem', lineHeight:1.6 }}>
                {patient.symptoms}
              </div>
            </SectionCard>
          )}

        </div>
      </div>
    </>
  );
};

export default PatientExplanationPanel;
