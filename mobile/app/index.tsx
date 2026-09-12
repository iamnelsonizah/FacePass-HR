import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { signOut } from "../services/auth";
import {
  checkIn,
  checkOut,
  getLivenessChallenge,
  getProfile,
  getMyAttendanceHistory,
  getActiveSites,
} from "../services/api";
import {
  getCurrentLocation,
  calculateDistance,
  getPlaceName,
} from "../services/location";
import { getDeviceFingerprint } from "../services/device";
import {
  enqueueAttendance,
  getQueueCount,
  flushQueue,
  clearOfflineQueue,
  initOfflineSyncListener,
} from "../services/offlineQueue";
import {
  checkBiometricSupport,
  isBiometricsEnabled,
  setBiometricsEnabled,
  clearBiometricCredentials,
  BiometricStatus,
} from "../services/biometrics";
import {
  areRemindersEnabled,
  setRemindersEnabled,
  sendTestNotification,
  isNotificationsUnavailable,
} from "../services/notifications";
import Camera from "../components/Camera";
import LivenessChallenge from "../components/LivenessChallenge";
import TimesheetHistory from "../components/TimesheetHistory";
import KioskScanner from "../components/KioskScanner";
import ProfileEditModal from "../components/ProfileEditModal";
import PremiumFaceIdIcon from "../components/PremiumFaceIdIcon";

