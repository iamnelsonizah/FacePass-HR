import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { checkIn, checkOut } from "./api";
import { getDeviceFingerprint } from "./device";

const QUEUE_STORAGE_KEY = "facepass_offline_attendance_queue_v1";
const QUEUE_DIR = `${FileSystem.documentDirectory}facepass_queue/`;

export interface QueuedAttendance {
  clientUuid: string;
  photoFilePath: string;
  latitude: number;
  longitude: number;
  checkType: "check_in" | "check_out";
  timestamp: string;
  deviceFingerprint: string;
  challengeId?: string;
  retryCount: number;
  lastError?: string;
}

/**
 * Ensure queue directory exists.
 */
async function ensureDirectoryExists(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
}

/**
 * Get all queued check-in records from storage.
 */
export async function getQueuedItems(): Promise<QueuedAttendance[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read offline queue:", err);
    return [];
  }
}

/**
 * Save updated queue items to storage.
 */
async function saveQueueItems(items: QueuedAttendance[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
}

/**
 * Get current count of pending offline records.
 */
export async function getQueueCount(): Promise<number> {
  const items = await getQueuedItems();
  return items.length;
}

/**
 * Save an attendance record locally when network is unavailable.
 *
 * Saves the photo to disk and queues the metadata with a persistent client UUID.
 */
export async function enqueueAttendance(
  imageBase64: string,
  latitude: number,
  longitude: number,
  checkType: "check_in" | "check_out" = "check_in",
  challengeId?: string
): Promise<QueuedAttendance> {
  await ensureDirectoryExists();

  const clientUuid = Crypto.randomUUID();
  const photoFilePath = `${QUEUE_DIR}${clientUuid}.jpg`;

  // Write base64 image to local disk file
  await FileSystem.writeAsStringAsync(photoFilePath, imageBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const deviceFingerprint = await getDeviceFingerprint();

  const item: QueuedAttendance = {
    clientUuid,
    photoFilePath,
    latitude,
    longitude,
    checkType,
    timestamp: new Date().toISOString(),
    deviceFingerprint,
    challengeId,
    retryCount: 0,
  };

  const queue = await getQueuedItems();
  queue.push(item);
  await saveQueueItems(queue);

  return item;
}

/**
 * Process and flush the offline queue, uploading items to the backend.
 */
let isFlushing = false;

export async function flushQueue(
  onProgress?: (synced: number, total: number) => void
): Promise<{ synced: number; failed: number }> {
  if (isFlushing) {
    return { synced: 0, failed: 0 };
  }

  const net = await NetInfo.fetch();
  if (!net.isConnected || !net.isInternetReachable) {
    return { synced: 0, failed: 0 };
  }

  isFlushing = true;
  let synced = 0;
  let failed = 0;

  try {
    const queue = await getQueuedItems();
    if (queue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    const remainingItems: QueuedAttendance[] = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      try {
        // Read photo file from disk
        const fileExists = await FileSystem.getInfoAsync(item.photoFilePath);
        if (!fileExists.exists) {
          // File missing, cannot retry
          continue;
        }

        // Use local file URI directly so React Native streams the file natively
        const photoUri = item.photoFilePath.startsWith("file://")
          ? item.photoFilePath
          : `file://${item.photoFilePath}`;

        if (item.checkType === "check_in") {
          await checkIn(
            photoUri,
            item.latitude,
            item.longitude,
            item.challengeId,
            item.deviceFingerprint,
            item.clientUuid
          );
        } else {
          await checkOut(
            photoUri,
            item.latitude,
            item.longitude,
            item.challengeId,
            item.clientUuid
          );
        }

        // Successfully synced: delete local image file
        await FileSystem.deleteAsync(item.photoFilePath, { idempotent: true });
        synced++;
        if (onProgress) onProgress(synced, queue.length);
      } catch (err: any) {
        const errorDetail = err.response?.data?.detail || err.message;
        console.warn(`Failed to sync queued item ${item.clientUuid}: ${errorDetail}`);
        failed++;
        item.retryCount += 1;
        item.lastError = typeof errorDetail === "string" ? errorDetail : JSON.stringify(errorDetail);

        // If client error (4xx like 400 Bad Request, 401 Unauthorized, 404 Not Found),
        // or if retry count >= 3, purge from queue and remove local file to prevent infinite retry loops.
        const isClientError =
          err.response?.status >= 400 &&
          err.response?.status < 500 &&
          err.response?.status !== 408 &&
          err.response?.status !== 429;

        if (isClientError || item.retryCount >= 3) {
          console.warn(`Purging unrecoverable queued item ${item.clientUuid} (${item.lastError})`);
          try {
            await FileSystem.deleteAsync(item.photoFilePath, { idempotent: true });
          } catch (_) {}
        } else {
          remainingItems.push(item);
        }
      }
    }

    await saveQueueItems(remainingItems);
  } finally {
    isFlushing = false;
  }

  return { synced, failed };
}

/**
 * Initialize automatic background sync when network connectivity is restored.
 */
export function initOfflineSyncListener(
  onQueueUpdate?: (count: number) => void
): () => void {
  const unsubscribe = NetInfo.addEventListener(async (state) => {
    if (state.isConnected && state.isInternetReachable) {
      const count = await getQueueCount();
      if (count > 0) {
        await flushQueue();
        if (onQueueUpdate) {
          const newCount = await getQueueCount();
          onQueueUpdate(newCount);
        }
      }
    }
  });

  return unsubscribe;
}

/**
 * Purge all items from the offline queue and clean up local images.
 */
export async function clearOfflineQueue(): Promise<void> {
  try {
    const queue = await getQueuedItems();
    for (const item of queue) {
      await FileSystem.deleteAsync(item.photoFilePath, { idempotent: true });
    }
  } catch (e) {
    console.warn("Error deleting queue files:", e);
  }
  await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
}
