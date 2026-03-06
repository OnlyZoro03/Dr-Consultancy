from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from config import Config
from models import db
from flask_migrate import Migrate
from dotenv import load_dotenv
import os

# Load environment variables from .env file (must be before anything reads os.environ)
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS globally for all routes — required for the Vite dev server (port 5173)
CORS(app, supports_credentials=True)

# Initialize Flask-SocketIO with CORS so the React dev server can connect
# async_mode='threading' keeps things compatible with the existing Werkzeug server
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Initialize DB
db.init_app(app)
migrate = Migrate(app, db)

# Import routes (must come after app + socketio are created)
from routes import *

# Register socket event handlers
from socket_events import register_socket_events
register_socket_events(socketio)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    # Port 5001 — avoids macOS AirPlay Receiver which occupies port 5000 on macOS Monterey+
    # use_reloader=False prevents double Firebase-admin init caused by Werkzeug's child-process reloader
    socketio.run(app, debug=True, host='0.0.0.0', port=5001, use_reloader=False)
