import json
import datetime
from backend.database import engine, SessionLocal, Base
from backend import models, auth, satellite_service, ai_engine

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # 1. Check if database is already seeded
    if db.query(models.User).first() is not None:
        print("Database already seeded.")
        db.close()
        return

    print("Seeding database with mock environmental monitoring data...")

    # 2. Create Users for all roles
    users = [
        models.User(
            username="admin",
            hashed_password=auth.get_password_hash("admin123"),
            full_name="Rajesh Sharma (Admin)",
            email="admin@monitoring.gov.in",
            role="admin",
            is_active=True
        ),
        models.User(
            username="analyst",
            hashed_password=auth.get_password_hash("analyst123"),
            full_name="Dr. Sunita Rao (Analyst)",
            email="s.rao@monitoring.gov.in",
            role="analyst",
            is_active=True
        ),
        models.User(
            username="officer",
            hashed_password=auth.get_password_hash("officer123"),
            full_name="Vikram Singh (Field Officer)",
            email="v.singh@forest.gov.in",
            role="officer",
            is_active=True
        ),
        models.User(
            username="authority",
            hashed_password=auth.get_password_hash("authority123"),
            full_name="Director Alok Kumar (Authority)",
            email="a.kumar@env-ministry.gov.in",
            role="authority",
            is_active=True
        )
    ]
    for u in users:
        db.add(u)
    db.commit()

    # Get user references for assignments
    analyst_user = db.query(models.User).filter(models.User.role == "analyst").first()
    admin_user = db.query(models.User).filter(models.User.role == "admin").first()

    # 3. Create Regions of Interest (ROIs) in India
    # ROI 1: Keonjhar Reserve, Odisha
    keonjhar_geojson = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [85.25000, 21.95000],
                [85.38000, 21.95000],
                [85.38000, 22.08000],
                [85.25000, 22.08000],
                [85.25000, 21.95000]
            ]]
        },
        "properties": {"name": "Keonjhar Reserve"}
    }
    
    # ROI 2: Saranda Forest, Jharkhand
    saranda_geojson = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [85.30000, 22.12000],
                [85.46000, 22.12000],
                [85.46000, 22.26000],
                [85.30000, 22.26000],
                [85.30000, 22.12000]
            ]]
        },
        "properties": {"name": "Saranda Forest"}
    }

    # ROI 3: Singrauli Coal Belt, MP
    singrauli_geojson = {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [82.52000, 24.12000],
                [82.68000, 24.12000],
                [82.68000, 24.26000],
                [82.52000, 24.26000],
                [82.52000, 24.12000]
            ]]
        },
        "properties": {"name": "Singrauli Coal Belt"}
    }

    rois = [
        models.ROI(
            name="Keonjhar Reserve (Odisha)",
            geojson=json.dumps(keonjhar_geojson),
            scan_frequency="daily",
            cloud_threshold=30.0,
            alert_threshold_km2=0.5,
            assigned_analyst_id=analyst_user.id
        ),
        models.ROI(
            name="Saranda Forest (Jharkhand)",
            geojson=json.dumps(saranda_geojson),
            scan_frequency="weekly",
            cloud_threshold=30.0,
            alert_threshold_km2=0.8,
            assigned_analyst_id=analyst_user.id
        ),
        models.ROI(
            name="Singrauli Coal Belt (MP)",
            geojson=json.dumps(singrauli_geojson),
            scan_frequency="custom",
            cloud_threshold=25.0,
            alert_threshold_km2=0.4,
            assigned_analyst_id=analyst_user.id
        )
    ]
    for r in rois:
        db.add(r)
    db.commit()

    # 4. Pre-populate scans, analyses, and alerts to establish history
    # Let's seed history for ROI 1 (Keonjhar)
    # Month 1 (Baseline - Healthy)
    r1 = db.query(models.ROI).filter(models.ROI.name.like("%Keonjhar%")).first()
    d1 = satellite_service.simulate_download(r1.id, r1.name, "Sentinel-2", 0)
    sat1 = models.SatelliteImage(
        roi_id=r1.id,
        satellite_source=d1["satellite_source"],
        timestamp=datetime.datetime.utcnow() - datetime.timedelta(days=30),
        cloud_cover=d1["cloud_cover"],
        image_path=d1["image_path"],
        raw_metadata=d1["raw_metadata"],
        is_processed=True
    )
    db.add(sat1)
    db.commit()
    db.refresh(sat1)
    ai_engine.run_ai_analysis(db, sat1, 0)

    # Month 2 (State 1 - Moderate Mine Expansion & Vegetation Loss Alert)
    d2 = satellite_service.simulate_download(r1.id, r1.name, "Sentinel-2", 1)
    # Force older timestamp
    sat2 = models.SatelliteImage(
        roi_id=r1.id,
        satellite_source=d2["satellite_source"],
        timestamp=datetime.datetime.utcnow() - datetime.timedelta(days=15),
        cloud_cover=d2["cloud_cover"],
        image_path=d2["image_path"],
        raw_metadata=d2["raw_metadata"],
        is_processed=True
    )
    db.add(sat2)
    db.commit()
    db.refresh(sat2)
    alert1 = ai_engine.run_ai_analysis(db, sat2, 1)

    # Resolve month 2 alert as "confirmed" for resume credibility
    if alert1:
        alert1.status = "confirmed"
        alert1.annotation = "Illegal expansion confirmed near coordinates. Dispatched officer Vikram Singh."
        db.commit()
        
        audit = models.AuditLog(
            alert_id=alert1.id,
            user_id=analyst_user.id,
            action="alert_confirmed",
            details="Alert status updated to 'confirmed' by Dr. Sunita Rao. Note: Illegal expansion confirmed."
        )
        db.add(audit)
        
        notification_log = models.AuditLog(
            alert_id=alert1.id,
            user_id=analyst_user.id,
            action="notification_sent",
            details=f"Escalation notification dispatched to Field Officer {users[2].full_name} via SMS and Email."
        )
        db.add(notification_log)
        db.commit()

    # Month 3 (State 2 - Severe Clear-cutting / Illegal Mine expansion)
    d3 = satellite_service.simulate_download(r1.id, r1.name, "Sentinel-2", 2)
    sat3 = models.SatelliteImage(
        roi_id=r1.id,
        satellite_source=d3["satellite_source"],
        timestamp=datetime.datetime.utcnow(),
        cloud_cover=d3["cloud_cover"],
        image_path=d3["image_path"],
        raw_metadata=d3["raw_metadata"],
        is_processed=True
    )
    db.add(sat3)
    db.commit()
    db.refresh(sat3)
    # Runs analysis, triggering an active Alert (State 2 - Severe)
    ai_engine.run_ai_analysis(db, sat3, 2)


    # Seed baseline for ROI 2 (Saranda Forest) - currently pristine
    r2 = db.query(models.ROI).filter(models.ROI.name.like("%Saranda%")).first()
    d4 = satellite_service.simulate_download(r2.id, r2.name, "Sentinel-2", 0)
    sat4 = models.SatelliteImage(
        roi_id=r2.id,
        satellite_source=d4["satellite_source"],
        timestamp=datetime.datetime.utcnow(),
        cloud_cover=d4["cloud_cover"],
        image_path=d4["image_path"],
        raw_metadata=d4["raw_metadata"],
        is_processed=True
    )
    db.add(sat4)
    db.commit()
    db.refresh(sat4)
    ai_engine.run_ai_analysis(db, sat4, 0)


    # Seed historical scans for ROI 3 (Singrauli Coal Belt)
    r3 = db.query(models.ROI).filter(models.ROI.name.like("%Singrauli%")).first()
    d5 = satellite_service.simulate_download(r3.id, r3.name, "Landsat-8", 0)
    sat5 = models.SatelliteImage(
        roi_id=r3.id,
        satellite_source=d5["satellite_source"],
        timestamp=datetime.datetime.utcnow() - datetime.timedelta(days=10),
        cloud_cover=d5["cloud_cover"],
        image_path=d5["image_path"],
        raw_metadata=d5["raw_metadata"],
        is_processed=True
    )
    db.add(sat5)
    db.commit()
    db.refresh(sat5)
    ai_engine.run_ai_analysis(db, sat5, 0)

    # Triggers a medium alert
    d6 = satellite_service.simulate_download(r3.id, r3.name, "Landsat-8", 1)
    sat6 = models.SatelliteImage(
        roi_id=r3.id,
        satellite_source=d6["satellite_source"],
        timestamp=datetime.datetime.utcnow(),
        cloud_cover=d6["cloud_cover"],
        image_path=d6["image_path"],
        raw_metadata=d6["raw_metadata"],
        is_processed=True
    )
    db.add(sat6)
    db.commit()
    db.refresh(sat6)
    ai_engine.run_ai_analysis(db, sat6, 1)

    print("Database seeding completed successfully!")
    db.close()

if __name__ == "__main__":
    seed_database()
