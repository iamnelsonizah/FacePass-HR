import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";

interface LivenessChallengeProps {
  onComplete: (result: {
    challengeId: string;
    referenceImageBase64: string;
    actionImageBase64: string;
  }) => void;
  challengeId: string;
  challengeType: "blink" | "head_turn_left" | "head_turn_right" | "smile" | "passive" | string;
  instruction: string;
  onCancel?: () => void;
  isPassive?: boolean;
}

/**
 * Phase progression (fully automated):
 *   ready → detecting → capturing_ref → action_prompt → capturing_action → done
 *
 * - ready:            Camera warming up
 * - detecting:        Waiting ~1.5s for face alignment (simulated; auto-progresses)
 * - capturing_ref:    Auto-snap reference frame
 * - action_prompt:    Show action instruction with animated countdown (2.5s)
 * - capturing_action: Auto-snap action frame
 * - done:             Processing / calling onComplete
 */
type Phase =
  | "ready"
  | "detecting"
  | "capturing_ref"
  | "action_prompt"
  | "capturing_action"
  | "done";

/**
 * Smart Automated Liveness Challenge — no button taps required.
 *
 * Like Apple Face ID / modern banking apps:
 *   1. User positions face in the oval
 *   2. System auto-detects + captures neutral baseline
 *   3. Action instruction appears (blink, turn head, smile)
 *   4. System auto-captures action frame after countdown
 *   5. Verification processes automatically
 */
