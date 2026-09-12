"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThreeBiometricMedallion from "@/components/landing/ThreeBiometricMedallion";
import "./landing.css";

export default function LandingPage() {
  const router = useRouter();

  // Clock State
  const [clockTime, setClockTime] = useState("12:00:00 PM");
  const [clockDate, setClockDate] = useState("Saturday, September 12");

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setClockTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
      setClockDate(
        now.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="landing-body">
      {/* ---------- Top Kiosk Bar ---------- */}
      <header className="kiosk-bar">
        <div className="kiosk-brand">
          <svg className="kiosk-mark" width="34" height="34" viewBox="0 0 34 34" fill="none">
            <rect x="1" y="1" width="32" height="32" stroke="#e9e0cd" strokeWidth="1.4" />
            <path d="M17 6 L26 17 L17 28 L8 17 Z" stroke="#b45c37" strokeWidth="1.6" fill="none" />
            <circle cx="17" cy="17" r="4.5" stroke="#e9e0cd" strokeWidth="1.3" fill="none" />
          </svg>
          <div>
            <h1 className="landing-wordmark">FacePass</h1>
            <p>Marrakesh Regional Operations Hub, Site MK-01</p>
          </div>
        </div>

        <div className="kiosk-status">
          <div className="geofence-led">
            <span className="led-dot" />
            <span>Geofence active, 2,000 m radius</span>
          </div>
          <div>
            <div className="clock landing-mono">{clockTime}</div>
            <div className="clock-date">{clockDate}</div>
          </div>
        </div>
      </header>

      {/* ---------- Hero Section ---------- */}
      <section className="hero">
        <div className="hero-inner">
          {/* Left Column: Editorial Hero Copy */}
          <div className="hero-copy">
            <p className="kicker landing-mono">Contactless attendance and visitor gateway</p>
            <h2>Check in at the Marrakesh hub</h2>
            <p>
              Pick the door that fits you. Guests get a pass on the spot with nothing to sign up for. Staff scan in hands-free at the reader. Anyone can pull up their own hours afterward.
            </p>
            <div className="hero-meta landing-mono">
              <div>
                <strong>31.6393° N, 8.0096° W</strong>
                Facility coordinates
              </div>
              <div>
                <strong>InsightFace ArcFace 512D</strong>
                Recognition engine
              </div>
              <div>
                <strong>TLS 1.3</strong>
                Connection to this node
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Three.js 3D Medallion */}
          <div className="hero-art">
            <ThreeBiometricMedallion />
          </div>
        </div>
      </section>

      {/* ---------- Portal Directory ---------- */}
      <section className="directory">
        <div className="directory-head">
          <h3>Choose your entry</h3>
          <span className="landing-mono">All access attempts are logged and audited</span>
        </div>

        <div className="directory-grid">
          {/* Portal 1: Guests and Visitors */}
          <div className="portal visitor">
            <h4>Guests and visitors</h4>
            <p className="portal-tag">No account needed</p>
            <p className="desc">
              Contractors and visiting clients get an instant pass. Enter your details once and clock in or out for the day.
            </p>
            <div className="portal-facts">
              <div>
                <span>Pass type</span>
                <b>Dynamic VIS-XXXX</b>
              </div>
              <div>
                <span>Authentication</span>
                <b>Not required</b>
              </div>
            </div>
            <div className="portal-action">
              <Link href="/visitor" className="portal-btn">
                Start visitor check-in →
              </Link>
            </div>
          </div>

          {/* Portal 2: Staff Face Scan (Inverted Dark Ink Card) */}
          <div className="portal staff">
            <h4>Staff face scan</h4>
            <p className="portal-tag">Primary workstation</p>
            <p className="desc">
              For authorized personnel. Look at the reader and it logs your shift automatically, with anti-passback protection so one badge can&apos;t cover for another.
            </p>
            <div className="portal-facts">
              <div>
                <span>Biometric standard</span>
                <b>ArcFace 512D</b>
              </div>
              <div>
                <span>Recognition mode</span>
                <b>Hands-free auto-scan</b>
              </div>
            </div>
            <div className="portal-action">
              <Link href="/portal" className="portal-btn">
                Open the staff scanner →
              </Link>
            </div>
          </div>

          {/* Portal 3: Timecards and Account */}
          <div className="portal account">
            <h4>Timecards and account</h4>
            <p className="portal-tag">Self-service</p>
            <p className="desc">
              Review your attendance history, check daily hours, or set up your face profile for the first time.
            </p>
            <div className="portal-facts">
              <div>
                <span>Sign-up</span>
                <b>Email code</b>
              </div>
              <div>
                <span>Face profile</span>
                <b>Self-enrollment</b>
              </div>
            </div>
            <div className="portal-action">
              <Link href="/portal" className="portal-btn portal-btn-quiet">
                View my logs
              </Link>
              <Link href="/portal/login" className="portal-btn">
                Sign in or create account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Nameplate Footer ---------- */}
      <footer className="nameplate">
        <div className="nameplate-inner landing-mono">
          <div>
            <span>Facility</span> <b>Marrakesh Hub</b>
          </div>
          <div>
            <span>Perimeter</span> <b>2,000 m enforced</b>
          </div>
          <div>
            <span>Engine</span> <b>InsightFace 512D ArcFace</b>
          </div>
          <div>
            <span>Node</span> <b>Secure, HTTPS TLS 1.3</b>
          </div>
        </div>
        <p className="footnote">
          FacePass HR biometric security system, version 2.4 enterprise. All access attempts are cryptographically validated and audited.
        </p>
      </footer>
    </div>
  );
}
