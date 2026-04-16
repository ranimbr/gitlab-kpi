# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')

from sqlalchemy import create_engine, text
engine = create_engine('postgresql://postgres:0000@localhost:5432/gitlab_kpi1')

with engine.connect() as conn:
    # MRs avec vrais noms
    mrs = conn.execute(text('''
        SELECT id, gitlab_mr_id, author_name, state, developer_id, extraction_lot_id,
               created_at_gitlab, merged_at
        FROM merge_request
        ORDER BY id DESC
        LIMIT 10
    ''')).fetchall()
    print(f'=== MRS EN BASE: {len(mrs)} ===')
    for m in mrs:
        print(f'  id={m[0]}, mr={m[1]}, author={m[2]}, state={m[3]}, dev_id={m[4]}, lot={m[5]}, created={m[6]}, merged={m[7]}')

    # Verif developer_project
    dp = conn.execute(text('''
        SELECT dp.developer_id, d.name, d.gitlab_user_id, dp.project_id
        FROM developer_project dp
        JOIN developer d ON d.id = dp.developer_id
    ''')).fetchall()
    print(f'=== DEVELOPER_PROJECT: {len(dp)} liens ===')
    for d in dp:
        print(f'  dev_id={d[0]}, name={d[1]}, gitlab_uid={d[2]}, project_id={d[3]}')

    # Commits avec leur authored_date
    commits = conn.execute(text('''
        SELECT gitlab_commit_id, author_name, authored_date, developer_id, extraction_lot_id
        FROM git_commit
        ORDER BY id DESC
    ''')).fetchall()
    print(f'=== DETAIL COMMITS ({len(commits)}) ===')
    for c in commits:
        print(f'  id={str(c[0])[:8]}, author={c[1]}, date={c[2]}, dev_id={c[3]}, lot={c[4]}')
