import React, { useRef, useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";

interface CameraProps {
  onCapture: (base64Image: string) => void;
  cameraType?: CameraType;
  showCaptureButton?: boolean;
  instruction?: string;
  allowFlip?: boolean;
}

/**
 * Production-ready Camera component for FacePass biometric capture.
 * Features:
 * - Natural selfie mirroring for front camera
 * - Responsive face alignment oval
 * - Camera flip toggle for supervisor / kiosk modes
 * - Direct Settings link if system permissions were permanently denied
 */
export default function Camera({
  onCapture,
  cameraType: initialCameraType = "front",
  showCaptureButton = true,
  instruction = "Position your face inside the oval",
  allowFlip = true,
}: CameraProps) {
  const cameraRef = useRef<CameraView>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [facing, setFacing] = useState<CameraType>(initialCameraType);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

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

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      await new Promise((r) => setTimeout(r, 200));

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85,
        shutterSound: false,
      });

      if (photo?.base64) {
        onCapture(photo.base64);
      }
    } catch (error: any) {
      console.warn("First camera capture failed, retrying in 300ms...", error.message);
      try {
        await new Promise((r) => setTimeout(r, 300));
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.85,
          shutterSound: false,
        });

        if (photo?.base64) {
          onCapture(photo.base64);
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

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={[styles.camera, { width: windowWidth, height: windowHeight }]}
        facing={facing}
        mirror={facing === "front"}
        onCameraReady={() => {
          setTimeout(() => setIsCameraReady(true), 250);
        }}
        onLayout={(e) => {
          if (e.nativeEvent.layout.width > 0 && e.nativeEvent.layout.height > 0) {
            setIsCameraReady(true);
          }
        }}
      />

      {/* Face outline guide overlay as sibling */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          {allowFlip && (
            <TouchableOpacity
              style={styles.flipButton}
              onPress={toggleCameraFacing}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.flipButtonText}>🔄 Flip</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.faceOutline} />

        <View style={styles.instructionPill}>
          <Text style={styles.instructionText}>
            {!isCameraReady ? "Initializing camera..." : instruction}
          </Text>
        </View>
      </View>

      {showCaptureButton && (
        <TouchableOpacity
          style={[
            styles.captureButton,
            (isCapturing || !isCameraReady) && styles.captureButtonDisabled,
          ]}
          onPress={handleCapture}
          disabled={isCapturing || !isCameraReady}
        >
          {isCapturing ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    justifyContent: "flex-end",
  },
  flipButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  flipButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
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
  instructionPill: {
    backgroundColor: "rgba(17, 24, 39, 0.75)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 20,
  },
  instructionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  captureButton: {
    position: "absolute",
    bottom: 36,
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(37, 99, 235, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#2563EB",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
    backgroundColor: "#f9fafb",
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
