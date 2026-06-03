import React, { useState, useEffect } from "react";
import { Plus, Sliders, Map, RefreshCw, UploadCloud, Users } from "lucide-react";

export default function ConfigPanel({ rois, onAddROI, currentUser, onStartDrawing, drawnGeoJSON }) {
  const [name, setName] = useState("");
  const [geojson, setGeojson] = useState("");
  const [scanFrequency, setScanFrequency] = useState("weekly");
  const [cloudThreshold, setCloudThreshold] = useState(30.0);
  const [alertThreshold, setAlertThreshold] = useState(0.5);
  const [assignedAnalystId, setAssignedAnalystId] = useState("");
  
  const [analysts, setAnalysts] = useState([]);
  const [loadingAnalysts, setLoadingAnalysts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Sync drawn geojson from Leaflet map into the form input
  useEffect(() => {
    if (drawnGeoJSON) {
      setGeojson(JSON.stringify(drawnGeoJSON, null, 2));
      alert("Custom polygon coordinates successfully loaded into the GeoJSON field!");
    }
  }, [drawnGeoJSON]);

  // Fetch analysts on load
  useEffect(() => {
    fetchAnalysts();
  }, []);

  const fetchAnalysts = async () => {
    setLoadingAnalysts(true);
    try {
      const response = await fetch("http://localhost:8000/api/auth/users", {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const filtered = data.filter(u => u.role === "analyst");
        setAnalysts(filtered);
        if (filtered.length > 0) {
          setAssignedAnalystId(filtered[0].id.toString());
        }
      }
    } catch (err) {
      console.error("Error fetching analyst list:", err);
    } finally {
      setLoadingAnalysts(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !geojson) {
      alert("Please provide an ROI Name and boundary coordinates.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("http://localhost:8000/api/rois", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: name,
          geojson: geojson,
          scan_frequency: scanFrequency,
          cloud_threshold: parseFloat(cloudThreshold),
          alert_threshold_km2: parseFloat(alertThreshold),
          assigned_analyst_id: assignedAnalystId ? parseInt(assignedAnalystId) : null
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to register ROI.");
      }

      const created = await response.json();
      onAddROI(created);
      
      // Reset Form
      setName("");
      setGeojson("");
      setScanFrequency("weekly");
      setCloudThreshold(30.0);
      setAlertThreshold(0.5);
      
      alert(`Region of Interest '${created.name}' registered successfully and surveillance scan scheduler started!`);
    } catch (err) {
      alert(err.message || "Failed to register ROI boundary.");
    } finally {
      setSubmitting(false);
    }
  };

  // Fulfills FR-17 Role-based restrictions check
  if (currentUser.role !== "admin") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", gap: "12px", textAlign: "center" }}>
        <Sliders size={48} style={{ color: "var(--text-muted)" }} />
        <h4 style={{ color: "var(--text-secondary)" }}>Access Restricted</h4>
        <p style={{ fontSize: "0.85rem", maxWidth: "340px" }}>
          Region and scheduling configuration parameters can only be adjusted by authorized **Administrator** accounts.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", gap: "24px", height: "100%", overflowY: "auto" }}>
      {/* Existing Monitored Regions (ROIs) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: "800" }}>Active Monitored Regions</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.80rem", marginTop: "4px" }}>
            SURVEILLANCE AND PARAMETER SETTINGS BY REGION
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {rois.map((roi) => (
            <div key={roi.id} className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifySelf: "start", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <span style={{ fontWeight: "700", fontSize: "0.95rem" }}>{roi.name}</span>
                <span style={{ fontSize: "0.75rem", background: "rgba(6, 182, 212, 0.1)", color: "var(--color-info)", padding: "3px 8px", borderRadius: "12px", fontWeight: "700" }}>
                  {roi.scan_frequency.toUpperCase()} SCAN
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", borderTop: "1px solid var(--border-glass)", paddingTop: "12px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                <div>
                  <strong>Max Cloud:</strong> {roi.cloud_threshold}%
                </div>
                <div>
                  <strong>Alert Threshold:</strong> {roi.alert_threshold_km2} km²
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <Users size={12} />
                  <strong>Analyst:</strong> {roi.assigned_analyst?.full_name.split(" ")[0] || "None"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Define a New ROI Form */}
      <div className="glass-panel" style={{ padding: "24px", height: "fit-content", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
            <Plus size={18} style={{ color: "var(--color-success)" }} /> Register Monitored Boundary
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "4px" }}>
            Add new Regions of Interest via Leaflet polygon drawing or direct GeoJSON inputs.
          </p>
        </div>

        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div className="form-group">
            <label className="form-label">Region Name</label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Keonjhar Reserve Sector-D"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>GeoJSON Boundary coordinates</span>
              <button
                type="button"
                onClick={onStartDrawing}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-success)",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <Map size={12} /> Draw Polygon
              </button>
            </label>
            <textarea
              className="form-input"
              value={geojson}
              onChange={(e) => setGeojson(e.target.value)}
              placeholder='Paste GeoJSON Polygon coordinates, e.g. {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[lon, lat], ...]]}}'
              rows={4}
              style={{ resize: "none", fontFamily: "monospace", fontSize: "0.75rem" }}
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="form-group">
              <label className="form-label">Scan Frequency</label>
              <select
                className="form-input"
                value={scanFrequency}
                onChange={(e) => setScanFrequency(e.target.value)}
                style={{ cursor: "pointer" }}
              >
                <option value="daily">Daily scan</option>
                <option value="weekly">Weekly scan</option>
                <option value="custom">Custom interval</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Analyst</label>
              <select
                className="form-input"
                value={assignedAnalystId}
                onChange={(e) => setAssignedAnalystId(e.target.value)}
                style={{ cursor: "pointer" }}
              >
                {loadingAnalysts ? (
                  <option>Loading analysts...</option>
                ) : (
                  analysts.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="form-group">
              <label className="form-label">Max Cloud Cover (%)</label>
              <input
                type="number"
                step="1"
                className="form-input"
                value={cloudThreshold}
                onChange={(e) => setCloudThreshold(e.target.value)}
                min="0"
                max="100"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Alert Trigger (km²)</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                min="0.1"
              />
            </div>
          </div>

          <button type="submit" className="btn-login" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginTop: "10px" }} disabled={submitting}>
            <UploadCloud size={16} /> {submitting ? "Saving ROI..." : "Save Surveillance Region"}
          </button>
        </form>
      </div>
    </div>
  );
}
