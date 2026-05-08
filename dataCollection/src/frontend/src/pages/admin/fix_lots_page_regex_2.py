import os
import re

path = r'c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrection - Copie - Copie (2)\dataCollection\src\frontend\src\pages\admin\ExtractionLotsPage.jsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Pagination
pattern_pagination = r'<Pagination\s+currentPage=\{page\}\s+totalPages=\{totalPages\}\s+onPageChange=\{setPage\}\s+size="sm"\s+/>'
replacement_pagination = '<Pagination page={page} totalPages={totalPages} totalItems={filtered.length} perPage={perPage} onPageChange={setPage} />'
content = re.sub(pattern_pagination, replacement_pagination, content)

# Fix colSpan
content = content.replace('colSpan="8"', 'colSpan="9"')
content = content.replace('colSpan="7"', 'colSpan="9"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
