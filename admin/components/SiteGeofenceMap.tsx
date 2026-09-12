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
        color: "#0C6B72",
        fillColor: "#0C6B72",
        fillOpacity: 0.25,
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
        color: "#0C6B72",
        fillColor: "#0C6B72",
        fillOpacity: 0.14,
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
            color: "#0C6B72",
            fillColor: "#0C6B72",
            fillOpacity: 0.14,
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

      // Invalidate size once container layout stabilizes
      setTimeout(() => {
        if (isMounted && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 150);

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
          color: "#0C6B72",
          fillColor: "#0C6B72",
          fillOpacity: 0.14,
          radius: site.radius_meters || 150,
          weight: 2,
          dashArray: "6, 6",
        }).addTo(map);

        siteCirclesRef.current.set(site.id, circle);

        // Site Center Marker
        const siteIcon = L.divIcon({
          className: "custom-site-icon",
          html: `
            <div style="background-color: #14171C; color: white; width: 32px; height: 32px; border-radius: 4px; display: flex; align-items: center; justify-content: center; border: 1px solid #E4E2DC; box-shadow: 0 2px 4px rgba(0,0,0,0.15); cursor: grab;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>
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

        // Color code by Trust Score with semantic ops colors
        let pinColor = "#0C6B72"; // Deep Teal (Verified)
        if (log.trust_score < 50) {
          pinColor = "#AE3B26"; // Brick Red (Flagged)
        } else if (log.trust_score < 75) {
          pinColor = "#9C6B18"; // Amber (Moderate)
        }

        const checkIcon = L.divIcon({
          className: "custom-attendance-icon",
          html: `
            <div style="background-color: ${pinColor}; color: white; width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; font-family: monospace; border: 1.5px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3);">
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
            <div style="font-family: var(--font-archivo, sans-serif); padding: 4px; min-width: 190px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <img src="${snapshotThumb}" style="width: 38px; height: 38px; border-radius: 3px; object-fit: cover; background: #e2e8f0; border: 1px solid #E4E2DC;" onerror="this.style.display='none'" />
                <div>
                  <strong style="font-size: 13px; color: #14171C; display: block;">${empName}</strong>
                  <span style="font-size: 9.5px; font-family: monospace; background: ${pinColor}20; color: ${pinColor}; padding: 1px 6px; border-radius: 2px; font-weight: 700; text-transform: uppercase;">
                    ${log.check_type.replace("_", " ")}
                  </span>
                </div>
              </div>
              <p style="margin: 2px 0 0; font-size: 11px; color: #6E7175;">
                Trust Score: <strong style="font-family: monospace; color: ${pinColor};">${log.trust_score}%</strong>
              </p>
              <p style="margin: 2px 0 0; font-size: 10px; color: #6E7175; font-family: monospace;">
                GPS: ${log.latitude.toFixed(4)}, ${log.longitude.toFixed(4)}
              </p>
              <p style="margin: 3px 0 0; font-size: 10px; color: #6E7175; font-family: monospace;">
                Time: ${new Date(log.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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


  // Primary active site
  const activeSite = siteList[0] || {
    id: "default",
    name: "Marrakesh Hub",
    latitude: 31.6393467,
    longitude: -8.0095983,
    radius_meters: 2000,
  };

  // Latest attendance punch for live telemetry overlay card
  const latestPunch = attendanceLogs[0];
  const latestEmployee = latestPunch?.employees;
  const punchEmpName = latestEmployee
    ? `${latestEmployee.first_name} ${latestEmployee.last_name}`
    : "Felix Izah";
  const punchInitials = punchEmpName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const punchType = latestPunch?.check_type === "check_out" ? "Checked out" : "Checked in";
  const punchTrust = latestPunch?.trust_score ?? 96.75;
  const punchCoords =
    latestPunch?.latitude && latestPunch?.longitude
      ? `${latestPunch.latitude.toFixed(4)}, ${latestPunch.longitude.toFixed(4)}`
      : `${activeSite.latitude.toFixed(4)}, ${activeSite.longitude.toFixed(4)}`;
  const punchTime = latestPunch?.checked_at
    ? new Date(latestPunch.checked_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "03:17 PM";

  const currentRadius = editingSite ? editRadius : activeSite.radius_meters || 2000;

  return (
    <>
      <div id="geofence" className="panel">
        {/* Panel Head */}
        <div className="panel-head">
          <div className="panel-title">
            <div>
              <h2>Live site geofence &amp; location</h2>
              <p>Real-time visualization of work sites, geofence perimeters and staff check-ins</p>
            </div>
          </div>
          <div className="btn-group">
            <button
              type="button"
              onClick={() => {
                if (editingSite) {
                  handleCancelEdit();
                } else {
                  startEditingSite(activeSite);
                }
              }}
              className="btn btn-outline btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3 3 7.5v5C3 17.7 6.8 21.6 12 22.9c5.2-1.3 9-5.2 9-10.4v-5L12 3Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
              </svg>
              {activeSite.name} · {currentRadius}m
              {editingSite ? " (Tuning)" : ""}
            </button>
            <button
              type="button"
              onClick={() => {
                setClickedCoords(null);
                setIsModalOpen(true);
              }}
              className="btn btn-dark btn-sm"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Deploy site
            </button>
          </div>
        </div>

        {/* Perimeter Editor Bar (when toggled) */}
        {editingSite && (
          <div className="p-4 bg-[#FCFAF8] border-b border-[var(--line)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="dot dot-teal"></span>
                <span className="font-semibold text-xs text-[var(--text)]">
                  Perimeter Tuning: <span className="mono">{editingSite.name}</span>
                </span>
                <span className="text-[11px] text-[var(--text-faint)]">
                  Adjust boundary radius for mobile verification
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="btn btn-ghost btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveGeofence}
                  disabled={isSaving}
                  className="btn btn-dark btn-sm"
                >
                  {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save Perimeter"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--text-mute)]">Perimeter Radius:</span>
                  <span className="mono font-bold text-[var(--teal)]">{editRadius}m</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="5000"
                  step="100"
                  value={editRadius}
                  onChange={(e) => setEditRadius(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[var(--teal)]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-[var(--text-mute)]">Quick Presets:</div>
                <div className="flex gap-2">
                  {[500, 1000, 2000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEditRadius(preset)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        editRadius === preset
                          ? "bg-[var(--teal)] text-white border-[var(--teal)]"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {preset >= 1000 ? `${preset / 1000}km` : `${preset}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded p-3 border border-[var(--line)] text-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-[var(--text-mute)]">
                  <span>Center GPS:</span>
                  <span className="mono text-[var(--text)] font-semibold">
                    {editLat.toFixed(4)}, {editLng.toFixed(4)}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-faint)] mt-1">
                  All facial punches outside this {editRadius}m geofence ring will be flagged automatically by the anomaly engine.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Real Interactive Leaflet Geofence Map */}
        <div className="map-wrap" style={{ height: "460px" }}>
          <div
            ref={mapContainerRef}
            className="w-full h-full z-0 cursor-crosshair"
            style={{ minHeight: "460px" }}
          />

          {/* Floating Telemetry Card */}
          {latestPunch && (
            <div className="map-card" style={{ zIndex: 500 }}>
              <div className="map-card-top">
                <div className="map-avatar">{punchInitials}</div>
                <div>
                  <div className="map-card-name">{punchEmpName}</div>
                  <div className="map-card-status flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] inline-block" />
                    <span>{punchType}</span>
                  </div>
                </div>
              </div>
              <div className="map-card-row">
                <span>Trust score</span>
                <span className="mono" style={{ color: "var(--teal)", fontWeight: 700 }}>
                  {punchTrust.toFixed(2)}%
                </span>
              </div>
              <div className="map-card-row">
                <span>Coordinates</span>
                <span className="mono">{punchCoords}</span>
              </div>
              <div className="map-card-row">
                <span>Time</span>
                <span className="mono">{punchTime}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (latestPunch?.latitude && latestPunch?.longitude) {
                    flyToLocation(latestPunch.latitude, latestPunch.longitude, 16);
                  }
                }}
                className="btn btn-outline btn-sm w-full mt-2 text-[11px] py-1"
              >
                Focus on Pin
              </button>
            </div>
          )}

          {/* Map Legend */}
          <div className="map-legend" style={{ zIndex: 500 }}>
            <span>
              <span className="dot dot-teal"></span>Verified
            </span>
            <span>
              <span className="dot dot-amber"></span>Moderate
            </span>
            <span>
              <span className="dot dot-red"></span>Flagged
            </span>
          </div>
        </div>
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
