"use client";

import { useState, useRef, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase";

export default function TimesheetExportButton() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExport = async (mode: "detailed" | "payroll") => {
    setDownloading(mode);
    setIsOpen(false);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`${backendUrl}/api/admin/export-timesheet?mode=${mode}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Export failed with status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const prefix = mode === "payroll" ? "facepass_payroll_summary" : "facepass_shift_timesheet";
      a.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Export error:", err);
      alert("Failed to export timesheet: " + (err.message || "Unknown error"));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={downloading !== null}
        className="btn btn-dark"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 4v11m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          {downloading
            ? `Generating ${downloading === "payroll" ? "Payroll" : "Timesheet"}...`
            : "Export timesheets"}
        </span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-[6px] bg-white shadow-lg border border-[var(--line)] z-50 py-1 text-left">
          <div className="px-3.5 py-2 border-b border-[var(--line)] bg-[#FBFAF8]">
            <span className="text-[10.5px] font-bold text-[var(--text-faint)] uppercase tracking-wider block">
              Timesheet &amp; Payroll Exports
            </span>
          </div>

          <button
            onClick={() => handleExport("detailed")}
            className="w-full text-left px-3.5 py-2.5 hover:bg-[#F5F4F1] text-xs font-medium text-[var(--text)] transition-colors flex items-center justify-between group"
          >
            <div>
              <p className="font-semibold text-[var(--text)] group-hover:text-[var(--teal)]">
                Daily Shift Timesheet (CSV)
              </p>
              <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                Paired punches, durations, overtime &amp; trust
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--text-faint)] group-hover:text-[var(--teal)]">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            onClick={() => handleExport("payroll")}
            className="w-full text-left px-3.5 py-2.5 hover:bg-[#F5F4F1] text-xs font-medium text-[var(--text)] transition-colors flex items-center justify-between group border-t border-[var(--line)]"
          >
            <div>
              <p className="font-semibold text-[var(--text)] group-hover:text-[var(--teal)]">
                Payroll Summary Report (CSV)
              </p>
              <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                Aggregated payable hours for ADP / Deel
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--text-faint)] group-hover:text-[var(--teal)]">
              <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
