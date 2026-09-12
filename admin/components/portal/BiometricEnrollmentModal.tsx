"use client";

import React, { useState, useRef, useEffect } from "react";
import { PortalUser, setPortalSession } from "./portalAuth";

interface BiometricEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: PortalUser;
  onEnrollmentSuccess: (result: any) => void;
}

interface CapturedAngle {
  label: string;
  sublabel: string;
  blob: Blob | null;
  dataUrl: string | null;
}

export default function BiometricEnrollmentModal({
  isOpen,
  onClose,
  user,
  onEnrollmentSuccess,
}: BiometricEnrollmentModalProps) {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enrollSuccess, setEnrollSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [angles, setAngles] = useState<CapturedAngle[]>([
    { label: "Front Center", sublabel: "Look straight into camera", blob: null, dataUrl: null },
    { label: "Left Angle", sublabel: "Turn head slightly left", blob: null, dataUrl: null },
    { label: "Right Angle", sublabel: "Turn head slightly right", blob: null, dataUrl: null },
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize Camera when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let stream: MediaStream | null = null;
    let isMounted = true;

    async function initCam() {
      try {
        setCameraError(null);
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
      } catch (err: any) {
        if (isMounted) {
          setCameraError(
            err.name === "NotAllowedError"
              ? "Camera permission was denied. Please allow camera access in your browser settings."
              : "Unable to access optical camera device."
          );
        }
      }
    }

    initCam();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setStreamActive(false);
    };
  }, [isOpen]);

  // Reset state on close
  const handleClose = () => {
    setCurrentStep(0);
    setAngles([
      { label: "Front Center", sublabel: "Look straight into camera", blob: null, dataUrl: null },
      { label: "Left Angle", sublabel: "Turn head slightly left", blob: null, dataUrl: null },
      { label: "Right Angle", sublabel: "Turn head slightly right", blob: null, dataUrl: null },
    ]);
    setErrorMessage(null);
    setEnrollSuccess(false);
    onClose();
  };

  // Capture current angle
  const handleCaptureAngle = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Flip horizontally for natural mirror image
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

        setAngles((prev) => {
          const updated = [...prev];
          updated[currentStep] = {
            ...updated[currentStep],
            blob,
            dataUrl,
          };
          return updated;
        });

        if (currentStep < 2) {
          setCurrentStep((s) => s + 1);
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // Retake a specific step
  const handleRetake = (stepIdx: number) => {
    setAngles((prev) => {
      const updated = [...prev];
      updated[stepIdx] = {
        ...updated[stepIdx],
        blob: null,
        dataUrl: null,
      };
      return updated;
    });
    setCurrentStep(stepIdx);
  };

  // Submit all 3 biometric angles to backend
  const handleSubmitEnrollment = async () => {
    const validBlobs = angles.filter((a) => a.blob !== null);
    if (validBlobs.length === 0) {
      setErrorMessage("At least one facial portrait is required for biometric enrollment.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      if (user.employee_id) formData.append("employee_id", user.employee_id);
      if (user.employee_code) formData.append("employee_code", user.employee_code);
      if (user.email) formData.append("email", user.email);

      validBlobs.forEach((angle, idx) => {
        if (angle.blob) {
          formData.append("images", angle.blob, `angle_${idx + 1}.jpg`);
        }
      });

      const headers: Record<string, string> = {};
      if (user.token) {
        headers["Authorization"] = `Bearer ${user.token}`;
      }

      const res = await fetch("/api/portal/enroll", {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Biometric vector registration failed");
      }

      // Update user local session
      const updatedUser: PortalUser = {
        ...user,
        is_enrolled: true,
      };
      setPortalSession(updatedUser);

      setEnrollSuccess(true);
      onEnrollmentSuccess(data);

      setTimeout(() => {
        handleClose();
      }, 2400);
    } catch (err: any) {
      setErrorMessage(err.message || "Enrollment failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const allCaptured = angles.every((a) => a.blob !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--line,#E4E2DC)] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[3px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--ink,#14171C)]">
                Biometric Facial Profile Enrollment
              </h3>
              <p className="text-[11px] text-[var(--muted,#6E7175)]">
                ArcFace 512D Vector Embedding Registration
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] p-1 rounded transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {enrollSuccess ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#0C6B72]/10 border border-[#0C6B72]/30 flex items-center justify-center text-[#0C6B72]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-[var(--ink,#14171C)]">
                  Biometrics Successfully Registered
                </h4>
                <p className="text-xs text-[var(--muted,#6E7175)] max-w-sm mx-auto">
                  3 facial template vectors have been compiled and bound to employee code{" "}
                  <span className="font-mono font-bold text-[var(--ink,#14171C)]">
                    {user.employee_code || "Active"}
                  </span>
                  . Contactless clocking is now unlocked.
                </p>
              </div>
              <div className="pt-2">
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-[2px] bg-[#0C6B72]/15 text-[#0C6B72] border border-[#0C6B72]/30 font-bold">
                  VECTOR STATUS: SYNCHRONIZED
                </span>
              </div>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3 bg-[#AE3B26]/10 border border-[#AE3B26]/30 text-[#AE3B26] rounded-[3px] text-xs flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 3 Steps Progress Bar */}
              <div className="grid grid-cols-3 gap-2">
                {angles.map((angle, idx) => {
                  const isDone = angle.blob !== null;
                  const isCurrent = idx === currentStep && !allCaptured;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => isDone && handleRetake(idx)}
                      className={`p-2 rounded-[3px] border text-left transition-all ${
                        isCurrent
                          ? "border-[var(--ink,#14171C)] bg-white shadow-xs"
                          : isDone
                          ? "border-[#0C6B72]/40 bg-[#0C6B72]/5"
                          : "border-[var(--line,#E4E2DC)] bg-[var(--paper,#F6F5F1)] opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold">Step {idx + 1}</span>
                        {isDone ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0C6B72" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-[var(--ink,#14171C)]" : "bg-gray-300"}`} />
                        )}
                      </div>
                      <div className="text-[11px] font-bold text-[var(--ink,#14171C)] truncate mt-0.5">
                        {angle.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Camera Viewfinder Box */}
              <div className="relative aspect-4/3 bg-black rounded-[3px] overflow-hidden border border-[var(--line,#E4E2DC)]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />

                {/* Facial Oval Framing Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-44 h-56 border-2 border-dashed border-white/60 rounded-[90px] flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                    {/* Corner Guides */}
                    <div className="absolute top-2 left-6 w-3 h-3 border-t-2 border-l-2 border-[#0C6B72]" />
                    <div className="absolute top-2 right-6 w-3 h-3 border-t-2 border-r-2 border-[#0C6B72]" />
                    <div className="absolute bottom-2 left-6 w-3 h-3 border-b-2 border-l-2 border-[#0C6B72]" />
                    <div className="absolute bottom-2 right-6 w-3 h-3 border-b-2 border-r-2 border-[#0C6B72]" />

                    {/* Step Prompt Badge */}
                    <div className="absolute -bottom-8 px-3 py-1 bg-black/85 backdrop-blur-xs border border-white/20 rounded-[2px] text-center">
                      <span className="text-[10px] font-mono text-white font-semibold">
                        {angles[currentStep]?.sublabel || "Position face in oval"}
                      </span>
                    </div>
                  </div>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center text-white space-y-2">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#AE3B26" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p className="text-xs text-white/90">{cameraError}</p>
                  </div>
                )}
              </div>

              {/* Thumbnails Row */}
              <div className="grid grid-cols-3 gap-2">
                {angles.map((angle, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-4/3 rounded-[3px] border border-[var(--line,#E4E2DC)] overflow-hidden bg-[var(--paper,#F6F5F1)] flex items-center justify-center"
                  >
                    {angle.dataUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={angle.dataUrl}
                          alt={angle.label}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRetake(idx)}
                          className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/75 hover:bg-black text-[9px] font-mono text-white rounded-[2px]"
                        >
                          Retake
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-mono text-[var(--muted,#6E7175)]">
                        Angle {idx + 1} Pending
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-[var(--line,#E4E2DC)]">
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-outline text-xs px-4 py-2 font-mono"
                >
                  Cancel
                </button>

                {!allCaptured ? (
                  <button
                    type="button"
                    onClick={handleCaptureAngle}
                    disabled={!streamActive}
                    className="btn btn-dark text-xs px-5 py-2 flex items-center gap-2 font-bold"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    <span>Capture Step {currentStep + 1}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmitEnrollment}
                    disabled={submitting}
                    className="btn btn-dark text-xs px-6 py-2 bg-[#0C6B72] hover:bg-[#095257] text-white flex items-center gap-2 font-bold"
                  >
                    {submitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Compiling ArcFace Vectors...</span>
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Register Biometric Profile</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
