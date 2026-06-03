from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# --- Token & Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str
    full_name: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

# --- User Schemas ---
class UserBase(BaseModel):
    username: str
    full_name: str
    email: EmailStr
    role: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True

# --- ROI (Region of Interest) Schemas ---
class ROIBase(BaseModel):
    name: str
    geojson: str
    scan_frequency: str
    cloud_threshold: float
    alert_threshold_km2: float
    assigned_analyst_id: Optional[int] = None

class ROICreate(ROIBase):
    pass

class ROIResponse(ROIBase):
    id: int
    created_at: datetime
    assigned_analyst: Optional[UserResponse] = None

    class Config:
        orm_mode = True

# --- Satellite Image Schemas ---
class SatelliteImageBase(BaseModel):
    roi_id: int
    satellite_source: str
    timestamp: datetime
    cloud_cover: float
    image_path: str
    raw_metadata: Optional[str] = None
    is_processed: bool

class SatelliteImageResponse(SatelliteImageBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True

# --- Analysis Result Schemas ---
class AnalysisResultResponse(BaseModel):
    id: int
    satellite_image_id: int
    average_ndvi: float
    forest_area_km2: float
    mine_area_km2: float
    bare_land_area_km2: float
    water_area_km2: float
    urban_area_km2: float
    change_detected: bool
    change_area_km2: float
    created_at: datetime

    class Config:
        orm_mode = True

# --- Alert Schemas ---
class AlertBase(BaseModel):
    roi_id: int
    satellite_image_id: int
    activity_type: str
    severity: str
    confidence_score: float
    gps_latitude: float
    gps_longitude: float
    thumbnail_path: Optional[str] = None
    status: str
    annotation: Optional[str] = None

class AlertReview(BaseModel):
    status: str  # confirmed, dismissed
    annotation: Optional[str] = None

class AlertResponse(AlertBase):
    id: int
    created_at: datetime
    roi: ROIResponse

    class Config:
        orm_mode = True

# --- Audit Log Schemas ---
class AuditLogResponse(BaseModel):
    id: int
    alert_id: Optional[int] = None
    user_id: int
    action: str
    details: Optional[str] = None
    timestamp: datetime
    user: Optional[UserResponse] = None

    class Config:
        orm_mode = True

# --- Dashboard Overview Schemas ---
class DashboardStats(BaseModel):
    total_monitored_regions: int
    active_alerts: int
    total_deforested_km2: float
    total_mining_km2: float
    scan_efficiency: float
    recent_alerts: List[AlertResponse]
