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
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">🛡️</span>
          <div>
            <h4 className="text-sm font-semibold text-emerald-900">Security Shield Active</h4>
            <p className="text-xs text-emerald-700">No active fraud or spoofing anomalies detected across sites.</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">
          All Clear
        </span>
      </div>
    );
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return "bg-rose-100 text-rose-800 border-rose-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "medium":
        return "bg-amber-100 text-amber-800 border-amber-300";
      default:
        return "bg-blue-100 text-blue-800 border-blue-300";
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "impossible_travel":
        return "⚡";
      case "collusion":
        return "👥";
      case "spoof_attack":
        return "🎭";
      case "time_anomaly":
        return "🌙";
      default:
        return "⚠️";
    }
  };

  const formatAlertType = (type: string) => {
    return type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  return (
    <div className="bg-white border border-rose-200 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🚨</span>
          <h3 className="font-bold text-gray-900 text-base">Active Fraud & Security Alerts</h3>
          <span className="bg-rose-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {alerts.length}
          </span>
        </div>
        <span className="text-xs text-gray-400">Real-time ML Anomaly Engine</span>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const emp = alert.employees;
          const empName = emp ? `${emp.first_name} ${emp.last_name}` : "Unknown Employee";

          return (
            <div
              key={alert.id}
              className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start space-x-3">
                <span className="text-2xl mt-0.5">{getAlertIcon(alert.alert_type)}</span>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-gray-900 text-sm">{formatAlertType(alert.alert_type)}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getSeverityBadge(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Employee: <span className="font-medium text-gray-800">{empName}</span> ({emp?.email || alert.employee_id})
                  </p>
                  {alert.details && (
                    <div className="text-[11px] text-gray-500 mt-1 font-mono bg-white px-2 py-1 rounded border border-gray-100 inline-block">
                      {alert.alert_type === "impossible_travel" && alert.details.travel && (
                        <span>Velocity: {alert.details.travel.speed_kmh} km/h over {alert.details.travel.distance_km} km</span>
                      )}
                      {alert.alert_type === "collusion" && (
                        <span>Pass-the-phone: multiple workers logged from device {alert.details.collusion?.device_fingerprint?.slice(0, 10)}...</span>
                      )}
                      {alert.alert_type === "spoof_attack" && (
                        <span>Anti-spoof score below threshold ({alert.details.trust_score}%)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2">
                <span className="text-xs text-gray-400">
                  {new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <button
                  onClick={() => setSelectedDispute({
                    id: alert.attendance_id,
                    checked_at: alert.created_at,
                    check_type: "check_in",
                    trust_score: alert.details?.trust_score ?? 35,
                    status: "flagged",
                    flag_reason: alert.details?.flag_reason || formatAlertType(alert.alert_type),
                    employees: alert.employees,
                    image_url: alert.details?.image_url,
                  })}
                  className="text-xs font-semibold px-2.5 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
                >
                  Inspect Snapshot 📸
                </button>
                <button
                  onClick={() => handleResolve(alert.id)}
                  disabled={resolvingId === alert.id}
                  className="text-xs font-semibold px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors shadow-2xs"
                >
                  {resolvingId === alert.id ? "Resolving..." : "Mark Resolved ✓"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <AuditDisputeModal
        record={selectedDispute}
        onClose={() => setSelectedDispute(null)}
      />
    </div>
  );
}
