import re
from pdfminer.high_level import extract_text
import pytesseract
from PIL import Image
import os
import json

# Optional: Google Genai SDK for Gemini LLM-powered explanations
try:
    from google import genai as genaipkg
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# ─── Comprehensive Medical Reference Ranges ───────────────────────────────────
NORMAL_RANGES = {
    # --- Complete Blood Count (CBC) ---
    "Hemoglobin": {
        "min": 13.5, "max": 17.5, "unit": "g/dL", "category": "Complete Blood Count",
        "meaning": "Protein in red blood cells that carries oxygen from lungs to the rest of the body.",
        "low_causes": ["Iron deficiency anemia", "Vitamin B12 or folate deficiency", "Chronic kidney disease", "Internal bleeding", "Bone marrow disorders"],
        "high_causes": ["Dehydration", "Polycythemia vera", "COPD or lung disease", "High altitude living", "Excessive smoking"],
        "symptoms_low": ["Fatigue and weakness", "Shortness of breath", "Pale skin", "Dizziness", "Cold extremities"],
        "symptoms_high": ["Headache", "Dizziness", "Blurred vision", "Reddish complexion"],
        "importance": "critical"
    },
    "WBC Count": {
        "min": 4000, "max": 11000, "unit": "cells/mcL", "category": "Complete Blood Count",
        "meaning": "White blood cells defend the body against infections, bacteria, and foreign invaders.",
        "low_causes": ["Viral infections suppressing bone marrow", "Autoimmune diseases", "Chemotherapy side effects", "Bone marrow failure"],
        "high_causes": ["Active bacterial infection", "Inflammatory conditions", "Physical/emotional stress", "Leukemia", "Steroid medications"],
        "symptoms_low": ["Frequent infections", "Persistent fever", "Mouth ulcers", "Slow wound healing"],
        "symptoms_high": ["Fever", "Night sweats", "Unexplained fatigue", "Unintentional weight loss"],
        "importance": "critical"
    },
    "RBC Count": {
        "min": 4.5, "max": 5.9, "unit": "million/mcL", "category": "Complete Blood Count",
        "meaning": "Red blood cells transport oxygen throughout the body and remove carbon dioxide.",
        "low_causes": ["Anemia", "Blood loss", "Bone marrow failure", "Kidney disease"],
        "high_causes": ["Dehydration", "Polycythemia", "COPD", "Chronic smoking"],
        "symptoms_low": ["Fatigue", "Weakness", "Shortness of breath", "Pale or yellowish skin"],
        "symptoms_high": ["Headache", "Itching after bathing", "Burning sensation in hands or feet"],
        "importance": "high"
    },
    "Platelets": {
        "min": 150000, "max": 450000, "unit": "/mcL", "category": "Complete Blood Count",
        "meaning": "Tiny blood cells that form clots to stop bleeding when blood vessels are damaged.",
        "low_causes": ["Immune thrombocytopenic purpura (ITP)", "Viral infections", "Liver disease", "Leukemia", "Certain medications"],
        "high_causes": ["Iron deficiency", "Active infection", "Inflammatory diseases", "Recent surgery", "Cancer"],
        "symptoms_low": ["Easy or excessive bruising", "Prolonged bleeding from cuts", "Blood in urine or stool", "Tiny red dots on skin"],
        "symptoms_high": ["Blood clot risk", "Stroke or heart attack risk", "Headache"],
        "importance": "high"
    },
    "MCV": {
        "min": 80, "max": 100, "unit": "fL", "category": "Complete Blood Count",
        "meaning": "Mean Corpuscular Volume — measures the average size of red blood cells.",
        "low_causes": ["Iron deficiency anemia", "Thalassemia (genetic blood disorder)", "Chronic disease anemia"],
        "high_causes": ["Vitamin B12 deficiency", "Folate deficiency", "Liver disease", "Hypothyroidism", "Alcoholism"],
        "symptoms_low": ["Fatigue", "Weakness", "Pale skin"],
        "symptoms_high": ["Fatigue", "Weakness", "Tingling in hands or feet", "Balance problems"],
        "importance": "moderate"
    },
    "Hematocrit": {
        "min": 40, "max": 52, "unit": "%", "category": "Complete Blood Count",
        "meaning": "Percentage of blood volume composed of red blood cells.",
        "low_causes": ["Anemia", "Blood loss", "Nutritional deficiencies", "Overhydration"],
        "high_causes": ["Dehydration", "Polycythemia", "High altitude exposure"],
        "symptoms_low": ["Fatigue", "Shortness of breath", "Dizziness"],
        "symptoms_high": ["Blood thickening", "Clotting risk", "Headache"],
        "importance": "moderate"
    },
    # --- Metabolic Panel ---
    "Glucose": {
        "min": 70, "max": 99, "unit": "mg/dL", "category": "Metabolic Panel",
        "meaning": "Blood sugar level (fasting) — the primary energy source for all cells in the body.",
        "low_causes": ["Skipping meals or prolonged fasting", "Excessive insulin", "Alcohol consumption", "Severe liver disease"],
        "high_causes": ["Diabetes mellitus", "Prediabetes", "Stress response", "Steroid medications", "Pancreatitis"],
        "symptoms_low": ["Shakiness and trembling", "Sweating", "Rapid heartbeat", "Confusion", "Extreme hunger"],
        "symptoms_high": ["Frequent urination", "Increased thirst", "Blurred vision", "Slow-healing wounds", "Fatigue"],
        "importance": "critical"
    },
    "HbA1c": {
        "min": 4.0, "max": 5.6, "unit": "%", "category": "Metabolic Panel",
        "meaning": "3-month average blood glucose — the gold standard marker for diabetes monitoring.",
        "low_causes": ["Hemolytic anemia", "Kidney failure causing false low readings"],
        "high_causes": ["Uncontrolled diabetes", "Prolonged high blood sugar", "Prediabetes (5.7–6.4%)"],
        "symptoms_low": [],
        "symptoms_high": ["Fatigue", "Increased thirst", "Frequent urination", "Blurred vision", "Slow wound healing"],
        "importance": "critical"
    },
    "Creatinine": {
        "min": 0.7, "max": 1.3, "unit": "mg/dL", "category": "Kidney Function",
        "meaning": "Waste product from muscle metabolism filtered by kidneys — a key measure of kidney function.",
        "low_causes": ["Low muscle mass", "Malnutrition", "Severe liver disease"],
        "high_causes": ["Chronic kidney disease", "Dehydration", "High-protein diet", "Acute kidney injury", "Blocked urinary tract"],
        "symptoms_low": [],
        "symptoms_high": ["Swelling in legs or ankles", "Fatigue", "Decreased urine output", "Nausea", "Shortness of breath"],
        "importance": "high"
    },
    "BUN": {
        "min": 7, "max": 20, "unit": "mg/dL", "category": "Kidney Function",
        "meaning": "Blood Urea Nitrogen — measures kidney function and protein metabolism efficiency.",
        "low_causes": ["Malnutrition", "Liver failure", "Very low protein diet", "Overhydration"],
        "high_causes": ["Kidney disease or failure", "Dehydration", "High protein diet", "GI bleeding", "Heart failure"],
        "symptoms_low": ["Fatigue", "Nausea"],
        "symptoms_high": ["Fatigue", "Decreased urine", "Fluid retention", "Confusion in severe cases"],
        "importance": "high"
    },
    # --- Electrolytes ---
    "Sodium": {
        "min": 136, "max": 145, "unit": "mEq/L", "category": "Electrolytes",
        "meaning": "Essential electrolyte that regulates fluid balance, nerve function, and muscle contractions.",
        "low_causes": ["Excessive water intake", "Heart failure", "Kidney disease", "SIADH syndrome", "Severe vomiting/diarrhea"],
        "high_causes": ["Dehydration", "Diabetes insipidus", "Excessive sodium intake", "Cushing's syndrome"],
        "symptoms_low": ["Headache", "Nausea", "Confusion", "Muscle cramps", "Seizures in severe cases"],
        "symptoms_high": ["Extreme thirst", "Confusion", "Fatigue", "Muscle twitching", "Restlessness"],
        "importance": "high"
    },
    "Potassium": {
        "min": 3.5, "max": 5.0, "unit": "mEq/L", "category": "Electrolytes",
        "meaning": "Critical electrolyte for maintaining normal heart rhythm and muscle function.",
        "low_causes": ["Diuretic medications", "Excessive vomiting or diarrhea", "Eating disorders", "Laxative overuse"],
        "high_causes": ["Kidney disease", "Excess potassium supplements", "ACE inhibitor medications", "Tissue injury"],
        "symptoms_low": ["Muscle cramps and weakness", "Constipation", "Fatigue", "Heart palpitations", "Abnormal heart rhythm"],
        "symptoms_high": ["Muscle weakness", "Fatigue", "Heart palpitations", "Nausea", "Dangerous heart arrhythmias"],
        "importance": "critical"
    },
    # --- Liver Function Tests ---
    "ALT": {
        "min": 7, "max": 40, "unit": "U/L", "category": "Liver Function",
        "meaning": "Alanine aminotransferase — liver-specific enzyme released when liver cells are damaged.",
        "low_causes": [],
        "high_causes": ["Non-alcoholic fatty liver disease (NAFLD)", "Hepatitis B or C", "Alcohol-related liver damage", "Certain medications (statins, NSAIDs)", "Heart failure"],
        "symptoms_low": [],
        "symptoms_high": ["Fatigue", "Jaundice (yellowing of skin/eyes)", "Abdominal pain", "Nausea", "Dark urine"],
        "importance": "high"
    },
    "AST": {
        "min": 10, "max": 40, "unit": "U/L", "category": "Liver Function",
        "meaning": "Aspartate aminotransferase — enzyme from liver and heart; elevated when either organ is stressed.",
        "low_causes": [],
        "high_causes": ["Liver disease", "Recent heart attack", "Muscle injury", "Alcohol abuse", "Intense exercise"],
        "symptoms_low": [],
        "symptoms_high": ["Fatigue", "Jaundice", "Abdominal swelling", "Nausea", "Loss of appetite"],
        "importance": "high"
    },
    "Total Bilirubin": {
        "min": 0.1, "max": 1.2, "unit": "mg/dL", "category": "Liver Function",
        "meaning": "Breakdown product of hemoglobin processed by the liver and excreted in bile.",
        "low_causes": [],
        "high_causes": ["Liver disease or cirrhosis", "Hemolysis (excessive RBC breakdown)", "Bile duct obstruction", "Gilbert syndrome (benign hereditary condition)"],
        "symptoms_low": [],
        "symptoms_high": ["Yellow skin and eyes (jaundice)", "Dark urine", "Pale stools", "Itching", "Abdominal pain"],
        "importance": "high"
    },
    # --- Lipid Panel ---
    "Total Cholesterol": {
        "min": 0, "max": 200, "unit": "mg/dL", "category": "Lipid Panel",
        "meaning": "Total blood cholesterol — elevated levels significantly increase cardiovascular disease risk.",
        "low_causes": ["Malnutrition", "Hyperthyroidism", "Liver disease", "Malabsorption disorders"],
        "high_causes": ["Diet high in saturated/trans fats", "Obesity", "Physical inactivity", "Diabetes", "Hypothyroidism", "Genetic hypercholesterolemia"],
        "symptoms_low": [],
        "symptoms_high": ["Usually asymptomatic until complications", "Chest pain (when arteries are affected)", "Xanthomas (cholesterol deposits)"],
        "importance": "high"
    },
    "LDL Cholesterol": {
        "min": 0, "max": 100, "unit": "mg/dL", "category": "Lipid Panel",
        "meaning": "LDL ('bad') cholesterol — accumulates in artery walls and causes plaque buildup.",
        "low_causes": ["Statin therapy", "Malnutrition"],
        "high_causes": ["High saturated/trans fat diet", "Obesity", "Diabetes", "Genetic dyslipidemia", "Hypothyroidism"],
        "symptoms_low": [],
        "symptoms_high": ["Chest pain when heart arteries are severely blocked", "Usually asymptomatic until advanced"],
        "importance": "high"
    },
    "HDL Cholesterol": {
        "min": 40, "max": 999, "unit": "mg/dL", "category": "Lipid Panel",
        "meaning": "HDL ('good') cholesterol — transports harmful LDL away from arteries back to the liver.",
        "low_causes": ["Sedentary lifestyle", "Smoking", "Obesity", "Uncontrolled diabetes", "Very high carbohydrate diet"],
        "high_causes": [],
        "symptoms_low": ["Increased cardiovascular disease risk (indirect effect)"],
        "symptoms_high": [],
        "importance": "moderate"
    },
    "Triglycerides": {
        "min": 0, "max": 150, "unit": "mg/dL", "category": "Lipid Panel",
        "meaning": "Type of fat stored in blood — elevated levels increase coronary artery disease and pancreatitis risk.",
        "low_causes": ["Malnutrition", "Hyperthyroidism"],
        "high_causes": ["Excessive sugar and alcohol intake", "Obesity", "Uncontrolled diabetes", "Hypothyroidism", "Kidney disease"],
        "symptoms_low": [],
        "symptoms_high": ["Usually asymptomatic", "Severe abdominal pain if pancreatitis develops"],
        "importance": "high"
    },
    # --- Thyroid ---
    "TSH": {
        "min": 0.4, "max": 4.0, "unit": "mIU/L", "category": "Thyroid",
        "meaning": "Thyroid-stimulating hormone — produced by the pituitary gland to control thyroid activity.",
        "low_causes": ["Hyperthyroidism (overactive thyroid)", "Thyroid nodules", "Excess thyroid medication"],
        "high_causes": ["Hypothyroidism (underactive thyroid)", "Hashimoto's thyroiditis", "Iodine deficiency"],
        "symptoms_low": ["Unintentional weight loss", "Rapid heartbeat", "Anxiety", "Tremors", "Heat sensitivity", "Excessive sweating"],
        "symptoms_high": ["Unexplained weight gain", "Fatigue", "Sensitivity to cold", "Hair loss", "Depression", "Constipation"],
        "importance": "high"
    },
    # --- Vitals ---
    "Systolic BP": {
        "min": 90, "max": 120, "unit": "mmHg", "category": "Cardiovascular",
        "meaning": "Pressure in arteries during heartbeat (upper reading of blood pressure).",
        "low_causes": ["Dehydration", "Heart problems", "Significant blood loss", "Certain medications", "Severe infection"],
        "high_causes": ["Essential hypertension", "Kidney disease", "High salt diet", "Obesity", "Chronic stress"],
        "symptoms_low": ["Dizziness upon standing", "Fainting", "Nausea", "Blurred vision", "Fatigue"],
        "symptoms_high": ["Headache (especially at back of head)", "Dizziness", "Chest pain", "Shortness of breath", "Vision changes"],
        "importance": "critical"
    },
    "Diastolic BP": {
        "min": 60, "max": 80, "unit": "mmHg", "category": "Cardiovascular",
        "meaning": "Pressure in arteries between heartbeats (lower reading of blood pressure).",
        "low_causes": ["Dehydration", "Heart failure", "Aortic valve problems"],
        "high_causes": ["Hypertension", "Kidney disease", "Diabetes", "Atherosclerosis"],
        "symptoms_low": ["Dizziness", "Fatigue", "Fainting spells"],
        "symptoms_high": ["Headache", "Dizziness", "Shortness of breath", "Blurred vision"],
        "importance": "critical"
    },
    "Heart Rate": {
        "min": 60, "max": 100, "unit": "bpm", "category": "Cardiovascular",
        "meaning": "Number of heartbeats per minute — reflects cardiovascular fitness and overall health.",
        "low_causes": ["High athletic fitness", "Beta-blocker medications", "Hypothyroidism", "Heart conduction defects"],
        "high_causes": ["Anxiety or stress", "Dehydration", "Anemia", "Fever", "Hyperthyroidism", "Heart conditions", "Stimulant use"],
        "symptoms_low": ["Fatigue", "Dizziness", "Shortness of breath on exertion", "Fainting"],
        "symptoms_high": ["Palpitations", "Dizziness", "Shortness of breath", "Chest discomfort", "Anxiety"],
        "importance": "high"
    },
    "Temperature": {
        "min": 97.0, "max": 99.0, "unit": "°F", "category": "Vitals",
        "meaning": "Core body temperature — elevated values indicate fever; low values suggest hypothermia.",
        "low_causes": ["Hypothyroidism", "Malnutrition", "Prolonged cold exposure", "Septic shock"],
        "high_causes": ["Bacterial or viral infection", "Inflammatory conditions", "Heat stroke", "Autoimmune disorders"],
        "symptoms_low": ["Shivering", "Confusion", "Slurred speech", "Slow reflexes"],
        "symptoms_high": ["Sweating", "Chills", "Fatigue", "Body aches", "Headache", "Nausea"],
        "importance": "moderate"
    },
    "Oxygen Saturation": {
        "min": 95, "max": 100, "unit": "%", "category": "Respiratory",
        "meaning": "Percentage of hemoglobin saturated with oxygen — measures lung and breathing efficiency.",
        "low_causes": ["COPD", "Pneumonia", "Asthma", "COVID-19", "Congestive heart failure", "Severe anemia"],
        "high_causes": [],
        "symptoms_low": ["Shortness of breath", "Confusion", "Cyanosis (blue lips/fingernails)", "Rapid shallow breathing", "Anxiety"],
        "symptoms_high": [],
        "importance": "critical"
    }
}

