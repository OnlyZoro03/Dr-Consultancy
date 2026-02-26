/**
 * VoiceTriageAssistant.jsx
 *
 * Production-level multilingual Voice Symptom Input system.
 * Supports English + Telugu via Web Speech API + backend Gemini AI.
 *
 * Features:
 *  • Real-time speech recognition with live transcript
 *  • Auto language detection (navigator.language)
 *  • Red glowing mic button + wave animation while recording
 *  • Telugu → English clinical translation via backend
 *  • Risk badge (Green / Yellow / Red / Critical)
 *  • Emergency alert banner for high-risk results
 *  • Structured AI response: concern, factors, department card, advice
 *  • Vitals input panel (optional, before submission)
 *  • Stop / Reset flow
 *  • Full loading animation
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────
const RISK_CONFIG = {
  low:      { label: 'Low Risk',               bg: '#f0fdf4', border: '#86efac', text: '#15803d', barColor: '#22c55e', icon: '✅' },
  medium:   { label: 'Moderate Risk',          bg: '#fffbeb', border: '#fcd34d', text: '#b45309', barColor: '#f59e0b', icon: '⚠️' },
  high:     { label: 'High Risk',              bg: '#fff7ed', border: '#fb923c', text: '#c2410c', barColor: '#f97316', icon: '🔴' },
  critical: { label: 'Critical — See Doctor',  bg: '#fef2f2', border: '#f87171', text: '#b91c1c', barColor: '#ef4444', icon: '🚨' },
};

const DEPT_ICONS = {
  'Cardiology': '❤️', 'Neurology': '🧠', 'Pulmonology': '🫁',
  'Gastroenterology': '🩺', 'Orthopedics': '🦴', 'Dermatology': '🩹',
  'Urology': '💧', 'Ophthalmology': '👁️', 'ENT': '👂',
  'Psychiatry': '🧘', 'General Medicine': '🏥', 'Emergency': '🚨',
  'Emergency / Cardiology': '🚨', 'Emergency / Neurology': '🚨',
  'Emergency / Pulmonology': '🚨',
};

// ─── Wave Animation Bars ─────────────────────────────────────────────────────
const WaveBar = ({ delay }) => (
  <span style={{
    display: 'inline-block', width: 4, borderRadius: 3,
    background: '#ef4444', margin: '0 2px',
    animation: 'voiceWave 0.8s ease-in-out infinite',
    animationDelay: delay,
  }} />
);

// ─── Parse AI structured response string ────────────────────────────────────
function parseAIResponse(text) {
  if (!text) return {};
  const extract = (label) => {
    const re = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z]|$)`, 'is');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  return {
    riskLevel:          extract('Risk Level'),
    possibleConcern:    extract('Possible Concern'),
    contributingFactors:extract('Contributing Factors'),
    department:         extract('Recommended Department'),
    urgency:            extract('Urgency Level'),
    immediateAdvice:    extract('Immediate Advice'),
    confidence:         extract('Confidence Score'),
    disclaimer:         extract('Disclaimer'),
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function VoiceTriageAssistant() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  // UI state
  const [open, setOpen]               = useState(false);
  const [pulse, setPulse]             = useState(true);
  const [tab, setTab]                 = useState('record'); // 'record' | 'vitals'

  // Voice state
  const [recording, setRecording]     = useState(false);
  const [transcript, setTranscript]   = useState('');
  const [interimText, setInterimText] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);

  // Vitals form
  const [vitals, setVitals] = useState({ systolic_bp: '', diastolic_bp: '', heart_rate: '', spo2: '' });

  // Result state
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState('');

  // Refs
  const recognitionRef  = useRef(null);
  const resultScrollRef = useRef(null);

  // ─── Hooks ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) setPulse(false);
  }, [open]);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setSpeechSupported(false);
    }
  }, []);

  useEffect(() => {
    if (result) resultScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [result]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // Detect language from browser
  const getBrowserLang = useCallback(() => {
    const lang = navigator.language || navigator.userLanguage || 'en-US';
    setDetectedLang(lang);
    return lang;
  }, []);

  // ─── Speech Recognition ──────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!speechSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    const lang = getBrowserLang();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecording(true);
      setError('');
    };

    recognition.onresult = (e) => {
      let final = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += txt + ' ';
        else interim += txt;
      }
      if (final) setTranscript(prev => prev + final);
      setInterimText(interim);
    };

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') setError(`Microphone error: ${e.error}`);
      setRecording(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setRecording(false);
      setInterimText('');
    };

    recognition.start();
  }, [speechSupported, getBrowserLang]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setRecording(false);
    setInterimText('');
  }, []);

  const resetAll = useCallback(() => {
    recognitionRef.current?.abort();
    setRecording(false);
    setTranscript('');
    setInterimText('');
    setResult(null);
    setError('');
    setTab('record');
    setVitals({ systolic_bp: '', diastolic_bp: '', heart_rate: '', spo2: '' });
  }, []);

  // ─── Submit for triage ───────────────────────────────────────────────────
  const submitTriage = useCallback(async () => {
    if (!transcript.trim()) {
      setError('Please record your symptoms first before submitting.');
      return;
    }
    stopRecording();
    setLoading(true);
    setResult(null);
    setError('');

    // Clean vitals — only send non-empty numeric values
    const cleanVitals = {};
    for (const [k, v] of Object.entries(vitals)) {
      const num = parseFloat(v);
      if (!isNaN(num)) cleanVitals[k] = num;
    }

    try {
      const res = await api.post('/voice-triage', {
        transcript: transcript.trim(),
        lang: detectedLang || navigator.language || 'en-US',
        vitals: cleanVitals,
      });
      setResult(res.data);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Unable to reach triage service. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [transcript, vitals, detectedLang, stopRecording]);

  // ─── Guards ───────────────────────────────────────────────────────────────
  if (!user || ['/login', '/register'].includes(pathname)) return null;

  const parsed   = result ? parseAIResponse(result.ai_response) : null;
  const riskKey  = (result?.risk_level || 'low').toLowerCase();
  const rc       = RISK_CONFIG[riskKey] || RISK_CONFIG.low;
  const deptIcon = DEPT_ICONS[result?.department] || '🏥';
  const isEmergency = result?.emergency;

  const fullTranscript = transcript + (interimText ? interimText : '');
  const isTeluguLang   = detectedLang && (detectedLang.toLowerCase().includes('te'));

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes voicePulse {
          0%,100% { box-shadow: 0 4px 20px rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 4px 36px rgba(239,68,68,0.9), 0 0 0 10px rgba(239,68,68,0.12); }
        }
        @keyframes voiceWave {
          0%,100% { height: 8px; }
          50%      { height: 22px; }
        }
        @keyframes vtSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes vtSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes vtFadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes emergencyFlash {
          0%,100% { background: #fef2f2; }
          50%      { background: #fee2e2; }
        }
        .vt-tab-active  { background: linear-gradient(135deg,#4f46e5,#7c3aed)!important; color:#fff!important; }
        .vt-vital-input { border:1.5px solid #e2e8f0; border-radius:10px; padding:8px 11px; font-size:13px;
                          width:100%; box-sizing:border-box; background:#f8fafc; color:#1e293b;
                          font-family:inherit; outline:none; transition:border 0.2s; }
        .vt-vital-input:focus { border-color:#4f46e5; }
      `}</style>

      {/* ── Floating Mic Button ──────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Voice Symptom Triage"
        style={{
          position: 'fixed', bottom: 28, left: 28, zIndex: 9998,
          width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#ef4444,#dc2626)',
          boxShadow: '0 4px 18px rgba(239,68,68,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: '#fff',
          animation: pulse ? 'voicePulse 2.2s infinite' : 'none',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.12)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? '✕' : '🎙️'}
      </button>

      {/* ── Main Panel ──────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, left: 28, zIndex: 9997,
          width: 420, maxHeight: 680, borderRadius: 20,
          background: '#ffffff', border: '1px solid #e2e8f0',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'vtSlideUp 0.25s ease',
        }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg,#ef4444,#dc2626)',
            padding: '14px 18px', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>🎙️</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Voice Symptom Triage</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5 }}>
                <span style={{
                  display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: '#4ade80', marginRight: 5, verticalAlign: 'middle',
                }} />
                AI-Powered · EN + తెలుగు supported
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={resetAll} title="Reset" style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}>↺ Reset</button>
              <button onClick={() => setOpen(false)} style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex', padding: '10px 12px', gap: 8,
            borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0,
          }}>
            {[
              { id: 'record', label: '🎙️ Symptoms' },
              { id: 'vitals', label: '📊 Vitals (optional)' },
            ].map(t => (
              <button key={t.id}
                onClick={() => setTab(t.id)}
                className={tab === t.id ? 'vt-tab-active' : ''}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 10, border: '1.5px solid #e2e8f0',
                  background: '#f8fafc', color: '#475569', cursor: 'pointer',
                  fontWeight: 600, fontSize: 12.5, fontFamily: 'inherit', transition: 'all 0.15s',
                }}
              >{t.label}</button>
            ))}
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px' }}>

            {/* ── TAB: Record ────────────────────────────────────────── */}
            {tab === 'record' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Mic control */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  background: recording ? '#fef2f2' : '#f8fafc',
                  borderRadius: 16, padding: '20px 16px', border: '1.5px solid',
                  borderColor: recording ? '#fca5a5' : '#e2e8f0',
                  transition: 'all 0.3s',
                }}>
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    disabled={!speechSupported}
                    style={{
                      width: 70, height: 70, borderRadius: '50%', border: 'none',
                      background: recording
                        ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                        : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                      color: '#fff', fontSize: 28, cursor: speechSupported ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: recording ? '0 4px 32px rgba(239,68,68,0.6)' : '0 4px 16px rgba(79,70,229,0.4)',
                      animation: recording ? 'voicePulse 1.5s infinite' : 'none',
                      transition: 'all 0.2s', opacity: speechSupported ? 1 : 0.5,
                    }}
                  >
                    {recording ? '⏹' : '🎙️'}
                  </button>

                  {/* Wave animation bars */}
                  {recording && (
                    <div style={{ display: 'flex', alignItems: 'center', height: 30 }}>
                      {['0s','0.1s','0.2s','0.3s','0.4s','0.5s','0.6s'].map((d, i) => (
                        <WaveBar key={i} delay={d} />
                      ))}
                    </div>
                  )}

                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      fontWeight: 700, fontSize: 13.5,
                      color: recording ? '#ef4444' : '#4f46e5',
                    }}>
                      {!speechSupported
                        ? 'Speech Recognition Not Supported'
                        : recording
                        ? '🔴 Listening… Speak your symptoms'
                        : transcript
                        ? '✅ Recording complete — tap mic to add more'
                        : 'Tap the mic and describe your symptoms'}
                    </div>
                    {detectedLang && (
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                        Detected language: <strong>{detectedLang}</strong>
                        {isTeluguLang && (
                          <span style={{
                            marginLeft: 8, background: '#ede9fe', color: '#7c3aed',
                            borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700,
                          }}>Telugu → EN auto-translation ON</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Live transcript */}
                {(transcript || interimText) && (
                  <div style={{
                    background: '#f8fafc', borderRadius: 12, padding: '12px 14px',
                    border: '1.5px solid #e2e8f0',
                  }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 800, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7,
                    }}>📝 Live Transcript</div>
                    <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.6 }}>
                      {transcript}
                      {interimText && (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{interimText}</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div style={{
                    background: '#fef2f2', border: '1.5px solid #fca5a5',
                    borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#b91c1c',
                  }}>⚠️ {error}</div>
                )}

                {/* Submit button */}
                {transcript && !loading && !result && (
                  <button onClick={submitTriage} style={{
                    width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
                    background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                    color: '#fff', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', letterSpacing: '0.02em',
                    boxShadow: '0 4px 16px rgba(239,68,68,0.35)',
                    transition: 'opacity 0.2s', fontFamily: 'inherit',
                  }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    🩺 Analyse Symptoms
                  </button>
                )}

                {/* Loading */}
                {loading && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 14, padding: '20px 0',
                  }}>
                    <span style={{
                      width: 42, height: 42, border: '4px solid #fca5a5',
                      borderTopColor: '#ef4444', borderRadius: '50%',
                      animation: 'vtSpin 0.8s linear infinite', display: 'block',
                    }} />
                    <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textAlign: 'center' }}>
                      Analysing symptoms with AI…<br />
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
                        Running triage pipeline • Extracting symptoms • Checking risk rules
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: Vitals ────────────────────────────────────────── */}
            {tab === 'vitals' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
                  padding: '10px 13px', fontSize: 12, color: '#075985',
                }}>
                  Vitals are <strong>optional</strong>. When provided, they improve risk accuracy.
                </div>
                {[
                  { key: 'systolic_bp',  label: 'Systolic BP',   unit: 'mmHg', placeholder: 'e.g. 120' },
                  { key: 'diastolic_bp', label: 'Diastolic BP',  unit: 'mmHg', placeholder: 'e.g. 80' },
                  { key: 'heart_rate',   label: 'Heart Rate',    unit: 'bpm',  placeholder: 'e.g. 72' },
                  { key: 'spo2',         label: 'SpO2',          unit: '%',    placeholder: 'e.g. 98' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>
                      {f.label} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({f.unit})</span>
                    </label>
                    <input
                      type="number"
                      className="vt-vital-input"
                      placeholder={f.placeholder}
                      value={vitals[f.key]}
                      onChange={e => setVitals(v => ({ ...v, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ── RESULT ─────────────────────────────────────────────── */}
            {result && (
              <div ref={resultScrollRef} style={{
                marginTop: tab !== 'record' ? 0 : 4,
                display: 'flex', flexDirection: 'column', gap: 12,
                animation: 'vtFadeIn 0.35s ease',
              }}>

                {/* Emergency Alert Banner */}
                {isEmergency && (
                  <div style={{
                    borderRadius: 12, padding: '12px 14px', textAlign: 'center',
                    border: '2px solid #ef4444', fontWeight: 700, fontSize: 13,
                    color: '#b91c1c', animation: 'emergencyFlash 1.5s infinite',
                    display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 22 }}>🚨</span>
                    <div>
                      <div>EMERGENCY — Seek Immediate Medical Attention</div>
                      <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>
                        Call 108 / Go to nearest Emergency Room now
                      </div>
                    </div>
                  </div>
                )}

                {/* Risk Badge */}
                <div style={{
                  background: rc.bg, border: `1.5px solid ${rc.border}`,
                  borderRadius: 14, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ fontSize: 28 }}>{rc.icon}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: rc.text }}>{rc.label}</div>
                    <div style={{ fontSize: 11.5, color: rc.text, opacity: 0.8, marginTop: 2 }}>
                      Confidence: {result.confidence || parsed?.confidence || 'N/A'}
                    </div>
                  </div>
                  {result.translated && (
                    <span style={{
                      marginLeft: 'auto', background: '#ede9fe', color: '#7c3aed',
                      borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700,
                    }}>🌐 Translated</span>
                  )}
                </div>

                {/* Translated transcript note */}
                {result.translated && result.clean_transcript && (
                  <div style={{
                    background: '#f5f3ff', border: '1px solid #ddd6fe',
                    borderRadius: 10, padding: '10px 13px',
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      🌐 Telugu → English Translation
                    </div>
                    <div style={{ fontSize: 12.5, color: '#4c1d95', lineHeight: 1.5 }}>
                      {result.clean_transcript}
                    </div>
                  </div>
                )}

                {/* Possible Concern */}
                {parsed?.possibleConcern && (
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: '11px 13px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                      🩺 Clinical Impression
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', lineHeight: 1.45 }}>
                      {parsed.possibleConcern}
                    </div>
                  </div>
                )}

                {/* Extracted Symptoms */}
                {result.extracted_data && (
                  (() => {
                    const syms = [
                      ...(result.extracted_data.primary_symptoms || []),
                      ...(result.extracted_data.secondary_symptoms || []),
                    ];
                    return syms.length > 0 ? (
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                          📋 Extracted Symptoms
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {syms.map((s, i) => (
                            <span key={i} style={{
                              background: '#ede9fe', color: '#4f46e5', borderRadius: 20,
                              padding: '4px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #c4b5fd',
                            }}>{s}</span>
                          ))}
                        </div>
                        {result.extracted_data.duration && (
                          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6 }}>
                            ⏱ Duration: <strong>{result.extracted_data.duration}</strong>
                            {result.extracted_data.severity && (
                              <> · Severity: <strong>{result.extracted_data.severity}</strong></>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null;
                  })()
                )}

                {/* Contributing Factors */}
                {parsed?.contributingFactors && (
                  <div style={{
                    background: '#fffbeb', borderRadius: 12, padding: '11px 13px',
                    border: '1.5px solid #fde68a',
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                      ⚠️ Contributing Factors
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {parsed.contributingFactors.split(',').map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ color: '#d97706', fontSize: 12, flexShrink: 0, marginTop: 1 }}>▸</span>
                          <span style={{ color: '#78350f', fontSize: 12.5 }}>{f.trim()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Emergency trigger reasons */}
                {result.trigger_reasons?.length > 0 && (
                  <div style={{
                    background: '#fef2f2', borderRadius: 12, padding: '11px 13px',
                    border: '1.5px solid #fca5a5',
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                      🚨 Risk Trigger Reasons
                    </div>
                    {result.trigger_reasons.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
                        <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span>
                        <span style={{ color: '#7f1d1d', fontSize: 12.5 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Department Card */}
                <div style={{
                  background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                  borderRadius: 14, padding: '13px 15px',
                  border: '1.5px solid #c7d2fe',
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                    flexShrink: 0,
                  }}>{deptIcon}</div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Recommended Department
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#312e81', marginTop: 3 }}>
                      {result.department}
                    </div>
                    {parsed?.urgency && (
                      <div style={{
                        marginTop: 5, display: 'inline-block',
                        background: isEmergency ? '#fee2e2' : '#e0e7ff',
                        color: isEmergency ? '#b91c1c' : '#3730a3',
                        borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                      }}>
                        Urgency: {parsed.urgency}
                      </div>
                    )}
                  </div>
                </div>

                {/* Immediate Advice */}
                {parsed?.immediateAdvice && (
                  <div style={{
                    background: '#f0fdf4', borderRadius: 12, padding: '11px 13px',
                    border: '1.5px solid #bbf7d0',
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
                      ✅ Immediate Advice
                    </div>
                    {parsed.immediateAdvice.split(/[.;]/).filter(s => s.trim()).map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 5 }}>
                        <span style={{
                          background: '#22c55e', color: '#fff', borderRadius: '50%',
                          width: 16, height: 16, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0, marginTop: 1,
                        }}>{i + 1}</span>
                        <span style={{ color: '#166534', fontSize: 12.5 }}>{s.trim()}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Disclaimer */}
                <div style={{
                  fontSize: 11, color: '#94a3b8', fontStyle: 'italic',
                  borderTop: '1px solid #e2e8f0', paddingTop: 10,
                  lineHeight: 1.5,
                }}>
                  {parsed?.disclaimer ||
                    'This is AI-generated triage guidance only. Always consult a licensed physician for diagnosis and treatment.'}
                </div>

                {/* New assessment button */}
                <button onClick={resetAll} style={{
                  width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                  color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                  fontFamily: 'inherit', marginBottom: 4,
                }}>🎙️ New Assessment</button>
              </div>
            )}

          </div>
        </div>
      )}
    </>
  );
}
