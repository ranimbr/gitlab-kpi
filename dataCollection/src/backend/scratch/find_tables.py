import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_engine(db_url)

with engine.connect() as conn:
    print("--- Listing All Tables ---")
    result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
    for row in result:
        print(f"Table: {row[0]}")
