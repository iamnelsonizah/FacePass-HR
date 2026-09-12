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
        className="inline-flex items-center space-x-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
      >
        <span>
          {downloading
            ? `Generating ${downloading === "payroll" ? "Payroll" : "Timesheet"}...`
            : "📊 Export Timesheets ▾"}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white shadow-xl border border-gray-100 z-50 py-1.5 animate-fade-in text-left">
          <div className="px-3.5 py-2 border-b border-gray-100 bg-gray-50/60">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
              Workforce Timesheet Reports
            </span>
          </div>

          <button
            onClick={() => handleExport("detailed")}
            className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50 text-xs font-medium text-gray-800 transition-colors flex items-center justify-between group"
          >
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-emerald-700">
                📅 Daily Shift Timesheet (CSV)
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Check-in, check-out, duration, and overtime
              </p>
            </div>
            <span className="text-gray-400 group-hover:text-emerald-600 font-bold">→</span>
          </button>

          <button
            onClick={() => handleExport("payroll")}
            className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 text-xs font-medium text-gray-800 transition-colors flex items-center justify-between group border-t border-gray-50"
          >
            <div>
              <p className="font-semibold text-gray-900 group-hover:text-blue-700">
                💼 Payroll Summary Report (CSV)
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Total hours & overtime ready for ADP / Deel
              </p>
            </div>
            <span className="text-gray-400 group-hover:text-blue-600 font-bold">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
