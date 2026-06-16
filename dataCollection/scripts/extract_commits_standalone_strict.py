#!/usr/bin/env python3

import argparse
import json
import urllib.request
import urllib.parse
import urllib.error
import sys
from datetime import datetime

def parse_args():
    parser = argparse.ArgumentParser(description="Extrait les Commits d'un projet GitLab avec leurs statistiques. FILTRAGE STRICT PAR authored_date.")
    parser.add_argument("--url", required=True, help="URL de base de GitLab (ex: https://gitlab.com)")
    parser.add_argument("--token", required=False, default=None, help="Private Token (Personal Access Token) - Optionnel pour les projets publics")
    parser.add_argument("--project-id", required=True, help="L'ID du projet GitLab")
    parser.add_argument("--output", default="commits_dump.json", help="Chemin du fichier de sortie (ex: commits_dump.json)")
    parser.add_argument("--since", default=None, help="Filtrer les commits après cette date (ISO 8601, ex: 2024-01-01T00:00:00Z)")
    parser.add_argument("--until", default=None, help="Filtrer les commits avant cette date (ISO 8601, ex: 2024-01-31T23:59:59Z)")
    parser.add_argument("--ref", default=None, help="La branche cible (par défaut: toutes les branches de l'historique)")
    parser.add_argument("--author", default=None, help="Filtrer par nom d'auteur (ex: 'X')")
    parser.add_argument("--split-by-author", action="store_true", help="Générer un fichier séparé par développeur")
    return parser.parse_args()

class GitLabClient:
    def __init__(self, base_url, token=None):
        self.base_url = base_url.rstrip("/")
        if not self.base_url.endswith("/api/v4"):
            self.base_url += "/api/v4"
        self.headers = {}
        if token:
            self.headers["PRIVATE-TOKEN"] = token

    def _request(self, endpoint, params=None):
        url = f"{self.base_url}{endpoint}"
        if params:
            # Enlever les valeurs None
            params = {k: v for k, v in params.items() if v is not None}
            if params:
                query_string = urllib.parse.urlencode(params)
                url = f"{url}?{query_string}"

        req = urllib.request.Request(url, headers=self.headers)
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            print(f"Erreur HTTP {e.code} sur {url}: {e.reason}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"Erreur réseau sur {url}: {e}", file=sys.stderr)
            return None

    def get_paginated(self, endpoint, params=None):
        page = 1
        per_page = 100
        results = []
        if params is None:
            params = {}

        while True:
            params["page"] = page
            params["per_page"] = per_page
            data = self._request(endpoint, params)
            
            if not data:
                break
                
            results.extend(data)
            if len(data) < per_page:
                break
                
            page += 1
            
        return results

def main():
    args = parse_args()
    client = GitLabClient(args.url, args.token)
    
    print(f"Démarrage de l'extraction des commits pour le projet ID: {args.project_id}...")
    
    # 1. Préparation des paramètres
    # with_stats=true permet d'obtenir directement les additions/deletions 
    # sans avoir à faire un appel par commit (ce qui ferait exploser le Rate Limit).
    params = {"with_stats": "true"}
    
    if args.ref:
        params["ref_name"] = args.ref
    else:
        # Par défaut, on demande à GitLab toutes les branches
        params["all"] = "true"
        
    if args.since:
        params["since"] = args.since
    if args.until:
        params["until"] = args.until
    if args.author:
        params["author"] = args.author
        
    print("Récupération de la liste des commits (avec leurs statistiques)...")
    commits = client.get_paginated(f"/projects/{args.project_id}/repository/commits", params)
    
    if not commits:
        print("Aucun commit trouvé.")
        sys.exit(0)
        
    print(f"Trouvé {len(commits)} commits. Vérification des statistiques manquantes...")
    
    # GitLab peut parfois omettre les stats même avec with_stats=true sur certains endpoints/versions
    # On vérifie et on fait un fallback si nécessaire (exactement comme le fait votre extraction_service.py).
    commits_to_save = []
    
    for i, commit in enumerate(commits):
        sha = commit.get("id")
        
        author_name = commit.get("author_name", "").lower()
        author_email = commit.get("author_email", "").lower()
        
        # Ignorer les bots
        bot_keywords = ["bot", "renovate", "dependabot", "automation", "pipeline", "ci/cd", "noreply", "duo fix"]
        is_bot = any(kw in author_name or kw in author_email for kw in bot_keywords)
        if is_bot:
            continue
            
        # Si on a pas les stats (additions, deletions), on fetch le commit un par un (SENIOR HOTFIX)
        if "stats" not in commit:
            detail = client._request(f"/projects/{args.project_id}/repository/commits/{sha}")
            if detail and "stats" in detail:
                commit = detail
                
        commits_to_save.append(commit)
        
        if (i + 1) % 100 == 0:
            print(f"Traitement : {i + 1} / {len(commits)} commits vérifiés...")
    
    # ✅ FILTRAGE STRICT PAR authored_date (STRICT MODE)
    if args.since and args.until:
        print(f"Application du filtrage STRICT par authored_date...")
        try:
            since_dt = datetime.fromisoformat(args.since.replace("Z", "+00:00"))
            until_dt = datetime.fromisoformat(args.until.replace("Z", "+00:00"))
            
            commits_before_filter = len(commits_to_save)
            commits_to_save = [
                c for c in commits_to_save
                if "authored_date" in c
                and datetime.fromisoformat(c["authored_date"].replace("Z", "+00:00")) >= since_dt
                and datetime.fromisoformat(c["authored_date"].replace("Z", "+00:00")) < until_dt
            ]
            commits_after_filter = len(commits_to_save)
            
            print(f"Filtrage STRICT: {commits_before_filter} → {commits_after_filter} commits ({commits_before_filter - commits_after_filter} commits exclus)")
        except Exception as e:
            print(f"Erreur lors du filtrage strict: {e}", file=sys.stderr)
            print("Continuation sans filtrage strict...")

    # Sauvegarde dans le fichier
    if args.split_by_author:
        # Grouper par développeur
        commits_by_author = {}
        for commit in commits_to_save:
            # Pour les commits GitLab donne "author_name" et "author_email", pas de username direct souvent dans la liste.
            author_key = commit.get("author_name") or commit.get("author_email") or "unknown"
            # Nettoyer un peu le nom pour le fichier
            author_key = "".join(c for c in author_key if c.isalnum() or c in " ._-").strip()
            
            if author_key not in commits_by_author:
                commits_by_author[author_key] = []
            commits_by_author[author_key].append(commit)
            
        for author, author_commits in commits_by_author.items():
            filename = f"commits_{author}.json"
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(author_commits, f, ensure_ascii=False, indent=2)
            try:
                print(f"Sauvegardé {len(author_commits)} commits dans '{filename}'.")
            except UnicodeEncodeError:
                safe_name = filename.encode('ascii', 'replace').decode('ascii')
                print(f"Sauvegardé {len(author_commits)} commits dans '{safe_name}'.")
            
        print(f"\nExtraction terminée ! Les données ont été réparties dans {len(commits_by_author)} fichiers.")
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(commits_to_save, f, ensure_ascii=False, indent=2)
            
        print(f"\nExtraction terminée ! Les données de {len(commits_to_save)} commits ont été sauvegardées dans '{args.output}'.")
        print("Ce fichier est prêt à être importé dans le dashboard de KPIs.")

if __name__ == "__main__":
    main()