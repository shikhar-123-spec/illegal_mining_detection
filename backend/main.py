import os
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime
import json

from backend.database import engine, Base, get_db
from backend import models, schemas, auth, satellite_service, ai_engine

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Illegal Mining & Deforestation Detection System API",
    description="API for GIS environmental monitoring and AI analysis alert escalation.",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits local React app connecting from other port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static files directory exists and mount it
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/login", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")
    
    # Store token info
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": user.role}
    )
    
    # Log in audit log
    audit = models.AuditLog(
        user_id=user.id,
        action="user_login",
        details=f"User logged in successfully as role: {user.role}"
    )
    db.add(audit)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "full_name": user.full_name
    }

@app.post("/api/auth/register", response_model=schemas.UserResponse)
def register_user(
    user_in: schemas.UserCreate,
    current_user: models.User = Depends(auth.RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    db_user = db.query(models.User).filter(models.User.username == user_in.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    db_email = db.query(models.User).filter(models.User.email == user_in.email).first()
    if db_email:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_pwd = auth.get_password_hash(user_in.password)
    user = models.User(
        username=user_in.username,
        email=user_in.email,
        full_name=user_in.full_name,
        role=user_in.role,
        hashed_password=hashed_pwd,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@app.get("/api/auth/users", response_model=List[schemas.UserResponse])
def get_users(
    current_user: models.User = Depends(auth.RoleChecker(["admin", "analyst"])),
    db: Session = Depends(get_db)
):
    return db.query(models.User).filter(models.User.is_active == True).all()

# --- ROI (REGION OF INTEREST) ENDPOINTS ---

@app.get("/api/rois", response_model=List[schemas.ROIResponse])
def list_rois(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.ROI).all()

@app.post("/api/rois", response_model=schemas.ROIResponse)
def create_roi(
    roi_in: schemas.ROICreate,
    current_user: models.User = Depends(auth.RoleChecker(["admin"])),
    db: Session = Depends(get_db)
):
    db_roi = db.query(models.ROI).filter(models.ROI.name == roi_in.name).first()
    if db_roi:
        raise HTTPException(status_code=400, detail="ROI with this name already exists")
    
    # Verify coordinates structure is valid json
    try:
        json.loads(roi_in.geojson)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON geometry")

    roi = models.ROI(
        name=roi_in.name,
        geojson=roi_in.geojson,
        scan_frequency=roi_in.scan_frequency,
        cloud_threshold=roi_in.cloud_threshold,
        alert_threshold_km2=roi_in.alert_threshold_km2,
        assigned_analyst_id=roi_in.assigned_analyst_id
    )
    db.add(roi)
    db.commit()
    db.refresh(roi)
    
    # Log audit
    audit = models.AuditLog(
        user_id=current_user.id,
        action="roi_created",
        details=f"Created Region of Interest: '{roi.name}' (threshold {roi.alert_threshold_km2} km2)"
    )
    db.add(audit)
    db.commit()
    
    return roi

@app.get("/api/rois/{roi_id}/history", response_model=List[schemas.AnalysisResultResponse])
def get_roi_analysis_history(
    roi_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    roi = db.query(models.ROI).filter(models.ROI.id == roi_id).first()
    if not roi:
        raise HTTPException(status_code=404, detail="ROI not found")
        
    # Get all satellite images for this ROI and fetch their analysis results
    sat_image_ids = [img.id for img in roi.satellite_images]
    results = db.query(models.AnalysisResult).filter(
        models.AnalysisResult.satellite_image_id.in_(sat_image_ids)
    ).order_by(models.AnalysisResult.created_at.asc()).all()
    
    return results

@app.post("/api/rois/{roi_id}/scan")
def trigger_manual_roi_scan(
    roi_id: int,
    satellite_source: str = Query("Sentinel-2"),
    current_user: models.User = Depends(auth.RoleChecker(["admin", "analyst"])),
    db: Session = Depends(get_db)
):
    """
    Manually triggers satellite downloading and AI analysis.
    This generates progressive alerts (increments the state) to simulate real activity.
    """
    roi = db.query(models.ROI).filter(models.ROI.id == roi_id).first()
    if not roi:
        raise HTTPException(status_code=404, detail="ROI not found")

    # Determine state index based on existing scans
    # If 0 scans exist, this is state 0 (baseline). If 1 scan exists, it triggers state 1 (moderate change).
    # If 2+ scans exist, it triggers state 2 (severe change).
    existing_scans_count = len(roi.satellite_images)
    state_index = min(existing_scans_count, 2)

    # Simulate satellite image download
    downloaded = satellite_service.simulate_download(roi.id, roi.name, satellite_source, state_index)
    
    # Store satellite image in DB
    sat_img = models.SatelliteImage(
        roi_id=roi.id,
        satellite_source=downloaded["satellite_source"],
        timestamp=downloaded["timestamp"],
        cloud_cover=downloaded["cloud_cover"],
        image_path=downloaded["image_path"],
        raw_metadata=downloaded["raw_metadata"],
        is_processed=True
    )
    db.add(sat_img)
    db.commit()
    db.refresh(sat_img)

    # Handle Cloud Cover condition (FR-04)
    if sat_img.cloud_cover > roi.cloud_threshold:
        # Flag and skip AI analysis
        # Log audit
        audit = models.AuditLog(
            user_id=current_user.id,
            action="scan_triggered",
            details=f"Scan for '{roi.name}' skipped due to excessive cloud cover: {sat_img.cloud_cover}% (max allowed: {roi.cloud_threshold}%)."
        )
        db.add(audit)
        db.commit()
        return {
            "status": "skipped",
            "reason": "Excessive cloud cover",
            "cloud_cover": sat_img.cloud_cover,
            "threshold": roi.cloud_threshold,
            "image": sat_img
        }

    # Run AI Segmentation & Change Detection Engine
    alert_created = ai_engine.run_ai_analysis(db, sat_img, state_index)
    
    # Log trigger action
    audit = models.AuditLog(
        user_id=current_user.id,
        action="scan_triggered",
        details=f"Manually triggered image scan for '{roi.name}'. Analysis complete."
    )
    db.add(audit)
    db.commit()

    return {
        "status": "completed",
        "cloud_cover": sat_img.cloud_cover,
        "alert_generated": alert_created is not None,
        "alert": alert_created,
        "image": sat_img
    }

# --- ALERT MANAGEMENT ENDPOINTS ---

@app.get("/api/alerts", response_model=List[schemas.AlertResponse])
def get_alerts(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    activity_type: Optional[str] = Query(None),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.Alert)
    if status:
        query = query.filter(models.Alert.status == status)
    if severity:
        query = query.filter(models.Alert.severity == severity)
    if activity_type:
        query = query.filter(models.Alert.activity_type == activity_type)
        
    return query.order_by(models.Alert.created_at.desc()).all()

@app.post("/api/alerts/{alert_id}/review", response_model=schemas.AlertResponse)
def review_alert(
    alert_id: int,
    review: schemas.AlertReview,
    current_user: models.User = Depends(auth.RoleChecker(["analyst", "admin"])),
    db: Session = Depends(get_db)
):
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    alert.status = review.status
    alert.annotation = review.annotation
    db.commit()
    db.refresh(alert)
    
    # Create audit log detailing status transition
    audit_msg = f"Alert status updated to '{review.status}' by {current_user.full_name}."
    if review.annotation:
        audit_msg += f" Note: {review.annotation}"
        
    audit = models.AuditLog(
        alert_id=alert.id,
        user_id=current_user.id,
        action=f"alert_{review.status}",
        details=audit_msg
    )
    db.add(audit)
    db.commit()

    # Simulate Notification dispatch (FR-11)
    if review.status == "confirmed":
        # Dispatch mock notifications
        officer = db.query(models.User).filter(models.User.role == "field_officer").first()
        officer_name = officer.full_name if officer else "Field Dispatch"
        notification_log = models.AuditLog(
            alert_id=alert.id,
            user_id=current_user.id,
            action="notification_sent",
            details=f"Escalation notification dispatched to Field Officer {officer_name} via SMS and Email. Coordinates: {alert.gps_latitude}, {alert.gps_longitude}."
        )
        db.add(notification_log)
        db.commit()
        
    return alert

@app.get("/api/alerts/{alert_id}/audit-logs", response_model=List[schemas.AuditLogResponse])
def get_alert_audit_logs(
    alert_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.AuditLog).filter(models.AuditLog.alert_id == alert_id).order_by(models.AuditLog.timestamp.desc()).all()

# --- DASHBOARD & GENERAL ENDPOINTS ---

@app.get("/api/dashboard/stats", response_model=schemas.DashboardStats)
def get_dashboard_statistics(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    total_rois = db.query(models.ROI).count()
    active_alerts = db.query(models.Alert).filter(models.Alert.status == "pending").count()
    
    # Calculate deforested and mining areas from latest analysis results across all satellite images
    total_forest_loss = 0.0
    total_mine_expansion = 0.0
    
    rois = db.query(models.ROI).all()
    for roi in rois:
        if roi.satellite_images:
            # Sort to find latest processed image
            latest_img = sorted(roi.satellite_images, key=lambda x: x.timestamp, reverse=True)[0]
            if latest_img.analysis_results:
                analysis = latest_img.analysis_results[0]
                # Calculate change compared to state 0 baseline
                # Baseline mine size is 0.32, baseline forest is 12.8
                forest_loss = max(0.0, 12.8 - analysis.forest_area_km2)
                mine_gain = max(0.0, analysis.mine_area_km2 - 0.32)
                
                total_forest_loss += forest_loss
                total_mine_expansion += mine_gain
                
    recent_alerts = db.query(models.Alert).order_by(models.Alert.created_at.desc()).limit(4).all()
    
    return {
        "total_monitored_regions": total_rois,
        "active_alerts": active_alerts,
        "total_deforested_km2": round(total_forest_loss, 2),
        "total_mining_km2": round(total_mine_expansion, 2),
        "scan_efficiency": 97.4,  # Simulated system efficiency metric
        "recent_alerts": recent_alerts
    }

# Mock PDF and Excel Export Metadata endpoint (FR-15)
@app.get("/api/reports/download")
def download_system_report(
    region_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: models.User = Depends(auth.RoleChecker(["admin", "analyst", "authority"])),
    db: Session = Depends(get_db)
):
    # Logs the download event
    audit = models.AuditLog(
        user_id=current_user.id,
        action="report_generated",
        details=f"Exported system surveillance report for ROI ID: {region_id or 'All Regions'}. Date range: {start_date or 'Any'} to {end_date or 'Any'}."
    )
    db.add(audit)
    db.commit()
    
    # Collects the data to build beautiful client-side PDF/CSV downloads
    query = db.query(models.Alert)
    if region_id:
        query = query.filter(models.Alert.roi_id == region_id)
        
    alerts = query.all()
    
    report_data = []
    for a in alerts:
        report_data.append({
            "id": a.id,
            "region": a.roi.name,
            "type": a.activity_type.replace("_", " ").title(),
            "severity": a.severity.upper(),
            "confidence": f"{int(a.confidence_score * 100)}%",
            "coordinates": f"{a.gps_latitude}, {a.gps_longitude}",
            "status": a.status.upper(),
            "date": a.created_at.strftime("%Y-%m-%d %H:%M")
        })
        
    return {
        "generated_by": current_user.full_name,
        "role": current_user.role,
        "timestamp": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "records_count": len(report_data),
        "data": report_data
    }
