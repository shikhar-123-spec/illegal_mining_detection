import os
import sys
import unittest
from sqlalchemy.orm import Session

# Add current directory to python path for proper imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import engine, SessionLocal, Base
from backend import models, auth, seed, satellite_service, ai_engine

class TestSurveillancePipeline(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Initialize SQLite tables
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()
        
    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_01_user_seeding_and_auth(self):
        """Test database seeding and core password hashing/verification"""
        # Run seed
        seed.seed_database()
        
        # Verify users exist
        admin = self.db.query(models.User).filter(models.User.username == "admin").first()
        self.assertIsNotNone(admin)
        self.assertEqual(admin.role, "admin")
        
        # Verify passwords verify correctly
        self.assertTrue(auth.verify_password("admin123", admin.hashed_password))
        self.assertFalse(auth.verify_password("wrong_password", admin.hashed_password))
        
        # Verify analyst exists
        analyst = self.db.query(models.User).filter(models.User.username == "analyst").first()
        self.assertIsNotNone(analyst)
        self.assertEqual(analyst.role, "analyst")

    def test_02_roi_retrieval(self):
        """Test that geographical Regions of Interest are stored correctly"""
        rois = self.db.query(models.ROI).all()
        self.assertGreaterEqual(len(rois), 3)
        
        # Verify Keonjhar exists
        keonjhar = self.db.query(models.ROI).filter(models.ROI.name.like("%Keonjhar%")).first()
        self.assertIsNotNone(keonjhar)
        self.assertEqual(keonjhar.scan_frequency, "daily")
        self.assertEqual(keonjhar.alert_threshold_km2, 0.5)

    def test_03_satellite_and_ai_pipeline(self):
        """Test manual satellite download tasking and U-Net NDVI calculations"""
        roi = self.db.query(models.ROI).filter(models.ROI.name.like("%Saranda%")).first()
        self.assertIsNotNone(roi)
        
        # Saranda should currently only have state 0 (baseline scan)
        initial_scans = len(roi.satellite_images)
        self.assertEqual(initial_scans, 1)

        # Trigger progressive scan state 1 (Moderate change expansion)
        state_index = 1
        downloaded = satellite_service.simulate_download(roi.id, roi.name, "Sentinel-2", state_index)
        
        sat_img = models.SatelliteImage(
            roi_id=roi.id,
            satellite_source=downloaded["satellite_source"],
            timestamp=downloaded["timestamp"],
            cloud_cover=downloaded["cloud_cover"],
            image_path=downloaded["image_path"],
            raw_metadata=downloaded["raw_metadata"],
            is_processed=True
        )
        self.db.add(sat_img)
        self.db.commit()
        self.db.refresh(sat_img)

        # Verify image was stored in database
        self.assertIsNotNone(sat_img.id)
        self.assertTrue(os.path.exists(os.path.join(os.path.dirname(__file__), sat_img.image_path.lstrip("/"))))

        # Run AI analysis (should exceed threshold 0.8 km² and trigger alert)
        alert = ai_engine.run_ai_analysis(self.db, sat_img, state_index)
        self.assertIsNotNone(alert)
        self.assertEqual(alert.activity_type, "mine_expansion")
        self.assertEqual(alert.status, "pending")
        self.assertIsNotNone(alert.thumbnail_path)
        
        # Verify thumbnail image with red AI bounding box was generated
        self.assertTrue(os.path.exists(os.path.join(os.path.dirname(__file__), alert.thumbnail_path.lstrip("/"))))

        # Verify audit log was appended
        audit = self.db.query(models.AuditLog).filter(models.AuditLog.alert_id == alert.id).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.action, "scan_triggered")

if __name__ == "__main__":
    unittest.main()
