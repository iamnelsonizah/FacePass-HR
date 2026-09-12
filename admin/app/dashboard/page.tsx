import Link from "next/link";
import { createServerClient } from "@/lib/supabase-server";
import StatsCard from "@/components/StatsCard";
import EmployeeTable from "@/components/EmployeeTable";
import AttendanceTable from "@/components/AttendanceTable";
import FraudAlertsList from "@/components/FraudAlertsList";
import TimesheetExportButton from "@/components/TimesheetExportButton";
import TimesheetSection from "@/components/TimesheetSection";
import SiteGeofenceMap from "@/components/SiteGeofenceMap";
import AnalyticsSection from "@/components/AnalyticsSection";

/**
 * Main dashboard page — shows stats, live geofence map, fraud alerts, employees, and logs.
 * Server component fetching data directly from Supabase.
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

  return (
    <div className="space-y-8">
      {/* Header & Export Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 mt-1">
            Real-time biometric attendance, site geofences, and AI fraud monitoring
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            href="/kiosk"
            target="_blank"
            className="inline-flex items-center space-x-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
            title="Launch full-screen entrance reception kiosk"
          >
            <span>🖥️ Launch Kiosk Mode</span>
          </Link>
          <TimesheetExportButton />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Employees"
          value={totalEmployees ?? 0}
          icon="👥"
        />
        <StatsCard
          title="Today's Check-ins"
          value={todaysCheckins ?? 0}
          icon="📸"
        />
        <StatsCard
          title="Active Sites"
          value={activeSites ?? 0}
          icon="📍"
        />
        <StatsCard
          title="Flagged Anomalies"
          value={flaggedCheckins ?? 0}
          icon="⚠️"
        />
      </div>

      {/* Fraud & Security Alert Banner */}
      <FraudAlertsList initialAlerts={fraudAlerts || []} />

      {/* Workforce & Biometrics Analytics */}
      <AnalyticsSection
        logs={attendanceLogs || []}
        employees={employees || []}
      />

      {/* Interactive Site Geofence Map */}
      <SiteGeofenceMap
        sites={sites || []}
        attendanceLogs={attendanceLogs || []}
      />

      {/* Employees Table */}
      <EmployeeTable employees={employees || []} />

      {/* Automated Shift Timesheets & Payroll Hours */}
      <TimesheetSection logs={attendanceLogs || []} />

      {/* Attendance Logs Table */}
      <AttendanceTable logs={attendanceLogs || []} />
    </div>
  );
}
