#!/usr/bin/env python3

import argparse
import json
import urllib.request
import urllib.parse
import urllib.error
import sys
from datetime import datetime

def parse_args():
    parser = argparse.ArgumentParser(description="Extrait les Merge Requests d'un projet GitLab avec leurs détails (commits, notes, approbations).")
    parser.add_argument("--url", required=True, help="URL de base de GitLab (ex: https://gitlab.com)")
    parser.add_argument("--token", required=False, default=None, help="Private Token (Personal Access Token) - Optionnel pour les projets publics")
    parser.add_argument("--project-id", required=True, help="L'ID du projet GitLab")
    parser.add_argument("--output", default="mrs_dump.json", help="Chemin du fichier de sortie (ex: mrs_dump.json)")
    parser.add_argument("--state", default="all", help="L'état des MRs (all, opened, closed, merged)")
    parser.add_argument("--updated-after", default=None, help="Filtrer par date de mise à jour (ISO 8601, ex: 2024-01-01T00:00:00Z)")
    parser.add_argument("--updated-before", default=None, help="Filtrer par date de mise à jour (ISO 8601, ex: 2024-01-31T23:59:59Z)")
    parser.add_argument("--author-username", default=None, help="Filtrer pour un seul développeur (ex: anis)")
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
                return json.loads(response.read().decode('utf-8')), response.info()
        except urllib.error.HTTPError as e:
            print(f"Erreur HTTP {e.code} sur {url}: {e.reason}", file=sys.stderr)
            if e.code == 404:
                return None, None
            return None, None
        except Exception as e:
            print(f"Erreur réseau sur {url}: {e}", file=sys.stderr)
            return None, None

    def get_paginated(self, endpoint, params=None):
        page = 1
        per_page = 100
        results = []
        if params is None:
            params = {}

        while True:
            params["page"] = page
            params["per_page"] = per_page
            data, headers = self._request(endpoint, params)
            
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
    
    print(f"Démarrage de l'extraction pour le projet ID: {args.project_id}...")
    
    # 1. Fetch des MRs
    params = {"state": args.state}
    if args.updated_after:
        params["updated_after"] = args.updated_after
    if args.updated_before:
        params["updated_before"] = args.updated_before
    if args.author_username:
        params["author_username"] = args.author_username
        
    print("Récupération de la liste des Merge Requests...")
    mrs = client.get_paginated(f"/projects/{args.project_id}/merge_requests", params)
    
    if not mrs:
        print("Aucune Merge Request trouvée.")
        sys.exit(0)
        
    print(f"Trouvé {len(mrs)} Merge Requests. Début de l'extraction profonde (commits, notes, approbations)...")
    
    # Filtrage des bots et récupération des détails
    enriched_mrs = []
    
    # Mots-clés typiques de bots
    bot_keywords = ["bot", "renovate", "dependabot", "automation", "pipeline", "ci/cd", "noreply", "duo fix"]
    
    # Filtrer d'abord la liste avant de faire les appels lourds
    valid_mrs = []
    for mr in mrs:
        author_name = mr.get("author", {}).get("name", "").lower()
        author_username = mr.get("author", {}).get("username", "").lower()
        if any(kw in author_name or kw in author_username for kw in bot_keywords):
            continue
        valid_mrs.append(mr)
        
    print(f"Après filtrage des bots, il reste {len(valid_mrs)} Merge Requests à analyser.")
    
    for i, mr in enumerate(valid_mrs):
        iid = mr.get("iid")
        try:
            print(f"[{i+1}/{len(valid_mrs)}] Analyse de la MR !{iid} ({mr.get('title')[:30]}...)")
        except UnicodeEncodeError:
            print(f"[{i+1}/{len(valid_mrs)}] Analyse de la MR !{iid} (...)")
        
        # A. Fetch details (optionnel, la liste donne déjà pas mal, mais par sécurité)
        detail, _ = client._request(f"/projects/{args.project_id}/merge_requests/{iid}")
        if detail:
            mr.update(detail)
            
        # B. Fetch Commits
        mr_commits = client.get_paginated(f"/projects/{args.project_id}/merge_requests/{iid}/commits")
        
        # Filtrer les commits de type "Merge branch" pour le décompte officiel
        filtered_commits = [
            c for c in mr_commits 
            if not c.get("title", "").lower().startswith("merge branch")
        ]
        mr["commits_count"] = len(filtered_commits)
        
        # Calcul du Cycle Time (Date Merge - Date 1er Commit)
        if mr.get("state") == "merged" and mr.get("merged_at") and mr_commits:
            try:
                # Le premier commit est généralement le dernier dans la liste retournée par GitLab
                first_commit_date_str = mr_commits[-1].get("authored_date")
                if first_commit_date_str:
                    first_dt = datetime.fromisoformat(first_commit_date_str.replace("Z", "+00:00"))
                    merge_dt = datetime.fromisoformat(mr.get("merged_at").replace("Z", "+00:00"))
                    cycle_time_hours = (merge_dt - first_dt).total_seconds() / 3600.0
                    if cycle_time_hours > 0:
                        mr["cycle_time_hours"] = round(cycle_time_hours, 2)
            except Exception as e:
                print(f"  -> Impossible de calculer le cycle_time_hours pour !{iid}: {e}")
                
        # C. Fetch Notes (Commentaires)
        mr_notes = client.get_paginated(f"/projects/{args.project_id}/merge_requests/{iid}/notes", {"sort": "asc"})
        # On ne compte que les notes non systèmes (commentaires des utilisateurs)
        filtered_notes = [n for n in mr_notes if not n.get("system")]
        mr["user_notes_count"] = len(filtered_notes)
        
        # D. Fetch Approbations
        approvals, _ = client._request(f"/projects/{args.project_id}/merge_requests/{iid}/approvals")
        if approvals:
            # On stocke l'objet directement dans le JSON pour que l'API du dashboard puisse le lire
            mr["approvals_data"] = approvals
            
            # E. Calcul du temps de relecture (création -> approbation)
            # On récupère les événements d'approbation pour trouver la date exacte
            resource_state_events = client.get_paginated(f"/projects/{args.project_id}/merge_requests/{iid}/resource_state_events")
            approval_event = None
            for event in resource_state_events:
                if event.get("state") == "approved":
                    approval_event = event
                    break
            
            if approval_event and approval_event.get("created_at"):
                try:
                    approval_dt = datetime.fromisoformat(approval_event["created_at"].replace("Z", "+00:00"))
                    created_dt = datetime.fromisoformat(mr.get("created_at").replace("Z", "+00:00"))
                    review_time_hours = (approval_dt - created_dt).total_seconds() / 3600.0
                    if review_time_hours > 0:
                        mr["review_time_hours"] = round(review_time_hours, 2)
                        mr["approved_at"] = approval_event["created_at"]
                except Exception as e:
                    print(f"  -> Impossible de calculer le review_time_hours pour !{iid}: {e}")
            
        enriched_mrs.append(mr)

    # Sauvegarde dans le fichier
    if args.split_by_author:
        # Grouper par développeur
        mrs_by_author = {}
        for mr in enriched_mrs:
            author_username = mr.get("author", {}).get("username", "unknown")
            if author_username not in mrs_by_author:
                mrs_by_author[author_username] = []
            mrs_by_author[author_username].append(mr)
            
        for username, author_mrs in mrs_by_author.items():
            filename = f"merge_requests_{username}.json"
            with open(filename, "w", encoding="utf-8") as f:
                json.dump(author_mrs, f, ensure_ascii=False, indent=2)
            try:
                print(f"Sauvegardé {len(author_mrs)} MRs dans '{filename}'.")
            except UnicodeEncodeError:
                safe_name = filename.encode('ascii', 'replace').decode('ascii')
                print(f"Sauvegardé {len(author_mrs)} MRs dans '{safe_name}'.")
            
        print(f"\nExtraction terminée ! Les données ont été réparties dans {len(mrs_by_author)} fichiers.")
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(enriched_mrs, f, ensure_ascii=False, indent=2)
            
        print(f"\nExtraction terminée ! Les données de {len(enriched_mrs)} MRs ont été sauvegardées dans '{args.output}'.")

if __name__ == "__main__":
    main()
