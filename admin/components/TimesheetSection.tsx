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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-50/70 to-blue-50/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⏱️</span>
            <h3 className="text-lg font-bold text-gray-900">
              Automated Timesheets & Payroll Hours
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
              Real-Time Engine
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Paired morning punch-ins, evening check-outs, shift durations, overtime, and punctuality
          </p>
        </div>

        {/* View Toggle & Export Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 border border-gray-200 text-xs">
            <button
              onClick={() => setViewMode("shifts")}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                viewMode === "shifts"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              📅 Daily Shifts
            </button>
            <button
              onClick={() => setViewMode("payroll")}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                viewMode === "payroll"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              💼 Payroll Summary
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCSV("detailed")}
              disabled={downloading !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              title="Export paired daily shift records to CSV"
            >
              <span>{downloading === "detailed" ? "Exporting..." : "📥 Shifts CSV"}</span>
            </button>
            <button
              onClick={() => downloadCSV("payroll")}
              disabled={downloading !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              title="Export aggregated employee payroll report to CSV"
            >
              <span>{downloading === "payroll" ? "Exporting..." : "💼 Payroll CSV"}</span>
            </button>
            <button
              onClick={() => setIsDigestModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              title="Generate and email executive attendance digest to HR/Management"
            >
              <span>📧 Send HR Digest</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100 border-b border-gray-100 bg-white">
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
            ⏱️
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Total Hours Worked
            </p>
            <p className="text-xl font-black text-gray-900">
              {metrics.total_hours} <span className="text-xs font-normal text-gray-500">hrs</span>
            </p>
          </div>
        </div>

        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
            🎯
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              On-Time Punctuality
            </p>
            <p className="text-xl font-black text-emerald-600">
              {metrics.on_time_rate}%
            </p>
          </div>
        </div>

        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
            ⚡
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Overtime Logged
            </p>
            <p className="text-xl font-black text-amber-600">
              {metrics.total_overtime} <span className="text-xs font-normal text-gray-500">hrs</span>
            </p>
          </div>
        </div>

        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
            🏢
          </div>
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Average Shift Length
            </p>
            <p className="text-xl font-black text-indigo-600">
              {metrics.avg_shift} <span className="text-xs font-normal text-gray-500">hrs</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">Range:</span>
          {(["all", "today", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setDateFilter(mode)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                dateFilter === mode
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search employee or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* View 1: Paired Daily Shifts Table */}
      {viewMode === "shifts" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Check-In</th>
                <th className="px-6 py-3">Check-Out</th>
                <th className="px-6 py-3">Shift Duration</th>
                <th className="px-6 py-3">Overtime</th>
                <th className="px-6 py-3">Punctuality</th>
                <th className="px-6 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-xs">
              {filteredShifts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                    No shift records found for this period.
                  </td>
                </tr>
              ) : (
                filteredShifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50/70 transition-colors">
                    {/* Employee */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900">{shift.employee_name}</span>
                        <span className="text-[11px] font-mono text-gray-400">
                          {shift.employee_code}
                        </span>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 font-mono text-gray-600">{shift.date}</td>

                    {/* Check In */}
                    <td className="px-6 py-4">
                      {shift.check_in_time ? (
                        <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                          <span>🌅</span>
                          <span>
                            {new Date(shift.check_in_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">None</span>
                      )}
                    </td>

                    {/* Check Out */}
                    <td className="px-6 py-4">
                      {shift.check_out_time ? (
                        <div className="flex items-center gap-1.5 font-medium text-blue-700">
                          <span>🌇</span>
                          <span>
                            {new Date(shift.check_out_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">In progress...</span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                        ⏱️ {shift.formatted_duration}
                      </span>
                    </td>

                    {/* Overtime */}
                    <td className="px-6 py-4">
                      {shift.overtime_hours > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                          +{shift.overtime_hours}h OT
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Punctuality */}
                    <td className="px-6 py-4">
                      {shift.arrival_status === "on_time" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          ✓ On Time
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          Late (+{shift.minutes_late}m)
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 text-right">
                      {shift.shift_status === "completed" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          Completed
                        </span>
                      ) : shift.shift_status === "in_progress" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 animate-pulse">
                          Active On-Site
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                          Missing Punch
                        </span>
                      )}
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/70 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Days Worked</th>
                <th className="px-6 py-3">Regular Hours</th>
                <th className="px-6 py-3">Overtime Hours</th>
                <th className="px-6 py-3">Total Payable Hours</th>
                <th className="px-6 py-3 text-right">Punctuality Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-xs">
              {filteredPayroll.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                    No payroll summaries found.
                  </td>
                </tr>
              ) : (
                filteredPayroll.map((pay) => (
                  <tr key={pay.employee_id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900">{pay.employee_name}</span>
                        <span className="text-[11px] font-mono text-gray-400">
                          {pay.employee_code}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-gray-600 font-mono">{pay.email}</td>

                    <td className="px-6 py-4 font-semibold text-gray-800">
                      {pay.days_worked} <span className="text-gray-400 font-normal">days</span>
                    </td>

                    <td className="px-6 py-4 font-mono font-medium text-gray-700">
                      {pay.total_regular_hours}h
                    </td>

                    <td className="px-6 py-4">
                      {pay.total_overtime_hours > 0 ? (
                        <span className="font-mono font-bold text-amber-600">
                          +{pay.total_overtime_hours}h
                        </span>
                      ) : (
                        <span className="text-gray-400">0.0h</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                        {pay.total_hours} hrs
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          pay.punctuality_pct >= 90
                            ? "bg-emerald-100 text-emerald-800"
                            : pay.punctuality_pct >= 70
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
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

      <SendDigestModal
        isOpen={isDigestModalOpen}
        onClose={() => setIsDigestModalOpen(false)}
      />
    </div>
  );
}
