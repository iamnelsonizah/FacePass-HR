"use client";

import React, { useState, useEffect } from "react";

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
      const res = await fetch(`${backendUrl}/api/admin/digest/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        text: `✓ Report successfully delivered to ${recipientEmail}! Check your inbox or sent records.`,
      });

      setTimeout(() => {
        onClose();
        setResultMsg(null);
      }, 2400);
    } catch (err: any) {
      setResultMsg({
        type: "error",
        text: err.message || "Could not deliver email. Please check network connection.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50/50">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl">📋</span>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Send HR Attendance Digest</h3>
              <p className="text-xs text-gray-500">Automated workforce summary email with shift & KPI rollups</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSend} className="p-6 space-y-4">
          {resultMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold flex items-center space-x-2 ${
                resultMsg.type === "success"
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border border-rose-200 text-rose-800"
              }`}
            >
              <span>{resultMsg.type === "success" ? "🎉" : "⚠️"}</span>
              <span>{resultMsg.text}</span>
            </div>
          )}

          {/* Report Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Digest Report Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReportType("daily")}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center space-x-1.5 ${
                  reportType === "daily"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <span>📅</span>
                <span>Daily Attendance Digest</span>
              </button>
              <button
                type="button"
                onClick={() => setReportType("weekly")}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center space-x-1.5 ${
                  reportType === "weekly"
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <span>💼</span>
                <span>Weekly Payroll Rollup</span>
              </button>
            </div>
          </div>

          {/* Recipient Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Recipient Email</label>
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="hr@company.com"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Addressed To (Name)</label>
              <input
                type="text"
                required
                value={hrName}
                onChange={(e) => setHrName(e.target.value)}
                placeholder="HR Manager"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-gray-800"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <span>👁️</span>
                <span>Live Email Content Preview</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {preview?.date_str || "Marrakesh Hub"}
              </span>
            </div>

            {loadingPreview ? (
              <div className="py-6 text-center text-xs text-gray-400">Loading summary preview...</div>
            ) : preview ? (
              <>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200/60">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Staff Present</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                      {preview.present_count}/{preview.total_employees}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200/60">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Punctuality</div>
                    <div className="text-sm font-extrabold text-emerald-600 mt-0.5">
                      {preview.punctuality_rate}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200/60">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Hours</div>
                    <div className="text-sm font-extrabold text-blue-600 mt-0.5">
                      {preview.total_hours}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200/60">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Overtime</div>
                    <div className="text-sm font-extrabold text-amber-600 mt-0.5">
                      {preview.total_overtime}
                    </div>
                  </div>
                </div>

                {/* Shift snippet */}
                <div className="bg-white rounded-lg border border-slate-200/60 p-2.5 text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-700 text-[11px]">Included Employee Shifts:</div>
                  {preview.shifts && preview.shifts.length > 0 ? (
                    preview.shifts.slice(0, 2).map((s: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-[11px] text-slate-600 border-t border-slate-100 pt-1">
                        <span className="font-medium text-slate-800">{s.employee_name} ({s.employee_code})</span>
                        <span className="text-blue-600 font-semibold">{s.duration}</span>
                        <span className="text-emerald-600 font-semibold">✓ {s.is_on_time ? "On Time" : "Late"}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-400">No shift records for today yet.</div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Delivering Digest...</span>
                </>
              ) : (
                <>
                  <span>📨</span>
                  <span>Send Digest Email Now</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
