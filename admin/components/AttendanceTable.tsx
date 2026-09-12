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
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedAuditLog, setSelectedAuditLog] = useState<AttendanceLog | null>(null);
  const itemsPerPage = 10;

  // Filter by status
  const filtered =
    statusFilter === "all"
      ? logs
      : logs.filter((log) => log.status === statusFilter);

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Attendance Logs
          </h2>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="flagged">Flagged</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Employee
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location & GPS
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Confidence
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Trust Score
              </th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Audit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                  No attendance logs found
                </td>
              </tr>
            ) : (
              paginated.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-gray-900 block">
                      {log.employees
                        ? `${log.employees.first_name} ${log.employees.last_name}`
                        : log.employee_id.slice(0, 8)}
                    </span>
                    {log.employees?.employee_code && (
                      <span className="text-xs text-gray-400 font-mono">
                        {log.employees.employee_code}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCheckTypeBadge(
                        log.check_type
                      )}`}
                    >
                      {log.check_type === "check_in" ? "Check In" : "Check Out"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm">
                    {new Date(log.checked_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">
                        📍 {log.sites?.name || "Marrakesh Hub"}
                      </span>
                      {log.latitude && log.longitude ? (
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              window.dispatchEvent(
                                new CustomEvent("focus-map-coord", {
                                  detail: { lat: log.latitude, lng: log.longitude, id: log.id },
                                })
                              );
                              const mapEl = document.getElementById("geofence-map-section");
                              if (mapEl) mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition-colors"
                            title="Highlight on Live Map"
                          >
                            🗺️ View on Map
                          </button>
                          <a
                            href={`https://maps.google.com/?q=${log.latitude},${log.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-gray-500 hover:text-blue-600 hover:underline"
                            title="Open in Google Maps"
                          >
                            {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)} ↗
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">GPS recorded</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm font-mono">
                    {formatConfidence(log.face_match_confidence)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`font-semibold text-sm ${
                        (log.trust_score ?? 0) >= 70
                          ? "text-green-600"
                          : (log.trust_score ?? 0) >= 50
                            ? "text-yellow-600"
                            : "text-red-600"
                      }`}
                    >
                      {formatTrustScore(log.trust_score)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(
                        log.status
                      )}`}
                      title={log.flag_reason || undefined}
                    >
                      {log.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedAuditLog(log)}
                      className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                    >
                      Inspect 📸
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(currentPage - 1) * itemsPerPage + 1}–
            {Math.min(currentPage * itemsPerPage, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
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
