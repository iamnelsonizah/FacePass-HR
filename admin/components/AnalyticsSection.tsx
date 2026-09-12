"use client";

import React, { useState, useMemo } from "react";

interface AnalyticsSectionProps {
  logs: any[];
  employees?: any[];
}

export default function AnalyticsSection({ logs, employees = [] }: AnalyticsSectionProps) {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("7d");

  // Filter logs by selected time range
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const cutoff7d = new Date(now.getTime() - 7 * 86400000).toISOString();
    const cutoff30d = new Date(now.getTime() - 30 * 86400000).toISOString();

    return logs.filter((log) => {
      if (!log.checked_at) return false;
      if (timeRange === "7d") return log.checked_at >= cutoff7d;
      if (timeRange === "30d") return log.checked_at >= cutoff30d;
      return true;
    });
  }, [logs, timeRange]);

  // Compute all analytics metrics dynamically
  const metrics = useMemo(() => {
    const checkIns = filteredLogs.filter((l) => l.check_type === "check_in");
    const checkOuts = filteredLogs.filter((l) => l.check_type === "check_out");

    // 1. Punctuality Analysis (09:00 AM target with 15m grace)
    let onTimeCount = 0;
    let graceCount = 0;
    let lateCount = 0;
    let totalArrivalMinutes = 0;
    let validArrivalCount = 0;

    // Hourly buckets for Rush Hour histogram: 07:00 to 11:00+ in 30-min slots
    const hourlySlots: Record<string, number> = {
      "07:00": 0,
      "07:30": 0,
      "08:00": 0,
      "08:30": 0,
      "09:00": 0,
      "09:30": 0,
      "10:00": 0,
      "10:30": 0,
      "11:00+": 0,
    };

    checkIns.forEach((log) => {
      const dt = new Date(log.checked_at);
      const hours = dt.getHours();
      const minutes = dt.getMinutes();
      const totalMin = hours * 60 + minutes;

      totalArrivalMinutes += totalMin;
      validArrivalCount++;

      // Punctuality status
      if (totalMin <= 9 * 60) {
        onTimeCount++;
      } else if (totalMin <= 9 * 60 + 15) {
        graceCount++;
      } else {
        lateCount++;
      }

      // Slot bucket
      if (hours < 7) {
        hourlySlots["07:00"]++;
      } else if (hours === 7 && minutes < 30) {
        hourlySlots["07:00"]++;
      } else if (hours === 7) {
        hourlySlots["07:30"]++;
      } else if (hours === 8 && minutes < 30) {
        hourlySlots["08:00"]++;
      } else if (hours === 8) {
        hourlySlots["08:30"]++;
      } else if (hours === 9 && minutes < 30) {
        hourlySlots["09:00"]++;
      } else if (hours === 9) {
        hourlySlots["09:30"]++;
      } else if (hours === 10 && minutes < 30) {
        hourlySlots["10:00"]++;
      } else if (hours === 10) {
        hourlySlots["10:30"]++;
      } else {
        hourlySlots["11:00+"]++;
      }
    });

    // Average arrival time formatted
    let avgArrivalTime = "08:55 AM";
    if (validArrivalCount > 0) {
      const avgMin = Math.round(totalArrivalMinutes / validArrivalCount);
      const avgH = Math.floor(avgMin / 60);
      const avgM = avgMin % 60;
      const ampm = avgH >= 12 ? "PM" : "AM";
      const displayH = avgH % 12 || 12;
      avgArrivalTime = `${displayH.toString().padStart(2, "0")}:${avgM.toString().padStart(2, "0")} ${ampm}`;
    }

    const totalCheckIns = checkIns.length || 1;
    const onTimeRate = Math.round(((onTimeCount + graceCount) / totalCheckIns) * 100);

    // 2. Biometric Security & Trust Score Spectrum
    let trustScoreSum = 0;
    let highTrustCount = 0; // >= 90
    let modTrustCount = 0; // 70-89
    let flaggedCount = 0; // < 70 or status === flagged

    filteredLogs.forEach((log) => {
      const score = typeof log.trust_score === "number" ? log.trust_score : 95;
      trustScoreSum += score;
      if (score >= 90 && log.status !== "flagged") {
        highTrustCount++;
      } else if (score >= 70 && log.status !== "flagged") {
        modTrustCount++;
      } else {
        flaggedCount++;
      }
    });

    const avgTrustScore = filteredLogs.length > 0 ? (trustScoreSum / filteredLogs.length).toFixed(1) : "96.2";

    // 3. Channel Split: Mobile App vs Kiosk vs Offline Sync
    let mobileCount = 0;
    let kioskCount = 0;
    let offlineCount = 0;

    filteredLogs.forEach((log) => {
      const fp = (log.device_fingerprint || "").toLowerCase();
      const notes = (log.flag_reason || "").toLowerCase();
      if (fp.includes("kiosk") || fp.includes("ipad") || fp.includes("reception")) {
        kioskCount++;
      } else if (fp.includes("offline") || notes.includes("offline") || log.client_uuid?.startsWith("fp_off")) {
        offlineCount++;
      } else {
        mobileCount++;
      }
    });

    const totalLogs = filteredLogs.length || 1;
    const mobilePct = Math.round((mobileCount / totalLogs) * 100);
    const kioskPct = Math.round((kioskCount / totalLogs) * 100);
    const offlinePct = Math.round((offlineCount / totalLogs) * 100);

    // 4. Daily Attendance Turnout Curve (last 7 days)
    const dailyVolume: { dateLabel: string; count: number; dayName: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
      const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const dayCount = checkIns.filter((l) => l.checked_at.startsWith(iso)).length;
      dailyVolume.push({ dateLabel, dayName, count: dayCount });
    }

    // Find max for scaling charts
    const maxSlotCount = Math.max(...Object.values(hourlySlots), 1);
    const maxDailyCount = Math.max(...dailyVolume.map((d) => d.count), 1);

    return {
      checkInsCount: checkIns.length,
      checkOutsCount: checkOuts.length,
      totalPunches: filteredLogs.length,
      onTimeCount,
      graceCount,
      lateCount,
      onTimeRate,
      avgArrivalTime,
      avgTrustScore,
      highTrustCount,
      modTrustCount,
      flaggedCount,
      hourlySlots,
      maxSlotCount,
      mobilePct,
      kioskPct,
      offlinePct,
      dailyVolume,
      maxDailyCount,
    };
  }, [filteredLogs]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden space-y-6 p-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl">📊</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Workforce & Biometrics Analytics</h3>
              <p className="text-xs text-gray-500">
                Turnout trends, arrival rush-hour distribution, trust index, and punch channel telemetry
              </p>
            </div>
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200 text-xs">
          {(
            [
              { id: "7d", label: "Last 7 Days" },
              { id: "30d", label: "Last 30 Days" },
              { id: "all", label: "All Time" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTimeRange(t.id)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                timeRange === t.id
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Executive KPI Ribbons */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Avg Arrival Time */}
        <div className="bg-gradient-to-br from-blue-50/60 to-indigo-50/30 p-4 rounded-xl border border-blue-100/80">
          <div className="flex items-center justify-between text-xs text-blue-800/80 font-semibold mb-1">
            <span>Avg Arrival Time</span>
            <span>⏱️</span>
          </div>
          <div className="text-2xl font-extrabold text-blue-950 font-mono tracking-tight">
            {metrics.avgArrivalTime}
          </div>
          <div className="flex items-center space-x-1.5 mt-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Target: 09:00 AM
            </span>
            <span className="text-[11px] text-gray-500">Facility Shift</span>
          </div>
        </div>

        {/* KPI 2: Punctuality Rate */}
        <div className="bg-gradient-to-br from-emerald-50/60 to-green-50/30 p-4 rounded-xl border border-emerald-100/80">
          <div className="flex items-center justify-between text-xs text-emerald-800/80 font-semibold mb-1">
            <span>Punctuality Compliance</span>
            <span>🎯</span>
          </div>
          <div className="text-2xl font-extrabold text-emerald-900 font-mono tracking-tight">
            {metrics.onTimeRate}%
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-2 flex items-center gap-1">
            <span>✓</span>
            <span>{metrics.onTimeCount + metrics.graceCount} on-time vs {metrics.lateCount} late</span>
          </div>
        </div>

        {/* KPI 3: Biometric Trust Index */}
        <div className="bg-gradient-to-br from-purple-50/60 to-violet-50/30 p-4 rounded-xl border border-purple-100/80">
          <div className="flex items-center justify-between text-xs text-purple-800/80 font-semibold mb-1">
            <span>Biometric Trust Index</span>
            <span>🛡️</span>
          </div>
          <div className="text-2xl font-extrabold text-purple-950 font-mono tracking-tight">
            {metrics.avgTrustScore}%
          </div>
          <div className="text-[11px] text-purple-700 font-medium mt-2 flex items-center gap-1">
            <span>{metrics.flaggedCount === 0 ? "🔒 100% Anti-Spoof Pass" : `⚠️ ${metrics.flaggedCount} Flagged Checks`}</span>
          </div>
        </div>

        {/* KPI 4: Punch Channel Telemetry */}
        <div className="bg-gradient-to-br from-amber-50/60 to-orange-50/30 p-4 rounded-xl border border-amber-100/80">
          <div className="flex items-center justify-between text-xs text-amber-800/80 font-semibold mb-1">
            <span>Terminal Adoption</span>
            <span>📱</span>
          </div>
          <div className="text-2xl font-extrabold text-amber-950 font-mono tracking-tight">
            {metrics.mobilePct}% <span className="text-xs text-amber-700 font-normal">Mobile</span>
          </div>
          <div className="text-[11px] text-amber-800 font-medium mt-2">
            {metrics.kioskPct}% Kiosk Tablet • {metrics.offlinePct}% Offline Queue
          </div>
        </div>
      </div>

      {/* Main Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        {/* Chart 1: Arrival Rush-Hour Distribution Histogram */}
        <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                <span>⏱️</span>
                <span>Morning Arrival Rush-Hour Histogram</span>
              </h4>
              <p className="text-xs text-gray-500">Check-in frequency by 30-min window (Marrakesh Hub)</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase tracking-wider">
              Peak Analysis
            </span>
          </div>

          {/* Histogram Bar Visualization */}
          <div className="space-y-2 pt-2">
            {Object.entries(metrics.hourlySlots).map(([slot, count]) => {
              const widthPct = Math.round((count / metrics.maxSlotCount) * 100);
              const isTargetSlot = slot === "08:30" || slot === "09:00";
              return (
                <div key={slot} className="flex items-center text-xs gap-2">
                  <span className="w-14 font-mono text-gray-500 text-[11px] text-right">{slot}</span>
                  <div className="flex-1 bg-gray-200/70 h-5 rounded-md overflow-hidden relative">
                    <div
                      style={{ width: `${Math.max(widthPct, count > 0 ? 12 : 2)}%` }}
                      className={`h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2 text-[10px] font-bold text-white ${
                        isTargetSlot
                          ? "bg-blue-600 shadow-sm"
                          : slot.startsWith("10") || slot.startsWith("11")
                            ? "bg-rose-500"
                            : "bg-emerald-500"
                      }`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  </div>
                  <span className="w-6 font-mono text-gray-700 text-right font-semibold">{count}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-200/60 pt-2.5">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span> Early
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600"></span> Target (08:30 - 09:00)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span> Late (&gt;09:15)
              </span>
            </div>
            <span className="font-semibold text-gray-600">Total: {metrics.checkInsCount} Check-ins</span>
          </div>
        </div>

        {/* Chart 2: 7-Day Attendance Volume & Turnout */}
        <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                <span>📈</span>
                <span>7-Day Attendance Turnout Trend</span>
              </h4>
              <p className="text-xs text-gray-500">Daily worker check-ins over the past week</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase tracking-wider">
              Turnout
            </span>
          </div>

          {/* Area/Bar visualization for 7 days */}
          <div className="flex items-end justify-between h-40 pt-4 px-2">
            {metrics.dailyVolume.map((item, idx) => {
              const heightPct = Math.round((item.count / metrics.maxDailyCount) * 100);
              return (
                <div key={idx} className="flex flex-col items-center flex-1 h-full justify-end group">
                  <span className="text-[11px] font-mono font-bold text-blue-600 mb-1">
                    {item.count > 0 ? item.count : "—"}
                  </span>
                  <div className="w-8 sm:w-10 bg-gray-200/70 h-28 rounded-t-lg flex items-end overflow-hidden">
                    <div
                      style={{ height: `${Math.max(heightPct, item.count > 0 ? 15 : 4)}%` }}
                      className="w-full bg-gradient-to-t from-blue-600 to-indigo-500 rounded-t-lg transition-all duration-500 group-hover:brightness-110"
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-gray-700 mt-2">{item.dayName}</span>
                  <span className="text-[9px] text-gray-400">{item.dateLabel}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-500 border-t border-gray-200/60 pt-2.5">
            <span>Weekly Average: {((metrics.checkInsCount || 1) / 7).toFixed(1)} check-ins/day</span>
            <span className="font-semibold text-blue-600">Peak: {metrics.maxDailyCount} arrivals</span>
          </div>
        </div>
      </div>

      {/* Secondary Intelligence Breakdown: Punctuality Donut vs Trust Spectrum vs Channels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
        {/* Punctuality Donut Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-gray-800">Punctuality Compliance</span>
            <span className="font-mono text-emerald-600 font-bold">{metrics.onTimeRate}%</span>
          </div>

          {/* Stacked Progress Bar */}
          <div className="w-full h-3.5 bg-gray-100 rounded-full flex overflow-hidden">
            <div
              style={{ width: `${Math.round((metrics.onTimeCount / (metrics.checkInsCount || 1)) * 100)}%` }}
              className="bg-emerald-500 h-full"
              title="On Time"
            />
            <div
              style={{ width: `${Math.round((metrics.graceCount / (metrics.checkInsCount || 1)) * 100)}%` }}
              className="bg-amber-400 h-full"
              title="Grace Period"
            />
            <div
              style={{ width: `${Math.round((metrics.lateCount / (metrics.checkInsCount || 1)) * 100)}%` }}
              className="bg-rose-500 h-full"
              title="Late Arrival"
            />
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> On Time (&lt;09:00 AM)
              </span>
              <span className="font-semibold text-gray-900">{metrics.onTimeCount}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Grace Period (09:00–09:15)
              </span>
              <span className="font-semibold text-gray-900">{metrics.graceCount}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Late Arrival (&gt;09:15)
              </span>
              <span className="font-semibold text-gray-900">{metrics.lateCount}</span>
            </div>
          </div>
        </div>

        {/* Biometric Trust Score Spectrum */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-gray-800">Biometric Integrity</span>
            <span className="font-mono text-purple-700 font-bold">{metrics.avgTrustScore}% Avg</span>
          </div>

          <div className="w-full h-3.5 bg-gray-100 rounded-full flex overflow-hidden">
            <div
              style={{ width: `${Math.round((metrics.highTrustCount / (metrics.totalPunches || 1)) * 100)}%` }}
              className="bg-purple-600 h-full"
              title="High Trust"
            />
            <div
              style={{ width: `${Math.round((metrics.modTrustCount / (metrics.totalPunches || 1)) * 100)}%` }}
              className="bg-amber-400 h-full"
              title="Moderate"
            />
            <div
              style={{ width: `${Math.round((metrics.flaggedCount / (metrics.totalPunches || 1)) * 100)}%` }}
              className="bg-rose-500 h-full"
              title="Flagged"
            />
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-600"></span> Verified (&gt;90%)
              </span>
              <span className="font-semibold text-gray-900">{metrics.highTrustCount}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Moderate (70–89%)
              </span>
              <span className="font-semibold text-gray-900">{metrics.modTrustCount}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Flagged / Anomaly
              </span>
              <span className="font-semibold text-gray-900">{metrics.flaggedCount}</span>
            </div>
          </div>
        </div>

        {/* Channel & Device Telemetry */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-gray-800">Punch Channels</span>
            <span className="font-mono text-blue-700 font-bold">{metrics.totalPunches} Total</span>
          </div>

          <div className="w-full h-3.5 bg-gray-100 rounded-full flex overflow-hidden">
            <div
              style={{ width: `${metrics.mobilePct}%` }}
              className="bg-blue-600 h-full"
              title="Mobile App"
            />
            <div
              style={{ width: `${metrics.kioskPct}%` }}
              className="bg-teal-500 h-full"
              title="Reception Kiosk"
            />
            <div
              style={{ width: `${metrics.offlinePct}%` }}
              className="bg-amber-500 h-full"
              title="Offline Queue"
            />
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600"></span> 📱 Mobile Self-Service
              </span>
              <span className="font-semibold text-gray-900">{metrics.mobilePct}%</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-teal-500"></span> 🖥️ Reception Kiosk
              </span>
              <span className="font-semibold text-gray-900">{metrics.kioskPct}%</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> ⚡ Offline Queue Sync
              </span>
              <span className="font-semibold text-gray-900">{metrics.offlinePct}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
