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

  // Format average arrival time into hours and AM/PM parts
  const [timeValue, timePeriod] = metrics.avgArrivalTime.split(" ");

  // Weekly average
  const totalWeeklyCheckins = metrics.dailyVolume.reduce((acc, d) => acc + d.count, 0);
  const weeklyAvg = (totalWeeklyCheckins / 7).toFixed(1);

  // Punctuality percentages for stacked bar
  const totalPunctuality = (metrics.onTimeCount + metrics.graceCount + metrics.lateCount) || 1;
  const onTimePct = Math.round((metrics.onTimeCount / totalPunctuality) * 100);
  const gracePct = Math.round((metrics.graceCount / totalPunctuality) * 100);
  const latePct = Math.round((metrics.lateCount / totalPunctuality) * 100);

  // Trust spectrum percentages for stacked bar
  const totalTrust = (metrics.highTrustCount + metrics.modTrustCount + metrics.flaggedCount) || 1;
  const highTrustPct = Math.round((metrics.highTrustCount / totalTrust) * 100);
  const modTrustPct = Math.round((metrics.modTrustCount / totalTrust) * 100);
  const flaggedPct = Math.round((metrics.flaggedCount / totalTrust) * 100);

  const slotList = [
    "07:00",
    "07:30",
    "08:00",
    "08:30",
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00+",
  ];

  return (
    <div id="analytics" className="panel">
      {/* Panel Head */}
      <div className="panel-head">
        <div className="panel-title">
          <div>
            <h2>Workforce &amp; biometrics analytics</h2>
            <p>Turnout trends, arrival distribution, trust index and punch-channel telemetry</p>
          </div>
        </div>
        <div className="segmented">
          <button
            className={timeRange === "7d" ? "active" : ""}
            onClick={() => setTimeRange("7d")}
          >
            7d
          </button>
          <button
            className={timeRange === "30d" ? "active" : ""}
            onClick={() => setTimeRange("30d")}
          >
            30d
          </button>
          <button
            className={timeRange === "all" ? "active" : ""}
            onClick={() => setTimeRange("all")}
          >
            All
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
            Avg. arrival time
          </div>
          <div className="stat-block-value">
            {timeValue} <small>{timePeriod || "AM"}</small>
          </div>
          <div className="stat-block-sub">Target 09:00 AM · facility shift</div>
        </div>

        <div className="stat-block">
          <div className="stat-block-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="0.8" fill="currentColor" />
            </svg>
            Punctuality compliance
          </div>
          <div
            className="stat-block-value"
            style={{
              color:
                metrics.onTimeRate >= 80
                  ? "var(--teal)"
                  : metrics.onTimeRate >= 50
                  ? "var(--amber)"
                  : "var(--red)",
            }}
          >
            {metrics.onTimeRate}%
          </div>
          <div className="stat-block-sub">
            {metrics.onTimeCount + metrics.graceCount} on-time vs. {metrics.lateCount} late
          </div>
        </div>

        <div className="stat-block">
          <div className="stat-block-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3l7 3v5c0 5-3 8.3-7 10-4-1.7-7-5-7-10V6l7-3Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            Biometric trust index
          </div>
          <div className="stat-block-value" style={{ color: "var(--teal)" }}>
            {metrics.avgTrustScore}%
          </div>
          <div className="stat-block-sub">
            {metrics.flaggedCount} flagged check{metrics.flaggedCount === 1 ? "" : "s"} this period
          </div>
        </div>

        <div className="stat-block">
          <div className="stat-block-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="7" y="2.5" width="10" height="19" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 19h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Terminal adoption
          </div>
          <div className="stat-block-value">
            {metrics.mobilePct}% <small>mobile</small>
          </div>
          <div className="stat-block-sub">
            {metrics.kioskPct}% kiosk tablet · {metrics.offlinePct}% offline queue
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Left: 30-minute arrival histogram */}
        <div className="chart-col">
          <div className="chart-col-head">
            <div>
              <h3>Morning arrival, by 30-minute window</h3>
              <p>Marrakesh Hub · check-in frequency</p>
            </div>
          </div>

          <div className="space-y-1">
            {slotList.map((slot) => {
              const val = metrics.hourlySlots[slot] || 0;
              const fillPct = (val / metrics.maxSlotCount) * 100;

              let fillColor = "var(--teal)";
              if (slot === "08:30" || slot === "09:00") {
                fillColor = "#3E6FB0";
              } else if (slot > "09:00" || slot === "11:00+") {
                fillColor = "var(--red)";
              }

              return (
                <div key={slot} className="hist-row">
                  <span className="hist-time">{slot}</span>
                  <div className="hist-track">
                    {val > 0 && (
                      <div
                        className="hist-fill"
                        style={{ width: `${Math.max(fillPct, 6)}%`, background: fillColor }}
                      />
                    )}
                  </div>
                  <span className="hist-val">{val}</span>
                </div>
              );
            })}
          </div>

          <div className="legend">
            <span>
              <span className="dot dot-teal"></span>Early &lt;08:30
            </span>
            <span>
              <span className="dot" style={{ background: "#3E6FB0" }}></span>Target 08:30–09:00
            </span>
            <span>
              <span className="dot dot-red"></span>Late &gt;09:15
            </span>
          </div>
        </div>

        {/* Right: 7-day attendance turnout bars */}
        <div className="chart-col">
          <div className="chart-col-head">
            <div>
              <h3>7-day attendance turnout</h3>
              <p>Daily worker check-ins</p>
            </div>
          </div>

          <div className="bars">
            {metrics.dailyVolume.map((d, idx) => {
              const isToday = idx === metrics.dailyVolume.length - 1;
              const heightPct = (d.count / metrics.maxDailyCount) * 100;

              return (
                <div key={d.dateLabel} className="bar-col">
                  <span className={`bar-val ${d.count === 0 ? "zero" : ""}`}>
                    {d.count > 0 ? d.count : "–"}
                  </span>
                  <div
                    className={`bar ${isToday ? "today" : ""}`}
                    style={{
                      height: `${d.count > 0 ? Math.max(heightPct, 10) : 2}px`,
                      maxHeight: "85px",
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="bar-labels">
            {metrics.dailyVolume.map((d) => (
              <div key={d.dateLabel} className="bar-label-col">
                <div className="d">{d.dayName}</div>
                <div className="m">{d.dateLabel}</div>
              </div>
            ))}
          </div>

          <div className="chart-foot">
            <span>
              Weekly average <strong>{weeklyAvg}</strong> check-ins/day
            </span>
            <span>
              Peak <strong>{metrics.maxDailyCount}</strong> arrivals
            </span>
          </div>
        </div>
      </div>

      {/* Metric Row: 3 Stacked Bars */}
      <div className="metric-row">
        {/* Block 1: Punctuality */}
        <div className="metric-block">
          <div className="metric-head">
            <h4>Punctuality compliance</h4>
            <span className="v">{metrics.onTimeRate}%</span>
          </div>
          <div className="stack-bar">
            {onTimePct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${onTimePct}%`, background: "var(--teal)" }}
              />
            )}
            {gracePct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${gracePct}%`, background: "var(--amber)" }}
              />
            )}
            {latePct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${latePct}%`, background: "var(--red)" }}
              />
            )}
          </div>
          <ul className="metric-legend">
            <li>
              <span className="l">
                <span className="dot dot-teal"></span>On time &lt;09:00
              </span>
              <span className="n">{metrics.onTimeCount}</span>
            </li>
            <li>
              <span className="l">
                <span className="dot dot-amber"></span>Grace 09:00–09:15
              </span>
              <span className="n">{metrics.graceCount}</span>
            </li>
            <li>
              <span className="l">
                <span className="dot dot-red"></span>Late &gt;09:15
              </span>
              <span className="n">{metrics.lateCount}</span>
            </li>
          </ul>
        </div>

        {/* Block 2: Biometric Integrity */}
        <div className="metric-block">
          <div className="metric-head">
            <h4>Biometric integrity</h4>
            <span className="v">{metrics.avgTrustScore}%</span>
          </div>
          <div className="stack-bar">
            {highTrustPct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${highTrustPct}%`, background: "var(--teal)" }}
              />
            )}
            {modTrustPct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${modTrustPct}%`, background: "var(--amber)" }}
              />
            )}
            {flaggedPct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${flaggedPct}%`, background: "var(--red)" }}
              />
            )}
          </div>
          <ul className="metric-legend">
            <li>
              <span className="l">
                <span className="dot dot-teal"></span>Verified &gt;90%
              </span>
              <span className="n">{metrics.highTrustCount}</span>
            </li>
            <li>
              <span className="l">
                <span className="dot dot-amber"></span>Moderate 70–89%
              </span>
              <span className="n">{metrics.modTrustCount}</span>
            </li>
            <li>
              <span className="l">
                <span className="dot dot-red"></span>Flagged / anomaly
              </span>
              <span className="n">{metrics.flaggedCount}</span>
            </li>
          </ul>
        </div>

        {/* Block 3: Punch Channels */}
        <div className="metric-block">
          <div className="metric-head">
            <h4>Punch channels</h4>
            <span className="v">{metrics.totalPunches} total</span>
          </div>
          <div className="stack-bar">
            {metrics.mobilePct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${metrics.mobilePct}%`, background: "#3E6FB0" }}
              />
            )}
            {metrics.kioskPct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${metrics.kioskPct}%`, background: "var(--teal)" }}
              />
            )}
            {metrics.offlinePct > 0 && (
              <div
                className="stack-seg"
                style={{ width: `${metrics.offlinePct}%`, background: "var(--line-strong)" }}
              />
            )}
          </div>
          <ul className="metric-legend">
            <li>
              <span className="l">
                <span className="dot" style={{ background: "#3E6FB0" }}></span>Mobile self-service
              </span>
              <span className="n">{metrics.mobilePct}%</span>
            </li>
            <li>
              <span className="l">
                <span className="dot dot-teal"></span>Reception kiosk
              </span>
              <span className="n">{metrics.kioskPct}%</span>
            </li>
            <li>
              <span className="l">
                <span className="dot dot-line"></span>Offline queue sync
              </span>
              <span className="n">{metrics.offlinePct}%</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
