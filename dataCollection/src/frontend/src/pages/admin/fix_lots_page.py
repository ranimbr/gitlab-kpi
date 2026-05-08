import os

path = r'c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrection - Copie - Copie (2)\dataCollection\src\frontend\src\pages\admin\ExtractionLotsPage.jsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix headers
target_headers = 'ID / Projet</th>\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Cible / Développeur</th>\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut</th>'
replacement_headers = 'ID / Projet</th>\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Cible / Développeur</th>\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Période</th>\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut</th>'

if target_headers in content:
    content = content.replace(target_headers, replacement_headers)
    print("Headers fixed")
else:
    # Try another variation just in case
    print("Headers NOT found, trying variation...")
    target_headers_2 = 'ID / Projet</th>\r\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Cible / Développeur</th>\r\n                           <th className="py-3 fs-11 text-uppercase text-muted ls-1 fw-bold">Statut</th>'
    if target_headers_2 in content:
        content = content.replace(target_headers_2, replacement_headers.replace('\n', '\r\n'))
        print("Headers fixed (variation)")
    else:
        print("Still NOT found")

# Fix colSpan
content = content.replace('colSpan="8"', 'colSpan="9"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
