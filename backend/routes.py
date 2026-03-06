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

@app.route('/api/doctor/stats', methods=['GET'])
@token_required
def doctor_stats(current_user):
    """
    Returns aggregated statistics for the Doctor Dashboard:
      - total_patients_today
      - high_risk_count
      - average_waiting_time  (estimated: 20 min base + 5 min per high-risk)
      - department_load       (per recommended_department)
      - risk_distribution     (Low / Medium / High counts)
    """
    if current_user.role != 'doctor':
        return jsonify({'message': 'Unauthorized'}), 403

    all_appts = Appointment.query.all()

    # ── Total patients today ──────────────────────────────────────────────────
    today = datetime.date.today()
    today_appts = [
        a for a in all_appts
        if a.created_at and a.created_at.date() == today
    ]
    # Fall back to all appointments if none were created today (dev / mock data)
    population = today_appts if today_appts else all_appts
    total_today = len(population)

    # ── Risk counts ───────────────────────────────────────────────────────────
    high_count   = sum(1 for a in population if a.risk_level == 'High')
    medium_count = sum(1 for a in population if a.risk_level == 'Medium')
    low_count    = sum(1 for a in population if a.risk_level == 'Low')

    # ── Estimated average waiting time ────────────────────────────────────────
    avg_wait = round(20 + (high_count * 5 / max(total_today, 1)), 1)

    # ── Department load ───────────────────────────────────────────────────────
    dept_counts = {}
    for a in population:
        dept = a.recommended_department or 'General Medicine'
        dept_counts[dept] = dept_counts.get(dept, 0) + 1

    # If no real data, return illustrative mock data so charts always render
    if not dept_counts:
        dept_counts = {
            'General Medicine': 15,
            'Cardiology': 12,
            'Neurology': 8,
            'Emergency': 13,
        }

    department_load = [{'department': k, 'count': v} for k, v in dept_counts.items()]

    # ── Risk distribution ─────────────────────────────────────────────────────
    if total_today == 0:
        risk_distribution = [
            {'risk': 'Low',    'value': 24},
            {'risk': 'Medium', 'value': 14},
            {'risk': 'High',   'value': 10},
        ]
    else:
        risk_distribution = [
            {'risk': 'Low',    'value': low_count},
            {'risk': 'Medium', 'value': medium_count},
            {'risk': 'High',   'value': high_count},
        ]

    return jsonify({
        'total_patients_today': total_today if total_today else 48,
        'high_risk_count':      high_count  if total_today else 12,
        'average_waiting_time': avg_wait    if total_today else 18,
        'department_load':      department_load,
        'risk_distribution':    risk_distribution,
    })


