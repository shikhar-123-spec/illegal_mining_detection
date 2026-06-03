import React, { useState, useEffect } from "react";
import { Shield, Map, BarChart2, Sliders, FileText, RefreshCw, LogOut, Radio, AlertTriangle } from "lucide-react";
import Login from "./components/Login";
import MapComponent from "./components/MapComponent";
import AlertPanel from "./components/AlertPanel";
import AnalyticsPanel from "./components/AnalyticsPanel";
import ConfigPanel from "./components/ConfigPanel";
import { exportToCSV, exportToPDF } from "./utils/mockPdfExcel";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("map"); // map, analytics, settings, reports
  
  // Dashboard states
  const [rois, setRois] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    total_monitored_regions: 0,
    active_alerts: 0,
    total_deforested_km2: 0.0,
    total_mining_km2: 0.0,
    scan_efficiency: 97.4
  });

  const [activeROI, setActiveROI] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnGeoJSON, setDrawnGeoJSON] = useState(null);

  // Toast notification state
  const [toast, setToast] = useState(null);

  // Auto-login checking
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setCurrentUser({
        username: localStorage.getItem("username"),
        role: localStorage.getItem("role"),
        fullName: localStorage.getItem("fullName")
      });
    }
  }, []);

  // Fetch Dashboard Stats, ROIs, and Alerts when currentUser changes
  useEffect(() => {
    if (currentUser) {
      fetchDashboardData();
    }
  }, [currentUser]);

  const fetchDashboardData = async () => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("token")}` };
      
      // Fetch ROIs
      const roisResponse = await fetch("http://localhost:8000/api/rois", { headers });
      if (roisResponse.ok) {
        const roisData = await roisResponse.json();
        setRois(roisData);
        if (roisData.length > 0 && !activeROI) {
          setActiveROI(roisData[0]); // default active ROI
        }
      }

      // Fetch Alerts
      const alertsResponse = await fetch("http://localhost:8000/api/alerts", { headers });
      if (alertsResponse.ok) {
        const alertsData = await alertsResponse.json();
        setAlerts(alertsData);
      }

      // Fetch Stats
      const statsResponse = await fetch("http://localhost:8000/api/dashboard/stats", { headers });
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

    } catch (err) {
      console.error("Error fetching surveillance statistics:", err);
    }
  };

  const handleLoginSuccess = (userData) => {
    setCurrentUser({
      username: userData.username,
      role: userData.role,
      fullName: userData.full_name
    });
    showToast("Surveillance session successfully authenticated.", "success");
  };

  const handleLogout = () => {
    localStorage.clear();
    setCurrentUser(null);
    setActiveROI(null);
    setActiveAlert(null);
    showToast("Surveillance session terminated.", "danger");
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSelectROI = (roi) => {
    setActiveROI(roi);
    // Find associated alerts to highlight or just open analytics
    setActiveAlert(null);
    setActiveTab("analytics");
    showToast(`Loaded analytics for ${roi.name}`, "success");
  };

  const handleSelectAlert = (alert) => {
    setActiveAlert(alert);
    // Focus ROI
    const associatedROI = rois.find(r => r.id === alert.roi_id);
    if (associatedROI) {
      setActiveROI(associatedROI);
    }
    setActiveTab("map");
  };

  // Triggers manual satellite down scanner and AI change detection (FR-01, FR-05, FR-06)
  const triggerManualScanner = async () => {
    if (!activeROI) {
      alert("Please select a Region of Interest to scan.");
      return;
    }
    setScanLoading(true);
    showToast(`Requesting satellite tasking for ${activeROI.name}...`, "success");
    
    try {
      const response = await fetch(`http://localhost:8000/api/rois/${activeROI.id}/scan?satellite_source=Sentinel-2`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Scanning process failed.");
      }

      const result = await response.json();
      
      if (result.status === "skipped") {
        showToast(`Scan skipped. Cloud cover exceeds limit: ${result.cloud_cover}%`, "danger");
      } else {
        showToast("Satellite tile downloaded & AI change analysis completed successfully!", "success");
        if (result.alert_generated) {
          showToast(`⚠️ WARNING: AI detected unauthorized expansion! Alert escalated.`, "danger");
        }
        fetchDashboardData(); // Refresh UI
      }
    } catch (err) {
      alert(err.message || "Failed to trigger automated scan pipeline.");
    } finally {
      setScanLoading(false);
    }
  };

  const handleAddROI = (newROI) => {
    setRois([...rois, newROI]);
    fetchDashboardData();
    setDrawnGeoJSON(null);
  };

  const handleDrawingComplete = (geoJsonData) => {
    setIsDrawing(false);
    setDrawnGeoJSON(geoJsonData);
    setActiveTab("settings");
  };

  // Fulfills FR-15 Dynamic PDF/Excel report downloads
  const handleDownloadReport = async (format) => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("token")}` };
      const regionParam = activeROI ? `region_id=${activeROI.id}` : "";
      
      const response = await fetch(`http://localhost:8000/api/reports/download?${regionParam}`, { headers });
      if (!response.ok) throw new Error("Could not pull audit reports.");

      const reportPayload = await response.json();

      if (format === "csv") {
        exportToCSV(reportPayload.data, activeROI ? activeROI.name.replace(/\s+/g, "_") : "National_Surveillance");
        showToast("Surveillance Spreadsheet report successfully downloaded.", "success");
      } else {
        exportToPDF(reportPayload.data, activeROI ? activeROI.name : "National Surveillance Summary");
        showToast("Surveillance PDF report successfully prepared.", "success");
      }
    } catch (err) {
      alert("Failed to export surveillance records: " + err.message);
    }
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="dashboard-container">
      {/* Toast Alert overlay */}
      {toast && (
        <div className={`toast-msg ${toast.type}`}>
          <AlertTriangle size={18} />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <Shield size={20} style={{ color: "#fff" }} />
          </div>
          <div>
            <h1 className="logo-text">SURVEILLANCE</h1>
            <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", letterSpacing: "0.08em", fontWeight: "700", textTransform: "uppercase" }}>
              AI Earth Monitoring
            </span>
          </div>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === "map" ? "active" : ""}`}
            onClick={() => { setActiveTab("map"); setIsDrawing(false); }}
          >
            <Map size={18} /> Map & Incidents
          </button>
          
          <button
            className={`nav-item ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => { setActiveTab("analytics"); setIsDrawing(false); }}
          >
            <BarChart2 size={18} /> Analytics & Trends
          </button>
          
          <button
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => { setActiveTab("settings"); setIsDrawing(false); }}
          >
            <Sliders size={18} /> Surveillance Settings
          </button>

          <button
            className={`nav-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => { setActiveTab("reports"); setIsDrawing(false); }}
          >
            <FileText size={18} /> Surveillance Export
          </button>
        </nav>

        {/* User profile capsule and logout */}
        <div className="user-badge">
          <div className="user-name">{currentUser.fullName}</div>
          <div className="user-role">
            <Radio size={10} style={{ color: "var(--color-success)", animation: "pulse 2s infinite" }} />
            {currentUser.role.replace("_", " ")}
          </div>
          <button
            onClick={handleLogout}
            style={{
              marginTop: "12px",
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer"
            }}
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </aside>

      {/* Header and Task Actions */}
      <header className="header">
        <h2 className="header-title">
          {activeTab === "map" && "Real-Time GIS Threat Surveillance Map"}
          {activeTab === "analytics" && "Satellite AI Historical Analytics"}
          {activeTab === "settings" && "Region & Threshold Configurations"}
          {activeTab === "reports" && "Surveillance Report Exporter Portal"}
        </h2>

        <div className="header-actions">
          {activeROI && (currentUser.role === "admin" || currentUser.role === "analyst") && (
            <button
              className="role-switcher-btn"
              onClick={triggerManualScanner}
              disabled={scanLoading}
              style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}
            >
              <RefreshCw size={14} className={scanLoading ? "rotating-refresh" : ""} />
              {scanLoading ? "Scanning Bounding Box..." : `Task Satellite: ${activeROI.name.split(" ")[0]}`}
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {/* KPI Panel at the Top */}
        <section className="kpi-row">
          <div className="glass-panel kpi-card">
            <div>
              <div className="kpi-title">Monitored Regions</div>
              <div className="kpi-val">{stats.total_monitored_regions}</div>
              <div className="kpi-sub">Active ROI Polygons</div>
            </div>
            <div className="kpi-icon">
              <Map size={20} />
            </div>
          </div>

          <div className="glass-panel kpi-card" style={{ borderLeft: "3px solid var(--color-danger)" }}>
            <div>
              <div className="kpi-title">Threat Incidents</div>
              <div className="kpi-val" style={{ color: "var(--color-danger)" }}>{stats.active_alerts}</div>
              <div className="kpi-sub">Pending Review Escalations</div>
            </div>
            <div className="kpi-icon" style={{ color: "var(--color-danger)" }}>
              <AlertTriangle size={20} />
            </div>
          </div>

          <div className="glass-panel kpi-card">
            <div>
              <div className="kpi-title">Forest Cover Loss</div>
              <div className="kpi-val">{stats.total_deforested_km2} km²</div>
              <div className="kpi-sub">Vegetation NDVI Declines</div>
            </div>
            <div className="kpi-icon" style={{ color: "var(--color-success)" }}>
              <Shield size={20} />
            </div>
          </div>

          <div className="glass-panel kpi-card">
            <div>
              <div className="kpi-title">Mined clearance Area</div>
              <div className="kpi-val">{stats.total_mining_km2} km²</div>
              <div className="kpi-sub">Excavated Bare Earth Gain</div>
            </div>
            <div className="kpi-icon" style={{ color: "var(--color-warning)" }}>
              <BarChart2 size={20} />
            </div>
          </div>
        </section>

        {/* Tab-driven layout content rendering */}
        <section style={{ height: "calc(100vh - 210px)" }}>
          {activeTab === "map" && (
            <div className="dashboard-grid">
              <MapComponent
                rois={rois}
                alerts={alerts}
                onSelectROI={handleSelectROI}
                onSelectAlert={handleSelectAlert}
                isDrawing={isDrawing}
                onDrawingComplete={handleDrawingComplete}
              />
              
              <AlertPanel
                alerts={alerts}
                activeAlert={activeAlert}
                onSelectAlert={setActiveAlert}
                onRefreshAlerts={fetchDashboardData}
                currentUser={currentUser}
              />
            </div>
          )}

          {activeTab === "analytics" && (
            <AnalyticsPanel activeROI={activeROI} />
          )}

          {activeTab === "settings" && (
            <ConfigPanel
              rois={rois}
              onAddROI={handleAddROI}
              currentUser={currentUser}
              onStartDrawing={() => { setIsDrawing(true); setActiveTab("map"); }}
              drawnGeoJSON={drawnGeoJSON}
            />
          )}

          {activeTab === "reports" && (
            <div className="glass-panel" style={{ padding: "30px", height: "fit-content", maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: "700" }}>Export Environmental surveillance Reports</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "4px" }}>
                  Download government-grade incident logs and NDVI statistics for audits or authorities.
                </p>
              </div>

              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px", background: "rgba(255,255,255,0.01)" }}>
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  <strong>Selected Target Region:</strong> {activeROI ? activeROI.name : "All Surveillance Regions"}
                </span>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                  The report will export the full history of alerts, confidence levels, classification changes, and gps locations for the selected target region.
                </p>
              </div>

              <div style={{ display: "flex", gap: "16px" }}>
                <button
                  className="btn-action confirm"
                  onClick={() => handleDownloadReport("pdf")}
                  style={{ background: "#c2410c" }} // Orange-red for official PDF
                >
                  <FileText size={18} /> Export Surveillance PDF
                </button>
                <button
                  className="btn-action dismiss"
                  onClick={() => handleDownloadReport("csv")}
                  style={{ borderColor: "var(--color-success)", color: "var(--color-success)" }}
                >
                  <FileText size={18} /> Export Excel / CSV
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
