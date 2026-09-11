import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { CameraView, CameraType } from "expo-camera";
import { kioskPunch } from "../services/api";
import { getCurrentLocation } from "../services/location";

interface KioskScannerProps {
  onClose: () => void;
}

interface KioskResult {
  success: boolean;
  employee_name?: string;
  employee_code?: string;
  check_type?: string;
  trust_score?: number;
  confidence?: number;
  site_name?: string;
  error?: string;
}

export default function KioskScanner({ onClose }: KioskScannerProps) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("front");
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<KioskResult | null>(null);

  const handleScan = async () => {
    if (!cameraRef.current || !isCameraReady || isProcessing) return;

    setIsProcessing(true);
    setResult(null);

    try {
      // 1. Capture snapshot
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
        shutterSound: false,
      });

      if (!photo?.base64) {
        throw new Error("Could not capture camera frame");
      }

      // 2. Get current GPS
      let location = { latitude: 6.5244, longitude: 3.3792 };
      try {
        location = await getCurrentLocation();
      } catch (e) {
        // Fallback to site coordinates
      }

      // 3. Send 1:N biometric identification to backend
      const res = await kioskPunch(photo.base64, location.latitude, location.longitude);

      setResult({
        success: true,
        employee_name: res.employee_name,
        employee_code: res.employee_code,
        check_type: res.check_type,
        trust_score: res.trust_score,
        confidence: res.confidence,
        site_name: res.site_name,
      });

      // Automatically reset for next worker after 2.5 seconds
      setTimeout(() => {
        setResult(null);
      }, 2500);

    } catch (err: any) {
      const errMsg =
        err.response?.data?.detail || err.message || "Face not recognized. Please center face.";
      setResult({
        success: false,
        error: errMsg,
      });

      setTimeout(() => {
        setResult(null);
      }, 2500);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mirror={facing === "front"}
        onCameraReady={() => setIsCameraReady(true)}
      />

      {/* Sibling Overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={styles.kioskBadge}>
            <Text style={styles.kioskBadgeText}>⚡ KIOSK MODE</Text>
          </View>

          <View style={styles.topActions}>
            <TouchableOpacity
              style={styles.actionPill}
              onPress={() => setFacing((prev) => (prev === "front" ? "back" : "front"))}
            >
              <Text style={styles.actionPillText}>🔄 Flip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closePill} onPress={onClose}>
              <Text style={styles.closePillText}>✕ Exit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Face Oval Guide */}
        <View
          style={[
            styles.faceOutline,
            result?.success && styles.faceOutlineSuccess,
            result && !result.success && styles.faceOutlineError,
          ]}
        />

        {/* Bottom Banner & Feedback */}
        <View style={styles.bottomSection}>
          {result ? (
            result.success ? (
              <View style={styles.successCard}>
                <Text style={styles.successEmoji}>✓</Text>
                <View style={styles.successInfo}>
                  <Text style={styles.workerName}>{result.employee_name}</Text>
                  <Text style={styles.workerDetails}>
                    {result.employee_code} • {result.check_type === "check_in" ? "CHECKED IN" : "CHECKED OUT"}
                  </Text>
                  <Text style={styles.scoreText}>
                    {result.site_name} • {result.trust_score}% Trust Score
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.errorCard}>
                <Text style={styles.errorEmoji}>⚠️</Text>
                <View style={styles.errorInfo}>
                  <Text style={styles.errorTitle}>Verification Unsuccessful</Text>
                  <Text style={styles.errorSub}>{result.error}</Text>
                </View>
              </View>
            )
          ) : (
            <View style={styles.instructionCard}>
              <Text style={styles.instructionText}>
                Step into the oval and hold still
              </Text>
              <TouchableOpacity
                style={[
                  styles.scanButton,
                  (!isCameraReady || isProcessing) && styles.scanButtonDisabled,
                ]}
                onPress={handleScan}
                disabled={!isCameraReady || isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.scanButtonText}>
                    {!isCameraReady ? "Initializing Camera..." : "📸 Tap to Identify & Punch"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  topBar: {
    width: "100%",
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kioskBadge: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  kioskBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  topActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionPill: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  actionPillText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  closePill: {
    backgroundColor: "rgba(239, 68, 68, 0.8)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  closePillText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  faceOutline: {
    width: 260,
    height: 340,
    borderRadius: 130,
    borderWidth: 3,
    borderColor: "rgba(59, 130, 246, 0.85)",
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  faceOutlineSuccess: {
    borderColor: "#16A34A",
    borderStyle: "solid",
    borderWidth: 4,
  },
  faceOutlineError: {
    borderColor: "#DC2626",
    borderStyle: "solid",
    borderWidth: 4,
  },
  bottomSection: {
    width: "90%",
    alignItems: "center",
  },
  instructionCard: {
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 18,
    width: "100%",
    alignItems: "center",
  },
  instructionText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  scanButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  scanButtonDisabled: {
    opacity: 0.5,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
  },
  successCard: {
    backgroundColor: "rgba(22, 101, 52, 0.95)",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    width: "100%",
    gap: 14,
  },
  successEmoji: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "bold",
  },
  successInfo: {
    flex: 1,
  },
  workerName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  workerDetails: {
    color: "#BBF7D0",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  scoreText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 2,
  },
  errorCard: {
    backgroundColor: "rgba(153, 27, 27, 0.95)",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    width: "100%",
    gap: 14,
  },
  errorEmoji: {
    fontSize: 28,
  },
  errorInfo: {
    flex: 1,
  },
  errorTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  errorSub: {
    color: "#FECACA",
    fontSize: 12,
    marginTop: 2,
  },
});
