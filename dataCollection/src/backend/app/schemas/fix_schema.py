import re

path = r'c:\Users\ranim\Downloads\gitlab-kpi-dashboard-versionaprescorrection - Copie - Copie (2)\dataCollection\src\backend\app\schemas\extraction_lot.py'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Insert PeriodSummary and ProjectSummary after UserSummary block
new_classes = '''

class PeriodSummary(BaseModel):
    """Résumé minimal d'une période pour les lots d'extraction."""
    id:    int
    year:  int
    month: int

    model_config = {"from_attributes": True}


class ProjectSummary(BaseModel):
    """Résumé minimal d'un projet pour les lots d'extraction."""
    id:   int
    name: Optional[str] = None

    model_config = {"from_attributes": True}
'''

# Insert before ExtractionLotCreate
content = content.replace(
    '\nclass ExtractionLotCreate(BaseModel):',
    new_classes + '\nclass ExtractionLotCreate(BaseModel):'
)

print("Inserted" if "PeriodSummary" in content else "NOT inserted")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
