import psycopg2

def get_conn():
    return psycopg2.connect(
        host='localhost', port=5432,
        dbname='gitlab_kpi1', user='postgres', password='0000'
    )

print("=== RESET CHIRURGICAL DE LA BASE ===")

# Afficher ce qu'on garde
conn = get_conn()
cur = conn.cursor()
try:
    cur.execute('SELECT id, username, email FROM app_user')
    users = cur.fetchall()
    print(f"Users a conserver ({len(users)}):")
    for u in users:
        print(f"  [{u[0]}] {u[1]} - {u[2]}")
except Exception:
    # Essai avec le vrai nom de table
    conn.rollback()
    try:
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
        all_tables = [r[0] for r in cur.fetchall()]
        print("Tables disponibles:", all_tables)
    except Exception as e2:
        print(f"Erreur: {e2}")

conn.rollback()

try:
    cur.execute("SELECT id, name FROM gitlab_config")
    configs = cur.fetchall()
    print(f"Configs GitLab a conserver ({len(configs)}):")
    for c in configs:
        print(f"  [{c[0]}] {c[1]}")
except Exception as e:
    conn.rollback()
    print(f"  gitlab_config: {e}")

conn.close()

print("\n=== SUPPRESSION PAR BLOC ISOLE ===")

# Chaque DELETE dans sa propre connexion pour eviter les rollbacks en cascade
tables_ordered = [
    "kpi_snapshot",        # En premier ! Contient les FK vers tout
    "extraction_lot",      # Lots d'extraction
    "developer_project",
    "developer_site",
    "developer_group_link",
    "developer",
    "developer_group",
    "project_site",
    "project",
    "site",
    "period",
]

for table in tables_ordered:
    conn = get_conn()
    conn.autocommit = True   # Auto-commit pour eviter les transactions bloquees
    cur = conn.cursor()
    try:
        cur.execute(f"DELETE FROM {table}")
        print(f"  [OK] {table}: {cur.rowcount} lignes supprimees")
    except psycopg2.Error as e:
        msg = (e.pgerror or str(e)).strip().split('\n')[0]
        print(f"  [SKIP] {table}: {msg}")
    finally:
        conn.close()

print("\n=== VERIFICATION FINALE ===")
conn = get_conn()
cur = conn.cursor()
for table in tables_ordered:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        status = "[OK] VIDE" if count == 0 else f"[!] {count} lignes restantes"
        print(f"  {table}: {status}")
    except Exception as e:
        print(f"  {table}: non accessible")
conn.close()

print("\nTermine. Importez maintenant les CSV 2026 depuis l'interface!")
