import psycopg2

DB_URL = "postgresql://postgres:0000@localhost:5432/gitlab_kpi1"

def check_diagnostics():
    try:
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        
        # 1. Project 29
        cursor.execute("SELECT id, name, namespace, path, gitlab_project_id FROM project WHERE id = 29")
        p = cursor.fetchone()
        if p:
            print(f"Project 29 Details:\n - Name: {p[1]}\n - Namespace: {p[2]}\n - Path: {p[3]}\n - GitLab ID: {p[4]}")
        
        # 2. Find Tomasz
        print("\nSearching for Tomasz in 'developer' table...")
        cursor.execute("""
            SELECT id, name, gitlab_username, email, is_validated, is_active 
            FROM developer 
            WHERE name ILIKE '%%Tomasz%%' OR gitlab_username ILIKE '%%Tomasz%%'
        """)
        devs = cursor.fetchall()
        if devs:
            for d in devs:
                print(f" - ID: {d[0]}, Name: {d[1]}, Username: {d[2]}, Email: {d[3]}, Validated: {d[4]}, Active: {d[5]}")
                
                # Check link to project 29
                cursor.execute("SELECT is_active FROM developer_project WHERE developer_id = %s AND project_id = 29", (d[0],))
                link = cursor.fetchone()
                if link:
                    print(f"   -> Linked to Project 29 (Active: {link[0]})")
                else:
                    print("   -> NOT linked to Project 29")
        else:
            print("No developer found with name/username like 'Tomasz'.")

        # 3. Check ANY commits in the DB
        cursor.execute("SELECT COUNT(*) FROM git_commit")
        total_commits = cursor.fetchone()[0]
        print(f"\nTotal commits in 'git_commit' table (all projects): {total_commits}")

        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_diagnostics()
