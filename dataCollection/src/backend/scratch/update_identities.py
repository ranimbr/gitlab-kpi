from sqlalchemy import create_engine, text

def update_identities():
    engine = create_engine("postgresql://postgres:0000@localhost:5432/gitlab_kpi1")
    with engine.connect() as conn:
        # 1. Mise à jour de Tomasz
        print("Mise à jour de Tomasz Maczukin...")
        conn.execute(text("UPDATE developer SET email = 'tomasz@maczukin.pl' WHERE name = 'Tomasz Maczukin';"))
        
        # 2. Sécurisation de Igor Drabchuk (on s'assure qu'il n'a pas d'ID erroné)
        # Surtout s'assurer que gitlab_user_id n'est pas celui de Igor Wiedler (qui est peut-être 12345)
        print("Sécurisation du profil de Igor Drabchuk...")
        conn.execute(text("UPDATE developer SET gitlab_user_id = NULL WHERE name = 'Igor Drabchuk';"))
        
        conn.commit()
        print("Mises à jour terminées avec succès.")

if __name__ == "__main__":
    update_identities()