export default function LivenessChallenge({
  onComplete,
  challengeId,
  challengeType,
  instruction,
  onCancel,
  isPassive = false,
}: LivenessChallengeProps) {
  const isPassiveMode = isPassive || challengeType === "passive" || challengeId.startsWith("passive");
  const cameraRef = useRef<CameraView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("ready");
  const [referenceFrame, setReferenceFrame] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [overallTimer, setOverallTimer] = useState(20);
  const completedRef = useRef(false);
  const isCapturingRef = useRef(false);

  // Animations
  const ringPulse = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const statusFade = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  // ── Ring pulse animation ──
  useEffect(() => {
    if (phase === "done") return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringPulse, {
            toValue: 1.06,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringPulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [phase]);

  // ── Laser scan line ──
  useEffect(() => {
    if (phase === "done") return;
    const scan = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1600,
          useNativeDriver: true,
        }),
      ])
    );
    scan.start();
    return () => scan.stop();
  }, [phase]);

  // ── Status text fade in on phase change ──
  useEffect(() => {
    statusFade.setValue(0);
    Animated.timing(statusFade, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [phase]);

  // ── Overall safety timeout ──
  useEffect(() => {
    if (phase === "done") return;
    const interval = setInterval(() => {
      setOverallTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Take a photo helper ──
  const takePhoto = useCallback(
    async (quality = 0.7): Promise<string | null> => {
      if (!cameraRef.current || isCapturingRef.current) return null;
      isCapturingRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality,
          shutterSound: false,
        });
        return photo?.base64 || null;
      } catch (err: any) {
        console.warn("Liveness capture attempt failed:", err?.message);
        // Retry once
        try {
          await new Promise((r) => setTimeout(r, 400));
          const retry = await cameraRef.current?.takePictureAsync({
            base64: true,
            quality: 0.6,
            shutterSound: false,
          });
          return retry?.base64 || null;
        } catch {
          return null;
        }
      } finally {
        isCapturingRef.current = false;
      }
    },
    []
  );

  // ══════════════════════════════════════════════════════
  // Phase state machine — fully automated progression
  // ══════════════════════════════════════════════════════

  // Phase: ready → detecting (once camera is warmed up)
  useEffect(() => {
    if (phase !== "ready" || !isCameraReady) return;
    const timer = setTimeout(() => setPhase("detecting"), isPassiveMode ? 150 : 400);
    return () => clearTimeout(timer);
  }, [phase, isCameraReady, isPassiveMode]);

  // Phase: detecting → auto-snap
  useEffect(() => {
    if (phase !== "detecting") return;

    if (isPassiveMode) {
      // Sub-Second Passive Liveness: charge up ring and snap in ~380ms
      Animated.timing(progressWidth, {
        toValue: 100,
        duration: 380,
        useNativeDriver: false,
      }).start();

      const timer = setTimeout(async () => {
        if (completedRef.current) return;
        const base64 = await takePhoto(0.85);
        if (base64 && !completedRef.current) {
          completedRef.current = true;
          setPhase("done");
          setTimeout(() => {
            onComplete({
              challengeId: challengeId.startsWith("passive") ? challengeId : "passive-subsecond",
              referenceImageBase64: base64,
              actionImageBase64: base64,
            });
          }, 300);
        }
      }, 380);
      return () => clearTimeout(timer);
    }

    // Active challenge mode:
    Animated.timing(progressWidth, {
      toValue: 50,
      duration: 1500,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => setPhase("capturing_ref"), 1500);
    return () => clearTimeout(timer);
  }, [phase, isPassiveMode, takePhoto, challengeId, onComplete]);

  // Phase: capturing_ref → action_prompt (auto-snap reference frame)
  useEffect(() => {
    if (phase !== "capturing_ref") return;
    let cancelled = false;

    (async () => {
      const base64 = await takePhoto(0.7);
      if (cancelled || completedRef.current) return;
      if (base64) {
        setReferenceFrame(base64);
        setPhase("action_prompt");
        setCountdown(3);
      } else {
        // Couldn't capture — retry detection
        setPhase("detecting");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, takePhoto]);

  // Phase: action_prompt countdown (3 → 0), then → capturing_action
  useEffect(() => {
    if (phase !== "action_prompt") return;

    // Animate progress bar during action prompt
    Animated.timing(progressWidth, {
      toValue: 85,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setPhase("capturing_action");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  // Phase: capturing_action → done (auto-snap action frame + complete)
  useEffect(() => {
    if (phase !== "capturing_action" || !referenceFrame) return;
    let cancelled = false;

    (async () => {
      const base64 = await takePhoto(0.7);
      if (cancelled || completedRef.current) return;

      if (base64) {
        completedRef.current = true;

        // Animate progress to 100%
        Animated.timing(progressWidth, {
          toValue: 100,
          duration: 300,
          useNativeDriver: false,
        }).start();

        setPhase("done");

        // Small delay so user sees the "Verified" state
        setTimeout(() => {
          onComplete({
            challengeId,
            referenceImageBase64: referenceFrame,
            actionImageBase64: base64,
          });
        }, 600);
      } else {
        // Failed — go back to action prompt and try again
        setCountdown(2);
        setPhase("action_prompt");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, referenceFrame, takePhoto, onComplete, challengeId]);

  // ── Derived UI values ──
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

  const getStatusText = (): string => {
    if (isPassiveMode) {
      switch (phase) {
        case "ready":
          return "Warming up scanner…";
        case "detecting":
          return "Align face in oval — auto-capturing…";
        case "done":
          return "Biometric Captured & Verified ✓";
        default:
          return "Scanning…";
      }
    }
    switch (phase) {
      case "ready":
        return "Initializing camera…";
      case "detecting":
        return "Position your face in the oval";
      case "capturing_ref":
        return "Hold still…";
      case "action_prompt":
        return instruction || "Perform the action";
      case "capturing_action":
        return "Verifying…";
      case "done":
        return "Verified ✓";
      default:
        return "";
    }
  };

  const getStatusEmoji = (): string => {
    if (isPassiveMode) {
      return phase === "done" ? "🛡️" : "⚡";
    }
    switch (phase) {
      case "ready":
        return "📷";
      case "detecting":
        return "😐";
      case "capturing_ref":
        return "📸";
      case "action_prompt":
        return getActionEmoji();
      case "capturing_action":
        return "⏳";
      case "done":
        return "✅";
      default:
        return "";
    }
  };

  const getRingColor = (): string => {
    switch (phase) {
      case "ready":
      case "detecting":
        return "rgba(37, 99, 235, 0.85)";
      case "capturing_ref":
        return "rgba(234, 179, 8, 0.9)";
      case "action_prompt":
      case "capturing_action":
        return "rgba(22, 163, 74, 0.9)";
      case "done":
        return "rgba(16, 185, 129, 1)";
      default:
        return "rgba(37, 99, 235, 0.85)";
    }
  };

  const phaseIndex =
    phase === "ready" || phase === "detecting"
      ? 0
      : phase === "capturing_ref"
      ? 1
      : phase === "action_prompt" || phase === "capturing_action"
      ? 2
      : 3;

  // ── Scan line interpolation ──
  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-130, 130],
  });

  // ── Permission screens ──
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
        <Text style={styles.expiredTitle}>Camera Access Required</Text>
        <Text style={styles.expiredSubtext}>
          FacePass requires camera permission for facial verification.
        </Text>
        <Text
          style={styles.grantButton}
          onPress={requestPermission}
        >
          Grant Permission
        </Text>
      </View>
    );
  }

  // ── Timeout screen ──
  if (overallTimer <= 0 && phase !== "done") {
    return (
      <View style={styles.expiredContainer}>
        <Text style={styles.expiredEmoji}>⏰</Text>
        <Text style={styles.expiredTitle}>Verification Timed Out</Text>
        <Text style={styles.expiredSubtext}>
          Please position your face clearly and try again.
        </Text>
        <Text
          style={styles.grantButton}
          onPress={() => {
            setPhase("ready");
            setReferenceFrame(null);
            setOverallTimer(20);
            setCountdown(3);
            completedRef.current = false;
          }}
        >
          Try Again
        </Text>
        {onCancel && (
          <Text style={styles.cancelText} onPress={onCancel}>
            Cancel
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Full-screen camera */}
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

      {/* Overlay */}
      <View style={styles.overlay} pointerEvents="box-none">
        {/* ─── Top Bar ─── */}
        <View style={styles.topBar}>
          {/* Progress Dots */}
          <View style={styles.dotsRow}>
            {["Detect", "Capture", "Verify", "Done"].map((label, i) => (
              <View key={label} style={styles.dotItem}>
                <View
                  style={[
                    styles.dot,
                    i <= phaseIndex ? styles.dotActive : styles.dotInactive,
                    i < phaseIndex && styles.dotCompleted,
                  ]}
                >
                  {i < phaseIndex ? (
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.dotLabel,
                    i <= phaseIndex && { color: "#fff" },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* Timer */}
          <View style={styles.timerBadge}>
            <Ionicons
              name="time-outline"
              size={14}
              color={overallTimer <= 5 ? "#EF4444" : "#fff"}
            />
            <Text
              style={[
                styles.timerText,
                overallTimer <= 5 && { color: "#EF4444" },
              ]}
            >
              {overallTimer}s
            </Text>
          </View>
        </View>

        {/* ─── Face Oval Ring ─── */}
        <View style={styles.ovalContainer}>
          <Animated.View
            style={[
              styles.faceRing,
              {
                borderColor: getRingColor(),
                transform: [{ scale: ringPulse }],
                opacity: ringOpacity,
              },
            ]}
          >
            {/* Scan line */}
            {phase !== "done" && (
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    transform: [{ translateY: scanTranslateY }],
                    backgroundColor: getRingColor(),
                  },
                ]}
              />
            )}
          </Animated.View>

          {/* Corner ticks */}
          <View style={[styles.cornerTick, styles.cornerTL]} />
          <View style={[styles.cornerTick, styles.cornerTR]} />
          <View style={[styles.cornerTick, styles.cornerBL]} />
          <View style={[styles.cornerTick, styles.cornerBR]} />
        </View>

        {/* ─── Bottom Status Card ─── */}
        <View style={styles.statusCard}>
          <Animated.View
            style={[styles.statusInner, { opacity: statusFade }]}
          >
            {/* Emoji */}
            <Text style={styles.statusEmoji}>{getStatusEmoji()}</Text>

            {/* Phase title */}
            <Text style={styles.statusTitle}>{getStatusText()}</Text>

            {/* Sub-info per phase */}
            {phase === "detecting" && (
              <Text style={styles.statusSubtext}>
                Keep your face centered and well lit
              </Text>
            )}

            {phase === "action_prompt" && (
              <View style={styles.countdownRow}>
                <Text style={styles.countdownLabel}>Auto-capture in</Text>
                <View style={styles.countdownBadge}>
                  <Text style={styles.countdownNumber}>{countdown}</Text>
                </View>
              </View>
            )}

            {phase === "done" && (
              <View style={styles.doneRow}>
                <Ionicons name="shield-checkmark" size={18} color="#10B981" />
                <Text style={styles.doneText}>Liveness confirmed</Text>
              </View>
            )}

            {(phase === "capturing_ref" || phase === "capturing_action") && (
              <ActivityIndicator
                size="small"
                color="#fff"
                style={{ marginTop: 8 }}
              />
            )}

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressWidth.interpolate({
                      inputRange: [0, 100],
                      outputRange: ["0%", "100%"],
                    }),
                    backgroundColor:
                      phase === "done" ? "#10B981" : "#2563EB",
                  },
                ]}
              />
            </View>
          </Animated.View>

          {/* Cancel link */}
          {onCancel && phase !== "done" && (
            <Text style={styles.cancelLink} onPress={onCancel}>
              Cancel
            </Text>
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
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingBottom: 32,
    backgroundColor: "rgba(0,0,0,0.2)",
  },

  // ── Top Bar ──
  topBar: {
    width: "100%",
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 12,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  dotItem: {
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  dotActive: {
    backgroundColor: "#2563EB",
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dotCompleted: {
    backgroundColor: "#10B981",
  },
  dotLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  timerText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // ── Face Oval ──
  ovalContainer: {
    width: 260,
    height: 340,
    justifyContent: "center",
    alignItems: "center",
  },
  faceRing: {
    width: 250,
    height: 330,
    borderRadius: 125,
    borderWidth: 3,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  scanLine: {
    position: "absolute",
    left: 10,
    right: 10,
    height: 2,
    top: "50%",
    borderRadius: 1,
    opacity: 0.7,
  },
  cornerTick: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: "rgba(255,255,255,0.6)",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },

  // ── Bottom Status Card ──
  statusCard: {
    width: "90%",
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statusInner: {
    alignItems: "center",
    width: "100%",
  },
  statusEmoji: {
    fontSize: 36,
    marginBottom: 4,
  },
  statusTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 2,
  },
  statusSubtext: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 2,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  countdownLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
  countdownBadge: {
    backgroundColor: "#16A34A",
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  countdownNumber: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  doneText: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "600",
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginTop: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  cancelLink: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 14,
  },

  // ── Expired / Permission screens ──
  expiredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#0F172A",
  },
  expiredEmoji: {
    fontSize: 52,
    marginBottom: 16,
  },
  expiredTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  expiredSubtext: {
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
    marginTop: 8,
    textAlign: "center",
  },
  grantButton: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    backgroundColor: "#2563EB",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 24,
    textAlign: "center",
  },
  cancelText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 16,
  },
});
