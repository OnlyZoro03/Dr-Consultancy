"""
socket_events.py
Registers Flask-SocketIO event handlers.
The socketio instance is created in app.py and passed in here so we avoid
circular imports.
"""
from flask_socketio import emit, disconnect


def register_socket_events(socketio):
    """Bind all socket event handlers to the given SocketIO instance."""

    @socketio.on('connect')
    def handle_connect():
        """Client connected — send a welcome ack so the frontend knows the link is live."""
        print(f'[SocketIO] Client connected')
        emit('connected', {'status': 'ok', 'message': 'Real-time triage alerts active'})

    @socketio.on('disconnect')
    def handle_disconnect():
        print(f'[SocketIO] Client disconnected')

    @socketio.on('ping_triage')
    def handle_ping(data):
        """Health-check event the frontend can send to verify latency."""
        emit('pong_triage', {'status': 'alive'})
