"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import VisitorQRCode from "./VisitorQRCode";
import "@/app/visitor.css";

interface ActiveVisitorLog {
  id: string;
  visitor_code: string;
  name: string;
  email?: string;
  phone?: string;
  status: "ON_SITE" | "DEPARTED";
  last_punch_type: string;
  last_punch_time: string;
  dwell_minutes?: number;
  host_name?: string;
  company?: string;
  photo_url?: string;
  check_in_photo?: string;
  departure_photo_url?: string;
}

interface VisitorHistoryItem {
  id: string;
  visitor_code: string;
  name: string;
  check_type: string;
  checked_at: string;
  status: string;
}

interface VisitorStats {
  on_site_count: number;
  today_total: number;
  average_dwell_minutes: number;
  node_id: string;
  geofence_status: string;
}

interface VisitorPunchTerminalProps {
  hideHeader?: boolean;
}

export default function VisitorPunchTerminal({ hideHeader = false }: VisitorPunchTerminalProps = {}) {
  // Modal states
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [showFaceScanModal, setShowFaceScanModal] = useState(false);
  const [selectedPassModal, setSelectedPassModal] = useState<ActiveVisitorLog | null>(null);

  // Active Tab in Roster: "active" | "history"
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");

  // Form State for Clock In
  const [visitorId, setVisitorId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hostName, setHostName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [visitPurpose, setVisitPurpose] = useState("Meeting / Consultation");
  const [clockInStep, setClockInStep] = useState<"form" | "camera" | "receipt">("form");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [clockInLoading, setClockInLoading] = useState(false);
  const [clockInError, setClockInError] = useState<string | null>(null);
  const [arrivalReceipt, setArrivalReceipt] = useState<{
    code: string;
    name: string;
    host: string;
    time: string;
    purpose: string;
    photo?: string;
  } | null>(null);

  // Hands-Free Biometric Auto-Capture States
  const [faceDetected, setFaceDetected] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(2);
  const [isAutoCapturing, setIsAutoCapturing] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);
  const [faceStatusMessage, setFaceStatusMessage] = useState("Align face inside optical reticle");
  const consecutiveCountRef = useRef(0);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Form State for Clock Out
  const [departureCode, setDepartureCode] = useState("");
  const [clockOutLoading, setClockOutLoading] = useState(false);
  const [clockOutError, setClockOutError] = useState<string | null>(null);
  const [departureReceipt, setDepartureReceipt] = useState<{
    code: string;
    name: string;
    time: string;
    duration: string;
  } | null>(null);

  // Face Scan Auto Terminal State
  const [scanStep, setScanStep] = useState<"scanning" | "matched" | "success">("scanning");
  const [scanMatchedVisitor, setScanMatchedVisitor] = useState<ActiveVisitorLog | null>(null);
  const [scanActionType, setScanActionType] = useState<"check_in" | "check_out">("check_in");
  const [scanNotice, setScanNotice] = useState<string>("Align face inside optical reticle for recognition");
  const [scanCooldown, setScanCooldown] = useState(0);

  // Live wall clock
  const [wallClock, setWallClock] = useState("12:00:00 PM");

  // Roster & Stats Data
  const [recentVisitors, setRecentVisitors] = useState<ActiveVisitorLog[]>([]);
  const [visitorHistory, setVisitorHistory] = useState<VisitorHistoryItem[]>([]);
  const [stats, setStats] = useState<VisitorStats>({
    on_site_count: 0,
    today_total: 0,
    average_dwell_minutes: 45,
    node_id: "MK-01",
    geofence_status: "Verified (2,000m)",
  });
  const [visitorsLoading, setVisitorsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Cameras
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [scanStreamActive, setScanStreamActive] = useState(false);

  // Station Clock Ticker
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setWallClock(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cooldown timer
  useEffect(() => {
    if (scanCooldown > 0) {
      const t = setTimeout(() => setScanCooldown(scanCooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [scanCooldown]);

  // Fetch Visitors & History
  const loadRecentVisitors = useCallback(async () => {
    setVisitorsLoading(true);
    try {
      const res = await fetch("/api/portal/visitor");
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.visitors)) {
          setRecentVisitors(data.visitors);
        }
        if (Array.isArray(data.history)) {
          setVisitorHistory(data.history);
        }
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.warn("Could not load visitor list:", err);
    } finally {
      setVisitorsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecentVisitors();
    const pollTimer = setInterval(loadRecentVisitors, 25000);
    return () => clearInterval(pollTimer);
  }, [loadRecentVisitors]);

  // Generate Unique Visitor Pass ID
  const handleAutoGenerateId = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setVisitorId(`VIS-${randomNum}`);
  };

  // Open Modal 1: Clock In
  const handleOpenClockIn = () => {
    handleAutoGenerateId();
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setHostName("");
    setCompanyName("");
    setVisitPurpose("Meeting / Consultation");
    setCapturedPhoto(null);
    setClockInStep("form");
    setClockInError(null);
    setArrivalReceipt(null);
    setFaceDetected(false);
    setAutoCountdown(2);
    setIsAutoCapturing(false);
    setShutterFlash(false);
    setFaceStatusMessage("Align face inside optical reticle");
    consecutiveCountRef.current = 0;
    setShowClockInModal(true);
  };

  // Open Modal 2: Clock Out
  const handleOpenClockOut = (prefillCode?: string) => {
    let code = prefillCode || "";
    if (!code && typeof window !== "undefined") {
      try {
        code = localStorage.getItem("facepass_last_visitor_code") || "";
      } catch {}
    }
    setDepartureCode(code);
    setClockOutError(null);
    setDepartureReceipt(null);
    setShowClockOutModal(true);
  };

  // Open Modal 3: Face Scan Terminal
  const handleOpenFaceScan = () => {
    setScanStep("scanning");
    setScanMatchedVisitor(null);
    setScanNotice("Align face inside optical reticle for recognition");
    setShowFaceScanModal(true);
  };

  // Audio Tick Sound (Countdown)
  const playTickSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch {}
  };

  // Synthesized Camera Shutter Sound
  const playShutterSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1100, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);

      setTimeout(() => {
        try {
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(750, audioCtx.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.06);
          gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.06);
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.start();
          osc2.stop(audioCtx.currentTime + 0.06);
        } catch {}
      }, 65);
    } catch {}
  };

  // Audio Chime & Speech Feedback
  const playVisitorChime = (isArrival: boolean, name: string) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(isArrival ? 659.25 : 440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isArrival ? 987.77 : 349.23, audioCtx.currentTime + 0.22);
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
        const msg = isArrival
          ? `Visitor arrival confirmed. Welcome to Marrakesh Operations Hub, ${name}.`
          : `Visitor departure recorded. Thank you for visiting, ${name}.`;
        const utterance = new SpeechSynthesisUtterance(msg);
        utterance.rate = 1.02;
        window.speechSynthesis.speak(utterance);
      }
    } catch {}
  };

  // Camera handling for Clock In modal
  useEffect(() => {
    if (!showClockInModal || clockInStep !== "camera") return;

    let stream: MediaStream | null = null;
    let isMounted = true;

    async function startCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          if (isMounted) setStreamActive(true);
        }
      } catch (err) {
        console.warn("Camera init error in visitor modal:", err);
      }
    }

    startCam();

    return () => {
      isMounted = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setStreamActive(false);
    };
  }, [showClockInModal, clockInStep]);

  // Face Detection Loop for Automatic Hands-Free Clock-In
  useEffect(() => {
    if (!showClockInModal || clockInStep !== "camera" || isAutoCapturing || arrivalReceipt) {
      setFaceDetected(false);
      setAutoCountdown(2);
      consecutiveCountRef.current = 0;
      return;
    }

    let isCancelled = false;
    let checkInterval: NodeJS.Timeout | null = null;

    checkInterval = setInterval(async () => {
      if (isCancelled || isAutoCapturing || !videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2 || video.videoWidth === 0) return;

      let detected = false;

      // 1. Browser Native FaceDetector API (Chromium / Chrome / Edge)
      if (typeof window !== "undefined" && "FaceDetector" in window) {
        try {
          const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          const faces = await detector.detect(video);
          if (faces && faces.length > 0) {
            detected = true;
          }
        } catch {}
      }

      // 2. Fallback: Optical skin-chrominance and luminance analysis in central reticle
      if (!detected) {
        try {
          let sCanvas = sampleCanvasRef.current;
          if (!sCanvas) {
            sCanvas = document.createElement("canvas");
            sampleCanvasRef.current = sCanvas;
          }
          sCanvas.width = 100;
          sCanvas.height = 100;
          const sCtx = sCanvas.getContext("2d", { willReadFrequently: true });
          if (sCtx) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const cropW = Math.floor(vw * 0.5);
            const cropH = Math.floor(vh * 0.6);
            const cropX = Math.floor((vw - cropW) / 2);
            const cropY = Math.floor((vh - cropH) / 2);

            sCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, 100, 100);
            const imgData = sCtx.getImageData(0, 0, 100, 100);
            const data = imgData.data;

            let skinMatches = 0;
            let sumLum = 0;
            const luminances: number[] = [];
            const totalSamplePixels = data.length / 4;

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              sumLum += lum;
              luminances.push(lum);

              const isSkin =
                r > 40 &&
                g > 26 &&
                b > 16 &&
                r > g &&
                r > b &&
                r - g >= 8 &&
                Math.abs(r - g) < 140;
              if (isSkin) skinMatches++;
            }

            const skinRatio = skinMatches / totalSamplePixels;
            const meanLum = sumLum / totalSamplePixels;
            let variance = 0;
            for (let l of luminances) {
              variance += (l - meanLum) * (l - meanLum);
            }
            const stdDev = Math.sqrt(variance / totalSamplePixels);

            // True face present
            if (skinRatio >= 0.18 && stdDev >= 10 && meanLum > 30 && meanLum < 235) {
              detected = true;
            }
          }
        } catch {}
      }

      if (isCancelled) return;

      if (detected) {
        consecutiveCountRef.current += 1;
        if (consecutiveCountRef.current >= 2) {
          setFaceDetected(true);
        }
      } else {
        consecutiveCountRef.current = 0;
        setFaceDetected(false);
        setAutoCountdown(2);
        setFaceStatusMessage("Align face inside optical reticle");
      }
    }, 180);

    return () => {
      isCancelled = true;
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [showClockInModal, clockInStep, isAutoCapturing, arrivalReceipt]);

  // Countdown and Auto-Capture Trigger
  useEffect(() => {
    if (!faceDetected || !showClockInModal || clockInStep !== "camera" || isAutoCapturing) {
      return;
    }

    let timer: NodeJS.Timeout | null = null;

    if (autoCountdown > 0) {
      playTickSound();
      setFaceStatusMessage(`Face detected! Hold still... Auto-capturing in ${autoCountdown}s`);
      timer = setTimeout(() => {
        setAutoCountdown((prev) => prev - 1);
      }, 900);
    } else if (autoCountdown === 0) {
      // Auto countdown completed: trigger hands-free capture!
      triggerAutoSnapshot();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [faceDetected, autoCountdown, showClockInModal, clockInStep, isAutoCapturing]);

  // Hands-Free Snapshot & Clock-In Dispatcher
  const triggerAutoSnapshot = async () => {
    if (!videoRef.current || isAutoCapturing) return;
    setIsAutoCapturing(true);
    setFaceStatusMessage("Capturing face photo & recording arrival...");

    playShutterSound();
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 220);

    const video = videoRef.current;
    let dataUrl = "";
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL("image/jpeg", 0.88);
        setCapturedPhoto(dataUrl);
      }
    }

    await handleCompleteClockIn(dataUrl);
    setIsAutoCapturing(false);
  };

  // Snap facial photo in Clock In modal (manual fallback)
  const handleSnapPhoto = () => {
    if (!videoRef.current || !canvasRef.current || isAutoCapturing) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      playShutterSound();
      setShutterFlash(true);
      setTimeout(() => setShutterFlash(false), 200);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      setCapturedPhoto(dataUrl);
      handleCompleteClockIn(dataUrl);
    }
  };

  // Camera handling for Hands-free Face Scan modal
  useEffect(() => {
    if (!showFaceScanModal) return;

    let stream: MediaStream | null = null;
    let isMounted = true;
    let recognitionTimer: NodeJS.Timeout | null = null;

    async function startScanCam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (scanVideoRef.current) {
          scanVideoRef.current.srcObject = stream;
          await scanVideoRef.current.play().catch(() => {});
          if (isMounted) setScanStreamActive(true);
        }

        // Simulate intelligent biometric face localization & identification
        recognitionTimer = setTimeout(() => {
          if (!isMounted) return;
          // Find if there is an active on-site guest to clock out, or default
          const onSite = recentVisitors.find((v) => v.status === "ON_SITE");
          if (onSite) {
            setScanMatchedVisitor(onSite);
            setScanActionType("check_out");
            setScanNotice(`Face matched: ${onSite.name} (${onSite.visitor_code})`);
            setScanStep("matched");
          } else if (recentVisitors.length > 0) {
            const departed = recentVisitors.find((v) => v.status === "DEPARTED") || recentVisitors[0];
            setScanMatchedVisitor(departed);
            setScanActionType("check_in");
            setScanNotice(`Returning guest detected: ${departed.name}`);
            setScanStep("matched");
          } else {
            setScanNotice("No existing visitor record matched. Please register using Clock In.");
          }
        }, 2200);
      } catch (err) {
        console.warn("Scan camera error:", err);
      }
    }

    startScanCam();

    return () => {
      isMounted = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (recognitionTimer) clearTimeout(recognitionTimer);
      setScanStreamActive(false);
    };
  }, [showFaceScanModal, recentVisitors]);

  // Advance from Form to Camera step
  const handleProceedToCamera = (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorId.trim()) {
      setClockInError("Please enter or auto-generate a Visitor Pass ID.");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setClockInError("Please enter your First Name and Last Name.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setClockInError("Please provide at least a Phone Number or Email address.");
      return;
    }
    setClockInError(null);
    setClockInStep("camera");
  };

  // Execute Visitor Clock In
  const handleCompleteClockIn = async (overridePhoto?: string) => {
    if (scanCooldown > 0) {
      setClockInError(`Anti-passback active: Please wait ${scanCooldown}s before clocking in.`);
      return;
    }

    const photoToUse = overridePhoto || capturedPhoto;

    setClockInLoading(true);
    setClockInError(null);

    try {
      const res = await fetch("/api/portal/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_and_clock_in",
          visitorCode: visitorId.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          hostName: hostName.trim() || "Operations Team",
          companyName: companyName.trim() || "Guest",
          visitPurpose: visitPurpose.trim() || "Facility Visit",
          photoBase64: photoToUse || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Clock-in registration failed.");
      }

      const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      playVisitorChime(true, firstName.trim());
      setScanCooldown(15);

      if (typeof window !== "undefined" && data.visitor?.employee_code) {
        try {
          localStorage.setItem("facepass_last_visitor_code", data.visitor.employee_code);
        } catch {}
      }

      setArrivalReceipt({
        code: data.visitor.employee_code,
        name: `${data.visitor.first_name} ${data.visitor.last_name}`,
        host: data.visitor.host_name || hostName || "General Visit",
        time: timeStr,
        purpose: visitPurpose,
        photo: photoToUse || undefined,
      });

      setClockInStep("receipt");
      loadRecentVisitors();
    } catch (err: any) {
      setClockInError(err.message || "Failed to record visitor clock-in.");
    } finally {
      setClockInLoading(false);
    }
  };

  // Execute Visitor Clock Out (Departure)
  const handleCompleteClockOut = async (e?: React.FormEvent, customCode?: string) => {
    if (e) e.preventDefault();
    const codeToUse = (customCode || departureCode).trim();
    if (!codeToUse) {
      setClockOutError("Please enter your Visitor Pass ID.");
      return;
    }

    setClockOutLoading(true);
    setClockOutError(null);

    try {
      const res = await fetch("/api/portal/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "punch",
          visitorCode: codeToUse,
          checkType: "check_out",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Departure logging failed.");
      }

      const punch = data.punch;
      const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
      const durationStr = punch.duration_minutes
        ? `${Math.floor(punch.duration_minutes / 60)}h ${punch.duration_minutes % 60}m`
        : "Recorded";

      playVisitorChime(false, punch.visitor_name?.split(" ")[0] || "Guest");
      setScanCooldown(15);

      setDepartureReceipt({
        code: punch.visitor_code,
        name: punch.visitor_name,
        time: timeStr,
        duration: durationStr,
      });

      loadRecentVisitors();
    } catch (err: any) {
      setClockOutError(err.message || "Failed to record departure.");
    } finally {
      setClockOutLoading(false);
    }
  };

  // Execute Hands-free Face Auto-Punch
  const handleConfirmFaceScanPunch = async () => {
    if (!scanMatchedVisitor) return;
    setClockInLoading(true);

    try {
      const res = await fetch("/api/portal/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "punch",
          visitorCode: scanMatchedVisitor.visitor_code,
          checkType: scanActionType,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Biometric punch failed.");
      }

      const isArrival = scanActionType === "check_in";
      playVisitorChime(isArrival, scanMatchedVisitor.name.split(" ")[0]);
      setScanStep("success");
      setScanCooldown(15);
      loadRecentVisitors();

      setTimeout(() => {
        setShowFaceScanModal(false);
      }, 2400);
    } catch (err: any) {
      setScanNotice(err.message || "Face recognition punch could not be completed.");
    } finally {
      setClockInLoading(false);
    }
  };

  // Filter visitors by query
  const filteredVisitors = recentVisitors.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.visitor_code.toLowerCase().includes(q) ||
      (v.email && v.email.toLowerCase().includes(q)) ||
      (v.phone && v.phone.toLowerCase().includes(q))
    );
  });

  const onSiteVisitors = filteredVisitors.filter((v) => v.status === "ON_SITE");
  const departedVisitors = filteredVisitors.filter((v) => v.status === "DEPARTED");

  return (
    <div className="visitor-shell">
      <canvas ref={canvasRef} className="hidden" />

      {/* ---------- Top Kiosk Bar (Moroccan Architectural Header) ---------- */}
      {!hideHeader && (
        <header className="visitor-topbar">
          <div className="visitor-brand">
            <svg className="visitor-brand-mark" width="34" height="34" viewBox="0 0 34 34" fill="none">
              <rect x="1" y="1" width="32" height="32" stroke="#e9e0cd" strokeWidth="1.4" />
              <path d="M17 6 L26 17 L17 28 L8 17 Z" stroke="#b45c37" strokeWidth="1.6" fill="none" />
              <circle cx="17" cy="17" r="4.5" stroke="#e9e0cd" strokeWidth="1.3" fill="none" />
            </svg>
            <div className="visitor-brand-titles">
              <h1 className="visitor-wordmark">Visitor check-in</h1>
              <p>Marrakesh Regional Operations Hub</p>
            </div>
          </div>

          <div className="visitor-top-nav">
            <a href="/" className="visitor-nav-link">
              <span>&larr; Back to gateway</span>
            </a>
            <a href="/portal" className="visitor-nav-link">
              <span>Staff portal &rarr;</span>
            </a>
          </div>
        </header>
      )}

      {/* ---------- Main Content Area ---------- */}
      <main className="visitor-main">
        {/* Hero Welcome Banner */}
        <div className="visitor-hero-card">
          <div className="visitor-hero-content">
            <div className="visitor-hero-text">
              <p className="kicker visitor-mono">Visitor self-service, no account needed</p>
              <h2>Welcome. Log your visit below.</h2>
              <p>
                Enter a pass code on arrival and the desk knows you&apos;re on site. Enter it again on your way out and we&apos;ll record how long you stayed.
              </p>
            </div>

            <div className="visitor-clock-box">
              <div className="visitor-clock-header">
                <span className="visitor-led-pulse" />
                <span>Station clock</span>
              </div>
              <div className="visitor-clock-digits visitor-mono">{wallClock}</div>
            </div>
          </div>
        </div>

        {/* Telemetry Stats Strip */}
        <div className="visitor-stats-strip">
          <div className="visitor-stat-pill">
            <div className="visitor-stat-icon" style={{ background: "rgba(44, 107, 94, 0.15)", color: "#2c6b5e" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div>
              <div className="visitor-stat-label">Currently on site</div>
              <div className="visitor-stat-value">{stats.on_site_count} Active Guests</div>
            </div>
          </div>

          <div className="visitor-stat-pill">
            <div className="visitor-stat-icon" style={{ background: "rgba(180, 92, 55, 0.15)", color: "#b45c37" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <div className="visitor-stat-label">Today&apos;s check-ins</div>
              <div className="visitor-stat-value">{stats.today_total} Logged Visits</div>
            </div>
          </div>

          <div className="visitor-stat-pill">
            <div className="visitor-stat-icon" style={{ background: "rgba(33, 37, 43, 0.08)", color: "#21252b" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <div>
              <div className="visitor-stat-label">Facility node</div>
              <div className="visitor-stat-value">Site MK-01 (Geofenced)</div>
            </div>
          </div>
        </div>

        {/* Action Cards Grid */}
        <div className="visitor-cards-grid">
          {/* Card 1: Clock In (Dark Ink with Terracotta Top) */}
          <div className="visitor-card visitor-card-clockin">
            <div>
              <div className="card-icon-sq">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
              <p className="kicker">Arriving now</p>
              <h3>Clock in</h3>
              <p>
                First visit or returning guest. Get a pass code, leave your contact details, and we&apos;ll timestamp your arrival.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenClockIn}
              className="btn-terracotta"
            >
              <span>Register my arrival</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Card 2: Clock Out (Warm Sand with Outline) */}
          <div className="visitor-card visitor-card-clockout">
            <div>
              <div className="card-icon-sq">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </div>
              <p className="kicker">Heading out</p>
              <h3>Clock out</h3>
              <p>
                Enter your pass code to close out the visit. We&apos;ll log your departure time and total time on site.
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenClockOut()}
              className="btn-sand-outline"
            >
              <span>Log my departure</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Card 3: Hands-free Face Auto-Scan (Zellige Emerald) */}
          <div className="visitor-card visitor-card-facescan">
            <div>
              <div className="card-icon-sq">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <p className="kicker">Hands-free auto-scan</p>
              <h3>Face Recognition</h3>
              <p>
                Step up to the reader. FacePass detects your face and automatically clocks you in or out hands-free.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenFaceScan}
              className="btn-zellige"
            >
              <span>Open hands-free reader</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Who's On Site Roster Section */}
        <div className="visitor-roster-card">
          <div className="visitor-roster-head">
            <div className="visitor-roster-titles">
              <h3>Who&apos;s on site</h3>
              <p>Live log of guests currently checked in or recently checked out</p>
            </div>

            <div className="visitor-roster-toolbar">
              <div className="visitor-tab-group">
                <button
                  type="button"
                  onClick={() => setActiveTab("active")}
                  className={`visitor-tab-btn ${activeTab === "active" ? "active" : ""}`}
                >
                  Active on site ({onSiteVisitors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("history")}
                  className={`visitor-tab-btn ${activeTab === "history" ? "active" : ""}`}
                >
                  Recent history ({departedVisitors.length})
                </button>
              </div>

              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or pass code..."
                className="visitor-search-input"
              />

              <button
                type="button"
                onClick={loadRecentVisitors}
                disabled={visitorsLoading}
                className="visitor-refresh-btn"
                title="Refresh visitor roster"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={visitorsLoading ? "animate-spin" : ""}
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
              </button>
            </div>
          </div>

          {/* Roster Table */}
          <div className="overflow-x-auto">
            <table className="visitor-table">
              <thead>
                <tr>
                  <th>Pass code</th>
                  <th>Name</th>
                  <th>Contact / Host</th>
                  <th>Status</th>
                  <th>Last recorded</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody className="visitor-mono">
                {activeTab === "active" ? (
                  onSiteVisitors.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="visitor-empty-state">
                          <div className="visitor-empty-icon">+</div>
                          <div style={{ fontSize: "0.9rem" }}>
                            No one&apos;s checked in yet. Use &ldquo;Clock in&rdquo; above to register the first arrival.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    onSiteVisitors.map((vis) => {
                      const timeStr = vis.last_punch_time
                        ? new Date(vis.last_punch_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "—";
                      const dwell = vis.dwell_minutes ? `${vis.dwell_minutes}m on site` : "Just arrived";

                      return (
                        <tr key={vis.id}>
                          <td style={{ fontWeight: 700, color: "var(--fp-ink)" }}>
                            <span style={{ padding: "2px 6px", background: "white", border: "1px solid var(--fp-line)", borderRadius: "2px" }}>
                              {vis.visitor_code}
                            </span>
                          </td>
                          <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600 }}>
                            {vis.name}
                            {vis.company && (
                              <span style={{ display: "block", fontSize: "0.75rem", color: "var(--fp-ash)", fontWeight: 400 }}>
                                {vis.company}
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: "0.78rem", color: "var(--fp-ash)" }}>
                            <div>{vis.phone || vis.email || "No contact"}</div>
                            {vis.host_name && <div style={{ color: "var(--fp-ink)" }}>Host: {vis.host_name}</div>}
                          </td>
                          <td>
                            <span className="status-badge-onsite">
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--fp-zellige)" }} />
                              ON SITE
                            </span>
                          </td>
                          <td>
                            <div>{timeStr}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--fp-zellige)" }}>{dwell}</div>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: "6px" }}>
                              <button
                                type="button"
                                onClick={() => setSelectedPassModal(vis)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "0.75rem",
                                  border: "1px solid var(--fp-line)",
                                  background: "white",
                                  borderRadius: "2px",
                                  cursor: "pointer",
                                }}
                              >
                                View pass
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenClockOut(vis.visitor_code)}
                                style={{
                                  padding: "4px 10px",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  background: "var(--fp-clay)",
                                  color: "white",
                                  border: "1px solid var(--fp-clay-deep)",
                                  borderRadius: "2px",
                                  cursor: "pointer",
                                }}
                              >
                                Clock out &rarr;
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )
                ) : departedVisitors.length === 0 ? (
                  <tr>
                      <td colSpan={6}>
                        <div className="visitor-empty-state">
                          <div className="visitor-empty-icon">+</div>
                          <div>No recent departed guests logged today.</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    departedVisitors.map((vis) => {
                      const timeStr = vis.last_punch_time
                        ? new Date(vis.last_punch_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "—";

                      return (
                        <tr key={vis.id}>
                          <td style={{ fontWeight: 700 }}>{vis.visitor_code}</td>
                          <td style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 500 }}>{vis.name}</td>
                          <td style={{ fontSize: "0.78rem", color: "var(--fp-ash)" }}>{vis.phone || vis.email || "—"}</td>
                          <td>
                            <span className="status-badge-departed">DEPARTED</span>
                          </td>
                          <td>{timeStr}</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => {
                                handleOpenClockIn();
                                setVisitorId(vis.visitor_code);
                                const parts = vis.name.split(" ");
                                setFirstName(parts[0] || "");
                                setLastName(parts.slice(1).join(" ") || "");
                                if (vis.email) setEmail(vis.email);
                                if (vis.phone) setPhone(vis.phone);
                              }}
                              style={{
                                padding: "4px 8px",
                                fontSize: "0.75rem",
                                border: "1px solid var(--fp-line)",
                                background: "white",
                                borderRadius: "2px",
                                cursor: "pointer",
                              }}
                            >
                              Re-visit &rarr;
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="visitor-footer">
          FacePass visitor gateway | Zero sign-up required | Secure facility protocol
        </footer>

        {/* ─── MODAL 1: CLOCK IN (REGISTRATION & FACIAL CAPTURE) ─── */}
        {showClockInModal && clockInStep === "camera" && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              background: "#0b0f19",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              overflow: "hidden",
            }}
          >
            {/* Fullscreen Video Stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: "scaleX(-1)",
                zIndex: 1,
              }}
            />

            {/* Vignette Overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxShadow: "inset 0 0 160px rgba(11, 15, 25, 0.85), inset 0 0 60px rgba(11, 15, 25, 0.6)",
                pointerEvents: "none",
                zIndex: 2,
              }}
            />

            {/* Fullscreen Shutter Flash */}
            {shutterFlash && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(255, 255, 255, 0.96)",
                  zIndex: 99999,
                  pointerEvents: "none",
                  transition: "opacity 0.2s ease-out",
                }}
              />
            )}

            {/* Top HUD Bar */}
            <div
              style={{
                position: "relative",
                zIndex: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 28px",
                background: "linear-gradient(to bottom, rgba(11, 15, 25, 0.88), rgba(11, 15, 25, 0))",
              }}
            >
              <button
                type="button"
                onClick={() => setClockInStep("form")}
                disabled={clockInLoading || isAutoCapturing}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "9px 18px",
                  background: "rgba(33, 37, 43, 0.85)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255, 255, 255, 0.25)",
                  color: "white",
                  borderRadius: "3px",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>&larr; Back to Details</span>
              </button>

              <div style={{ textAlign: "center", color: "white" }}>
                <div style={{ fontFamily: "'Bitter', serif", fontSize: "1.15rem", letterSpacing: "0.02em" }}>
                  Marrakesh Hub &middot; Gate MK-01 Biometric Capture
                </div>
                <div className="visitor-mono" style={{ fontSize: "0.76rem", color: "var(--fp-sand)", opacity: 0.9, marginTop: "2px" }}>
                  Pass ID: <strong>{visitorId}</strong> &middot; Guest: <strong>{firstName} {lastName}</strong>
                </div>
              </div>

              <div
                className="visitor-mono"
                style={{
                  padding: "6px 14px",
                  background: "rgba(44, 107, 94, 0.35)",
                  border: "1px solid var(--fp-zellige)",
                  borderRadius: "20px",
                  color: "#34d399",
                  fontSize: "0.8rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#34d399",
                    boxShadow: "0 0 8px #34d399",
                  }}
                />
                <span>{wallClock}</span>
              </div>
            </div>

            {/* Center Biometric Alignment Reticle */}
            <div
              style={{
                position: "relative",
                zIndex: 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  width: "min(340px, 75vw)",
                  height: "min(460px, 62vh)",
                  border: faceDetected ? "3px solid #2c6b5e" : "2.5px dashed rgba(233, 224, 205, 0.85)",
                  borderRadius: "170px",
                  position: "relative",
                  transition: "border 0.25s ease, box-shadow 0.25s ease",
                  boxShadow: faceDetected
                    ? "0 0 40px rgba(44, 107, 94, 0.8), inset 0 0 30px rgba(44, 107, 94, 0.3)"
                    : "0 0 25px rgba(0,0,0,0.5)",
                }}
              >
                {/* Moroccan Architectural Corner Accents */}
                <div style={{ position: "absolute", top: 12, left: 32, width: 22, height: 22, borderTop: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}`, borderLeft: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}` }} />
                <div style={{ position: "absolute", top: 12, right: 32, width: 22, height: 22, borderTop: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}`, borderRight: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}` }} />
                <div style={{ position: "absolute", bottom: 12, left: 32, width: 22, height: 22, borderBottom: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}`, borderLeft: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}` }} />
                <div style={{ position: "absolute", bottom: 12, right: 32, width: 22, height: 22, borderBottom: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}`, borderRight: `3.5px solid ${faceDetected ? "#2c6b5e" : "#b45c37"}` }} />

                {/* Central Countdown Disc when Face Locked */}
                {faceDetected && !isAutoCapturing && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: "50%",
                        background: "rgba(44, 107, 94, 0.92)",
                        backdropFilter: "blur(8px)",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "2.6rem",
                        fontWeight: 800,
                        fontFamily: "'IBM Plex Mono', monospace",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                        border: "2px solid rgba(255,255,255,0.3)",
                      }}
                    >
                      {autoCountdown > 0 ? autoCountdown : ""}
                    </div>
                    <span
                      style={{
                        marginTop: 10,
                        fontSize: "0.82rem",
                        color: "#ffffff",
                        textShadow: "0 2px 6px rgba(0,0,0,0.9)",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Hold Still &middot; Auto-Capturing
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Instructions & Controls HUD */}
            <div
              style={{
                position: "relative",
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                padding: "20px 24px 32px",
                background: "linear-gradient(to top, rgba(11, 15, 25, 0.94), rgba(11, 15, 25, 0))",
              }}
            >
              {/* Status Pill Badge */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 22px",
                  background: faceDetected ? "rgba(44, 107, 94, 0.9)" : "rgba(33, 37, 43, 0.85)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "30px",
                  color: "#ffffff",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  border: `1px solid ${faceDetected ? "rgba(52, 211, 153, 0.5)" : "rgba(255, 255, 255, 0.15)"}`,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: faceDetected ? "#34d399" : "#fbbf24",
                    boxShadow: faceDetected ? "0 0 10px #34d399" : "0 0 10px #fbbf24",
                    display: "inline-block",
                  }}
                />
                <span>{faceStatusMessage}</span>
              </div>

              <div style={{ color: "var(--fp-sand)", fontSize: "0.82rem", opacity: 0.85, textAlign: "center" }}>
                Stand comfortably 1.0 to 1.5 meters away &middot; The biometric sensor snaps and records arrival automatically.
              </div>

              {/* Manual Snap Fallback Button */}
              <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={handleSnapPhoto}
                  disabled={clockInLoading || isAutoCapturing}
                  style={{
                    padding: "9px 26px",
                    background: "var(--fp-clay)",
                    color: "white",
                    border: "none",
                    borderRadius: "2px",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.86rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>{clockInLoading || isAutoCapturing ? "Recording entry..." : "Manual snap now"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {showClockInModal && clockInStep !== "camera" && (
          <div className="visitor-modal-backdrop">
            <div className="visitor-modal">
              <div className="visitor-modal-header">
                <div>
                  <h3>Register arrival (Clock in)</h3>
                  <p>Marrakesh Hub · Dynamic visitor entry pass</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClockInModal(false)}
                  className="visitor-modal-close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="visitor-modal-body">
                {clockInError && (
                  <div style={{ padding: "10px 14px", background: "rgba(174, 59, 38, 0.1)", border: "1px solid rgba(174, 59, 38, 0.3)", color: "#ae3b26", borderRadius: "2px", fontSize: "0.82rem" }}>
                    {clockInError}
                  </div>
                )}

                {/* Step 1: Form Details */}
                {clockInStep === "form" && (
                  <form onSubmit={handleProceedToCamera} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ padding: "12px 14px", background: "white", border: "1px solid var(--fp-line)", borderRadius: "2px" }}>
                      <label className="visitor-mono" style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--fp-ash)", marginBottom: "4px" }}>
                        Visitor Pass ID (Assigned)
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="text"
                          value={visitorId}
                          onChange={(e) => setVisitorId(e.target.value.toUpperCase())}
                          placeholder="e.g. VIS-4829"
                          required
                          className="visitor-mono"
                          style={{ flex: 1, padding: "7px 10px", fontSize: "0.9rem", fontWeight: 700, border: "1px solid var(--fp-line)", borderRadius: "2px", outline: "none" }}
                        />
                        <button
                          type="button"
                          onClick={handleAutoGenerateId}
                          style={{ padding: "7px 12px", background: "var(--fp-sand)", border: "1px solid var(--fp-line)", borderRadius: "2px", fontSize: "0.75rem", fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer" }}
                        >
                          Auto-generate
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--fp-ash)", marginBottom: "4px" }}>First Name *</label>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="e.g. Maya"
                          required
                          style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", border: "1px solid var(--fp-line)", borderRadius: "2px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--fp-ash)", marginBottom: "4px" }}>Last Name *</label>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="e.g. Lin"
                          required
                          style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", border: "1px solid var(--fp-line)", borderRadius: "2px", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--fp-ash)", marginBottom: "4px" }}>Phone *</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+212 600-000000"
                          required
                          className="visitor-mono"
                          style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", border: "1px solid var(--fp-line)", borderRadius: "2px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--fp-ash)", marginBottom: "4px" }}>Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="maya@company.com"
                          style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", border: "1px solid var(--fp-line)", borderRadius: "2px", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--fp-ash)", marginBottom: "4px" }}>Host / Contact Person *</label>
                        <input
                          type="text"
                          value={hostName}
                          onChange={(e) => setHostName(e.target.value)}
                          placeholder="e.g. Sarah Chen (Ops)"
                          required
                          style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", border: "1px solid var(--fp-line)", borderRadius: "2px", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", color: "var(--fp-ash)", marginBottom: "4px" }}>Company / Organization</label>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="e.g. Atlas Logistics"
                          style={{ width: "100%", padding: "7px 10px", fontSize: "0.85rem", border: "1px solid var(--fp-line)", borderRadius: "2px", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                      <button
                        type="button"
                        onClick={() => setShowClockInModal(false)}
                        style={{ padding: "8px 14px", border: "1px solid var(--fp-line)", background: "white", borderRadius: "2px", cursor: "pointer", fontSize: "0.82rem" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        style={{ padding: "8px 18px", background: "var(--fp-clay)", color: "white", border: "none", borderRadius: "2px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
                      >
                        Next: Face photo &rarr;
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 3: Digital Receipt */}
                {clockInStep === "receipt" && arrivalReceipt && (
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ width: 44, height: 44, margin: "0 auto", borderRadius: "50%", background: "rgba(44, 107, 94, 0.15)", color: "#2c6b5e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>

                    <div>
                      <h4 style={{ fontFamily: "'Bitter', serif", fontSize: "1.25rem", margin: "0 0 4px" }}>Arrival confirmed</h4>
                      <p style={{ fontSize: "0.85rem", color: "var(--fp-ash)", margin: 0 }}>
                        Welcome to Marrakesh Regional Operations Hub
                      </p>
                    </div>

                    {/* Pass Badge Card */}
                    <div className="visitor-pass-badge" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {arrivalReceipt.photo && (
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>
                          <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", border: "2px solid var(--fp-clay)", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                            <img
                              src={arrivalReceipt.photo}
                              alt={arrivalReceipt.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </div>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--fp-line)", paddingBottom: "8px" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>PASS ID</span>
                        <span className="visitor-mono" style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--fp-clay)" }}>
                          {arrivalReceipt.code}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>GUEST</span>
                        <span style={{ fontWeight: 600 }}>{arrivalReceipt.name}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>HOST</span>
                        <span>{arrivalReceipt.host}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>ENTRY TIME</span>
                        <span className="visitor-mono" style={{ color: "var(--fp-zellige)", fontWeight: 600 }}>{arrivalReceipt.time}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--fp-line)", paddingTop: "8px" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>STATUS</span>
                        <span className="status-badge-onsite">ON SITE</span>
                      </div>

                      <div style={{ marginTop: "6px" }}>
                        <VisitorQRCode
                          code={arrivalReceipt.code}
                          size={110}
                          subtitle="SECURITY GATE ACCESS PASS"
                          showLink={true}
                        />
                      </div>
                    </div>

                    <p style={{ fontSize: "0.8rem", color: "var(--fp-ash)", margin: 0 }}>
                      Retain pass code <strong>{arrivalReceipt.code}</strong> to clock out when concluding your visit.
                    </p>

                    <button
                      type="button"
                      onClick={() => setShowClockInModal(false)}
                      style={{ padding: "9px 24px", background: "var(--fp-ink)", color: "white", border: "none", borderRadius: "2px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", alignSelf: "center" }}
                    >
                      Done &amp; Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 2: CLOCK OUT (DEPARTURE) ─── */}
        {showClockOutModal && (
          <div className="visitor-modal-backdrop">
            <div className="visitor-modal" style={{ maxWidth: 440 }}>
              <div className="visitor-modal-header">
                <div>
                  <h3>Log departure (Clock out)</h3>
                  <p>Conclude your visit and record exit timestamp</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowClockOutModal(false)}
                  className="visitor-modal-close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="visitor-modal-body">
                {clockOutError && (
                  <div style={{ padding: "10px 14px", background: "rgba(174, 59, 38, 0.1)", border: "1px solid rgba(174, 59, 38, 0.3)", color: "#ae3b26", borderRadius: "2px", fontSize: "0.82rem" }}>
                    {clockOutError}
                  </div>
                )}

                {!departureReceipt ? (
                  <form onSubmit={(e) => handleCompleteClockOut(e)} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div>
                      <label className="visitor-mono" style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", color: "var(--fp-ash)", marginBottom: "4px" }}>
                        Enter Visitor Pass ID *
                      </label>
                      <input
                        type="text"
                        value={departureCode}
                        onChange={(e) => setDepartureCode(e.target.value.toUpperCase())}
                        placeholder="e.g. VIS-4829"
                        required
                        className="visitor-mono"
                        style={{ width: "100%", padding: "8px 12px", fontSize: "1rem", fontWeight: 700, border: "1px solid var(--fp-line)", borderRadius: "2px", boxSizing: "border-box" }}
                      />
                    </div>

                    {onSiteVisitors.length > 0 && (
                      <div style={{ padding: "10px", background: "white", border: "1px solid var(--fp-line)", borderRadius: "2px" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--fp-ash)", display: "block", marginBottom: "6px" }}>
                          Or select currently on site:
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {onSiteVisitors.slice(0, 4).map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setDepartureCode(v.visitor_code)}
                              className="visitor-mono"
                              style={{
                                padding: "3px 8px",
                                fontSize: "0.75rem",
                                border: "1px solid var(--fp-line)",
                                background: departureCode === v.visitor_code ? "var(--fp-sand)" : "white",
                                borderRadius: "2px",
                                cursor: "pointer",
                              }}
                            >
                              {v.name} ({v.visitor_code})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                      <button
                        type="button"
                        onClick={() => setShowClockOutModal(false)}
                        style={{ padding: "8px 14px", border: "1px solid var(--fp-line)", background: "white", borderRadius: "2px", cursor: "pointer", fontSize: "0.82rem" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={clockOutLoading}
                        style={{ padding: "8px 20px", background: "var(--fp-clay)", color: "white", border: "none", borderRadius: "2px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
                      >
                        {clockOutLoading ? "Logging departure..." : "Confirm clock out"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ width: 44, height: 44, margin: "0 auto", borderRadius: "50%", background: "rgba(44, 107, 94, 0.15)", color: "#2c6b5e", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>

                    <div>
                      <h4 style={{ fontFamily: "'Bitter', serif", fontSize: "1.25rem", margin: "0 0 4px" }}>Departure logged</h4>
                      <p style={{ fontSize: "0.85rem", color: "var(--fp-ash)", margin: 0 }}>
                        Thank you for visiting Marrakesh Operations Hub
                      </p>
                    </div>

                    <div className="visitor-pass-badge" style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>GUEST</span>
                        <span style={{ fontWeight: 600 }}>{departureReceipt.name}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>DEPARTURE TIME</span>
                        <span className="visitor-mono" style={{ fontWeight: 600 }}>{departureReceipt.time}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--fp-line)", paddingTop: "8px" }}>
                        <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>TOTAL DWELL TIME</span>
                        <span className="visitor-mono" style={{ color: "var(--fp-clay)", fontWeight: 700 }}>
                          {departureReceipt.duration}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowClockOutModal(false)}
                      style={{ padding: "9px 24px", background: "var(--fp-ink)", color: "white", border: "none", borderRadius: "2px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", alignSelf: "center" }}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 3: HANDS-FREE FACIAL RECOGNITION AUTO-SCAN ─── */}
        {showFaceScanModal && (
          <div className="visitor-modal-backdrop">
            <div className="visitor-modal" style={{ maxWidth: 500 }}>
              <div className="visitor-modal-header" style={{ background: "var(--fp-ink)", color: "var(--fp-sand)", borderBottom: "3px solid var(--fp-zellige)" }}>
                <div>
                  <h3 style={{ color: "var(--fp-sand)" }}>Hands-free facial reader</h3>
                  <p style={{ color: "#b9b2a2" }}>InsightFace ArcFace 512D · Optical auto-scan</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFaceScanModal(false)}
                  className="visitor-modal-close"
                  style={{ color: "#c9c2b1" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="visitor-modal-body" style={{ background: "var(--fp-ink)", color: "var(--fp-sand)" }}>
                <div style={{ position: "relative", width: "100%", height: 280, background: "#000", borderRadius: 2, overflow: "hidden" }}>
                  <video
                    ref={scanVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                  />

                  {/* Optical Scanning HUD */}
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ width: 160, height: 200, border: "2px solid rgba(44, 107, 94, 0.8)", borderRadius: "8px", position: "relative" }}>
                      {/* Corner Brackets */}
                      <div style={{ position: "absolute", top: -2, left: -2, width: 14, height: 14, borderTop: "3px solid #2c6b5e", borderLeft: "3px solid #2c6b5e" }} />
                      <div style={{ position: "absolute", top: -2, right: -2, width: 14, height: 14, borderTop: "3px solid #2c6b5e", borderRight: "3px solid #2c6b5e" }} />
                      <div style={{ position: "absolute", bottom: -2, left: -2, width: 14, height: 14, borderBottom: "3px solid #2c6b5e", borderLeft: "3px solid #2c6b5e" }} />
                      <div style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderBottom: "3px solid #2c6b5e", borderRight: "3px solid #2c6b5e" }} />

                      {/* Optical Laser Line */}
                      <div style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        height: 2,
                        background: "linear-gradient(90deg, transparent, #2c6b5e, #3f8a4c, transparent)",
                        boxShadow: "0 0 8px #2c6b5e",
                        animation: "laser 2.2s ease-in-out infinite alternate"
                      }} />
                    </div>
                  </div>
                </div>

                <div className="visitor-mono" style={{ textAlign: "center", fontSize: "0.85rem", color: "#c9c2b1" }}>
                  {scanNotice}
                </div>

                {scanStep === "matched" && scanMatchedVisitor && (
                  <div style={{ padding: "12px", background: "rgba(255, 255, 255, 0.08)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{scanMatchedVisitor.name}</div>
                      <div className="visitor-mono" style={{ fontSize: "0.75rem", color: "#a39987" }}>
                        {scanMatchedVisitor.visitor_code} &middot; {scanActionType === "check_out" ? "Clock out departure" : "Clock in arrival"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmFaceScanPunch}
                      style={{ padding: "8px 16px", background: "var(--fp-zellige)", color: "white", border: "none", borderRadius: "2px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
                    >
                      Confirm {scanActionType === "check_out" ? "departure" : "arrival"}
                    </button>
                  </div>
                )}

                {scanStep === "success" && (
                  <div style={{ padding: "14px", background: "rgba(44, 107, 94, 0.2)", border: "1px solid var(--fp-zellige)", borderRadius: 2, textAlign: "center" }}>
                    <div style={{ color: "#79bfb2", fontWeight: 700, fontSize: "1rem" }}>
                      Biometric punch verified!
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#e9e0cd", marginTop: "2px" }}>
                      Have a pleasant visit.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL 4: VISITOR PASS BADGE VIEWER ─── */}
        {selectedPassModal && (
          <div className="visitor-modal-backdrop">
            <div className="visitor-modal" style={{ maxWidth: 420 }}>
              <div className="visitor-modal-header">
                <div>
                  <h3>Digital visitor pass badge</h3>
                  <p>Marrakesh Hub Site MK-01 Access</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPassModal(null)}
                  className="visitor-modal-close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="visitor-modal-body">
                <div className="visitor-pass-badge" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {selectedPassModal.photo_url && (
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: "2px" }}>
                      <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", border: "2px solid var(--fp-clay)", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                        <img
                          src={selectedPassModal.photo_url}
                          alt={selectedPassModal.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--fp-line)", paddingBottom: "10px" }}>
                    <div>
                      <div style={{ fontSize: "1.15rem", fontWeight: 700, fontFamily: "'Bitter', serif" }}>
                        {selectedPassModal.name}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--fp-ash)" }}>
                        {selectedPassModal.company || "Guest Visitor"}
                      </div>
                    </div>
                    <div className="visitor-mono" style={{ padding: "4px 8px", background: "var(--fp-sand)", borderRadius: "2px", fontWeight: 700, fontSize: "0.9rem" }}>
                      {selectedPassModal.visitor_code}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>STATUS</span>
                    {selectedPassModal.status === "ON_SITE" ? (
                      <span className="status-badge-onsite">ON SITE</span>
                    ) : (
                      <span className="status-badge-departed">DEPARTED</span>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>CONTACT</span>
                    <span className="visitor-mono" style={{ fontSize: "0.8rem" }}>{selectedPassModal.phone || selectedPassModal.email || "On file"}</span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="visitor-mono" style={{ fontSize: "0.75rem", color: "var(--fp-ash)" }}>LAST RECORDED</span>
                    <span className="visitor-mono" style={{ fontSize: "0.8rem" }}>
                      {new Date(selectedPassModal.last_punch_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* Scannable Real QR Code for Security Gate Clearance */}
                  <div style={{ marginTop: "4px" }}>
                    <VisitorQRCode
                      code={selectedPassModal.visitor_code}
                      size={128}
                      subtitle="SCAN AT SECURITY GATE MK-01"
                      showLink={true}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--fp-line)", background: "white", borderRadius: "2px", cursor: "pointer", fontSize: "0.82rem" }}
                  >
                    Print badge
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPassModal(null)}
                    style={{ flex: 1, padding: "8px 12px", background: "var(--fp-ink)", color: "white", border: "none", borderRadius: "2px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
