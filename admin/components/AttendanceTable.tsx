"use client";

import { useState } from "react";
import AuditDisputeModal from "./AuditDisputeModal";

interface AttendanceLog {
  id: string;
  employee_id: string;
  check_type: string;
  checked_at: string;
  face_match_confidence: number | null;
  trust_score: number | null;
  status: string;
  flag_reason: string | null;
  image_url?: string;
  latitude?: number;
  longitude?: number;
  geofence_distance_meters?: number;
  device_fingerprint?: string;
  session_match_score?: number | null;
  matched_check_in_id?: string | null;
  employees?: {
    first_name: string;
    last_name: string;
    email: string;
    employee_code?: string;
    avatar_url?: string;
  };
  sites?: {
    name: string;
  };
}

interface AttendanceTableProps {
  logs: AttendanceLog[];
}

/**
 * Filterable, paginated attendance logs table.
 */
export default function AttendanceTable({ logs }: AttendanceTableProps) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [userTypeFilter, setUserTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AttendanceLog | null>(null);
  const itemsPerPage = 10;

  // Filter by status & user type (Staff vs Visitor)
  const filtered = logs.filter((log) => {
    const isVisitor = Boolean(
      (log.employees?.employee_code || "").toUpperCase().startsWith("VIS-") ||
      (log.device_fingerprint || "").includes("visitor")
    );
    if (userTypeFilter === "staff" && isVisitor) return false;
    if (userTypeFilter === "visitor" && !isVisitor) return false;
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    return true;
  });

  // Paginate
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      verified: "bg-green-100 text-green-800",
      flagged: "bg-yellow-100 text-yellow-800",
      rejected: "bg-red-100 text-red-800",
      manual_override: "bg-blue-100 text-blue-800",
    };
    return styles[status] || "bg-gray-100 text-gray-800";
  };

  const getCheckTypeBadge = (checkType: string) => {
    return checkType === "check_in"
      ? "bg-blue-100 text-blue-800"
      : "bg-orange-100 text-orange-800";
  };

  const formatConfidence = (value: number | null) => {
    if (value === null) return "—";
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatTrustScore = (value: number | null) => {
    if (value === null) return "—";
    return value.toFixed(0);
  };

  return (
    <div id="logs" className="panel">
      {/* Toolbar */}
      <div className="toolbar flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="panel-title">
          <div>
            <h2>Attendance logs</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={userTypeFilter}
            onChange={(e) => {
              setUserTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="select text-xs font-mono"
            title="Filter by Role"
          >
            <option value="all">All Roles (Staff &amp; Visitors)</option>
            <option value="staff">Staff Only (Employees)</option>
            <option value="visitor">Visitors Only (Guests)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="select text-xs font-mono"
            title="Filter by Status"
          >
            <option value="all">All status</option>
            <option value="verified">Verified</option>
            <option value="flagged">Flagged</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Person &amp; Role</th>
              <th>Type</th>
              <th>Time</th>
              <th>Location &amp; GPS</th>
              <th>Confidence</th>
              <th>Trust</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Audit</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "var(--text-faint)" }}>
                  No attendance logs found for this filter.
                </td>
              </tr>
            ) : (
              paginated.map((log) => {
                const emp = log.employees;
                const empName = emp ? `${emp.first_name} ${emp.last_name}` : log.employee_id.slice(0, 8);
                const empCode = emp?.employee_code || "—";
                const isCheckIn = log.check_type === "check_in";
                const trustVal = log.trust_score ?? 95;
                const coordsText =
                  log.latitude && log.longitude
                    ? `${log.latitude.toFixed(4)}, ${log.longitude.toFixed(4)}`
                    : "31.6393, -8.0096";

                const isVisitor = Boolean(
                  empCode.toUpperCase().startsWith("VIS-") ||
                  (log.device_fingerprint || "").includes("visitor")
                );

                return (
                  <tr key={log.id}>
                    {/* Person & Role */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="cell-name">{empName}</span>
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] uppercase ${
                            isVisitor
                              ? "bg-[#9C6B18]/10 text-[#9C6B18] border border-[#9C6B18]/30"
                              : "bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30"
                          }`}
                        >
                          {isVisitor ? "VISITOR" : "STAFF"}
                        </span>
                      </div>
                      <div className="cell-sub font-mono">{empCode}</div>
                    </td>

                    {/* Type */}
                    <td>
                      <span
                        className="pill"
                        style={{
                          background: isCheckIn ? "#E7EEF6" : "var(--amber-soft)",
                          color: isCheckIn ? "#2C5A8C" : "var(--amber)",
                        }}
                      >
                        {isCheckIn ? "Check in" : "Check out"}
                      </span>
                    </td>

                    {/* Time */}
                    <td className="mono" style={{ color: "var(--text)" }}>
                      {new Date(log.checked_at).toLocaleString([], {
                        month: "numeric",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>

                    {/* Location & GPS */}
                    <td>
                      <div>{log.sites?.name || "Marrakesh Hub"}</div>
                      <div className="cell-mono-sub">
                        {coordsText} &nbsp;·&nbsp;{" "}
                        <a
                          href="#geofence"
                          onClick={(e) => {
                            e.preventDefault();
                            const mapEl = document.getElementById("geofence");
                            if (mapEl) mapEl.scrollIntoView({ behavior: "smooth" });
                          }}
                          className="cell-link"
                        >
                          view on map{" "}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M7 17 17 7M9 7h8v8"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </a>
                      </div>
                    </td>

                    {/* Confidence */}
                    <td className="mono">{formatConfidence(log.face_match_confidence)}</td>

                    {/* Trust */}
                    <td>
                      <span
                        className={`trust ${
                          trustVal >= 90 ? "high" : trustVal >= 70 ? "mid" : "low"
                        }`}
                      >
                        {formatTrustScore(log.trust_score)}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      <span
                        className={`pill ${
                          log.status === "verified"
                            ? "pill-verified"
                            : log.status === "flagged"
                            ? "pill-flagged"
                            : "pill-moderate"
                        }`}
                        title={log.flag_reason || undefined}
                      >
                        {log.status === "verified"
                          ? "Verified"
                          : log.status === "flagged"
                          ? "Flagged"
                          : log.status}
                      </span>
                    </td>

                    {/* Audit */}
                    <td style={{ textAlign: "right" }}>
                      <button
                        onClick={() => setSelectedAuditLog(log)}
                        className="btn btn-outline btn-sm"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-[var(--line)] flex items-center justify-between text-xs text-[var(--text-mute)]">
          <p>
            Showing {(currentPage - 1) * itemsPerPage + 1}–
            {Math.min(currentPage * itemsPerPage, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn btn-outline btn-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn btn-outline btn-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Audit Dispute Modal */}
      {selectedAuditLog && (
        <AuditDisputeModal
          record={selectedAuditLog}
          allLogs={logs}
          onClose={() => setSelectedAuditLog(null)}
        />
      )}
    </div>
  );
}
