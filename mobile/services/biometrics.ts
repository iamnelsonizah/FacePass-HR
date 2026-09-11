import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BIOMETRICS_ENABLED_KEY = "facepass_biometrics_enabled_v1";
const BIOMETRICS_CREDENTIALS_KEY = "facepass_biometrics_creds_v1";

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricType: "face" | "fingerprint" | "iris" | "biometric" | null;
  label: string; // e.g. "Face ID", "Touch ID", "Fingerprint", "Biometrics"
}

export interface StoredBiometricCreds {
  emailOrId: string;
  password: string;
  displayName?: string;
  savedAt: string;
}

/**
 * Check device biometric hardware, enrollment, and specific type (Face ID vs Fingerprint).
 */
export async function checkBiometricSupport(): Promise<BiometricStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return {
        hasHardware: false,
        isEnrolled: false,
        biometricType: null,
        label: "Biometrics",
      };
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let biometricType: BiometricStatus["biometricType"] = "biometric";
    let label = Platform.OS === "ios" ? "Face ID" : "Biometrics";

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricType = "face";
      label = Platform.OS === "ios" ? "Face ID" : "Face Unlock";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricType = "fingerprint";
      label = Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometricType = "iris";
      label = "Iris Scanner";
    }

    return {
      hasHardware: true,
      isEnrolled,
      biometricType,
      label,
    };
  } catch (err) {
    console.warn("Failed to check biometric capabilities:", err);
    return {
      hasHardware: false,
      isEnrolled: false,
      biometricType: null,
      label: "Biometrics",
    };
  }
}

/**
 * Check if the user has enabled biometric login in FacePass.
 */
export async function isBiometricsEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

/**
 * Enable or disable biometric login preference.
 */
export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, "true");
    } else {
      await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, "false");
    }
  } catch (err) {
    console.warn("Could not save biometrics preference:", err);
  }
}

/**
 * Prompt the user for Face ID / Fingerprint verification.
 */
export async function authenticateWithBiometrics(
  promptMessage = "Authenticate to access FacePass"
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      fallbackLabel: "Use Password",
      disableDeviceFallback: false,
    });

    if (result.success) {
      return { success: true };
    }

    return {
      success: false,
      error: result.error || "Biometric authentication failed",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Biometric authentication error",
    };
  }
}

/**
 * Securely store login credentials for fast biometric re-authentication.
 */
export async function saveBiometricCredentials(
  emailOrId: string,
  password: string,
  displayName?: string
): Promise<void> {
  try {
    const data: StoredBiometricCreds = {
      emailOrId: emailOrId.trim(),
      password,
      displayName,
      savedAt: new Date().toISOString(),
    };
    await SecureStore.setItemAsync(
      BIOMETRICS_CREDENTIALS_KEY,
      JSON.stringify(data)
    );
    await setBiometricsEnabled(true);
  } catch (err) {
    console.warn("Failed to securely store biometric credentials:", err);
  }
}

/**
 * Retrieve securely stored biometric credentials.
 */
export async function getBiometricCredentials(): Promise<StoredBiometricCreds | null> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRICS_CREDENTIALS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredBiometricCreds;
  } catch (err) {
    console.warn("Failed to retrieve stored biometric credentials:", err);
    return null;
  }
}

/**
 * Clear stored biometric credentials (e.g. on manual logout or toggle off).
 */
export async function clearBiometricCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRICS_CREDENTIALS_KEY);
    await SecureStore.deleteItemAsync(BIOMETRICS_ENABLED_KEY);
  } catch (err) {
    console.warn("Failed to clear biometric credentials:", err);
  }
}
