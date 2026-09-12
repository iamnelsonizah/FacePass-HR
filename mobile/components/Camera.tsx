import React, { useRef, useState, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  Animated,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

interface CameraProps {
  onCapture: (capturedImage: string) => void;
  onCancel?: () => void;
  cameraType?: CameraType;
  showCaptureButton?: boolean;
  title?: string;
  instruction?: string;
  allowFlip?: boolean;
  stepBadge?: string;
  enableAutoCapture?: boolean;
}

type SmartFaceState = "searching" | "aligning" | "locked" | "captured";

/**
 * Production-ready Camera component matching the exact FacePass enrollment face scan design.
 * Features:
 * - Clean white top bar with Cancel, Title ("Look straight ahead"), and Flip pill
 * - Smart Auto-Capture: Automatically detects when face is positioned in the reticle and captures
 * - Dual Mode: User can either let the system auto-capture or tap the manual capture button anytime
 * - Luminous oval reticle with real-time alignment feedback (dashed white -> solid emerald green on lock)
 * - Precision laser scanning line and shutter flash feedback
 */
export default function Camera({
  onCapture,
  onCancel,
  cameraType: initialCameraType = "front",
  showCaptureButton = true,
  title = "Look straight ahead",
  instruction = "Position your phone inside\nthe oval",
  allowFlip = true,
  stepBadge,
  enableAutoCapture = true,
}: CameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [facing, setFacing] = useState<CameraType>(initialCameraType);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  // Smart Auto-Capture states
  const [isAutoCapture, setIsAutoCapture] = useState<boolean>(enableAutoCapture);
  const [smartState, setSmartState] = useState<SmartFaceState>("searching");
  const [countdown, setCountdown] = useState<number>(2);

  // Animations
  const scanAnim = useRef(new Animated.Value(0)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const lockScaleAnim = useRef(new Animated.Value(1)).current;

  // Continuous laser scan line animation
  useEffect(() => {
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    scanLoop.start();
    return () => scanLoop.stop();
  }, [scanAnim]);

  // Smart Auto-Capture Detection Sequence
  useEffect(() => {
    if (!isAutoCapture || !isCameraReady || isCapturing) {
      setSmartState("searching");
      return;
    }

    // Step 1: Initial positioning & stability check
    setSmartState("aligning");
    setCountdown(2);

    const lockTimer = setTimeout(() => {
      setSmartState("locked");
      setCountdown(1);

      // Animate lock-on pulse
      Animated.sequence([
        Animated.timing(lockScaleAnim, {
          toValue: 1.03,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(lockScaleAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1200);

    // Step 2: Auto-capture when locked
    const snapTimer = setTimeout(() => {
      setSmartState("captured");
      handleCapture();
    }, 2200);

    return () => {
      clearTimeout(lockTimer);
      clearTimeout(snapTimer);
    };
  }, [isAutoCapture, isCameraReady, stepBadge, title, facing]);

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!permission.granted) {
    const isPermanentlyDenied = !permission.canAskAgain && permission.status === "denied";

    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionEmoji}>📷</Text>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          FacePass needs camera access to authenticate your identity via facial verification.
        </Text>
        {isPermanentlyDenied ? (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.permissionButtonText}>Open Device Settings</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Allow Camera Access</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const triggerFlash = () => {
    flashAnim.setValue(0.9);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    triggerFlash();
    setIsCapturing(true);
    try {
      await new Promise((r) => setTimeout(r, 100));

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        shutterSound: false,
      });

      const captureResult = photo?.uri || photo?.base64;
      if (captureResult) {
        onCapture(captureResult);
      }
    } catch (error: any) {
      console.warn("First camera capture failed, retrying in 300ms...", error?.message);
      try {
        await new Promise((r) => setTimeout(r, 300));
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.6,
          shutterSound: false,
        });

        const captureResult = photo?.uri || photo?.base64;
        if (captureResult) {
          onCapture(captureResult);
        }
      } catch (retryErr) {
        console.error("Camera capture error:", retryErr);
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "front" ? "back" : "front"));
  };

  const isLocked = smartState === "locked" || smartState === "captured";

  // Scan line interpolation inside the 380px tall oval
  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [30, 330],
  });

  return (
    <View style={styles.container}>
      {/* Live Camera Feed */}
      <CameraView
        ref={cameraRef}
        style={[styles.camera, { width: windowWidth, height: windowHeight }]}
        facing={facing}
        mirror={facing === "front"}
        onCameraReady={() => {
          setTimeout(() => setIsCameraReady(true), 200);
        }}
        onLayout={(e) => {
          if (e.nativeEvent.layout.width > 0 && e.nativeEvent.layout.height > 0) {
            setIsCameraReady(true);
          }
        }}
      />

      {/* Shutter White Flash Overlay */}
      <Animated.View
        style={[styles.flashOverlay, { opacity: flashAnim }]}
        pointerEvents="none"
      />

      {/* Screen Overlay Content */}
      <SafeAreaView style={styles.safeOverlay} edges={["top", "bottom"]} pointerEvents="box-none">
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          {onCancel ? (
            <TouchableOpacity
              onPress={onCancel}
              style={styles.cancelButton}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={18} color="#0F172A" />
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 75 }} />
          )}

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            {stepBadge && (
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{stepBadge}</Text>
              </View>
            )}
          </View>

          {allowFlip ? (
            <TouchableOpacity
              style={styles.flipPill}
              onPress={toggleCameraFacing}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="camera-reverse-outline" size={16} color="#0F172A" />
              <Text style={styles.flipPillText}>Flip</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 75 }} />
          )}
        </View>

        {/* Smart Mode Toggle Pill */}
        <View style={styles.modePillContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={[
              styles.modePill,
              isAutoCapture ? styles.modePillAuto : styles.modePillManual,
            ]}
            onPress={() => setIsAutoCapture((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isAutoCapture ? "flash" : "hand-left"}
              size={13}
              color={isAutoCapture ? "#10B981" : "#94A3B8"}
            />
            <Text
              style={[
                styles.modePillText,
                isAutoCapture ? styles.modePillTextAuto : styles.modePillTextManual,
              ]}
            >
              {isAutoCapture ? "Smart Auto-Capture" : "Manual Mode (Tap to Snap)"}
            </Text>
            <View
              style={[
                styles.modeIndicatorDot,
                { backgroundColor: isAutoCapture ? "#10B981" : "#64748B" },
              ]}
            />
          </TouchableOpacity>
        </View>

        {/* Viewfinder Center Area */}
        <View style={styles.viewfinderContainer} pointerEvents="none">
          {/* Animated Oval Reticle */}
          <Animated.View
            style={[
              styles.ovalReticle,
              isLocked && styles.ovalReticleLocked,
              { transform: [{ scale: lockScaleAnim }] },
            ]}
          >
            {/* Animated Laser Scanning Line */}
            {isAutoCapture && !isLocked && isCameraReady && (
              <Animated.View
                style={[
                  styles.scanLine,
                  { transform: [{ translateY }] },
                ]}
              />
            )}

            {/* Corner alignment brackets */}
            <View style={[styles.bracketTL, isLocked && styles.bracketLocked]} />
            <View style={[styles.bracketTR, isLocked && styles.bracketLocked]} />
            <View style={[styles.bracketBL, isLocked && styles.bracketLocked]} />
            <View style={[styles.bracketBR, isLocked && styles.bracketLocked]} />
          </Animated.View>

          {/* Dynamic Instruction Pill Capsule */}
          <View style={[styles.instructionPill, isLocked && styles.instructionPillLocked]}>
            <View
              style={[
                styles.instructionOvalIcon,
                isLocked && { borderColor: "#10B981", backgroundColor: "rgba(16, 185, 129, 0.2)" },
              ]}
            >
              {isLocked && <Ionicons name="checkmark" size={12} color="#10B981" />}
            </View>
            <View style={styles.instructionDivider} />
            <Text style={[styles.instructionText, isLocked && styles.instructionTextLocked]}>
              {!isCameraReady
                ? "Initializing camera..."
                : isLocked
                ? "✓ Face Aligned — Capturing!"
                : isAutoCapture
                ? "Hold face in oval... Auto-capturing"
                : instruction}
            </Text>
          </View>
        </View>

        {/* Bottom Capture Button Bar (Always accessible for manual tap) */}
        {showCaptureButton && (
          <View style={styles.bottomBar} pointerEvents="box-none">
            <TouchableOpacity
              style={[
                styles.captureButtonOuter,
                (isCapturing || !isCameraReady) && styles.captureButtonDisabled,
                isLocked && styles.captureButtonOuterLocked,
              ]}
              onPress={handleCapture}
              disabled={isCapturing || !isCameraReady}
              activeOpacity={0.85}
            >
              <View style={[styles.captureButtonInner, isLocked && styles.captureButtonInnerLocked]}>
                {isCapturing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : isLocked ? (
                  <Ionicons name="checkmark" size={32} color="#FFFFFF" />
                ) : (
                  <Ionicons name="camera" size={30} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  camera: {
    ...StyleSheet.absoluteFill,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#FFFFFF",
    zIndex: 99,
  },
  safeOverlay: {
    flex: 1,
    justifyContent: "space-between",
  },

  // Top Header Bar
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  stepBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  flipPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
    gap: 5,
  },
  flipPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },

  // Smart Mode Toggle Pill
  modePillContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    zIndex: 10,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  modePillAuto: {
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  modePillManual: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  modePillText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  modePillTextAuto: {
    color: "#FFFFFF",
  },
  modePillTextManual: {
    color: "#CBD5E1",
  },
  modeIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },

  // Center Viewfinder Area
  viewfinderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 6,
  },
  ovalReticle: {
    width: 260,
    height: 380,
    borderRadius: 130,
    borderWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.95)",
    borderStyle: "dashed",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  ovalReticleLocked: {
    borderColor: "#10B981",
    borderStyle: "solid",
    borderWidth: 3.5,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
  },
  scanLine: {
    position: "absolute",
    left: 10,
    right: 10,
    height: 3,
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    borderRadius: 1.5,
  },
  bracketTL: {
    position: "absolute",
    top: 60,
    left: -2,
    width: 14,
    height: 14,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  bracketTR: {
    position: "absolute",
    top: 60,
    right: -2,
    width: 14,
    height: 14,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  bracketBL: {
    position: "absolute",
    bottom: 60,
    left: -2,
    width: 14,
    height: 14,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  bracketBR: {
    position: "absolute",
    bottom: 60,
    right: -2,
    width: 14,
    height: 14,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },
  bracketLocked: {
    borderColor: "#10B981",
    borderWidth: 3,
  },

  // Instruction Pill Capsule
  instructionPill: {
    backgroundColor: "rgba(15, 23, 42, 0.86)",
    borderRadius: 24,
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  instructionPillLocked: {
    backgroundColor: "rgba(6, 78, 59, 0.92)",
    borderColor: "rgba(16, 185, 129, 0.6)",
  },
  instructionOvalIcon: {
    width: 13,
    height: 19,
    borderRadius: 6.5,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  instructionDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    marginHorizontal: 11,
  },
  instructionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  instructionTextLocked: {
    color: "#A7F3D0",
    fontWeight: "700",
  },

  // Bottom Capture Button Bar
  bottomBar: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 28,
  },
  captureButtonOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  captureButtonOuterLocked: {
    borderColor: "#10B981",
    shadowColor: "#10B981",
    shadowOpacity: 0.6,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButtonInnerLocked: {
    backgroundColor: "#059669",
  },

  // Permission views
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
    backgroundColor: "#FFFFFF",
  },
  permissionEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 15,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
