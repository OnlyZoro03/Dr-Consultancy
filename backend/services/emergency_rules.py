"""
Rule-based emergency detection engine.
Runs deterministic checks on vitals and extracted symptoms
BEFORE and AFTER the ML model — safety net that the ML must not override.
"""

# Stroke warning keywords (FAST-inspired + clinical additions)
STROKE_KEYWORDS = [
    "face drooping", "facial droop", "arm weakness", "speech difficulty",
    "sudden numbness", "vision loss", "sudden severe headache", "slurred speech",
    "can't speak", "paralysis", "one side weakness",
]

# Cardiac emergency keywords
CARDIAC_KEYWORDS = [
    "chest pain", "chest tightness", "chest pressure", "crushing chest",
    "heart attack", "palpitations with dizziness",
]

# Respiratory emergency keywords
RESPIRATORY_KEYWORDS = [
    "can't breathe", "cannot breathe", "severe breathlessness",
    "suffocating", "choking", "blue lips", "cyanosis",
]


def check_emergency(vitals: dict, extracted_data: dict) -> dict:
    """
    Apply deterministic clinical rules to detect emergencies.

    Args:
        vitals: dict with optional keys: systolic_bp, diastolic_bp, heart_rate, spo2
        extracted_data: output from symptom_extractor.extract_symptoms()

    Returns:
        {
            'risk_level': 'low'|'medium'|'high',
            'department_override': str|None,
            'trigger_reasons': [str],
        }
    """
    risk_level = "low"
    department_override = None
    trigger_reasons = []

    # ── Vital sign rules ─────────────────────────────────────────────────────
    systolic = vitals.get("systolic_bp")
    if systolic:
        try:
            systolic = float(systolic)
            if systolic > 180:
                risk_level = "high"
                department_override = "Emergency / Cardiology"
                trigger_reasons.append(f"Severely elevated systolic BP: {systolic:.0f} mmHg")
            elif systolic > 140 and risk_level != "high":
                risk_level = "medium"
                trigger_reasons.append(f"Elevated systolic BP: {systolic:.0f} mmHg")
        except (TypeError, ValueError):
            pass

    heart_rate = vitals.get("heart_rate")
    if heart_rate:
        try:
            hr = float(heart_rate)
            if hr > 130 or hr < 40:
                risk_level = "high"
                department_override = department_override or "Emergency / Cardiology"
                trigger_reasons.append(f"Critical heart rate: {hr:.0f} bpm")
            elif (hr > 100 or hr < 55) and risk_level == "low":
                risk_level = "medium"
                trigger_reasons.append(f"Abnormal heart rate: {hr:.0f} bpm")
        except (TypeError, ValueError):
            pass

    spo2 = vitals.get("spo2")
    if spo2:
        try:
            o2 = float(spo2)
            if o2 < 90:
                risk_level = "high"
                department_override = department_override or "Emergency / Pulmonology"
                trigger_reasons.append(f"Critically low SpO2: {o2:.0f}%")
            elif o2 < 95 and risk_level == "low":
                risk_level = "medium"
                trigger_reasons.append(f"Low SpO2: {o2:.0f}%")
        except (TypeError, ValueError):
            pass

    # ── Symptom-flag rules ────────────────────────────────────────────────────
    if extracted_data.get("possible_emergency_flag"):
        risk_level = "high"
        department_override = department_override or "Emergency"
        trigger_reasons.append("Symptom cluster indicates possible cardiac/respiratory emergency")

    # Build flat symptom text for keyword scanning
    all_symptoms = (
        extracted_data.get("primary_symptoms", []) +
        extracted_data.get("secondary_symptoms", [])
    )
    symptom_text = " ".join(all_symptoms).lower()

    stroke_hits = [kw for kw in STROKE_KEYWORDS if kw in symptom_text]
    if stroke_hits:
        risk_level = "high"
        department_override = department_override or "Emergency / Neurology"
        trigger_reasons.append(f"Stroke warning signs: {', '.join(stroke_hits)}")

    cardiac_hits = [kw for kw in CARDIAC_KEYWORDS if kw in symptom_text]
    if cardiac_hits and risk_level != "high":
        risk_level = "high"
        department_override = department_override or "Emergency / Cardiology"
        trigger_reasons.append(f"Cardiac emergency keywords: {', '.join(cardiac_hits)}")

    resp_hits = [kw for kw in RESPIRATORY_KEYWORDS if kw in symptom_text]
    if resp_hits:
        risk_level = "high"
        department_override = department_override or "Emergency / Pulmonology"
        trigger_reasons.append(f"Respiratory emergency keywords: {', '.join(resp_hits)}")

    return {
        "risk_level": risk_level,
        "department_override": department_override,
        "trigger_reasons": trigger_reasons,
    }
