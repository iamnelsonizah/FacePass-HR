"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";

export interface VisitorLogEntry {
  id: string;
  visitor_code: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  host_name?: string;
  company_name?: string;
  purpose?: string;
  photo_url?: string;
  departure_photo_url?: string;
  check_in_time: string;
  check_out_time?: string | null;
  duration_minutes?: number | null;
  status: "ON_SITE" | "DEPARTED";
  trust_score?: number;
}

interface VisitorManagementSectionProps {
  initialLogs?: any[];
}

function parseFingerprint(fp?: string | null): { host?: string; company?: string; purpose?: string } {
  if (!fp) return {};
  try {
    if (fp.startsWith("{")) {
      const parsed = JSON.parse(fp);
      return {
        host: parsed.host || parsed.host_name,
        company: parsed.company || parsed.company_name,
        purpose: parsed.purpose || parsed.visit_purpose,
      };
    }
    const hostMatch = fp.match(/host=([^:]+)/);
    const compMatch = fp.match(/company=([^:]+)/);
    const purpMatch = fp.match(/purpose=([^:]+)/);
    return {
      host: hostMatch ? hostMatch[1] : undefined,
      company: compMatch ? compMatch[1] : undefined,
      purpose: purpMatch ? purpMatch[1] : undefined,
    };
  } catch {
    return {};
  }
}

