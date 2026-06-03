import os
import random
import json
import datetime
from typing import Optional
from PIL import Image, ImageDraw
from sqlalchemy.orm import Session
from backend import models

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
THUMBNAILS_DIR = os.path.join(STATIC_DIR, "thumbnails")

def compute_ndvi_and_classify(db: Session, sat_image: models.SatelliteImage, state_index: int) -> tuple[models.AnalysisResult, bool, float]:
    """
    Simulates applying a U-Net CNN to segment 5 classes:
    - Forest, Mine, Bare Land, Water, Urban
    Also calculates the Average NDVI and checks if changes exceed thresholds compared to baseline.
    """
    roi = sat_image.roi
    
    # State-based segmentation profiles (assuming total region is 16.0 km2)
    total_area_km2 = 16.0
    
    if state_index == 0:
        # Pristine state
        forest = 12.8  # 80%
        mine = 0.32    # 2%
        bare = 1.28    # 8%
        water = 1.28   # 8%
        urban = 0.32   # 2%
        avg_ndvi = 0.79
        change_detected = False
        change_area = 0.0
    elif state_index == 1:
        # Moderate illegal mining & deforestation
        forest = 11.2  # 70%
        mine = 1.44    # 9% (increased by 1.12 km2)
        bare = 1.76    # 11% (increased by 0.48 km2)
        water = 1.28   # 8%
        urban = 0.32   # 2%
        avg_ndvi = 0.69
        change_detected = True
        change_area = 1.12 + 0.48  # 1.6 km2 of forest cover loss
    else:
        # Severe mining expansion & clear-cutting
        forest = 9.28  # 58% (dropped by 3.52 km2 total from baseline)
        mine = 2.88    # 18% (increased by 2.56 km2)
        bare = 2.24    # 14%
        water = 1.28   # 8%
        urban = 0.32   # 2%
        avg_ndvi = 0.54
        change_detected = True
        change_area = 3.52  # 3.52 km2 of forest cover loss

    # Save Analysis Result to DB
    analysis_res = models.AnalysisResult(
        satellite_image_id=sat_image.id,
        average_ndvi=avg_ndvi,
        forest_area_km2=round(forest, 2),
        mine_area_km2=round(mine, 2),
        bare_land_area_km2=round(bare, 2),
        water_area_km2=round(water, 2),
        urban_area_km2=round(urban, 2),
        change_detected=change_detected,
        change_area_km2=round(change_area, 2)
    )
    
    db.add(analysis_res)
    db.commit()
    db.refresh(analysis_res)

    return analysis_res, change_detected, change_area

def generate_alert_thumbnail(image_path: str, state_index: int, alert_id: int) -> str:
    """
    Creates an alert thumbnail by overlaying a semi-transparent red border/crosshair
    on the change area of the satellite image, symbolizing an AI detection bounding box.
    """
    # Absolute paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    source_img_path = os.path.join(base_dir, image_path.lstrip("/"))
    
    if not os.path.exists(source_img_path):
        return image_path  # Fallback if image doesn't exist yet

    img = Image.open(source_img_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (256, 256, 256, 0))
    draw = ImageDraw.Draw(overlay)

    # Highlight box coordinates depending on the state
    if state_index == 1:
        # Mine pit area: center-right
        # Draw dotted red bounding box and text
        draw.rectangle([(120, 100), (185, 160)], outline=(220, 53, 69, 255), width=3)
        draw.rectangle([(120, 100), (185, 160)], fill=(220, 53, 69, 40))
    elif state_index == 2:
        # Expanded Mine & clearing area: center and left
        draw.rectangle([(100, 85), (210, 180)], outline=(220, 53, 69, 255), width=3)
        draw.rectangle([(100, 85), (210, 180)], fill=(220, 53, 69, 45))
        # Clear-cutting area
        draw.rectangle([(40, 100), (95, 155)], outline=(253, 126, 20, 255), width=2)
        draw.rectangle([(40, 100), (95, 155)], fill=(253, 126, 20, 40))

    # Composite the images
    composited = Image.alpha_composite(img, overlay).convert("RGB")
    
    filename = f"alert_overlay_{alert_id}.png"
    dest_path = os.path.join(THUMBNAILS_DIR, filename)
    composited.save(dest_path)
    
    return f"/static/thumbnails/{filename}"

def run_ai_analysis(db: Session, sat_image: models.SatelliteImage, state_index: int) -> Optional[models.Alert]:
    """
    Main orchestrator for AI analysis. Runs segmentation, and triggers alert
    if forest cover loss / mine expansion exceeds the threshold.
    """
    roi = sat_image.roi
    
    # Calculate NDVI and land cover proportions
    analysis_res, change_detected, change_area = compute_ndvi_and_classify(db, sat_image, state_index)
    
    # Check if threshold is breached
    if change_detected and change_area >= roi.alert_threshold_km2:
        # Parse GeoJSON to extract center coordinates for the alert marker
        # To make it robust and easy, we can parse center from geojson or generate points inside ROI
        lat, lon = 22.15, 85.35  # Standard defaults near Saranda Forest
        try:
            geojson_data = json.loads(roi.geojson)
            coords = geojson_data["geometry"]["coordinates"][0]
            # Average the coordinates to find centroid
            lat = sum(p[1] for p in coords) / len(coords)
            lon = sum(p[0] for p in coords) / len(coords)
            # Add small random offsets to simulate exact spot detection inside the polygon
            lat += random.uniform(-0.005, 0.005)
            lon += random.uniform(-0.005, 0.005)
        except Exception:
            pass

        # Determine activity and severity
        activity = "mine_expansion" if state_index == 1 else "deforestation"
        severity = "medium" if change_area < 2.0 else "high"
        confidence = round(random.uniform(0.84, 0.96), 2)

        alert = models.Alert(
            roi_id=roi.id,
            satellite_image_id=sat_image.id,
            activity_type=activity,
            severity=severity,
            confidence_score=confidence,
            gps_latitude=round(lat, 5),
            gps_longitude=round(lon, 5),
            status="pending",
            created_at=datetime.datetime.utcnow()
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        # Generate the thumbnail overlay
        thumbnail_url = generate_alert_thumbnail(sat_image.image_path, state_index, alert.id)
        alert.thumbnail_path = thumbnail_url
        
        db.commit()
        
        # Log to Audit Log
        system_user = db.query(models.User).filter(models.User.role == "admin").first()
        audit = models.AuditLog(
            alert_id=alert.id,
            user_id=system_user.id if system_user else 1,
            action="scan_triggered",
            details=f"System AI detected {activity.replace('_', ' ')} of {round(change_area, 2)} km2. Confidence: {int(confidence*100)}%."
        )
        db.add(audit)
        db.commit()
        
        return alert

    return None
