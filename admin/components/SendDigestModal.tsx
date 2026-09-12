"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

interface SendDigestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SendDigestModal({ isOpen, onClose }: SendDigestModalProps) {
  const [reportType, setReportType] = useState<"daily" | "weekly">("daily");
  const [recipientEmail, setRecipientEmail] = useState("nelsonizah13@gmail.com");
  const [hrName, setHrName] = useState("Felix Izah");
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch digest preview whenever modal opens or report type changes
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadPreview() {
      setLoadingPreview(true);
      setResultMsg(null);
      try {
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";
        const res = await fetch(`${backendUrl}/api/admin/digest/preview?report_type=${reportType}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setPreview(data);
        }
      } catch (err) {
        console.warn("Could not load preview:", err);
      } finally {
        if (isMounted) setLoadingPreview(false);
      }
    }

    loadPreview();
    return () => {
      isMounted = false;
    };
  }, [isOpen, reportType]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setResultMsg(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${backendUrl}/api/admin/digest/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipient_email: recipientEmail.trim(),
          report_type: reportType,
          hr_name: hrName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to send digest email");
      }

      setResultMsg({
        type: "success",
        text: `Report successfully dispatched to ${recipientEmail}.`,
      });

      setTimeout(() => {
        onClose();
        setResultMsg(null);
      }, 2200);
    } catch (err: any) {
      setResultMsg({
        type: "error",
        text: err.message || "Could not deliver email. Verify network connection.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--line,#E4E2DC)] flex items-center justify-between bg-[var(--paper,#F6F5F1)]">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ink,#14171C)]">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <div>
              <h3 className="font-semibold text-[13px] tracking-tight text-[var(--ink,#14171C)]">Dispatch HR Attendance Digest</h3>
              <p className="text-[11px] text-[var(--muted,#6E7175)]">Automated workforce summary report with shift & forensic rollups</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] p-1 rounded transition-colors"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSend} className="p-5 space-y-4">
          {resultMsg && (
            <div
              className={`p-3 rounded-[3px] text-xs font-medium border flex items-center gap-2 ${
                resultMsg.type === "success"
                  ? "bg-[#0C6B72]/10 border-[#0C6B72]/30 text-[#0C6B72]"
                  : "bg-[#AE3B26]/10 border-[#AE3B26]/30 text-[#AE3B26]"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {resultMsg.type === "success" ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </>
                )}
              </svg>
              <span>{resultMsg.text}</span>
            </div>
          )}

          {/* Report Type Selector */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1.5">
              Report Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReportType("daily")}
                className={`py-2 px-3 rounded-[3px] text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                  reportType === "daily"
                    ? "bg-[var(--ink,#14171C)] text-white border-[var(--ink,#14171C)]"
                    : "bg-white text-[var(--ink,#14171C)] border-[var(--line,#E4E2DC)] hover:bg-[var(--paper,#F6F5F1)]"
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>Daily Digest</span>
              </button>
              <button
                type="button"
                onClick={() => setReportType("weekly")}
                className={`py-2 px-3 rounded-[3px] text-xs font-medium border transition-colors flex items-center justify-center gap-1.5 ${
                  reportType === "weekly"
                    ? "bg-[var(--ink,#14171C)] text-white border-[var(--ink,#14171C)]"
                    : "bg-white text-[var(--ink,#14171C)] border-[var(--line,#E4E2DC)] hover:bg-[var(--paper,#F6F5F1)]"
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                </svg>
                <span>Weekly Payroll Rollup</span>
              </button>
            </div>
          </div>

          {/* Recipient Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="hr@company.com"
                className="w-full px-2.5 py-1.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                Addressed To
              </label>
              <input
                type="text"
                required
                value={hrName}
                onChange={(e) => setHrName(e.target.value)}
                placeholder="HR Operations"
                className="w-full px-2.5 py-1.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] p-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[11px] uppercase tracking-wider text-[var(--muted,#6E7175)] flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>Live Data Preview</span>
              </span>
              <span className="text-[11px] text-[var(--muted,#6E7175)] font-mono">
                {preview?.date_str || "Marrakesh Hub"}
              </span>
            </div>

            {loadingPreview ? (
              <div className="py-4 text-center text-xs text-[var(--muted,#6E7175)] font-mono">Loading preview data...</div>
            ) : preview ? (
              <>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2 rounded-[3px] border border-[var(--line,#E4E2DC)]">
                    <div className="text-[9px] text-[var(--muted,#6E7175)] uppercase tracking-wider font-medium">Headcount</div>
                    <div className="text-sm font-semibold font-mono text-[var(--ink,#14171C)] mt-0.5">
                      {preview.present_count}/{preview.total_employees}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-[3px] border border-[var(--line,#E4E2DC)]">
                    <div className="text-[9px] text-[var(--muted,#6E7175)] uppercase tracking-wider font-medium">Punctuality</div>
                    <div className="text-sm font-semibold font-mono text-[#0C6B72] mt-0.5">
                      {preview.punctuality_rate}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-[3px] border border-[var(--line,#E4E2DC)]">
                    <div className="text-[9px] text-[var(--muted,#6E7175)] uppercase tracking-wider font-medium">Gross Hours</div>
                    <div className="text-sm font-semibold font-mono text-[var(--ink,#14171C)] mt-0.5">
                      {preview.total_hours}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-[3px] border border-[var(--line,#E4E2DC)]">
                    <div className="text-[9px] text-[var(--muted,#6E7175)] uppercase tracking-wider font-medium">Overtime</div>
                    <div className="text-sm font-semibold font-mono text-[#9C6B18] mt-0.5">
                      {preview.total_overtime}
                    </div>
                  </div>
                </div>

                {/* Shift snippet */}
                <div className="bg-white rounded-[3px] border border-[var(--line,#E4E2DC)] p-2 text-xs space-y-1">
                  <div className="font-semibold text-[10px] uppercase tracking-wider text-[var(--muted,#6E7175)]">Sample Shift Rows</div>
                  {preview.shifts && preview.shifts.length > 0 ? (
                    preview.shifts.slice(0, 2).map((s: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[11px] border-t border-[var(--line,#E4E2DC)] pt-1">
                        <span className="font-medium text-[var(--ink,#14171C)]">{s.employee_name} <span className="font-mono text-[10px] text-[var(--muted,#6E7175)]">({s.employee_code})</span></span>
                        <span className="font-mono text-[var(--ink,#14171C)]">{s.duration}</span>
                        <span className={`font-mono text-[10px] ${s.is_on_time ? "text-[#0C6B72]" : "text-[#AE3B26]"}`}>
                          {s.is_on_time ? "ON TIME" : "LATE"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-[var(--muted,#6E7175)] font-mono">No shift logs available.</div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline text-xs px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="btn btn-dark text-xs px-3.5 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  <span>Dispatch Digest</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
