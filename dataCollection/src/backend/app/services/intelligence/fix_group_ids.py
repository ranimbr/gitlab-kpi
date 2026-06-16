with open('trend_analyzer.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_text = '        rh_recommendations: List[Dict] = []\n\n        # Détecter si c\'est une analyse d\'équipes ou sites'

new_text = '        rh_recommendations: List[Dict] = []\n\n        # Filtrer par group_ids si fourni (pour multi-équipes team_lead)\n        if self.group_ids:\n            site_histories = {\n                k: v for k, v in site_histories.items() if k in self.group_ids\n            }\n\n        # Détecter si c\'est une analyse d\'équipes ou sites'

if old_text in content:
    content = content.replace(old_text, new_text)
    with open('trend_analyzer.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Successfully added group_ids filtering to TrendAnalyzer')
else:
    print('Pattern not found')
