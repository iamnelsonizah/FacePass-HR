/**
 * Push Notification & Daily Shift Reminder Service
 *
 * expo-notifications throws on Android when running inside Expo Go (SDK 53+).
 * To prevent the app from crashing at startup we lazy-load the module with a
 * dynamic import() wrapped in try/catch.  All public functions degrade
 * gracefully – they return safe defaults if the module is unavailable.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isRunningInExpoGo } from "expo";

const REMINDERS_ENABLED_KEY = "facepass_reminders_enabled_v1";

// Lazy-loaded reference — populated on first successful dynamic import
let Notifications: typeof import("expo-notifications") | null = null;
let loadAttempted = false;
let loadFailed = false;

/**
 * Dynamically load expo-notifications. Returns null when running inside
 * Expo Go on Android (or if the import fails for any other reason).
 */
async function getNotifications(): Promise<typeof import("expo-notifications") | null> {
  if (Notifications) return Notifications;
  if (loadAttempted) return Notifications;

  loadAttempted = true;

  // Expo Go on Android does not support expo-notifications (throws synchronously on import)
  if (Platform.OS === "android" && isRunningInExpoGo()) {
    loadFailed = true;
    console.log(
      "[notifications] Android Expo Go detected. Push notifications are deferred for standalone APK build."
    );
    return null;
  }

  try {
    const mod = await import("expo-notifications");
    Notifications = mod;

    // Configure foreground display once the module is available
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    return Notifications;
  } catch (err) {
    loadFailed = true;
    console.warn(
      "[notifications] expo-notifications is not available in this environment " +
        "(Expo Go on Android does not support push notifications). " +
        "Local notification features will be disabled.",
      err
    );
    return null;
  }
}

/**
 * Returns true when expo-notifications could not be loaded (e.g. Expo Go on Android).
 */
export function isNotificationsUnavailable(): boolean {
  return (Platform.OS === "android" && isRunningInExpoGo()) || loadFailed;
}

/**
 * Request notification permissions from the user and set up Android channels.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const N = await getNotifications();
    if (!N) return false;

    const { status: existingStatus } = await N.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return false;
    }

    // Configure notification channel for Android 8.0+
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("attendance-reminders", {
        name: "Shift & Attendance Reminders",
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#2563EB",
        sound: "default",
      });
    }

    return true;
  } catch (err) {
    console.warn("Could not request notification permissions:", err);
    return false;
  }
}

/**
 * Check if daily attendance reminders are enabled in local storage.
 */
export async function areRemindersEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(REMINDERS_ENABLED_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

/**
 * Enable or disable shift reminders.
 */
export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  try {
    if (enabled) {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        return false;
      }
      await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, "true");
      await scheduleDailyShiftReminders();
      return true;
    } else {
      await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, "false");
      await cancelAllReminders();
      return true;
    }
  } catch (err) {
    console.warn("Error toggling reminders:", err);
    return false;
  }
}

/**
 * Schedule recurring daily morning (8:45 AM) and evening (5:00 PM) reminders.
 */
export async function scheduleDailyShiftReminders(options?: {
  checkInHour?: number;
  checkInMinute?: number;
  checkOutHour?: number;
  checkOutMinute?: number;
}): Promise<void> {
  try {
    const N = await getNotifications();
    if (!N) return;

    // Clear existing scheduled attendance reminders
    await cancelAllReminders();

    const inHour = options?.checkInHour ?? 8;
    const inMinute = options?.checkInMinute ?? 45;
    const outHour = options?.checkOutHour ?? 17;
    const outMinute = options?.checkOutMinute ?? 0;

    // 1. Morning Check-In Reminder (e.g. 8:45 AM)
    await N.scheduleNotificationAsync({
      content: {
        title: "FacePass Attendance Reminder ⏰",
        body: "Good morning! Don't forget to complete your facial check-in today.",
        data: { screen: "index", action: "check_in" },
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.CALENDAR,
        hour: inHour,
        minute: inMinute,
        repeats: true,
      },
    });

    // 2. Evening Check-Out Reminder (e.g. 5:00 PM)
    await N.scheduleNotificationAsync({
      content: {
        title: "Shift Ending Soon 👋",
        body: "Remember to complete your facial check-out before leaving the worksite.",
        data: { screen: "index", action: "check_out" },
        sound: true,
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.CALENDAR,
        hour: outHour,
        minute: outMinute,
        repeats: true,
      },
    });
  } catch (err) {
    console.warn("Failed to schedule daily shift reminders:", err);
  }
}

/**
 * Send an immediate test notification to verify delivery on the user's device.
 */
export async function sendTestNotification(): Promise<boolean> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return false;

    const N = await getNotifications();
    if (!N) return false;

    await N.scheduleNotificationAsync({
      content: {
        title: "FacePass Notifications Active! 🔔",
        body: "Your daily shift check-in (8:45 AM) and check-out (5:00 PM) alerts are configured.",
        data: { screen: "index" },
        sound: true,
      },
      trigger: null, // deliver immediately
    });
    return true;
  } catch (err) {
    console.warn("Could not trigger test notification:", err);
    return false;
  }
}

/**
 * Cancel all scheduled reminders.
 */
export async function cancelAllReminders(): Promise<void> {
  try {
    const N = await getNotifications();
    if (!N) return;
    await N.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn("Error canceling notifications:", err);
  }
}
