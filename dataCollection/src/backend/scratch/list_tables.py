from sqlalchemy import create_engine, text

engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")

with engine.connect() as conn:
    result = conn.execute(text("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'"))
    print("=== Tables dans la base de données ===")
    for row in result:
        print(row[0])
