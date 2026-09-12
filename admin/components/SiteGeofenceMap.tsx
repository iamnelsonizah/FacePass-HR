"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import CreateSiteModal from "./CreateSiteModal";
import { createClient } from "@/lib/supabase";

interface Site {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  address?: string;
}

interface AttendancePin {
  id: string;
  latitude: number;
  longitude: number;
  trust_score: number;
  checked_at: string;
  check_type: string;
  employees?: {
    first_name: string;
    last_name: string;
  };
}

interface SiteGeofenceMapProps {
  sites: Site[];
  attendanceLogs: AttendancePin[];
}

export default function SiteGeofenceMap({ sites, attendanceLogs }: SiteGeofenceMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const siteCirclesRef = useRef<Map<string, L.Circle>>(new Map());
  const siteMarkersRef = useRef<Map<string, L.Marker>>(new Map());

  const [siteList, setSiteList] = useState<Site[]>(sites);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Geofence Boundary Editing State
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [editRadius, setEditRadius] = useState<number>(150);
  const [editLat, setEditLat] = useState<number>(31.6393);
  const [editLng, setEditLng] = useState<number>(-8.0096);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Keep a ref in sync for Leaflet event handlers
  const editingSiteRef = useRef<Site | null>(null);
  useEffect(() => {
    editingSiteRef.current = editingSite;
  }, [editingSite]);

  useEffect(() => {
    setSiteList(sites);
  }, [sites]);

  // Quick navigation helper
  const flyToLocation = (lat: number, lng: number, zoom = 16) => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.invalidateSize();
        mapInstanceRef.current.setView([lat, lng], zoom);
      } catch (err) {
        console.warn("Map navigation note:", err);
      }
    }
  };

  // Start editing a site's geofence
  const startEditingSite = (site: Site) => {
    // If already editing another site, clean it up first
    if (editingSite && editingSite.id !== site.id) {
      handleCancelEdit();
    }

    setEditingSite(site);
    setEditRadius(site.radius_meters || 150);
    setEditLat(site.latitude);
    setEditLng(site.longitude);
    setSaveSuccess(false);

    flyToLocation(site.latitude, site.longitude, 16);

    // Enable marker dragging and highlight circle
    const marker = siteMarkersRef.current.get(site.id);
    const circle = siteCirclesRef.current.get(site.id);

    if (marker) {
      if ((marker as any).dragging) {
        (marker as any).dragging.enable();
      }
      marker.on("drag", (e: any) => {
        const pos = e.target.getLatLng();
        setEditLat(pos.lat);
        setEditLng(pos.lng);
        if (circle) {
          circle.setLatLng(pos);
        }
      });
    }

    if (circle) {
      circle.setStyle({
        color: "#2563EB",
        fillColor: "#3B82F6",
        fillOpacity: 0.28,
        weight: 3,
        dashArray: undefined, // solid line during editing
      });
    }
  };

  // Handle live radius slider change
  const handleRadiusChange = (newRadius: number) => {
    setEditRadius(newRadius);
    if (editingSite) {
      const circle = siteCirclesRef.current.get(editingSite.id);
      if (circle) {
        circle.setRadius(newRadius);
      }
    }
  };

  // Cancel editing and revert to original values
  const handleCancelEdit = () => {
    if (!editingSite) return;

    const marker = siteMarkersRef.current.get(editingSite.id);
    const circle = siteCirclesRef.current.get(editingSite.id);

    if (circle) {
      circle.setRadius(editingSite.radius_meters || 150);
      circle.setLatLng([editingSite.latitude, editingSite.longitude]);
      circle.setStyle({
        color: "#2563EB",
        fillColor: "#3B82F6",
        fillOpacity: 0.15,
        weight: 2,
        dashArray: "6, 6",
      });
    }

    if (marker) {
      marker.setLatLng([editingSite.latitude, editingSite.longitude]);
      if ((marker as any).dragging) {
        (marker as any).dragging.disable();
      }
      marker.off("drag");
    }

    setEditingSite(null);
  };

  // Save modified geofence boundary to backend and database
  const handleSaveGeofence = async () => {
    if (!editingSite) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const payload = {
        radius_meters: Number(editRadius),
        latitude: parseFloat(editLat.toFixed(6)),
        longitude: parseFloat(editLng.toFixed(6)),
      };

      // 1. Call FastAPI backend PATCH endpoint
      let backendSuccess = false;
      try {
        const res = await fetch(`${backendUrl}/api/admin/sites/${editingSite.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          backendSuccess = true;
        }
      } catch (e) {
        console.warn("Backend PATCH call note:", e);
      }

      // 2. Direct Supabase update ensures persistence regardless of network routing
      const { error: sbError } = await supabase
        .from("sites")
        .update(payload)
        .eq("id", editingSite.id);

      if (sbError && !backendSuccess) {
        throw new Error(sbError.message || "Failed to update site geofence");
      }

      // 3. Update local state
      setSiteList((prev) =>
        prev.map((s) =>
          s.id === editingSite.id
            ? { ...s, radius_meters: editRadius, latitude: editLat, longitude: editLng }
            : s
        )
      );

      // 4. Update marker & circle appearance
      const marker = siteMarkersRef.current.get(editingSite.id);
      const circle = siteCirclesRef.current.get(editingSite.id);

      if (marker && (marker as any).dragging) {
        (marker as any).dragging.disable();
        marker.off("drag");
      }

      if (circle) {
        circle.setStyle({
          color: "#059669", // brief green border indicating saved
          fillColor: "#10B981",
          fillOpacity: 0.18,
          weight: 2,
          dashArray: "6, 6",
        });
        setTimeout(() => {
          circle.setStyle({
            color: "#2563EB",
            fillColor: "#3B82F6",
            fillOpacity: 0.15,
          });
        }, 2000);
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setEditingSite(null);
        setSaveSuccess(false);
      }, 1200);
    } catch (err: any) {
      console.error("Save geofence error:", err);
      alert(err.message || "Could not save geofence boundary");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;
    const markerMap = new Map<string, L.Marker>();

    const setupMap = async () => {
      const leafletModule = await import("leaflet");
      const L = leafletModule.default || leafletModule;

      if (!isMounted || !mapContainerRef.current) return;

      // Prevent duplicate map initialization
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      siteCirclesRef.current.clear();
      siteMarkersRef.current.clear();

      // Determine center: Prioritize latest attendance punch (where user actually checked in)
      const latestPunch = attendanceLogs.find((l) => l.latitude && l.longitude);
      const marrakeshSite = siteList.find((s) => s.name.toLowerCase().includes("marrakesh"));
      const defaultLat = latestPunch?.latitude || marrakeshSite?.latitude || siteList[0]?.latitude || 31.6393;
      const defaultLon = latestPunch?.longitude || marrakeshSite?.longitude || siteList[0]?.longitude || -8.0096;

      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLon],
        zoom: latestPunch ? 15 : 14,
        zoomControl: true,
      });

      mapInstanceRef.current = map;

      // Map Click Handler: If editing, relocate site center. Otherwise open Create Site modal.
      map.on("click", (e: any) => {
        if (editingSiteRef.current) {
          const newLat = e.latlng.lat;
          const newLng = e.latlng.lng;
          setEditLat(newLat);
          setEditLng(newLng);

          const currentId = editingSiteRef.current.id;
          const marker = siteMarkersRef.current.get(currentId);
          const circle = siteCirclesRef.current.get(currentId);

          if (marker) marker.setLatLng([newLat, newLng]);
          if (circle) circle.setLatLng([newLat, newLng]);
        } else {
          setClickedCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
          setIsModalOpen(true);
        }
      });

      // OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // 1. Render Site Geofence Circles & Markers
      siteList.forEach((site) => {
        if (!site.latitude || !site.longitude) return;

        // Geofence perimeter circle
        const circle = L.circle([site.latitude, site.longitude], {
          color: "#2563EB",
          fillColor: "#3B82F6",
          fillOpacity: 0.15,
          radius: site.radius_meters || 150,
          weight: 2,
          dashArray: "6, 6",
        }).addTo(map);

        siteCirclesRef.current.set(site.id, circle);

        // Site Center Marker
        const siteIcon = L.divIcon({
          className: "custom-site-icon",
          html: `
            <div style="background-color: #1E40AF; color: white; width: 34px; height: 34px; border-radius: 17px; display: flex; align-items: center; justify-content: center; font-size: 17px; border: 2px solid white; box-shadow: 0 4px 8px -1px rgba(0,0,0,0.3); cursor: grab;">
              🏢
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

        const siteMarker = L.marker([site.latitude, site.longitude], { icon: siteIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: sans-serif; padding: 4px; min-width: 170px;">
              <strong style="color: #1E40AF; font-size: 14px;">${site.name}</strong>
              <p style="margin: 4px 0 0; font-size: 12px; color: #4B5563;">${site.address || "Designated Site"}</p>
              <p style="margin: 2px 0 0; font-size: 11px; color: #6B7280;">Geofence Radius: <strong>${site.radius_meters}m</strong></p>
              <p style="margin: 2px 0 0; font-size: 10px; color: #9CA3AF; font-family: monospace;">${site.latitude.toFixed(5)}, ${site.longitude.toFixed(5)}</p>
            </div>
          `);

        siteMarkersRef.current.set(site.id, siteMarker);
      });

      // 2. Render Employee Attendance Pins
      attendanceLogs.forEach((log) => {
        if (!log.latitude || !log.longitude) return;

        const empName = log.employees
          ? `${log.employees.first_name} ${log.employees.last_name}`
          : "Felix Izah";

        // Color code by Trust Score
        let pinColor = "#16A34A"; // Green (Verified)
        if (log.trust_score < 50) {
          pinColor = "#DC2626"; // Red (Flagged)
        } else if (log.trust_score < 75) {
          pinColor = "#D97706"; // Amber (Moderate)
        }

        const checkIcon = L.divIcon({
          className: "custom-attendance-icon",
          html: `
            <div style="background-color: ${pinColor}; color: white; width: 28px; height: 28px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.35);">
              ${log.check_type === "check_in" ? "IN" : "OUT"}
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const snapshotThumb = `https://cspzyayvqyswybqvmdmw.supabase.co/storage/v1/object/public/attendance-snapshots/snapshots/${log.id}.jpg`;

        const marker = L.marker([log.latitude, log.longitude], { icon: checkIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: sans-serif; padding: 4px; min-width: 180px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <img src="${snapshotThumb}" style="width: 38px; height: 38px; border-radius: 6px; object-fit: cover; background: #e2e8f0;" onerror="this.style.display='none'" />
                <div>
                  <strong style="font-size: 13px; color: #111827; display: block;">${empName}</strong>
                  <span style="font-size: 10px; background: ${pinColor}20; color: ${pinColor}; padding: 1px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">
                    ${log.check_type.replace("_", " ")}
                  </span>
                </div>
              </div>
              <p style="margin: 2px 0 0; font-size: 11px; color: #4B5563;">
                Trust Score: <strong style="color: ${pinColor};">${log.trust_score}%</strong>
              </p>
              <p style="margin: 2px 0 0; font-size: 10px; color: #6B7280; font-family: monospace;">
                📍 ${log.latitude.toFixed(4)}, ${log.longitude.toFixed(4)}
              </p>
              <p style="margin: 3px 0 0; font-size: 10px; color: #9CA3AF;">
                ${new Date(log.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          `);

        markerMap.set(log.id, marker);
      });

      // Listen for focus requests from the attendance table
      const handleFocus = (e: any) => {
        if (!isMounted || !mapInstanceRef.current) return;
        const { lat, lng, id } = e.detail || {};
        if (typeof lat === "number" && typeof lng === "number") {
          try {
            mapInstanceRef.current.invalidateSize();
            mapInstanceRef.current.setView([lat, lng], 16);
            const m = markerMap.get(id);
            if (m) {
              setTimeout(() => m.openPopup(), 200);
            }
          } catch (err) {
            console.warn("Map navigation note:", err);
          }
        }
      };

      window.addEventListener("focus-map-coord", handleFocus);

      // If user has a punch, open the latest punch popup automatically
      if (latestPunch) {
        const latestMarker = markerMap.get(latestPunch.id);
        if (latestMarker) {
          setTimeout(() => {
            if (isMounted) latestMarker.openPopup();
          }, 600);
        }
      }

      cleanupListener = () => {
        window.removeEventListener("focus-map-coord", handleFocus);
      };
    };

    let cleanupListener: (() => void) | null = null;
    setupMap();

    return () => {
      isMounted = false;
      if (cleanupListener) {
        cleanupListener();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [siteList, attendanceLogs]);

  // Find latest user punch for quick jump button
  const latestPunch = attendanceLogs.find((l) => l.latitude && l.longitude);

  return (
    <>
      <div id="geofence-map-section" className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-gray-900 text-base">Live Site Geofence & Location Map</h3>
              <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium border border-blue-100">
                {editingSite ? "🎯 Boundary Edit Mode Active" : "Click map to drop pin"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time visualization of work sites, geofence perimeters, and live staff check-ins.
            </p>
          </div>

          {/* Quick-Focus & Site Management Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {latestPunch && (
              <button
                type="button"
                onClick={() => flyToLocation(latestPunch.latitude, latestPunch.longitude, 16)}
                className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span>🎯</span>
                <span>Focus Check-in ({latestPunch.latitude.toFixed(2)}, {latestPunch.longitude.toFixed(2)})</span>
              </button>
            )}

            {siteList.map((site) => (
              <div key={site.id} className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 shadow-xs">
                <button
                  type="button"
                  onClick={() => flyToLocation(site.latitude, site.longitude, 15)}
                  className="px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-white rounded-md transition-colors flex items-center gap-1"
                >
                  <span>🏢</span>
                  <span>{site.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono">({site.radius_meters}m)</span>
                </button>
                <button
                  type="button"
                  onClick={() => startEditingSite(site)}
                  className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors ${
                    editingSite?.id === site.id
                      ? "bg-blue-600 text-white"
                      : "text-blue-600 hover:bg-blue-50"
                  }`}
                  title="Adjust geofence perimeter radius & location"
                >
                  ✏️ Edit
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Interactive Geofence Editor Bar */}
        {editingSite && (
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-2 border-blue-400/40 rounded-xl p-4 space-y-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                </span>
                <h4 className="font-bold text-blue-900 text-sm">
                  Editing Geofence: <span className="underline decoration-blue-400">{editingSite.name}</span>
                </h4>
                <span className="text-[11px] bg-blue-200/60 text-blue-800 font-medium px-2 py-0.5 rounded-full hidden sm:inline-block">
                  Drag 🏢 marker or click map to reposition center
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
                >
                  ✕ Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGeofence}
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <span className="animate-spin text-xs">⏳</span>
                      <span>Saving...</span>
                    </>
                  ) : saveSuccess ? (
                    <>
                      <span>✓</span>
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>Save Boundary</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Radius Slider & Quick Presets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-700">Perimeter Radius:</span>
                  <span className="font-mono font-bold text-blue-700 bg-white px-2.5 py-0.5 rounded border border-blue-200 shadow-xs">
                    {editRadius} meters
                  </span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="500"
                  step="5"
                  value={editRadius}
                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                  className="w-full accent-blue-600 h-2 bg-blue-200/60 rounded-lg cursor-pointer"
                />
                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-gray-400">Presets:</span>
                  {[25, 50, 100, 150, 250, 500].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleRadiusChange(p)}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                        editRadius === p
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white text-gray-600 hover:bg-blue-50 border border-gray-200"
                      }`}
                    >
                      {p}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Coordinates Readout & Explainer */}
              <div className="flex flex-col justify-between bg-white/80 rounded-lg p-3 border border-blue-100 text-xs">
                <div className="flex items-center justify-between text-gray-700">
                  <span className="font-medium">Site Center GPS:</span>
                  <span className="font-mono text-blue-900 font-bold bg-blue-50/50 px-2 py-0.5 rounded">
                    📍 {editLat.toFixed(6)}, {editLng.toFixed(6)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  🛡️ Staff mobile punches outside this {editRadius}m circle are automatically flagged with a trust penalty.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Legend & Deploy Site Action */}
        <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-100 pt-2">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
              <span>Verified Check-in</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Moderate</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
              <span>Flagged</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setClickedCoords(null);
              setIsModalOpen(true);
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1"
          >
            <span>＋</span>
            <span>Deploy Site</span>
          </button>
        </div>

        <div
          ref={mapContainerRef}
          className="w-full h-80 rounded-lg overflow-hidden border border-gray-100 z-0 cursor-crosshair"
        />
      </div>

      <CreateSiteModal
        isOpen={isModalOpen}
        initialLat={clickedCoords?.lat}
        initialLng={clickedCoords?.lng}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(newSite) => {
          setSiteList((prev) => [...prev, newSite]);
        }}
      />
    </>
  );
}
