import axios, { AxiosInstance } from "axios";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../lib/supabase";
import { getDeviceFingerprint } from "./device";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://facepass-hr.fastapicloud.dev";

/**
 * Ensure image is delivered as a local file URI (file://...) so React Native
 * Android networking streams the multipart form-data payload natively without corruption.
 */
async function resolveFileUri(imageInput: string, prefix = "punch"): Promise<string> {
  if (imageInput.startsWith("file://") || imageInput.startsWith("content://")) {
    return imageInput;
  }
  // A bare "/" prefix could be a real file path OR raw JPEG base64 (which
  // always starts with "/9j/" due to the SOI marker).  Real file paths are
  // short; base64 payloads are hundreds of KB.
  if (imageInput.startsWith("/") && imageInput.length < 1000 && !imageInput.startsWith("/9j/")) {
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

// Auto-clean expired/revoked sessions on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      console.log("Session expired (401), cleared local session cache.");
      try {
        await supabase.auth.signOut();
      } catch (_) {}
    }
    return Promise.reject(error);
  }
);

/**
 * Post multipart/form-data payload using XMLHttpRequest.
 * React Native's Android core handles { uri, type, name } natively via XMLHttpRequest,
 * ensuring proper multipart boundaries and file streaming.
 */
async function postFormData<T = any>(endpoint: string, formData: FormData): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const url = `${API_URL}${endpoint}`;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = 45000;

    xhr.setRequestHeader("Accept", "application/json");
    if (session?.access_token) {
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    }

    xhr.onload = () => {
      let data: any;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = { detail: xhr.responseText };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        let detailMsg = data?.detail || data?.message;
        if (Array.isArray(detailMsg)) {
          detailMsg = detailMsg.map((item: any) => item.msg || JSON.stringify(item)).join("\n");
        } else if (typeof detailMsg === "object" && detailMsg !== null) {
          detailMsg = JSON.stringify(detailMsg);
        }
        const message = detailMsg || `Biometric request failed with status ${xhr.status}`;
        const error: any = new Error(message);
        error.response = { status: xhr.status, data };
        reject(error);
      }
    };

    xhr.onerror = (e) => {
      console.error("XHR error:", e);
      const error: any = new Error(
        "Network connection failed. Unable to reach FacePass biometrics server. Please verify your internet connection."
      );
      error.isNetworkError = true;
      reject(error);
    };

    xhr.ontimeout = () => {
      const error: any = new Error("Biometric request timed out. Please try again.");
      error.isTimeout = true;
      reject(error);
    };

    xhr.send(formData);
  });
}

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
  clientUuid?: string,
  offlineTimestamp?: string
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
  if (offlineTimestamp) formData.append("offline_timestamp", offlineTimestamp);

  return await postFormData("/api/attendance/check-in", formData);
}

/**
 * Check out with face image and GPS coordinates.
 */
export async function checkOut(
  imageBase64: string,
  latitude: number,
  longitude: number,
  challengeId?: string,
  clientUuid?: string,
  deviceFingerprint?: string,
  offlineTimestamp?: string
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

  const fp = deviceFingerprint || (await getDeviceFingerprint());
  formData.append("device_fingerprint", fp);

  if (clientUuid) formData.append("client_uuid", clientUuid);
  if (offlineTimestamp) formData.append("offline_timestamp", offlineTimestamp);

  return await postFormData("/api/attendance/check-out", formData);
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

  return await postFormData("/api/employees/enroll", formData);
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

  return await postFormData("/api/auth/avatar", formData);
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

  return await postFormData("/api/attendance/kiosk-punch", formData);
}

/**
 * Fetch active sites for dynamic geofence verification.
 */
export async function getActiveSites(): Promise<
  {
    id: string;
    name: string;
    address?: string;
    latitude: number;
    longitude: number;
    radius_meters: number;
  }[]
> {
  try {
    const response = await api.get("/api/attendance/sites");
    return response.data?.sites || [];
  } catch {
    return [];
  }
}

export default api;
