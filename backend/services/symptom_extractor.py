"""
Symptom extraction service: parses free-form clinical speech into structured JSON.
"""
import re
import json


# Default empty extraction result
_EMPTY = {
    "primary_symptoms": [],
    "secondary_symptoms": [],
    "duration": "",
    "severity": "",
    "possible_emergency_flag": False,
}


def extract_symptoms(text: str) -> dict:
    """
    Extract structured medical data from patient transcript using Gemini.
    Returns a dict matching the schema above.
    """
    from report_analyzer import _call_gemini

    if not text or not text.strip():
        return dict(_EMPTY)

    prompt = (
        "You are a clinical symptom extraction engine.\n"
        "Extract structured medical data from the patient speech below.\n"
        "Return ONLY valid JSON — no markdown fences, no backticks, no explanations.\n\n"
        "Use EXACTLY this JSON structure:\n"
        "{\n"
        '  "primary_symptoms": ["symptom1", "symptom2"],\n'
        '  "secondary_symptoms": ["symptom3"],\n'
        '  "duration": "2 days",\n'
        '  "severity": "moderate",\n'
        '  "possible_emergency_flag": false\n'
        "}\n\n"
        "Rules:\n"
        "- primary_symptoms: the main complaints the patient mentions.\n"
        "- secondary_symptoms: associated or background symptoms.\n"
        "- duration: how long symptoms have been present (empty string if not stated).\n"
        "- severity: one of mild / moderate / severe — empty string if unknown.\n"
        "- possible_emergency_flag: set true ONLY if chest pain + sweating + dizziness,"
        "  or extreme breathlessness, or stroke signs are present.\n"
        "- Do NOT guess. Only extract what the patient actually states.\n"
        "- No explanation text. JSON only.\n\n"
        f"Patient speech: {text}\n\nExtracted JSON:"
    )

    raw = _call_gemini(prompt, temperature=0.1)
    if not raw:
        return dict(_EMPTY)

    # Strip markdown code fences if present
    raw = re.sub(r'^```[a-zA-Z]*\s*', '', raw.strip())
    raw = re.sub(r'\s*```$', '', raw).strip()

    try:
        data = json.loads(raw)
        # Ensure all expected keys exist
        for key, default in _EMPTY.items():
            data.setdefault(key, default)
        return data
    except (json.JSONDecodeError, ValueError):
        return dict(_EMPTY)
