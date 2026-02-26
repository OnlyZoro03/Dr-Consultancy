import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';

const SUGGESTIONS = [
  'What does high blood pressure mean?',
  'How can I lower my cholesterol?',
  'What are symptoms of diabetes?',
  'How much water should I drink daily?',
  'What foods are good for the heart?',
];

const TypingIndicator = () => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
    background: '#f1f5f9', borderRadius: '18px 18px 18px 4px', width: 'fit-content', marginBottom: 8,
  }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{
        width: 8, height: 8, borderRadius: '50%', background: '#94a3b8',
        animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`, display: 'inline-block',
      }} />
    ))}
  </div>
);

const ToolBtn = ({ title, onClick, children, disabled, badge }) => (
  <div style={{ position: 'relative', display: 'inline-flex' }}>
    <button title={title} onClick={onClick} disabled={disabled} style={{
      width: 34, height: 34, borderRadius: 10, border: '1.5px solid #e2e8f0',
      background: '#f8fafc', cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 16, color: '#4f46e5', flexShrink: 0,
      transition: 'background 0.15s, border-color 0.15s', opacity: disabled ? 0.4 : 1,
    }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = '#ede9fe'; e.currentTarget.style.borderColor = '#4f46e5'; } }}
      onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
    >{children}</button>
    {badge > 0 && (
      <span style={{
        position: 'absolute', top: -5, right: -5,
        background: '#4f46e5', color: '#fff', borderRadius: '50%',
        width: 16, height: 16, fontSize: 9, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1.5px solid #fff', pointerEvents: 'none',
      }}>{badge}</span>
    )}
  </div>
);

const fileIcon = (type) => {
  if (type?.startsWith('image/')) return '🖼️';
  if (type?.includes('pdf')) return '📕';
  if (type?.includes('word') || type?.includes('doc')) return '📘';
  return '📄';
};
const isImage = (type) => type?.startsWith('image/');

// ─── Structured AI Response Renderer ────────────────────────────────────────
const RISK_CFG = {
  low:      { label: 'Low Risk',                bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e' },
  medium:   { label: 'Moderate Risk',           bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  high:     { label: 'High Risk',               bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', dot: '#f97316' },
  critical: { label: 'Critical — See a Doctor', bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
};
const STATUS_BAR = {
  normal:   { pct: 44, color: '#22c55e', label: 'Normal' },
  low:      { pct: 13, color: '#3b82f6', label: 'Below Normal' },
  elevated: { pct: 67, color: '#f59e0b', label: 'Elevated' },
  high:     { pct: 82, color: '#f97316', label: 'High' },
  critical: { pct: 95, color: '#ef4444', label: 'Critical' },
};

const StructuredMessage = ({ text }) => {
  let d = null;
  try { d = JSON.parse(text); } catch {}
  if (!d || typeof d !== 'object' || (!d.bullets && !d.risk && !d.summary)) {
    return <div style={{padding:'10px 14px',fontSize:13.5,lineHeight:1.55,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{text}</div>;
  }
  const riskLevel = typeof d.risk === 'string' ? d.risk : d.risk?.level;
  const riskLabel = (typeof d.risk === 'object' && d.risk?.label) || RISK_CFG[riskLevel]?.label;
  const rc = RISK_CFG[riskLevel];
  return (
    <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:11,fontSize:13,lineHeight:1.5}}>
      {/* Risk Badge */}
      {rc && (
        <div style={{display:'inline-flex',alignItems:'center',gap:7,
          background:rc.bg,border:`1.5px solid ${rc.border}`,color:rc.text,
          borderRadius:20,padding:'5px 13px',fontWeight:700,fontSize:12,width:'fit-content'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:rc.dot,display:'inline-block',flexShrink:0}}/>
          {riskLabel}
        </div>
      )}
      {/* Summary */}
      {d.summary && <div style={{fontWeight:600,color:'#1e293b',fontSize:13.5,lineHeight:1.45}}>{d.summary}</div>}
      {/* Key Points */}
      {d.bullets?.length > 0 && (
        <div>
          <div style={{fontSize:10.5,fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>📋 Key Points</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {d.bullets.map((b,i) => (
              <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:'#4f46e5',marginTop:5,flexShrink:0}}/>
                <span style={{color:'#374151',fontSize:13}}>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Contributing Factors */}
      {d.factors?.length > 0 && (
        <div style={{background:'#fffbeb',borderRadius:10,padding:'9px 12px',border:'1px solid #fde68a'}}>
          <div style={{fontSize:10.5,fontWeight:800,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>⚠ Contributing Factors</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {d.factors.map((f,i) => (
              <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                <span style={{color:'#d97706',fontSize:12,flexShrink:0,marginTop:1}}>▸</span>
                <span style={{color:'#78350f',fontSize:12.5}}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Vitals Comparison */}
      {d.vitals?.length > 0 && (
        <div>
          <div style={{fontSize:10.5,fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:7}}>📊 Vitals Comparison</div>
          <div style={{display:'flex',flexDirection:'column',gap:7}}>
            {d.vitals.map((v,i) => {
              const sb = STATUS_BAR[v.status] || STATUS_BAR.normal;
              return (
                <div key={i} style={{background:'#f8fafc',borderRadius:10,padding:'8px 11px',border:'1px solid #e2e8f0'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{v.name}</span>
                    <div style={{display:'flex',gap:7,alignItems:'center'}}>
                      <span style={{fontSize:12.5,fontWeight:700,color:sb.color}}>
                        {v.value}{v.unit ? ' '+v.unit : ''}
                      </span>
                      <span style={{fontSize:10,color:'#94a3b8',borderLeft:'1px solid #e2e8f0',paddingLeft:7}}>
                        Normal: {v.normal}
                      </span>
                    </div>
                  </div>
                  <div style={{background:'#e2e8f0',borderRadius:6,height:7,overflow:'hidden',position:'relative'}}>
                    <div style={{width:`${sb.pct}%`,height:'100%',background:sb.color,borderRadius:6}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
                    <span style={{fontSize:10,color:sb.color,fontWeight:700}}>{sb.label}</span>
                    <span style={{fontSize:10,color:'#cbd5e1'}}>Low ←───────→ Critical</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Advice */}
      {d.advice?.length > 0 && (
        <div style={{background:'#f0fdf4',borderRadius:10,padding:'9px 12px',border:'1px solid #bbf7d0'}}>
          <div style={{fontSize:10.5,fontWeight:800,color:'#166534',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>✅ What You Should Do</div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            {d.advice.map((a,i) => (
              <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                <span style={{background:'#22c55e',color:'#fff',borderRadius:'50%',width:16,height:16,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:9,fontWeight:800,flexShrink:0,marginTop:1}}>{i+1}</span>
                <span style={{color:'#166534',fontSize:12.5}}>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Disclaimer */}
      {d.disclaimer && (
        <div style={{fontSize:11,color:'#94a3b8',fontStyle:'italic',borderTop:'1px solid #e2e8f0',paddingTop:8,marginTop:2}}>
          {d.disclaimer}
        </div>
      )}
    </div>
  );
};

export default function AIChatbot() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I’m Dr. AI 👋 I’m here to help you understand health topics, symptoms, and medical questions. What would you like to know?" },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(true);

  const [pendingFiles, setPendingFiles] = useState([]);
  const fileInputRef = useRef(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const sessionIdRef = useRef(null);
  const recognitionRef = useRef(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const [recording, setRecording] = useState(false);
  const [voiceInterim, setVoiceInterim] = useState('');
  const [speechSupported] = useState(
    () => typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  );

  useEffect(() => { if (open) setPulse(false); }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);
  useEffect(() => {
    if (cameraOpen && cameraStream && videoRef.current) videoRef.current.srcObject = cameraStream;
  }, [cameraOpen, cameraStream]);
  useEffect(() => {
    if (!user) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`dr_ai_history_${user.uid}`) || '[]');
      setSessions(stored);
    } catch { setSessions([]); }
  }, [user]);
  useEffect(() => () => { recognitionRef.current?.abort(); }, []);

  if (!user || ['/login', '/register'].includes(pathname)) return null;

  const historyKey = `dr_ai_history_${user.uid}`;

  // ── Voice input helpers ────────────────────────────────────────────────────
  const startVoice = () => {
    if (!speechSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => setRecording(true);
    rec.onresult = (e) => {
      let fin = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + ' ';
        else interim = t;
      }
      if (fin) setInput(prev => prev + fin);
      setVoiceInterim(interim);
    };
    rec.onerror = (e) => { if (e.error !== 'aborted') console.warn('[Voice]', e.error); setRecording(false); setVoiceInterim(''); };
    rec.onend = () => { setRecording(false); setVoiceInterim(''); };
    rec.start();
  };
  const stopVoice = () => { recognitionRef.current?.stop(); setRecording(false); setVoiceInterim(''); };

  const allSharedFiles = messages
    .filter(m => m.role === 'user' && m.attachments?.length)
    .flatMap(m => m.attachments);

  const startCamera = async (mode) => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch { setCameraError('Camera permission denied or not available.'); }
  };
  const stopCamera = () => { cameraStream?.getTracks().forEach(t => t.stop()); setCameraStream(null); };
  const openCamera = () => { setCameraOpen(true); startCamera(facingMode); };
  const closeCamera = () => { stopCamera(); setCameraOpen(false); setCameraError(''); };
  const flipCamera = () => { const n = facingMode === 'user' ? 'environment' : 'user'; setFacingMode(n); stopCamera(); startCamera(n); };
  const capturePhoto = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    setPendingFiles(prev => [...prev, { url: c.toDataURL('image/jpeg', 0.92), name: `photo-${Date.now()}.jpg`, type: 'image/jpeg' }]);
    closeCamera();
  };

  const handleFilePick = (e) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files.map(f => ({ url: URL.createObjectURL(f), name: f.name, type: f.type }))]);
    e.target.value = '';
  };
  const removePending = (idx) => setPendingFiles(prev => {
    const n = [...prev];
    if (n[idx]?.url?.startsWith('blob:')) URL.revokeObjectURL(n[idx].url);
    n.splice(idx, 1); return n;
  });
  const clearPending = () => { pendingFiles.forEach(f => { if (f.url?.startsWith('blob:')) URL.revokeObjectURL(f.url); }); setPendingFiles([]); };

  const startNewChat = () => {
    sessionIdRef.current = null;
    setCurrentSessionId(null);
    setMessages([{ role: 'assistant', text: "Hi! I'm Dr. AI 👋 I'm here to help you understand health topics, symptoms, and medical questions. What would you like to know?" }]);
    setHistoryOpen(false);
    setInput('');
    clearPending();
  };

  const loadSession = (session) => {
    sessionIdRef.current = session.id;
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setHistoryOpen(false);
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      localStorage.setItem(historyKey, JSON.stringify(next));
      return next;
    });
    if (currentSessionId === id) startNewChat();
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if ((!q && !pendingFiles.length) || loading) return;
    setInput('');
    const snapped = [...pendingFiles];
    clearPending();
    const userMsg = {
      role: 'user',
      text: q || (snapped.length > 1 ? `📎 Shared ${snapped.length} files` : '📎 Shared a file'),
      attachments: snapped.length ? snapped : null,
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = [...messages, userMsg].slice(-10).map(m => ({ role: m.role, text: m.text }));
      const res = await api.post('/ai-chat', { message: q || `I shared ${snapped.length} file(s).`, history });
      const aiMsg = { role: 'assistant', text: res.data.answer };
      setMessages(prev => {
        const updated = [...prev, aiMsg];
        if (!sessionIdRef.current) sessionIdRef.current = Date.now().toString();
        const id = sessionIdRef.current;
        setCurrentSessionId(id);
        const firstUser = updated.find(m => m.role === 'user');
        const title = (firstUser?.text || 'New conversation').slice(0, 60);
        const saveable = {
          id, title, timestamp: Date.now(),
          messages: updated.map(m => ({ ...m, attachments: m.attachments?.filter(a => !a.url?.startsWith('blob:')) ?? null })),
        };
        setSessions(sp => {
          const next = [saveable, ...sp.filter(s => s.id !== id)].slice(0, 50);
          localStorage.setItem(historyKey, JSON.stringify(next));
          return next;
        });
        return updated;
      });
    } catch (err) {
      const s = err?.response?.status;
      setMessages(prev => [...prev, { role: 'assistant', text: s === 401 || s === 403 ? 'Session expired. Please refresh.' : "Sorry, couldn’t connect. Try again." }]);
    } finally { setLoading(false); }
  };
  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <>
      <style>{`
        @keyframes pulseBtn{0%,100%{box-shadow:0 4px 20px rgba(79,70,229,0.5);}50%{box-shadow:0 4px 32px rgba(79,70,229,0.9),0 0 0 8px rgba(79,70,229,0.15);}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes bounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-6px);}}
        @keyframes spin{to{transform:rotate(360deg);}}        @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5);}50%{box-shadow:0 0 0 6px rgba(239,68,68,0.15),0 2px 14px rgba(239,68,68,0.6);}}        .ai-msg{background:#f1f5f9;border-radius:18px 18px 18px 4px;color:#1e293b;}
        .user-msg{background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:18px 18px 4px 18px;color:#fff;}
        .chat-input:focus{outline:none;} .suggestion-chip:hover{background:#e0e7ff!important;}
        .fthumbnail:hover{opacity:0.85;transform:scale(1.03);} .vgi:hover .vgi-ov{opacity:1!important;}
      `}</style>

      {/* Bubble */}
      <button onClick={() => setOpen(o => !o)} title="Ask Dr. AI" style={{
        position:'fixed',bottom:28,right:28,zIndex:9999,width:60,height:60,borderRadius:'50%',border:'none',cursor:'pointer',
        background:'linear-gradient(135deg,#4f46e5,#7c3aed)',boxShadow:'0 4px 20px rgba(79,70,229,0.5)',
        display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,color:'#fff',
        animation:pulse?'pulseBtn 2s infinite':'none',transition:'transform 0.2s',
      }} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.1)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}>
        {open ? '✕' : '🩺'}
      </button>

      {/* Camera Modal */}
      {cameraOpen && (
        <div style={{position:'fixed',inset:0,zIndex:10002,background:'rgba(0,0,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#0f172a',borderRadius:20,overflow:'hidden',width:360,display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
            <div style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{color:'#fff',fontWeight:700,fontSize:14}}>📷 Live Camera</span>
              <button onClick={closeCamera} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,width:28,height:28,cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
            <div style={{background:'#000',lineHeight:0}}>
              {cameraError ? <div style={{padding:'2rem',textAlign:'center',color:'#f87171',fontSize:13}}>⚠️ {cameraError}</div>
                : <video ref={videoRef} autoPlay playsInline muted style={{width:'100%',maxHeight:280,objectFit:'cover',display:'block'}}/>}
              <canvas ref={canvasRef} style={{display:'none'}}/>
            </div>
            <div style={{padding:'14px 16px',display:'flex',gap:10,alignItems:'center',justifyContent:'center',background:'#1e293b'}}>
              <button onClick={flipCamera} style={{width:42,height:42,borderRadius:'50%',border:'2px solid #475569',background:'#334155',color:'#cbd5e1',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>🔄</button>
              <button onClick={capturePhoto} disabled={!!cameraError} style={{width:62,height:62,borderRadius:'50%',border:'4px solid #fff',background:'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',fontSize:26,cursor:cameraError?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 16px rgba(79,70,229,0.5)',opacity:cameraError?0.5:1}}>📸</button>
              <button onClick={closeCamera} style={{width:42,height:42,borderRadius:'50%',border:'2px solid #475569',background:'#334155',color:'#cbd5e1',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {viewerOpen && (
        <div style={{position:'fixed',inset:0,zIndex:10001,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',animation:'fadeIn 0.2s ease'}}
          onClick={e=>{if(e.target===e.currentTarget){setViewerItem(null);setViewerOpen(false);}}}>
          {viewerItem ? (
            <div style={{position:'relative',maxWidth:'90vw',maxHeight:'90vh',display:'flex',flexDirection:'column',alignItems:'center'}}>
              <button onClick={()=>setViewerItem(null)} style={{position:'absolute',top:-40,left:0,background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,padding:'5px 14px',cursor:'pointer',fontSize:12,fontWeight:600}}>← All files</button>
              <button onClick={()=>{setViewerItem(null);setViewerOpen(false);}} style={{position:'absolute',top:-40,right:0,background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,padding:'5px 14px',cursor:'pointer',fontSize:12}}>✕ Close</button>
              {isImage(viewerItem.type)
                ? <img src={viewerItem.url} alt={viewerItem.name} style={{maxWidth:'88vw',maxHeight:'78vh',borderRadius:16,objectFit:'contain',boxShadow:'0 8px 40px rgba(0,0,0,0.5)'}}/>
                : <div style={{background:'#1e293b',borderRadius:16,padding:'3rem 4rem',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
                    <span style={{fontSize:64}}>{fileIcon(viewerItem.type)}</span>
                    <div style={{color:'#e2e8f0',fontWeight:600,fontSize:15}}>{viewerItem.name}</div>
                    <a href={viewerItem.url} download={viewerItem.name} style={{padding:'8px 24px',background:'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',borderRadius:10,textDecoration:'none',fontSize:13,fontWeight:600}}>⬇ Download</a>
                  </div>}
              <div style={{color:'rgba(255,255,255,0.6)',fontSize:12,marginTop:10}}>{viewerItem.name}</div>
            </div>
          ) : (
            <div style={{background:'#fff',borderRadius:20,overflow:'hidden',width:420,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              <div style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)',padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
                <div>
                  <div style={{color:'#fff',fontWeight:700,fontSize:15}}>📁 My Shared Files</div>
                  <div style={{color:'rgba(255,255,255,0.7)',fontSize:11,marginTop:2}}>{allSharedFiles.length} file{allSharedFiles.length!==1?'s':''} in this session</div>
                </div>
                <button onClick={()=>setViewerOpen(false)} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,width:30,height:30,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
              </div>
              <div style={{flex:1,overflowY:'auto',padding:16}}>
                {allSharedFiles.length===0 ? (
                  <div style={{textAlign:'center',padding:'3rem 1rem',color:'#94a3b8'}}>
                    <div style={{fontSize:48,marginBottom:12}}>🔍</div>
                    <div style={{fontWeight:600,marginBottom:4}}>No files shared yet</div>
                    <div style={{fontSize:12}}>Use 📎 or 📷 in the chat to share files</div>
                  </div>
                ) : (
                  <>
                    {allSharedFiles.filter(f=>isImage(f.type)).length>0&&(
                      <>
                        <div style={{fontSize:11,fontWeight:700,color:'#64748b',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Images</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:16}}>
                          {allSharedFiles.filter(f=>isImage(f.type)).map((f,i)=>(
                            <div key={i} className="vgi" onClick={()=>setViewerItem(f)} style={{position:'relative',cursor:'pointer',borderRadius:10,overflow:'hidden',aspectRatio:'1',background:'#f1f5f9'}}>
                              <img src={f.url} alt={f.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                              <div className="vgi-ov" style={{position:'absolute',inset:0,background:'rgba(79,70,229,0.55)',display:'flex',alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity 0.15s',fontSize:22}}>🔍</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {allSharedFiles.filter(f=>!isImage(f.type)).length>0&&(
                      <>
                        <div style={{fontSize:11,fontWeight:700,color:'#64748b',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'}}>Documents</div>
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {allSharedFiles.filter(f=>!isImage(f.type)).map((f,i)=>(
                            <div key={i} onClick={()=>setViewerItem(f)} style={{display:'flex',alignItems:'center',gap:10,background:'#f8fafc',borderRadius:12,padding:'10px 12px',border:'1px solid #e2e8f0',cursor:'pointer'}}>
                              <span style={{fontSize:24}}>{fileIcon(f.type)}</span>
                              <div style={{flex:1,overflow:'hidden'}}>
                                <div style={{fontSize:13,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                                <div style={{fontSize:11,color:'#94a3b8'}}>Tap to view / download</div>
                              </div>
                              <span style={{fontSize:18,color:'#94a3b8'}}>›</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat Window */}
      {open && (
        <div style={{position:'fixed',bottom:100,right:28,zIndex:9998,width:400,maxHeight:660,borderRadius:20,background:'#ffffff',boxShadow:'0 20px 60px rgba(0,0,0,0.18)',display:'flex',flexDirection:'column',overflow:'hidden',animation:'slideUp 0.25s ease',border:'1px solid #e2e8f0'}}>
          {/* Header */}
          <div style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)',padding:'14px 18px',display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
            <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>🩺</div>
            <div>
              <div style={{color:'#fff',fontWeight:700,fontSize:15}}>Dr. AI Assistant</div>
              <div style={{color:'rgba(255,255,255,0.75)',fontSize:12}}>
                <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'#4ade80',marginRight:5,verticalAlign:'middle'}}/>
                Online · Powered by Gemini
              </div>
            </div>
            <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={startNewChat} title="New chat" style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',fontWeight:600}}>✏️</button>
              <button onClick={()=>setHistoryOpen(h=>!h)} title="Chat history" style={{background:historyOpen?'rgba(255,255,255,0.35)':'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:4,fontWeight:600}}>
                🕐{sessions.length>0&&<span style={{background:'#fbbf24',color:'#1e293b',borderRadius:20,fontSize:10,fontWeight:800,padding:'1px 5px',marginLeft:3}}>{sessions.length}</span>}
              </button>
              <button onClick={()=>setViewerOpen(true)} title="View shared files" style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:4,fontWeight:600}}>
                📁{allSharedFiles.length>0&&<span style={{background:'#fbbf24',color:'#1e293b',borderRadius:20,fontSize:10,fontWeight:800,padding:'1px 5px',marginLeft:3}}>{allSharedFiles.length}</span>}
              </button>
              <button onClick={()=>setOpen(false)} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:8,width:30,height:30,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>
          </div>

          {/* History Panel */}
          {historyOpen&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',background:'#fafbff',overflow:'hidden'}}>
              <div style={{padding:'12px 14px',borderBottom:'1px solid #e2e8f0',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:'#fff'}}>
                <span style={{fontWeight:700,fontSize:13,color:'#1e293b'}}>🕐 Chat History</span>
                <button onClick={startNewChat} style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)',border:'none',color:'#fff',borderRadius:8,padding:'5px 14px',cursor:'pointer',fontSize:12,fontWeight:600}}>✏️ New Chat</button>
              </div>
              {sessions.length===0?(
                <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'#94a3b8',padding:'2rem',textAlign:'center'}}>
                  <div style={{fontSize:48,marginBottom:12}}>💬</div>
                  <div style={{fontWeight:600,marginBottom:4,color:'#64748b'}}>No saved chats yet</div>
                  <div style={{fontSize:12}}>Start a conversation and it'll appear here</div>
                </div>
              ):(
                <div style={{flex:1,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:6}}>
                  {sessions.map(s=>(
                    <div key={s.id} onClick={()=>loadSession(s)} style={{
                      background:s.id===currentSessionId?'#ede9fe':'#fff',
                      border:`1.5px solid ${s.id===currentSessionId?'#7c3aed':'#e2e8f0'}`,
                      borderRadius:12,padding:'10px 12px',cursor:'pointer',
                      display:'flex',alignItems:'center',gap:10,transition:'box-shadow 0.15s',
                    }}
                      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 2px 12px rgba(79,70,229,0.12)'}
                      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
                    >
                      <div style={{width:32,height:32,borderRadius:8,background:'#e0e7ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>💬</div>
                      <div style={{flex:1,overflow:'hidden'}}>
                        <div style={{fontSize:12.5,fontWeight:600,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</div>
                        <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{new Date(s.timestamp).toLocaleDateString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                      <button onClick={e=>deleteSession(s.id,e)} title="Delete" style={{background:'none',border:'none',color:'#94a3b8',cursor:'pointer',padding:'4px 6px',borderRadius:6,fontSize:14,flexShrink:0,lineHeight:1,transition:'background 0.15s,color 0.15s'}}
                        onMouseEnter={e=>{e.currentTarget.style.background='#fee2e2';e.currentTarget.style.color='#ef4444';}}
                        onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='#94a3b8';}}
                      >🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          {!historyOpen&&<div style={{flex:1,overflowY:'auto',padding:'16px 14px',display:'flex',flexDirection:'column',gap:4,background:'#fafbff'}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',marginBottom:6}}>
                {m.role==='assistant'&&<div style={{width:28,height:28,borderRadius:'50%',background:'#e0e7ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,marginRight:8,flexShrink:0,alignSelf:'flex-end'}}>🩺</div>}
                <div style={{display:'flex',flexDirection:'column',alignItems:m.role==='user'?'flex-end':'flex-start',maxWidth:'85%'}}>
                  {m.attachments?.length>0&&(
                    <div style={{marginBottom:m.text?4:0}}>
                      {m.attachments.filter(a=>isImage(a.type)).length>0&&(
                        <div style={{display:'grid',gridTemplateColumns:m.attachments.filter(a=>isImage(a.type)).length===1?'1fr':'repeat(2,1fr)',gap:4,marginBottom:4}}>
                          {m.attachments.filter(a=>isImage(a.type)).map((a,ai)=>(
                            <img key={ai} src={a.url} alt={a.name} className="fthumbnail"
                              style={{width:'100%',maxWidth:190,height:120,borderRadius:12,objectFit:'cover',cursor:'pointer',border:'2px solid #e0e7ff',display:'block',transition:'opacity 0.15s,transform 0.15s'}}
                              onClick={()=>{setViewerItem(a);setViewerOpen(true);}}/>
                          ))}
                        </div>
                      )}
                      {m.attachments.filter(a=>!isImage(a.type)).map((a,ai)=>(
                        <div key={ai} onClick={()=>{setViewerItem(a);setViewerOpen(true);}} style={{display:'flex',alignItems:'center',gap:8,background:'#ede9fe',borderRadius:12,padding:'8px 12px',border:'1px solid #c4b5fd',marginBottom:4,cursor:'pointer'}}>
                          <span style={{fontSize:20}}>{fileIcon(a.type)}</span>
                          <span style={{fontSize:12,color:'#4f46e5',fontWeight:600,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</span>
                          <span style={{fontSize:14,color:'#7c3aed',marginLeft:'auto'}}>🔍</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.text&&(
                    m.role==='user'
                      ? <div className="user-msg" style={{padding:'10px 14px',fontSize:13.5,lineHeight:1.55,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{m.text}</div>
                      : <div className="ai-msg"><StructuredMessage text={m.text}/></div>
                  )}
                </div>
              </div>
            ))}
            {loading&&(
              <div style={{display:'flex',alignItems:'flex-end',gap:8}}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'#e0e7ff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14}}>🩺</div>
                <TypingIndicator/>
              </div>
            )}
            {messages.length===1&&!loading&&(
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,color:'#94a3b8',marginBottom:8,paddingLeft:36}}>Try asking:</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,paddingLeft:36}}>
                  {SUGGESTIONS.map((s,i)=>(
                    <button key={i} className="suggestion-chip" onClick={()=>send(s)} style={{background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:20,padding:'5px 12px',fontSize:12,cursor:'pointer',color:'#475569',transition:'background 0.15s'}}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>}

          {/* Pending files bar */}
          {!historyOpen&&pendingFiles.length>0&&(
            <div style={{padding:'8px 12px',borderTop:'1px solid #e2e8f0',background:'#f8faff',flexShrink:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:'#4f46e5'}}>{pendingFiles.length} file{pendingFiles.length>1?'s':''} ready to send</span>
                <button onClick={clearPending} style={{background:'none',border:'none',fontSize:11,color:'#ef4444',cursor:'pointer',fontWeight:600}}>Clear all</button>
              </div>
              <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
                {pendingFiles.map((f,idx)=>(
                  <div key={idx} style={{position:'relative',flexShrink:0}}>
                    {isImage(f.type)
                      ? <img src={f.url} alt={f.name} style={{width:52,height:52,borderRadius:10,objectFit:'cover',border:'1.5px solid #c4b5fd',display:'block'}}/>
                      : <div style={{width:52,height:52,borderRadius:10,background:'#ede9fe',border:'1.5px solid #c4b5fd',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2}}>
                          <span style={{fontSize:18}}>{fileIcon(f.type)}</span>
                          <span style={{fontSize:8,color:'#7c3aed',fontWeight:700,maxWidth:46,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'center',padding:'0 2px'}}>{f.name.split('.').pop().toUpperCase()}</span>
                        </div>}
                    <button onClick={()=>removePending(idx)} style={{position:'absolute',top:-5,right:-5,background:'#ef4444',border:'1.5px solid #fff',color:'#fff',borderRadius:'50%',width:16,height:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,padding:0}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          {!historyOpen&&<div style={{padding:'10px 12px',borderTop:'1px solid #e2e8f0',background:'#fff',flexShrink:0}}>
            <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center'}}>
              <ToolBtn title="Attach multiple files / images" onClick={()=>fileInputRef.current?.click()}>📎</ToolBtn>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" multiple style={{display:'none'}} onChange={handleFilePick}/>
              <ToolBtn title="Take a live photo" onClick={openCamera}>📷</ToolBtn>
              <ToolBtn title="View all shared files" onClick={()=>setViewerOpen(true)} badge={allSharedFiles.length}>📁</ToolBtn>
              {/* Mic button — integrated voice input */}
              <div style={{position:'relative',display:'inline-flex'}}>
                <button
                  title={!speechSupported?'Speech not supported in this browser':recording?'Stop recording':'Voice input — speak your symptoms'}
                  onClick={recording?stopVoice:startVoice}
                  disabled={!speechSupported}
                  style={{
                    width:34,height:34,borderRadius:10,border:'1.5px solid',borderColor:recording?'#ef4444':'#e2e8f0',
                    background:recording?'#fef2f2':'#f8fafc',cursor:speechSupported?'pointer':'not-allowed',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,
                    color:recording?'#ef4444':'#4f46e5',flexShrink:0,
                    animation:recording?'micPulse 1.2s infinite':'none',
                    transition:'background 0.15s,border-color 0.15s',
                    opacity:speechSupported?1:0.4,
                  }}
                  onMouseEnter={e=>{if(speechSupported&&!recording){e.currentTarget.style.background='#ede9fe';e.currentTarget.style.borderColor='#4f46e5';}}}
                  onMouseLeave={e=>{if(!recording){e.currentTarget.style.background='#f8fafc';e.currentTarget.style.borderColor='#e2e8f0';}}}
                >{recording?'⏹':'🎙️'}</button>
                {recording&&<span style={{position:'absolute',top:-4,right:-4,width:10,height:10,borderRadius:'50%',background:'#ef4444',border:'1.5px solid #fff'}}/>}
              </div>
              <span style={{flex:1}}/>
              <span style={{fontSize:11,color:recording?'#ef4444':'#94a3b8',fontWeight:recording?700:400,transition:'color 0.2s'}}>
                {recording?'🔴 Listening…':'images, PDFs &amp; docs'}
              </span>
            </div>
            {/* Interim voice text preview */}
            {voiceInterim&&(
              <div style={{marginBottom:6,padding:'5px 12px',background:'#fef2f2',borderRadius:8,border:'1px solid #fca5a5',fontSize:12,color:'#991b1b',fontStyle:'italic'}}>
                🎙️ {voiceInterim}
              </div>
            )}
            <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
              <textarea ref={inputRef} className="chat-input" rows={1} value={input}
                onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                placeholder="Ask a health question…"
                style={{flex:1,resize:'none',border:'1.5px solid #e2e8f0',borderRadius:12,padding:'9px 12px',fontSize:13.5,fontFamily:'inherit',background:'#f8fafc',color:'#1e293b',maxHeight:100,lineHeight:1.4,transition:'border 0.2s'}}
                onFocus={e=>e.target.style.borderColor='#4f46e5'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
              <button onClick={()=>send()} disabled={(!input.trim()&&!pendingFiles.length)||loading} style={{
                width:40,height:40,borderRadius:12,border:'none',cursor:'pointer',
                background:((!input.trim()&&!pendingFiles.length)||loading)?'#e2e8f0':'linear-gradient(135deg,#4f46e5,#7c3aed)',
                color:'#fff',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'background 0.2s',
              }}>
                {loading?<span style={{width:16,height:16,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.7s linear infinite',display:'inline-block'}}/>:'➤'}
              </button>
            </div>
          </div>}
        </div>
      )}
    </>
  );
}
