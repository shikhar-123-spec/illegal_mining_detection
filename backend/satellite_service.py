import os
import random
import datetime
from PIL import Image, ImageDraw

# Create static directories for serving mock tiles and thumbnails
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
TILES_DIR = os.path.join(STATIC_DIR, "tiles")
THUMBNAILS_DIR = os.path.join(STATIC_DIR, "thumbnails")

os.makedirs(TILES_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

def generate_satellite_tile(roi_id: int, roi_name: str, state_index: int) -> str:
    """
    Generates a high-quality 256x256 PNG image simulating a satellite tile.
    State 0: Lush, pristine forest.
    State 1: Moderate mining activity / minor forest loss.
    State 2: Heavily expanded mining pit with significant deforestation.
    """
    img = Image.new("RGB", (256, 256), color="#1b4332")  # Deep forest green
    draw = ImageDraw.Draw(img)

    # Draw a winding blue river running through the region (common landmark)
    river_points = [(0, 40), (60, 60), (120, 50), (180, 80), (256, 70)]
    # Draw thicker line
    for i in range(len(river_points) - 1):
        draw.line([river_points[i], river_points[i+1]], fill="#0077b6", width=8)

    # Draw some bare land / natural sands along the river
    draw.polygon([(40, 65), (70, 70), (50, 80)], fill="#d4a373")
    draw.polygon([(160, 82), (190, 90), (175, 100)], fill="#d4a373")

    # Draw a small village or road (urban/bare land elements)
    draw.line([(0, 200), (80, 190), (150, 220), (256, 210)], fill="#6c757d", width=4)
    # Village houses (tiny red squares)
    draw.rectangle([(80, 185), (90, 195)], fill="#b7094c")
    draw.rectangle([(110, 200), (120, 210)], fill="#b7094c")

    # Now, depending on the "state_index", we superimpose an expanding mine pit!
    # State 0: Pristine. Just minor legal quarry or bare land
    if state_index == 0:
        # Small legal sand pit
        draw.ellipse([(140, 120), (160, 140)], fill="#a68a64", outline="#7f5539")
    
    # State 1: Expanding Mine (Alert 1)
    elif state_index == 1:
        # Pit expands and shows active grey/brown excavation marks
        draw.ellipse([(130, 110), (175, 150)], fill="#9c6644", outline="#7f5539")
        # Excavation core
        draw.ellipse([(140, 120), (165, 140)], fill="#6f4e37")
        # Truck roads (dirt paths leading to mine)
        draw.line([(150, 130), (200, 205)], fill="#7f5539", width=2)
    
    # State 2: Massive Illegal Excavation (Alert 2)
    else:
        # Pit expands drastically, devouring forest
        draw.ellipse([(110, 95), (195, 165)], fill="#9c6644", outline="#7f5539")
        draw.ellipse([(125, 105), (180, 150)], fill="#7f5539")
        draw.ellipse([(135, 115), (165, 135)], fill="#4e3629") # deep excavation pit
        
        # Secondary illegal clearing (Deforestation patch)
        draw.polygon([(60, 110), (95, 115), (85, 145), (50, 130)], fill="#7f5539")
        
        # Roads connecting everything
        draw.line([(150, 130), (200, 205)], fill="#7f5539", width=3)
        draw.line([(80, 125), (135, 125)], fill="#7f5539", width=2)

    # Save to disk
    filename = f"tile_roi_{roi_id}_state_{state_index}_{int(datetime.datetime.utcnow().timestamp())}.png"
    filepath = os.path.join(TILES_DIR, filename)
    img.save(filepath)

    return f"/static/tiles/{filename}"

def simulate_download(roi_id: int, roi_name: str, satellite_source: str, state_index: int = 0) -> dict:
    """
    Simulates downloading satellite imagery from Sentinel-2 or Landsat-8.
    Generates a corresponding visual PNG.
    """
    cloud_cover = round(random.uniform(2.0, 28.0), 2)  # Generates under threshold (30%)
    
    # Randomly make some scans cloudy (to test NFR/FR cloud cover handling!)
    if random.random() < 0.15:
        cloud_cover = round(random.uniform(32.0, 75.0), 2)

    image_url = generate_satellite_tile(roi_id, roi_name, state_index)
    
    return {
        "satellite_source": satellite_source,
        "timestamp": datetime.datetime.utcnow() - datetime.timedelta(days=state_index * 10),
        "cloud_cover": cloud_cover,
        "image_path": image_url,
        "raw_metadata": f'{{"satellite": "{satellite_source}", "resolution": "10m", "orbit": "descending", "cloud_cover": {cloud_cover}}}'
    }