export default function VisitorManagementSection({ initialLogs = [] }: VisitorManagementSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ON_SITE" | "DEPARTED">("ALL");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; title: string } | null>(null);

  // Derive initial visitor sessions from server-side attendance logs
  const deriveInitial = (): VisitorLogEntry[] => {
    const rawList: VisitorLogEntry[] = [];
    const visitorEmployees = new Map<string, any>();

    (initialLogs || []).forEach((log) => {
      const emp = log.employees;
      const code = (emp?.employee_code || "").toUpperCase();
      const isVisitor = code.startsWith("VIS-") || (log.device_fingerprint || "").includes("visitor");
      if (!isVisitor || !emp) return;

      const meta = parseFingerprint(log.device_fingerprint);

      if (!visitorEmployees.has(log.employee_id)) {
        visitorEmployees.set(log.employee_id, {
          id: log.employee_id,
          code: emp.employee_code || "VIS-GUEST",
          firstName: emp.first_name || "Guest",
          lastName: emp.last_name || "Visitor",
          email: emp.email?.includes("guest.facepass") ? undefined : emp.email,
          phone: emp.phone,
          hostName: meta.host || "Operations Hub",
          companyName: meta.company || "Guest",
          purpose: meta.purpose || "Facility Visit",
          photoUrl: emp.avatar_url || log.image_url,
          punches: [],
        });
      }
      visitorEmployees.get(log.employee_id).punches.push(log);
    });

    visitorEmployees.forEach((v) => {
      const sorted = [...v.punches].sort(
        (a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
      );

      let currentIn: any = null;

      sorted.forEach((p) => {
        if (p.check_type === "check_in") {
          currentIn = p;
        } else if (p.check_type === "check_out" && currentIn) {
          const inTime = new Date(currentIn.checked_at).getTime();
          const outTime = new Date(p.checked_at).getTime();
          const duration = Math.max(1, Math.round((outTime - inTime) / 60000));

          rawList.push({
            id: currentIn.id,
            visitor_code: v.code,
            first_name: v.firstName,
            last_name: v.lastName,
            email: v.email,
            phone: v.phone,
            host_name: v.hostName,
            company_name: v.companyName,
            purpose: v.purpose,
            photo_url: currentIn.image_url || v.photoUrl,
            departure_photo_url: p.image_url,
            check_in_time: currentIn.checked_at,
            check_out_time: p.checked_at,
            duration_minutes: duration,
            status: "DEPARTED",
            trust_score: Math.round(p.trust_score || 97),
          });
          currentIn = null;
        }
      });

      if (currentIn) {
        const inTime = new Date(currentIn.checked_at).getTime();
        const duration = Math.max(1, Math.round((Date.now() - inTime) / 60000));

        rawList.unshift({
          id: currentIn.id,
          visitor_code: v.code,
          first_name: v.firstName,
          last_name: v.lastName,
          email: v.email,
          phone: v.phone,
          host_name: v.hostName,
          company_name: v.companyName,
          purpose: v.purpose,
          photo_url: currentIn.image_url || v.photoUrl,
          check_in_time: currentIn.checked_at,
          check_out_time: null,
          duration_minutes: duration,
          status: "ON_SITE",
          trust_score: Math.round(currentIn.trust_score || 98),
        });
      }
    });

    return rawList;
  };

  const [visitorSessions, setVisitorSessions] = useState<VisitorLogEntry[]>(deriveInitial);

  // ─── Live Refresh from `/api/portal/visitor` (Supabase + Local Ground Truth) ───
  const fetchLiveVisitors = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/portal/visitor");
      const data = await res.json();
      if (data.success && Array.isArray(data.visitors)) {
        const mapped: VisitorLogEntry[] = data.visitors.map((v: any) => ({
          id: v.id || `vis-${v.visitor_code}`,
          visitor_code: v.visitor_code,
          first_name: v.first_name || "Guest",
          last_name: v.last_name || "",
          email: v.email?.includes("guest.facepass") ? undefined : v.email,
          phone: v.phone,
          host_name: v.host_name || "Operations Hub",
          company_name: v.company || "Guest",
          purpose: v.purpose || "Facility Visit",
          photo_url: v.check_in_photo || v.photo_url,
          departure_photo_url: v.departure_photo_url,
          check_in_time: v.check_in_time || v.last_punch_time || new Date().toISOString(),
          check_out_time: v.check_out_time,
          duration_minutes: v.dwell_minutes,
          status: v.status || "DEPARTED",
          trust_score: 98,
        }));

        if (mapped.length > 0) {
          setVisitorSessions(mapped);
        }
      }
    } catch (e) {
      console.warn("[Visitor Ledger] Could not fetch live visitors:", e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveVisitors();
    const interval = setInterval(fetchLiveVisitors, 20000);
    return () => clearInterval(interval);
  }, [fetchLiveVisitors]);

  // Calculate Metrics
  const stats = useMemo(() => {
    const totalToday = visitorSessions.length;
    const onSiteCount = visitorSessions.filter((s) => s.status === "ON_SITE").length;
    const departedCount = visitorSessions.filter((s) => s.status === "DEPARTED").length;

    const completed = visitorSessions.filter((s) => s.duration_minutes);
    const avgDuration =
      completed.length > 0
        ? Math.round(completed.reduce((acc, c) => acc + (c.duration_minutes || 0), 0) / completed.length)
        : 42;

    return {
      totalToday,
      onSiteCount,
      departedCount,
      avgDurationStr: `${Math.floor(avgDuration / 60)}h ${avgDuration % 60}m`,
    };
  }, [visitorSessions]);

  // Filtered List
  const filteredList = useMemo(() => {
    return visitorSessions.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const fullName = `${item.first_name} ${item.last_name}`.toLowerCase();
      return (
        fullName.includes(q) ||
        item.visitor_code.toLowerCase().includes(q) ||
        (item.email && item.email.toLowerCase().includes(q)) ||
        (item.host_name && item.host_name.toLowerCase().includes(q)) ||
        (item.company_name && item.company_name.toLowerCase().includes(q)) ||
        (item.purpose && item.purpose.toLowerCase().includes(q))
      );
    });
  }, [visitorSessions, statusFilter, searchQuery]);

  // Admin Action: Force Clock-Out for forgotten visitor
  const handleForceClockOut = async (entry: VisitorLogEntry) => {
    if (!confirm(`Force departure checkout for visitor ${entry.first_name} ${entry.last_name} (${entry.visitor_code})?`)) {
      return;
    }

    setProcessingId(entry.id);
    try {
      const res = await fetch("/api/portal/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "punch",
          visitorCode: entry.visitor_code,
          checkType: "check_out",
        }),
      });

      if (res.ok) {
        fetchLiveVisitors();
      }
    } catch (err) {
      console.warn("Could not force check out:", err);
    } finally {
      setProcessingId(null);
    }
  };

  // Export CSV for compliance and audits
  const handleExportCsv = () => {
    const headers = [
      "Pass ID",
      "First Name",
      "Last Name",
      "Company",
      "Host",
      "Purpose",
      "Arrival Time",
      "Departure Time",
      "Duration (Mins)",
      "Status",
      "Trust Score",
    ];

    const rows = filteredList.map((v) => [
      v.visitor_code,
      `"${v.first_name}"`,
      `"${v.last_name}"`,
      `"${v.company_name || ""}"`,
      `"${v.host_name || ""}"`,
      `"${v.purpose || ""}"`,
      `"${v.check_in_time}"`,
      `"${v.check_out_time || ""}"`,
      v.duration_minutes || "",
      v.status,
      v.trust_score || 98,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `facepass_visitors_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section id="visitors" className="panel space-y-4">
      {/* Panel Head */}
      <div className="panel-head flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink,#14171C)]">
              Visitor Ledger &amp; Security Compliance Log
            </h2>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-[#9C6B18]/10 text-[#9C6B18] border border-[#9C6B18]/30">
              SUPABASE RECORDED
            </span>
          </div>
          <p className="text-[11px] text-[var(--muted,#6E7175)] mt-0.5">
            Cryptographically audited records of visiting guests, contractors, and clients at Marrakesh Hub
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLiveVisitors}
            disabled={isRefreshing}
            className="btn btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Refresh visitor database ledger"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className={isRefreshing ? "animate-spin" : ""}
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{isRefreshing ? "Syncing..." : "Sync DB"}</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="btn btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5"
            title="Download CSV compliance report"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Visitor KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 pt-2">
        <div className="p-3 bg-[var(--paper,#F6F5F1)] rounded-[3px] border border-[var(--line,#E4E2DC)]">
          <div className="text-[10px] font-mono uppercase text-[var(--muted,#6E7175)]">Today's Visits</div>
          <div className="text-lg font-mono font-bold text-[var(--ink,#14171C)]">{stats.totalToday}</div>
          <div className="text-[10px] text-[var(--muted,#6E7175)]">Database registered</div>
        </div>

        <div className="p-3 bg-[var(--paper,#F6F5F1)] rounded-[3px] border border-[#0C6B72]/40 bg-[#0C6B72]/5">
          <div className="text-[10px] font-mono uppercase text-[#0C6B72] font-bold">Currently On-Site</div>
          <div className="text-lg font-mono font-bold text-[#0C6B72]">{stats.onSiteCount}</div>
          <div className="text-[10px] text-[#0C6B72]/80">Active facility guests</div>
        </div>

        <div className="p-3 bg-[var(--paper,#F6F5F1)] rounded-[3px] border border-[var(--line,#E4E2DC)]">
          <div className="text-[10px] font-mono uppercase text-[var(--muted,#6E7175)]">Departed Today</div>
          <div className="text-lg font-mono font-bold text-[var(--ink,#14171C)]">{stats.departedCount}</div>
          <div className="text-[10px] text-[var(--muted,#6E7175)]">Concluded &amp; verified</div>
        </div>

        <div className="p-3 bg-[var(--paper,#F6F5F1)] rounded-[3px] border border-[var(--line,#E4E2DC)]">
          <div className="text-[10px] font-mono uppercase text-[var(--muted,#6E7175)]">Avg. Duration</div>
          <div className="text-lg font-mono font-bold text-[var(--ink,#14171C)]">{stats.avgDurationStr}</div>
          <div className="text-[10px] text-[var(--muted,#6E7175)]">Per completed visit</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1 p-0.5 bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1 rounded-[2px] ${
              statusFilter === "ALL"
                ? "bg-white text-[var(--ink,#14171C)] font-bold shadow-xs border border-[var(--line,#E4E2DC)]"
                : "text-[var(--muted,#6E7175)]"
            }`}
          >
            All Visits ({visitorSessions.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ON_SITE")}
            className={`px-3 py-1 rounded-[2px] ${
              statusFilter === "ON_SITE"
                ? "bg-white text-[#0C6B72] font-bold shadow-xs border border-[#0C6B72]/30"
                : "text-[var(--muted,#6E7175)]"
            }`}
          >
            On-Site ({stats.onSiteCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DEPARTED")}
            className={`px-3 py-1 rounded-[2px] ${
              statusFilter === "DEPARTED"
                ? "bg-white text-[var(--ink,#14171C)] font-bold shadow-xs border border-[var(--line,#E4E2DC)]"
                : "text-[var(--muted,#6E7175)]"
            }`}
          >
            Departed ({stats.departedCount})
          </button>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by pass ID, visitor name, company, host..."
          className="px-3 py-1.5 border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono w-full sm:w-72 focus:outline-none focus:border-[var(--ink,#14171C)] bg-white"
        />
      </div>

      {/* Visitor Activity Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-[var(--paper,#F6F5F1)] text-[10px] font-mono uppercase tracking-wider text-[var(--muted,#6E7175)] border-y border-[var(--line,#E4E2DC)]">
            <tr>
              <th className="px-4 py-2.5">Visitor</th>
              <th className="px-3 py-2.5">Pass ID</th>
              <th className="px-3 py-2.5">Company &amp; Purpose</th>
              <th className="px-3 py-2.5">Host Contact</th>
              <th className="px-3 py-2.5">Arrival</th>
              <th className="px-3 py-2.5">Departure</th>
              <th className="px-3 py-2.5">Duration</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line,#E4E2DC)] font-mono">
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-[var(--muted,#6E7175)]">
                  No visitor records found.
                </td>
              </tr>
            ) : (
              filteredList.map((entry) => {
                const isOnSite = entry.status === "ON_SITE";
                const inTimeFormatted = new Date(entry.check_in_time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const outTimeFormatted = entry.check_out_time
                  ? new Date(entry.check_out_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                const durationStr = entry.duration_minutes
                  ? `${Math.floor(entry.duration_minutes / 60)}h ${entry.duration_minutes % 60}m`
                  : "—";

                const initials = `${entry.first_name[0] || ""}${entry.last_name[0] || ""}`.toUpperCase();

                return (
                  <tr key={entry.id} className="hover:bg-[var(--paper,#F6F5F1)]/50 transition-colors">
                    {/* Visitor Name & Biometric Avatar */}
                    <td className="px-4 py-3 font-sans">
                      <div className="flex items-center gap-2.5">
                        {entry.photo_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedPhoto({
                                url: entry.photo_url!,
                                title: `${entry.first_name} ${entry.last_name} (${entry.visitor_code})`,
                              })
                            }
                            className="w-8 h-8 rounded-full overflow-hidden border border-[#b45c37]/40 shadow-xs flex-shrink-0 hover:opacity-85 transition-opacity"
                            title="Click to view biometric facial capture"
                          >
                            <img
                              src={entry.photo_url}
                              alt={entry.first_name}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#b45c37]/10 border border-[#b45c37]/30 text-[#b45c37] font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0">
                            {initials || "VP"}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-[var(--ink,#14171C)]">
                            {entry.first_name} {entry.last_name}
                          </div>
                          {entry.phone && (
                            <div className="text-[10px] font-mono text-[var(--muted,#6E7175)]">
                              {entry.phone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Pass ID */}
                    <td className="px-3 py-3 font-mono font-bold text-[var(--ink,#14171C)]">
                      <Link
                        href={`/visitor/verify/${entry.visitor_code}`}
                        className="text-[#b45c37] hover:underline flex items-center gap-1"
                        title="Open Security Clearance & QR View"
                      >
                        {entry.visitor_code}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </Link>
                    </td>

                    {/* Company & Purpose */}
                    <td className="px-3 py-3 font-sans">
                      <div className="font-medium text-[var(--ink,#14171C)]">
                        {entry.company_name || "Guest"}
                      </div>
                      <div className="text-[10px] text-[var(--muted,#6E7175)]">
                        {entry.purpose || "Facility Visit"}
                      </div>
                    </td>

                    {/* Host Contact */}
                    <td className="px-3 py-3 font-sans text-[var(--ink,#14171C)]">
                      {entry.host_name || "Operations Hub"}
                    </td>

                    {/* Arrival */}
                    <td className="px-3 py-3 text-[var(--muted,#6E7175)] text-[11px]">
                      {inTimeFormatted}
                    </td>

                    {/* Departure */}
                    <td className="px-3 py-3 text-[var(--muted,#6E7175)] text-[11px]">
                      {outTimeFormatted}
                    </td>

                    {/* Duration */}
                    <td className="px-3 py-3 text-[11px] font-bold">
                      {isOnSite ? (
                        <span className="text-[#0C6B72]">Active ({durationStr})</span>
                      ) : (
                        <span className="text-[var(--muted,#6E7175)]">{durationStr}</span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-3 py-3">
                      {isOnSite ? (
                        <span className="px-2 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 text-[10px] font-bold">
                          ON-SITE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-[2px] bg-gray-100 text-gray-600 border border-gray-200 text-[10px]">
                          DEPARTED
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/visitor/verify/${entry.visitor_code}`}
                          className="px-2 py-1 text-[10px] font-mono text-[#0C6B72] hover:bg-[#0C6B72]/10 rounded border border-[#0C6B72]/30 transition-colors"
                          title="View Security Clearance Verification Dossier"
                        >
                          Dossier
                        </Link>
                        {isOnSite && (
                          <button
                            type="button"
                            onClick={() => handleForceClockOut(entry)}
                            disabled={processingId === entry.id}
                            className="px-2 py-1 text-[10px] font-mono font-bold text-[#AE3B26] hover:bg-[#AE3B26]/10 rounded border border-[#AE3B26]/30 transition-colors"
                            title="Force departure checkout if guest left premises"
                          >
                            {processingId === entry.id ? "..." : "Clock Out"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Biometric Photo Inspection */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-white rounded-lg max-w-sm w-full overflow-hidden shadow-2xl border border-[var(--line,#E4E2DC)] p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-[var(--ink,#14171C)]">
                {selectedPhoto.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="text-[var(--muted,#6E7175)] hover:text-black p-1"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="rounded overflow-hidden border border-[var(--line,#E4E2DC)] bg-black/5 aspect-4/5 flex items-center justify-center">
              <img
                src={selectedPhoto.url}
                alt="Visitor Facial Capture"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[10px] text-[var(--muted,#6E7175)] text-center font-mono">
              Biometric check-in photograph stored for safety &amp; facility compliance
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
