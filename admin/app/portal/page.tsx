"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getPortalSession, clearPortalSession, PortalUser } from "@/components/portal/portalAuth";
import WebcamPunchCard from "@/components/portal/WebcamPunchCard";
import PersonalTimecard, { AttendanceSession, PersonalPunch } from "@/components/portal/PersonalTimecard";
import VisitorPunchTerminal from "@/components/portal/VisitorPunchTerminal";
import BiometricEnrollmentModal from "@/components/portal/BiometricEnrollmentModal";
import "../visitor.css";

export default function EmployeePortalDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [activeTab, setActiveTab] = useState<"staff" | "visitor">("staff");
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  // State & Data
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [punches, setPunches] = useState<PersonalPunch[]>([]);
  const [stats, setStats] = useState<{
    totalHours: string;
    punctualityRate: number;
    overtimeHours: string;
    biometricIntegrity: string;
  }>({
    totalHours: "0.0 hrs",
    punctualityRate: 100,
    overtimeHours: "0.0h",
    biometricIntegrity: "98.4%",
  });

  const [isClockedIn, setIsClockedIn] = useState(false);
  const [lastCheckInTime, setLastCheckInTime] = useState<Date | null>(null);
  const [elapsedStr, setElapsedStr] = useState("0h 00m");
  const [todayPunchCount, setTodayPunchCount] = useState(0);
  const [antiPassbackSeconds, setAntiPassbackSeconds] = useState(0);
  const [enrolledTemplatesCount, setEnrolledTemplatesCount] = useState(3);
  const [wallClock, setWallClock] = useState("");

  // Live ticking wall clock
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setWallClock(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Authenticate Session or allow guest visitor mode
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "visitor") {
        setActiveTab("visitor");
      }
    }

    const session = getPortalSession();
    if (session) {
      setUser(session);
    }
  }, []);

  // 2. Fetch Personal Attendance Sessions & Logs for this Employee
  const loadPunches = useCallback(async (userObj: PortalUser) => {
    setLoading(true);
    try {
      const code = userObj.employee_code || "";
      const email = userObj.email || "";
      const queryParam = code ? `code=${encodeURIComponent(code)}` : `email=${encodeURIComponent(email)}`;

      const res = await fetch(`/api/portal/history?${queryParam}`);
      const data = await res.json();

      if (data.success) {
        setSessions(data.sessions || []);
        setPunches(data.raw_punches || []);
        setIsClockedIn(Boolean(data.isClockedIn));
        if (data.lastCheckInTime) {
          setLastCheckInTime(new Date(data.lastCheckInTime));
        } else {
          setLastCheckInTime(null);
        }
        if (typeof data.todayPunchCount === "number") {
          setTodayPunchCount(data.todayPunchCount);
        }
        if (typeof data.antiPassbackRemainingSeconds === "number") {
          setAntiPassbackSeconds(data.antiPassbackRemainingSeconds);
        }
        if (typeof data.enrolledTemplatesCount === "number") {
          setEnrolledTemplatesCount(data.enrolledTemplatesCount);
        }
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.warn("Could not load personal punches via portal API:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadPunches(user);
    }
  }, [user, loadPunches]);

  // 3. Ticking elapsed duration counter while clocked in
  useEffect(() => {
    if (!isClockedIn || !lastCheckInTime) {
      setElapsedStr("0h 00m");
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const start = lastCheckInTime.getTime();
      const diffMs = Math.max(0, now - start);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
      setElapsedStr(`${hours}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isClockedIn, lastCheckInTime]);

  const handleSignOut = () => {
    clearPortalSession();
    router.replace("/portal/login");
  };

  const empName = user
    ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Team Member"
    : "Guest Access";

  return (
    <div className="min-h-screen bg-[var(--paper,#F6F5F1)] text-[var(--ink,#14171C)]">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-[var(--line,#E4E2DC)] px-6 py-3 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="w-8 h-8 rounded-[3px] bg-[var(--ink,#14171C)] flex items-center justify-center text-white hover:opacity-90 transition-opacity" title="Back to Facility Gateway">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight">FacePass Portal</h1>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 uppercase">
                Self-Service Gateway
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted,#6E7175)]">Marrakesh Regional Operations Hub</p>
          </div>
        </div>

        {/* Center Persona Switcher: Staff vs Visitor */}
        <div className="hidden md:flex items-center gap-1 p-0.5 bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`px-3 py-1.5 rounded-[2px] transition-all flex items-center gap-1.5 ${
              activeTab === "staff"
                ? "bg-white text-[var(--ink,#14171C)] font-bold shadow-xs border border-[var(--line,#E4E2DC)]"
                : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Staff Workstation</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("visitor")}
            className={`px-3 py-1.5 rounded-[2px] transition-all flex items-center gap-1.5 ${
              activeTab === "visitor"
                ? "bg-white text-[#9C6B18] font-bold shadow-xs border border-[var(--line,#E4E2DC)]"
                : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect width="18" height="18" x="3" y="3" rx="2"/>
              <circle cx="12" cy="10" r="3"/>
              <path d="M7 17a5 5 0 0 1 10 0"/>
            </svg>
            <span>Visitor Pass</span>
          </button>
        </div>

        {/* Profile & Sign Out or Sign In Link */}
        <div className="flex items-center gap-3 sm:gap-4">
          {user ? (
            <>
              {/* Biometric Status Pill / Action Button */}
              {user.is_enrolled ? (
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(true)}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 text-[11px] font-mono hover:bg-[#0C6B72]/20 transition-colors"
                  title="Click to update or re-enroll biometric face templates"
                >
                  <span className="w-2 h-2 rounded-full bg-[#0C6B72]" />
                  <span>Biometrics Active</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-[#9C6B18]/15 text-[#9C6B18] border border-[#9C6B18]/35 text-[11px] font-mono font-bold hover:bg-[#9C6B18]/25 transition-colors animate-pulse"
                  title="Action required: enroll your face biometrics"
                >
                  <span className="w-2 h-2 rounded-full bg-[#9C6B18]" />
                  <span>Enroll Biometrics</span>
                </button>
              )}

              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold">{empName}</div>
                <div className="text-[11px] font-mono text-[var(--muted,#6E7175)]">
                  ID: <span className="font-bold text-[var(--ink,#14171C)]">{user.employee_code || "FP-STAFF"}</span>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="btn btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5"
                title="Sign out of portal"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/" className="btn btn-outline text-xs px-3 py-1.5 font-mono">
                ← Gateway
              </Link>
              <Link href="/portal/login" className="btn btn-dark text-xs px-3 py-1.5 font-bold">
                Staff Sign In
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="md:hidden px-6 pt-4">
        <div className="grid grid-cols-2 gap-1 p-1 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`py-1.5 rounded-[2px] text-center ${
              activeTab === "staff" ? "bg-[var(--paper,#F6F5F1)] font-bold text-[var(--ink,#14171C)]" : "text-[var(--muted,#6E7175)]"
            }`}
          >
            Staff Workstation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("visitor")}
            className={`py-1.5 rounded-[2px] text-center ${
              activeTab === "visitor" ? "bg-[var(--paper,#F6F5F1)] font-bold text-[#9C6B18]" : "text-[var(--muted,#6E7175)]"
            }`}
          >
            Visitor Pass
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "staff" ? (
        <main className="max-w-7xl mx-auto p-6 space-y-6">
          {!user ? (
            <div className="max-w-md mx-auto my-12 bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] p-8 text-center space-y-4 shadow-xs">
              <div className="w-12 h-12 rounded-[4px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 flex items-center justify-center mx-auto">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--ink,#14171C)]">
                  Staff Workstation Sign-In Required
                </h3>
                <p className="text-xs text-[var(--muted,#6E7175)] mt-1">
                  Please authenticate with your Employee ID or Work Email to access your shift terminal and view your personal attendance history.
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/portal/login")}
                  className="btn btn-dark text-xs py-2.5 font-bold bg-[#0C6B72] hover:bg-[#095257] text-white"
                >
                  Staff Sign In / Sign Up →
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("visitor")}
                  className="btn btn-outline text-xs py-2 font-mono"
                >
                  Switch to Visitor Pass (No Account Needed)
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Welcome Status Banner with Live Shift Telemetry */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-[4px] border border-[var(--line,#E4E2DC)] shadow-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[var(--ink,#14171C)]">
                      Good day, {user.first_name || "Team Member"}
                    </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 font-semibold">
                    {enrolledTemplatesCount} Multi-Vector Templates Synced
                  </span>
                </div>
                <p className="text-xs text-[var(--muted,#6E7175)] mt-0.5">
                  Stand steady in the viewfinder to punch hands-free, or select Clock In / Out below.
                </p>
              </div>

              <div className="flex items-center gap-4 sm:gap-6">
                {/* Live Wall Clock */}
                <div className="text-right border-r border-[var(--line,#E4E2DC)] pr-4 sm:pr-6 hidden sm:block">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)]">
                    Station Time
                  </div>
                  <div className="text-xs font-mono font-bold text-[var(--ink,#14171C)]">
                    {wallClock || "12:00:00"}
                  </div>
                </div>

                {/* Daily Punch Counter */}
                <div className="text-right border-r border-[var(--line,#E4E2DC)] pr-4 sm:pr-6">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)]">
                    Today&apos;s Punches
                  </div>
                  <div className="text-xs font-mono font-bold">
                    <span className={todayPunchCount >= 6 ? "text-[#AE3B26]" : "text-[var(--ink,#14171C)]"}>
                      {todayPunchCount} / 6
                    </span>
                    <span className="text-[10px] text-[var(--muted,#6E7175)] ml-1 font-normal">
                      {todayPunchCount >= 6 ? "(Limit Warning)" : "(Standard)"}
                    </span>
                  </div>
                </div>

                {/* Today's Shift Status */}
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)]">
                    Current Shift
                  </div>
                  <div className="text-xs font-mono font-bold">
                    {isClockedIn ? (
                      <span className="text-[#0C6B72] flex items-center gap-1.5 justify-end">
                        <span className="w-2 h-2 rounded-full bg-[#0C6B72] animate-ping" />
                        <span>ACTIVE ({elapsedStr})</span>
                      </span>
                    ) : (
                      <span className="text-[var(--muted,#6E7175)]">OFF DUTY</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Unenrolled Biometric Action Alert Banner */}
            {user.is_enrolled === false && (
              <div className="bg-[#9C6B18]/10 border border-[#9C6B18]/30 rounded-[4px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[3px] bg-[#9C6B18]/20 text-[#9C6B18] border border-[#9C6B18]/40 flex items-center justify-center shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--ink,#14171C)]">
                      Biometric Facial Profile Required
                    </div>
                    <p className="text-[11px] text-[var(--muted,#6E7175)]">
                      Your account is active, but your facial recognition vectors have not been registered. Register your face now to unlock contactless clocking.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(true)}
                  className="btn btn-dark text-xs px-4 py-2 font-bold bg-[#9C6B18] hover:bg-[#7D5512] text-white shrink-0 flex items-center gap-1.5"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Register Face Biometrics Now</span>
                </button>
              </div>
            )}

            {/* 2-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Biometric Punch Terminal */}
              <div className="lg:col-span-5 space-y-4">
                <WebcamPunchCard
                  user={user}
                  isClockedIn={isClockedIn}
                  activeShiftDuration={elapsedStr}
                  lastCheckInTime={lastCheckInTime}
                  todayPunchCount={todayPunchCount}
                  antiPassbackSeconds={antiPassbackSeconds}
                  enrolledTemplatesCount={enrolledTemplatesCount}
                  onOpenEnrollModal={() => setShowEnrollModal(true)}
                  onPunchSuccess={(res) => {
                    const isCheckIn = res.check_type === "check_in";
                    setIsClockedIn(isCheckIn);
                    if (isCheckIn) {
                      setLastCheckInTime(new Date());
                    } else {
                      setLastCheckInTime(null);
                    }
                    setAntiPassbackSeconds(180);
                    setTodayPunchCount((prev) => prev + 1);
                    // Refresh timecard data immediately
                    loadPunches(user);
                  }}
                />

                {/* Biometric Security Standard Note */}
                <div className="p-3.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] text-xs space-y-1.5 text-[var(--muted,#6E7175)]">
                  <div className="font-semibold text-[11px] uppercase tracking-wider text-[var(--ink,#14171C)] flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0C6B72" strokeWidth="1.8">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      <path d="m9 12 2 2 4-4"/>
                    </svg>
                    <span>Biometric Security Standard</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    Web punches are cryptographically validated using 512D facial vectors, browser device telemetry, and IP/GPS geofencing. Virtual webcam drivers and photo spoof attempts are logged for administrative audit.
                  </p>
                </div>
              </div>

              {/* Right Column: Personal Timecard with Paired In/Out Sessions */}
              <div className="lg:col-span-7 space-y-4">
                <PersonalTimecard
                  user={user}
                  sessions={sessions}
                  punches={punches}
                  loading={loading}
                  stats={stats}
                />
              </div>
            </div>
          </>
          )}
        </main>
      ) : (
        /* Visitor Gateway Mode */
        <div className="w-full">
          <VisitorPunchTerminal hideHeader={true} />
        </div>
      )}

      {/* Biometric Face Profile Enrollment Modal */}
      {user && (
        <BiometricEnrollmentModal
          isOpen={showEnrollModal}
          onClose={() => setShowEnrollModal(false)}
          user={user}
          onEnrollmentSuccess={() => {
            setUser((prev) => (prev ? { ...prev, is_enrolled: true } : null));
            setEnrolledTemplatesCount(3);
            loadPunches(user);
          }}
        />
      )}
    </div>
  );
}