type CheckMode = "check_in" | "check_out" | null;
type TabType = "home" | "attendance" | "history" | "profile";

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [userName, setUserName] = useState("");
  const [userProfile, setUserProfile] = useState<{
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    employee_code?: string;
    avatar_url?: string | null;
  }>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    employee_code: "",
    avatar_url: null,
  });

  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkMode, setCheckMode] = useState<CheckMode>(null);

  const [showCamera, setShowCamera] = useState(false);
  const [challenge, setChallenge] = useState<any>(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [livenessMode, setLivenessMode] = useState<"passive" | "active">("passive");
  const [showTimesheet, setShowTimesheet] = useState(false);
  const [showKiosk, setShowKiosk] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("home");

  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const [siteDistance, setSiteDistance] = useState<{
    meters: number;
    isInside: boolean;
    siteName: string;
    siteCity: string;
  }>({
    meters: 0,
    isInside: false,
    siteName: "Locating worksite...",
    siteCity: "Detecting location",
  });

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string>("");
  const [checkInDateObj, setCheckInDateObj] = useState<Date | null>(null);
  const [shiftDuration, setShiftDuration] = useState<string>("");

  const [todayLogs, setTodayLogs] = useState<{
    checkInTime: string | null;
    checkOutTime: string | null;
    verifyTime: string | null;
  }>({
    checkInTime: null,
    checkOutTime: null,
    verifyTime: null,
  });

  const [deviceFp, setDeviceFp] = useState<string>("");
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus | null>(null);
  const [biometricsActive, setBiometricsActive] = useState<boolean>(false);
  const [remindersActive, setRemindersActive] = useState<boolean>(false);

  // Compute initials fallback
  const initials =
    `${userProfile.first_name?.[0] || ""}${userProfile.last_name?.[0] || ""}`.toUpperCase() ||
    (userName ? userName.slice(0, 2).toUpperCase() : "FP");

  // Real-time Shift Duration Timer
  useEffect(() => {
    if (!isCheckedIn || !checkInDateObj) {
      setShiftDuration("");
      return;
    }
    const updateTimer = () => {
      const diffMs = Math.max(0, Date.now() - checkInDateObj.getTime());
      const totalMinutes = Math.floor(diffMs / 60000);
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      setShiftDuration(`${hrs}h ${mins}m`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 30000);
    return () => clearInterval(interval);
  }, [isCheckedIn, checkInDateObj]);

  useEffect(() => {
    loadProfile();
    loadDeviceFingerprint();
    refreshQueueCount();
    checkProximity();
    loadActivityHistory();
    loadBiometrics();
    loadReminders();

    const unsubscribe = initOfflineSyncListener((count) => {
      setPendingQueueCount(count);
    });

    return () => unsubscribe();
  }, []);

  const loadProfile = async () => {
    try {
      const profile = await getProfile();
      if (profile) {
        setUserProfile({
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          email: profile.email || "",
          phone: profile.phone || "",
          employee_code: profile.employee_code || "",
          avatar_url: profile.avatar_url || null,
        });
        if (profile.first_name || profile.last_name) {
          setUserName(
            `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
          );
        }
        if (profile.is_enrolled !== undefined) {
          setIsEnrolled(profile.is_enrolled);
        }
      }
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        console.log("No authenticated user, navigating to login...");
        router.replace("/auth/login");
      } else {
        console.log("Could not load profile:", error?.message || error);
      }
    }
  };

  const loadActivityHistory = async () => {
    try {
      const history = await getMyAttendanceHistory(10);
      if (history?.items && history.items.length > 0) {
        const todayStr = new Date().toDateString();
        let latestIn: Date | null = null;
        let latestOut: Date | null = null;

        for (const log of history.items) {
          const logDate = new Date(log.checked_at);
          if (logDate.toDateString() === todayStr) {
            if (log.check_type === "check_in" && !latestIn) {
              latestIn = logDate;
            } else if (log.check_type === "check_out" && !latestOut) {
              latestOut = logDate;
            }
          }
        }

        if (latestIn) {
          const timeFormatted = latestIn.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
          setCheckInTime(timeFormatted);
          setCheckInDateObj(latestIn);

          const verifyDate = new Date(latestIn.getTime() + 60000);
          const verifyFormatted = verifyDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });

          const latestOverall = history.items[0];
          setIsCheckedIn(latestOverall.check_type === "check_in");

          let outFormatted: string | null = null;
          if (latestOut) {
            outFormatted = latestOut.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
          }

          setTodayLogs({
            checkInTime: timeFormatted,
            checkOutTime: outFormatted,
            verifyTime: verifyFormatted,
          });
        } else {
          setIsCheckedIn(false);
        }
      }
    } catch (err) {
      console.log("Could not load attendance activity:", err);
    }
  };

  const loadDeviceFingerprint = async () => {
    try {
      const fp = await getDeviceFingerprint();
      setDeviceFp(fp);
    } catch (err) {
      console.warn("Could not get device fingerprint:", err);
    }
  };

  const loadBiometrics = async () => {
    try {
      const status = await checkBiometricSupport();
      setBiometricStatus(status);
      const active = await isBiometricsEnabled();
      setBiometricsActive(active);
    } catch (e) {
      console.warn("Could not check biometrics in home:", e);
    }
  };

  const loadReminders = useCallback(async () => {
    try {
      const active = await areRemindersEnabled();
      setRemindersActive(active);
    } catch (e) {
      console.warn("Could not load reminders status:", e);
    }
  }, []);

  const handleToggleBiometrics = async () => {
    if (!biometricStatus?.hasHardware) {
      Alert.alert("Unsupported", "This device does not have biometric hardware.");
      return;
    }

    if (biometricsActive) {
      Alert.alert(
        "Disable Biometric Login?",
        `Are you sure you want to disable ${biometricStatus.label} login? You will need to type your password next time you sign in.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disable",
            style: "destructive",
            onPress: async () => {
              await clearBiometricCredentials();
              setBiometricsActive(false);
              Alert.alert("Disabled", `${biometricStatus.label} login has been turned off.`);
            },
          },
        ]
      );
    } else {
      Alert.alert(
        `Enable ${biometricStatus.label}`,
        `To enable ${biometricStatus.label} 1-tap unlock, simply sign in from the login screen with 'Remember me' checked. FacePass will automatically link your device biometrics!`,
        [{ text: "Understood" }]
      );
    }
  };

  const handleToggleReminders = async () => {
    try {
      if (isNotificationsUnavailable()) {
        Alert.alert(
          "Not Available in Expo Go",
          "Push notifications require a development build on Android. This feature will work in production builds.",
          [{ text: "OK" }]
        );
        return;
      }

      if (remindersActive) {
        await setRemindersEnabled(false);
        setRemindersActive(false);
        Alert.alert(
          "Reminders Disabled",
          "Daily shift reminder notifications have been turned off."
        );
      } else {
        const success = await setRemindersEnabled(true);
        if (success) {
          setRemindersActive(true);
          Alert.alert(
            "Shift Reminders Active 🔔",
            "You will now receive automatic shift alerts:\n• Morning Check-in: 8:45 AM\n• Evening Check-out: 5:00 PM"
          );
        } else {
          Alert.alert(
            "Permission Required",
            "Please enable notification permissions in your device settings to receive attendance reminders."
          );
        }
      }
    } catch (err) {
      console.warn("Error toggling reminders:", err);
    }
  };

  const handleSendTestNotification = async () => {
    try {
      const sent = await sendTestNotification();
      if (sent) {
        Alert.alert(
          "Notification Triggered 🔔",
          "A test shift reminder notification was sent to your device! Check your notification tray."
        );
      } else {
        Alert.alert(
          "Permission Required",
          "Please enable notification permissions in your device settings."
        );
      }
    } catch (err) {
      console.warn("Could not send test notification:", err);
    }
  };

  const checkProximity = async () => {
    try {
      const loc = await getCurrentLocation();
      const place = await getPlaceName(loc.latitude, loc.longitude);

      // Fetch dynamic worksites from server
      const sites = await getActiveSites();
      let nearestDist = 0;
      let isInside = true;
      let matchedSiteName = place.siteName;

      if (sites && sites.length > 0) {
        let minDistance = Infinity;
        let bestSite = sites[0];

        for (const s of sites) {
          const d = calculateDistance(loc.latitude, loc.longitude, s.latitude, s.longitude);
          if (d < minDistance) {
            minDistance = d;
            bestSite = s;
          }
        }

        nearestDist = minDistance;
        isInside = minDistance <= (bestSite.radius_meters || 100);
        if (isInside) {
          matchedSiteName = bestSite.name || place.siteName;
        }
      }

      setCurrentCoords({ latitude: loc.latitude, longitude: loc.longitude });
      setSiteDistance({
        meters: Math.round(nearestDist),
        isInside,
        siteName: matchedSiteName,
        siteCity: place.siteCity,
      });
    } catch (e: any) {
      console.log("Proximity check note:", e?.message || e);
      setSiteDistance((prev) => ({
        ...prev,
        isInside: false,
        siteName: prev.siteName !== "Locating worksite..." ? prev.siteName : "Location Unavailable",
        siteCity: "Please enable GPS",
      }));
    }
  };

  const openLocationOnMap = (lat?: number, lng?: number) => {
    const targetLat = lat || currentCoords?.latitude;
    const targetLng = lng || currentCoords?.longitude;
    if (targetLat && targetLng) {
      const url = `https://maps.google.com/?q=${targetLat},${targetLng}`;
      Linking.openURL(url).catch(() => {
        Alert.alert("Map Error", "Could not open map viewer.");
      });
    } else {
      Alert.alert("Location", "Acquiring GPS location. Please ensure location services are enabled.");
    }
  };

  const refreshQueueCount = async () => {
    const count = await getQueueCount();
    setPendingQueueCount(count);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const { synced, failed } = await flushQueue();
      await refreshQueueCount();
      if (failed > 0) {
        Alert.alert(
          "Sync Notice",
          `Synced: ${synced} record(s)\nFailed: ${failed} (will retry)\n\nThe failed record may have been captured before face enrollment.`,
          [
            { text: "Keep in Queue", style: "cancel" },
            {
              text: "Discard Stale Record",
              style: "destructive",
              onPress: async () => {
                await clearOfflineQueue();
                await refreshQueueCount();
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Sync Complete",
          `Synced: ${synced} record(s)`
        );
      }
    } catch (err: any) {
      Alert.alert("Sync Error", err.message || "Failed to sync offline queue");
    } finally {
      setIsSyncing(false);
    }
  };

  const startCheck = async (mode: CheckMode) => {
    if (!isEnrolled) {
      Alert.alert(
        "Not Enrolled",
        "You need to enroll your face before checking in.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Enroll Now", onPress: () => router.push("/enroll") },
        ]
      );
      return;
    }

    setCheckMode(mode);

    if (livenessMode === "passive") {
      // Sub-Second Passive Liveness: immediate camera launch with 0ms pre-fetch latency!
      setChallenge({
        challenge_id: "passive-subsecond",
        challenge_type: "passive",
        instruction: "Align your face in the biometric oval",
      });
      setShowLiveness(true);
      return;
    }

    try {
      const challengeData = await getLivenessChallenge();
      setChallenge(challengeData);
      setShowLiveness(true);
    } catch (error) {
      setShowCamera(true);
    }
  };

  const handleLivenessComplete = useCallback(
    (result: {
      challengeId: string;
      referenceImageBase64: string;
      actionImageBase64: string;
    }) => {
      setShowLiveness(false);
      handleProcessAttendance(result.actionImageBase64, result.challengeId);
    },
    [checkMode]
  );

  const handleCameraCapture = async (base64Image: string) => {
    setShowCamera(false);
    await handleProcessAttendance(base64Image, challenge?.challenge_id);
  };

  const handleProcessAttendance = async (
    base64Image: string,
    challengeId?: string
  ) => {
    setLoading(true);

    // Fallback coordinates default to Marrakesh Hub (31.6393, -8.0096)
    let location = { latitude: 31.6393467, longitude: -8.0095983 };
    try {
      location = await getCurrentLocation();
    } catch (locErr: any) {
      console.warn("Could not get precise GPS:", locErr);
    }

    try {
      let result;
      const now = new Date();
      const timeFormatted = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      if (checkMode === "check_in") {
        result = await checkIn(
          base64Image,
          location.latitude,
          location.longitude,
          challengeId,
          deviceFp
        );
        setIsCheckedIn(true);
        setCheckInDateObj(now);
        setCheckInTime(timeFormatted);
        setTodayLogs((prev) => ({
          ...prev,
          checkInTime: timeFormatted,
          verifyTime: new Date(now.getTime() + 60000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          checkOutTime: null,
        }));
      } else {
        result = await checkOut(
          base64Image,
          location.latitude,
          location.longitude,
          challengeId
        );
        setIsCheckedIn(false);
        setTodayLogs((prev) => ({
          ...prev,
          checkOutTime: timeFormatted,
        }));
      }

      Alert.alert(
        "Success! ✓",
        `${checkMode === "check_in" ? "Check-in" : "Check-out"} recorded.\nTrust Score: ${result.trust_score}%`,
        [{ text: "OK" }]
      );
      loadActivityHistory();
    } catch (networkError: any) {
      // Determine whether this is a genuine network failure or a server error.
      // api.ts XHR handler sets `.isNetworkError = true` on connectivity failures
      // and `.isTimeout = true` on timeouts. Server HTTP errors (4xx/5xx) have
      // `.response` populated with the real error detail.
      const isGenuineNetworkFailure =
        networkError.isNetworkError === true || networkError.isTimeout === true;

      if (!isGenuineNetworkFailure && networkError.response) {
        // Server returned a real HTTP error — show it to the user.
        const serverMsg =
          networkError.response?.data?.detail ||
          networkError.response?.data?.message ||
          networkError.message ||
          "An unexpected error occurred. Please try again.";
        console.log("Server error during check:", networkError.response?.status, serverMsg);
        Alert.alert(
          `${checkMode === "check_in" ? "Check-in" : "Check-out"} Failed`,
          String(serverMsg),
          [{ text: "OK" }]
        );
      } else {
        // Genuine network failure — queue offline only if truly disconnected.
        console.log("Network error during check, queueing offline:", networkError.message);

        const now = new Date();
        const timeFormatted = now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        try {
          await enqueueAttendance(
            base64Image,
            location.latitude,
            location.longitude,
            checkMode || "check_in",
            challengeId
          );
          await refreshQueueCount();

          if (checkMode === "check_in") {
            setIsCheckedIn(true);
            setCheckInDateObj(now);
            setCheckInTime(timeFormatted);
            setTodayLogs((prev) => ({
              ...prev,
              checkInTime: timeFormatted,
              verifyTime: timeFormatted,
              checkOutTime: null,
            }));
          } else {
            setIsCheckedIn(false);
            setTodayLogs((prev) => ({
              ...prev,
              checkOutTime: timeFormatted,
            }));
          }

          Alert.alert(
            "Saved Offline 📱",
            "Your punch has been stored securely and will sync automatically when online.",
            [{ text: "OK" }]
          );
        } catch (queueErr: any) {
          Alert.alert("Error", "Could not record attendance offline: " + queueErr.message);
        }
      }
    } finally {
      setLoading(false);
      setCheckMode(null);
      setChallenge(null);
    }
  };

  const handleSignOut = async () => {
    setShowSettingsModal(false);
    try {
      await signOut();
    } catch (err) {
      console.log("SignOut note:", err);
    }
    router.replace("/auth/login");
  };

  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <SafeAreaView style={styles.safeContainer} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header: Avatar + Name on Left, Settings on Right */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => setShowProfileModal(true)}
              activeOpacity={0.8}
              style={styles.avatarWrapper}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {userProfile.avatar_url ? (
                <Image
                  source={{
                    uri: userProfile.avatar_url,
                  }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.initialsBadge}>
                  <Text style={styles.initialsText}>{initials}</Text>
                </View>
              )}
              {/* Online / Ready Hardware Badge */}
              <View style={styles.avatarStatusBadge} />
            </TouchableOpacity>

            <View style={styles.nameBlock}>
              <Text style={styles.greetingText}>{greeting}</Text>
              <Text style={styles.userNameText}>{userName}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.settingsIconButton}
            onPress={() => setShowSettingsModal(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={20} color="#334155" />
          </TouchableOpacity>
        </View>

        {/* Dual-Column Status & Location Card */}
        <View style={styles.statusCard}>
          {/* Left Column: Today & Check-in Status */}
          <View style={styles.statusColLeft}>
            <View style={styles.colHeaderRow}>
              <Ionicons name="calendar-outline" size={14} color="#64748B" />
              <Text style={styles.colHeaderLabel}>Today</Text>
            </View>

            <View
              style={[
                styles.statusPillBadge,
                isCheckedIn ? styles.statusPillActive : styles.statusPillInactive,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isCheckedIn ? "#10B981" : "#EF4444" },
                ]}
              />
              <Text
                style={[
                  styles.statusValueText,
                  { color: isCheckedIn ? "#059669" : "#DC2626" },
                ]}
              >
                {isCheckedIn ? "Checked in" : "Not checked in"}
              </Text>
            </View>

            <Text style={styles.statusDateText}>{formattedDate}</Text>
          </View>

          {/* Vertical Divider */}
          <View style={styles.cardDivider} />

          {/* Right Column: Work Site & City with Tap to View on Map */}
          <TouchableOpacity
            style={styles.statusColRight}
            onPress={() => openLocationOnMap()}
            activeOpacity={0.7}
          >
            <View style={styles.siteHeaderRow}>
              <Ionicons name="location-outline" size={16} color="#0F172A" />
              <Text style={styles.siteNameText} numberOfLines={1}>
                {siteDistance.siteName}
              </Text>
            </View>
            <Text style={styles.siteAddressText} numberOfLines={1}>
              {siteDistance.siteCity}
            </Text>
            <View style={[styles.geofenceChip, !siteDistance.isInside && styles.geofenceChipOutside]}>
              <Ionicons
                name={siteDistance.isInside ? "shield-checkmark" : "location-outline"}
                size={11}
                color={siteDistance.isInside ? "#059669" : "#D97706"}
              />
              <Text style={[styles.geofenceChipText, !siteDistance.isInside && styles.geofenceChipTextOutside]}>
                {siteDistance.isInside
                  ? "Within Geofence"
                  : siteDistance.meters > 0
                  ? `${siteDistance.meters >= 1000 ? (siteDistance.meters / 1000).toFixed(1) + "km" : siteDistance.meters + "m"} away`
                  : "Location acquired"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 }}>
              <Ionicons name="map-outline" size={11} color="#2563EB" />
              <Text style={{ fontSize: 10, color: "#2563EB", fontWeight: "600" }}>
                View on Map ↗
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Real-time Shift Duration Indicator */}
        {isCheckedIn && !!shiftDuration && (
          <View style={styles.shiftTimerRow}>
            <View style={styles.shiftTimerPill}>
              <View style={styles.timerPulseDot} />
              <Ionicons name="timer-outline" size={14} color="#1D4ED8" />
              <Text style={styles.shiftTimerText}>On Shift: {shiftDuration}</Text>
            </View>
          </View>
        )}

        {/* Sync Alert Banner (Displayed when pending offline items exist) */}
        {pendingQueueCount > 0 && (
          <View style={styles.syncBanner}>
            <View style={styles.syncBannerLeft}>
              <Ionicons name="alert-circle" size={20} color="#D97706" />
              <Text style={styles.syncBannerText}>
                {pendingQueueCount} record{pendingQueueCount > 1 ? "s" : ""} waiting to sync
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleManualSync}
              disabled={isSyncing}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={styles.syncButtonText}>Sync</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Primary Action Card: Check In */}
        <TouchableOpacity
          style={styles.checkInCard}
          onPress={() => startCheck("check_in")}
          activeOpacity={0.9}
          disabled={loading}
        >
          {/* Subtle Ambient Decorative Highlights */}
          <View style={styles.cardGlowOrb1} pointerEvents="none" />
          <View style={styles.cardGlowOrb2} pointerEvents="none" />
          <View style={styles.cardRingAccent} pointerEvents="none" />

          {loading && checkMode === "check_in" ? (
            <View style={styles.cardLoadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.cardLoadingText}>Starting biometric scan...</Text>
            </View>
          ) : (
            <View style={styles.checkInRow}>
              {/* Left: Premium Face ID Biometric Icon Box */}
              <View style={styles.checkInIconTile}>
                <PremiumFaceIdIcon size={36} color="#FFFFFF" showLaser={true} />
              </View>

              {/* Middle: Title & Subtitle */}
              <View style={styles.checkInTextGroup}>
                <Text style={styles.checkInTitle}>Check In</Text>
                <Text style={styles.checkInSubtitle}>
                  Face verification + location
                </Text>
              </View>

              {/* Right: Circular Arrow Action Button */}
              <View style={styles.cardRightCircle}>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Secondary Action Card: Check Out */}
        <TouchableOpacity
          style={[styles.checkOutCard, isCheckedIn && styles.checkOutCardActive]}
          onPress={() => startCheck("check_out")}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading && checkMode === "check_out" ? (
            <View style={styles.cardLoadingRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={[styles.cardLoadingText, { color: "#2563EB" }]}>
                Processing check-out...
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.checkOutLeft}>
                <View
                  style={[
                    styles.checkOutIconBox,
                    isCheckedIn && styles.checkOutIconBoxActive,
                  ]}
                >
                  <Ionicons
                    name="exit-outline"
                    size={24}
                    color={isCheckedIn ? "#2563EB" : "#64748B"}
                  />
                </View>

                <View style={styles.checkOutTextGroup}>
                  <Text style={styles.checkOutTitle}>Check Out</Text>
                  <Text style={styles.checkOutSubtitle}>
                    {isCheckedIn
                      ? "Complete work shift & punch out"
                      : "Record departure from work site"}
                  </Text>
                </View>
              </View>

              <View style={styles.checkOutArrowBox}>
                <Ionicons name="arrow-forward" size={18} color="#64748B" />
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Today's Activity Section */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeaderRow}>
            <Text style={styles.activitySectionTitle}>Today's activity</Text>
            <View style={styles.activityLivePill}>
              <Text style={styles.activityLiveText}>Timeline</Text>
            </View>
          </View>

          <View style={styles.timelineCard}>
            {/* Step 1: Check In */}
            <View style={styles.timelineItem}>
              <View style={styles.timelineIconColumn}>
                <View
                  style={[
                    styles.timelineNode,
                    isCheckedIn || todayLogs.checkInTime ? styles.nodeGreen : styles.nodeGray,
                  ]}
                >
                  <Ionicons
                    name={isCheckedIn || todayLogs.checkInTime ? "checkmark" : "time-outline"}
                    size={16}
                    color={isCheckedIn || todayLogs.checkInTime ? "#059669" : "#64748B"}
                  />
                </View>
                <View
                  style={[
                    styles.timelineLine,
                    (isCheckedIn || todayLogs.checkInTime) && styles.timelineLineDone,
                  ]}
                />
              </View>

              <View style={styles.timelineContent}>
                <View style={styles.timelineTextGroup}>
                  <Text style={styles.timelineActionTitle}>Check in</Text>
                  <Text style={styles.timelineTimeText}>
                    {todayLogs.checkInTime || (isCheckedIn ? checkInTime : "Not yet checked in")}
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.timelineLocationBadge}
                  onPress={() => openLocationOnMap()}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-sharp" size={12} color="#2563EB" />
                  <Text style={[styles.timelineLocationBadgeText, { color: "#2563EB", fontWeight: "600" }]}>
                    {siteDistance.siteName} 🗺️
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Step 2: Site Verification */}
            <View style={styles.timelineItem}>
              <View style={styles.timelineIconColumn}>
                <View
                  style={[
                    styles.timelineNode,
                    isCheckedIn || todayLogs.verifyTime ? styles.nodeBlue : styles.nodeGray,
                  ]}
                >
                  <Ionicons
                    name={isCheckedIn || todayLogs.verifyTime ? "shield-checkmark" : "location-outline"}
                    size={15}
                    color={isCheckedIn || todayLogs.verifyTime ? "#2563EB" : "#64748B"}
                  />
                </View>
                <View style={styles.timelineLine} />
              </View>

              <View style={styles.timelineContent}>
                <View style={styles.timelineTextGroup}>
                  <Text style={styles.timelineActionTitle}>Site verification</Text>
                  <Text style={styles.timelineTimeText}>
                    {todayLogs.verifyTime || (isCheckedIn ? checkInTime : "Pending check-in")}
                  </Text>
                </View>

                <View style={styles.timelineVerifiedBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#2563EB" />
                  <Text style={styles.timelineVerifiedText}>
                    Geofence Verified
                  </Text>
                </View>
              </View>
            </View>

            {/* Step 3: Check Out */}
            <View style={[styles.timelineItem, { marginBottom: 0 }]}>
              <View style={styles.timelineIconColumn}>
                <View
                  style={[
                    styles.timelineNode,
                    todayLogs.checkOutTime
                      ? styles.nodeGreen
                      : isCheckedIn
                      ? styles.nodeAmber
                      : styles.nodeGray,
                  ]}
                >
                  <Ionicons
                    name={
                      todayLogs.checkOutTime
                        ? "checkmark"
                        : isCheckedIn
                        ? "time-outline"
                        : "exit-outline"
                    }
                    size={16}
                    color={
                      todayLogs.checkOutTime
                        ? "#059669"
                        : isCheckedIn
                        ? "#D97706"
                        : "#64748B"
                    }
                  />
                </View>
              </View>

              <View style={styles.timelineContent}>
                <View style={styles.timelineTextGroup}>
                  <Text style={styles.timelineActionTitle}>Check out</Text>
                  <Text style={styles.timelineTimeText}>
                    {todayLogs.checkOutTime || (isCheckedIn ? "In progress (On shift)" : "Not checked out")}
                  </Text>
                </View>

                <Text style={styles.timelineDashText}>
                  {todayLogs.checkOutTime ? "Recorded" : "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Tab Bar Navigation */}
      <View
        style={[
          styles.bottomTabBar,
          {
            paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 22 : 12) + 6,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab("home")}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Ionicons
            name="home"
            size={22}
            color={activeTab === "home" ? "#2563EB" : "#94A3B8"}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "home" && styles.tabLabelActive,
            ]}
          >
            Home
          </Text>
          {activeTab === "home" && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab("attendance");
            startCheck("check_in");
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <PremiumFaceIdIcon
            size={22}
            color={activeTab === "attendance" ? "#2563EB" : "#94A3B8"}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "attendance" && styles.tabLabelActive,
            ]}
          >
            Attendance
          </Text>
          {activeTab === "attendance" && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab("history");
            setShowTimesheet(true);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Ionicons
            name="receipt-outline"
            size={22}
            color={activeTab === "history" ? "#2563EB" : "#94A3B8"}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "history" && styles.tabLabelActive,
            ]}
          >
            History
          </Text>
          {activeTab === "history" && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab("profile");
            setShowProfileModal(true);
          }}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Ionicons
            name="person-outline"
            size={22}
            color={activeTab === "profile" ? "#2563EB" : "#94A3B8"}
          />
          <Text
            style={[
              styles.tabLabel,
              activeTab === "profile" && styles.tabLabelActive,
            ]}
          >
            Profile
          </Text>
          {activeTab === "profile" && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Settings / Options Modal */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowSettingsModal(false)}
        >
          <View style={styles.settingsModalCard} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Options & Management</Text>
              <TouchableOpacity
                onPress={() => setShowSettingsModal(false)}
                style={styles.modalCloseButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalRowItem}
              onPress={() => {
                setShowSettingsModal(false);
                setShowProfileModal(true);
              }}
            >
              <Ionicons name="person-circle-outline" size={20} color="#2563EB" />
              <Text style={styles.modalRowLabel}>Edit Profile & Avatar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalRowItem}
              onPress={() => {
                setShowSettingsModal(false);
                setShowTimesheet(true);
              }}
            >
              <Ionicons name="receipt-outline" size={20} color="#2563EB" />
              <Text style={styles.modalRowLabel}>My Timesheet Records</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalRowItem}
              onPress={() => {
                setShowSettingsModal(false);
                setShowKiosk(true);
              }}
            >
              <Ionicons name="scan-outline" size={20} color="#16A34A" />
              <Text style={styles.modalRowLabel}>Supervisor Kiosk Scanner</Text>
            </TouchableOpacity>

            {!isEnrolled && (
              <TouchableOpacity
                style={styles.modalRowItem}
                onPress={() => {
                  setShowSettingsModal(false);
                  router.push("/enroll");
                }}
              >
                <Ionicons name="camera-outline" size={20} color="#F59E0B" />
                <Text style={styles.modalRowLabel}>Enroll Biometric Face</Text>
              </TouchableOpacity>
            )}

            {biometricStatus?.hasHardware && (
              <TouchableOpacity
                style={styles.modalRowItem}
                onPress={handleToggleBiometrics}
              >
                {biometricStatus.biometricType === "fingerprint" ? (
                  <MaterialCommunityIcons name="fingerprint" size={20} color="#2563EB" />
                ) : (
                  <Ionicons name="scan-outline" size={20} color="#2563EB" />
                )}
                <View style={{ flex: 1, marginLeft: 2 }}>
                  <Text style={styles.modalRowLabel}>
                    {biometricStatus.label} Unlock
                  </Text>
                  <Text style={{ fontSize: 11, color: biometricsActive ? "#16A34A" : "#64748B", fontWeight: "600" }}>
                    {biometricsActive ? "Active • 1-Tap Login" : "Disabled • Password Required"}
                  </Text>
                </View>
                <Ionicons
                  name={biometricsActive ? "shield-checkmark" : "shield-outline"}
                  size={18}
                  color={biometricsActive ? "#16A34A" : "#94A3B8"}
                />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.modalRowItem}
              onPress={handleToggleReminders}
            >
              <Ionicons
                name={remindersActive ? "notifications" : "notifications-outline"}
                size={20}
                color="#2563EB"
              />
              <View style={{ flex: 1, marginLeft: 2 }}>
                <Text style={styles.modalRowLabel}>Shift Reminders</Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: remindersActive ? "#16A34A" : "#64748B",
                    fontWeight: "600",
                  }}
                >
                  {remindersActive
                    ? "Active • 8:45 AM & 5:00 PM"
                    : "Disabled • Tap to Enable"}
                </Text>
              </View>
              <Ionicons
                name={remindersActive ? "checkmark-circle" : "ellipse-outline"}
                size={18}
                color={remindersActive ? "#16A34A" : "#94A3B8"}
              />
            </TouchableOpacity>

            {remindersActive && (
              <TouchableOpacity
                style={[styles.modalRowItem, { paddingLeft: 12, backgroundColor: "#F8FAFC", borderRadius: 10, marginVertical: 4, borderBottomWidth: 0 }]}
                onPress={handleSendTestNotification}
              >
                <Ionicons name="paper-plane-outline" size={18} color="#6366F1" />
                <Text style={[styles.modalRowLabel, { fontSize: 13, color: "#6366F1", flex: 1 }]}>
                  Test Notification Now
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#6366F1" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.modalRowItem}
              onPress={() => {
                checkProximity();
                Alert.alert("GPS Refreshed", `Verified site: ${siteDistance.siteName}`);
              }}
            >
              <Ionicons name="navigate-outline" size={20} color="#6366F1" />
              <Text style={styles.modalRowLabel}>Refresh GPS Geofence</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalRowItem, styles.modalRowItemDestructive]}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
              <Text style={styles.modalRowDestructiveLabel}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Profile Edit & Avatar Upload Modal */}
      <Modal visible={showProfileModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
          <ProfileEditModal
            initialProfile={userProfile}
            onClose={() => {
              setShowProfileModal(false);
              setActiveTab("home");
            }}
            onProfileUpdated={(updated) => {
              setUserProfile((prev) => ({
                ...prev,
                ...updated,
              }));
              if (updated.first_name) {
                setUserName(
                  `${updated.first_name} ${updated.last_name || ""}`.trim()
                );
              }
            }}
            onReEnrollPress={() => {
              setShowProfileModal(false);
              router.push("/enroll");
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Timesheet History Modal */}
      <Modal visible={showTimesheet} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
          <TimesheetHistory
            onClose={() => setShowTimesheet(false)}
            userProfile={userProfile}
          />
        </SafeAreaView>
      </Modal>

      {/* Supervisor Kiosk Mode Modal */}
      <Modal visible={showKiosk} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#0F172A" }}>
          <KioskScanner onClose={() => setShowKiosk(false)} />
        </SafeAreaView>
      </Modal>

      {/* Dynamic 2-Step Liveness Verification Modal */}
      <Modal
        visible={showLiveness}
        animationType="slide"
        onRequestClose={() => {
          setShowLiveness(false);
          setCheckMode(null);
        }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={() => {
                setShowLiveness(false);
                setCheckMode(null);
              }}
              style={{ padding: 8 }}
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <LivenessChallenge
            challengeType={challenge?.challenge_type || (livenessMode === "passive" ? "passive" : "blink")}
            instruction={challenge?.instruction || (livenessMode === "passive" ? "Align your face in the biometric oval" : "Please blink naturally")}
            challengeId={challenge?.challenge_id || (livenessMode === "passive" ? "passive-subsecond" : "fallback-id")}
            isPassive={livenessMode === "passive"}
            onComplete={handleLivenessComplete}
            onCancel={() => {
              setShowLiveness(false);
              setCheckMode(null);
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* Standard Camera Fallback Modal */}
      <Modal visible={showCamera} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={() => {
                setShowCamera(false);
                setCheckMode(null);
              }}
              style={{ padding: 8 }}
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Camera onCapture={handleCameraCapture} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E2E8F0",
  },
  initialsBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#064E3B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#D1FAE5",
  },
  initialsText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  avatarStatusBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#10B981",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
  },
  nameBlock: {
    justifyContent: "center",
  },
  greetingText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  userNameText: {
    fontSize: 21,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 1,
    letterSpacing: -0.4,
  },
  settingsIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  shiftTimerRow: {
    marginTop: 12,
    alignItems: "flex-start",
  },
  shiftTimerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
    gap: 6,
  },
  timerPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1D4ED8",
  },
  shiftTimerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },

  // Dual-Column Status & Site Card
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    flexDirection: "row",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  statusColLeft: {
    flex: 1,
  },
  colHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  colHeaderLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  statusPillBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  statusPillActive: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  statusPillInactive: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusValueText: {
    fontSize: 13,
    fontWeight: "700",
  },
  statusDateText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 2,
  },
  cardDivider: {
    width: 1,
    backgroundColor: "#F1F5F9",
    marginHorizontal: 14,
  },
  statusColRight: {
    flex: 1,
    justifyContent: "center",
  },
  siteHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  siteNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },
  siteAddressText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginLeft: 21,
  },
  geofenceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    marginLeft: 21,
  },
  geofenceChipOutside: {
    opacity: 0.9,
  },
  geofenceChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#059669",
  },
  geofenceChipTextOutside: {
    color: "#D97706",
  },

  // Sync Banner
  syncBanner: {
    marginTop: 14,
    backgroundColor: "#FEF9C3",
    borderWidth: 1,
    borderColor: "#FEF08A",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  syncBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  syncBannerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#854D0E",
    marginLeft: 8,
  },
  syncButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },

  // Check In Card (Primary)
  checkInCard: {
    marginTop: 18,
    backgroundColor: "#1D4ED8",
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 20,
    position: "relative",
    overflow: "hidden",
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 7,
  },
  cardGlowOrb1: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(59, 130, 246, 0.35)",
    top: -30,
    right: -20,
  },
  cardGlowOrb2: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(30, 58, 138, 0.45)",
    bottom: -50,
    left: -40,
  },
  cardRingAccent: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
    right: -60,
    top: -60,
  },
  cardLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 12,
  },
  cardLoadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  checkInRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  checkInIconTile: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.28)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkInTextGroup: {
    flex: 1,
    marginLeft: 16,
    marginRight: 10,
  },
  checkInTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  checkInSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.88)",
    marginTop: 3,
    fontWeight: "500",
  },
  cardRightCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.32)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Check Out Card (Secondary)
  checkOutCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  checkOutCardActive: {
    borderColor: "#93C5FD",
    backgroundColor: "#F8FAFC",
  },
  checkOutLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  checkOutIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  checkOutIconBoxActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  checkOutTextGroup: {
    marginLeft: 14,
    flex: 1,
  },
  checkOutTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  checkOutSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  checkOutArrowBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },

  // Today's Activity Section
  activitySection: {
    marginTop: 26,
    marginBottom: 12,
  },
  activityHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  activitySectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  activityLivePill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
  },
  activityLiveText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.3,
  },
  timelineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  timelineItem: {
    flexDirection: "row",
    marginBottom: 6,
  },
  timelineIconColumn: {
    alignItems: "center",
    width: 36,
  },
  timelineNode: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  nodeGreen: {
    backgroundColor: "#D1FAE5",
    borderColor: "#A7F3D0",
  },
  nodeBlue: {
    backgroundColor: "#DBEAFE",
    borderColor: "#BFDBFE",
  },
  nodeAmber: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  nodeGray: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 26,
    backgroundColor: "#E2E8F0",
    marginVertical: 3,
  },
  timelineLineDone: {
    backgroundColor: "#A7F3D0",
  },
  timelineContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 12,
    paddingBottom: 6,
  },
  timelineTextGroup: {
    flex: 1,
  },
  timelineActionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  timelineTimeText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  timelineLocationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  timelineLocationBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  timelineVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  timelineVerifiedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  timelineDashText: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
  },

  // Bottom Tab Bar
  bottomTabBar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    minWidth: 64,
    position: "relative",
  },
  tabLabel: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 4,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  tabActiveIndicator: {
    position: "absolute",
    bottom: -6,
    width: 20,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#2563EB",
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  settingsModalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    gap: 14,
  },
  modalRowItemDestructive: {
    borderBottomWidth: 0,
    marginTop: 6,
  },
  modalRowLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
  },
  modalRowDestructiveLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#DC2626",
  },
});
