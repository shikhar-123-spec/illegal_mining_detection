import React, { useState, useEffect } from "react";
import { BarChart, AreaChart, Compass, Award, Calendar, Activity } from "lucide-react";

export default function AnalyticsPanel({ activeROI }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeROI) {
      fetchHistory(activeROI.id);
    }
  }, [activeROI]);

  const fetchHistory = async (roiId) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/rois/${roiId}/history`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Error fetching historical analysis:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!activeROI) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", gap: "12px", textAlign: "center" }}>
        <Compass size={48} style={{ color: "var(--text-muted)" }} />
        <h4 style={{ color: "var(--text-secondary)" }}>No Monitored Region Selected</h4>
        <p style={{ fontSize: "0.85rem", maxWidth: "300px" }}>
          Click on any Region of Interest on the map or alert feed to load environmental analytics charts.
        </p>
      </div>
    );
  }

  // Use history data if available; otherwise mock a realistic historical progression for display
  const chartData = history.length > 0 ? history : [
    { average_ndvi: 0.79, mine_area_km2: 0.32, forest_area_km2: 12.8, created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() },
    { average_ndvi: 0.79, mine_area_km2: 0.32, forest_area_km2: 12.8, created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString() },
    { average_ndvi: 0.79, mine_area_km2: 0.32, forest_area_km2: 12.8, created_at: new Date().toISOString() }
  ];

  const latestScan = chartData[chartData.length - 1];

  // Helper values for custom SVG charts
  const maxMine = Math.max(...chartData.map(d => d.mine_area_km2), 1.0);
  const minNdvi = Math.min(...chartData.map(d => d.average_ndvi), 0.2);
  const maxNdvi = Math.max(...chartData.map(d => d.average_ndvi), 1.0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", height: "100%", overflowY: "auto", paddingRight: "4px" }}>
      <div>
        <h3 style={{ fontSize: "1.2rem", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
          <Activity size={20} style={{ color: "var(--color-success)" }} />
          Environmental Analysis: {activeROI.name}
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "4px" }}>
          SURVEILLANCE AND AI SEGMENTATION TRACKING
        </p>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "var(--text-secondary)" }}>
          Loading database timeline history...
        </div>
      ) : (
        <>
          {/* Land Cover Classification Distribution (FR-05) */}
          <div className="glass-panel" style={{ padding: "20px" }}>
            <h4 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Latest Land Cover Distribution (Segmented Area)
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { name: "Forest Cover", val: latestScan.forest_area_km2, color: "var(--color-success)" },
                { name: "Mine Clearance", val: latestScan.mine_area_km2, color: "var(--text-muted)" },
                { name: "Bare Land/Quarry", val: latestScan.bare_land_area_km2, color: "var(--color-warning)" },
                { name: "Water Canopy", val: latestScan.water_area_km2, color: "var(--color-info)" },
                { name: "Settlements/Urban", val: latestScan.urban_area_km2, color: "#b7094c" }
              ].map((category) => {
                const total = latestScan.forest_area_km2 + latestScan.mine_area_km2 + latestScan.bare_land_area_km2 + latestScan.water_area_km2 + latestScan.urban_area_km2;
                const percentage = total > 0 ? (category.val / total) * 100 : 0;
                return (
                  <div key={category.name} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                      <span style={{ fontWeight: "500", color: "var(--text-primary)" }}>{category.name}</span>
                      <span style={{ color: "var(--text-secondary)", fontWeight: "600" }}>{category.val} km² ({Math.round(percentage)}%)</span>
                    </div>
                    <div style={{ height: "6px", width: "100%", background: "rgba(255,255,255,0.03)", borderRadius: "3px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.02)" }}>
                      <div style={{ height: "100%", width: `${percentage}%`, background: category.color, borderRadius: "3px", transition: "width 0.8s ease-in-out" }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom SVG Line Chart: NDVI Vegetation Index Drop (FR-07, FR-16) */}
          <div className="glass-panel" style={{ padding: "20px" }}>
            <h4 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              NDVI Vegetation Index Timeline
            </h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "20px" }}>
              Higher values (~0.8) indicate healthy forest canopy; downward spikes reveal logging/clearance.
            </p>

            <div style={{ position: "relative", height: "180px", borderLeft: "1px solid var(--border-glass)", borderBottom: "1px solid var(--border-glass)", paddingLeft: "12px", margin: "0 10px 25px 30px" }}>
              {/* Y Axis Guides */}
              <div style={{ position: "absolute", left: "-32px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: "600" }}>
                <span>1.0</span>
                <span>0.6</span>
                <span>0.2</span>
              </div>
              
              {/* SVG Line Graph */}
              <svg style={{ width: "100%", height: "100%", overflow: "visible" }}>
                {/* Horizontal grid lines */}
                <line x1="0" y1="0%" x2="100%" y2="0%" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                <line x1="0" y1="100%" x2="100%" y2="100%" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

                {/* Draw SVG Line */}
                {(() => {
                  const width = 320;
                  const step = chartData.length > 1 ? 100 / (chartData.length - 1) : 100;
                  const points = chartData.map((d, index) => {
                    const x = `${index * step}%`;
                    const ndviFraction = (d.average_ndvi - 0.2) / 0.8; // Scale to 0.2 - 1.0 range
                    const y = `${100 - (ndviFraction * 100)}%`;
                    return { x, y, val: d.average_ndvi, date: new Date(d.created_at).toLocaleDateString() };
                  });

                  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(" ");

                  return (
                    <>
                      <defs>
                        <linearGradient id="ndviGlow" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {/* Area Fill */}
                      <path
                        d={`${pathD} L 100% 100% L 0% 100% Z`}
                        fill="url(#ndviGlow)"
                      />
                      {/* Glow stroke line */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="var(--color-success)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        style={{ filter: "drop-shadow(0 0 4px rgba(16,185,129,0.5))" }}
                      />
                      {/* Vertex circles */}
                      {points.map((p, i) => (
                        <g key={i}>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r="5"
                            fill="var(--bg-primary)"
                            stroke="var(--color-success)"
                            strokeWidth="2.5"
                            style={{ cursor: "pointer" }}
                          />
                          {/* Label below dot */}
                          <text x={p.x} y={parseFloat(p.y) < 15 ? "20%" : `${parseFloat(p.y) - 8}%`} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold">
                            {p.val}
                          </text>
                          {/* X Axis Timeline Labels */}
                          <text x={p.x} y="112%" textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontWeight="500">
                            {p.date}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>

          {/* Custom SVG Bar Chart: Mine Boundary Expansion (FR-16) */}
          <div className="glass-panel" style={{ padding: "20px" }}>
            <h4 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: "8px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Mine Expansion Curve (Cumulative Size)
            </h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "20px" }}>
              Monitors excavating expansions in square kilometers over chronological scan steps.
            </p>

            <div className="custom-chart-container" style={{ height: "140px", margin: "0 10px 25px 30px" }}>
              {/* Y Axis Guide */}
              <div className="chart-y-axis-label">
                <span>{maxMine.toFixed(1)}</span>
                <span>{ (maxMine/2).toFixed(1) }</span>
                <span>0.0</span>
              </div>

              {chartData.map((d, index) => {
                const heightPercentage = maxMine > 0 ? (d.mine_area_km2 / maxMine) * 100 : 0;
                return (
                  <div key={index} className="chart-bar-col">
                    <div
                      className="chart-bar"
                      style={{
                        height: `${heightPercentage}%`,
                        background: d.mine_area_km2 > 1.0 ? "var(--color-danger)" : "var(--color-warning)",
                        boxShadow: d.mine_area_km2 > 1.0 ? "0 0 10px rgba(239, 68, 68, 0.2)" : "0 0 10px rgba(245, 158, 11, 0.2)"
                      }}
                    >
                      <div className="chart-tooltip">
                        {d.mine_area_km2} km²
                      </div>
                    </div>
                    <span className="chart-label" style={{ fontSize: "0.7rem" }}>
                      Scan #{index+1}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
