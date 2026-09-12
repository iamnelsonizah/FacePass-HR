"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setPortalSession } from "@/components/portal/portalAuth";

type AuthFlow =
  | "login"
  | "signup"
  | "otp_verify"
  | "activated"
  | "forgot_step1"
  | "forgot_step2"
  | "forgot_step3"
  | "forgot_success";

export default function EmployeePortalLoginPage() {
  const router = useRouter();
  const [authFlow, setAuthFlow] = useState<AuthFlow>("login");

  // Sign In fields
  const [emailOrId, setEmailOrId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Sign Up fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [customId, setCustomId] = useState("");

  // OTP Verification state
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [pendingEmail, setPendingEmail] = useState("");
  const [activatedEmployeeCode, setActivatedEmployeeCode] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Forgot Password state
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtpDigits, setResetOtpDigits] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const resetOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Handle OTP digit input
  const handleOtpInput = (
    val: string,
    index: number,
    digitsArr: string[],
    setDigits: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    const cleaned = val.replace(/[^0-9]/g, "");

    // Handle paste of full 6-digit code
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split("");
      const newDigits = [...digitsArr];
      chars.forEach((c, i) => {
        newDigits[i] = c;
      });
      setDigits(newDigits);
      const nextIdx = Math.min(chars.length, 5);
      refs.current[nextIdx]?.focus();
      return;
    }

    const newDigits = [...digitsArr];
    newDigits[index] = cleaned;
    setDigits(newDigits);

    if (cleaned && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    digitsArr: string[],
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>
  ) => {
    if (e.key === "Backspace" && !digitsArr[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  // 1. Submit Sign In
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email_or_id: emailOrId.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Authentication failed. Check your Employee ID or password.");
      }

      setPortalSession({
        user_id: data.user_id,
        email: data.email,
        employee_code: data.employee_code,
        employee_id: data.employee_id || data.user_id,
        first_name: data.first_name,
        last_name: data.last_name,
        token: data.access_token,
        is_enrolled: data.is_enrolled,
      });

      router.push("/portal");
    } catch (err: any) {
      setError(err.message || "Could not sign in. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit Sign Up
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !signUpEmail.trim() || !signUpPassword) {
      setError("Please fill in all required fields.");
      return;
    }

    if (signUpPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        action: "signup",
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: signUpEmail.trim().toLowerCase(),
        password: signUpPassword,
      };

      if (customId.trim()) {
        payload.employee_code = customId.trim();
      }

      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Registration failed. Please check your information.");
      }

      setPendingEmail(data.email || signUpEmail.trim().toLowerCase());
      setAuthFlow("otp_verify");
      setResendCountdown(60);
      setInfoMessage("A 6-digit activation code has been sent to your email.");
    } catch (err: any) {
      setError(err.message || "Sign up failed.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Verify Activation OTP
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = otpDigits.join("");

    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-activation",
          email: pendingEmail,
          code,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Verification failed. Please check the code.");
      }

      if (data.activated) {
        setActivatedEmployeeCode(data.employee_code || "FP-STAFF");
        setAuthFlow("activated");
      }
    } catch (err: any) {
      setError(err.message || "Invalid or expired activation code.");
    } finally {
      setLoading(false);
    }
  };

  // Resend Activation Code
  const handleResendActivation = async () => {
    if (resendCountdown > 0) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend-activation",
          email: pendingEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to resend code.");
      }

      setResendCountdown(60);
      setOtpDigits(["", "", "", "", "", ""]);
      setInfoMessage("A new activation code has been sent to your email.");
    } catch (err: any) {
      setError(err.message || "Could not resend code.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Forgot Password Flow
  const handleForgotStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!forgotIdentifier.trim()) {
      setError("Please enter your Work Email or Employee ID.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forgot-password",
          email_or_id: forgotIdentifier.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to send reset code.");
      }

      setResetEmail(data.email || forgotIdentifier.trim());
      setAuthFlow("forgot_step2");
      setResendCountdown(60);
      setInfoMessage("A 6-digit password reset code has been sent to your email.");
    } catch (err: any) {
      setError(err.message || "Could not request reset code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const code = resetOtpDigits.join("");
    if (code.length !== 6) {
      setError("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-reset-code",
          email: resetEmail,
          code,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Invalid code.");
      }

      setAuthFlow("forgot_step3");
    } catch (err: any) {
      setError(err.message || "Invalid or expired reset code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const code = resetOtpDigits.join("");
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-password",
          email: resetEmail,
          code,
          new_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Password reset failed.");
      }

      setAuthFlow("forgot_success");
    } catch (err: any) {
      setError(err.message || "Could not reset password.");
    } finally {
      setLoading(false);
    }
  };

  const resetToLogin = () => {
    setAuthFlow("login");
    setError(null);
    setInfoMessage(null);
    setOtpDigits(["", "", "", "", "", ""]);
    setResetOtpDigits(["", "", "", "", "", ""]);
    setForgotIdentifier("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--paper,#F6F5F1)] px-4 py-8 text-[var(--ink,#14171C)]">
      <div className="w-full max-w-md">
        {/* Branding Header */}
        <div className="text-center mb-6">
          <div className="w-10 h-10 rounded-[3px] bg-[var(--ink,#14171C)] flex items-center justify-center mx-auto mb-3 shadow-sm text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">FacePass Portal</h1>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 font-semibold uppercase">
              Workstation
            </span>
          </div>
          <p className="text-xs text-[var(--muted,#6E7175)] mt-1">Contactless Biometric Attendance &amp; Operational Timecards</p>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="mb-4 bg-[#AE3B26]/10 border border-[#AE3B26]/30 text-[#AE3B26] px-3.5 py-2.5 rounded-[3px] text-xs flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 bg-[#0C6B72]/10 border border-[#0C6B72]/30 text-[#0C6B72] px-3.5 py-2.5 rounded-[3px] text-xs flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{infoMessage}</span>
          </div>
        )}

        {/* ─── FLOW 1: SIGN IN / SIGN UP MAIN CARD ─── */}
        {(authFlow === "login" || authFlow === "signup") && (
          <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm overflow-hidden">
            {/* Tab Switcher */}
            <div className="grid grid-cols-2 border-b border-[var(--line,#E4E2DC)] bg-[var(--paper,#F6F5F1)] text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  setAuthFlow("login");
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`py-2.5 text-center font-bold transition-all border-r border-[var(--line,#E4E2DC)] ${
                  authFlow === "login"
                    ? "bg-white text-[var(--ink,#14171C)] shadow-xs"
                    : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthFlow("signup");
                  setError(null);
                  setInfoMessage(null);
                }}
                className={`py-2.5 text-center font-bold transition-all ${
                  authFlow === "signup"
                    ? "bg-white text-[var(--ink,#14171C)] shadow-xs"
                    : "text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
                }`}
              >
                Create Account
              </button>
            </div>

            <div className="p-6">
              {authFlow === "login" ? (
                /* ─── SIGN IN FORM ─── */
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="emailOrId"
                      className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1"
                    >
                      Employee ID or Email *
                    </label>
                    <input
                      id="emailOrId"
                      type="text"
                      value={emailOrId}
                      onChange={(e) => setEmailOrId(e.target.value)}
                      placeholder="e.g. FP-64164 or user@company.com"
                      required
                      className="w-full px-3 py-2 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="password"
                        className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)]"
                      >
                        Password *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthFlow("forgot_step1");
                          setError(null);
                          setInfoMessage(null);
                        }}
                        className="text-[11px] text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] underline font-mono"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full px-3 py-2 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)] pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2 text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)]"
                        tabIndex={-1}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          {showPassword ? (
                            <>
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                              <line x1="1" y1="1" x2="23" y2="23"/>
                            </>
                          ) : (
                            <>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-dark w-full py-2.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? "Verifying Credentials..." : "Sign In to Portal"}
                  </button>
                </form>
              ) : (
                /* ─── SIGN UP FORM ─── */
                <form onSubmit={handleSignUpSubmit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="e.g. Nelson"
                        required
                        className="w-full px-3 py-1.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="e.g. Izah"
                        required
                        className="w-full px-3 py-1.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="name@company.com"
                      required
                      className="w-full px-3 py-1.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      className="w-full px-3 py-1.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)]">
                        Preferred Employee ID (Optional)
                      </label>
                      <span className="text-[10px] text-[var(--muted,#6E7175)] font-mono">Auto-generated if blank</span>
                    </div>
                    <input
                      type="text"
                      value={customId}
                      onChange={(e) => setCustomId(e.target.value)}
                      placeholder="e.g. FP-1002"
                      className="w-full px-3 py-1.5 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                    />
                  </div>

                  <p className="text-[10.5px] text-[var(--muted,#6E7175)] leading-relaxed pt-1">
                    An email with a 6-digit activation code will be sent to verify your account and assign your Employee ID.
                  </p>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-dark w-full py-2.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? "Creating Account..." : "Create Account & Send Code"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ─── FLOW 2: OTP VERIFICATION SCREEN ─── */}
        {authFlow === "otp_verify" && (
          <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm p-6 text-center space-y-4">
            <div className="w-10 h-10 rounded-[3px] bg-[#0C6B72]/10 border border-[#0C6B72]/30 text-[#0C6B72] flex items-center justify-center mx-auto">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>

            <div>
              <h2 className="text-base font-bold text-[var(--ink,#14171C)]">Verify Your Email</h2>
              <p className="text-xs text-[var(--muted,#6E7175)] mt-1">
                Enter the 6-digit activation code sent to{" "}
                <strong className="text-[var(--ink,#14171C)] font-mono">{pendingEmail}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyOtpSubmit} className="space-y-4 pt-1">
              <div className="flex justify-center gap-2">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpInput(e.target.value, idx, otpDigits, setOtpDigits, otpRefs)}
                    onKeyDown={(e) => handleOtpKeyDown(e, idx, otpDigits, otpRefs)}
                    className="w-10 h-12 text-center text-base font-mono font-bold bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] focus:outline-none focus:border-[#0C6B72] focus:bg-white transition-all"
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-dark w-full py-2.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying Code..." : "Verify & Activate Account"}
              </button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={resetToLogin}
                  className="text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] underline font-mono"
                >
                  &larr; Back to Sign In
                </button>

                <button
                  type="button"
                  onClick={handleResendActivation}
                  disabled={resendCountdown > 0 || loading}
                  className={`font-mono ${
                    resendCountdown > 0
                      ? "text-[var(--muted,#6E7175)] cursor-not-allowed"
                      : "text-[#0C6B72] font-semibold underline"
                  }`}
                >
                  {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : "Resend Code"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── FLOW 3: ACCOUNT ACTIVATED CELEBRATION ─── */}
        {authFlow === "activated" && (
          <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#0C6B72]/10 border border-[#0C6B72]/30 text-[#0C6B72] flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>

            <div>
              <div className="inline-block text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-[2px] bg-[#0C6B72]/10 text-[#0C6B72] border border-[#0C6B72]/30 mb-2">
                Activation Confirmed
              </div>
              <h2 className="text-base font-bold text-[var(--ink,#14171C)]">Account Activated!</h2>
              <p className="text-xs text-[var(--muted,#6E7175)] mt-1 max-w-xs mx-auto leading-relaxed">
                Your FacePass profile is active. Here is your official Employee ID for workstation authentication:
              </p>
            </div>

            <div className="p-3.5 bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] max-w-xs mx-auto text-center">
              <div className="text-[10px] uppercase font-mono text-[var(--muted,#6E7175)] tracking-wider">
                Assigned Employee ID
              </div>
              <div className="text-lg font-mono font-bold text-[var(--ink,#14171C)] mt-0.5 tracking-wider">
                {activatedEmployeeCode}
              </div>
            </div>

            <div className="p-3 bg-[#0C6B72]/5 border border-[#0C6B72]/20 rounded-[3px] text-[11px] text-[var(--muted,#6E7175)] leading-relaxed text-left">
              <strong className="text-[var(--ink,#14171C)] font-semibold block mb-0.5">Next Step: Biometric Enrollment</strong>
              Sign in to your workstation to complete 1-click facial biometric registration with your camera.
            </div>

            <button
              type="button"
              onClick={() => {
                setEmailOrId(activatedEmployeeCode || pendingEmail);
                setAuthFlow("login");
              }}
              className="btn btn-dark w-full py-2.5 text-xs font-semibold"
            >
              Sign In to Enable Biometrics &rarr;
            </button>
          </div>
        )}

        {/* ─── FLOW 4: FORGOT PASSWORD STEP 1 ─── */}
        {authFlow === "forgot_step1" && (
          <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm p-6 space-y-4">
            <div className="text-center">
              <h2 className="text-base font-bold text-[var(--ink,#14171C)]">Reset Your Password</h2>
              <p className="text-xs text-[var(--muted,#6E7175)] mt-1">
                Enter your work email or Employee ID to receive a verification code.
              </p>
            </div>

            <form onSubmit={handleForgotStep1} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                  Email or Employee ID *
                </label>
                <input
                  type="text"
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  placeholder="e.g. FP-64164 or name@company.com"
                  required
                  className="w-full px-3 py-2 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-dark w-full py-2.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Sending Code..." : "Send Reset Code"}
              </button>

              <div className="text-center pt-2 border-t border-[var(--line,#E4E2DC)]">
                <button
                  type="button"
                  onClick={resetToLogin}
                  className="text-xs text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] underline font-mono"
                >
                  &larr; Remember your password? Sign In
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── FLOW 5: FORGOT PASSWORD STEP 2 (VERIFY CODE) ─── */}
        {authFlow === "forgot_step2" && (
          <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm p-6 text-center space-y-4">
            <div>
              <h2 className="text-base font-bold text-[var(--ink,#14171C)]">Enter Reset Code</h2>
              <p className="text-xs text-[var(--muted,#6E7175)] mt-1">
                Enter the 6-digit code sent to{" "}
                <strong className="text-[var(--ink,#14171C)] font-mono">{resetEmail}</strong>
              </p>
            </div>

            <form onSubmit={handleVerifyResetOtp} className="space-y-4 pt-1">
              <div className="flex justify-center gap-2">
                {resetOtpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      resetOtpRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleOtpInput(e.target.value, idx, resetOtpDigits, setResetOtpDigits, resetOtpRefs)}
                    onKeyDown={(e) => handleOtpKeyDown(e, idx, resetOtpDigits, resetOtpRefs)}
                    className="w-10 h-12 text-center text-base font-mono font-bold bg-[var(--paper,#F6F5F1)] border border-[var(--line,#E4E2DC)] rounded-[3px] focus:outline-none focus:border-[#0C6B72] focus:bg-white transition-all"
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-dark w-full py-2.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying..." : "Verify Code & Continue"}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={resetToLogin}
                  className="text-xs text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] underline font-mono"
                >
                  &larr; Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── FLOW 6: FORGOT PASSWORD STEP 3 (NEW PASSWORD) ─── */}
        {authFlow === "forgot_step3" && (
          <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm p-6 space-y-4">
            <div className="text-center">
              <h2 className="text-base font-bold text-[var(--ink,#14171C)]">Set New Password</h2>
              <p className="text-xs text-[var(--muted,#6E7175)] mt-1">
                Choose a secure password for your FacePass account.
              </p>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                  New Password *
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  className="w-full px-3 py-2 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-[var(--muted,#6E7175)] mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  required
                  className="w-full px-3 py-2 bg-white border border-[var(--line,#E4E2DC)] rounded-[3px] text-xs font-mono text-[var(--ink,#14171C)] focus:outline-none focus:border-[var(--ink,#14171C)]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-dark w-full py-2.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Updating Password..." : "Update Password"}
              </button>
            </form>
          </div>
        )}

        {/* ─── FLOW 7: FORGOT PASSWORD SUCCESS ─── */}
        {authFlow === "forgot_success" && (
          <div className="bg-white border border-[var(--line,#E4E2DC)] rounded-[4px] shadow-sm p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#0C6B72]/10 border border-[#0C6B72]/30 text-[#0C6B72] flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <div>
              <h2 className="text-base font-bold text-[var(--ink,#14171C)]">Password Updated</h2>
              <p className="text-xs text-[var(--muted,#6E7175)] mt-1">
                Your password has been successfully reset. You can now sign in to the portal.
              </p>
            </div>

            <button
              type="button"
              onClick={resetToLogin}
              className="btn btn-dark w-full py-2.5 text-xs font-semibold"
            >
              Return to Sign In
            </button>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="text-xs text-[var(--muted,#6E7175)] hover:text-[var(--ink,#14171C)] transition-colors underline"
          >
            Management console? Admin Sign In &rarr;
          </Link>
        </div>

        <p className="text-center text-[var(--muted,#6E7175)] text-xs mt-3 font-mono">
          FacePass v2.4 · Regional Workstation
        </p>
      </div>
    </div>
  );
}
