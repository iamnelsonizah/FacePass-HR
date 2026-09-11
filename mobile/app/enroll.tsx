import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Camera from "../components/Camera";
import { enroll, getProfile } from "../services/api";

const ANGLES = [
  { label: "Look straight ahead", emoji: "😐" },
  { label: "Turn slightly left", emoji: "👈" },
  { label: "Turn slightly right", emoji: "👉" },
];

/**
 * Enrollment screen — captures face images at different angles.
 */
export default function EnrollScreen() {
  const router = useRouter();
  const [currentAngle, setCurrentAngle] = useState(0);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCapture = (base64Image: string) => {
    const newImages = [...capturedImages, base64Image];
    setCapturedImages(newImages);
    setShowCamera(false);

    if (newImages.length < ANGLES.length) {
      setCurrentAngle(newImages.length);
    }
  };

  const handleSubmit = async () => {
    if (capturedImages.length < ANGLES.length) {
      Alert.alert("Incomplete", "Please capture all required face angles");
      return;
    }

    setLoading(true);
    try {
      // Get employee ID from profile
      const profile = await getProfile();

      await enroll(capturedImages, profile.id);

      Alert.alert("Success! 🎉", "Your face has been enrolled successfully.", [
        { text: "Continue", onPress: () => router.replace("/") },
      ]);
    } catch (error: any) {
      const message =
        error.response?.data?.detail || error.message || "Enrollment failed";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  const resetEnrollment = () => {
    setCapturedImages([]);
    setCurrentAngle(0);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Face Enrollment</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Instructions */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionTitle}>📸 Capture your face</Text>
          <Text style={styles.instructionText}>
            We need {ANGLES.length} photos of your face from different angles for
            accurate recognition. Make sure you're in good lighting.
          </Text>
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          {ANGLES.map((angle, index) => (
            <View key={index} style={styles.progressStep}>
              <View
                style={[
                  styles.progressDot,
                  index < capturedImages.length && styles.progressDotDone,
                  index === currentAngle &&
                    capturedImages.length < ANGLES.length &&
                    styles.progressDotActive,
                ]}
              >
                <Text style={styles.progressDotText}>
                  {index < capturedImages.length ? "✓" : index + 1}
                </Text>
              </View>
              <Text style={styles.progressLabel}>{angle.label}</Text>
            </View>
          ))}
        </View>

        {/* Capture Button */}
        {capturedImages.length < ANGLES.length ? (
          <View style={styles.captureSection}>
            <Text style={styles.currentAngleEmoji}>
              {ANGLES[currentAngle].emoji}
            </Text>
            <Text style={styles.currentAngleLabel}>
              {ANGLES[currentAngle].label}
            </Text>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={() => setShowCamera(true)}
            >
              <Text style={styles.captureButtonText}>
                📷 Capture Photo {currentAngle + 1}/{ANGLES.length}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.completeSection}>
            <Text style={styles.completeEmoji}>✅</Text>
            <Text style={styles.completeText}>
              All {ANGLES.length} photos captured!
            </Text>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? "Enrolling..." : "Complete Enrollment"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resetButton} onPress={resetEnrollment}>
              <Text style={styles.resetButtonText}>↻ Retake Photos</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Camera Modal */}
      <Modal visible={showCamera} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCamera(false)}>
              <Text style={styles.modalCloseText}>✕ Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {ANGLES[currentAngle].label}
            </Text>
            <View style={{ width: 70 }} />
          </View>
          <Camera onCapture={handleCapture} cameraType="front" />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  backButton: {
    fontSize: 16,
    color: "#2563EB",
    fontWeight: "500",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  instructionCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  instructionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1E40AF",
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: "#3B82F6",
    lineHeight: 20,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 32,
  },
  progressStep: {
    alignItems: "center",
    flex: 1,
  },
  progressDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  progressDotDone: {
    backgroundColor: "#16A34A",
  },
  progressDotActive: {
    backgroundColor: "#2563EB",
  },
  progressDotText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  progressLabel: {
    fontSize: 11,
    color: "#6B7280",
    textAlign: "center",
  },
  captureSection: {
    alignItems: "center",
    paddingVertical: 32,
  },
  currentAngleEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  currentAngleLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 24,
  },
  captureButton: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  captureButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  completeSection: {
    alignItems: "center",
    paddingVertical: 32,
  },
  completeEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  completeText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#16A34A",
    marginBottom: 24,
  },
  submitButton: {
    backgroundColor: "#16A34A",
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  resetButton: {
    marginTop: 16,
    padding: 12,
  },
  resetButtonText: {
    color: "#6B7280",
    fontSize: 14,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#000",
  },
  modalCloseText: {
    color: "#fff",
    fontSize: 16,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
