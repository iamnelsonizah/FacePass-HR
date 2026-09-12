import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import EmployeeTable from "@/components/EmployeeTable";
import AttendanceTable from "@/components/AttendanceTable";
import FraudAlertsList from "@/components/FraudAlertsList";
import TimesheetExportButton from "@/components/TimesheetExportButton";
import TimesheetSection from "@/components/TimesheetSection";
import SiteGeofenceMap from "@/components/SiteGeofenceMap";
import AnalyticsSection from "@/components/AnalyticsSection";
import VisitorManagementSection from "@/components/VisitorManagementSection";

/**
 * Main dashboard page — Security & Operations Console.
 * Server component fetching live attendance, biometric, and facility data.
 */
export default async function DashboardPage() {
  const supabase = await createServerClient();

  // 1. Fetch employees
  const { data: employees } = await supabase
    .from("employees")
    .select("*")
    .order("created_at", { ascending: false });

  // 2. Fetch attendance logs with employee and site details
  const { data: attendanceLogs, error: attendanceError } = await supabase
    .from("attendance_logs")
    .select("*, employees(first_name, last_name, email, employee_code, avatar_url), sites(name, address)")
    .order("checked_at", { ascending: false })
    .limit(100);

  if (attendanceError) {
    console.error("Error fetching attendance logs:", attendanceError);
  }

  // 3. Fetch active sites for geofence map
  const { data: sites } = await supabase
    .from("sites")
    .select("*")
    .eq("is_active", true);

  // 4. Fetch unresolved fraud & security alerts
  const { data: fraudAlerts } = await supabase
    .from("fraud_alerts")
    .select("*, employees(first_name, last_name, email)")
    .eq("is_resolved", false)
    .order("created_at", { ascending: false })
    .limit(20);

  // 5. Fetch stats counters
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const { count: totalEmployees } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: todaysCheckins } = await supabase
    .from("attendance_logs")
    .select("*", { count: "exact", head: true })
    .eq("check_type", "check_in")
    .gte("checked_at", todayISO);

  const { count: activeSites } = await supabase
    .from("sites")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  const { count: flaggedCheckins } = await supabase
    .from("attendance_logs")
    .select("*", { count: "exact", head: true })
    .eq("status", "flagged")
    .gte("checked_at", todayISO);

  // Calculate today's late check-ins and staff vs visitor breakdown for KPI subtitle
  const todayCheckinLogs = (attendanceLogs || []).filter(
    (l) => l.check_type === "check_in" && l.checked_at && l.checked_at >= todayISO
  );
  const todayLateCount = todayCheckinLogs.filter((l) => {
    const dt = new Date(l.checked_at);
    return dt.getHours() * 60 + dt.getMinutes() > 9 * 60 + 15;
  }).length;

  const visitorCheckins = todayCheckinLogs.filter((l) =>
    Boolean(
      (l.employees?.employee_code || "").toUpperCase().startsWith("VIS-") ||
      (l.device_fingerprint || "").includes("visitor")
    )
  ).length;
  const staffCheckins = Math.max(0, todayCheckinLogs.length - visitorCheckins);

  const syncTime = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Real-time biometric attendance &amp; site security ledger</p>
        </div>
        <div className="actions">
          <Link href="/portal" className="btn btn-outline" target="_blank">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Open Web Portal
          </Link>
          <Link href="/kiosk" className="btn btn-outline" target="_blank">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M4 4v16l16-8L4 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            Launch kiosk mode
          </Link>
          <TimesheetExportButton />
        </div>
      </div>

      {/* Main Operations Container */}
      <div className="container-ops">
        {/* KPI Strip */}
        <div id="overview" className="kpi-strip">
          <div className="kpi">
            <div className="kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3.5 19c0-3.3 2.6-5.6 5.5-5.6S14.5 15.7 14.5 19" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Total employees
            </div>
            <div className="kpi-value">{totalEmployees ?? 1}</div>
            <div className="kpi-sub">Enrolled &amp; active</div>
          </div>

          <div className="kpi">
            <div className="kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Today&apos;s check-ins
            </div>
            <div className="kpi-value">{todaysCheckins ?? 0}</div>
            <div className="kpi-sub font-mono">
              <span className="text-[#0C6B72] font-semibold">{staffCheckins} Staff</span>
              {visitorCheckins > 0 ? (
                <span className="text-[#9C6B18]"> · {visitorCheckins} Visitor{visitorCheckins === 1 ? "" : "s"}</span>
              ) : (
                <span className="text-[var(--text-faint)]"> · 0 Visitors</span>
              )}
              {todayLateCount > 0 ? ` · ${todayLateCount} late` : ""}
            </div>
          </div>

          <div className="kpi">
            <div className="kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 21s7-5.1 7-11.2A7 7 0 0 0 5 9.8C5 15.9 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Active sites
            </div>
            <div className="kpi-value">{activeSites ?? 1}</div>
            <div className="kpi-sub">Marrakesh Hub · 2000m radius</div>
          </div>

          <div className={`kpi ${flaggedCheckins && flaggedCheckins > 0 ? "is-alert" : ""}`}>
            <div className="kpi-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 3 3 7.5v5C3 17.7 6.8 21.6 12 22.9c5.2-1.3 9-5.2 9-10.4v-5L12 3Z" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Flagged anomalies
            </div>
            <div className="kpi-value">{flaggedCheckins ?? 0}</div>
            <div className="kpi-sub">
              {flaggedCheckins && flaggedCheckins > 0 ? "Requires review" : "Zero anomalies detected"}
            </div>
          </div>
        </div>

        {/* Security & Fraud Alerts Panel */}
        <FraudAlertsList initialAlerts={fraudAlerts || []} />

        {/* Workforce & Biometrics Analytics */}
        <AnalyticsSection
          logs={attendanceLogs || []}
          employees={employees || []}
        />

        {/* Live Site Geofence & Location Schematic */}
        <SiteGeofenceMap
          sites={sites || []}
          attendanceLogs={attendanceLogs || []}
        />

        {/* Employees Panel */}
        <EmployeeTable employees={employees || []} />

        {/* Visitors & Guests Management & Analytics Panel */}
        <VisitorManagementSection initialLogs={attendanceLogs || []} />

        {/* Automated Timesheets & Payroll Hours */}
        <TimesheetSection logs={attendanceLogs || []} />

        {/* Attendance Logs Panel */}
        <AttendanceTable logs={attendanceLogs || []} />

        {/* Page Footer */}
        <footer className="page-foot">
          <span>FacePass Admin · Marrakesh Hub</span>
          <span>Last synced {syncTime}</span>
        </footer>
      </div>
    </>
  );
}
