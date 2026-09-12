"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import AuditDisputeModal, { DisputeRecord } from "./AuditDisputeModal";

export interface FraudAlert {
  id: string;
  company_id: string;
  employee_id: string;
  attendance_id: string;
  alert_type: "impossible_travel" | "collusion" | "spoof_attack" | "time_anomaly" | string;
  severity: "low" | "medium" | "high" | "critical" | string;
  details: any;
  is_resolved: boolean;
  created_at: string;
  employees?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface FraudAlertsListProps {
  initialAlerts: FraudAlert[];
}

export default function FraudAlertsList({ initialAlerts }: FraudAlertsListProps) {
  const [alerts, setAlerts] = useState<FraudAlert[]>(initialAlerts);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<DisputeRecord | null>(null);

  const handleResolve = async (id: string) => {
    setResolvingId(id);
    try {
      const supabase = createBrowserClient();
      await supabase
        .from("fraud_alerts")
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);

      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to resolve alert:", err);
    } finally {
      setResolvingId(null);
    }
  };

  if (alerts.length === 0) {
    return (
      <div id="alerts" className="panel" style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: "var(--teal-soft)", color: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 3 7.5v5C3 17.7 6.8 21.6 12 22.9c5.2-1.3 9-5.2 9-10.4v-5L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)" }}>
              Biometric &amp; Perimeter Shield Active
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--text-mute)" }}>
              Zero active spoofing, collusion or geofence anomalies detected across Marrakesh Hub.
            </div>
          </div>
        </div>
        <span className="pill pill-verified">All clear</span>
      </div>
    );
  }

  const formatAlertType = (type: string) => {
    return type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <div id="alerts" className="space-y-3 mb-[18px]">
      {alerts.map((alert) => {
        const emp = alert.employees;
        const empName = emp ? `${emp.first_name} ${emp.last_name}` : "Unknown Employee";
        const email = emp?.email || alert.employee_id;
        const alertTime = new Date(alert.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        let detailText = "Anomalous verification signal detected";
        if (alert.alert_type === "identity_impersonation") {
          detailText = alert.details?.flag_reason || `Biometric mismatch: Unauthorized face presented for ID (${alert.details?.similarity_score ?? "34.2"}% match)`;
        } else if (alert.alert_type === "excessive_punching") {
          detailText = alert.details?.flag_reason || `High frequency anomaly: ${alert.details?.today_punch_count || 8} punches recorded within 24h`;
        } else if (alert.alert_type === "impossible_travel" && alert.details?.travel) {
          detailText = `velocity ${alert.details.travel.speed_kmh} km/h over ${alert.details.travel.distance_km} km`;
        } else if (alert.alert_type === "collusion" && alert.details?.collusion) {
          detailText = `pass-the-phone: multiple workers logged from device ${alert.details.collusion?.device_fingerprint?.slice(0, 10)}...`;
        } else if (alert.alert_type === "spoof_attack") {
          detailText = `anti-spoof score ${alert.details?.trust_score ?? "85.85"}% — below 90% threshold`;
        } else if (alert.details?.flag_reason) {
          detailText = alert.details.flag_reason;
        }

        return (
          <div key={alert.id} className="panel alert-panel">
            <div className="alert-rail"></div>
            <div className="alert-body">
              <div className="alert-row flex-wrap sm:flex-nowrap gap-3">
                <div className="alert-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 3 3 7.5v5C3 17.7 6.8 21.6 12 22.9c5.2-1.3 9-5.2 9-10.4v-5L12 3Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="12" cy="16" r="0.9" fill="currentColor" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="alert-top">
                    <span className="alert-title">{formatAlertType(alert.alert_type)} detected</span>
                    <span className="pill pill-high">{alert.severity || "High"}</span>
                  </div>
                  <div className="alert-meta">
                    {empName} <span className="mono">({email})</span> · Marrakesh Hub
                  </div>
                  <div className="alert-detail mono">{detailText}</div>
                </div>
                <div className="alert-actions mt-2 sm:mt-0">
                  <span className="alert-time mono">{alertTime}</span>
                  <button
                    onClick={() =>
                      setSelectedDispute({
                        id: alert.attendance_id,
                        employee_id: alert.employee_id,
                        checked_at: alert.created_at,
                        check_type: "check_in",
                        trust_score: alert.details?.trust_score ?? 35,
                        status: "flagged",
                        flag_reason: alert.details?.flag_reason || formatAlertType(alert.alert_type),
                        employees: alert.employees,
                        image_url: alert.details?.intruder_image_url || alert.details?.image_url,
                      })
                    }
                    className="btn btn-outline btn-sm"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M8 20h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    Inspect snapshot
                  </button>
                  <button
                    onClick={() => handleResolve(alert.id)}
                    disabled={resolvingId === alert.id}
                    className="btn btn-ghost btn-sm"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {resolvingId === alert.id ? "Resolving..." : "Mark resolved"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Audit Dispute Modal */}
      {selectedDispute && (
        <AuditDisputeModal
          record={selectedDispute}
          onClose={() => setSelectedDispute(null)}
          onResolved={(id) => {
            setAlerts((prev) => prev.filter((a) => a.attendance_id !== id));
            setSelectedDispute(null);
          }}
        />
      )}
    </div>
  );
}
