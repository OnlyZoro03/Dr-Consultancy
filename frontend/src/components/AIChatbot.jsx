import React, { useState, useRef, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const SUGGESTIONS = [
  'What does high blood pressure mean?',
  'How can I lower my cholesterol?',
  'What are symptoms of diabetes?',
  'How much water should I drink daily?',
  'What foods are good for the heart?',
];

const TypingIndicator = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
    background: '#f1f5f9', borderRadius: '18px 18px 18px 4px', width: 'fit-content', marginBottom: 8 }}>
    {[0, 1, 2].map(i => (
      <span key={i} style={{
        width: 8, height: 8, borderRadius: '50%', background: '#94a3b8',
        animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`, display: 'inline-block'
      }} />
    ))}
    <style>{`
      @keyframes bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }
    `}</style>
  </div>
);

export default function AIChatbot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm Dr. AI 👋 I'm here to help you understand health topics, symptoms, and medical questions. What would you like to know?" }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Only show for logged-in users
  if (!user) return null;

  // Stop pulsing after first open
  useEffect(() => {
    if (open) setPulse(false);
  }, [open]);

  // Scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async (text) => {
    const question = (text || input).trim();
    if (!question || loading) return;
    setInput('');

    const userMsg = { role: 'user', text: question };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      // Send conversation history for multi-turn context
      const history = [...messages, userMsg].slice(-10);
      const res = await api.post('/ai-chat', { message: question, history });
      setMessages(prev => [...prev, { role: 'assistant', text: res.data.answer }]);
    } catch (err) {
      const status = err?.response?.status;
      let errText = "Sorry, I couldn't connect right now. Please try again in a moment.";
      if (status === 401 || status === 403) errText = "Your session expired. Please refresh the page.";
      setMessages(prev => [...prev, { role: 'assistant', text: errText }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Floating bubble button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Ask Dr. AI"
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          boxShadow: '0 4px 20px rgba(79,70,229,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, color: '#fff',
          animation: pulse ? 'pulseBtn 2s infinite' : 'none',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? '✕' : '🩺'}
        <style>{`
          @keyframes pulseBtn {
            0%, 100% { box-shadow: 0 4px 20px rgba(79,70,229,0.5); }
            50% { box-shadow: 0 4px 32px rgba(79,70,229,0.9), 0 0 0 8px rgba(79,70,229,0.15); }
          }
        `}</style>
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 100, right: 28, zIndex: 9998,
          width: 380, height: 560, borderRadius: 20,
          background: '#ffffff', boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'slideUp 0.25s ease',
          border: '1px solid #e2e8f0',
        }}>
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(20px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .ai-msg { background: #f1f5f9; border-radius: 18px 18px 18px 4px; color: #1e293b; }
            .user-msg { background: linear-gradient(135deg,#4f46e5,#7c3aed); border-radius: 18px 18px 4px 18px; color: #fff; }
            .chat-input:focus { outline: none; }
            .suggestion-chip:hover { background: #e0e7ff !important; }
          `}</style>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
            }}>🩺</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Dr. AI Assistant</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                  background: '#4ade80', marginRight: 5, verticalAlign: 'middle' }} />
                Online · Powered by Gemini
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
              fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex',
            flexDirection: 'column', gap: 4, background: '#fafbff',
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 6,
              }}>
                {m.role === 'assistant' && (
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: '#e0e7ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, marginRight: 8, flexShrink: 0, alignSelf: 'flex-end'
                  }}>🩺</div>
                )}
                <div className={m.role === 'user' ? 'user-msg' : 'ai-msg'} style={{
                  padding: '10px 14px', maxWidth: '82%', fontSize: 13.5,
                  lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: '#e0e7ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
                }}>🩺</div>
                <TypingIndicator />
              </div>
            )}

            {/* Suggestion chips — show only when only welcome message exists */}
            {messages.length === 1 && !loading && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, paddingLeft: 36 }}>
                  Try asking:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 36 }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} className="suggestion-chip" onClick={() => send(s)} style={{
                      background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20,
                      padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#475569',
                      transition: 'background 0.15s',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid #e2e8f0',
            display: 'flex', gap: 8, alignItems: 'flex-end', background: '#fff',
          }}>
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a health question…"
              style={{
                flex: 1, resize: 'none', border: '1.5px solid #e2e8f0',
                borderRadius: 12, padding: '9px 12px', fontSize: 13.5,
                fontFamily: 'inherit', background: '#f8fafc', color: '#1e293b',
                maxHeight: 100, lineHeight: 1.4, transition: 'border 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = '#4f46e5'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: (!input.trim() || loading) ? '#e2e8f0' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s',
              }}
            >
              {loading ? (
                <span style={{ width: 16, height: 16, border: '2px solid #fff',
                  borderTopColor: 'transparent', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
              ) : '➤'}
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
