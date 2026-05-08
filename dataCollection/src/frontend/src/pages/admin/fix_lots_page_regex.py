import os
import re

path = r'c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrection - Copie - Copie (2)\dataCollection\src\frontend\src\pages\admin\ExtractionLotsPage.jsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix headers using regex
pattern = r'(<th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Cible / Développeur</th>)'
replacement = r'\1\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Période</th>'

new_content = re.sub(pattern, replacement, content)
if new_content != content:
    print("Headers fixed with regex")
else:
    print("Regex fix failed")

# Fix colSpan
new_content = new_content.replace('colSpan="8"', 'colSpan="9"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
