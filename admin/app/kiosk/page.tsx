"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface PunchResult {
  employee: {
    id: string;
    name: string;
    first_name: string;
    last_name: string;
    employee_code: string;
    avatar_url?: string;
  };
  punch: {
    id: string;
    check_type: "check_in" | "check_out";
    time: string;
    confidence: number;
    trust_score: number;
    session_match_score?: number | null;
    status: string;
    site_name: string;
    image_url?: string;
  };
  message: string;
}

interface RecentPunchItem {
  id: string;
  name: string;
  code: string;
  time: string;
  check_type: "check_in" | "check_out";
  confidence: number;
  avatar_url?: string;
}

export default function KioskPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<"auto" | "check_in" | "check_out">("auto");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [feedback, setFeedback] = useState<string | null>("Position face in oval to scan");
  const [activePunch, setActivePunch] = useState<PunchResult | null>(null);
  const [recentPunches, setRecentPunches] = useState<RecentPunchItem[]>([]);
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
      setCurrentDate(
        now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Web Audio Chime Generator
  const playChime = useCallback((type: "success" | "error" = "success") => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } else {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch {
      // Audio playback ignored
    }
  }, [soundEnabled]);

  // Voice greeting via Web Speech API
  const speakGreeting = useCallback((text: string) => {
    if (!soundEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech ignored
    }
  }, [soundEnabled]);

  // Camera Initialization
  useEffect(() => {
    let isMounted = true;
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            if (!isMounted || !videoRef.current) return;
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  if (isMounted) {
                    setCameraActive(true);
                    setCameraError(null);
                  }
                })
                .catch((err) => {
                  if (err.name !== "AbortError") {
                    console.warn("Video playback note:", err);
                  }
                });
            } else {
              setCameraActive(true);
              setCameraError(null);
            }
          };
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Camera access error:", err);
        setCameraError(
          err.name === "NotAllowedError"
            ? "Camera permission denied. Please allow camera access in browser settings."
            : "No webcam detected or camera is currently busy."
        );
      }
    }

    startCamera();

    return () => {
      isMounted = false;
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = null;
        try {
          videoRef.current.pause();
        } catch (_) {}
        videoRef.current.srcObject = null;
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Perform Face Capture & Recognition
  const triggerScan = useCallback(async () => {
    if (scanning || activePunch || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    setScanning(true);
    setFeedback("Analyzing biometric signature...");

    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize canvas 2D context");

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to Blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
      );

      if (!blob) throw new Error("Could not capture frame");

      const formData = new FormData();
      formData.append("image", blob, "kiosk_frame.jpg");
      formData.append("mode", mode);
      formData.append("device_fingerprint", "reception-ipad-terminal-01");

      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";
      const res = await fetch(`${backendUrl}/api/attendance/kiosk-punch`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.recognized && data.employee) {
        // Recognition Success!
        playChime("success");
        const action = data.punch.check_type === "check_in" ? "checked in" : "checked out";
        speakGreeting(`Welcome, ${data.employee.first_name}! You are ${action}.`);

        setActivePunch(data);
        setFeedback(null);

        // Add to recent punches
        setRecentPunches((prev) => [
          {
            id: data.punch.id,
            name: data.employee.name,
            code: data.employee.employee_code,
            time: data.punch.time,
            check_type: data.punch.check_type,
            confidence: data.punch.confidence,
            avatar_url: data.employee.avatar_url,
          },
          ...prev.slice(0, 4),
        ]);

        // Start 3.5s countdown before resetting
        setResetCountdown(3);
      } else {
        // Recognition Failed or No Face
        if (data.error_code === "NO_FACE_DETECTED") {
          setFeedback("Please position your face directly inside the oval");
        } else {
          setFeedback(data.message || "Face not recognized. Please face camera directly.");
          playChime("error");
        }
      }
    } catch (err: any) {
      console.error("Kiosk scan error:", err);
      setFeedback("Scanner connecting to cloud engine...");
    } finally {
      setScanning(false);
    }
  }, [scanning, activePunch, mode, playChime, speakGreeting]);

  // Auto-Scan interval (runs every 2 seconds when idle)
  useEffect(() => {
    if (!autoScanEnabled || !cameraActive || activePunch || scanning) return;

    const timer = setInterval(() => {
      triggerScan();
    }, 2200);

    return () => clearInterval(timer);
  }, [autoScanEnabled, cameraActive, activePunch, scanning, triggerScan]);

  // Countdown timer to dismiss punch card
  useEffect(() => {
    if (resetCountdown <= 0) {
      if (activePunch) {
        setActivePunch(null);
        setFeedback("Position face in oval to scan");
      }
      return;
    }

    const timer = setTimeout(() => {
      setResetCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [resetCountdown, activePunch]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between select-none overflow-hidden font-sans relative">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* TOP HEADER */}
      <header className="p-4 sm:p-6 flex items-center justify-between z-20 bg-gradient-to-b from-slate-950/90 to-transparent backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center font-black text-xl shadow-lg shadow-blue-500/20 border border-blue-400/30">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white">
                FacePass Kiosk
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Terminal
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Marrakesh Hub • 3d Rue Ibn Sina, Gueliz
            </p>
          </div>
        </div>

        {/* Live Clock & Actions */}
        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <p className="text-lg font-black font-mono tracking-tight text-slate-100">
              {currentTime || "12:00:00 PM"}
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              {currentDate}
            </p>
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
            title="Kiosk Settings"
          >
            ⚙️
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors hidden sm:inline-flex"
            title="Toggle Fullscreen"
          >
            ⛶
          </button>

          <Link
            href="/dashboard"
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700/60 transition-colors flex items-center gap-1"
          >
            ← Admin
          </Link>
        </div>
      </header>

      {/* MAIN VIEWPORT: CAMERA & HUD */}
      <main className="flex-1 relative flex items-center justify-center p-4">
        {/* Camera Feed Frame */}
        <div className="w-full max-w-xl aspect-[4/5] sm:aspect-[4/3] rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 relative shadow-2xl shadow-blue-950/40 flex items-center justify-center">
          {cameraError ? (
            <div className="p-8 text-center max-w-sm">
              <span className="text-5xl block mb-3">📷</span>
              <h3 className="text-base font-bold text-rose-400">Camera Unavailable</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {cameraError}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-500"
              >
                Reload Kiosk
              </button>
            </div>
          ) : (
            <>
              {/* Video Element */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Biometric Oval Guide Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-64 sm:w-72 h-80 sm:h-96 rounded-[50%] border-2 border-dashed transition-all duration-300 relative flex items-center justify-center ${
                    scanning
                      ? "border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.5)] scale-105"
                      : activePunch
                        ? "border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.6)]"
                        : "border-slate-400/40"
                  }`}
                >
                  {/* Laser Scan Line Animation */}
                  {scanning && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_15px_#38bdf8] animate-bounce" />
                  )}

                  {/* Corner brackets */}
                  <div className="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-blue-400 rounded-tl-lg" />
                  <div className="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-blue-400 rounded-tr-lg" />
                  <div className="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-blue-400 rounded-bl-lg" />
                  <div className="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-blue-400 rounded-br-lg" />
                </div>
              </div>

              {/* Guidance HUD Banner */}
              {!activePunch && (
                <div className="absolute bottom-6 inset-x-6 flex flex-col items-center">
                  <div className="bg-slate-950/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700/60 shadow-lg text-center flex items-center gap-2">
                    {scanning ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                        <span className="text-xs font-semibold text-blue-300">
                          Extracting 512D ArcFace Vector...
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-base">👤</span>
                        <span className="text-xs font-medium text-slate-200">
                          {feedback}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    onClick={triggerScan}
                    disabled={scanning}
                    className="mt-3 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <span>📸</span> Tap to Punch
                  </button>
                </div>
              )}
            </>
          )}

          {/* ACTIVE RECOGNITION CONFIRMATION MODAL CARD */}
          {activePunch && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-30 p-6 flex flex-col justify-between items-center text-center animate-fade-in">
              {/* Success Badge */}
              <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                <span>✓</span> Verified Biometric Match
              </div>

              {/* Center Worker Portrait & Greeting */}
              <div className="flex flex-col items-center my-auto">
                <div className="relative mb-3">
                  <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden border-4 border-emerald-400 shadow-2xl shadow-emerald-500/30 bg-slate-800">
                    <img
                      src={activePunch.employee.avatar_url || activePunch.punch.image_url}
                      alt={activePunch.employee.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shadow-md">
                    ✓
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {activePunch.employee.name}
                </h2>
                <p className="text-xs font-mono text-emerald-400 font-semibold mt-0.5">
                  {activePunch.employee.employee_code}
                </p>

                {/* Punch Details Badge */}
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800">
                  <span
                    className={`text-xs font-black uppercase px-2.5 py-1 rounded-lg ${
                      activePunch.punch.check_type === "check_in"
                        ? "bg-emerald-600 text-white"
                        : "bg-blue-600 text-white"
                    }`}
                  >
                    {activePunch.punch.check_type === "check_in" ? "Check In" : "Check Out"}
                  </span>
                  <span className="text-sm font-bold font-mono text-slate-100">
                    {activePunch.punch.time}
                  </span>
                  <span className="text-xs text-slate-400">
                    • {activePunch.punch.site_name}
                  </span>
                </div>

                {/* Match Score */}
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                  <span>Match: <strong className="text-emerald-400">{activePunch.punch.confidence}%</strong></span>
                  {activePunch.punch.session_match_score && (
                    <span>Continuity: <strong className="text-blue-400">{activePunch.punch.session_match_score}%</strong></span>
                  )}
                  <span>Trust: <strong className="text-emerald-400">{activePunch.punch.trust_score}%</strong></span>
                </div>
              </div>

              {/* Progress Reset Bar */}
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Ready for next worker</span>
                  <span>{resetCountdown}s</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-1000 ease-linear"
                    style={{ width: `${(resetCountdown / 3) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* BOTTOM TICKER: RECENT ARRIVALS */}
      <footer className="p-4 sm:p-6 bg-slate-950/80 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Recent Passes:
          </span>
          {recentPunches.length === 0 ? (
            <span className="text-xs text-slate-500 italic">No recent passes yet</span>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto max-w-full">
              {recentPunches.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs shrink-0"
                >
                  <div className="w-5 h-5 rounded-full overflow-hidden bg-slate-800">
                    {p.avatar_url && <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <span className="font-semibold text-slate-200">{p.name}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      p.check_type === "check_in"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-blue-500/20 text-blue-300"
                    }`}
                  >
                    {p.check_type === "check_in" ? "IN" : "OUT"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{p.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mode Indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Mode:</span>
          <span className="font-bold text-blue-400 uppercase bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
            {mode === "auto" ? "Smart Auto-Toggle" : mode === "check_in" ? "Check-In Only" : "Check-Out Only"}
          </span>
        </div>
      </footer>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>⚙️</span> Kiosk Terminal Settings
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              {/* Punch Mode */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">
                  Punch Processing Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["auto", "check_in", "check_out"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`py-2 px-2 rounded-xl font-bold uppercase text-[11px] border transition-colors ${
                        mode === m
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {m === "auto" ? "Auto" : m === "check_in" ? "Check In" : "Check Out"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-slate-800">
                <div>
                  <p className="font-semibold text-slate-200">Voice & Audio Chime</p>
                  <p className="text-[11px] text-slate-500">
                    Announce worker greetings and play verification chime
                  </p>
                </div>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    soundEnabled ? "bg-emerald-600" : "bg-slate-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                      soundEnabled ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* Auto Scan Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-slate-800">
                <div>
                  <p className="font-semibold text-slate-200">Continuous Auto-Scan</p>
                  <p className="text-[11px] text-slate-500">
                    Continuously scan for faces without tapping
                  </p>
                </div>
                <button
                  onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    autoScanEnabled ? "bg-blue-600" : "bg-slate-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
                      autoScanEnabled ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-500"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
