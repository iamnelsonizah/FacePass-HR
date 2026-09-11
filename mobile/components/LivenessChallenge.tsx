import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

interface LivenessChallengeProps {
  onComplete: (result: {
    challengeId: string;
    referenceImageBase64: string;
    actionImageBase64: string;
  }) => void;
  challengeId: string;
  challengeType: "blink" | "head_turn_left" | "head_turn_right" | "smile" | string;
  instruction: string;
  onCancel?: () => void;
}

type LivenessPhase = "reference" | "action" | "processing";

/**
 * Dynamic Multi-Step Liveness Challenge.
 *
 * Implements a 2-frame verification protocol:
 * 1. Step 1 (Reference): Capture neutral forward-facing baseline
 * 2. Step 2 (Action): Execute dynamic prompt (blink, head turn, smile)
 *
 * Prevents static photo spoofing and replay attacks by capturing variance.
 */
export default function LivenessChallenge({
  onComplete,
  challengeId,
  challengeType,
  instruction,
  onCancel,
}: LivenessChallengeProps) {
  const cameraRef = useRef<CameraView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<LivenessPhase>("reference");
  const [referenceFrame, setReferenceFrame] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    if (phase === "processing") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  const getActionEmoji = () => {
    switch (challengeType) {
      case "blink":
        return "😉";
      case "head_turn_left":
        return "👈";
      case "head_turn_right":
        return "👉";
      case "smile":
        return "😃";
      default:
        return "📸";
    }
  };

  const handleCaptureReference = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      if (!isCameraReady) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        shutterSound: false,
      });

      if (photo?.base64) {
        setReferenceFrame(photo.base64);
        setPhase("action");
      }
    } catch (err: any) {
      console.warn("Reference capture initial attempt:", err?.message || err);
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const photoRetry = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.6,
          shutterSound: false,
        });
        if (photoRetry?.base64) {
          setReferenceFrame(photoRetry.base64);
          setPhase("action");
        }
      } catch (retryErr: any) {
        console.error("Reference capture error:", retryErr);
        Alert.alert(
          "Capture Error",
          "Could not capture reference photo. Please hold steady and try again."
        );
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCaptureAction = async () => {
    if (!cameraRef.current || isCapturing || !referenceFrame) return;

    setIsCapturing(true);
    setPhase("processing");

    try {
      if (!isCameraReady) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        shutterSound: false,
      });

      if (photo?.base64) {
        onComplete({
          challengeId,
          referenceImageBase64: referenceFrame,
          actionImageBase64: photo.base64,
        });
      }
    } catch (err: any) {
      console.warn("Action capture initial attempt:", err?.message || err);
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        const photoRetry = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.6,
          shutterSound: false,
        });
        if (photoRetry?.base64) {
          onComplete({
            challengeId,
            referenceImageBase64: referenceFrame,
            actionImageBase64: photoRetry.base64,
          });
        }
      } catch (retryErr: any) {
        console.error("Action capture error:", retryErr);
        Alert.alert(
          "Capture Error",
          "Could not capture verification photo. Please try again."
        );
        setPhase("action");
      }
    } finally {
      setIsCapturing(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.expiredContainer}>
        <Text style={styles.expiredEmoji}>📷</Text>
        <Text style={styles.expiredText}>Camera Access Required</Text>
        <Text style={styles.expiredSubtext}>
          FacePass requires camera permission for facial verification.
        </Text>
        <TouchableOpacity
          style={[styles.confirmButton, { marginTop: 20 }]}
          onPress={requestPermission}
        >
          <Text style={styles.confirmButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity
            style={{ marginTop: 16, padding: 8 }}
            onPress={onCancel}
          >
            <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "600" }}>
              Cancel
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (timeLeft <= 0) {
    return (
      <View style={styles.expiredContainer}>
        <Text style={styles.expiredEmoji}>⏰</Text>
        <Text style={styles.expiredText}>Verification Timed Out</Text>
        <Text style={styles.expiredSubtext}>
          Please face the camera and try again.
        </Text>
        <TouchableOpacity
          style={[styles.confirmButton, { marginTop: 24 }]}
          onPress={() => {
            setPhase("reference");
            setReferenceFrame(null);
            setTimeLeft(15);
          }}
        >
          <Text style={styles.confirmButtonText}>Try Again</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity
            style={{ marginTop: 16, padding: 8 }}
            onPress={onCancel}
          >
            <Text style={{ color: "#94A3B8", fontSize: 15, fontWeight: "600" }}>
              Back to Dashboard
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={[styles.camera, { width: windowWidth, height: windowHeight }]}
        facing="front"
        mirror={true}
        onCameraReady={() => {
          setTimeout(() => setIsCameraReady(true), 250);
        }}
        onLayout={(e) => {
          if (e.nativeEvent.layout.width > 0 && e.nativeEvent.layout.height > 0) {
            setIsCameraReady(true);
          }
        }}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        {/* Header Bar */}
        <View style={styles.headerBar}>
          {/* Step Pills */}
          <View style={styles.stepsContainer}>
            <View
              style={[
                styles.stepPill,
                phase === "reference" ? styles.stepPillActive : styles.stepPillDone,
              ]}
            >
              <Text style={styles.stepPillText}>1. Neutral</Text>
            </View>
            <View
              style={[
                styles.stepPill,
                phase === "action" ? styles.stepPillActive : styles.stepPillPending,
              ]}
            >
              <Text style={styles.stepPillText}>2. Action</Text>
            </View>
          </View>

          {/* Timer */}
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>{timeLeft}s</Text>
          </View>
        </View>

        {/* Oval Guide */}
        <View
          style={[
            styles.faceOutline,
            phase === "action" && styles.faceOutlineAction,
          ]}
        />

        {/* Instruction & Trigger */}
        <View style={styles.instructionContainer}>
          {phase === "reference" ? (
            <>
              <Text style={styles.emoji}>😐</Text>
              <Text style={styles.instructionTitle}>Step 1: Look Straight</Text>
              <Text style={styles.instructionSubtitle}>
                Hold phone at eye level with neutral expression
              </Text>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (!isCameraReady || isCapturing) && styles.confirmButtonDisabled,
                ]}
                onPress={handleCaptureReference}
                disabled={!isCameraReady || isCapturing}
              >
                <Text style={styles.confirmButtonText}>
                  {!isCameraReady
                    ? "Initializing Camera..."
                    : isCapturing
                    ? "Capturing..."
                    : "Ready, Next →"}
                </Text>
              </TouchableOpacity>
            </>
          ) : phase === "action" ? (
            <>
              <Text style={styles.emoji}>{getActionEmoji()}</Text>
              <Text style={styles.instructionTitle}>Step 2: Perform Action</Text>
              <Text style={styles.instructionPrompt}>{instruction}</Text>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  styles.confirmButtonAction,
                  (!isCameraReady || isCapturing) && styles.confirmButtonDisabled,
                ]}
                onPress={handleCaptureAction}
                disabled={!isCameraReady || isCapturing}
              >
                <Text style={styles.confirmButtonText}>
                  {!isCameraReady
                    ? "Initializing Camera..."
                    : isCapturing
                    ? "Verifying..."
                    : "Confirm Action ✓"}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#16A34A" />
              <Text style={styles.processingText}>Verifying Liveness...</Text>
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  headerBar: {
    width: "100%",
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  stepPillActive: {
    backgroundColor: "#2563EB",
  },
  stepPillDone: {
    backgroundColor: "#16A34A",
  },
  stepPillPending: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  stepPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  timerBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  timerText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  faceOutline: {
    width: 250,
    height: 330,
    borderRadius: 125,
    borderWidth: 3,
    borderColor: "rgba(37, 99, 235, 0.85)",
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  faceOutlineAction: {
    borderColor: "rgba(22, 163, 74, 0.9)",
  },
  instructionContainer: {
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderRadius: 20,
    marginHorizontal: 20,
    width: "90%",
  },
  emoji: {
    fontSize: 42,
    marginBottom: 6,
  },
  instructionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  instructionSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  instructionPrompt: {
    color: "#86EFAC",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  confirmButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  confirmButtonAction: {
    backgroundColor: "#16A34A",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  processingContainer: {
    paddingVertical: 16,
    alignItems: "center",
  },
  processingText: {
    color: "#fff",
    fontSize: 15,
    marginTop: 12,
    fontWeight: "500",
  },
  expiredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f9fafb",
  },
  expiredEmoji: {
    fontSize: 52,
    marginBottom: 16,
  },
  expiredText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#DC2626",
  },
  expiredSubtext: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
});
