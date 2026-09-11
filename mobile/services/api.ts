import axios, { AxiosInstance } from "axios";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import { getDeviceFingerprint } from "./device";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Ensure image is delivered as a local file URI (file://...) so React Native
 * Android networking streams the multipart form-data payload natively without corruption.
 */
async function resolveFileUri(imageInput: string, prefix = "punch"): Promise<string> {
  if (imageInput.startsWith("file://")) {
    return imageInput;
  }
  if (imageInput.startsWith("/")) {
    return `file://${imageInput}`;
  }
  // Write base64 string to a cache file
  const cleanBase64 = imageInput.replace(/^data:image\/[a-z]+;base64,/, "");
  const targetPath = `${FileSystem.cacheDirectory}${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
  await FileSystem.writeAsStringAsync(targetPath, cleanBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return targetPath;
}

/**
 * Axios instance configured with auth token injection.
 */
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Inject auth token into every request
api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// ---------- API Methods ----------

/**
 * Check in with face image and GPS coordinates.
 */
export async function checkIn(
  imageBase64: string,
  latitude: number,
  longitude: number,
  challengeId?: string,
  deviceFingerprint?: string,
  clientUuid?: string
) {
  const fileUri = await resolveFileUri(imageBase64, "checkin");
  const formData = new FormData();

  formData.append("image", {
    uri: fileUri,
    type: "image/jpeg",
    name: "checkin.jpg",
  } as any);
  formData.append("latitude", latitude.toString());
  formData.append("longitude", longitude.toString());

  if (challengeId) formData.append("challenge_id", challengeId);

  const fp = deviceFingerprint || (await getDeviceFingerprint());
  formData.append("device_fingerprint", fp);

  if (clientUuid) formData.append("client_uuid", clientUuid);

  const response = await api.post("/api/attendance/check-in", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

/**
 * Check out with face image and GPS coordinates.
 */
export async function checkOut(
  imageBase64: string,
  latitude: number,
  longitude: number,
  challengeId?: string,
  clientUuid?: string
) {
  const fileUri = await resolveFileUri(imageBase64, "checkout");
  const formData = new FormData();

  formData.append("image", {
    uri: fileUri,
    type: "image/jpeg",
    name: "checkout.jpg",
  } as any);
  formData.append("latitude", latitude.toString());
  formData.append("longitude", longitude.toString());

  if (challengeId) formData.append("challenge_id", challengeId);

  const fp = await getDeviceFingerprint();
  formData.append("device_fingerprint", fp);

  if (clientUuid) formData.append("client_uuid", clientUuid);

  const response = await api.post("/api/attendance/check-out", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

/**
 * Enroll employee with face images.
 */
export async function enroll(images: string[], employeeId: string) {
  const formData = new FormData();
  formData.append("employee_id", employeeId);

  for (let index = 0; index < images.length; index++) {
    const fileUri = await resolveFileUri(images[index], `enroll_${index}`);
    formData.append("images", {
      uri: fileUri,
      type: "image/jpeg",
      name: `enrollment_${index}.jpg`,
    } as any);
  }

  const response = await api.post("/api/employees/enroll", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

/**
 * Get a liveness challenge.
 */
export async function getLivenessChallenge() {
  const response = await api.get("/api/attendance/challenge");
  return response.data;
}

/**
 * Get current user profile.
 */
export async function getProfile() {
  const response = await api.get("/api/auth/me");
  return response.data;
}

/**
 * Update current user profile details.
 */
export async function updateProfile(data: {
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
}) {
  const response = await api.put("/api/auth/me", data);
  return response.data;
}

/**
 * Upload a profile avatar image to Supabase Storage.
 */
export async function uploadAvatar(imageUri: string) {
  const fileUri = await resolveFileUri(imageUri, "avatar");
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: "image/jpeg",
    name: "avatar.jpg",
  } as any);

  const response = await api.post("/api/auth/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

/**
 * Get personal attendance history and stats for the logged in worker.
 */
export async function getMyAttendanceHistory(limit: number = 30) {
  const response = await api.get("/api/attendance/my-history", {
    params: { limit },
  });
  return response.data;
}

/**
 * Supervisor Kiosk: Continuous 1:N attendance scanning.
 */
export async function kioskPunch(
  imageBase64: string,
  latitude: number,
  longitude: number,
  siteId?: string,
  deviceFingerprint?: string
) {
  const fileUri = await resolveFileUri(imageBase64, "kiosk");
  const formData = new FormData();

  formData.append("image", {
    uri: fileUri,
    type: "image/jpeg",
    name: "kiosk_punch.jpg",
  } as any);
  formData.append("latitude", latitude.toString());
  formData.append("longitude", longitude.toString());

  if (siteId) formData.append("site_id", siteId);

  const fp = deviceFingerprint || (await getDeviceFingerprint());
  formData.append("device_fingerprint", fp);

  const response = await api.post("/api/attendance/kiosk-punch", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export default api;
