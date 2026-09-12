"use client";

import React, { useState } from "react";
import { PortalUser } from "./portalAuth";

export interface AttendanceSession {
  id: string;
  date: string;
  date_raw: string;
  entry_time: string;
  entry_timestamp: string;
  exit_time: string | null;
  exit_timestamp: string | null;
  duration_str: string;
  duration_minutes: number;
  trust_score: number;
  status: string;
  site_name: string;
  latitude?: number;
  longitude?: number;
  is_visitor?: boolean;
  visitor_code?: string;
}

export interface PersonalPunch {
  id: string;
  checked_at: string;
  check_type: string;
  trust_score: number | null;
  status: string;
  latitude?: number;
  longitude?: number;
  geofence_distance_meters?: number;
  image_url?: string;
  sites?: {
    name: string;
  };
}

interface PersonalTimecardProps {
  user: PortalUser;
  sessions: AttendanceSession[];
  punches: PersonalPunch[];
  loading: boolean;
  stats?: {
    totalHours: string;
    punctualityRate: number;
    overtimeHours: string;
    biometricIntegrity: string;
  };
}

export default function PersonalTimecard({
  user,
  sessions,
  punches,
  loading,
  stats,
}: PersonalTimecardProps) {
  const [viewMode, setViewMode] = useState<"sessions" | "raw">("sessions");

  const isVisitor = Boolean(
    (user.employee_code || "").toUpperCase().startsWith("VIS-")
  );

  return (
    <div className="space-y-4">
      {/* 4-Stat Metric Strip */}
      <div className="kpi-strip">
        <div className="stat-block">
          <div className="stat-label">{isVisitor ? "Total Time On-Site" : "Hours Logged (Week)"}</div>
          <div className="stat-value">{stats?.totalHours || "0.0 hrs"}</div>
          <div className="stat-sub text-[var(--teal)]">
            {isVisitor ? "Authorized Visitor Time" : "Regular Shift Time"}
          </div>
        </div>

        <div className="stat-block">
          <div className="stat-label">Punctuality Score</div>
          <div className="stat-value text-[var(--teal)]">{stats?.punctualityRate ?? 100}%</div>
          <div className="stat-sub">{isVisitor ? "On-Time Arrival" : "Arrival Compliance"}</div>
        </div>

        <div className="stat-block">
          <div className="stat-label">{isVisitor ? "Visits Recorded" : "Overtime Logged"}</div>
          <div className="stat-value">{isVisitor ? `${sessions.length}` : stats?.overtimeHours || "0.0h"}</div>
          <div className="stat-sub">{isVisitor ? "Facility Check-ins" : "Above 8.0h threshold"}</div>
        </div>

        <div className="stat-block">
          <div className="stat-label">Biometric Integrity</div>
          <div className="stat-value text-[var(--teal)]">{stats?.biometricIntegrity || "98.2%"}</div>
          <div className="stat-sub">Composite Trust Index</div>
        </div>
      </div>

      {/* Timecard Panel */}
      <div className="panel">
        <div className="panel-head flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-[var(--ink,#14171C)] uppercase tracking-wider">
                {isVisitor ? "Visitor Pass Timecard & History" : "Personal Attendance History"}
              </h3>
              <span
                className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] uppercase ${
                  isVisitor
                    ? "bg-[#9C6B18]/10 text-[#9C6B18] border border-[#9C6B18]/30"
                    : "bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30"
                }`}
              >
                {isVisitor ? "VISITOR PASS" : "EMPLOYEE"}
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted,#6E7175)]">
              {isVisitor
                ? `Guest log for ${user.first_name || "Visitor"} (Pass ID: ${user.employee_code || "VIS-GUEST"})`
                : `Verified biometric timecard for ${user.first_name || "Employee"} (ID: ${user.employee_code || "FP-STAFF"})`}
            </p>
          </div>

          {/* Table Tab Selector */}
          <div className="flex items-center gap-1 p-0.5 bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setViewMode("sessions")}
              className={`px-2.5 py-1 rounded-[2px] transition-all ${
                viewMode === "sessions"
                  ? "bg-white text-[var(--ink,#14171C)] font-bold shadow-xs"
                  : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
              }`}
            >
              Entry / Exit Sessions ({sessions.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`px-2.5 py-1 rounded-[2px] transition-all ${
                viewMode === "raw"
                  ? "bg-white text-[var(--ink,#14171C)] font-bold shadow-xs"
                  : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
              }`}
            >
              Raw Logs ({punches.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-14 text-center text-xs text-[var(--muted,#6E7175)] font-mono flex items-center justify-center gap-2">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Synchronizing personal timecard with cloud ledger...</span>
          </div>
        ) : viewMode === "sessions" ? (
          /* PAIRED SESSIONS: Entry / Exit / Duration */
          sessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--muted,#6E7175)] space-y-1">
              <p className="font-semibold text-[var(--ink,#14171C)]">No shift sessions logged yet</p>
              <p className="text-[11px]">Position your face in the Biometric Punch Station to record your arrival.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--line,#E4E2DC)] text-[10px] text-[var(--muted,#6E7175)] uppercase tracking-wider bg-[var(--paper,#F6F5F1)] font-mono">
                    <th className="py-2.5 px-4 text-left">Date</th>
                    <th className="py-2.5 px-3 text-left">Clock In (Entry)</th>
                    <th className="py-2.5 px-3 text-left">Clock Out (Exit)</th>
                    <th className="py-2.5 px-3 text-left">Duration</th>
                    <th className="py-2.5 px-3 text-left">Facility Hub</th>
                    <th className="py-2.5 px-3 text-left">Trust Score</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line,#E4E2DC)]">
                  {sessions.map((sess) => {
                    const isActive = !sess.exit_time;
                    return (
                      <tr key={sess.id} className="hover:bg-[var(--paper,#F6F5F1)] transition-colors">
                        {/* Date */}
                        <td className="py-2.5 px-4 font-mono text-[11px] text-[var(--ink,#14171C)] whitespace-nowrap">
                          <span className="font-bold">{sess.date}</span>
                        </td>

                        {/* Clock In */}
                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0C6B72]" />
                            <span className="font-semibold text-[var(--ink,#14171C)]">{sess.entry_time}</span>
                          </div>
                        </td>

                        {/* Clock Out */}
                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          {isActive ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 uppercase animate-pulse">
                              Active Shift
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#9C6B18]" />
                              <span className="font-semibold text-[var(--ink,#14171C)]">{sess.exit_time}</span>
                            </div>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="py-2.5 px-3 font-mono text-[11px] font-bold whitespace-nowrap">
                          <span className={isActive ? "text-[#0C6B72]" : "text-[var(--ink,#14171C)]"}>
                            {sess.duration_str}
                          </span>
                        </td>

                        {/* Site */}
                        <td className="py-2.5 px-3 text-[11px] text-[var(--muted,#6E7175)] whitespace-nowrap">
                          {sess.site_name}
                        </td>

                        {/* Trust Score */}
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          <span
                            className={`font-semibold ${
                              sess.trust_score >= 80
                                ? "text-[#0C6B72]"
                                : sess.trust_score >= 50
                                ? "text-[#9C6B18]"
                                : "text-[#AE3B26]"
                            }`}
                          >
                            {sess.trust_score}%
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-[2px] ${
                              sess.status === "verified"
                                ? "bg-[#0C6B72]/10 text-[#0C6B72]"
                                : "bg-[#AE3B26]/10 text-[#AE3B26]"
                            }`}
                          >
                            {sess.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* RAW BIOMETRIC LOGS */
          punches.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--muted,#6E7175)]">
              No raw punch logs recorded yet today.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--line,#E4E2DC)] text-[10px] text-[var(--muted,#6E7175)] uppercase tracking-wider bg-[var(--paper,#F6F5F1)] font-mono">
                    <th className="py-2.5 px-4 text-left">Timestamp</th>
                    <th className="py-2.5 px-3 text-left">Action</th>
                    <th className="py-2.5 px-3 text-left">Trust Score</th>
                    <th className="py-2.5 px-3 text-left">Proximity</th>
                    <th className="py-2.5 px-3 text-left">Coordinates</th>
                    <th className="py-2.5 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line,#E4E2DC)]">
                  {punches.map((p) => {
                    const isCheckIn = p.check_type === "check_in";
                    const trust = p.trust_score ?? 95;
                    const dateObj = new Date(p.checked_at);
                    const dateStr = dateObj.toLocaleDateString([], { month: "short", day: "numeric" });
                    const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                    return (
                      <tr key={p.id} className="hover:bg-[var(--paper,#F6F5F1)] transition-colors">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-[var(--ink,#14171C)] whitespace-nowrap">
                          <span className="font-semibold">{timeStr}</span>{" "}
                          <span className="text-[var(--muted,#6E7175)] text-[10px]">{dateStr}</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-[2px] uppercase ${
                              isCheckIn
                                ? "bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30"
                                : "bg-[#9C6B18]/10 text-[#9C6B18] border border-[#9C6B18]/30"
                            }`}
                          >
                            {isCheckIn ? "CLOCK IN" : "CLOCK OUT"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          <span
                            className={`font-semibold ${
                              trust >= 80 ? "text-[#0C6B72]" : trust >= 50 ? "text-[#9C6B18]" : "text-[#AE3B26]"
                            }`}
                          >
                            {trust.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-[var(--muted,#6E7175)] whitespace-nowrap">
                          {p.geofence_distance_meters != null
                            ? `${Math.round(p.geofence_distance_meters)}m from center`
                            : p.sites?.name || "Marrakesh Hub"}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-[var(--muted,#6E7175)] whitespace-nowrap">
                          {p.latitude && p.longitude
                            ? `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`
                            : "31.639, -8.009"}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-[2px] ${
                              p.status === "verified"
                                ? "bg-[#0C6B72]/10 text-[#0C6B72]"
                                : "bg-[#AE3B26]/10 text-[#AE3B26]"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
