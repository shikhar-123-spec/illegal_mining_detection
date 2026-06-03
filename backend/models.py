from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
import datetime
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, nullable=False)  # admin, analyst, field_officer, authority
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    assigned_rois = relationship("ROI", back_populates="assigned_analyst")
    audit_logs = relationship("AuditLog", back_populates="user")


class ROI(Base):
    __tablename__ = "regions_of_interest"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    geojson = Column(Text, nullable=False)  # Stores coordinates/polygon geometry as GeoJSON string
    scan_frequency = Column(String, default="weekly")  # daily, weekly, custom
    cloud_threshold = Column(Float, default=30.0)      # Max allowed cloud cover percentage
    alert_threshold_km2 = Column(Float, default=0.5)   # Trigger alert if changes exceed this (in km2)
    assigned_analyst_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    assigned_analyst = relationship("User", back_populates="assigned_rois")
    satellite_images = relationship("SatelliteImage", back_populates="roi", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="roi", cascade="all, delete-orphan")


class SatelliteImage(Base):
    __tablename__ = "satellite_images"

    id = Column(Integer, primary_key=True, index=True)
    roi_id = Column(Integer, ForeignKey("regions_of_interest.id"), nullable=False)
    satellite_source = Column(String, nullable=False)  # Sentinel-2, Landsat-8
    timestamp = Column(DateTime, nullable=False)
    cloud_cover = Column(Float, nullable=False)
    image_path = Column(String, nullable=False)        # Local path to simulated visual tile
    raw_metadata = Column(Text, nullable=True)          # JSON string metadata
    is_processed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    roi = relationship("ROI", back_populates="satellite_images")
    analysis_results = relationship("AnalysisResult", back_populates="satellite_image", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="satellite_image", cascade="all, delete-orphan")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    satellite_image_id = Column(Integer, ForeignKey("satellite_images.id"), nullable=False)
    average_ndvi = Column(Float, nullable=False)
    forest_area_km2 = Column(Float, nullable=False)
    mine_area_km2 = Column(Float, nullable=False)
    bare_land_area_km2 = Column(Float, nullable=False)
    water_area_km2 = Column(Float, nullable=False)
    urban_area_km2 = Column(Float, nullable=False)
    change_detected = Column(Boolean, default=False)
    change_area_km2 = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    satellite_image = relationship("SatelliteImage", back_populates="analysis_results")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    roi_id = Column(Integer, ForeignKey("regions_of_interest.id"), nullable=False)
    satellite_image_id = Column(Integer, ForeignKey("satellite_images.id"), nullable=False)
    activity_type = Column(String, nullable=False)       # deforestation, mine_expansion
    severity = Column(String, default="medium")          # low, medium, high
    confidence_score = Column(Float, nullable=False)     # 0.0 to 1.0
    gps_latitude = Column(Float, nullable=False)
    gps_longitude = Column(Float, nullable=False)
    thumbnail_path = Column(String, nullable=True)
    status = Column(String, default="pending")           # pending, confirmed, dismissed
    annotation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    roi = relationship("ROI", back_populates="alerts")
    satellite_image = relationship("SatelliteImage", back_populates="alerts")
    audit_logs = relationship("AuditLog", back_populates="alert", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)              # user_login, alert_confirmed, alert_dismissed, roi_created, scan_triggered
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    alert = relationship("Alert", back_populates="audit_logs")
    user = relationship("User", back_populates="audit_logs")
