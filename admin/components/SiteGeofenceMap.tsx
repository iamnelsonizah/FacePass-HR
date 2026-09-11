"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import CreateSiteModal from "./CreateSiteModal";

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
  const [siteList, setSiteList] = useState<Site[]>(sites);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setSiteList(sites);
  }, [sites]);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    const setupMap = async () => {
      const leafletModule = await import("leaflet");
      const L = leafletModule.default || leafletModule;

      if (!isMounted || !mapContainerRef.current) return;

      // Prevent duplicate map initialization
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Default center: First site or fallback to Lagos
      const defaultLat = siteList[0]?.latitude || 6.5244;
      const defaultLon = siteList[0]?.longitude || 3.3792;

      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLon],
        zoom: 13,
        zoomControl: true,
      });

      mapInstanceRef.current = map;

      // Click to drop a new site pin
      map.on("click", (e: any) => {
        setClickedCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        setIsModalOpen(true);
      });

      // OpenStreetMap tiles
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // 1. Render Site Geofence Circles
      siteList.forEach((site) => {
      if (!site.latitude || !site.longitude) return;

      // Geofence perimeter circle
      const circle = L.circle([site.latitude, site.longitude], {
        color: "#2563EB",
        fillColor: "#3B82F6",
        fillOpacity: 0.15,
        radius: site.radius_meters || 100,
        weight: 2,
        dashArray: "6, 6",
      }).addTo(map);

      // Site Center Marker
      const siteIcon = L.divIcon({
        className: "custom-site-icon",
        html: `
          <div style="background-color: #1E40AF; color: white; width: 32px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);">
            🏢
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      L.marker([site.latitude, site.longitude], { icon: siteIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: sans-serif; padding: 4px;">
            <strong style="color: #1E40AF; font-size: 14px;">${site.name}</strong>
            <p style="margin: 4px 0 0; font-size: 12px; color: #4B5563;">${site.address || "Main Site"}</p>
            <p style="margin: 2px 0 0; font-size: 11px; color: #6B7280;">Geofence Radius: <strong>${site.radius_meters}m</strong></p>
          </div>
        `);
    });

    // 2. Render Employee Attendance Pins
    attendanceLogs.forEach((log) => {
      if (!log.latitude || !log.longitude) return;

      const empName = log.employees
        ? `${log.employees.first_name} ${log.employees.last_name}`
        : "Employee";

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
          <div style="background-color: ${pinColor}; color: white; width: 26px; height: 26px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">
            ${log.check_type === "check_in" ? "IN" : "OUT"}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      L.marker([log.latitude, log.longitude], { icon: checkIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family: sans-serif; padding: 4px;">
            <strong style="font-size: 13px; color: #111827;">${empName}</strong>
            <p style="margin: 3px 0 0; font-size: 11px; color: #4B5563;">
              Type: <strong style="text-transform: capitalize;">${log.check_type.replace("_", " ")}</strong>
            </p>
            <p style="margin: 2px 0 0; font-size: 11px; color: #4B5563;">
              Trust Score: <strong style="color: ${pinColor}; font-size: 12px;">${log.trust_score}%</strong>
            </p>
            <p style="margin: 2px 0 0; font-size: 10px; color: #9CA3AF;">
              ${new Date(log.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        `);
    });
    };

    setupMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [siteList, attendanceLogs]);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-gray-900 text-base">Live Site Geofence & Location Map</h3>
              <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium border border-blue-100">
                Click map to drop pin
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Real-time visualization of work sites, geofence perimeters, and checked-in staff.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3 text-xs">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                <span className="text-gray-600">Verified (80+)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                <span className="text-gray-600">Moderate (50-79)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                <span className="text-gray-600">Flagged (&lt;50)</span>
              </div>
            </div>

            <button
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
