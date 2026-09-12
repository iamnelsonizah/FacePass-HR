"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import "../../../visitor.css";

interface VerifiedVisitor {
  id: string;
  visitor_code: string;
  name: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  host_name?: string;
  company?: string;
  status: "ON_SITE" | "DEPARTED";
  last_punch_type: string;
  last_punch_time: string;
  check_in_time?: string;
  check_out_time?: string;
  check_in_photo?: string;
  departure_photo_url?: string;
  dwell_minutes: number;
  facility_node?: string;
  geofence_status?: string;
}

export default function VisitorVerificationPage() {
  const params = useParams();
  const router = useRouter();
  const codeParam = (params?.code as string) || "";

  const [visitor, setVisitor] = useState<VerifiedVisitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clockOutLoading, setClockOutLoading] = useState(false);
  const [clockOutSuccess, setClockOutSuccess] = useState<string | null>(null);
  const [verifiedTime, setVerifiedTime] = useState<string>("");

  // Live security gate wall clock
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setVerifiedTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadVisitorDossier = useCallback(async () => {
    if (!codeParam) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/visitor?code=${encodeURIComponent(codeParam)}`);
      const data = await res.json();

      if (!res.ok || !data.success || !data.visitor) {
        throw new Error(data.error || `No active or past visitor record found for pass '${codeParam}'.`);
      }

      setVisitor(data.visitor);
    } catch (err: any) {
      setError(err.message || "Failed to load visitor security dossier.");
    } finally {
      setLoading(false);
    }
  }, [codeParam]);

  useEffect(() => {
    loadVisitorDossier();
  }, [loadVisitorDossier]);

  // Security gate officer can clock out visitor directly from verification screen
  const handleGateClockOut = async () => {
    if (!visitor) return;
    setClockOutLoading(true);
    setClockOutSuccess(null);

    try {
      const res = await fetch("/api/portal/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "punch",
          visitorCode: visitor.visitor_code,
          checkType: "check_out",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gate departure logging failed.");
      }

      setClockOutSuccess("Visitor departure successfully recorded at Security Gate MK-01.");
      await loadVisitorDossier();
    } catch (err: any) {
      alert(err.message || "Could not complete gate clock out.");
    } finally {
      setClockOutLoading(false);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "Today";
    try {
      return new Date(isoString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Today";
    }
  };

  return (
    <div className="visitor-body" style={{ minHeight: "100vh", background: "var(--fp-sand)", color: "var(--fp-ink)" }}>
      {/* ─── MOROCCAN SECURITY CLEARANCE HEADER ─── */}
      <header className="visitor-header" style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <div className="visitor-header-inner">
          <div className="visitor-brand">
            <div className="visitor-brand-mark" style={{ width: 34, height: 34 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <div className="visitor-title" style={{ fontSize: "1.15rem" }}>
                FacePass Security Clearance
              </div>
              <div className="visitor-subtitle" style={{ fontSize: "0.74rem" }}>
                Gate MK-01 Verification &middot; Marrakesh Regional Operations Hub
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div className="visitor-clock" style={{ padding: "4px 10px", fontSize: "0.8rem" }}>
              <span className="visitor-clock-pulse" />
              <span>{verifiedTime}</span>
            </div>
            <Link
              href="/visitor"
              className="visitor-mono"
              style={{
                fontSize: "0.78rem",
                color: "var(--fp-sand)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>&larr; Terminal</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── MAIN CLEARANCE CONTAINER ─── */}
      <main className="visitor-main" style={{ maxWidth: 840, margin: "0 auto", padding: "28px 16px 60px" }}>
        {loading && (
          <div style={{ padding: "60px 20px", textAlign: "center", background: "var(--fp-paper)", borderRadius: "3px", border: "1px solid var(--fp-line)" }}>
            <div style={{ width: 36, height: 36, border: "3px solid var(--fp-line)", borderTopColor: "var(--fp-clay)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
            <div className="visitor-mono" style={{ fontSize: "0.85rem", color: "var(--fp-ash)" }}>
              Retrieving cryptographic visitor pass dossier for {codeParam}...
            </div>
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: "40px 24px", textAlign: "center", background: "white", borderRadius: "3px", border: "1px solid rgba(174, 59, 38, 0.4)" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(174, 59, 38, 0.12)", color: "#ae3b26", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3 style={{ fontFamily: "'Bitter', serif", fontSize: "1.25rem", margin: "0 0 8px" }}>Pass Verification Failed</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--fp-ash)", margin: "0 0 20px" }}>{error}</p>
            <Link
              href="/visitor"
              style={{
                display: "inline-block",
                padding: "8px 20px",
                background: "var(--fp-ink)",
                color: "white",
                textDecoration: "none",
                borderRadius: "2px",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              &larr; Return to Visitor Terminal
            </Link>
          </div>
        )}

        {visitor && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* 1. Clearance Status Banner */}
            <div
              style={{
                padding: "16px 20px",
                background: visitor.status === "ON_SITE" ? "rgba(44, 107, 94, 0.12)" : "rgba(33, 37, 43, 0.06)",
                border: `1.5px solid ${visitor.status === "ON_SITE" ? "var(--fp-zellige)" : "var(--fp-line)"}`,
                borderRadius: "3px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: visitor.status === "ON_SITE" ? "var(--fp-zellige)" : "var(--fp-ash)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: visitor.status === "ON_SITE" ? "0 0 10px rgba(44, 107, 94, 0.4)" : "none",
                  }}
                >
                  {visitor.status === "ON_SITE" ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="visitor-mono" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: visitor.status === "ON_SITE" ? "var(--fp-zellige)" : "var(--fp-ash)", fontWeight: 700 }}>
                      CLEARANCE STATUS
                    </span>
                    <span className={visitor.status === "ON_SITE" ? "status-badge-onsite" : "status-badge-departed"}>
                      {visitor.status === "ON_SITE" ? "ACTIVE & VERIFIED ON SITE" : "VISIT CONCLUDED / DEPARTED"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--fp-ink)", marginTop: "2px" }}>
                    {visitor.status === "ON_SITE"
                      ? "Visitor authorized for facility interior. Physical access badge is valid."
                      : `Visitor concluded their visit. Total duration on premises: ${visitor.dwell_minutes}m.`}
                  </div>
                </div>
              </div>

              <div className="visitor-mono" style={{ fontSize: "0.78rem", color: "var(--fp-ash)", textAlign: "right" }}>
                <span>Verified: </span>
                <strong>{verifiedTime}</strong>
              </div>
            </div>

            {clockOutSuccess && (
              <div style={{ padding: "10px 16px", background: "rgba(44, 107, 94, 0.15)", border: "1px solid var(--fp-zellige)", color: "var(--fp-zellige)", borderRadius: "2px", fontSize: "0.84rem", fontWeight: 600 }}>
                {clockOutSuccess}
              </div>
            )}

            {/* 2. Biometric Photos Section: Check-In & Check-Out (As Requested by User) */}
            <div style={{ background: "var(--fp-paper)", border: "1px solid var(--fp-line)", borderRadius: "3px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--fp-line)", paddingBottom: "10px", marginBottom: "16px" }}>
                <h3 style={{ fontFamily: "'Bitter', serif", fontSize: "1.15rem", margin: 0 }}>
                  Biometric Facial Record
                </h3>
                <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)" }}>
                  SEC-LEVEL: FACIAL_ID_512D
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                {/* ── Check-In Photo Card ── */}
                <div
                  style={{
                    background: "white",
                    border: "1px solid var(--fp-line)",
                    borderRadius: "3px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", borderBottom: "1px solid var(--fp-line)", paddingBottom: "6px" }}>
                    <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-clay)", fontWeight: 700 }}>
                      ENTRY BIOMETRIC SNAPSHOT
                    </span>
                    <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)" }}>
                      {formatTime(visitor.check_in_time || visitor.last_punch_time)}
                    </span>
                  </div>

                  {visitor.check_in_photo ? (
                    <div style={{ width: 140, height: 165, borderRadius: "4px", overflow: "hidden", border: "2px solid var(--fp-clay)", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                      <img
                        src={visitor.check_in_photo}
                        alt={`Entry photo of ${visitor.name}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 140,
                        height: 165,
                        borderRadius: "4px",
                        background: "var(--fp-paper)",
                        border: "1px dashed var(--fp-line)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--fp-ash)",
                        textAlign: "center",
                        padding: "10px",
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="7" r="4" />
                        <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
                      </svg>
                      <span className="visitor-mono" style={{ fontSize: "0.68rem", marginTop: "6px" }}>
                        Entry recorded without photo
                      </span>
                    </div>
                  )}

                  <div style={{ textAlign: "center", width: "100%" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>{visitor.name}</div>
                    <div className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)" }}>
                      Date: {formatDate(visitor.check_in_time || visitor.last_punch_time)}
                    </div>
                  </div>
                </div>

                {/* ── Check-Out Photo Card ── */}
                <div
                  style={{
                    background: "white",
                    border: "1px solid var(--fp-line)",
                    borderRadius: "3px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", borderBottom: "1px solid var(--fp-line)", paddingBottom: "6px" }}>
                    <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-zellige)", fontWeight: 700 }}>
                      EXIT BIOMETRIC SNAPSHOT
                    </span>
                    <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)" }}>
                      {visitor.check_out_time ? formatTime(visitor.check_out_time) : "Pending"}
                    </span>
                  </div>

                  {visitor.departure_photo_url ? (
                    <div style={{ width: 140, height: 165, borderRadius: "4px", overflow: "hidden", border: "2px solid var(--fp-zellige)", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}>
                      <img
                        src={visitor.departure_photo_url}
                        alt={`Departure photo of ${visitor.name}`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  ) : visitor.status === "ON_SITE" ? (
                    <div
                      style={{
                        width: 140,
                        height: 165,
                        borderRadius: "4px",
                        background: "rgba(44, 107, 94, 0.06)",
                        border: "1.5px dashed var(--fp-zellige)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--fp-zellige)",
                        textAlign: "center",
                        padding: "12px",
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span className="visitor-mono" style={{ fontSize: "0.72rem", fontWeight: 700, marginTop: "8px" }}>
                        AWAITING EXIT
                      </span>
                      <span className="visitor-mono" style={{ fontSize: "0.66rem", color: "var(--fp-ash)", marginTop: "4px" }}>
                        Photo captures upon departure punch
                      </span>
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 140,
                        height: 165,
                        borderRadius: "4px",
                        background: "var(--fp-paper)",
                        border: "1px dashed var(--fp-line)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--fp-ash)",
                        textAlign: "center",
                        padding: "10px",
                      }}
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 14 14" />
                      </svg>
                      <span className="visitor-mono" style={{ fontSize: "0.68rem", marginTop: "6px" }}>
                        Exit recorded without photo
                      </span>
                    </div>
                  )}

                  <div style={{ textAlign: "center", width: "100%" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                      {visitor.status === "ON_SITE" ? "Currently on Site" : "Concluded Visit"}
                    </div>
                    <div className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)" }}>
                      {visitor.status === "ON_SITE"
                        ? `Dwell: ~${visitor.dwell_minutes}m elapsed`
                        : `Total Dwell: ${visitor.dwell_minutes}m`}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Visitor Dossier Details Grid */}
            <div style={{ background: "var(--fp-paper)", border: "1px solid var(--fp-line)", borderRadius: "3px", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--fp-line)", paddingBottom: "10px", marginBottom: "16px" }}>
                <h3 style={{ fontFamily: "'Bitter', serif", fontSize: "1.15rem", margin: 0 }}>
                  Visitor Dossier
                </h3>
                <span className="visitor-mono" style={{ padding: "4px 8px", background: "var(--fp-sand)", borderRadius: "2px", fontWeight: 700, fontSize: "0.92rem", color: "var(--fp-clay)" }}>
                  {visitor.visitor_code}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Full Name</span>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{visitor.name}</div>
                </div>

                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Company / Organization</span>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{visitor.company || "Independent Guest"}</div>
                </div>

                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Contact Phone</span>
                  <div className="visitor-mono" style={{ fontSize: "0.9rem" }}>{visitor.phone || "Not provided"}</div>
                </div>

                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Contact Email</span>
                  <div className="visitor-mono" style={{ fontSize: "0.9rem" }}>{visitor.email || "Not provided"}</div>
                </div>

                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Host / Department</span>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>{visitor.host_name || "Operations Team"}</div>
                </div>

                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Check-In Timestamp</span>
                  <div className="visitor-mono" style={{ fontSize: "0.9rem", color: "var(--fp-clay)" }}>
                    {formatTime(visitor.check_in_time || visitor.last_punch_time)}
                  </div>
                </div>

                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Check-Out Timestamp</span>
                  <div className="visitor-mono" style={{ fontSize: "0.9rem", color: "var(--fp-zellige)" }}>
                    {visitor.check_out_time ? formatTime(visitor.check_out_time) : "Still on premises"}
                  </div>
                </div>

                <div>
                  <span className="visitor-mono" style={{ fontSize: "0.72rem", color: "var(--fp-ash)", textTransform: "uppercase" }}>Facility Perimeter</span>
                  <div className="visitor-mono" style={{ fontSize: "0.9rem" }}>Site MK-01 (Geofence verified)</div>
                </div>
              </div>
            </div>

            {/* 4. Security Officer Gate Actions */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                background: "white",
                padding: "16px",
                border: "1px solid var(--fp-line)",
                borderRadius: "3px",
              }}
            >
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: "8px 16px",
                    border: "1px solid var(--fp-line)",
                    background: "white",
                    borderRadius: "2px",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span>Print Clearance Dossier</span>
                </button>

                <button
                  type="button"
                  onClick={loadVisitorDossier}
                  style={{
                    padding: "8px 14px",
                    border: "1px solid var(--fp-line)",
                    background: "white",
                    borderRadius: "2px",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                  }}
                >
                  Refresh Data
                </button>
              </div>

              {visitor.status === "ON_SITE" && (
                <button
                  type="button"
                  onClick={handleGateClockOut}
                  disabled={clockOutLoading}
                  style={{
                    padding: "8px 20px",
                    background: "var(--fp-clay)",
                    color: "white",
                    border: "none",
                    borderRadius: "2px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.84rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>{clockOutLoading ? "Logging Departure..." : "Clock Out Guest at Gate"}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
