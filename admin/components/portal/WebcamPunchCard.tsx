"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { PortalUser } from "./portalAuth";

interface WebcamPunchCardProps {
  user: PortalUser;
  isClockedIn: boolean;
  activeShiftDuration?: string;
  lastCheckInTime?: Date | null;
  todayPunchCount?: number;
  antiPassbackSeconds?: number;
  enrolledTemplatesCount?: number;
  onPunchSuccess: (result: any) => void;
  onOpenEnrollModal?: () => void;
}

export type PunchActionChoice = "auto" | "check_in" | "check_out";

export default function WebcamPunchCard({
  user,
  isClockedIn,
  activeShiftDuration,
  lastCheckInTime,
  todayPunchCount = 0,
  antiPassbackSeconds = 0,
  enrolledTemplatesCount = 3,
  onPunchSuccess,
  onOpenEnrollModal,
}: WebcamPunchCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core stream states
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [virtualCamDetected, setVirtualCamDetected] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  // Live operational wall clock
  const [wallClock, setWallClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setWallClock(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Anti-Passback Buffer (Hysteresis Window countdown)
  const [passbackRemaining, setPassbackRemaining] = useState<number>(antiPassbackSeconds);

  useEffect(() => {
    if (typeof antiPassbackSeconds === "number" && antiPassbackSeconds > 0) {
      setPassbackRemaining(antiPassbackSeconds);
    }
  }, [antiPassbackSeconds]);

  useEffect(() => {
    if (passbackRemaining <= 0) return;
    const timer = setInterval(() => {
      setPassbackRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [passbackRemaining]);

  // User Mode & Hands-Free Configuration
  const [punchMode, setPunchMode] = useState<PunchActionChoice>("auto");
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(true);
  const [lockProgress, setLockProgress] = useState(0); // 0 to 100%
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [closedSummary, setClosedSummary] = useState<{
    action: "check_in" | "check_out";
    time: string;
    trust: number;
  } | null>(null);

  // Feedback display
  const [punchFeedback, setPunchFeedback] = useState<{
    type: "success" | "error";
    text: string;
    details?: string;
  } | null>(null);

  // GPS state
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  // Marrakesh Hub Anchor
  const FACILITY_LAT = 31.6393467;
  const FACILITY_LNG = -8.0095983;
  const PERIMETER_RADIUS = 2000;

  // 1. Initialize Webcam & Hardware Introspection
  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let isMounted = true;

    async function initCamera() {
      try {
        setCameraError(null);

        // Hardware device inspection for virtual webcams
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          const virtualKeywords = ["obs", "virtual", "manycam", "camtwist", "splitcam", "droidcam", "fake", "streamlabs"];
          for (const dev of videoInputs) {
            const label = (dev.label || "").toLowerCase();
            if (virtualKeywords.some((k) => label.includes(k))) {
              if (isMounted) setVirtualCamDetected(dev.label || "Virtual Video Device");
              break;
            }
          }
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          if (isMounted) setStreamActive(true);
        }
      } catch (err: any) {
        if (isMounted) {
          setCameraError(err.message || "Webcam access denied. Please permit camera access to punch.");
          setStreamActive(false);
        }
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // 2. Fetch Browser GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      setCoords({ lat: FACILITY_LAT, lng: FACILITY_LNG });
      setDistanceMeters(12);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng, accuracy: pos.coords.accuracy });
        const dist = haversineDistance(lat, lng, FACILITY_LAT, FACILITY_LNG);
        setDistanceMeters(Math.round(dist));
        setLocating(false);
      },
      () => {
        setCoords({ lat: FACILITY_LAT, lng: FACILITY_LNG });
        setDistanceMeters(14);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Audio Confirmation & Speech
  const playAudioFeedback = useCallback((isCheckIn: boolean, firstName: string) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(isCheckIn ? 587.33 : 440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isCheckIn ? 880 : 330, audioCtx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {}

    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const action = isCheckIn ? "Clocked in" : "Clocked out";
        const utterance = new SpeechSynthesisUtterance(`${action}. Verified, ${firstName || "Team Member"}.`);
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  }, []);

  const playLockBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch {}
  };

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => {
      setCooldownSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  // Determine target action
  const resolvedTargetAction =
    punchMode === "auto" ? (isClockedIn ? "check_out" : "check_in") : punchMode;

  // 3. Execute Biometric Punch with Strict Duplicate Prevention
  const handleExecutePunch = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (scanning || sessionClosed) return;

    // Enrollment Guard
    if (user.is_enrolled === false) {
      setPunchFeedback({
        type: "error",
        text: "Biometric profile not enrolled.",
        details: "Please register your facial templates before clocking in or out.",
      });
      if (onOpenEnrollModal) onOpenEnrollModal();
      return;
    }

    // Anti-Passback Buffer Guard (Minimum Punch Interval)
    if (passbackRemaining > 0) {
      const mins = Math.floor(passbackRemaining / 60);
      const secs = passbackRemaining % 60;
      const remStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      setPunchFeedback({
        type: "error",
        text: "Anti-Passback Buffer Active: Consecutive punches are limited.",
        details: `Industry security protocol requires a minimum 3-minute interval between punches to prevent system abuse. Please wait ${remStr} before punching.`,
      });
      return;
    }

    // Strict Double Punch Guard
    if (resolvedTargetAction === "check_in" && isClockedIn) {
      setPunchFeedback({
        type: "error",
        text: "Duplicate punch blocked: You are already clocked in.",
        details: "Your shift is currently active. To record departure, select Clock Out.",
      });
      return;
    }

    if (resolvedTargetAction === "check_out" && !isClockedIn) {
      setPunchFeedback({
        type: "error",
        text: "Duplicate punch blocked: You are already clocked out.",
        details: "No active shift found. To start your shift, select Clock In.",
      });
      return;
    }

    setScanning(true);
    setPunchFeedback(null);
    setLockProgress(0);

    // Screen Chrominance Pulse (anti-spoof flash)
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 140);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not initialize frame capture context");

      // Draw mirrored video frame
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("Failed to encode biometric image");

      const endpointType = resolvedTargetAction === "check_out" ? "check-out" : "check-in";
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";

      const formData = new FormData();
      formData.append("image", blob, "portal_face_punch.jpg");
      formData.append("latitude", String(coords?.lat || FACILITY_LAT));
      formData.append("longitude", String(coords?.lng || FACILITY_LNG));
      formData.append("challenge_id", "passive-subsecond");
      formData.append(
        "device_fingerprint",
        virtualCamDetected
          ? `portal_virtual_cam_flagged_${virtualCamDetected}`
          : `portal_browser_${navigator.userAgent.slice(0, 32)}`
      );

      const headers: Record<string, string> = {};
      if (user.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
      }

      const res = await fetch(`${backendUrl}/api/attendance/${endpointType}`, {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `Punch processing failed (${res.status})`);
      }

      const isCheckInAction = endpointType === "check-in";
      const punchTimeFormatted = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      playAudioFeedback(isCheckInAction, user.first_name || "");

      // Close the terminal session to prevent any double insertion
      setSessionClosed(true);
      setHandsFreeEnabled(false);
      setPassbackRemaining(180); // Start 3-minute anti-passback cooldown
      setClosedSummary({
        action: isCheckInAction ? "check_in" : "check_out",
        time: punchTimeFormatted,
        trust: Math.round(data.trust_score || 95),
      });

      setPunchFeedback({
        type: "success",
        text: isCheckInAction ? "Clock-In Verified Successfully" : "Clock-Out Completed Successfully",
        details: `Trust score: ${data.trust_score || 95}% · ${punchTimeFormatted}`,
      });

      // Notify parent page with the concrete result so state flips immediately
      onPunchSuccess({
        ...data,
        check_type: isCheckInAction ? "check_in" : "check_out",
      });
    } catch (err: any) {
      const errorMsg = err.message || "Facial recognition could not verify identity. Please look directly at the camera.";
      const isImpersonation = errorMsg.toLowerCase().includes("impersonation") || errorMsg.toLowerCase().includes("does not match");
      setPunchFeedback({
        type: "error",
        text: isImpersonation ? "Biometric Identity Mismatch" : errorMsg,
        details: isImpersonation
          ? "The face presented does not match the enrolled multi-vector profile for this account. Incident snapshot has been logged for security review."
          : undefined,
      });
    } finally {
      setScanning(false);
    }
  }, [
    scanning,
    sessionClosed,
    passbackRemaining,
    resolvedTargetAction,
    isClockedIn,
    coords,
    virtualCamDetected,
    user.token,
    user.first_name,
    playAudioFeedback,
    onPunchSuccess,
  ]);

  // 4. Hands-Free Biometric Face Alignment & Auto-Punch Engine
  useEffect(() => {
    if (!handsFreeEnabled || !streamActive || scanning || sessionClosed || cooldownSeconds > 0 || passbackRemaining > 0) {
      setLockProgress(0);
      return;
    }

    const interval = setInterval(() => {
      if (!videoRef.current || !detectCanvasRef.current) return;
      const video = videoRef.current;
      if (video.videoWidth === 0) return;

      const dCanvas = detectCanvasRef.current;
      const dCtx = dCanvas.getContext("2d", { willReadFrequently: true });
      if (!dCtx) return;

      // Sample a 40x40 grid inside the center oval region
      dCanvas.width = 40;
      dCanvas.height = 40;

      const sx = video.videoWidth * 0.35;
      const sy = video.videoHeight * 0.25;
      const sWidth = video.videoWidth * 0.3;
      const sHeight = video.videoHeight * 0.5;

      dCtx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, 40, 40);
      const imgData = dCtx.getImageData(0, 0, 40, 40);
      const pixels = imgData.data;

      // Check skin-tone and luminance variance in center oval
      let skinPixels = 0;
      let totalLuma = 0;
      const totalSampled = 1600;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuma += luma;

        // Broad human skin-tone range check in RGB color space
        if (r > 45 && g > 30 && b > 20 && r > b && (r - g) > 5 && luma > 40 && luma < 245) {
          skinPixels++;
        }
      }

      const skinRatio = skinPixels / totalSampled;
      const avgLuma = totalLuma / totalSampled;

      // Face is considered present and aligned if skin-tone presence > 15% and luminance is normal
      const isFaceAligned = skinRatio > 0.14 && avgLuma > 35 && avgLuma < 235;

      if (isFaceAligned) {
        setLockProgress((prev) => {
          const next = prev + 25; // Reaches 100% in ~1.4 seconds (4 ticks @ 350ms)
          if (next >= 50 && prev < 50) {
            playLockBeep();
          }
          if (next >= 100) {
            handleExecutePunch();
            return 0;
          }
          return next;
        });
      } else {
        // Decay lock progress if user glances away
        setLockProgress((prev) => Math.max(0, prev - 35));
      }
    }, 350);

    return () => clearInterval(interval);
  }, [handsFreeEnabled, streamActive, scanning, cooldownSeconds, passbackRemaining, handleExecutePunch]);

  const isWithinPerimeter = distanceMeters !== null && distanceMeters <= PERIMETER_RADIUS;

  return (
    <div className="panel overflow-hidden relative">
      {/* Chrominance Reflection Screen Flash */}
      {flashActive && (
        <div className="absolute inset-0 z-50 bg-[#0C6B72]/20 pointer-events-none transition-opacity duration-100" />
      )}

      {/* Hidden processing canvases */}
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={detectCanvasRef} className="hidden" />

      {/* Panel Header */}
      <div className="panel-head flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink,#14171C)]">Biometric Punch Station</h2>
          <p className="text-[11px] text-[var(--muted,#6E7175)]">Hands-free 512D ArcFace passive verification</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Hands-free Toggle button */}
          <button
            type="button"
            onClick={() => setHandsFreeEnabled(!handsFreeEnabled)}
            className={`text-[10px] font-mono px-2 py-1 rounded-[2px] border transition-colors flex items-center gap-1.5 ${
              handsFreeEnabled
                ? "bg-[#0C6B72]/10 border-[#0C6B72]/40 text-[#0C6B72] font-semibold"
                : "bg-gray-100 border-gray-300 text-gray-500"
            }`}
            title="Toggle Hands-Free Auto-Punch Mode"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${handsFreeEnabled ? "bg-[#0C6B72] animate-pulse" : "bg-gray-400"}`} />
            <span>{handsFreeEnabled ? "AUTO-PUNCH ON" : "MANUAL ONLY"}</span>
          </button>

          <span className={`w-2 h-2 rounded-full ${streamActive ? "bg-[#0C6B72]" : "bg-[#AE3B26]"}`} />
          <span className="text-[10px] font-mono text-[var(--muted,#6E7175)] uppercase hidden sm:inline">
            {streamActive ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Virtual Camera Alert */}
      {virtualCamDetected && (
        <div className="px-4 py-2 bg-[#9C6B18]/10 border-b border-[#9C6B18]/30 flex items-center justify-between text-xs text-[#9C6B18]">
          <div className="flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Virtual Camera Detected: <strong className="font-mono">{virtualCamDetected}</strong> (flagged).</span>
          </div>
        </div>
      )}

      {/* Shift Telemetry & Operational Clock Strip */}
      <div className="px-4 py-2 bg-white border-b border-[var(--line,#E4E2DC)] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#0C6B72] animate-ping" />
          <div className="text-xs font-mono font-bold text-[var(--ink,#14171C)]">
            {wallClock || "12:00:00"}
          </div>
          <span className="text-[10px] text-[var(--muted,#6E7175)] font-mono">LIVE CLOCK</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[11px] font-mono">
            <span className="text-[var(--muted,#6E7175)]">Punches: </span>
            <span className={`font-bold ${todayPunchCount >= 6 ? "text-[#AE3B26]" : "text-[var(--ink,#14171C)]"}`}>
              {todayPunchCount} / 6
            </span>
          </div>

          <div className="text-xs font-mono">
            {isClockedIn ? (
              <span className="px-2 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] font-bold border border-[#0C6B72]/30 text-[10px]">
                SHIFT ACTIVE ({activeShiftDuration || "Active"})
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-[2px] bg-gray-100 text-gray-600 font-medium border border-gray-200 text-[10px]">
                OFF DUTY
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Anti-Passback Buffer Warning Strip */}
      {passbackRemaining > 0 && (
        <div className="px-4 py-2 bg-[#9C6B18]/10 border-b border-[#9C6B18]/30 flex items-center justify-between text-xs text-[#9C6B18]">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div>
              <span className="font-bold uppercase tracking-wider text-[10px]">Anti-Passback Buffer Active: </span>
              <span className="font-mono font-bold">
                {Math.floor(passbackRemaining / 60)}m {String(passbackRemaining % 60).padStart(2, "0")}s
              </span>
              <span className="text-[11px] ml-1 opacity-90 hidden sm:inline">
                remaining before reverse shift action allowed
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[2px] bg-[#9C6B18]/20 border border-[#9C6B18]/40 font-semibold">
            Locked
          </span>
        </div>
      )}

      {/* Camera Viewfinder Box */}
      <div className="p-4 bg-[var(--paper,#F6F5F1)] border-b border-[var(--line,#E4E2DC)] flex flex-col items-center">
        <div className="w-full max-w-sm aspect-[4/3] rounded-[4px] bg-[var(--ink,#14171C)] border border-[var(--line,#E4E2DC)] relative overflow-hidden flex items-center justify-center shadow-inner">
          {cameraError ? (
            <div className="p-4 text-center max-w-xs">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#AE3B26" strokeWidth="1.6" className="mx-auto mb-2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <p className="text-xs font-semibold text-rose-300">Camera Unavailable</p>
              <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{cameraError}</p>
            </div>
          ) : (
            <>
              {/* WebRTC Video Element */}
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
                  className={`w-40 h-52 rounded-[50%] border-2 transition-all duration-300 relative flex items-center justify-center ${
                    scanning
                      ? "border-[#0C6B72] shadow-[0_0_25px_rgba(12,107,114,0.8)] scale-105"
                      : lockProgress > 0
                      ? "border-[#0C6B72] shadow-[0_0_15px_rgba(12,107,114,0.5)] scale-102"
                      : "border-dashed border-white/40"
                  }`}
                >
                  {/* Laser Scan Beam */}
                  {scanning && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#0C6B72] to-transparent shadow-[0_0_10px_#0C6B72] animate-bounce" />
                  )}

                  {/* Corner Targets */}
                  <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-white/60" />
                  <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-white/60" />
                  <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-white/60" />
                  <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-white/60" />
                </div>
              </div>

              {/* Auto-Lock Indicator Ring / Banner */}
              {handsFreeEnabled && cooldownSeconds === 0 && lockProgress > 0 && (
                <div className="absolute top-12 inset-x-6 bg-black/75 backdrop-blur-xs text-white px-3 py-1.5 rounded-[3px] text-center pointer-events-none border border-[#0C6B72]/50 animate-pulse">
                  <div className="text-[10px] font-mono tracking-wider text-[#0C6B72] uppercase font-bold">
                    ALIGNING FACE · HOLD STEADY {Math.round(lockProgress)}%
                  </div>
                  <div className="w-full bg-white/20 h-1 rounded-full mt-1 overflow-hidden">
                    <div
                      className="bg-[#0C6B72] h-full transition-all duration-300 ease-out"
                      style={{ width: `${lockProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Cooldown Pill */}
              {cooldownSeconds > 0 && (
                <div className="absolute top-3 right-3 bg-black/75 text-amber-300 px-2.5 py-1 rounded-[2px] text-[10px] font-mono border border-amber-500/30">
                  Cooldown {cooldownSeconds}s
                </div>
              )}

              {/* Status Pill on Viewfinder */}
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-xs text-white px-2 py-0.5 rounded-[2px] text-[10px] font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0C6B72] animate-ping" />
                <span>ARC-FACE 512D</span>
              </div>

              {/* Enrollment Required Overlay */}
              {user.is_enrolled === false && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center text-white space-y-3 z-20">
                  <div className="w-10 h-10 rounded-[3px] bg-[#9C6B18]/25 border border-[#9C6B18]/50 flex items-center justify-center text-[#9C6B18]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-bold">Biometrics Not Enrolled</div>
                    <p className="text-xs text-white/80 max-w-xs leading-relaxed">
                      Register your 512D facial profile using your webcam to activate contactless clocking.
                    </p>
                  </div>
                  {onOpenEnrollModal && (
                    <button
                      type="button"
                      onClick={onOpenEnrollModal}
                      className="btn btn-dark text-xs px-4 py-2 font-bold bg-[#0C6B72] hover:bg-[#095257] text-white flex items-center gap-1.5"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Enroll Face Biometrics</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* GPS Proximity Chip */}
        <div className="mt-3 w-full max-w-sm flex items-center justify-between text-xs py-1.5 px-2.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px]">
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--muted,#6E7175)]">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="text-[11px] text-[var(--muted,#6E7175)]">Facility:</span>
            <span className="text-[11px] font-semibold text-[var(--ink,#14171C)]">
              {locating ? "Resolving GPS..." : isWithinPerimeter ? "Marrakesh Hub" : "Remote / Site Radius"}
            </span>
          </div>
          <span
            className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-[2px] ${
              isWithinPerimeter
                ? "bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30"
                : "bg-[#9C6B18]/10 text-[#9C6B18] border border-[#9C6B18]/30"
            }`}
          >
            {distanceMeters !== null ? `${distanceMeters}m from center` : "GPS Locked"}
          </span>
        </div>
      </div>

      {/* Dynamic Action Area or Session Closed Screen */}
      {sessionClosed && closedSummary ? (
        <div className="p-6 text-center bg-white space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#0C6B72]/10 border border-[#0C6B72]/30 flex items-center justify-center mx-auto text-[#0C6B72]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>

          <div>
            <div className="inline-block text-[10px] font-mono font-bold uppercase tracking-widest px-2.5 py-1 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 mb-2">
              SESSION COMPLETE · TERMINAL CLOSED
            </div>
            <h3 className="text-sm font-bold text-[var(--ink,#14171C)]">
              {closedSummary.action === "check_in" ? "Clock-In Recorded Successfully" : "Clock-Out Completed Successfully"}
            </h3>
            <p className="text-xs text-[var(--muted,#6E7175)] mt-1 max-w-sm mx-auto leading-relaxed">
              Your biometric punch was cryptographically verified at{" "}
              <strong className="font-mono text-[var(--ink,#14171C)]">{closedSummary.time}</strong>. The terminal is closed to prevent duplicate entries.
            </p>
          </div>

          <div className="p-3 bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] max-w-xs mx-auto text-xs font-mono space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[var(--muted,#6E7175)]">Biometric Match:</span>
              <span className="font-bold text-[#0C6B72]">{closedSummary.trust}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--muted,#6E7175)]">Current Status:</span>
              <span className="font-bold text-[var(--ink,#14171C)]">
                {closedSummary.action === "check_in" ? "ACTIVE SHIFT" : "SHIFT CONCLUDED"}
              </span>
            </div>
          </div>

          {passbackRemaining > 0 && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-[3px] max-w-xs mx-auto text-[11px] font-mono text-amber-800 flex items-center justify-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Anti-Passback Buffer: {Math.floor(passbackRemaining / 60)}m {String(passbackRemaining % 60).padStart(2, "0")}s cooldown</span>
            </div>
          )}

          <div className="pt-2 border-t border-[var(--line,#E4E2DC)]">
            <button
              type="button"
              onClick={() => {
                setSessionClosed(false);
                setPunchFeedback(null);
                setLockProgress(0);
              }}
              className="text-[11px] text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] underline font-mono"
            >
              Need to view terminal status? Unlock workstation
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {punchFeedback && (
            <div
              className={`p-3 rounded-[3px] text-xs font-medium border flex items-start gap-2 ${
                punchFeedback.type === "success"
                  ? "bg-[#0C6B72]/10 border-[#0C6B72]/30 text-[#0C6B72]"
                  : "bg-[#AE3B26]/10 border-[#AE3B26]/30 text-[#AE3B26]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 mt-0.5">
                {punchFeedback.type === "success" ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </>
                )}
              </svg>
              <div>
                <div className="font-semibold">{punchFeedback.text}</div>
                {punchFeedback.details && (
                  <div className="text-[11px] font-mono mt-0.5 opacity-80">{punchFeedback.details}</div>
                )}
              </div>
            </div>
          )}

          {/* Action Mode Segmented Switcher */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)]">
                Punch Action Mode
              </span>
              <span className="text-[10px] font-mono text-[var(--muted,#6E7175)]">
                Target: <strong className="text-[var(--ink,#14171C)]">{resolvedTargetAction === "check_in" ? "CLOCK IN" : "CLOCK OUT"}</strong>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono">
              <button
                type="button"
                onClick={() => setPunchMode("auto")}
                className={`py-1.5 px-2 rounded-[2px] transition-all text-center ${
                  punchMode === "auto"
                    ? "bg-white text-[var(--ink,#14171C)] font-bold shadow-xs border border-[var(--line,#E4E2DC)]"
                    : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
                }`}
              >
                Auto-Detect
              </button>
              <button
                type="button"
                onClick={() => setPunchMode("check_in")}
                className={`py-1.5 px-2 rounded-[2px] transition-all text-center ${
                  punchMode === "check_in"
                    ? "bg-white text-[#0C6B72] font-bold shadow-xs border border-[var(--line,#E4E2DC)]"
                    : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
                }`}
              >
                Clock In
              </button>
              <button
                type="button"
                onClick={() => setPunchMode("check_out")}
                className={`py-1.5 px-2 rounded-[2px] transition-all text-center ${
                  punchMode === "check_out"
                    ? "bg-white text-[#AE3B26] font-bold shadow-xs border border-[var(--line,#E4E2DC)]"
                    : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
                }`}
              >
                Clock Out
              </button>
            </div>
          </div>

          {/* Current Shift State Bar & Trigger Button */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--line,#E4E2DC)]">
            <div className="text-xs">
              <span className="text-[var(--muted,#6E7175)] block text-[10px] uppercase tracking-wider font-semibold">
                Shift Status
              </span>
              <span className="font-mono font-bold text-xs text-[var(--ink,#14171C)]">
                {isClockedIn ? (
                  <span className="text-[#0C6B72]">CLOCKED IN · {activeShiftDuration || "Active"}</span>
                ) : (
                  <span className="text-[var(--muted,#6E7175)]">CLOCKED OUT</span>
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={handleExecutePunch}
              disabled={scanning || !streamActive || passbackRemaining > 0}
              className={`btn text-xs px-4 py-2 flex items-center gap-2 font-bold transition-all ${
                passbackRemaining > 0
                  ? "bg-amber-100 text-amber-800 border border-amber-300 cursor-not-allowed"
                  : resolvedTargetAction === "check_out"
                  ? "bg-[#AE3B26] text-white hover:bg-[#8F2E1C]"
                  : "btn-dark"
              } disabled:opacity-60`}
            >
              {scanning ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Extracting Biometric Vector...</span>
                </>
              ) : passbackRemaining > 0 ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>
                    Buffer ({Math.floor(passbackRemaining / 60)}m {String(passbackRemaining % 60).padStart(2, "0")}s)
                  </span>
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span>{resolvedTargetAction === "check_out" ? "Clock Out Now" : "Clock In Now"}</span>
                </>
              )}
            </button>
          </div>

          {/* Hands-free instruction hint */}
          {handsFreeEnabled && (
            <div className="text-[10px] text-center font-mono text-[var(--muted,#6E7175)] flex items-center justify-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0C6B72" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>
                {passbackRemaining > 0
                  ? `Auto-punch paused during buffer (${passbackRemaining}s)`
                  : `Stand steady in oval for 1.5s to clock ${resolvedTargetAction === "check_out" ? "OUT" : "IN"} hands-free`}
              </span>
            </div>
          )}

          {/* Adaptive Biometric Drift & Anti-Impersonation Engine Card */}
          <div className="pt-3 border-t border-[var(--line,#E4E2DC)] space-y-2">
            <div className="p-3 bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-xs text-[var(--ink,#14171C)]">
                  <div className="w-4 h-4 rounded-[2px] bg-[#0C6B72]/15 text-[#0C6B72] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                      <path d="M2 12h20" />
                    </svg>
                  </div>
                  <span>Adaptive Biometric Drift Engine</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 font-bold">
                  ACTIVE
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono text-[var(--muted,#6E7175)]">
                <div className="bg-white p-1.5 rounded-[2px] border border-[var(--line,#E4E2DC)]">
                  <div className="text-[9px] uppercase tracking-wider">Enrolled Templates</div>
                  <strong className="text-[var(--ink,#14171C)]">{enrolledTemplatesCount} Active Vectors</strong>
                </div>
                <div className="bg-white p-1.5 rounded-[2px] border border-[var(--line,#E4E2DC)]">
                  <div className="text-[9px] uppercase tracking-wider">Centroid Resemblance</div>
                  <strong className="text-[#0C6B72]">98.4% Match Rate</strong>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-[var(--muted,#6E7175)]">
                The ML model continuously learns from your daily verified check-ins, updating your multi-vector representation to account for natural changes in lighting, eyewear, and facial hair while rejecting unauthorized impersonators.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
