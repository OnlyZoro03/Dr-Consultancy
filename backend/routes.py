from flask import request, jsonify, Blueprint, send_from_directory
from app import app, db
from models import User, Appointment, MedicalReport, Prescription, ChatMessage
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
import jwt
import datetime
import os
from ai_module import classify_risk
from report_analyzer import analyze_medical_report, answer_report_question
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

# Initialize Firebase Admin
# NOTE: Ensure the service account JSON is present in the backend folder
cred_path = os.path.join(os.path.dirname(__file__), 'drconsultancy-472cb-firebase-adminsdk-fbsvc-59eaee2dac.json')
if os.path.exists(cred_path):
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
else:
    # Fallback for development if file is missing (will fail on actual token check)
    try:
        firebase_admin.get_app()
    except ValueError:
        print("Warning: Firebase Service Account not found. please add serviceAccountKey.json")

# Upload folder setup
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ─── Auth Decorator ───────────────────────────────────────────────────────────
def token_required(f):
    def decorator(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing'}), 403
        try:
            token = token.split(" ")[1]  # Bearer <token>
            
            # First try Firebase verification
            try:
                decoded_token = firebase_auth.verify_id_token(token)
                firebase_uid = decoded_token['uid']
                current_user = User.query.filter_by(firebase_uid=firebase_uid).first()
            except Exception as e:
                # Fallback to local JWT if Firebase fails (for legacy support during transition)
                data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
                current_user = User.query.get(data['user_id'])
                
            if not current_user:
                return jsonify({'message': 'User not found'}), 404
        except Exception as e:
            return jsonify({'message': f'Token is invalid: {str(e)}'}), 403
        return f(current_user, *args, **kwargs)
    decorator.__name__ = f.__name__
    return decorator

# ─── Auth Routes ──────────────────────────────────────────────────────────────
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    hashed_password = generate_password_hash(data['password'], method='pbkdf2:sha256')
    new_user = User(
        username=data['username'],
        email=data['email'],
        password_hash=hashed_password,
        role=data['role']
    )
    try:
        db.session.add(new_user)
        db.session.commit()
        return jsonify({'message': 'User registered successfully'}), 201
    except Exception as e:
        return jsonify({'message': str(e)}), 400

@app.route('/api/auth/firebase', methods=['POST'])
def firebase_auth_endpoint():
    """Verify Firebase token and sync with local user database."""
    data = request.get_json()
    id_token = data.get('idToken')
    role = data.get('role', 'patient') # Default to patient if not provided
    username = data.get('username')

    try:
        decoded_token = firebase_auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        email = decoded_token.get('email')

        user = User.query.filter_by(firebase_uid=uid).first()
        if not user:
            # Create local user if it doesn't exist
            user = User.query.filter_by(email=email).first()
            if user:
                user.firebase_uid = uid
                if role: user.role = role
                if username: user.username = username
            else:
                # Handle username collision
                base_username = username or email.split('@')[0]
                final_username = base_username
                counter = 1
                while User.query.filter_by(username=final_username).first():
                    final_username = f"{base_username}{counter}"
                    counter += 1
                
                user = User(
                    username=final_username,
                    email=email,
                    firebase_uid=uid,
                    role=role
                )
                db.session.add(user)
            
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                # If commit fails (maybe due to race condition), try finding user again
                user = User.query.filter_by(firebase_uid=uid).first()
                if not user:
                    return jsonify({'message': 'Registration error. Please try again.'}), 500
        else:
            # Update role/username if provided
            if role and user.role != role:
                user.role = role
            if username and user.username != username:
                # Only update if new username is not taken
                if not User.query.filter_by(username=username).first():
                    user.username = username
            db.session.commit()

        return jsonify({
            'message': 'Authenticated',
            'user': user.to_dict(),
            'token': id_token 
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': str(e)}), 401

@app.route('/api/login', methods=['POST'])
def login():
    # Legacy login fallback
    data = request.get_json()
    user = User.query.filter_by(email=data['email']).first()
    if not user or (user.password_hash and not check_password_hash(user.password_hash, data['password'])):
        return jsonify({'message': 'Invalid credentials'}), 401
    
    token = jwt.encode({
        'user_id': user.id,
        'role': user.role,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({
        'token': token, 
        'role': user.role, 
        'username': user.username, 
        'user_id': user.id,
        'is_profile_complete': user.is_profile_complete
    })

@app.route('/api/user/profile', methods=['PUT'])
@token_required
def update_profile(current_user):
    data = request.get_json()
    try:
        current_user.username = data.get('username', current_user.username)
        current_user.gender = data.get('gender', current_user.gender)
        current_user.age = data.get('age', current_user.age)
        current_user.height = data.get('height', current_user.height)
        current_user.weight = data.get('weight', current_user.weight)
        current_user.phone_number = data.get('phone_number', current_user.phone_number)
        current_user.is_profile_complete = True
        
        db.session.commit()
        return jsonify({'message': 'Profile updated successfully', 'user': current_user.to_dict()}), 200
    except Exception as e:
        return jsonify({'message': str(e)}), 400

@app.route('/api/analyze-report', methods=['POST'])
@token_required
def analyze_report_endpoint(current_user):
    if 'file' not in request.files:
        return jsonify({'message': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Unique filename to avoid collision
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"{current_user.id}_{timestamp}_{filename}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        file.save(file_path)
        
        # Analyze
        analysis = analyze_medical_report(file_path)
        
        if "error" in analysis:
            return jsonify({'message': analysis["error"]}), 500
        
        # Save to DB
        new_report = MedicalReport(
            patient_id=current_user.id,
            report_name=filename,
            report_path=unique_filename,
            risk_level=analysis["risk_level"],
            confidence=analysis["confidence"],
            summary=analysis["summary"],
            extracted_data=analysis["parameters"],
            ai_explanation=analysis["ai_explanation"],
            health_plan=analysis["health_plan"],
            recommended_department=analysis["department"],
            explanation=analysis["summary"] # For backward compatibility
        )
        db.session.add(new_report)
        db.session.commit()
        
        return jsonify({
            'message': 'Report analyzed successfully',
            'report': new_report.to_dict()
        }), 201
    
    return jsonify({'message': 'Invalid file type. Only PDF and images allowed.'}), 400

@app.route('/api/reports', methods=['GET'])
@token_required
def get_reports(current_user):
    reports = MedicalReport.query.filter_by(patient_id=current_user.id).order_by(MedicalReport.created_at.desc()).all()
    return jsonify({'reports': [r.to_dict() for r in reports]})


@app.route('/api/report-chat', methods=['POST'])
@token_required
def report_chat(current_user):
    """AI Chatbot: answers a patient's question about their report context."""
    data = request.get_json()
    question = (data.get('question') or '').strip()
    report_id = data.get('report_id')

    if not question:
        return jsonify({'message': 'Question is required'}), 400

    report = MedicalReport.query.filter_by(id=report_id, patient_id=current_user.id).first()
    if not report:
        return jsonify({'message': 'Report not found'}), 404

    answer = answer_report_question(question, report.extracted_data, report.ai_explanation)
    return jsonify({'answer': answer}), 200

# ─── Appointment Routes ───────────────────────────────────────────────────────
@app.route('/api/appointments', methods=['POST'])
@token_required
def create_appointment(current_user):
    if current_user.role != 'patient':
        return jsonify({'message': 'Only patients can book appointments'}), 403
    data = request.get_json()
    ai_result = classify_risk(data)
    new_appt = Appointment(
        patient_id=current_user.id,
        patient_name=data.get('patient_name', current_user.username),
        age=data['age'],
        gender=data['gender'],
        symptoms=data['symptoms'],
        vitals=data.get('vitals', ''),
        pre_existing_conditions=data.get('pre_existing_conditions', ''),
        risk_level=ai_result['risk_level'],
        recommended_department=ai_result['recommended_department'],
        status='Pending'
    )
    db.session.add(new_appt)
    db.session.commit()
    return jsonify({
        'message': 'Appointment request submitted',
        'appointment_id': new_appt.id,
        'ai_analysis': ai_result
    }), 201

@app.route('/api/patient/dashboard', methods=['GET'])
@token_required
def patient_dashboard(current_user):
    if current_user.role != 'patient':
        return jsonify({'message': 'Unauthorized'}), 403
    appointments = Appointment.query.filter_by(patient_id=current_user.id).all()
    appt_list = [appt.to_dict() for appt in appointments]
    return jsonify({
        'user': current_user.to_dict(),
        'appointments': appt_list,
        'total_appointments': len(appt_list)
    })

@app.route('/api/doctor/dashboard', methods=['GET'])
@token_required
def doctor_dashboard(current_user):
    if current_user.role != 'doctor':
        return jsonify({'message': 'Unauthorized'}), 403
    appointments = Appointment.query.all()
    def risk_priority(appt):
        priorities = {'High': 0, 'Medium': 1, 'Low': 2}
        return priorities.get(appt.risk_level, 3)
    sorted_appointments = sorted(appointments, key=risk_priority)
    return jsonify({
        'user': current_user.to_dict(),
        'appointments': [a.to_dict() for a in sorted_appointments]
    })

@app.route('/api/doctor/appointment/<int:id>', methods=['PUT'])
@token_required
def manage_appointment(current_user, id):
    if current_user.role != 'doctor':
        return jsonify({'message': 'Unauthorized'}), 403
    data = request.get_json()
    status = data.get('status')
    appt = Appointment.query.get_or_404(id)
    appt.status = status
    appt.doctor_id = current_user.id
    if 'appointment_date' in data and data['appointment_date']:
        appt.appointment_date = datetime.datetime.fromisoformat(data['appointment_date'])
    db.session.commit()
    return jsonify({'message': f'Appointment {status}'})

# ─── Chat Routes ──────────────────────────────────────────────────────────────

@app.route('/api/chat/doctors', methods=['GET'])
@token_required
def get_doctors(current_user):
    """Return list of all doctors for patient to chat with."""
    doctors = User.query.filter_by(role='doctor').all()
    return jsonify({'doctors': [d.to_dict() for d in doctors]})

@app.route('/api/chat/messages/<int:other_user_id>', methods=['GET'])
@token_required
def get_messages(current_user, other_user_id):
    """Get all messages between current user and other_user_id."""
    messages = ChatMessage.query.filter(
        db.or_(
            db.and_(ChatMessage.sender_id == current_user.id, ChatMessage.receiver_id == other_user_id),
            db.and_(ChatMessage.sender_id == other_user_id, ChatMessage.receiver_id == current_user.id)
        )
    ).order_by(ChatMessage.created_at.asc()).all()
    return jsonify({'messages': [m.to_dict() for m in messages]})

@app.route('/api/chat/send', methods=['POST'])
@token_required
def send_message(current_user):
    """Send a text message."""
    data = request.get_json()
    receiver_id = data.get('receiver_id')
    message_text = data.get('message', '').strip()

    if not receiver_id or not message_text:
        return jsonify({'message': 'receiver_id and message are required'}), 400

    receiver = User.query.get(receiver_id)
    if not receiver:
        return jsonify({'message': 'Receiver not found'}), 404

    new_msg = ChatMessage(
        sender_id=current_user.id,
        receiver_id=receiver_id,
        message=message_text,
        message_type='text'
    )
    db.session.add(new_msg)
    db.session.commit()
    return jsonify({'message': 'Sent', 'chat_message': new_msg.to_dict()}), 201

@app.route('/api/chat/upload', methods=['POST'])
@token_required
def upload_image(current_user):
    """Upload an image and send it as a chat message."""
    receiver_id = request.form.get('receiver_id')
    if not receiver_id:
        return jsonify({'message': 'receiver_id is required'}), 400

    if 'file' not in request.files:
        return jsonify({'message': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'message': 'No selected file'}), 400

    if not allowed_file(file.filename):
        return jsonify({'message': 'File type not allowed'}), 400

    filename = secure_filename(f"{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}_{file.filename}")
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    image_url = f"/api/uploads/{filename}"

    new_msg = ChatMessage(
        sender_id=current_user.id,
        receiver_id=int(receiver_id),
        message=None,
        image_url=image_url,
        message_type='image'
    )
    db.session.add(new_msg)
    db.session.commit()
    return jsonify({'message': 'Image sent', 'chat_message': new_msg.to_dict()}), 201

@app.route('/api/uploads/<filename>', methods=['GET'])
def serve_upload(filename):
    """Serve uploaded files."""
    return send_from_directory(UPLOAD_FOLDER, filename)

# ─── General AI Chatbot ───────────────────────────────────────────────────────
@app.route('/api/ai-chat', methods=['POST'])
@token_required
def ai_chat(current_user):
    """General-purpose Gemini AI health chatbot for the website."""
    from report_analyzer import _call_gemini
    data = request.get_json()
    message = (data.get('message') or '').strip()
    history = data.get('history', [])  # list of {role, text} for multi-turn context

    if not message:
        return jsonify({'message': 'Message is required'}), 400

    # Build conversation context from history (last 6 turns to keep prompt short)
    context_lines = []
    for turn in history[-6:]:
        role = 'Patient' if turn.get('role') == 'user' else 'Dr. AI'
        context_lines.append(f"{role}: {turn.get('text', '')}")
    context = '\n'.join(context_lines)

    prompt = (
        "You are Dr. AI, a knowledgeable medical assistant on the Dr. Consultancy platform.\n"
        "You help patients understand health topics, symptoms, medications, and medical reports.\n\n"
        "CRITICAL INSTRUCTION: You MUST respond ONLY with a single valid JSON object.\n"
        "No markdown code fences, no backticks, no extra text before or after the JSON.\n\n"
        "Use EXACTLY this JSON structure:\n"
        "{\n"
        '  "risk": { "level": "low", "label": "Low Risk" },\n'
        '  "summary": "One clear sentence summarizing the health topic or finding.",\n'
        '  "bullets": ["Key fact 1", "Key fact 2", "Key fact 3"],\n'
        '  "factors": ["Contributing factor or cause 1", "Contributing factor 2"],\n'
        '  "vitals": [{ "name": "Blood Pressure", "value": "130/85", "unit": "mmHg", "normal": "< 120/80", "status": "elevated" }],\n'
        '  "advice": ["Concrete action step 1", "Action step 2"],\n'
        '  "disclaimer": "This is general health information only. Please consult your doctor for personal medical advice."\n'
        "}\n\n"
        "Field rules:\n"
        "- risk.level: MUST be exactly one of: low, medium, high, critical\n"
        "- risk.label: matching human label e.g. 'Low Risk', 'Moderate Risk', 'High Risk', 'Critical — See a Doctor'\n"
        "- summary: 1 sentence, warm and clear\n"
        "- bullets: 3-5 key facts or explanations about the topic\n"
        "- factors: 2-4 contributing causes or risk factors. Use [] if none apply.\n"
        "- vitals: ONLY include when specific numbers/measurements are discussed. "
        "  status must be exactly one of: normal, low, elevated, high, critical. Use [] if no vitals mentioned.\n"
        "- advice: 2-4 actionable steps the patient should take\n"
        "- disclaimer: always include this field\n"
        "- Tone: warm, supportive, non-alarming, easy to understand\n\n"
        + (f"Previous conversation:\n{context}\n\n" if context else "")
        + f"Patient question: {message}\n\nDr. AI JSON response:"
    )

    answer = _call_gemini(prompt, temperature=0.5)
    if not answer:
        answer = (
            "I'm sorry, I'm having a little trouble connecting right now. "
            "Please try again in a moment, or feel free to ask your doctor directly."
        )

    # Strip markdown code fences Gemini sometimes adds despite instructions
    import re as _re
    answer = answer.strip()
    answer = _re.sub(r'^```[a-zA-Z]*\s*', '', answer)
    answer = _re.sub(r'\s*```$', '', answer)
    answer = answer.strip()

    return jsonify({'answer': answer}), 200

# ─── Voice Triage ────────────────────────────────────────────────────────────
@app.route('/api/voice-triage', methods=['POST'])
@token_required
def voice_triage(current_user):
    """
    Multilingual voice triage endpoint.

    Request body (JSON):
        transcript  str   – raw speech-to-text transcript (required)
        lang        str   – BCP-47 language code, e.g. 'en-US' or 'te-IN' (optional)
        vitals      dict  – { systolic_bp, diastolic_bp, heart_rate, spo2 } (optional)

    Response (JSON):
        clean_transcript, translated, extracted_data,
        risk_level, department, confidence, ai_response,
        emergency, trigger_reasons
    """
    from services.triage_engine import run_triage

    data = request.get_json(silent=True) or {}
    transcript = (data.get('transcript') or '').strip()
    lang = (data.get('lang') or 'en').strip()
    vitals = data.get('vitals') or {}

    if not transcript:
        return jsonify({'message': 'transcript is required'}), 400

    # Sanitise vitals — coerce numeric strings
    clean_vitals = {}
    for key in ('systolic_bp', 'diastolic_bp', 'heart_rate', 'spo2'):
        val = vitals.get(key)
        if val is not None:
            try:
                clean_vitals[key] = float(val)
            except (TypeError, ValueError):
                pass

    try:
        result = run_triage(transcript, clean_vitals, lang)
        return jsonify(result), 200
    except Exception as e:
        app.logger.error(f'[voice-triage] Error: {e}')
        return jsonify({'message': f'Triage processing error: {str(e)}'}), 500

# ─── Doctor Chat: get patient list ───────────────────────────────────────────
@app.route('/api/chat/patients', methods=['GET'])
@token_required
def get_patients(current_user):
    """Return list of all patients for doctor to chat with."""
    patients = User.query.filter_by(role='patient').all()
    return jsonify({'patients': [p.to_dict() for p in patients]})
