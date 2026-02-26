"""
Mock ML triage model.
In production, replace predict_risk() with a real trained classifier
(e.g. scikit-learn, PyTorch, or a fine-tuned LLM endpoint).
"""

# Risk keyword buckets — ordered high → medium → low
KEYWORD_RISK_MAP = {
    "high": [
        "chest pain", "heart attack", "stroke", "can't breathe", "unconscious",
        "seizure", "severe bleeding", "shortness of breath", "crushing pressure",
        "anaphylaxis", "severe allergic", "overdose", "loss of consciousness",
    ],
    "medium": [
        "fever", "infection", "moderate pain", "vomiting", "dizziness",
        "headache", "abdominal pain", "back pain", "high blood pressure",
        "swelling", "fatigue with pain",
    ],
    "low": [
        "cold", "cough", "mild pain", "runny nose", "sore throat",
        "fatigue", "mild headache", "sneezing", "body ache",
    ],
}

# Symptom → department mapping
DEPARTMENT_MAP = {
    "chest": "Cardiology",
    "heart": "Cardiology",
    "palpitation": "Cardiology",
    "headache": "Neurology",
    "stroke": "Neurology",
    "seizure": "Neurology",
    "memory": "Neurology",
    "breathe": "Pulmonology",
    "breathing": "Pulmonology",
    "lung": "Pulmonology",
    "cough": "Pulmonology",
    "abdomen": "Gastroenterology",
    "stomach": "Gastroenterology",
    "nausea": "Gastroenterology",
    "vomit": "Gastroenterology",
    "joint": "Orthopedics",
    "bone": "Orthopedics",
    "fracture": "Orthopedics",
    "skin": "Dermatology",
    "rash": "Dermatology",
    "itch": "Dermatology",
    "urine": "Urology",
    "kidney": "Urology",
    "eye": "Ophthalmology",
    "vision": "Ophthalmology",
    "ear": "ENT",
    "throat": "ENT",
    "nose": "ENT",
    "mental": "Psychiatry",
    "anxiety": "Psychiatry",
    "depression": "Psychiatry",
}


def predict_risk(patient_data: dict) -> dict:
    """
    Predict triage risk level and recommend department from extracted symptom data.

    Args:
        patient_data: dict from symptom_extractor.extract_symptoms()

    Returns:
        { 'risk_level': str, 'confidence': float, 'department': str }
    """
    # Build flat text from all symptom fields
    all_text = " ".join([
        " ".join(patient_data.get("primary_symptoms", [])),
        " ".join(patient_data.get("secondary_symptoms", [])),
        patient_data.get("severity", ""),
        patient_data.get("duration", ""),
    ]).lower()

    risk_level = "low"
    confidence = 0.70

    # Walk risk buckets highest → lowest; stop at first match
    for level, keywords in KEYWORD_RISK_MAP.items():
        for kw in keywords:
            if kw in all_text:
                risk_level = level
                confidence = {"high": 0.93, "medium": 0.82, "low": 0.70}[level]
                break
        if risk_level == level and level != "low":
            break

    # Override if the extraction engine already flagged emergency
    if patient_data.get("possible_emergency_flag"):
        risk_level = "high"
        confidence = 0.96

    # Determine department
    department = "General Medicine"
    for kw, dept in DEPARTMENT_MAP.items():
        if kw in all_text:
            department = dept
            break

    return {
        "risk_level": risk_level,
        "confidence": round(confidence, 2),
        "department": department,
    }
