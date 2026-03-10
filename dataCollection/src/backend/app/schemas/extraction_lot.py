from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum

class ExtractionType(str, Enum):
    REALTIME = "REALTIME"
    MONTHLY  = "MONTHLY"

class ExtractionLotCreate(BaseModel):
    project_id:      int
    period_id:       Optional[int] = None
    extraction_type: ExtractionType

class ExtractionLotResponse(BaseModel):
    id:             int
    type:           str
    status:         str
    project_id:     int
    period_id:      int
    triggered_by:   Optional[int]
    generated_file: Optional[str]
    md5sum:         Optional[str]
    error_message:  Optional[str] = None   # ✅ AJOUT
    created_at:     datetime
    completed_at:   Optional[datetime] = None

    class Config:
        from_attributes = True

class ExtractionRunResponse(BaseModel):
    message:        str
    lot_id:         int
    type:           str
    project_id:     int
    period_id:      int
    generated_file: Optional[str]
    md5sum:         Optional[str]
    error_message:  Optional[str] = None   # ✅ AJOUT