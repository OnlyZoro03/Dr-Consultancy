def classify_risk(data):
    """
    Simple rule-based AI for risk classification.
    Data expected:
    - age: int
    - symptoms: list or string
    - vitals: string (e.g. "BP:140/90, HR:100")
    - pre_existing_conditions: string
    """
    risk_score = 0
    department = "General Medicine"
    reasons = []

    age = int(data.get('age', 30))
    symptoms = data.get('symptoms', "").lower()
    vitals = data.get('vitals', "")
    conditions = data.get('pre_existing_conditions', "").lower()

    # Rule 1: Age based risk
    if age > 65 or age < 5:
        risk_score += 1
        reasons.append("Age factor")

    # Rule 2: Keywords in symptoms
    high_risk_keywords = ['chest pain', 'breathing difficulty', 'unconscious', 'severe bleeding', 'stroke']
    medium_risk_keywords = ['fever', 'vomiting', 'diarrhea', 'dizziness', 'fracture']

    for kw in high_risk_keywords:
        if kw in symptoms:
            risk_score += 3
            reasons.append(f"High risk symptom: {kw}")
            if kw in ['chest pain', 'stroke']:
                department = "Cardiology"
            elif kw == 'breathing difficulty':
                department = "Pulmonology"
            break # High risk identified

    if risk_score < 3:
        for kw in medium_risk_keywords:
            if kw in symptoms:
                risk_score += 1
                reasons.append(f"Medium risk symptom: {kw}")

    # Rule 3: Vitals parsing (Simplified)
    # Assume format "BP:120/80"
    if "BP" in vitals:
        try:
            bp_part = vitals.split("BP:")[1].split(",")[0].strip()
            systolic = int(bp_part.split("/")[0])
            if systolic > 160 or systolic < 90:
                risk_score += 2
                reasons.append(f"Abnormal BP: {bp_part}")
                department = "Cardiology"
        except:
            pass

    # Classification
    if risk_score >= 3:
        risk_level = "High"
    elif risk_score >= 1:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    return {
        "risk_level": risk_level,
        "recommended_department": department,
        "reasons": reasons
    }
