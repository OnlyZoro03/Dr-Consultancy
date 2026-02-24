import re
from pdfminer.high_level import extract_text
import pytesseract
from PIL import Image
import os
import json
import warnings

# Load .env FIRST so GEMINI_API_KEY is always available
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(__file__), '.env')
    load_dotenv(_env_path)
except ImportError:
    pass

# Google Generative AI SDK for Gemini LLM-powered explanations
try:
    warnings.filterwarnings('ignore', category=FutureWarning, module='google')
    import google.generativeai as genai_sdk
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Hard-coded fallback so key is ALWAYS available even if .env is missing
_HARDCODED_KEY = 'AIzaSyAapD-tQ9hJZKg1WNUAKpYHq9-XnESyyf0'

def _get_gemini_key():
    """Always returns the freshest key — env var takes priority over hard-coded."""
    return os.environ.get('GEMINI_API_KEY', '') or _HARDCODED_KEY


def _call_gemini(prompt, temperature=0.4):
    """Call Gemini and return text, or None on failure."""
    if not GEMINI_AVAILABLE:
        return None
    try:
        key = _get_gemini_key()
        genai_sdk.configure(api_key=key)
        model = genai_sdk.GenerativeModel(
            'gemini-2.0-flash',
            generation_config={'temperature': temperature, 'max_output_tokens': 1024}
        )
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f'[Gemini] API call failed: {e}')
        return None

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
    },
    # --- Vitamins & Minerals ---
    "Vitamin D": {
        "min": 30, "max": 100, "unit": "ng/mL", "category": "Vitamins & Minerals",
        "meaning": "25-hydroxyvitamin D — essential for bone health, immune function, and calcium absorption.",
        "low_causes": ["Inadequate sun exposure", "Poor dietary intake", "Malabsorption disorders", "Liver or kidney disease", "Dark skin pigmentation"],
        "high_causes": ["Excessive vitamin D supplementation", "Granulomatous diseases (sarcoidosis)"],
        "symptoms_low": ["Bone pain and muscle weakness", "Fatigue", "Frequent infections", "Depression", "Hair loss"],
        "symptoms_high": ["Nausea and vomiting", "Weakness", "Frequent urination", "Kidney stones", "Confusion"],
        "importance": "high"
    },
    "Serum Iron": {
        "min": 60, "max": 170, "unit": "mcg/dL", "category": "Vitamins & Minerals",
        "meaning": "Amount of iron circulating in the blood — reflects iron stores and transport capacity.",
        "low_causes": ["Iron deficiency anemia", "Chronic blood loss", "Poor dietary iron intake", "Malabsorption", "Pregnancy"],
        "high_causes": ["Hemochromatosis (iron overload)", "Liver disease", "Repeated blood transfusions", "Excessive iron supplementation"],
        "symptoms_low": ["Fatigue and weakness", "Pale skin", "Brittle nails", "Cold hands and feet", "Shortness of breath"],
        "symptoms_high": ["Joint pain", "Fatigue", "Liver enlargement", "Skin bronzing", "Heart problems"],
        "importance": "high"
    },
    "Ferritin": {
        "min": 12, "max": 300, "unit": "ng/mL", "category": "Vitamins & Minerals",
        "meaning": "Protein that stores iron in cells — the most accurate marker of total iron body stores.",
        "low_causes": ["Iron deficiency anemia", "Chronic blood loss", "Poor dietary intake"],
        "high_causes": ["Hemochromatosis", "Liver disease", "Chronic inflammation", "Cancer", "Frequent blood transfusions"],
        "symptoms_low": ["Fatigue", "Hair loss", "Restless leg syndrome", "Brittle nails", "Difficulty concentrating"],
        "symptoms_high": ["Fatigue", "Joint pain", "Abdominal pain", "Heart palpitations"],
        "importance": "high"
    },
    # --- Renal & Inflammatory Markers ---
    "eGFR": {
        "min": 60, "max": 120, "unit": "mL/min/1.73m²", "category": "Kidney Function",
        "meaning": "Estimated Glomerular Filtration Rate — best overall measure of how well your kidneys are filtering blood.",
        "low_causes": ["Chronic kidney disease", "Diabetes", "Hypertension", "Autoimmune kidney disease", "Aging"],
        "high_causes": [],
        "symptoms_low": ["Swelling in legs/ankles", "Fatigue", "Decreased urine output", "Nausea", "Shortness of breath"],
        "symptoms_high": [],
        "importance": "critical"
    },
    "Uric Acid": {
        "min": 3.4, "max": 7.0, "unit": "mg/dL", "category": "Metabolic Panel",
        "meaning": "Breakdown product of purines from food and cell turnover — elevated levels can cause gout and kidney stones.",
        "low_causes": ["Low purine diet", "Certain medications (allopurinol)", "Liver disease"],
        "high_causes": ["Gout", "High purine diet (red meat, seafood, alcohol)", "Kidney disease", "Obesity", "Diuretic medications"],
        "symptoms_low": [],
        "symptoms_high": ["Sudden severe joint pain (especially big toe)", "Joint swelling and redness", "Kidney stones", "Gout attacks"],
        "importance": "high"
    },
    "CRP": {
        "min": 0, "max": 10, "unit": "mg/L", "category": "Inflammatory Markers",
        "meaning": "C-Reactive Protein — produced by the liver in response to inflammation; elevated values signal active infection or inflammatory disease.",
        "low_causes": [],
        "high_causes": ["Bacterial infection", "Autoimmune diseases (lupus, rheumatoid arthritis)", "Inflammatory bowel disease", "Recent surgery or injury", "Cardiovascular disease risk"],
        "symptoms_low": [],
        "symptoms_high": ["Fever", "Fatigue", "Joint pain and swelling", "Muscle aches", "Redness or warmth at inflamed site"],
        "importance": "high"
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
    "Vitamin D": [
        r"(?:Vitamin\s*D(?:\s*25|3)?|25[\-\s]*OH|Calcidiol)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Serum Iron": [
        r"(?:Serum\s*Iron|Iron\s*Level|S\.?\s*Iron|Fe\b)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Ferritin": [
        r"(?:Ferritin|Serum\s*Ferritin)\s*[:\-]?\s*([\d\.]+)"
    ],
    "eGFR": [
        r"(?:eGFR|GFR|Glomerular\s*Filtration)\s*[:\-]?\s*([\d\.]+)"
    ],
    "Uric Acid": [
        r"(?:Uric\s*Acid|Serum\s*Urate|Urate)\s*[:\-]?\s*([\d\.]+)"
    ],
    "CRP": [
        r"(?:CRP|C[\-\s]*Reactive\s*Protein|hs[\-\s]*CRP)\s*[:\-]?\s*([\d\.]+)"
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
    """Build a warm, human-friendly explanation for a single parameter."""
    name, value, unit, status = p["name"], p["value"], p["unit"], p["status"]
    rng = NORMAL_RANGES.get(name, {})
    meaning = rng.get("meaning", "")
    lo, hi = rng.get("min"), rng.get("max")
    normal_range = f"{lo}–{hi}"

    lines = []

    if status == "Normal":
        lines.append(
            f"Your {name} came in at {value} {unit}, which is right where we want it to be (the healthy range is {normal_range} {unit}). "
            f"{meaning} "
            f"This is a good result — it tells us this part of your health is working well."
        )
    elif status == "Borderline":
        direction = "low" if value <= lo else "high"
        lines.append(
            f"Your {name} is {value} {unit}, which is just slightly {direction} of the ideal range ({normal_range} {unit}). "
            f"{meaning} "
            f"It's not something to panic about, but it is worth keeping an eye on. "
            f"A few lifestyle tweaks could help bring this back into a comfortable range."
        )
        causes = rng.get("low_causes" if direction == "low" else "high_causes", [])
        if causes:
            lines.append(f"The most common reasons for this include: {', '.join(causes[:3])}.")
    elif status == "Low":
        lines.append(
            f"Your {name} is {value} {unit}, which is below the healthy range of {normal_range} {unit}. "
            f"{meaning} "
            f"A low {name} is something your doctor should have a look at — it can indicate an underlying condition that's very treatable when caught early."
        )
        causes = rng.get("low_causes", [])
        symptoms = rng.get("symptoms_low", [])
        if causes:
            lines.append(f"Common reasons why {name} drops low include: {', '.join(causes[:4])}.")
        if symptoms:
            lines.append(
                f"Some people with low {name} notice things like: {', '.join(symptoms[:4])}. "
                "If any of that sounds familiar, please mention it to your doctor."
            )
    elif status == "High":
        lines.append(
            f"Your {name} came in at {value} {unit}, which is above the healthy range of {normal_range} {unit}. "
            f"{meaning} "
            f"An elevated {name} is worth investigating — in many cases it can be brought down with the right changes."
        )
        causes = rng.get("high_causes", [])
        symptoms = rng.get("symptoms_high", [])
        if causes:
            lines.append(f"Common reasons for a high {name} include: {', '.join(causes[:4])}.")
        if symptoms:
            lines.append(
                f"Keep an eye out for: {', '.join(symptoms[:4])}. "
                "If you're experiencing any of these, it's a good reason to see your doctor soon."
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
    """Generate warm, human-friendly doctor interpretation for all parameters."""
    if not processed_params:
        return (
            "I wasn't able to pull out specific numbers from your report this time. "
            "This can happen if the image is a bit blurry or the text format isn't quite right. "
            "Try uploading a clearer scan or a PDF version of your report, and I'll give you a full breakdown."
        )

    abnormal = [p for p in processed_params if p["status"] in ("High", "Low")]
    borderline = [p for p in processed_params if p["status"] == "Borderline"]
    normal = [p for p in processed_params if p["status"] == "Normal"]

    if not abnormal and not borderline:
        opening = (
            f"I've had a good look through your results and I'm pleased to tell you — everything looks healthy. "
            f"All {len(normal)} values we picked up are sitting comfortably within their normal ranges. "
            "That's genuinely good news and a sign that your body is doing well right now.\n"
        )
    elif len(abnormal) >= 2:
        opening = (
            f"I've reviewed your report carefully. There are a few things here that need your attention — "
            f"{len(abnormal)} of your values are outside the healthy range. I'll walk you through each one below, "
            "so you know exactly what they mean and what to do about them.\n"
        )
    else:
        opening = (
            f"Your report is largely encouraging — most of your values look fine. "
            f"There {'is one value' if len(abnormal) == 1 else f'are {len(abnormal)} values'} that "
            "we should keep an eye on, which I'll explain in detail below.\n"
        )

    lines = [opening]
    for p in processed_params:
        explanation = _build_parameter_explanation(p)
        emoji = "✅" if p["status"] == "Normal" else ("⚠️" if p["status"] == "Borderline" else "🔴")
        lines.append(f"{emoji} {p['name']}: {explanation}")

    lines.append(
        "\nOne last thing — please don't try to interpret these results in isolation. "
        "Lab values are just one piece of the puzzle. Your doctor will look at these numbers alongside "
        "how you're feeling, your medical history, and any medications you're taking before deciding on next steps. "
        "If anything is worrying you, don't hesitate to pick up the phone and call them."
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


# ─── Patient-Friendly Doctor Explanation Prompt ──────────────────────────────
DOCTOR_EXPLANATION_PROMPT = """
You are a warm, caring family doctor writing a personal note to your patient after reviewing their lab report.
Your tone should feel like a conversation between a trusted doctor and their patient — reassuring, clear, and human.

Report data:
{JSON_DATA}

Write your doctor's note following these rules:
1. Start with a warm, personal opening (e.g. "I've had a good look through your results and here's what I found...")
2. Briefly describe the overall picture in one sentence — good, mixed, or needs attention.
3. For EACH parameter:
   - Say the name in plain English (not just the abbreviation)
   - Say whether it's normal, a little low/high, or needs attention — in everyday words
   - Explain what that number means FOR THEIR BODY (e.g. "This tells us how your kidneys are doing")
   - If abnormal, briefly explain the most likely everyday reason and what they can do
4. Close with a warm, encouraging paragraph about next steps.
5. If anything is urgent, say so clearly but calmly — no scary medical language.

Style rules:
- Write like you're talking to a friend, not filling out a form.
- No bullet-point lists — write in flowing, natural paragraphs.
- Avoid all medical abbreviations unless you immediately explain them.
- Use phrases like "the good news is...", "something worth keeping an eye on...", "nothing to panic about, but..."
- Maximum 400 words. Be warm, not wordy.
"""


def _try_gemini_enhance(processed_params, risk_level, risk_reasoning):
    """Enhance doctor's explanation using Gemini AI with the patient-friendly prompt."""
    json_data = json.dumps({
        "risk_level": risk_level,
        "risk_reasoning": risk_reasoning,
        "parameters": [
            {
                "name": p["name"],
                "value": p["value"],
                "unit": p["unit"],
                "status": p["status"],
                "normal_range": p.get("normal_range", ""),
                "category": p.get("category", ""),
                "interpretation": p.get("interpretation", ""),
            }
            for p in processed_params
        ]
    }, indent=2)
    prompt = DOCTOR_EXPLANATION_PROMPT.replace("{JSON_DATA}", json_data)
    return _call_gemini(prompt, temperature=0.3)


def answer_report_question(question, extracted_data, ai_explanation):
    """Answer a patient's question about their report using Gemini AI with smart fallback."""
    if not extracted_data:
        return (
            "I don't have enough data from your report yet. "
            "Please make sure your report was uploaded and analyzed successfully, then try again."
        )

    question_lower = question.lower().strip()
    abnormal   = [p for p in extracted_data if p["status"] in ("High", "Low")]
    borderline = [p for p in extracted_data if p["status"] == "Borderline"]
    normal     = [p for p in extracted_data if p["status"] == "Normal"]

    # ── Gemini AI (primary path) ──────────────────────────────────────────────
    context = json.dumps(extracted_data, indent=2)
    prompt = (
        "You are a warm, empathetic family doctor chatting with your patient about their lab results.\n"
        "Your tone is caring, clear, and human — like a trusted friend who happens to be a doctor.\n\n"
        f"Patient's lab report:\n{context}\n\n"
        f"Patient's question: \"{question}\"\n\n"
        "How to respond:\n"
        "- Answer their SPECIFIC question directly — don't give a generic overview.\n"
        "- Mention their actual numbers naturally (e.g. 'your hemoglobin came in at 11.2, which is a little low').\n"
        "- Explain what it means for their day-to-day life in plain English.\n"
        "- If something is off, reassure them first, then explain the likely everyday reason.\n"
        "- Give 2–3 practical, specific things they can do (food, lifestyle, when to see a doctor).\n"
        "- Be clear about urgency — don't alarm them unnecessarily, but don't downplay serious issues.\n"
        "- Sound like a person, not a medical report. Use 'you', 'your', 'I'd suggest'.\n"
        "- No bullet lists — write in natural, flowing sentences. 2–3 paragraphs max."
    )
    gemini_answer = _call_gemini(prompt, temperature=0.5)
    if gemini_answer:
        return gemini_answer.strip() + "\n\n⚠️ *Always consult your doctor for personalised medical advice.*"

    # ── Smart rule-based fallback (question-type specific) ────────────────────

    # 1. Risk level questions
    if any(w in question_lower for w in ['risk', 'danger', 'critical', 'serious', 'urgent', 'severe']):
        if not abnormal and not borderline:
            return (
                "Great news — based on what I can see in your report, your risk level looks LOW. "
                "All the values we picked up are sitting comfortably within the healthy range, which means "
                "there's nothing here that needs urgent attention right now.\n\n"
                "That said, it's always a good idea to check in with your doctor once a year just to stay on top of things. "
                "Keep doing what you're doing — eat well, stay active, drink plenty of water, and get enough sleep.\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )
        else:
            issues = ', '.join(f"{p['name']} ({p['value']} {p['unit']}, which is {p['status'].lower()})" for p in abnormal[:3])
            border_issues = ', '.join(f"{p['name']} is sitting just on the borderline" for p in borderline[:2])
            detail = issues + (f", and {border_issues}" if border_issues and abnormal else border_issues)
            level = 'HIGH' if len(abnormal) >= 2 else 'MEDIUM'
            return (
                f"Looking at your results honestly, I'd put your risk level at {level} right now. "
                f"The main reason is that {detail}. "
                f"That's {len(abnormal)} reading{'s' if len(abnormal) > 1 else ''} outside the healthy range, which is worth taking seriously.\n\n"
                "I wouldn't panic — many of these things are very treatable, especially when caught early. "
                "But I would strongly encourage you to book an appointment with your doctor soon and bring this report along. "
                "The sooner you get a proper check-up, the better your options.\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )

    # 2. 'Is my report normal?' / 'Am I okay?'
    if any(w in question_lower for w in ['normal', 'fine', 'okay', 'ok ', ' ok', 'good', 'healthy', 'alright', 'all right']):
        if not abnormal and not borderline:
            return (
                f"I have good news for you — your report looks really healthy! All {len(normal)} values we found are sitting nicely within their normal ranges.\n\n"
                "That means your blood cells, organ function, and metabolic markers are all doing their job well. "
                "Whatever you're doing in terms of diet and lifestyle, keep it up — it's clearly working.\n\n"
                "It's still worth having a yearly check-up with your doctor just to track things over time, but based on this report, you're in good shape.\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )
        else:
            normal_list = ', '.join(p['name'] for p in normal[:3])
            abnormal_list = ', '.join(f"{p['name']} (which came in {p['status'].lower()} at {p['value']} {p['unit']})" for p in abnormal)
            return (
                f"Your report is a bit of a mixed bag, honestly. There's plenty of good news — {normal_list or 'several of your values'} all look perfectly fine.\n\n"
                f"But there {'are' if len(abnormal) > 1 else 'is'} {len(abnormal)} thing{'s' if len(abnormal) > 1 else ''} worth paying attention to: {abnormal_list}. "
                "These are outside the healthy range, and it's important not to ignore them. The good news is that catching these things early gives you the best chance to fix them.\n\n"
                "I'd recommend booking an appointment with your doctor to go over these specific values together.\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )

    # 3. Worry / concern questions
    if any(w in question_lower for w in ['worried', 'worry', 'concern', 'bad result', 'scared', 'afraid', 'anxious']):
        if not abnormal:
            return (
                "Honestly? Based on this report, there's nothing that should be keeping you up at night. "
                "Every value we picked up is sitting comfortably within the normal range — that's genuinely good news.\n\n"
                "If you're feeling unwell despite this, always trust your body and talk to your doctor. "
                "But from what the numbers are telling us, you're in a good place right now.\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )
        else:
            param_details = '\n'.join(
                f"• {p['name']}: {p['value']} {p['unit']} (healthy range: {p.get('normal_range','—')}) — currently {p['status'].lower()}"
                for p in abnormal
            )
            return (
                f"I want to be honest with you without causing unnecessary alarm. There are a few values here that do need your attention:\n\n{param_details}\n\n"
                "Now, before you worry too much — the fact that you've caught these through a lab test is actually a really positive thing. "
                "Most of these kinds of readings are very manageable, whether through diet, lifestyle changes, or a short course of treatment. "
                "What matters most right now is booking an appointment with your doctor and showing them this report. Don't leave it too long.\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )

    # 4. Diet / food / nutrition questions
    if any(w in question_lower for w in ['diet', 'food', 'eat', 'nutrition', 'meal', 'drink', 'avoid', 'consume']):
        plan = _generate_wellness_plan(extracted_data, 'Medium')
        diet_text = '\n'.join('\u2022 ' + item for item in plan['diet'].split(' • '))
        return (
            f"Great question — what you eat can make a real difference to your results. Based on your specific values, here's what I'd suggest:\n\n{diet_text}\n\n"
            f"On hydration: {plan['hydration']}\n\n"
            "These aren't generic tips — they're matched to your actual readings. For a more detailed plan tailored to you, a registered dietitian can be really helpful.\n\n"
            "⚠️ *Always consult your doctor for personalised medical advice.*"
        )

    # 5. Exercise / lifestyle questions
    if any(w in question_lower for w in ['exercise', 'workout', 'gym', 'sport', 'physical', 'walk', 'run', 'activity', 'fitness']):
        plan = _generate_wellness_plan(extracted_data, 'Medium')
        ex_text = '\n'.join('\u2022 ' + item for item in plan['exercise'].split(' • '))
        return (
            f"Movement is one of the best medicines, and your results give us a good idea of where to start. Here's what I'd suggest for you:\n\n{ex_text}\n\n"
            f"On sleep: {plan['sleep']}\nOn stress: {plan['stress']}\n\n"
            "Start small and build gradually — even a 20-minute walk daily can shift your numbers meaningfully over time.\n\n"
            "⚠️ *Always consult your doctor for personalised medical advice.*"
        )

    # 6. Specific parameter keyword matching (order: longer phrases first)
    keywords_map = [
        (['blood sugar', 'fasting sugar', 'fbs', 'rbs', 'sugar level', 'glucose', 'diabetes'], 'Glucose'),
        (['hemoglobin', 'haemoglobin', 'hgb', 'anemia', 'anaemia', 'iron level'], 'Hemoglobin'),
        (['white blood cell', 'white cell', 'wbc', 'leukocyte', 'tlc', 'infection count'], 'WBC Count'),
        (['red blood cell', 'red cell', 'rbc', 'erythrocyte'], 'RBC Count'),
        (['platelet', 'plt', 'thrombocyte', 'clotting', 'bleeding time'], 'Platelets'),
        (['blood pressure', 'hypertension', 'systolic', 'diastolic', 'bp level'], 'Systolic BP'),
        (['heart rate', 'pulse rate', 'bpm', 'heartbeat', 'heart beat'], 'Heart Rate'),
        (['ldl', 'bad cholesterol', 'low density'], 'LDL Cholesterol'),
        (['hdl', 'good cholesterol', 'high density'], 'HDL Cholesterol'),
        (['total cholesterol', 'cholesterol level', 'cholesterol'], 'Total Cholesterol'),
        (['triglyceride', 'tg level', 'trig'], 'Triglycerides'),
        (['creatinine', 'kidney function', 'renal function', 'gfr'], 'Creatinine'),
        (['blood urea', 'bun', 'urea level'], 'BUN'),
        (['sgpt', 'alt level', 'liver enzyme', 'liver function'], 'ALT'),
        (['sgot', 'ast level'], 'AST'),
        (['bilirubin', 'jaundice'], 'Total Bilirubin'),
        (['thyroid', 'tsh level', 't3 ', 't4 '], 'TSH'),
        (['hba1c', 'a1c', 'glycated', 'long term sugar', '3 month sugar'], 'HbA1c'),
        (['oxygen', 'spo2', 'o2 sat', 'saturation', 'breathing difficulty'], 'Oxygen Saturation'),
        (['temperature', 'fever', 'body temp'], 'Temperature'),
        (['sodium', 'na+', 'salt level'], 'Sodium'),
        (['potassium', 'k+', 'electrolyte'], 'Potassium'),
        (['vitamin d', 'vit d', '25-oh', 'calcidiol', 'vitamin d3', 'bone vitamin'], 'Vitamin D'),
        (['serum iron', 'iron level', 's. iron', ' iron ', 'iron store'], 'Serum Iron'),
        (['ferritin', 'serum ferritin', 'iron store', 'iron depot'], 'Ferritin'),
        (['egfr', 'gfr', 'glomerular filtration', 'kidney filter'], 'eGFR'),
        (['uric acid', 'urate', 'gout', 'purine'], 'Uric Acid'),
        (['crp', 'c-reactive', 'c reactive', 'inflammation marker', 'inflammatory marker'], 'CRP'),
    ]

    matched_param = None
    for keywords, param_name in keywords_map:
        if any(kw in question_lower for kw in keywords):
            matched_param = next((p for p in extracted_data if p['name'] == param_name), None)
            if matched_param:
                break

    if matched_param:
        return (
            _build_parameter_explanation(matched_param) +
            "\n\n⚠️ *Always consult your doctor for personalised medical advice.*"
        )

    # 7. 'What should I do?' / 'Next steps?'
    if any(w in question_lower for w in ['do next', 'what should', 'next step', 'what to do', 'action', 'recommend', 'suggest']):
        if not abnormal:
            return (
                "Since everything looks good in your report, your next steps are actually pretty simple — just keep doing what you're doing:\n\n"
                "• Keep eating a balanced diet with plenty of fruits, vegetables, and whole grains\n"
                "• Exercise for at least 30 minutes, 5 days a week — even brisk walking counts\n"
                "• Drink 8–10 glasses of water daily — your kidneys and heart will thank you\n"
                "• Aim for a yearly check-up with your doctor to keep track of things over time\n"
                "• If you notice any new symptoms or just don't feel right, don't hesitate to get checked out\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )
        else:
            specific = '\n'.join(f"• Ask your doctor specifically about your {p['name']} — it came in {p['status'].lower()} at {p['value']} {p['unit']}" for p in abnormal[:3])
            return (
                f"Given that you have {len(abnormal)} value{'s' if len(abnormal) > 1 else ''} outside the healthy range, here's what I'd suggest doing:\n\n"
                f"• Book an appointment with your doctor as soon as you can — ideally within the next 1–2 weeks\n"
                f"{specific}\n"
                "• Bring this report with you — your doctor needs to see the actual numbers\n"
                "• Don't try to treat this yourself based on what you read online\n"
                "• After any treatment or lifestyle changes, retest in 4–6 weeks to see if things are improving\n\n"
                "⚠️ *Always consult your doctor for personalised medical advice.*"
            )

    # 8. Final catch-all — give a useful specific summary
    total = len(extracted_data)
    abn_count = len(abnormal)
    bord_count = len(borderline)
    norm_count = len(normal)
    summary = f"I've gone through your report and found {total} value{'s' if total != 1 else ''}. "
    if abn_count:
        summary += f"{abn_count} of {'them are' if abn_count > 1 else 'them is'} outside the healthy range — specifically {', '.join(p['name'] for p in abnormal)}. "
    if bord_count:
        summary += f"{bord_count} {'are' if bord_count > 1 else 'is'} sitting on the borderline and worth watching. "
    if norm_count:
        summary += f"The good news is {norm_count} {'are' if norm_count > 1 else 'is'} completely normal. "
    summary += (
        "\n\nFeel free to ask me anything — try something like 'What should I be worried about?', "
        "'What should I eat?', 'Explain my risk level', or ask about a specific test like 'Tell me about my glucose'."
    )
    return summary + "\n\n⚠️ *Always consult your doctor for personalised medical advice.*"


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

    # Try Gemini enhancement with patient-friendly doctor prompt
    gemini_result = _try_gemini_enhance(processed_params, risk_level, risk_reasoning)
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


