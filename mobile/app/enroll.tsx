import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Camera from "../components/Camera";
import { enroll, getProfile } from "../services/api";
import { supabase } from "../lib/supabase";

const ANGLES = [
  { label: "Look straight ahead", stepNumber: 1 },
  { label: "Turn slightly left", stepNumber: 2 },
  { label: "Turn slightly right", stepNumber: 3 },
];

/**
 * Face Enrollment Screen matching the exact Figma design.
 */
export default function EnrollScreen() {
  const router = useRouter();
  const [currentAngle, setCurrentAngle] = useState(0);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Enrolling Biometric Face...");

  const handleCapture = (capturedImage: string) => {
    const newImages = [...capturedImages, capturedImage];
    setCapturedImages(newImages);
    setShowCamera(false);

    if (newImages.length < ANGLES.length) {
      setCurrentAngle(newImages.length);
    }
  };

  const handleSubmit = async () => {
    if (capturedImages.length < ANGLES.length) {
      Alert.alert(
        "Incomplete",
        "Please capture all 3 face angles before completing enrollment."
      );
      return;
    }

    setLoading(true);
    setLoadingStatus("Connecting to FacePass biometrics...");
    try {
      // 1. Verify authenticated session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        Alert.alert(
          "Session Expired",
          "Your session has expired. Please sign in again to complete face enrollment.",
          [{ text: "Sign In", onPress: () => router.replace("/auth/login") }]
        );
        return;
      }

      // 2. Fetch employee profile
      setLoadingStatus("Verifying employee profile...");
      const profile = await getProfile();

      if (!profile?.id) {
        throw new Error("Could not find employee ID. Please re-login or contact support.");
      }

      // 3. Submit face biometrics
      setLoadingStatus("Encrypting biometric facial vectors...");
      await enroll(capturedImages, profile.id);

      Alert.alert("Success! 🎉", "Your face has been enrolled successfully.", [
        { text: "Continue", onPress: () => router.replace("/") },
      ]);
    } catch (error: any) {
      const errorDetail =
        error?.response?.data?.detail || error?.message || "";
      const errorStr =
        typeof errorDetail === "string"
          ? errorDetail
          : JSON.stringify(errorDetail);

      const isAuthError =
        error?.response?.status === 401 ||
        errorStr.includes("Session") ||
        errorStr.includes("session") ||
        errorStr.includes("JWT") ||
        errorStr.includes("Authentication failed") ||
        errorStr.includes("expired");

      if (isAuthError) {
        try {
          await supabase.auth.signOut();
        } catch (_) {}

        Alert.alert(
          "Session Expired",
          "Your login session has expired or was reset. Please sign in to activate your account and complete face enrollment.",
          [
            {
              text: "Sign In",
              onPress: () => router.replace("/auth/login"),
            },
          ]
        );
        return;
      }

      let message = "Enrollment failed. Please check your lighting and connection, then try again.";
      if (error?.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (typeof detail === "string") {
          message = detail;
        } else if (Array.isArray(detail)) {
          message = detail.map((d: any) => d.msg || JSON.stringify(d)).join("\n");
        } else {
          message = JSON.stringify(detail);
        }
      } else if (error?.message) {
        message = error.message;
      }
      Alert.alert("Enrollment Notice", message);
    } finally {
      setLoading(false);
    }
  };

  const resetEnrollment = () => {
    setCapturedImages([]);
    setCurrentAngle(0);
  };

  const isAllCaptured = capturedImages.length >= ANGLES.length;
  const currentStepTitle = !isAllCaptured
    ? ANGLES[currentAngle]?.label
    : "All Photos Captured!";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color="#0066FF" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Face Enrollment</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Instruction Card */}
        <View style={styles.instructionCard}>
          <View style={styles.cardIconBox}>
            <Ionicons name="camera" size={22} color="#0066FF" />
          </View>
          <View style={styles.cardTextBox}>
            <Text style={styles.cardTitle}>Capture your face</Text>
            <Text style={styles.cardSubtitle}>
              We need 3 photos of your face from different angles for accurate recognition. Make sure you're in good lighting.
            </Text>
          </View>
        </View>

        {/* 3-Step Stepper */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepperRow}>
            {ANGLES.map((step, idx) => {
              const isCompleted = idx < capturedImages.length;
              const isCurrent = idx === currentAngle && !isAllCaptured;

              return (
                <React.Fragment key={idx}>
                  {/* Step Circle */}
                  <View style={styles.stepItem}>
                    <View
                      style={[
                        styles.stepCircle,
                        isCurrent && styles.stepCircleActive,
                        isCompleted && styles.stepCircleCompleted,
                      ]}
                    >
                      {isCompleted ? (
                        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                      ) : (
                        <Text
                          style={[
                            styles.stepNumberText,
                            isCurrent && styles.stepNumberTextActive,
                          ]}
                        >
                          {step.stepNumber}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stepLabel,
                        (isCurrent || isCompleted) && styles.stepLabelActive,
                      ]}
                      numberOfLines={2}
                    >
                      {step.label}
                    </Text>
                  </View>

                  {/* Connecting Line */}
                  {idx < ANGLES.length - 1 && (
                    <View
                      style={[
                        styles.connectingLine,
                        idx < capturedImages.length && styles.connectingLineCompleted,
                      ]}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* Face Guide Center Area */}
        <View style={styles.faceGuideArea}>
          <View style={styles.avatarWrapper}>
            <Image
              source={require("../assets/images/enrollment_face_guide.png")}
              style={styles.avatarImage}
              resizeMode="contain"
            />
          </View>

          {/* Current Step Instruction Title */}
          <Text style={styles.instructionPrompt}>{currentStepTitle}</Text>
        </View>

        {/* Action Button Section */}
        <View style={styles.actionSection}>
          {!isAllCaptured ? (
            <TouchableOpacity
              style={styles.primaryPillButton}
              onPress={() => setShowCamera(true)}
              activeOpacity={0.85}
            >
              <Ionicons
                name="camera"
                size={20}
                color="#FFFFFF"
                style={{ marginRight: 8 }}
              />
              <Text style={styles.primaryButtonText}>
                {`Capture Photo ${currentAngle + 1}/${ANGLES.length}`}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: "100%", gap: 12 }}>
              <TouchableOpacity
                style={[styles.primaryPillButton, styles.submitPillButton]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#FFFFFF"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.primaryButtonText}>
                      Complete Enrollment
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.retakeButton}
                onPress={resetEnrollment}
                disabled={loading}
              >
                <Ionicons
                  name="refresh"
                  size={16}
                  color="#64748B"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.retakeButtonText}>Retake Photos</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Full-Screen Camera Modal */}
      <Modal visible={showCamera} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <Camera
            onCapture={handleCapture}
            onCancel={() => setShowCamera(false)}
            cameraType="front"
            title={ANGLES[currentAngle]?.label || "Look straight ahead"}
            stepBadge={`${currentAngle + 1}/${ANGLES.length}`}
          />
        </SafeAreaView>
      </Modal>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0066FF" />
            <Text style={styles.loadingText}>{loadingStatus}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FAFAFA",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    width: 80,
  },
  backButtonText: {
    fontSize: 17,
    fontWeight: "500",
    color: "#0066FF",
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  headerRightSpacer: {
    width: 80,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  instructionCard: {
    flexDirection: "row",
    backgroundColor: "#F0F6FF",
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-start",
    marginBottom: 28,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DCE9FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    marginTop: 2,
  },
  cardTextBox: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 19,
  },
  stepperContainer: {
    marginBottom: 36,
    paddingHorizontal: 8,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  stepItem: {
    alignItems: "center",
    width: 86,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stepCircleActive: {
    backgroundColor: "#0066FF",
  },
  stepCircleCompleted: {
    backgroundColor: "#16A34A",
  },
  stepNumberText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#94A3B8",
  },
  stepNumberTextActive: {
    color: "#FFFFFF",
  },
  stepLabel: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 16,
  },
  stepLabelActive: {
    color: "#0F172A",
    fontWeight: "600",
  },
  connectingLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E2E8F0",
    marginTop: 19,
    marginHorizontal: -4,
  },
  connectingLineCompleted: {
    backgroundColor: "#16A34A",
  },
  faceGuideArea: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
  },
  avatarWrapper: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 220,
    height: 220,
  },
  instructionPrompt: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 24,
    textAlign: "center",
  },
  actionSection: {
    marginTop: 28,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  primaryPillButton: {
    backgroundColor: "#0066FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 320,
    height: 54,
    borderRadius: 27,
    shadowColor: "#0066FF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  submitPillButton: {
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  retakeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  retakeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loadingBox: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
});
