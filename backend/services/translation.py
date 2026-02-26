"""
Translation service: Telugu → clinical English using Gemini.
"""
import re


def translate_telugu_to_english(text: str) -> str:
    """
    Translate Telugu medical speech to accurate clinical English.
    Returns original text unchanged if translation fails.
    """
    from report_analyzer import _call_gemini

    if not text or not text.strip():
        return text

    prompt = (
        "You are a medical translation assistant.\n"
        "Translate the following Telugu medical speech into accurate clinical English.\n"
        "Preserve symptom meaning precisely.\n"
        "Return ONLY the translated English text — no commentary, no explanation, no formatting.\n\n"
        f"Telugu text: {text}\n\nEnglish translation:"
    )

    result = _call_gemini(prompt, temperature=0.2)
    if not result:
        return text  # fallback: return original
    return result.strip()
