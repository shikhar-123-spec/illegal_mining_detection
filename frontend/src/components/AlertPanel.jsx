import React, { useState, useEffect } from "react";
import { ShieldAlert, X, Check, Eye, MessageSquare, Clock, MapPin, BarChart2 } from "lucide-react";

export default function AlertPanel({ alerts, activeAlert, onSelectAlert, onRefreshAlerts, currentUser }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType, setFilterType] = useState("all");
  
  const [annotation, setAnnotation] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch Audit Logs when active alert changes
  useEffect(() => {
    if (activeAlert) {
      setAnnotation(activeAlert.annotation || "");
      fetchAuditLogs(activeAlert.id);
    } else {
      setAuditLogs([]);
    }
  }, [activeAlert]);

  const fetchAuditLogs = async (alertId) => {
    setLoadingAudit(true);
    try {
      const response = await fetch(`http://localhost:8000/api/alerts/${alertId}/audit-logs`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleReview = async (status) => {
    if (!activeAlert) return;
    setActionLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/alerts/${activeAlert.id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          status: status,
          annotation: annotation
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to update review.");
      }

      const updated = await response.json();
      onRefreshAlerts(updated); // Update parent list
      fetchAuditLogs(activeAlert.id); // Reload log timeline
      alert(`Alert successfully ${status.toUpperCase()}ED! Escalation completed.`);
    } catch (err) {
      alert(err.message || "Failed to escalate review status.");
    } finally {
      setActionLoading(false);
    }
  };

  // Filters logic
  const filteredAlerts = alerts.filter(alert => {
    if (filterStatus !== "all" && alert.status !== filterStatus) return false;
    if (filterSeverity !== "all" && alert.severity !== filterSeverity) return false;
    if (filterType !== "all" && alert.activity_type !== filterType) return false;
    return true;
  });

  const intConfidence = (val) => Math.round(val * 100);

  return (
    <div className="alert-feed-wrapper">
      <div className="feed-header">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ShieldAlert size={20} style={{ color: "var(--color-danger)" }} />
          <h3 className="feed-title">GIS Surveillance Incident Feed</h3>
        </div>
        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: "600" }}>
          {filteredAlerts.length} Alerts found
        </span>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel" style={{ padding: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ background: "#0b0c10", border: "1px solid var(--border-glass)", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}
        >
          <option value="all">Status: All</option>
          <option value="pending">Status: Pending</option>
          <option value="confirmed">Status: Confirmed</option>
          <option value="dismissed">Status: Dismissed</option>
        </select>

        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          style={{ background: "#0b0c10", border: "1px solid var(--border-glass)", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}
        >
          <option value="all">Severity: All</option>
          <option value="high">Severity: High</option>
          <option value="medium">Severity: Medium</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ background: "#0b0c10", border: "1px solid var(--border-glass)", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "0.8rem", cursor: "pointer" }}
        >
          <option value="all">Incident: All</option>
          <option value="deforestation">Deforestation</option>
          <option value="mine_expansion">Mine Expansion</option>
        </select>
      </div>

      {/* Alert Feed List */}
      <div className="alert-list">
        {filteredAlerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            No active threat alerts match the search criteria.
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`glass-panel alert-card severity-${alert.severity} ${activeAlert?.id === alert.id ? "selected" : ""}`}
              onClick={() => onSelectAlert(alert)}
            >
              <div className="alert-card-header">
                <span className="alert-type">
                  ⚠️ {alert.activity_type.replace("_", " ")}
                </span>
                <span className="alert-date">
                  {new Date(alert.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="alert-region">{alert.roi.name}</div>
              <div className="badge-row">
                <span className={`status-badge ${alert.status}`}>
                  {alert.status}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" }}>
                  AI Confidence: {intConfidence(alert.confidence_score)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Alert Escalation Detail Drawer */}
      <div className={`alert-drawer ${activeAlert ? "open" : ""}`}>
        {activeAlert && (
          <>
            <div className="drawer-header">
              <h3 style={{ textTransform: "uppercase", display: "flex", alignItems: "center", gap: "8px" }}>
                Threat Alert: #AL-{activeAlert.id}
              </h3>
              <button className="btn-close" onClick={() => onSelectAlert(null)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ borderBottom: "1px solid var(--border-glass)", paddingBottom: "12px" }}>
              <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                <strong>Region Name:</strong> {activeAlert.roi.name}
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                <span className={`status-badge ${activeAlert.status}`}>{activeAlert.status}</span>
                <span className={`status-badge ${activeAlert.severity}`} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-glass)", color: activeAlert.severity === "high" ? "var(--color-danger)" : "var(--color-warning)" }}>
                  {activeAlert.severity.toUpperCase()} SEVERITY
                </span>
              </div>
            </div>

            {/* Visual satellite thumbnails comparison */}
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "10px", fontWeight: "600" }}>
                AI Image Segmentation Comparison (Before vs Bounding Box)
              </p>
              <div className="thumbnail-comparison">
                <div className="thumb-box">
                  {/* Baseline: using standard baseline image */}
                  <img
                    src="http://localhost:8000/static/tiles/tile_roi_1_state_0_1780000000.png"
                    alt="Baseline Canopy"
                    className="thumb-img"
                    onError={(e) => {
                      // Fallback visual representations if seed dates slightly vary
                      e.target.src = `http://localhost:8000/static/tiles/tile_roi_${activeAlert.roi_id}_state_0_1780000000.png`;
                    }}
                  />
                  <span className="thumb-lbl">Baseline Canopy</span>
                </div>
                <div className="thumb-box">
                  <img
                    src={`http://localhost:8000${activeAlert.thumbnail_path}`}
                    alt="Incident Spot"
                    className="thumb-img"
                  />
                  <span className="thumb-lbl" style={{ color: "var(--color-danger)", fontWeight: "bold" }}>AI Bounding Box</span>
                </div>
              </div>
            </div>

            {/* GPS coordinates & Details card */}
            <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", background: "rgba(255,255,255,0.01)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem" }}>
                <MapPin size={16} style={{ color: "var(--color-info)" }} />
                <span>
                  <strong>GPS:</strong> {activeAlert.gps_latitude}, {activeAlert.gps_longitude}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem" }}>
                <BarChart2 size={16} style={{ color: "var(--color-success)" }} />
                <span>
                  <strong>Classification Confidence:</strong> {intConfidence(activeAlert.confidence_score)}%
                </span>
              </div>
            </div>

            {/* Audit Logs Timeline */}
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "10px", fontWeight: "600" }}>
                Surveillance Audit Trail Timeline
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--border-glass)", borderRadius: "8px", padding: "14px", maxHeight: "180px", overflowY: "auto" }}>
                {loadingAudit ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
                    Loading audit trail logs...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
                    No audit records available.
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} style={{ display: "flex", gap: "10px", borderBottom: "1px solid rgba(255,255,255,0.02)", paddingBottom: "8px" }}>
                      <div style={{ color: "var(--color-info)", marginTop: "2px" }}>
                        <Clock size={12} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-primary)", fontWeight: "600", textTransform: "capitalize" }}>
                          {log.action.replace("_", " ")}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: "1.3" }}>
                          {log.details}
                        </span>
                        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", alignSelf: "flex-end", marginTop: "2px" }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Analyst Review controls (Only for Analysts and Admins - FR-10, FR-17) */}
            {activeAlert.status === "pending" && (currentUser.role === "analyst" || currentUser.role === "admin") ? (
              <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <MessageSquare size={14} /> Review Annotation Notes
                  </label>
                  <textarea
                    className="form-input"
                    value={annotation}
                    onChange={(e) => setAnnotation(e.target.value)}
                    placeholder="Provide analysis findings, verification details, or comments..."
                    rows={3}
                    style={{ resize: "none", fontFamily: "sans-serif" }}
                  />
                </div>

                <div className="action-row">
                  <button
                    className="btn-action confirm"
                    onClick={() => handleReview("confirmed")}
                    disabled={actionLoading}
                  >
                    <Check size={16} /> Confirm & Escalate
                  </button>
                  <button
                    className="btn-action dismiss"
                    onClick={() => handleReview("dismissed")}
                    disabled={actionLoading}
                  >
                    <X size={16} /> Dismiss Alarm
                  </button>
                </div>
              </div>
            ) : activeAlert.status !== "pending" ? (
              <div style={{
                background: activeAlert.status === "confirmed" ? "rgba(239, 68, 68, 0.05)" : "rgba(16, 185, 129, 0.05)",
                border: `1px solid ${activeAlert.status === "confirmed" ? "var(--color-danger)" : "var(--color-success)"}`,
                padding: "16px",
                borderRadius: "8px",
                textAlign: "center",
                fontSize: "0.85rem",
                color: activeAlert.status === "confirmed" ? "var(--color-danger)" : "var(--color-success)",
                fontWeight: "600",
                textTransform: "uppercase"
              }}>
                This incident has been {activeAlert.status}ed
                {activeAlert.annotation && (
                  <div style={{ textTransform: "none", fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px", fontStyle: "italic", fontWeight: "normal" }}>
                    "{activeAlert.annotation}"
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--border-glass)",
                padding: "14px",
                borderRadius: "8px",
                textAlign: "center",
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                fontStyle: "italic"
              }}>
                Incident review is restricted. Only authorized Analysts or Admins can review pending alerts.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
