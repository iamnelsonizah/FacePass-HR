"use client";

import { useState, useEffect } from "react";

interface SidebarNavProps {
  alertCount?: number;
}

export default function SidebarNav({ alertCount = 0 }: SidebarNavProps) {
  const [activeItem, setActiveItem] = useState("overview");

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash) setActiveItem(hash);
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const scrollTo = (id: string) => {
    setActiveItem(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="sidebar-nav">
      <div className="nav-group-label">Operations</div>

      <a
        href="#overview"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("overview");
        }}
        className={`nav-item ${activeItem === "overview" ? "active" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="9" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
          <rect x="14" y="3" width="7" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
          <rect x="14" y="12" width="7" height="9" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
          <rect x="3" y="16" width="7" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>Overview</span>
      </a>

      <a
        href="#employees"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("employees");
        }}
        className={`nav-item ${activeItem === "employees" ? "active" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 20c0-3.5 2.8-6 5.5-6s5.5 2.5 5.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M15.5 5.3c1.4.4 2.4 1.7 2.4 3.2 0 1.5-1 2.8-2.4 3.2M18.5 20c0-2.9-1.9-5.2-4.3-5.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>Employees</span>
      </a>

      <a
        href="#visitors"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("visitors");
        }}
        className={`nav-item ${activeItem === "visitors" ? "active" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect width="18" height="18" x="3" y="3" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 17a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>Visitors &amp; guests</span>
      </a>

      <a
        href="#logs"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("logs");
        }}
        className={`nav-item ${activeItem === "logs" ? "active" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.5 9.5h17M8 3v3M16 3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>Attendance logs</span>
      </a>

      <a
        href="#geofence"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("geofence");
        }}
        className={`nav-item ${activeItem === "geofence" ? "active" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 21s7-5.1 7-11.2A7 7 0 0 0 5 9.8C5 15.9 12 21 12 21Z" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12" cy="9.6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>Sites &amp; geofence</span>
      </a>

      <a
        href="#alerts"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("alerts");
        }}
        className={`nav-item ${activeItem === "alerts" ? "active" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 3 3 7.5v5C3 17.7 6.8 21.6 12 22.9c5.2-1.3 9-5.2 9-10.4v-5L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        <span>Alerts</span>
        {alertCount > 0 && <span className="nav-count">{alertCount}</span>}
      </a>

      <div className="nav-group-label" style={{ marginTop: "12px" }}>
        Finance
      </div>

      <a
        href="#timesheets"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("timesheets");
        }}
        className={`nav-item ${activeItem === "timesheets" ? "active" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 7.5v9M9.3 15c.3 1 1.3 1.6 2.7 1.6 1.7 0 2.8-.8 2.8-2S13.6 12.7 12 12.5c-1.6-.2-2.7-.8-2.7-2 0-1.2 1.1-2 2.7-2 1.4 0 2.4.6 2.7 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>Payroll</span>
      </a>

      <a
        href="#overview"
        onClick={(e) => {
          e.preventDefault();
          scrollTo("overview");
        }}
        className="nav-item"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>Settings</span>
      </a>
    </nav>
  );
}
