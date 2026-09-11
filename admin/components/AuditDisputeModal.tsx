"use client";

import React from "react";

export interface DisputeRecord {
  id: string;
  checked_at: string;
  check_type: string;
  trust_score: number | null;
  spoof_score?: number;
  status: string;
  flag_reason?: string | null;
  latitude?: number;
  longitude?: number;
  geofence_distance_meters?: number;
  device_fingerprint?: string;
  image_url?: string;
  employees?: {
    first_name: string;
    last_name: string;
    email: string;
    employee_code?: string;
  };
  sites?: {
    name: string;
  };
}

interface AuditDisputeModalProps {
  record: DisputeRecord | null;
  onClose: () => void;
}

export default function AuditDisputeModal({ record, onClose }: AuditDisputeModalProps) {
  if (!record) return null;

  const emp = record.employees || {
    first_name: "Staff",
    last_name: "Member",
    email: "worker@facepass.com",
  };

  const isVerified = record.status === "verified";
  const score = record.trust_score ?? 0;
  const trustColor =
    score >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    score >= 50 ? "text-amber-700 bg-amber-50 border-amber-200" :
    "text-rose-700 bg-rose-50 border-rose-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">📸</span>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Biometric Audit & Dispute Review</h3>
              <p className="text-xs text-gray-500">Log ID: {record.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-200/60 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Snapshot Frame */}
          <div className="flex flex-col items-center">
            <div className="w-full aspect-square rounded-xl overflow-hidden bg-gray-900 border-2 border-gray-200 flex items-center justify-center relative shadow-inner">
              {record.image_url ? (
                <img
                  src={record.image_url}
                  alt="Audit Snapshot"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-6 text-gray-400">
                  <span className="text-4xl block mb-2">👤</span>
                  <p className="text-xs">Audit Snapshot Encrypted</p>
                  <p className="text-[10px] text-gray-500 mt-1">Stored securely in Supabase Storage</p>
                </div>
              )}

              {/* Status Badge Tag */}
              <div className="absolute top-3 left-3">
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                    record.check_type === "check_in" ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                  }`}
                >
                  {record.check_type === "check_in" ? "Check In" : "Check Out"}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-3 text-center">
              Timestamp: {new Date(record.checked_at).toLocaleString()}
            </p>
          </div>

          {/* Right: Security & Identity Intelligence */}
          <div className="space-y-4">
            {/* Employee Info */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <h4 className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Worker Profile</h4>
              <p className="text-base font-bold text-gray-900 mt-1">
                {emp.first_name} {emp.last_name}
              </p>
              <p className="text-xs text-gray-600">{emp.email}</p>
              {emp.employee_code && (
                <span className="inline-block mt-2 bg-blue-100 text-blue-800 text-[11px] font-mono px-2 py-0.5 rounded">
                  {emp.employee_code}
                </span>
              )}
            </div>

            {/* Trust & Spoof Scoring */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-xl border ${trustColor}`}>
                <span className="text-xs font-semibold block">Trust Score</span>
                <span className="text-2xl font-black">{record.trust_score}%</span>
              </div>
              <div className="p-3 rounded-xl border bg-gray-50 border-gray-200">
                <span className="text-xs font-semibold text-gray-500 block">Status</span>
                <span
                  className={`text-sm font-bold uppercase ${
                    isVerified ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {record.status}
                </span>
              </div>
            </div>

            {/* Flag Reasons */}
            {record.flag_reason && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
                <span className="text-xs font-bold text-rose-800 uppercase block mb-1">Security Flag</span>
                <p className="text-xs text-rose-700 leading-relaxed">{record.flag_reason}</p>
              </div>
            )}

            {/* Geofence & Hardware Details */}
            <div className="text-xs space-y-1.5 text-gray-600 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-400">Site Location:</span>
                <span className="font-semibold text-gray-800">{record.sites?.name || "Main Site"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Geofence Proximity:</span>
                <span className="font-semibold text-gray-800">
                  {record.geofence_distance_meters !== undefined
                    ? `${record.geofence_distance_meters}m from center`
                    : "Within perimeter"}
                </span>
              </div>
              {record.device_fingerprint && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Device Hash:</span>
                  <span className="font-mono text-[11px] text-gray-700">
                    {record.device_fingerprint.slice(0, 16)}...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50/70 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
}
