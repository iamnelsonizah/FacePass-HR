import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import NetInfo from "@react-native-community/netinfo";
import { checkIn, checkOut } from "./api";

export interface QueuedAttendanceRecord {
  id: string;
  imageUri: string;
  latitude: number;
  longitude: number;
  checkType: "check_in" | "check_out";
  challengeId?: string;
  deviceFingerprint?: string;
  timestamp: string; // ISO string when the punch happened offline
  attempts: number;
  status: "pending" | "syncing" | "failed";
  lastError?: string;
}

const STORAGE_KEY = "@facepass_offline_queue_v1";
const OFFLINE_DIR = `${FileSystem.documentDirectory}facepass_offline/`;

type CountListener = (count: number) => void;
const countListeners: Set<CountListener> = new Set();

let isSyncing = false;

function notifyListeners(count: number) {
  countListeners.forEach((listener) => {
    try {
      listener(count);
    } catch (e) {
      console.warn("Queue listener notification note:", e);
    }
  });
}

/**
 * Ensure the offline punch directory exists.
 */
async function ensureDirExists() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(OFFLINE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(OFFLINE_DIR, { intermediates: true });
    }
  } catch (err) {
    console.warn("Could not create offline dir:", err);
  }
}

/**
 * Get all queued punches from local storage.
 */
export async function getQueuedRecords(): Promise<QueuedAttendanceRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading offline queue:", err);
    return [];
  }
}

/**
 * Get number of queued punches.
 */
export async function getQueueCount(): Promise<number> {
  const records = await getQueuedRecords();
  return records.length;
}

/**
 * Enqueue an attendance punch offline.
 */
export async function enqueueAttendance(
  imageInput: string,
  latitude: number,
  longitude: number,
  checkType: "check_in" | "check_out" = "check_in",
  challengeId?: string,
  deviceFingerprint?: string
): Promise<QueuedAttendanceRecord> {
  await ensureDirExists();

  const id = `fp_off_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const filePath = `${OFFLINE_DIR}${id}.jpg`;

  // Save image to durable local storage
  if (imageInput.startsWith("data:image/") || imageInput.length > 500) {
    const cleanBase64 = imageInput.replace(/^data:image\/[a-z]+;base64,/, "");
    await FileSystem.writeAsStringAsync(filePath, cleanBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else if (imageInput.startsWith("file://")) {
    await FileSystem.copyAsync({
      from: imageInput,
      to: filePath,
    });
  } else {
    await FileSystem.writeAsStringAsync(filePath, imageInput, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  const record: QueuedAttendanceRecord = {
    id,
    imageUri: filePath,
    latitude,
    longitude,
    checkType,
    challengeId: challengeId || "passive-subsecond",
    deviceFingerprint,
    timestamp: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  };

  const current = await getQueuedRecords();
  const updated = [...current, record];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

  notifyListeners(updated.length);

  // Attempt sync in background if online
  flushQueue().catch(() => {});

  return record;
}

/**
 * Remove a punch from the queue after successful upload.
 */
async function removeRecord(recordId: string, imageUri: string) {
  try {
    await FileSystem.deleteAsync(imageUri, { idempotent: true });
  } catch (_) {}

  const current = await getQueuedRecords();
  const updated = current.filter((r) => r.id !== recordId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notifyListeners(updated.length);
}

/**
 * Clear the entire offline queue (e.g. discarding stale records).
 */
export async function clearOfflineQueue(): Promise<void> {
  const records = await getQueuedRecords();
  for (const r of records) {
    try {
      await FileSystem.deleteAsync(r.imageUri, { idempotent: true });
    } catch (_) {}
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
  notifyListeners(0);
}

/**
 * Flush and upload all queued attendance records to the FacePass cloud.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) {
    const q = await getQueuedRecords();
    return { synced: 0, failed: q.length };
  }

  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    const q = await getQueuedRecords();
    return { synced: 0, failed: q.length };
  }

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const queue = await getQueuedRecords();
    if (queue.length === 0) {
      isSyncing = false;
      return { synced: 0, failed: 0 };
    }

    for (const item of queue) {
      try {
        if (item.checkType === "check_in") {
          await checkIn(
            item.imageUri,
            item.latitude,
            item.longitude,
            item.challengeId,
            item.deviceFingerprint,
            item.id,
            item.timestamp
          );
        } else {
          await checkOut(
            item.imageUri,
            item.latitude,
            item.longitude,
            item.challengeId,
            item.id,
            item.deviceFingerprint,
            item.timestamp
          );
        }

        await removeRecord(item.id, item.imageUri);
        synced++;
      } catch (err: any) {
        console.warn(`Sync failed for offline record ${item.id}:`, err?.message || err);

        // If server indicates already checked in/out or 409 duplicate
        if (err?.response?.status === 409 || err?.message?.includes("already")) {
          await removeRecord(item.id, item.imageUri);
          synced++;
          continue;
        }

        // If network connectivity dropped, stop sync loop
        if (err?.isNetworkError || !err?.response) {
          failed++;
          break;
        }

        // Increment attempts on non-network errors
        item.attempts += 1;
        item.status = "failed";
        item.lastError = err?.message || "Sync error";
        const current = await getQueuedRecords();
        const updated = current.map((r) => (r.id === item.id ? item : r));
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        failed++;
      }
    }
  } finally {
    isSyncing = false;
  }

  const currentCount = await getQueueCount();
  notifyListeners(currentCount);

  return { synced, failed };
}

/**
 * Subscribe to offline queue count changes and auto-sync on connectivity return.
 */
export function initOfflineSyncListener(onCountChange: (count: number) => void): () => void {
  countListeners.add(onCountChange);

  // Initial count
  getQueueCount().then(onCountChange).catch(() => {});

  // Listen to network state transitions
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      flushQueue()
        .then(() => getQueueCount().then(onCountChange))
        .catch(() => {});
    }
  });

  return () => {
    countListeners.delete(onCountChange);
    unsubscribeNet();
  };
}

// Aliases for compatibility
export const enqueuePunch = enqueueAttendance;
export const getQueuedPunches = getQueuedRecords;
export const syncQueue = flushQueue;
export const initOfflineQueue = initOfflineSyncListener;