@app.route('/api/doctor/patient-queue', methods=['GET'])
@token_required
def doctor_patient_queue(current_user):
    """
    Return the full patient queue enriched with AI triage explanation.
    Patients are sorted: High → Medium → Low risk.
    """
    if current_user.role != 'doctor':
        return jsonify({'message': 'Unauthorized'}), 403

    appointments = Appointment.query.all()

    def _risk_order(level):
        return {'High': 0, 'Medium': 1, 'Low': 2}.get(level, 3)

    def _parse_vitals(vitals_str):
        """Parse 'BP:120/80, HR:72, Temp:98.6' into a structured dict."""
        structured = {}
        if not vitals_str:
            return structured
        raw = vitals_str.upper()
        # Blood pressure
        import re as _re
        bp_match = _re.search(r'BP[:\s]*(\d+/\d+)', raw)
        if bp_match:
            structured['bp'] = bp_match.group(1)
        # Heart rate
        hr_match = _re.search(r'HR[:\s]*(\d+)', raw)
        if hr_match:
            structured['heart_rate'] = int(hr_match.group(1))
        # Temperature
        temp_match = _re.search(r'TEMP(?:ERATURE)?[:\s]*(\d+\.?\d*)', raw)
        if temp_match:
            structured['temperature'] = float(temp_match.group(1))
        # SpO2
        spo2_match = _re.search(r'SPO2[:\s]*(\d+)', raw)
        if spo2_match:
            structured['spo2'] = int(spo2_match.group(1))
        return structured

    def _build_explanation(appt, reasons, confidence):
        """Build an ai_explanation dict from appointment data."""
        risk = appt.risk_level or 'Low'
        dept = appt.recommended_department or 'General Medicine'
        symptoms = (appt.symptoms or '').lower()
        conditions = (appt.pre_existing_conditions or '').lower()

        # Possible concern mapping
        concern_map = {
            'Cardiology':   'Possible cardiac condition requiring prompt evaluation',
            'Pulmonology':  'Respiratory distress or pulmonary condition',
            'Neurology':    'Neurological involvement — further assessment needed',
            'Emergency':    'Acute emergency condition — immediate attention required',
            'Orthopedics':  'Musculoskeletal injury or disorder',
            'Gastroenterology': 'Gastrointestinal condition requiring investigation',
        }
        possible_concern = concern_map.get(dept, f'General medical condition routed to {dept}')

        # Contributing factors (merge AI reasons with condition-based ones)
        factors = list(reasons)[:4]  # cap at 4
        if not factors:
            if risk == 'High':
                factors.append('Severe or acute symptom presentation')
            elif risk == 'Medium':
                factors.append('Moderate symptom severity')
            else:
                factors.append('Mild or non-urgent presentation')
        if conditions and conditions != 'none' and 'condition' not in ' '.join(factors).lower():
            factors.append(f'Pre-existing: {appt.pre_existing_conditions}')

        # Immediate advice
        advice_map = {
            'High':   f'Immediate consultation with {dept} recommended. Do not delay — patient may require urgent intervention.',
            'Medium': f'Schedule a {dept} appointment within 24–48 hours. Monitor vitals closely in the meantime.',
            'Low':    f'Routine {dept} review recommended. Standard monitoring and follow-up as needed.',
        }
        advice = advice_map.get(risk, 'Please consult the appropriate department.')

        return {
            'possible_concern': possible_concern,
            'factors': factors,
            'advice': advice,
        }

    result = []
    for appt in appointments:
        classification = classify_risk({
            'age': appt.age or 30,
            'symptoms': appt.symptoms or '',
            'vitals': appt.vitals or '',
            'pre_existing_conditions': appt.pre_existing_conditions or '',
        })
        reasons = classification.get('reasons', [])
        risk_score = classification.get('risk_score', 0)
        # Normalize confidence: map risk_score to a 0-1 float
        max_score = 8.0
        confidence = round(min(risk_score / max_score, 1.0), 2) if risk_score else 0.45

        vitals_structured = _parse_vitals(appt.vitals or '')
        ai_explanation = _build_explanation(appt, reasons, confidence)

        result.append({
            'id':             appt.id,
            'patient_id':     f'P{appt.patient_id}',
            'name':           appt.patient_name or f'Patient #{appt.patient_id}',
            'age':            appt.age,
            'gender':         appt.gender,
            'symptoms':       appt.symptoms,
            'department':     appt.recommended_department or 'General Medicine',
            'risk_level':     appt.risk_level or 'Low',
            'confidence':     confidence,
            'status':         appt.status,
            'pre_existing_conditions': appt.pre_existing_conditions,
            'vitals_raw':     appt.vitals,
            'vitals_structured': vitals_structured,
            'ai_explanation': ai_explanation,
            'created_at':     appt.created_at.isoformat() if appt.created_at else None,
        })

    # Sort: High first, then Medium, then Low; stable sort preserves insertion order within same risk
    result.sort(key=lambda x: _risk_order(x['risk_level']))

    # If no real DB data, return illustrative mock records so the UI always renders
    if not result:
        result = [
            {
                'id': 1001, 'patient_id': 'P101', 'name': 'Ravi Kumar', 'age': 58, 'gender': 'Male',
                'symptoms': 'Chest pain, shortness of breath, sweating',
                'department': 'Cardiology', 'risk_level': 'High', 'confidence': 0.91,
                'status': 'Pending', 'pre_existing_conditions': 'Hypertension, Diabetes',
                'vitals_raw': 'BP:175/100, HR:115, Temp:98.7',
                'vitals_structured': {'bp': '175/100', 'heart_rate': 115, 'temperature': 98.7},
                'ai_explanation': {
                    'possible_concern': 'Possible cardiac event — acute onset chest pain with hypertension',
                    'factors': ['BP critically elevated (175/100)', 'Heart rate above normal (115 bpm)', 'High-risk symptom: chest pain', 'Age above 50 with diabetes'],
                    'advice': 'Immediate cardiology consultation. ECG and troponin levels required urgently.',
                },
                'created_at': None,
            },
            {
                'id': 1002, 'patient_id': 'P102', 'name': 'Priya Sharma', 'age': 34, 'gender': 'Female',
                'symptoms': 'High fever, vomiting, abdominal pain for 2 days',
                'department': 'Gastroenterology', 'risk_level': 'Medium', 'confidence': 0.67,
                'status': 'Pending', 'pre_existing_conditions': 'None',
                'vitals_raw': 'BP:118/76, HR:96, Temp:102.4',
                'vitals_structured': {'bp': '118/76', 'heart_rate': 96, 'temperature': 102.4},
                'ai_explanation': {
                    'possible_concern': 'Acute gastroenteritis or possible appendicitis',
                    'factors': ['High fever (102.4°F)', 'Medium-risk symptom: vomiting', 'Persistent abdominal pain for 2 days'],
                    'advice': 'Schedule gastroenterology review within 24 hours. Rehydration and close monitoring recommended.',
                },
                'created_at': None,
            },
            {
                'id': 1003, 'patient_id': 'P103', 'name': 'Anil Reddy', 'age': 45, 'gender': 'Male',
                'symptoms': 'Mild headache, fatigue, mild cough',
                'department': 'General Medicine', 'risk_level': 'Low', 'confidence': 0.42,
                'status': 'Approved', 'pre_existing_conditions': 'Mild asthma',
                'vitals_raw': 'BP:122/80, HR:74, Temp:98.2',
                'vitals_structured': {'bp': '122/80', 'heart_rate': 74, 'temperature': 98.2},
                'ai_explanation': {
                    'possible_concern': 'Upper respiratory tract infection or tension headache',
                    'factors': ['Non-acute symptom presentation', 'Pre-existing mild asthma', 'Normal vital signs'],
                    'advice': 'Routine general medicine review. Rest, hydration, and OTC medication as needed.',
                },
                'created_at': None,
            },
        ]

    return jsonify(result), 200


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
    from report_analyzer import _call_gemini, _call_gemini_multimodal
    data = request.get_json()
    message = (data.get('message') or '').strip()
    history = data.get('history', [])  # list of {role, text} for multi-turn context
    images = data.get('images', [])   # list of {data: base64str, mimeType: str}

    if not message and not images:
        return jsonify({'message': 'Message is required'}), 400

    # Build conversation context from history (last 6 turns to keep prompt short)
    context_lines = []
    for turn in history[-6:]:
        role = 'Patient' if turn.get('role') == 'user' else 'Dr. AI'
        context_lines.append(f"{role}: {turn.get('text', '')}")
    context = '\n'.join(context_lines)

    # Build the patient input section — richer instruction when images are attached
    if images:
        image_count = len(images)
        image_instruction = (
            f"The patient has shared {image_count} medical image(s) — this could be a lab report, "
            "prescription, scan result, X-ray, blood test, or any medical document. \n"
            "Carefully read and analyze every visible value, text, result, and finding in the image(s).\n"
            "Extract:\n"
            "- All test names and their values with units\n"
            "- Which values are normal, elevated, low, or critical\n"
            "- Any diagnoses, conditions, or doctor notes visible\n"
            "- Medications or prescriptions if present\n"
            "- Any abnormal or concerning findings\n\n"
        )
        # Append the patient's own question if it's a real question (not auto-generated)
        auto_msgs = {'please analyze this medical image/report and explain all findings in detail.', 'i shared 1 file(s).'}
        if message and message.lower().strip() not in auto_msgs:
            image_instruction += f"The patient also asks: {message}\n\n"
        patient_section = image_instruction
    else:
        patient_section = f"Patient question: {message}\n\n"

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
        "- bullets: 3-5 key facts or explanations about the topic. For image reports, list each important test result as a bullet.\n"
        "- factors: 2-4 contributing causes or risk factors. Use [] if none apply.\n"
        "- vitals: Extract ANY measurements visible in the image — blood pressure, glucose, hemoglobin, cholesterol, etc. "
        "  status must be exactly one of: normal, low, elevated, high, critical. Use [] if no measurements found.\n"
        "- advice: 2-4 actionable steps the patient should take based on these findings\n"
        "- disclaimer: always include this field\n"
        "- Tone: warm, supportive, non-alarming, easy to understand\n\n"
        + (f"Previous conversation:\n{context}\n\n" if context else "")
        + patient_section
        + "Dr. AI JSON response:"
    )

    if images:
        answer = _call_gemini_multimodal(prompt, images, temperature=0.4)
    else:
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
