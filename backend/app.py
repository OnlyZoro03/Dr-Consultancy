from flask import Flask
from flask_cors import CORS
from config import Config
from models import db
from flask_migrate import Migrate

app = Flask(__name__)
app.config.from_object(Config)

# Enable CORS
CORS(app)

# Initialize DB
db.init_app(app)
migrate = Migrate(app, db)

# Import routes
from routes import *

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
