import { createServerClient } from "@/lib/supabase-server";
import StatsCard from "@/components/StatsCard";
import EmployeeTable from "@/components/EmployeeTable";
import AttendanceTable from "@/components/AttendanceTable";
import FraudAlertsList from "@/components/FraudAlertsList";
import TimesheetExportButton from "@/components/TimesheetExportButton";
import SiteGeofenceMap from "@/components/SiteGeofenceMap";

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

  // 2. Fetch attendance logs with employee details
  const { data: attendanceLogs } = await supabase
    .from("attendance_logs")
    .select("*, employees(first_name, last_name, email)")
    .order("checked_at", { ascending: false })
    .limit(100);

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

      {/* Interactive Site Geofence Map */}
      <SiteGeofenceMap
        sites={sites || []}
        attendanceLogs={attendanceLogs || []}
      />

      {/* Employees Table */}
      <EmployeeTable employees={employees || []} />

      {/* Attendance Logs Table */}
      <AttendanceTable logs={attendanceLogs || []} />
    </div>
  );
}
