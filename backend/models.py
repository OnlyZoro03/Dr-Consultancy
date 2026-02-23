from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), index=True, unique=True, nullable=False)
    email = db.Column(db.String(120), index=True, unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    firebase_uid = db.Column(db.String(128), unique=True, index=True)
    role = db.Column(db.String(20), nullable=False) # 'patient' or 'doctor'
    
    # Profile Details
    gender = db.Column(db.String(20), nullable=True)
    age = db.Column(db.Integer, nullable=True)
    height = db.Column(db.String(20), nullable=True)
    weight = db.Column(db.String(20), nullable=True)
    phone_number = db.Column(db.String(20), nullable=True)
    is_profile_complete = db.Column(db.Boolean, default=False)
    
    # Relationships
    appointments = db.relationship('Appointment', backref='patient', lazy='dynamic', foreign_keys='Appointment.patient_id')
    doctor_appointments = db.relationship('Appointment', backref='doctor', lazy='dynamic', foreign_keys='Appointment.doctor_id')

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role,
            'gender': self.gender,
            'age': self.age,
            'height': self.height,
            'weight': self.weight,
            'phone_number': self.phone_number,
            'is_profile_complete': self.is_profile_complete
        }

class Appointment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    doctor_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True) # Assigned doctor
    patient_name = db.Column(db.String(100), nullable=True)
    
    # Patient Details
    age = db.Column(db.Integer)
    gender = db.Column(db.String(10))
    symptoms = db.Column(db.Text)
    vitals = db.Column(db.String(200)) # e.g., "BP:120/80, HR:72"
    pre_existing_conditions = db.Column(db.Text)
    
    # AI Classification
    risk_level = db.Column(db.String(20)) # Low, Medium, High
    recommended_department = db.Column(db.String(50))
    
    status = db.Column(db.String(20), default='Pending') # Pending, Approved, Rejected, Completed
    created_at = db.Column(db.DateTime, index=True, default=datetime.utcnow)
    appointment_date = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'patient_name': self.patient_name,
            'doctor_id': self.doctor_id,
            'age': self.age,
            'gender': self.gender,
            'symptoms': self.symptoms,
            'vitals': self.vitals,
            'pre_existing_conditions': self.pre_existing_conditions,
            'risk_level': self.risk_level,
            'recommended_department': self.recommended_department,
            'status': self.status,
            'created_at': self.created_at.isoformat(),
            'appointment_date': self.appointment_date.isoformat() if self.appointment_date else None
        }

class MedicalReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    report_name = db.Column(db.String(100))
    report_path = db.Column(db.String(255))
    
    # Analysis Results
    risk_level = db.Column(db.String(20))
    confidence = db.Column(db.Float)
    summary = db.Column(db.Text)
    extracted_data = db.Column(db.JSON) # Stores health parameters list
    ai_explanation = db.Column(db.Text)
    health_plan = db.Column(db.JSON)
    recommended_department = db.Column(db.String(50))
    explanation = db.Column(db.Text) # Legacy field
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'patient_id': self.patient_id,
            'report_name': self.report_name,
            'report_path': self.report_path,
            'risk_level': self.risk_level,
            'confidence': self.confidence,
            'summary': self.summary,
            'extracted_data': self.extracted_data,
            'ai_explanation': self.ai_explanation,
            'health_plan': self.health_plan,
            'recommended_department': self.recommended_department,
            'explanation': self.explanation,
            'created_at': self.created_at.isoformat()
        }

class ChatMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message = db.Column(db.Text, nullable=True)
    image_url = db.Column(db.String(300), nullable=True)  # relative path to uploaded image
    message_type = db.Column(db.String(10), default='text')  # 'text' or 'image'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    sender = db.relationship('User', foreign_keys=[sender_id], backref='sent_messages')
    receiver = db.relationship('User', foreign_keys=[receiver_id], backref='received_messages')

    def to_dict(self):
        return {
            'id': self.id,
            'sender_id': self.sender_id,
            'receiver_id': self.receiver_id,
            'message': self.message,
            'image_url': self.image_url,
            'message_type': self.message_type,
            'created_at': self.created_at.isoformat(),
            'sender_name': self.sender.username if self.sender else 'Unknown'
        }

class Prescription(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    appointment_id = db.Column(db.Integer, db.ForeignKey('appointment.id'), nullable=False)
    medication = db.Column(db.Text, nullable=False)
    dosage = db.Column(db.String(100))
    instructions = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