# ─── Regex patterns for parameter extraction ──────────────────────────────────
PARAMETER_PATTERNS = {
    "Hemoglobin": [
        r"(?:Hemoglobin|Haemoglobin|H[Gg]b?)\s*[:\-]?\s*(\d{1,2}\.?\d*)"
    ],
    "WBC Count": [
        r"(?:WBC|White\s*Blood\s*Cells?|Leukocytes?|TLC)\s*[:\-]?\s*([\d,\.]+)"
    ],
    "RBC Count": [
        r"(?:RBC|Red\s*Blood\s*Cells?|Erythrocytes?)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Platelets": [
        r"(?:Platelets?|PLT|Thrombocytes?)\s*[:\-]?\s*([\d,\.]+)"
    ],
    "MCV": [
        r"MCV\s*[:\-]?\s*([\d\.]+)"
    ],
    "Hematocrit": [
        r"(?:Hematocrit|Haematocrit|PCV|HCT)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Glucose": [
        r"(?:Glucose|Blood\s*Sugar|FBS|RBS|FBG)\s*[:\-]?\s*([\d\.]+)"
    ],
    "HbA1c": [
        r"(?:HbA1c?|Glycated\s*Hemo|A1C)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Creatinine": [
        r"(?:Creatinine|Serum\s*Creatinine)\s*[:\-]?\s*([\d\.]+)"
    ],
    "BUN": [
        r"(?:BUN|Blood\s*Urea\s*Nitrogen|Urea)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Sodium": [
        r"(?:Sodium|Na\+?)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Potassium": [
        r"(?:Potassium|K\+?)\s*[:\-]?\s*([\d\.]+)"
    ],
    "ALT": [
        r"(?:ALT|SGPT|Alanine\s*Amino)\s*[:\-]?\s*([\d\.]+)"
    ],
    "AST": [
        r"(?:AST|SGOT|Aspartate\s*Amino)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Total Bilirubin": [
        r"(?:Total\s*Bilirubin|T\.?\s*Bili)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Total Cholesterol": [
        r"(?:Total\s*Cholesterol|Cholesterol)\s*[:\-]?\s*([\d\.]+)"
    ],
    "LDL Cholesterol": [
        r"(?:LDL|Low\s*Density\s*Lipo)\s*[:\-]?\s*([\d\.]+)"
    ],
    "HDL Cholesterol": [
        r"(?:HDL|High\s*Density\s*Lipo)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Triglycerides": [
        r"(?:Triglycerides?|TG|TRIG)\s*[:\-]?\s*([\d\.]+)"
    ],
    "TSH": [
        r"(?:TSH|Thyroid\s*Stimulating)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Heart Rate": [
        r"(?:Heart\s*Rate|HR|Pulse)\s*[:\-]?\s*(\d{2,3})"
    ],
    "Temperature": [
        r"(?:Temp(?:erature)?)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Oxygen Saturation": [
        r"(?:O2\s*Sat|SpO2|Oxygen\s*Sat)\s*[:\-]?\s*([\d\.]+)"
    ],
}


def extract_parameters(text):
    """Extract medical parameters from OCR text using comprehensive regex."""
    results = {}
    clean_text = re.sub(r'\s+', ' ', text)

    for name, patterns in PARAMETER_PATTERNS.items():
        for pattern in patterns:
            match = re.search(pattern, clean_text, re.IGNORECASE)
            if match:
                val_str = match.group(1).replace(',', '')
                try:
                    val = float(val_str)
                    # Sanity checks to avoid false positives
                    if name in ["WBC Count", "Platelets"] and val < 100:
                        val = val * 1000  # convert K/mcL to cells/mcL if needed
                    results[name] = val
                    break
                except ValueError:
                    pass

    # Blood pressure: special case (e.g., 120/80)
    bp_match = re.search(r"(?:BP|Blood\s*Pressure)[:\s\-]*(\d{2,3})\s*/\s*(\d{2,3})", clean_text, re.IGNORECASE)
    if bp_match:
        results["Systolic BP"] = float(bp_match.group(1))
        results["Diastolic BP"] = float(bp_match.group(2))

    return results


def classify_parameter(name, value):
    """Classify a parameter as Low / Borderline-Low / Normal / Borderline-High / High."""
    if name not in NORMAL_RANGES:
        return "Unknown"

    rng = NORMAL_RANGES[name]
    lo, hi = rng["min"], rng["max"]
    span = hi - lo if hi != lo else 1

    if value < lo:
        # Borderline-Low: within 10% below min
        if value >= lo - span * 0.1:
            return "Borderline"
        return "Low"
    elif value > hi and hi != 999:
        # Borderline-High: within 10% above max
        if value <= hi + span * 0.1:
            return "Borderline"
        return "High"
    else:
        return "Normal"


def _build_parameter_explanation(p):
    """Build a multi-line, doctor-style explanation for a single parameter."""
    name, value, unit, status = p["name"], p["value"], p["unit"], p["status"]
    rng = NORMAL_RANGES.get(name, {})
    meaning = rng.get("meaning", "")
    lo, hi = rng.get("min"), rng.get("max")
    normal_range = f"{lo}–{hi}"

    lines = []

    if status == "Normal":
        lines.append(
            f"Your {name} is {value} {unit}, which is within the healthy reference range of {normal_range} {unit}. "
            f"This is an encouraging result. {meaning} "
            f"A normal {name} value indicates that this aspect of your health is well-maintained and functioning optimally."
        )
    elif status == "Borderline":
        direction = "low" if value <= lo else "high"
        lines.append(
            f"Your {name} is {value} {unit}, which is borderline {direction} (reference range: {normal_range} {unit}). "
            f"{meaning} "
            f"While not critically abnormal, this reading warrants monitoring. "
            f"Lifestyle adjustments may help bring this value further into the optimal range."
        )
        causes = rng.get("low_causes" if direction == "low" else "high_causes", [])
        if causes:
            lines.append(f"Possible contributing factors include: {', '.join(causes[:3])}.")
    elif status == "Low":
        lines.append(
            f"Your {name} is {value} {unit}, which is below the healthy range of {normal_range} {unit}. "
            f"{meaning} "
            f"A low {name} can indicate an underlying condition that should be evaluated by your doctor."
        )
        causes = rng.get("low_causes", [])
        symptoms = rng.get("symptoms_low", [])
        if causes:
            lines.append(f"Common causes of low {name} include: {', '.join(causes[:4])}.")
        if symptoms:
            lines.append(
                f"You may experience symptoms such as: {', '.join(symptoms[:4])}. "
                "If you are experiencing these symptoms, please seek medical attention."
            )
    elif status == "High":
        lines.append(
            f"Your {name} is {value} {unit}, which is elevated above the healthy range of {normal_range} {unit}. "
            f"{meaning} "
            f"An elevated {name} can indicate various conditions that merit clinical evaluation."
        )
        causes = rng.get("high_causes", [])
        symptoms = rng.get("symptoms_high", [])
        if causes:
            lines.append(f"Possible causes of high {name} include: {', '.join(causes[:4])}.")
        if symptoms:
            lines.append(
                f"Watch for symptoms including: {', '.join(symptoms[:4])}. "
                "If you have any of these, please consult your healthcare provider promptly."
            )

    return " ".join(lines)


def _generate_clinical_summary(processed_params, risk_level, risk_reasoning):
    """Generate a multi-paragraph clinical summary in doctor-like language."""
    total = len(processed_params)
    if total == 0:
        return (
            "No structured medical parameters were detected in the uploaded report. "
            "This might be due to poor image quality or an unsupported report format. "
            "Please try uploading a clearer image or a typed PDF for best results."
        )

    normal_params  = [p for p in processed_params if p["status"] == "Normal"]
    abnormal       = [p for p in processed_params if p["status"] in ("High", "Low")]
    borderline     = [p for p in processed_params if p["status"] == "Borderline"]

    # Paragraph 1 – Overview
    p1 = (
        f"Your medical report has been analyzed using AI-assisted clinical interpretation. "
        f"A total of {total} lab parameter{'s were' if total > 1 else ' was'} detected and evaluated against "
        f"internationally accepted reference ranges. "
    )
    if not abnormal and not borderline:
        p1 += (
            "All identified parameters fall within their respective healthy ranges. "
            "This is a positive indicator of your current overall health status."
        )
    else:
        issues = []
        if abnormal:
            issues.append(f"{len(abnormal)} parameter{'s require' if len(abnormal) > 1 else ' requires'} attention "
                          f"({', '.join(p['name'] for p in abnormal[:3])}{'…' if len(abnormal) > 3 else ''})")
        if borderline:
            issues.append(f"{len(borderline)} parameter{'s are' if len(borderline) > 1 else ' is'} borderline "
                          f"({', '.join(p['name'] for p in borderline[:3])}{'…' if len(borderline) > 3 else ''})")
        p1 += "However, " + " and ".join(issues) + "."

    # Paragraph 2 – Category highlights
    categories = {}
    for p in processed_params:
        cat = NORMAL_RANGES.get(p["name"], {}).get("category", "General")
        categories.setdefault(cat, []).append(p)

    category_lines = []
    for cat, params in categories.items():
        ab = [p for p in params if p["status"] != "Normal"]
        if not ab:
            category_lines.append(f"{cat} results are all within normal limits")
        else:
            category_lines.append(
                f"{cat} shows {len(ab)} abnormal reading{'s' if len(ab) > 1 else ''} "
                f"({', '.join(p['name'] + ' ' + p['status'] for p in ab[:2])})"
            )
    p2 = "Reviewing by category: " + "; ".join(category_lines) + "."

    # Paragraph 3 – Risk and recommendation
    p3 = (
        f"Overall risk assessment: {risk_level} Risk. {risk_reasoning} "
        "It is strongly recommended that you share these results with your primary care physician "
        "for a comprehensive clinical review, especially if you are experiencing any related symptoms."
    )

    return f"{p1}\n\n{p2}\n\n{p3}"


def _generate_doctors_interpretation(processed_params):
    """Generate detailed, paragraph-form AI doctor interpretation for all parameters."""
    if not processed_params:
        return (
            "Based on the uploaded report, we were unable to extract structured lab values for detailed interpretation. "
            "Please ensure the report is clearly scanned or is in PDF format with readable text. "
            "Once parameters are extracted, this section will provide a comprehensive explanation of each finding."
        )

    lines = [
        "Based on a thorough review of your lab findings, here is a detailed clinical interpretation:\n"
    ]
    for p in processed_params:
        explanation = _build_parameter_explanation(p)
        lines.append(f"🔬 {p['name']}: {explanation}")

    lines.append(
        "\nIf any of the above values are abnormal, do not panic. Many parameters can be influenced by "
        "diet, hydration, recent illness, or medication. Your doctor will interpret these results in the "
        "context of your complete medical history and physical examination before recommending any action."
    )
    return "\n\n".join(lines)


def _calculate_risk(processed_params):
    """Intelligent risk scoring with multi-factor analysis."""
    score = 0
    reasoning_parts = []

    critical_names = {"Potassium", "Systolic BP", "Diastolic BP", "Oxygen Saturation", "Glucose", "Hemoglobin"}
    high_importance = {"WBC Count", "Platelets", "HbA1c", "Creatinine", "TSH", "ALT", "AST", "Heart Rate"}

    abnormal_count = 0
    for p in processed_params:
        name = p["name"]
        status = p["status"]

        if status == "Normal":
            continue

        abnormal_count += 1
        multiplier = 3 if name in critical_names else (2 if name in high_importance else 1)

        if status == "High" or status == "Low":
            score += 2 * multiplier
            reasoning_parts.append(f"{name} is {status.lower()}")
        elif status == "Borderline":
            score += 1 * multiplier

    if score >= 10:
        level = "High"
        if reasoning_parts:
            reasoning = (
                f"High risk identified because {', '.join(reasoning_parts[:3])}. "
                "Multiple critical parameters are outside healthy ranges, indicating the need for prompt medical evaluation."
            )
        else:
            reasoning = "High risk due to significantly abnormal values in critical health markers."
    elif score >= 4:
        level = "Medium"
        if reasoning_parts:
            reasoning = (
                f"Moderate risk noted due to {', '.join(reasoning_parts[:2])}. "
                "Some parameters require monitoring and potential lifestyle or medical intervention."
            )
        else:
            reasoning = "Moderate risk due to borderline or mildly abnormal values in some markers."
    elif score >= 1:
        level = "Low"
        if reasoning_parts:
            reasoning = (
                f"Low risk overall. Mild variations detected in {', '.join(reasoning_parts[:2])}. "
                "These are minor deviations that can generally be managed through lifestyle adjustments."
            )
        else:
            reasoning = "Low risk — minor borderline readings detected but no critical abnormalities."
    else:
        level = "Low"
        reasoning = (
            "All detected parameters are within their healthy reference ranges. "
            "This indicates excellent health across all measured indicators. "
            "Continue your current healthy lifestyle and schedule regular check-ups."
        )

    # Confidence: higher when more parameters are detected
    param_count = len(processed_params)
    confidence = min(0.70 + param_count * 0.02, 0.97)
    return level, confidence, reasoning


def _generate_wellness_plan(processed_params, risk_level):
    """Generate a personalised wellness plan based on specific findings."""
    has_high_glucose = any(p["name"] == "Glucose" and p["status"] in ("High", "Borderline") for p in processed_params)
    has_high_cholesterol = any(p["name"] in ("Total Cholesterol", "LDL Cholesterol") and p["status"] in ("High", "Borderline") for p in processed_params)
    has_low_hemoglobin = any(p["name"] == "Hemoglobin" and p["status"] in ("Low", "Borderline") for p in processed_params)
    has_high_bp = any(p["name"] == "Systolic BP" and p["status"] in ("High", "Borderline") for p in processed_params)
    has_high_wbc = any(p["name"] == "WBC Count" and p["status"] == "High" for p in processed_params)
    has_kidney_issue = any(p["name"] in ("Creatinine", "BUN") and p["status"] in ("High", "Borderline") for p in processed_params)

    diet_items = ["Eat a balanced diet rich in whole grains, lean proteins, and healthy fats"]
    exercise_items = ["Aim for at least 150 minutes of moderate aerobic activity per week"]
    hydration = "Drink 8–10 glasses of water daily to support kidney and cardiovascular function."
    sleep = "Prioritize 7–9 hours of quality sleep per night to support hormonal balance and recovery."
    stress = "Practice stress-reduction techniques such as mindfulness, meditation, or yoga daily."

    if has_high_glucose:
        diet_items += [
            "Reduce refined carbohydrates, sugary drinks, and processed foods",
            "Increase fibre intake with vegetables, legumes, and whole grains",
            "Eat smaller, frequent meals to stabilise blood sugar"
        ]
        exercise_items += ["Include resistance training 2–3 times per week to improve insulin sensitivity"]

    if has_high_cholesterol:
        diet_items += [
            "Limit saturated fats (red meat, full-fat dairy) and avoid trans fats entirely",
            "Increase omega-3 rich foods: salmon, flaxseed, walnuts",
            "Add soluble fibre: oats, apples, beans to reduce LDL absorption"
        ]
        exercise_items += ["Daily 30-minute brisk walks significantly reduce LDL cholesterol over time"]

    if has_low_hemoglobin:
        diet_items += [
            "Increase iron-rich foods: spinach, lentils, beans, lean red meat, fortified cereals",
            "Pair iron-rich foods with Vitamin C sources (citrus, bell peppers) to enhance absorption",
            "Avoid tea/coffee with meals as tannins inhibit iron absorption"
        ]

    if has_high_bp:
        diet_items += [
            "Follow a low-sodium diet — limit salt intake to under 2,300 mg per day",
            "Increase potassium-rich foods: bananas, sweet potatoes, leafy greens"
        ]
        exercise_items += ["Regular aerobic exercise (swimming, cycling) lowers blood pressure effectively"]
        stress += " Chronic stress elevates blood pressure; consistent relaxation practices are especially important for you."
        hydration += " Avoid excessive caffeine as it can temporarily elevate blood pressure."

    if has_kidney_issue:
        diet_items += [
            "Limit protein intake temporarily and avoid high-sodium processed foods",
            "Reduce potassium and phosphorus-rich foods if advised by your doctor"
        ]
        hydration = "Stay well hydrated (2–3 litres daily) to help kidneys flush waste efficiently, unless restricted by your doctor."

    if has_high_wbc:
        diet_items += ["Include anti-inflammatory foods: turmeric, ginger, berries, and leafy greens"]

    if risk_level == "High":
        exercise_items = ["Consult your doctor before starting any new exercise program given your current readings",
                          "Start with gentle walking only until medically cleared"]

    return {
        "diet": " • ".join(diet_items),
        "exercise": " • ".join(exercise_items),
        "hydration": hydration,
        "sleep": sleep,
        "stress": stress
    }


def _try_gemini_enhance(text_summary, params_json):
    """Optionally enhance explanations with Gemini AI if API key is available."""
    if not (GEMINI_AVAILABLE and GEMINI_API_KEY):
        return None
    try:
        client = genaipkg.Client(api_key=GEMINI_API_KEY)
        prompt = (
            "You are an experienced clinical physician reviewing a patient's lab results. "
            "Based on the following parameter data, write a 3-paragraph compassionate, educational "
            "doctor's interpretation. Be specific about what each abnormal value means, likely causes, "
            "and appropriate next steps. Avoid alarming language. End with a reassuring note.\n\n"
            f"Lab Summary: {text_summary}\n\nParameters JSON:\n{params_json}\n\n"
            "Write naturally, as if speaking directly to the patient."
        )
        response = client.models.generate_content(model='gemini-2.0-flash', contents=prompt)
        return response.text
    except Exception:
        return None


def answer_report_question(question, extracted_data, ai_explanation):
    """Answer a patient's question about their report contextually."""
    if not extracted_data:
        return (
            "I don't have sufficient data from your report to answer that specifically. "
            "Please ensure your report was processed successfully, then try again."
        )

    question_lower = question.lower()

    # Try Gemini if available
    if GEMINI_AVAILABLE and GEMINI_API_KEY:
        try:
            client = genaipkg.Client(api_key=GEMINI_API_KEY)
            context = json.dumps(extracted_data, indent=2)
            prompt = (
                f"You are a compassionate AI medical assistant. A patient is asking a question about their lab report.\n\n"
                f"Report data:\n{context}\n\n"
                f"Patient's question: {question}\n\n"
                "Answer in 2–3 short paragraphs. Be educational and reassuring. "
                "Remind them to consult their doctor at the end."
            )
            response = client.models.generate_content(model='gemini-2.0-flash', contents=prompt)
            return response.text + "\n\n*This is AI-generated educational information only. Please consult your doctor.*"
        except Exception:
            pass

    # Rule-based fallback
    keywords_map = {
        'sugar': 'Glucose', 'blood sugar': 'Glucose', 'diabetes': 'Glucose', 'glucose': 'Glucose',
        'hemoglobin': 'Hemoglobin', 'hb': 'Hemoglobin', 'haemoglobin': 'Hemoglobin', 'anemia': 'Hemoglobin', 'anaemia': 'Hemoglobin',
        'wbc': 'WBC Count', 'white blood': 'WBC Count', 'infection': 'WBC Count', 'leukocyte': 'WBC Count',
        'rbc': 'RBC Count', 'red blood': 'RBC Count',
        'platelet': 'Platelets', 'clot': 'Platelets', 'plt': 'Platelets',
        'bp': 'Systolic BP', 'blood pressure': 'Systolic BP', 'hypertension': 'Systolic BP', 'systolic': 'Systolic BP',
        'heart rate': 'Heart Rate', 'pulse': 'Heart Rate', 'bpm': 'Heart Rate',
        'cholesterol': 'Total Cholesterol', 'ldl': 'LDL Cholesterol', 'hdl': 'HDL Cholesterol',
        'triglyceride': 'Triglycerides', 'tg': 'Triglycerides',
        'kidney': 'Creatinine', 'creatinine': 'Creatinine', 'renal': 'Creatinine',
        'liver': 'ALT', 'alt': 'ALT', 'sgpt': 'ALT', 'ast': 'AST', 'sgot': 'AST',
        'thyroid': 'TSH', 'tsh': 'TSH',
        'hba1c': 'HbA1c', 'a1c': 'HbA1c',
        'oxygen': 'Oxygen Saturation', 'spo2': 'Oxygen Saturation',
        'temperature': 'Temperature', 'fever': 'Temperature',
        'bun': 'BUN', 'urea': 'BUN', 'sodium': 'Sodium', 'potassium': 'Potassium',
    }

    matched_param = None
    for keyword, param_name in keywords_map.items():
        if keyword in question_lower:
            matched_param = next((p for p in extracted_data if p['name'] == param_name), None)
            if matched_param:
                break

    if matched_param:
        explanation = _build_parameter_explanation(matched_param)
        answer = explanation
        answer += "\n\n*This is AI-generated educational information only. Please consult your doctor for personalised medical advice.*"
        return answer

    # Generic fallback
    abnormal = [p for p in extracted_data if p["status"] in ("High", "Low")]
    if any(w in question_lower for w in ["worry", "serious", "concern", "dangerous", "bad", "okay", "good"]):
        if not abnormal:
            return (
                "Based on your report analysis, all detected parameters are within their healthy reference ranges. "
                "This is a very encouraging result and suggests your current health indicators are good. "
                "Routine healthy habits — balanced diet, regular exercise, adequate sleep, and hydration — "
                "are all that's needed to maintain these excellent levels.\n\n"
                "*This is AI-generated educational information only. Please consult your doctor for personalised medical advice.*"
            )
        else:
            param_list = ', '.join(f"{p['name']} ({p['status']})" for p in abnormal)
            return (
                f"Your report shows {len(abnormal)} parameter(s) outside normal range: {param_list}. "
                "While this warrants medical attention, isolated abnormal readings are common and often manageable. "
                "Please share these results with your doctor for proper context and advice.\n\n"
                "*This is AI-generated educational information only. Please consult your doctor for personalised medical advice.*"
            )

    return (
        f"Your report includes {len(extracted_data)} analysed parameters. "
        f"Of these, {len([p for p in extracted_data if p['status'] == 'Normal'])} are within normal range. "
        "You can ask me about any specific test by name — for example, 'What does my hemoglobin level mean?' "
        "or 'Why is my WBC high?'\n\n"
        "*This is AI-generated educational information only. Please consult your doctor for personalised medical advice.*"
    )


def analyze_medical_report(file_path):
    """Main entry point — extracts, classifies, and explains a medical report."""
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == '.pdf':
            text = extract_text(file_path)
        elif ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
            tesseract_paths = [
                '/opt/homebrew/bin/tesseract',
                '/usr/local/bin/tesseract',
                '/usr/bin/tesseract'
            ]
            for path in tesseract_paths:
                if os.path.exists(path):
                    pytesseract.pytesseract.tesseract_cmd = path
                    break
            img = Image.open(file_path)
            # Enhance image quality for better OCR
            text = pytesseract.image_to_string(img, config='--psm 6 --oem 3')
        else:
            return {"error": "Unsupported file format. Please upload a PDF or image (JPG, PNG)."}
    except Exception as e:
        return {"error": f"Failed to read file: {str(e)}"}

    if not text or len(text.strip()) < 20:
        text = "No readable text found in the uploaded file."

    # Extract raw parameter values
    raw_data = extract_parameters(text)

    # Build structured parameter list
    processed_params = []
    for name, value in raw_data.items():
        status = classify_parameter(name, value)
        rng = NORMAL_RANGES.get(name, {})
        lo, hi = rng.get("min", 0), rng.get("max", 0)
        processed_params.append({
            "name": name,
            "value": value,
            "unit": rng.get("unit", ""),
            "normal_range": f"{lo}–{hi}",
            "status": status,
            "meaning": rng.get("meaning", ""),
            "min": lo,
            "max": hi,
            "category": rng.get("category", "General"),
            "interpretation": _build_parameter_explanation({
                "name": name, "value": value,
                "unit": rng.get("unit", ""), "status": status
            })
        })

    # Risk engine
    risk_level, confidence, risk_reasoning = _calculate_risk(processed_params)

    # Clinical summary
    clinical_summary = _generate_clinical_summary(processed_params, risk_level, risk_reasoning)

    # Doctor's interpretation
    doctors_interpretation = _generate_doctors_interpretation(processed_params)

    # Try Gemini enhancement
    gemini_result = _try_gemini_enhance(
        text_summary=f"Risk: {risk_level}. {risk_reasoning}",
        params_json=json.dumps([
            {"name": p["name"], "value": p["value"], "unit": p["unit"], "status": p["status"]}
            for p in processed_params
        ])
    )
    if gemini_result:
        doctors_interpretation = gemini_result

    # Wellness plan
    wellness = _generate_wellness_plan(processed_params, risk_level)
    wellness["risk_reasoning"] = risk_reasoning
    wellness["clinical_summary"] = clinical_summary

    # Department recommendation
    categories_found = list({NORMAL_RANGES.get(n, {}).get("category", "General") for n in raw_data})
    dept_map = {
        "Complete Blood Count": "Hematology",
        "Metabolic Panel": "Endocrinology",
        "Kidney Function": "Nephrology",
        "Liver Function": "Hepatology / Gastroenterology",
        "Lipid Panel": "Cardiology",
        "Thyroid": "Endocrinology",
        "Cardiovascular": "Cardiology",
        "Respiratory": "Pulmonology",
    }
    abnormal_cats = [
        NORMAL_RANGES.get(p["name"], {}).get("category", "")
        for p in processed_params if p["status"] in ("High", "Low")
    ]
    department = "General Medicine"
    for cat in abnormal_cats:
        if cat in dept_map:
            department = dept_map[cat]
            break
    if department == "General Medicine" and categories_found:
        department = dept_map.get(categories_found[0], "General Medicine")

    return {
        "risk_level": risk_level,
        "confidence": round(confidence, 2),
        "summary": clinical_summary,
        "parameters": processed_params,
        "ai_explanation": doctors_interpretation,
        "health_plan": wellness,
        "department": department
    }


