"""
AI Patient Scheduling Service
==============================
Centralises all priority-score logic so that every place in the codebase
(appointment creation, next-patient recommendation, socket payload) uses the
exact same formula.

Priority score formula
----------------------
  risk_weight  →  High = 3 | Medium = 2 | Low = 1
  waiting_score = waiting_minutes / 5
  priority_score = (risk_weight × 3) + waiting_score

Queue position
--------------
  Computed by counting how many *pending* patients currently have a higher
  priority score than the new patient.  Position is 1-indexed so the doctor
  sees "Position 1" for the top-of-queue patient.
"""

import datetime
import re

RISK_WEIGHT = {'High': 3, 'Medium': 2, 'Low': 1}

# ---------------------------------------------------------------------------
# Core scoring helpers
# ---------------------------------------------------------------------------

def compute_priority_score(risk_level: str, waiting_minutes: float = 0.0) -> float:
    """Return the priority score for a patient given risk level + time waiting."""
    weight = RISK_WEIGHT.get(risk_level, 1)
    waiting_score = waiting_minutes / 5.0
    return round((weight * 3) + waiting_score, 1)


def compute_queue_position(pending_appointments, new_priority_score: float, new_risk_level: str) -> int:
    """
    Return the 1-indexed queue position the new patient would occupy if inserted
    right now, based on pending appointment records that already have risk_level
    set (i.e. post-DB-commit records or already-scored dicts).

    Patients with a higher priority score sit ahead; ties broken by risk weight.
    """
    new_weight = RISK_WEIGHT.get(new_risk_level, 1)
    ahead = 0
    now = datetime.datetime.utcnow()

    for appt in pending_appointments:
        # Support both ORM objects and plain dicts (unit-testable)
        if isinstance(appt, dict):
            risk = appt.get('risk_level', 'Low')
            created = appt.get('created_at')
            if isinstance(created, str):
                try:
                    created = datetime.datetime.fromisoformat(created)
                except ValueError:
                    created = None
        else:
            risk = appt.risk_level or 'Low'
            created = appt.created_at

        weight = RISK_WEIGHT.get(risk, 1)
        if created:
            wait_min = max(0, (now - created).total_seconds() / 60)
        else:
            wait_min = 10.0

        score = compute_priority_score(risk, wait_min)

        # Strictly ahead: higher score OR same score with higher risk weight
        if score > new_priority_score or (score == new_priority_score and weight > new_weight):
            ahead += 1

    return ahead + 1  # 1-indexed


def build_triage_payload(appt, ai_result: dict, priority_score: float, queue_position: int) -> dict:
    """
    Build the complete dict that is both emitted over the socket to doctors
    and returned in the HTTP response to the patient.
    """
    return {
        'id':             appt.id,
        'patient_id':     f'P{appt.patient_id}',
        'name':           appt.patient_name,
        'age':            appt.age,
        'gender':         appt.gender,
        'symptoms':       appt.symptoms,
        'department':     appt.recommended_department,
        'risk_level':     appt.risk_level,
        'confidence':     round(ai_result.get('risk_score', 1) / 8.0, 2),
        'status':         appt.status,
        'pre_existing_conditions': appt.pre_existing_conditions,
        'vitals_raw':     appt.vitals,
        'vitals_structured': _parse_vitals(appt.vitals or ''),
        'priority_score': priority_score,
        'queue_position': queue_position,
        'ai_explanation': {
            'possible_concern': f"{appt.recommended_department} condition detected",
            'factors':          ai_result.get('reasons', []),
            'advice': (
                'Immediate consultation recommended — patient requires urgent attention.'
                if appt.risk_level == 'High'
                else f'Schedule {appt.recommended_department} review promptly.'
            ),
        },
    }


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

REQUIRED_FIELDS = ['age', 'gender', 'symptoms']

def validate_appointment_data(data: dict) -> list[str]:
    """Return a list of error strings; empty list means data is valid."""
    errors = []

    for field in REQUIRED_FIELDS:
        if not data.get(field):
            errors.append(f"'{field}' is required.")

    age = data.get('age')
    if age is not None:
        try:
            age_int = int(age)
            if not (1 <= age_int <= 120):
                errors.append("'age' must be between 1 and 120.")
        except (ValueError, TypeError):
            errors.append("'age' must be a number.")

    symptoms = str(data.get('symptoms', '')).strip()
    if symptoms and len(symptoms) < 5:
        errors.append("'symptoms' must be at least 5 characters.")

    return errors


# ---------------------------------------------------------------------------
# Duplicate guard
# ---------------------------------------------------------------------------

def is_duplicate_appointment(Appointment, patient_id: int, symptoms: str, window_minutes: int = 30) -> bool:
    """
    Return True if the patient already has a Pending appointment with the same
    normalised symptoms submitted within the last `window_minutes` minutes.
    """
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=window_minutes)
    existing = Appointment.query.filter_by(
        patient_id=patient_id,
        status='Pending',
    ).filter(
        Appointment.created_at >= cutoff
    ).all()

    # Normalise: lowercase, strip whitespace, collapse spaces
    def normalise(s):
        return re.sub(r'\s+', ' ', s.lower().strip())

    norm_new = normalise(symptoms)
    for appt in existing:
        if normalise(appt.symptoms or '') == norm_new:
            return True
    return False


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _parse_vitals(vitals_str: str) -> dict:
    structured = {}
    if not vitals_str:
        return structured
    raw = vitals_str.upper()
    bp_match = re.search(r'BP[:\s]*(\d+/\d+)', raw)
    if bp_match:
        structured['bp'] = bp_match.group(1)
    hr_match = re.search(r'HR[:\s]*(\d+)', raw)
    if hr_match:
        structured['heart_rate'] = int(hr_match.group(1))
    temp_match = re.search(r'TEMP(?:ERATURE)?[:\s]*(\d+\.?\d*)', raw)
    if temp_match:
        structured['temperature'] = float(temp_match.group(1))
    spo2_match = re.search(r'SPO2[:\s]*(\d+)', raw)
    if spo2_match:
        structured['spo2'] = int(spo2_match.group(1))
    return structured
