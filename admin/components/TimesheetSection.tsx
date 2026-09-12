"use client";

import React, { useState, useMemo } from "react";
import SendDigestModal from "./SendDigestModal";

export interface TimesheetShift {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  email: string;
  date: string;
  site_name: string;
  check_in_time: string | null;
  check_out_time: string | null;
  duration_hours: number;
  regular_hours: number;
  overtime_hours: number;
  formatted_duration: string;
  shift_status: "completed" | "in_progress" | "missing_checkout" | "missing_checkin" | string;
  arrival_status: "on_time" | "late" | string;
  minutes_late: number;
  trust_score: number;
}

export interface PayrollSummaryItem {
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  email: string;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_hours: number;
  days_worked: number;
  completed_shifts: number;
  punctuality_pct: number;
}

interface TimesheetSectionProps {
  logs: any[];
}

export default function TimesheetSection({ logs }: TimesheetSectionProps) {
  const [viewMode, setViewMode] = useState<"shifts" | "payroll">("shifts");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isDigestModalOpen, setIsDigestModalOpen] = useState(false);

  // Compute paired timesheets and payroll directly from logs
  const { timesheets, payrollSummary, metrics } = useMemo(() => {
    const dailyGroups: Record<string, any[]> = {};

    logs.forEach((log) => {
      const empId = log.employee_id;
      const dt = log.checked_at;
      if (!empId || !dt) return;
      const dateKey = dt.slice(0, 10);
      const groupKey = `${empId}_${dateKey}`;
      if (!dailyGroups[groupKey]) dailyGroups[groupKey] = [];
      dailyGroups[groupKey].push(log);
    });

    const calculatedShifts: TimesheetShift[] = [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    let totalHoursSum = 0;
    let totalOvertimeSum = 0;
    let onTimeCount = 0;
    let activeOnSiteCount = 0;
    let completedOrActiveCount = 0;

    Object.entries(dailyGroups).forEach(([key, dayLogs]) => {
      dayLogs.sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime());

      const checkIns = dayLogs.filter((l) => l.check_type === "check_in");
      const checkOuts = dayLogs.filter((l) => l.check_type === "check_out");

      const firstIn = checkIns[0] || null;
      const lastOut = checkOuts[checkOuts.length - 1] || null;

      const sample = dayLogs[0];
      const emp = sample.employees || {};
      const site = sample.sites || {};
      const empId = sample.employee_id;
      const dateKey = sample.checked_at.slice(0, 10);

      const checkInTime = firstIn ? firstIn.checked_at : null;
      const checkOutTime = lastOut ? lastOut.checked_at : null;

      let durationHours = 0;
      let formattedDuration = "0h 0m";
      let shiftStatus: TimesheetShift["shift_status"] = "missing_checkin";
      let arrivalStatus: TimesheetShift["arrival_status"] = "on_time";
      let minutesLate = 0;
      let overtimeHours = 0;
      let regularHours = 0;

      if (firstIn && lastOut) {
        const tIn = new Date(checkInTime!).getTime();
        const tOut = new Date(checkOutTime!).getTime();
        const diffSec = Math.max(0, (tOut - tIn) / 1000);
        durationHours = Number((diffSec / 3600).toFixed(2));
        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        formattedDuration = `${h}h ${m}m`;
        shiftStatus = "completed";
      } else if (firstIn && !lastOut) {
        if (dateKey === todayStr) {
          const tIn = new Date(checkInTime!).getTime();
          const diffSec = Math.max(0, (now.getTime() - tIn) / 1000);
          durationHours = Number((diffSec / 3600).toFixed(2));
          const h = Math.floor(diffSec / 3600);
          const m = Math.floor((diffSec % 3600) / 60);
          formattedDuration = `${h}h ${m}m (active)`;
          shiftStatus = "in_progress";
          activeOnSiteCount += 1;
        } else {
          shiftStatus = "missing_checkout";
        }
      }

      // Punctuality: Target 09:00 with 15m grace period
      if (firstIn && checkInTime) {
        const inDate = new Date(checkInTime);
        const inMins = inDate.getUTCHours() * 60 + inDate.getUTCMinutes();
        const targetMins = 9 * 60;
        const graceMins = 9 * 60 + 15;
        if (inMins > graceMins) {
          arrivalStatus = "late";
          minutesLate = inMins - targetMins;
        } else {
          arrivalStatus = "on_time";
          onTimeCount += 1;
        }
      }

      // Overtime > 8.0 hours
      if (durationHours > 8.0) {
        overtimeHours = Number((durationHours - 8.0).toFixed(2));
        regularHours = 8.0;
      } else {
        overtimeHours = 0;
        regularHours = durationHours;
      }

      if (shiftStatus === "completed" || shiftStatus === "in_progress") {
        totalHoursSum += durationHours;
        totalOvertimeSum += overtimeHours;
        completedOrActiveCount += 1;
      }

      const avgTrust =
        dayLogs.reduce((acc, curr) => acc + (curr.trust_score || 95), 0) / dayLogs.length;

      calculatedShifts.push({
        id: key,
        employee_id: empId,
        employee_name: `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || "Employee",
        employee_code: emp.employee_code || "FP-ID",
        email: emp.email || "",
        date: dateKey,
        site_name: site.name || "Marrakesh Hub",
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        duration_hours: durationHours,
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        formatted_duration: formattedDuration,
        shift_status: shiftStatus,
        arrival_status: arrivalStatus,
        minutes_late: minutesLate,
        trust_score: Math.round(avgTrust),
      });
    });

    calculatedShifts.sort((a, b) => (b.date + (b.check_in_time || "")).localeCompare(a.date + (a.check_in_time || "")));

    // Payroll summary aggregation
    const pMap: Record<string, any> = {};
    calculatedShifts.forEach((s) => {
      if (!pMap[s.employee_id]) {
        pMap[s.employee_id] = {
          employee_id: s.employee_id,
          employee_name: s.employee_name,
          employee_code: s.employee_code,
          email: s.email,
          total_regular_hours: 0,
          total_overtime_hours: 0,
          total_hours: 0,
          days_worked: new Set<string>(),
          completed_shifts: 0,
          on_time_shifts: 0,
        };
      }
      const entry = pMap[s.employee_id];
      entry.total_regular_hours += s.regular_hours;
      entry.total_overtime_hours += s.overtime_hours;
      entry.total_hours += s.duration_hours;
      entry.days_worked.add(s.date);
      if (s.shift_status === "completed") entry.completed_shifts += 1;
      if (s.arrival_status === "on_time") entry.on_time_shifts += 1;
    });

    const pSummary: PayrollSummaryItem[] = Object.values(pMap).map((p) => {
      const daysCount = p.days_worked.size;
      return {
        employee_id: p.employee_id,
        employee_name: p.employee_name,
        employee_code: p.employee_code,
        email: p.email,
        total_regular_hours: Number(p.total_regular_hours.toFixed(2)),
        total_overtime_hours: Number(p.total_overtime_hours.toFixed(2)),
        total_hours: Number(p.total_hours.toFixed(2)),
        days_worked: daysCount,
        completed_shifts: p.completed_shifts,
        punctuality_pct: daysCount > 0 ? Math.round((p.on_time_shifts / daysCount) * 100) : 100,
      };
    });

    return {
      timesheets: calculatedShifts,
      payrollSummary: pSummary,
      metrics: {
        total_hours: Number(totalHoursSum.toFixed(1)),
        total_overtime: Number(totalOvertimeSum.toFixed(1)),
        avg_shift:
          completedOrActiveCount > 0
            ? Number((totalHoursSum / completedOrActiveCount).toFixed(1))
            : 0,
        on_time_rate:
          completedOrActiveCount > 0
            ? Math.round((onTimeCount / completedOrActiveCount) * 100)
            : 100,
        currently_on_site: activeOnSiteCount,
      },
    };
  }, [logs]);

  // Filtered shifts
  const filteredShifts = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const oneWeekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const oneMonthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    return timesheets.filter((s) => {
      // Date filter
      if (dateFilter === "today" && s.date !== todayStr) return false;
      if (dateFilter === "week" && s.date < oneWeekAgo) return false;
      if (dateFilter === "month" && s.date < oneMonthAgo) return false;

      // Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchName = s.employee_name.toLowerCase().includes(term);
        const matchCode = (s.employee_code || "").toLowerCase().includes(term);
        const matchEmail = s.email.toLowerCase().includes(term);
        if (!matchName && !matchCode && !matchEmail) return false;
      }
      return true;
    });
  }, [timesheets, dateFilter, searchTerm]);

  // Filtered payroll
  const filteredPayroll = useMemo(() => {
    if (!searchTerm.trim()) return payrollSummary;
    const term = searchTerm.toLowerCase();
    return payrollSummary.filter((p) => {
      return (
        p.employee_name.toLowerCase().includes(term) ||
        (p.employee_code || "").toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term)
      );
    });
  }, [payrollSummary, searchTerm]);

  // Direct CSV Downloader
  const downloadCSV = (mode: "detailed" | "payroll") => {
    setDownloading(mode);
    try {
      let csvContent = "";
      let filename = "";

      if (mode === "payroll") {
        const headers = [
          "Employee Code",
          "Employee Name",
          "Email",
          "Regular Hours",
          "Overtime Hours",
          "Total Hours Worked",
          "Days Worked",
          "Completed Shifts",
          "Punctuality %",
        ];
        const rows = filteredPayroll.map((p) => [
          `"${p.employee_code || ""}"`,
          `"${p.employee_name}"`,
          `"${p.email}"`,
          p.total_regular_hours,
          p.total_overtime_hours,
          p.total_hours,
          p.days_worked,
          p.completed_shifts,
          `"${p.punctuality_pct}%"`,
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        filename = `facepass_payroll_report_${new Date().toISOString().slice(0, 10)}.csv`;
      } else {
        const headers = [
          "Date",
          "Employee Code",
          "Employee Name",
          "Email",
          "Site Facility",
          "Check-In",
          "Check-Out",
          "Duration (Hrs)",
          "Duration (Text)",
          "Regular Hours",
          "Overtime Hours",
          "Arrival Status",
          "Minutes Late",
          "Shift Status",
          "Trust Score",
        ];
        const rows = filteredShifts.map((s) => [
          `"${s.date}"`,
          `"${s.employee_code || ""}"`,
          `"${s.employee_name}"`,
          `"${s.email}"`,
          `"${s.site_name}"`,
          `"${s.check_in_time ? new Date(s.check_in_time).toLocaleTimeString() : ""}"`,
          `"${s.check_out_time ? new Date(s.check_out_time).toLocaleTimeString() : ""}"`,
          s.duration_hours,
          `"${s.formatted_duration}"`,
          s.regular_hours,
          s.overtime_hours,
          `"${s.arrival_status}"`,
          s.minutes_late,
          `"${s.shift_status}"`,
          `"${s.trust_score}%"`,
        ]);
        csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        filename = `facepass_daily_timesheet_${new Date().toISOString().slice(0, 10)}.csv`;
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export report.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div id="timesheets" className="panel">
      {/* Panel Head */}
      <div className="panel-head">
        <div className="panel-title">
          <div>
            <h2>Automated timesheets &amp; payroll hours</h2>
            <p>Paired morning punch-ins, evening check-outs, shift durations and overtime</p>
          </div>
        </div>
        <div className="tabs">
          <button
            className={viewMode === "shifts" ? "active" : ""}
            onClick={() => setViewMode("shifts")}
          >
            Daily shifts
          </button>
          <button
            className={viewMode === "payroll" ? "active" : ""}
            onClick={() => setViewMode("payroll")}
          >
            Payroll summary
          </button>
        </div>
      </div>

      {/* Stat Row */}
      <div className="stat-row flex-wrap sm:flex-nowrap">
        <div className="stat-block">
          <div className="stat-block-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Total hours worked
          </div>
          <div className="stat-block-value">
            {metrics.total_hours} <small>hrs</small>
          </div>
        </div>

        <div className="stat-block">
          <div className="stat-block-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            On-time punctuality
          </div>
          <div
            className="stat-block-value"
            style={{ color: metrics.on_time_rate >= 80 ? "var(--teal)" : "var(--amber)" }}
          >
            {metrics.on_time_rate}%
          </div>
        </div>

        <div className="stat-block">
          <div className="stat-block-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            Overtime logged
          </div>
          <div className="stat-block-value">
            {metrics.total_overtime} <small>hrs</small>
          </div>
        </div>

        <div className="stat-block">
          <div className="stat-block-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            Average shift length
          </div>
          <div className="stat-block-value">
            {metrics.avg_shift} <small>hrs</small>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="tabs">
          {(["all", "today", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setDateFilter(mode)}
              className={dateFilter === mode ? "active capitalize" : "capitalize"}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="search" style={{ width: "200px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Employee or code…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="btn-group">
            <button
              onClick={() => downloadCSV("detailed")}
              disabled={downloading !== null}
              className="btn btn-outline btn-sm"
              title="Download Paired Daily Shifts CSV"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v11m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Shifts CSV
            </button>

            <button
              onClick={() => downloadCSV("payroll")}
              disabled={downloading !== null}
              className="btn btn-outline btn-sm"
              title="Download Payroll Summary CSV"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 4v11m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Payroll CSV
            </button>

            <button
              onClick={() => setIsDigestModalOpen(true)}
              className="btn btn-dark btn-sm"
              title="Generate and Send HR Attendance Digest"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M4 6h16v12H4z" stroke="#fff" strokeWidth="1.5" />
                <path d="M4 7l8 6 8-6" stroke="#fff" strokeWidth="1.5" />
              </svg>
              Send HR digest
            </button>
          </div>
        </div>
      </div>

      {/* View 1: Daily Shifts Table */}
      {viewMode === "shifts" ? (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Duration</th>
                <th>Overtime</th>
                <th>Punctuality</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "var(--text-faint)" }}>
                    No shift activity recorded for this period.
                  </td>
                </tr>
              ) : (
                filteredShifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>
                      <div className="cell-name">{shift.employee_name}</div>
                      <div className="cell-sub">{shift.employee_code || "—"}</div>
                    </td>
                    <td className="mono" style={{ color: "var(--text-mute)" }}>
                      {shift.date}
                    </td>
                    <td className="mono">
                      {shift.check_in_time
                        ? new Date(shift.check_in_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="mono">
                      {shift.check_out_time
                        ? new Date(shift.check_out_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "In progress"}
                    </td>
                    <td className="mono">{shift.formatted_duration}</td>
                    <td className="mono" style={{ color: shift.overtime_hours > 0 ? "var(--amber)" : "var(--text-faint)" }}>
                      {shift.overtime_hours > 0 ? `+${shift.overtime_hours}h` : "—"}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          shift.arrival_status === "on_time" ? "pill-verified" : "pill-flagged"
                        }`}
                      >
                        {shift.arrival_status === "on_time"
                          ? "On time"
                          : `Late +${shift.minutes_late}m`}
                      </span>
                    </td>
                    <td>
                      <span
                        className="pill"
                        style={{
                          background:
                            shift.shift_status === "completed"
                              ? "#EFEEE9"
                              : shift.shift_status === "in_progress"
                              ? "var(--teal-soft)"
                              : "var(--red-soft)",
                          color:
                            shift.shift_status === "completed"
                              ? "var(--text-mute)"
                              : shift.shift_status === "in_progress"
                              ? "var(--teal)"
                              : "var(--red)",
                        }}
                      >
                        {shift.shift_status === "completed"
                          ? "Completed"
                          : shift.shift_status === "in_progress"
                          ? "Active"
                          : "Missing Punch"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* View 2: Payroll Summary Table */
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Days worked</th>
                <th>Completed shifts</th>
                <th>Regular hours</th>
                <th>Overtime</th>
                <th>Total payable</th>
                <th>Punctuality</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayroll.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-faint)" }}>
                    No payroll records found.
                  </td>
                </tr>
              ) : (
                filteredPayroll.map((pay) => (
                  <tr key={pay.employee_id}>
                    <td>
                      <div className="cell-name">{pay.employee_name}</div>
                      <div className="cell-sub">{pay.employee_code || "—"}</div>
                    </td>
                    <td className="mono">{pay.days_worked}</td>
                    <td className="mono">{pay.completed_shifts}</td>
                    <td className="mono">{pay.total_regular_hours}h</td>
                    <td className="mono" style={{ color: pay.total_overtime_hours > 0 ? "var(--amber)" : "var(--text-faint)" }}>
                      {pay.total_overtime_hours > 0 ? `+${pay.total_overtime_hours}h` : "0.0h"}
                    </td>
                    <td className="mono" style={{ fontWeight: 700, color: "var(--text)" }}>
                      {pay.total_hours} hrs
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          pay.punctuality_pct >= 90
                            ? "pill-verified"
                            : pay.punctuality_pct >= 70
                            ? "pill-moderate"
                            : "pill-flagged"
                        }`}
                      >
                        {pay.punctuality_pct}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* HR Digest Modal */}
      <SendDigestModal
        isOpen={isDigestModalOpen}
        onClose={() => setIsDigestModalOpen(false)}
      />
    </div>
  );
}
