
import requests
from datetime import datetime

GITLAB_TOKEN = "glpat-VBy_mP_ss82Yyxsx959-"
PROJECT_ID = 250833  # gitlab-runner

def scan_expert(username, name):
    headers = {"PRIVATE-TOKEN": GITLAB_TOKEN}
    
    # MRs
    mr_url = f"https://gitlab.com/api/v4/projects/{PROJECT_ID}/merge_requests"
    params = {
        "author_username": username,
        "updated_after": "2026-03-01T00:00:00Z",
        "updated_before": "2026-03-31T23:59:59Z",
        "state": "merged",
        "per_page": 100
    }
    mr_resp = requests.get(mr_url, params=params, headers=headers).json()
    mr_count = len(mr_resp) if isinstance(mr_resp, list) else 0
    
    # Commits
    commit_url = f"https://gitlab.com/api/v4/projects/{PROJECT_ID}/repository/commits"
    c_params = {"since": "2026-03-01T00:00:00Z", "until": "2026-03-31T23:59:59Z", "per_page": 100}
    c_resp = requests.get(commit_url, params=c_params, headers=headers).json()
    
    my_commits = [c for c in c_resp if name.lower() in c.get("author_name", "").lower()]
    commit_count = len(my_commits)

    print(f"VERIF: {name} ({username}) -> {mr_count} MRs, ~{commit_count} Commits")

if __name__ == "__main__":
    # Test des noms proposés par l'utilisateur
    scan_expert("ayufan", "Axel von Bertoldi")
    scan_expert("pedropombeiro", "Pedro Pombeiro")
    scan_expert("tmaczukin", "Tomasz Maczukin")
