from app import app, db
from sqlalchemy import text

with app.app_context():
    try:
        # Drop old column if it exists and add new ones
        # For simplicity in this dev environment, we'll try to add them one by one
        columns = [
            ("report_path", "VARCHAR(255)"),
            ("risk_level", "VARCHAR(20)"),
            ("confidence", "FLOAT"),
            ("extracted_data", "JSON"),
            ("recommended_department", "VARCHAR(50)"),
            ("explanation", "TEXT")
        ]
        
        for col_name, col_type in columns:
            try:
                db.session.execute(text(f"ALTER TABLE medical_report ADD COLUMN {col_name} {col_type}"))
                db.session.commit()
                print(f"Added column {col_name}")
            except Exception as e:
                print(f"Column {col_name} might already exist: {e}")
                db.session.rollback()
        
        # Remove old column
        try:
            db.session.execute(text("ALTER TABLE medical_report DROP COLUMN report_content"))
            db.session.commit()
            print("Dropped column report_content")
        except:
            print("Could not drop report_content (might not exist or SQLite limitation)")
            db.session.rollback()
            
    except Exception as e:
        print(f"Migration error: {e}")
