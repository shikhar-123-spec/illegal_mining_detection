import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";

export default function MapComponent({ rois, alerts, onSelectROI, onSelectAlert, isDrawing, onDrawingComplete }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({
    polygons: {},
    markers: {}
  });

  const [drawPoints, setDrawPoints] = useState([]);
  const drawPolylineRef = useRef(null);

  // Initialize Leaflet Map
  useEffect(() => {
    // Inject Leaflet CSS dynamically if not present
    if (!document.getElementById("leaflet-css-link")) {
      const link = document.createElement("link");
      link.id = "leaflet-css-link";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    if (!mapRef.current) {
      // Coordinates of Central India for default focus
      const map = L.map(mapContainerRef.current, {
        zoomControl: false
      }).setView([22.5, 84.5], 6);

      // CartoDB Dark Matter tile layer for premium dark GIS aesthetic
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/attributions">CartoDB</a> contributors',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      // Add Zoom controls at the bottom right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapRef.current = map;
    }

    return () => {
      // Clean up map on component unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Handle click events for ROI Drawing Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e) => {
      if (!isDrawing) return;

      const newPoint = [e.latlng.lat, e.latlng.lng];
      const updatedPoints = [...drawPoints, newPoint];
      setDrawPoints(updatedPoints);

      // Draw polyline feedback
      if (drawPolylineRef.current) {
        map.removeLayer(drawPolylineRef.current);
      }
      
      // If we have points, draw the line connecting them
      if (updatedPoints.length > 1) {
        drawPolylineRef.current = L.polyline(updatedPoints, { color: "#10b981", weight: 3, dashArray: "5, 5" }).addTo(map);
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [isDrawing, drawPoints]);

  // Reset drawing variables when toggled off/on
  useEffect(() => {
    if (!isDrawing) {
      const map = mapRef.current;
      if (map && drawPolylineRef.current) {
        map.removeLayer(drawPolylineRef.current);
        drawPolylineRef.current = null;
      }
      setDrawPoints([]);
    }
  }, [isDrawing]);

  const handleFinishDrawing = () => {
    if (drawPoints.length < 3) {
      alert("Please click at least 3 points on the map to define a closed polygon.");
      return;
    }
    
    // Close the polygon by appending the first point at the end
    const closedCoordinates = [...drawPoints, drawPoints[0]];
    
    // Format coordinates as GeoJSON longitude/latitude format
    const geoJsonCoords = closedCoordinates.map(p => [p[1], p[0]]);

    const newROI = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [geoJsonCoords]
      },
      properties: {}
    };

    onDrawingComplete(newROI);
    setDrawPoints([]);
    if (mapRef.current && drawPolylineRef.current) {
      mapRef.current.removeLayer(drawPolylineRef.current);
      drawPolylineRef.current = null;
    }
  };

  // Render/Update ROIs and Alerts layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old layers
    Object.values(layersRef.current.polygons).forEach(layer => map.removeLayer(layer));
    Object.values(layersRef.current.markers).forEach(layer => map.removeLayer(layer));
    layersRef.current.polygons = {};
    layersRef.current.markers = {};

    // 1. Draw ROI boundaries
    rois.forEach((roi) => {
      try {
        const geojson = JSON.parse(roi.geojson);
        
        // Find if this ROI has active alerts
        const hasActiveAlert = alerts.some(a => a.roi_id === roi.id && a.status === "pending");
        const hasConfirmedAlert = alerts.some(a => a.roi_id === roi.id && a.status === "confirmed");

        // Styling based on threat status
        let fillColor = "#10b981"; // Healthy Green
        let color = "#059669";
        
        if (hasConfirmedAlert) {
          fillColor = "#ef4444"; // Red
          color = "#dc2626";
        } else if (hasActiveAlert) {
          fillColor = "#f59e0b"; // Orange (Pending escalation)
          color = "#d97706";
        }

        const leafletGeoJSON = L.geoJSON(geojson, {
          style: {
            fillColor: fillColor,
            fillOpacity: 0.18,
            color: color,
            weight: 2.5,
            opacity: 0.8
          }
        }).addTo(map);

        // Bind quick details popup
        leafletGeoJSON.bindTooltip(`
          <div style="color: #fff; padding: 4px; border-radius: 4px; font-family: sans-serif; font-size: 0.8rem;">
            <strong>${roi.name}</strong><br/>
            Surveillance: ${roi.scan_frequency.toUpperCase()}<br/>
            Threshold: ${roi.alert_threshold_km2} km²
          </div>
        `, { sticky: true, className: "glass-map-tooltip" });

        leafletGeoJSON.on("click", () => {
          onSelectROI(roi);
        });

        layersRef.current.polygons[roi.id] = leafletGeoJSON;

      } catch (err) {
        console.error("Error parsing ROI GeoJSON:", err);
      }
    });

    // 2. Draw active Alert markers
    alerts.forEach((alert) => {
      // Glow indicator depending on status
      const isConfirmed = alert.status === "confirmed";
      const isDismissed = alert.status === "dismissed";
      if (isDismissed) return; // Hide dismissed alerts from direct map threat view

      const color = isConfirmed ? "#ef4444" : "#f59e0b";
      
      const glowMarker = L.circleMarker([alert.gps_latitude, alert.gps_longitude], {
        radius: 8,
        fillColor: color,
        fillOpacity: 0.7,
        color: color,
        weight: 12,
        opacity: 0.25,
        className: "pulsing-alert-marker"
      }).addTo(map);

      glowMarker.bindTooltip(`
        <div style="font-family: sans-serif; font-size: 0.8rem; padding: 4px;">
          <strong style="color: ${color}; text-transform: uppercase;">⚠️ ${alert.activity_type.replace("_", " ")}</strong><br/>
          Confidence: ${intConfidence(alert.confidence_score)}%<br/>
          GPS: ${alert.gps_latitude}, ${alert.gps_longitude}
        </div>
      `, { sticky: true });

      glowMarker.on("click", () => {
        onSelectAlert(alert);
      });

      layersRef.current.markers[alert.id] = glowMarker;
    });

  }, [rois, alerts, isDrawing]);

  // Helper
  const intConfidence = (val) => Math.round(val * 100);

  return (
    <div className="gis-map-panel glass-panel" style={{ height: "100%", width: "100%", position: "relative" }}>
      <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }}></div>
      
      {isDrawing && (
        <div style={{
          position: "absolute",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          background: "rgba(11, 12, 16, 0.95)",
          border: "1px solid var(--color-success)",
          borderRadius: "8px",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
        }}>
          <div style={{ fontSize: "0.85rem", color: "#fff" }}>
            <strong>Drawing Mode:</strong> Click on the map to place vertices ({drawPoints.length} added).
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleFinishDrawing}
              style={{
                background: "var(--color-success)",
                border: "none",
                color: "#fff",
                fontSize: "0.75rem",
                fontWeight: "bold",
                padding: "6px 12px",
                borderRadius: "4px",
                cursor: "pointer"
              }}
            >
              Complete Polygon
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
