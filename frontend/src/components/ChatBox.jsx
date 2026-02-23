import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    FaUserMd, FaPaperPlane, FaImage, FaTimes, FaCircle,
    FaDownload, FaSpinner, FaCommentMedical, FaUser, FaUserAlt
} from 'react-icons/fa';

const ChatBox = () => {
    const { user } = useAuth();
    const [contacts, setContacts] = useState([]);
    const [selectedContact, setSelectedContact] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const pollRef = useRef(null);

    const isDoctor = user?.role === 'doctor';
    const contactLabel = isDoctor ? 'Patient' : 'Doctor';

    // Fetch contact list (doctors for patient, patients for doctor)
    useEffect(() => {
        const endpoint = isDoctor ? '/chat/patients' : '/chat/doctors';
        api.get(endpoint)
            .then(res => {
                const list = isDoctor ? res.data.patients : res.data.doctors;
                setContacts(list);
            })
            .catch(console.error);
        return () => clearInterval(pollRef.current);
    }, [isDoctor]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const fetchMessages = useCallback(async (contactId) => {
        try {
            const res = await api.get(`/chat/messages/${contactId}`);
            setMessages(res.data.messages);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const selectContact = (contact) => {
        setSelectedContact(contact);
        setMessages([]);
        setLoadingMsgs(true);
        clearInterval(pollRef.current);
        fetchMessages(contact.id).finally(() => setLoadingMsgs(false));
        // Poll every 4 seconds for new messages
        pollRef.current = setInterval(() => fetchMessages(contact.id), 4000);
    };

    const sendText = async () => {
        if (!inputText.trim() || !selectedContact || sending) return;
        setSending(true);
        try {
            const res = await api.post('/chat/send', {
                receiver_id: selectedContact.id,
                message: inputText.trim()
            });
            setMessages(prev => [...prev, res.data.chat_message]);
            setInputText('');
        } catch (err) {
            alert('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendText();
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const sendImage = async () => {
        if (!imageFile || !selectedContact || uploading) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', imageFile);
            formData.append('receiver_id', selectedContact.id);
            const res = await api.post('/chat/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setMessages(prev => [...prev, res.data.chat_message]);
            setImagePreview(null);
            setImageFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            alert('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const cancelImage = () => {
        setImagePreview(null);
        setImageFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const formatTime = (iso) => {
        const d = new Date(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return 'Today';
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString();
    };

    // Group messages by date
    const groupedMessages = messages.reduce((groups, msg) => {
        const date = formatDate(msg.created_at);
        if (!groups[date]) groups[date] = [];
        groups[date].push(msg);
        return groups;
    }, {});

    const myId = user?.user_id || 0;

    const filteredContacts = contacts.filter(c =>
        c.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="doctor-chat-layout">
            {/* Contact List Sidebar */}
            <div className="chat-sidebar">
                <div className="chat-sidebar-header">
                    <FaCommentMedical className="chat-sidebar-icon" />
                    <span>Communication</span>
                </div>
                <div className="chat-sidebar-search">
                    <input
                        type="text"
                        placeholder={`Search ${contactLabel.toLowerCase()}s...`}
                        className="chat-search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="chat-doctor-list">
                    {filteredContacts.length === 0 ? (
                        <div className="chat-no-doctors">
                            {isDoctor ? <FaUserAlt style={{ fontSize: '2rem', color: '#94a3b8', marginBottom: '0.5rem' }} /> : <FaUserMd style={{ fontSize: '2rem', color: '#94a3b8', marginBottom: '0.5rem' }} />}
                            <p>No {contactLabel.toLowerCase()}s found</p>
                        </div>
                    ) : (
                        filteredContacts.map(contact => (
                            <div
                                key={contact.id}
                                className={`chat-doctor-item ${selectedContact?.id === contact.id ? 'active' : ''}`}
                                onClick={() => selectContact(contact)}
                            >
                                <div className="chat-doctor-avatar">
                                    {contact.username[0].toUpperCase()}
                                    <span className="online-dot"><FaCircle /></span>
                                </div>
                                <div className="chat-doctor-info">
                                    <div className="chat-doctor-name">{isDoctor ? '' : 'Dr. '}{contact.username}</div>
                                    <div className="chat-doctor-role">{contact.role === 'doctor' ? 'Medical Doctor' : 'Patient'}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Window */}
            <div className="chat-window">
                {!selectedContact ? (
                    <div className="chat-empty-state">
                        <div className="chat-empty-icon">💬</div>
                        <h3>Connect with {contactLabel}s</h3>
                        <p>Select a {contactLabel.toLowerCase()} from the list to begin communication.</p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="chat-header">
                            <div className="chat-header-left">
                                <div className="chat-header-avatar">
                                    {selectedContact.username[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className="chat-header-name">{isDoctor ? '' : 'Dr. '}{selectedContact.username}</div>
                                    <div className="chat-header-status">
                                        <FaCircle style={{ color: '#22c55e', fontSize: '0.5rem' }} /> Online
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="chat-messages">
                            {loadingMsgs ? (
                                <div className="chat-loading">
                                    <FaSpinner className="spin-icon" /> Loading messages...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="chat-start-msg">
                                    <div className="chat-start-bubble">
                                        👋 Say hello to {isDoctor ? '' : 'Dr. '}{selectedContact.username}! {isDoctor ? 'How can you help the patient today?' : 'Ask about your condition, share reports, or discuss your symptoms.'}
                                    </div>
                                </div>
                            ) : (
                                Object.entries(groupedMessages).map(([date, msgs]) => (
                                    <div key={date}>
                                        <div className="chat-date-divider"><span>{date}</span></div>
                                        {msgs.map(msg => {
                                            const isMine = msg.sender_id === myId || msg.sender_name === user?.username;
                                            return (
                                                <div key={msg.id} className={`chat-msg-row ${isMine ? 'mine' : 'theirs'}`}>
                                                    {!isMine && (
                                                        <div className="chat-msg-avatar-small">
                                                            {msg.sender_name[0].toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className={`chat-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}`}>
                                                        {msg.message_type === 'image' ? (
                                                            <div className="chat-image-msg">
                                                                <img
                                                                    src={`http://localhost:5000${msg.image_url}`}
                                                                    alt="Shared"
                                                                    className="chat-image"
                                                                    onClick={() => window.open(`http://localhost:5000${msg.image_url}`, '_blank')}
                                                                />
                                                                <a
                                                                    href={`http://localhost:5000${msg.image_url}`}
                                                                    download
                                                                    className="chat-download-btn"
                                                                    title="Download"
                                                                >
                                                                    <FaDownload />
                                                                </a>
                                                            </div>
                                                        ) : (
                                                            <p className="chat-text">{msg.message}</p>
                                                        )}
                                                        <span className="chat-time">{formatTime(msg.created_at)}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Image Preview */}
                        {imagePreview && (
                            <div className="chat-image-preview">
                                <div className="chat-image-preview-inner">
                                    <img src={imagePreview} alt="Preview" />
                                    <div className="chat-image-preview-actions">
                                        <button className="btn-danger" onClick={cancelImage} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                                            <FaTimes /> Cancel
                                        </button>
                                        <button className="btn-primary" onClick={sendImage} disabled={uploading} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                                            {uploading ? <><FaSpinner className="spin-icon" /> Sending...</> : <><FaPaperPlane /> Send Image</>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Input Area */}
                        <div className="chat-input-area">
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*,.pdf"
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                            />
                            <button
                                className="chat-attach-btn"
                                onClick={() => fileInputRef.current?.click()}
                                title="Attach photo or PDF"
                            >
                                <FaImage />
                            </button>
                            <textarea
                                className="chat-input"
                                placeholder="Type your message... (Enter to send)"
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                            />
                            <button
                                className={`chat-send-btn ${(!inputText.trim() || sending) ? 'disabled' : ''}`}
                                onClick={sendText}
                                disabled={!inputText.trim() || sending}
                                title="Send message"
                            >
                                {sending ? <FaSpinner className="spin-icon" /> : <FaPaperPlane />}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ChatBox;
