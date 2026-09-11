import * as Device from "expo-device";
import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const FINGERPRINT_CACHE_KEY = "facepass_device_fingerprint_v1";

/**
 * Detailed hardware information for audit logs.
 */
export interface DeviceInfo {
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  modelId: string | null;
  osName: string | null;
  osVersion: string | null;
  osBuildId: string | null;
  platformId: string | null;
  isDevice: boolean;
}

/**
 * Collect raw device telemetry.
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  let platformId: string | null = null;
  try {
    if (Platform.OS === "ios") {
      platformId = await Application.getIosIdForVendorAsync();
    } else if (Platform.OS === "android") {
      platformId = Application.getAndroidId();
    }
  } catch (err) {
    console.warn("Could not retrieve vendor platform ID:", err);
  }

  return {
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    modelName: Device.modelName,
    modelId: Device.modelId,
    osName: Device.osName,
    osVersion: Device.osVersion,
    osBuildId: Device.osBuildId,
    platformId,
    isDevice: Device.isDevice,
  };
}

/**
 * Generate a persistent SHA-256 cryptographic hardware fingerprint.
 *
 * This binds check-ins to the specific physical smartphone, preventing
 * buddy punching, proxy check-ins, or account sharing across multiple devices.
 */
export async function getDeviceFingerprint(): Promise<string> {
  // Check secure cache first for instant retrieval
  try {
    const cached = await SecureStore.getItemAsync(FINGERPRINT_CACHE_KEY);
    if (cached) {
      return cached;
    }
  } catch (err) {
    // SecureStore fallback if unavailable
  }

  const info = await getDeviceInfo();

  // Deterministic seed payload
  const seed = [
    info.brand || "unknown_brand",
    info.manufacturer || "unknown_mfr",
    info.modelName || "unknown_model",
    info.modelId || "unknown_model_id",
    info.osName || Platform.OS,
    info.osVersion || "unknown_os_v",
    info.platformId || "fallback_id_" + Platform.OS,
  ].join("::");

  // Hash with SHA-256
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    seed
  );

  // Store in secure storage
  try {
    await SecureStore.setItemAsync(FINGERPRINT_CACHE_KEY, hash);
  } catch (err) {
    console.warn("Could not cache device fingerprint in SecureStore:", err);
  }

  return hash;
}
