import psycopg2

DB_URL = "postgresql://postgres:0000@localhost:5432/gitlab_kpi1"

def list_tables():
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        print("Connected to PostgreSQL")

        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        tables = cursor.fetchall()
        print("\nTables in 'public' schema:")
        for t in tables:
            print(f" - {t[0]}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_tables()
