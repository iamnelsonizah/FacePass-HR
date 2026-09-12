import { createServerClient } from "@/lib/supabase-server";
import SidebarNav from "@/components/SidebarNav";
import LogoutButton from "@/components/LogoutButton";

/**
 * Operations Dashboard Layout — persistent dark sidebar and technical shell.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();

  // Fetch count of active unresolved security alerts for sidebar badge
  const { count: alertCount } = await supabase
    .from("fraud_alerts")
    .select("*", { count: "exact", head: true })
    .eq("is_resolved", false);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userEmail = user?.email || "nelsonizah13@gmail.com";
  // Display name or facility role
  const isFelix = userEmail.toLowerCase().includes("nelsonizah13") || userEmail.toLowerCase().includes("felix");
  const displayName = isFelix ? "Felix Izah" : "Facility Admin";
  const userInitials = isFelix ? "FI" : userEmail.slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      {/* Persistent Dark Operations Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 8V6a2 2 0 0 1 2-2h2M20 8V6a2 2 0 0 0-2-2h-2M4 16v2a2 2 0 0 0 2 2h2M20 16v2a2 2 0 0 1-2 2h-2"
                stroke="#fff"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="2.6" stroke="#fff" strokeWidth="1.6" />
            </svg>
          </div>
          <div>
            <div className="brand-name">FacePass</div>
            <div className="brand-sub">Marrakesh Hub</div>
          </div>
        </div>

        <SidebarNav alertCount={alertCount || 0} />

        <div className="sidebar-foot">
          <div className="avatar-sq">{userInitials}</div>
          <div className="who">
            {displayName}
            <span>Facility admin</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        {children}
      </main>
    </div>
  );
}
