"""
Triage engine: orchestrates translation → extraction → rules → ML → AI response.
Returns the complete structured triage result.
"""
import re


def generate_clinical_response(
    transcript: str,
    extracted_data: dict,
    vitals: dict,
    model_prediction: dict,
    emergency_data: dict,
) -> str:
    """
    Generate a structured clinical AI response using Gemini.
    Returns a formatted multi-line string (not JSON).
    """
    from report_analyzer import _call_gemini

    symptoms_str = ", ".join(
        extracted_data.get("primary_symptoms", []) +
        extracted_data.get("secondary_symptoms", [])
    ) or "Not specified"

    vitals_str = "Not provided"
    if vitals:
        parts = []
        if vitals.get("systolic_bp") and vitals.get("diastolic_bp"):
            parts.append(f"BP: {vitals['systolic_bp']}/{vitals['diastolic_bp']} mmHg")
        if vitals.get("heart_rate"):
            parts.append(f"HR: {vitals['heart_rate']} bpm")
        if vitals.get("spo2"):
            parts.append(f"SpO2: {vitals['spo2']}%")
        if parts:
            vitals_str = ", ".join(parts)

    # Consolidated risk: emergency rules override ML
    risk = emergency_data.get("risk_level") or model_prediction.get("risk_level", "low")
    dept = emergency_data.get("department_override") or model_prediction.get("department", "General Medicine")
    confidence = model_prediction.get("confidence", 0.75)

    trigger_str = "; ".join(emergency_data.get("trigger_reasons", [])) or "None"

    prompt = (
        "You are a Clinical AI Triage Assistant on a hospital platform.\n"
        "Analyze the patient data and produce a structured triage report.\n"
        "Respond ONLY using these exact labeled lines — no JSON, no markdown:\n\n"
        "Risk Level: [low / medium / high / critical]\n"
        "Possible Concern: [1-sentence clinical impression]\n"
        "Contributing Factors: [comma-separated list of contributing factors]\n"
        "Recommended Department: [department name]\n"
        "Urgency Level: [Routine / Urgent / Immediate / Emergency]\n"
        "Immediate Advice: [1-2 short, actionable steps for the patient right now]\n"
        f"Confidence Score: {int(confidence * 100)}%\n"
        "Disclaimer: This is AI-generated triage guidance only. Always consult a licensed physician.\n\n"
        "--- Patient Data ---\n"
        f"Transcript: {transcript}\n"
        f"Extracted Symptoms: {symptoms_str}\n"
        f"Duration: {extracted_data.get('duration') or 'unknown'}\n"
        f"Severity: {extracted_data.get('severity') or 'unknown'}\n"
        f"Vitals: {vitals_str}\n"
        f"Rule Engine Risk: {risk.upper()}\n"
        f"Rule Triggers: {trigger_str}\n"
        f"ML Predicted Dept: {dept}\n"
        "--- End Data ---\n\n"
        "Triage assessment:"
    )

    result = _call_gemini(prompt, temperature=0.3)
    if not result:
        return (
            f"Risk Level: {risk}\n"
            f"Possible Concern: Unable to generate assessment — please see a doctor.\n"
            f"Contributing Factors: {symptoms_str}\n"
            f"Recommended Department: {dept}\n"
            "Urgency Level: Immediate\n"
            "Immediate Advice: Please visit the nearest hospital or emergency room.\n"
            f"Confidence Score: {int(confidence * 100)}%\n"
            "Disclaimer: This is AI-generated triage guidance only. Always consult a licensed physician."
        )
    return result.strip()


def run_triage(transcript: str, vitals: dict, lang: str = "en") -> dict:
    """
    Full triage pipeline:
      1. Translate if Telugu
      2. Extract symptoms
      3. Run emergency rule engine
      4. Run mock ML model
      5. Generate clinical AI response

    Returns the complete structured result dict.
    """
    from services.translation import translate_telugu_to_english
    from services.symptom_extractor import extract_symptoms
    from services.emergency_rules import check_emergency
    from services.mock_model import predict_risk

    translated = False
    clean_transcript = transcript.strip()

    # Step 1: Translate if Telugu
    if lang and ("te" in lang.lower() or "tel" in lang.lower()):
        clean_transcript = translate_telugu_to_english(clean_transcript)
        translated = True

    # Step 2: Extract symptoms
    extracted_data = extract_symptoms(clean_transcript)

    # Step 3: Emergency rules
    emergency_data = check_emergency(vitals or {}, extracted_data)

    # Step 4: ML model prediction
    model_prediction = predict_risk(extracted_data)

    # Unify risk — emergency rules take priority
    final_risk = (
        emergency_data["risk_level"]
        if emergency_data["risk_level"] == "high"
        else model_prediction["risk_level"]
    )
    final_dept = emergency_data.get("department_override") or model_prediction.get("department", "General Medicine")
    is_emergency = final_risk == "high"

    # Step 5: Generate structured clinical response
    ai_response = generate_clinical_response(
        clean_transcript, extracted_data, vitals or {},
        model_prediction, emergency_data,
    )

    return {
        "clean_transcript": clean_transcript,
        "translated": translated,
        "extracted_data": extracted_data,
        "risk_level": final_risk,
        "department": final_dept,
        "confidence": f"{int(model_prediction['confidence'] * 100)}%",
        "ai_response": ai_response,
        "emergency": is_emergency,
        "trigger_reasons": emergency_data.get("trigger_reasons", []),
    }
