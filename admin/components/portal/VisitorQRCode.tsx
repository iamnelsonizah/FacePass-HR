"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";

interface VisitorQRCodeProps {
  code: string;
  size?: number;
  subtitle?: string;
  showLink?: boolean;
}

export default function VisitorQRCode({
  code,
  size = 124,
  subtitle = "SCAN AT SECURITY GATE MK-01",
  showLink = true,
}: VisitorQRCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [verifyUrl, setVerifyUrl] = useState<string>("");

  useEffect(() => {
    if (!code) return;

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const cleanCode = code.trim().toUpperCase();
    const url = `${origin}/visitor/verify/${encodeURIComponent(cleanCode)}`;
    setVerifyUrl(url);

    QRCode.toDataURL(url, {
      width: size * 2,
      margin: 1,
      color: {
        dark: "#21252b",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error("Failed to generate pass QR code:", err);
      });
  }, [code, size]);

  return (
    <div
      style={{
        padding: "14px",
        background: "var(--fp-paper)",
        border: "1px dashed var(--fp-line)",
        borderRadius: "3px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {qrDataUrl ? (
        <a
          href={verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Click to preview security gate clearance for ${code}`}
          style={{
            display: "inline-block",
            textDecoration: "none",
            background: "#ffffff",
            padding: "8px",
            borderRadius: "4px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            cursor: "pointer",
          }}
        >
          <img
            src={qrDataUrl}
            alt={`Scannable QR code for visitor pass ${code}`}
            style={{
              width: size,
              height: size,
              display: "block",
            }}
          />
        </a>
      ) : (
        <div
          style={{
            width: size,
            height: size,
            background: "rgba(0,0,0,0.04)",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="visitor-mono" style={{ fontSize: "0.7rem", color: "var(--fp-ash)" }}>
            Generating QR...
          </span>
        </div>
      )}

      {subtitle && (
        <div
          className="visitor-mono"
          style={{
            fontSize: "0.7rem",
            color: "var(--fp-ash)",
            letterSpacing: "0.04em",
            marginTop: "2px",
          }}
        >
          {subtitle}
        </div>
      )}

      {showLink && verifyUrl && (
        <a
          href={verifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "0.72rem",
            color: "var(--fp-clay)",
            textDecoration: "none",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            marginTop: "2px",
          }}
        >
          <span>Open security clearance view</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="7" y1="17" x2="17" y2="7" />
            <polyline points="7 7 17 7 17 17" />
          </svg>
        </a>
      )}
    </div>
  );
}
