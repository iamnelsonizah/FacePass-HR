"use client";

import React, { useState, useEffect } from "react";

interface CreateSiteModalProps {
  initialLat?: number | null;
  initialLng?: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSite: any) => void;
}

export default function CreateSiteModal({
  initialLat,
  initialLng,
  isOpen,
  onClose,
  onSuccess,
}: CreateSiteModalProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState(initialLat ? initialLat.toFixed(6) : "6.5244");
  const [longitude, setLongitude] = useState(initialLng ? initialLng.toFixed(6) : "3.3792");
  const [radius, setRadius] = useState(150);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialLat) setLatitude(initialLat.toFixed(6));
    if (initialLng) setLongitude(initialLng.toFixed(6));
  }, [initialLat, initialLng]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${backendUrl}/api/admin/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Work Site",
          address: address.trim(),
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          radius_meters: Number(radius),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to create site");
      }

      const created = await res.json();
      onSuccess(created);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create site");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🏢</span>
            <h3 className="font-bold text-gray-900 text-lg">Deploy New Geofence Site</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200/50"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Site Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Victoria Island Logistics Hub"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Physical Address
            </label>
            <input
              type="text"
              placeholder="e.g. 14 Adeola Odeku, Lagos"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Latitude (GPS)
              </label>
              <input
                type="number"
                step="any"
                required
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Longitude (GPS)
              </label>
              <input
                type="number"
                step="any"
                required
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Radius Slider */}
          <div className="bg-blue-50/60 border border-blue-100 p-4 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-blue-900">
                Geofence Radius Perimeter
              </label>
              <span className="text-sm font-bold text-blue-700 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200">
                {radius} meters
              </span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="25"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <p className="text-[11px] text-blue-600/80">
              Staff within this radius will be authorized for automatic check-in.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {loading ? "Deploying Site..." : "Save & Activate Site ✓"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
