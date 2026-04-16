import psycopg2

try:
    conn = psycopg2.connect("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, gitlab_username, group_name FROM developers;")
    devs = cur.fetchall()
    print("Developers:")
    for d in devs:
        print(d)

    cur.execute("SELECT developer_id, COUNT(*) FROM commits GROUP BY developer_id;")
    commits = cur.fetchall()
    print("\nCommits by dev:")
    for c in commits:
        print(c)
        
    cur.execute("SELECT author_id, COUNT(*) FROM merge_requests GROUP BY author_id;")
    mrs = cur.fetchall()
    print("\nMRs by dev:")
    for m in mrs:
        print(m)
        
except Exception as e:
    print("Error:", e)
