import React, { useState } from "react";
import { Shield, Lock, User as UserIcon } from "lucide-react";

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-fill logins for testing
  const demoUsers = [
    { label: "Admin", user: "admin", pass: "admin123", role: "admin" },
    { label: "Analyst", user: "analyst", pass: "analyst123", role: "analyst" },
    { label: "Field Officer", user: "officer", pass: "officer123", role: "field_officer" },
    { label: "Authority", user: "authority", pass: "authority123", role: "authority" },
  ];

  const handleDemoSelect = (demo) => {
    setUsername(demo.user);
    setPassword(demo.pass);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Build standard OAuth2 form-urlencoded request body
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);

      const response = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Authentication failed.");
      }

      const data = await response.json();
      // Store token and role
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("username", data.username);
      localStorage.setItem("fullName", data.full_name);

      onLoginSuccess(data);
    } catch (err) {
      setError(err.message || "Unable to connect to the backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card glass-panel">
        <div style={{ textAlign: "center" }}>
          <div className="logo-icon" style={{ margin: "0 auto 16px auto", width: "48px", height: "48px" }}>
            <Shield size={24} style={{ color: "#fff" }} />
          </div>
          <h2 style={{ fontSize: "1.7rem", marginBottom: "8px", fontWeight: "800" }}>SURVEILLANCE PORTAL</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            Illegal Mining & Deforestation Detection System
          </p>
        </div>

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid var(--color-danger)",
            color: "var(--color-danger)",
            padding: "12px",
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: "500",
            textAlign: "center"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="form-group">
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <UserIcon size={14} /> Username
            </label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>

          <div className="form-group" style={{ marginBottom: "8px" }}>
            <label className="form-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Lock size={14} /> Password
            </label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? "Authenticating SURVEILLANCE..." : "Access System"}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: "20px" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "12px", fontWeight: "600", letterSpacing: "0.05em", textTransform: "uppercase", textAlign: "center" }}>
            Quick Sandbox Access (Resume Reviewer Roles)
          </p>
          <div className="role-grid">
            {demoUsers.map((demo) => (
              <div
                key={demo.role}
                className={`role-pill ${username === demo.user ? "selected" : ""}`}
                onClick={() => handleDemoSelect(demo)}
              >
                {demo.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
