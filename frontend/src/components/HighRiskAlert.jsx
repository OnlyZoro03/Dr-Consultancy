/**
 * HighRiskAlert.jsx
 *
 * Floating alert banner shown when a new HIGH RISK patient is detected
 * via the real-time "new_patient_triage" socket event.
 *
 * Props:
 *  alerts   – array of triage payload objects to display
 *  onDismiss(id) – callback to remove a specific alert by patient id
 */
import React, { useEffect, useRef } from 'react';
import { FaExclamationTriangle, FaTimes, FaHospital, FaBell } from 'react-icons/fa';

// ── Web-Audio beep (no audio file required) ───────────────────────────────
const playAlertBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beepTone = (freq, start, duration) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };
    // Two short ascending beeps
    beepTone(880, 0,    0.18);
    beepTone(1100, 0.22, 0.18);
  } catch {
    // AudioContext may be unavailable (e.g. no user gesture yet) — silent fallback
  }
};

// ── Individual alert card ─────────────────────────────────────────────────
const AlertCard = ({ alert, onDismiss }) => {
  const timerRef = useRef(null);

  // Auto-dismiss after 12 seconds
  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(alert._alertId), 12000);
    return () => clearTimeout(timerRef.current);
  }, [alert._alertId, onDismiss]);

  const conf = alert.confidence != null
    ? `${Math.round(alert.confidence * 100)}%`
    : null;

  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
      borderRadius: 12,
      padding: '0.9rem 1.1rem 0.9rem 0.95rem',
      boxShadow: '0 8px 32px rgba(220,38,38,0.45)',
      color: '#fff',
      animation: 'alertSlideIn 0.3s cubic-bezier(0.16,1,0.3,1), alertFlash 1s ease-in-out 3',
      border: '1.5px solid rgba(255,255,255,0.18)',
      minWidth: 0,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Icon */}
        <span style={{
          fontSize: '1.3rem', flexShrink: 0, marginTop: 1,
          filter: 'drop-shadow(0 0 4px rgba(255,255,100,0.8))',
          animation: 'iconPulse 0.8s ease-in-out infinite alternate',
        }}>
          ⚠️
        </span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.01em', marginBottom: 3 }}>
            HIGH RISK PATIENT DETECTED
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', opacity: 0.92, marginBottom: 6, wordBreak: 'break-word' }}>
            {alert.name || alert.patient_id}
          </div>

          {/* Tags row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Tag icon={<FaHospital />} text={alert.department} />
            {alert.symptoms && <Tag text={`${alert.symptoms.slice(0, 40)}${alert.symptoms.length > 40 ? '…' : ''}`} />}
            {conf && <Tag text={`Confidence: ${conf}`} muted />}
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={() => onDismiss(alert._alertId)}
          title="Dismiss alert"
          style={{
            background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 7,
            width: 26, height: 26, cursor: 'pointer', color: '#fff', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.32)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
        >
          <FaTimes />
        </button>
      </div>

      {/* Progress bar: auto-dismiss countdown */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        borderRadius: '0 0 12px 12px', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', background: 'rgba(255,255,255,0.55)',
          animation: 'countdownBar 12s linear forwards',
        }}/>
      </div>
    </div>
  );
};

const Tag = ({ icon, text, muted }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: muted ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)',
    borderRadius: 6, padding: '2px 8px', fontSize: '0.74rem', fontWeight: 600,
  }}>
    {icon && <span style={{ opacity: 0.85, fontSize: '0.7rem' }}>{icon}</span>}
    {text}
  </span>
);

// ── Container ─────────────────────────────────────────────────────────────
const HighRiskAlert = ({ alerts, onDismiss }) => {
  if (!alerts || alerts.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes alertSlideIn {
          from { opacity: 0; transform: translateX(120px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes alertFlash {
          0%,100% { box-shadow: 0 8px 32px rgba(220,38,38,0.45); }
          50%      { box-shadow: 0 8px 48px rgba(255,80,80,0.85), 0 0 0 6px rgba(220,38,38,0.25); }
        }
        @keyframes iconPulse {
          from { transform: scale(1);   opacity: 1; }
          to   { transform: scale(1.2); opacity: 0.75; }
        }
        @keyframes countdownBar {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      {/* Stack (max 4 visible) */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
        display: 'flex', flexDirection: 'column-reverse', gap: 10,
        width: 340, maxWidth: 'calc(100vw - 32px)',
        pointerEvents: 'auto',
      }}>
        {alerts.slice(-4).map(a => (
          <AlertCard key={a._alertId} alert={a} onDismiss={onDismiss} />
        ))}

        {/* Badge if more than 4 are queued */}
        {alerts.length > 4 && (
          <div style={{
            background: '#7f1d1d', color: '#fca5a5', borderRadius: 8,
            padding: '0.45rem 0.9rem', fontSize: '0.78rem', fontWeight: 700,
            textAlign: 'center',
          }}>
            +{alerts.length - 4} more high-risk alerts
          </div>
        )}
      </div>
    </>
  );
};

export { playAlertBeep };
export default HighRiskAlert;
