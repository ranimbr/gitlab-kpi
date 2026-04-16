from sqlalchemy import create_engine, text

def final_audit():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    with engine.connect() as conn:
        res = conn.execute(text("""
            SELECT count(*) FROM git_commit c 
            JOIN developer d ON c.developer_id = d.id 
            WHERE d.name = 'Tomasz Maczukin'
        """)).fetchone()
        print(f"TOTAL COMMITS TOOMASZ EN DB : {res[0]}")
        
        res_mr = conn.execute(text("""
            SELECT count(*) FROM merge_request mr 
            JOIN developer d ON mr.developer_id = d.id 
            WHERE d.name = 'Tomasz Maczukin'
        """)).fetchone()
        print(f"TOTAL MRs TOOMASZ EN DB : {res_mr[0]}")

if __name__ == "__main__":
    final_audit()
