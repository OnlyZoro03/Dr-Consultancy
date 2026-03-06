/**
 * socket.js
 * Singleton socket.io-client connection.
 * Import `socket` anywhere in the app — the connection is created once
 * and shared across all consumers.
 */
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Connect with auto-reconnect enabled.
// transports: ['websocket','polling'] lets the client fall back to long-polling
// if the server hasn't enabled native WebSocket yet.
const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  autoConnect: true,
});

socket.on('connect', () => {
  console.log('[Socket] Connected — id:', socket.id);
});

socket.on('connect_error', (err) => {
  console.warn('[Socket] Connection error:', err.message);
});

socket.on('disconnect', (reason) => {
  console.warn('[Socket] Disconnected:', reason);
});

export default socket;
